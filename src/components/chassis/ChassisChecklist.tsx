import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  Download,
  Trash2,
  Camera,
  Play,
  ArrowRight,
  Clock,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { ChassisInspectionItem } from '../../types';
import { exportChassisChecklistPdf } from '../../services/pdfExport';
import { compressAndWatermarkImage } from '../../services/autoIdGenerator';
import { buildBmiWhatsAppReport, triggerReportToast } from '../common/ReportToast';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import {
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell
} from '../ui/Table';

const CHASSIS_DRAFT_STORAGE_KEY = 'bmi_chassis_checklist_draft_v1';

export const ChassisChecklist: React.FC = () => {
  const { state, createWorkOrder } = useWorkshopStore();

  const [checklistItems, setChecklistItems] = useState<ChassisInspectionItem[]>(() => {
    try {
      const raw = sessionStorage.getItem(CHASSIS_DRAFT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      return [];
    }
  });
  const [searchChassisQuery, setSearchChassisQuery] = useState('');
  const [activeModalItem, setActiveModalItem] = useState<ChassisInspectionItem | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTimeMs, setStartTimeMs] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(CHASSIS_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.startTimeMs === 'number' ? parsed.startTimeMs : null;
    } catch {
      return null;
    }
  });
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  // Auto-save inspection draft to sessionStorage so mechanics never lose field progress
  React.useEffect(() => {
    try {
      if (checklistItems.length === 0) {
        sessionStorage.removeItem(CHASSIS_DRAFT_STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          CHASSIS_DRAFT_STORAGE_KEY,
          JSON.stringify({ items: checklistItems, startTimeMs })
        );
      }
    } catch {
      // Fallback without base64 photos if sessionStorage quota is exceeded
      try {
        const lightItems = checklistItems.map(({ foto: _foto, ...rest }) => rest);
        sessionStorage.setItem(
          CHASSIS_DRAFT_STORAGE_KEY,
          JSON.stringify({ items: lightItems, startTimeMs })
        );
      } catch {
        // Ignore storage error
      }
    }
  }, [checklistItems, startTimeMs]);

  // Available chassis not yet in inspection cart
  const existingIds = new Set(checklistItems.map((c) => c.idUnit));
  const availableChassis = state.chassis.filter(
    (c) =>
      !existingIds.has(c.idUnit) &&
      c.statusServis !== 'AFKIR' &&
      (!searchChassisQuery ||
        c.idUnit.toLowerCase().includes(searchChassisQuery.toLowerCase()) ||
        c.tipeChassis.toLowerCase().includes(searchChassisQuery.toLowerCase()))
  );

  // Add chassis to inspection cart
  const handleAddChassisToChecklist = (idUnit: string) => {
    const chassis = state.chassis.find((c) => c.idUnit === idUnit);
    if (!chassis) return;

    if (!startTimeMs) setStartTimeMs(Date.now());

    const is3Axle = !(
      chassis.idUnit.includes('2A') || chassis.tipeChassis.toLowerCase().includes('2 axle')
    );

    const newItem: ChassisInspectionItem = {
      idUnit: chassis.idUnit,
      tipe: chassis.tipeChassis,
      a3: is3Axle,
      done: false,
      v: {
        ban: 'B',
        gajah: 1,
        lampu: 1,
        rem: 1,
        pagar: 1,
        slebor: 1,
        b1: 1,
        b2: 1,
        b3: is3Axle ? 1 : null,
        ld: 1,
        lt: 1,
        lb: 1
      },
      banNote: '',
      note: ''
    };

    setChecklistItems([newItem, ...checklistItems]);
    setSearchChassisQuery('');
  };

  const handleAddAllAvailable = () => {
    if (!startTimeMs) setStartTimeMs(Date.now());
    const toAdd = availableChassis.map((c) => {
      const is3Axle = !(
        c.idUnit.includes('2A') || c.tipeChassis.toLowerCase().includes('2 axle')
      );
      return {
        idUnit: c.idUnit,
        tipe: c.tipeChassis,
        a3: is3Axle,
        done: false,
        v: {
          ban: 'B' as const,
          gajah: 1,
          lampu: 1,
          rem: 1,
          pagar: 1,
          slebor: 1,
          b1: 1,
          b2: 1,
          b3: is3Axle ? 1 : null,
          ld: 1,
          lt: 1,
          lb: 1
        },
        banNote: '',
        note: ''
      };
    });
    setChecklistItems([...toAdd, ...checklistItems]);
  };

  const handleRemoveItem = (idUnit: string) => {
    setChecklistItems(checklistItems.filter((item) => item.idUnit !== idUnit));
  };

  // Start Sequential Wizard
  const handleStartWizard = () => {
    if (!startTimeMs) setStartTimeMs(Date.now());
    const firstUndone = checklistItems.find((i) => !i.done) || checklistItems[0];
    if (firstUndone) {
      setActiveModalItem({ ...firstUndone });
    }
  };

  // Helper: check if item has any damage/fault
  const getItemFaults = (item: ChassisInspectionItem): string[] => {
    const faults: string[] = [];
    if (item.v.ban !== 'B') {
      faults.push(
        `Ban ${item.v.ban === 'L' ? 'Bocor' : 'Rusak'}${
          item.banNote ? ` (${item.banNote})` : ''
        }`
      );
    }
    if (item.v.gajah === 0) faults.push('Kaki Gajah Rusak');
    if (item.v.lampu === 0) faults.push('Lampu Rusak / Putus');
    if (item.v.rem === 0) faults.push('Sistem Rem Tidak Berfungsi');
    if (item.v.pagar === 0) faults.push('Pagar Samping Rusak');
    if (item.v.slebor === 0) faults.push('Slebor Rusak / Lepas');
    if (item.v.b1 === 0) faults.push('Baut Roda Exel 1 Kendor/Kurang');
    if (item.v.b2 === 0) faults.push('Baut Roda Exel 2 Kendor/Kurang');
    if (item.a3 && item.v.b3 === 0) faults.push('Baut Roda Exel 3 Kendor/Kurang');
    if (item.v.ld === 0) faults.push('Lock Depan Rusak');
    if (item.v.lt === 0) faults.push('Lock Tengah Rusak');
    if (item.v.lb === 0) faults.push('Lock Belakang Rusak');
    return faults;
  };

  // Advance to next un-inspected chassis or open Paper Review Matrix when all done
  const advanceWizardOrFinish = (updatedList: ChassisInspectionItem[], currentIndex: number) => {
    const nextUnDone =
      updatedList.find((i, idx) => !i.done && idx > currentIndex) ||
      updatedList.find((i) => !i.done);

    if (nextUnDone) {
      setActiveModalItem({ ...nextUnDone });
    } else {
      setActiveModalItem(null);
      setShowReviewModal(true);
    }
  };

  // 1-Tap Quick All OK and Next
  const handleQuickAllOk = (idUnit: string) => {
    if (!startTimeMs) setStartTimeMs(Date.now());
    const itemIndex = checklistItems.findIndex((i) => i.idUnit === idUnit);
    if (itemIndex === -1) return;

    const updated = [...checklistItems];
    const current = updated[itemIndex];
    updated[itemIndex] = {
      ...current,
      done: true,
      v: {
        ban: 'B',
        gajah: 1,
        lampu: 1,
        rem: 1,
        pagar: 1,
        slebor: 1,
        b1: 1,
        b2: 1,
        b3: current.a3 ? 1 : null,
        ld: 1,
        lt: 1,
        lb: 1
      },
      banNote: ''
    };
    setChecklistItems(updated);

    if (activeModalItem) {
      advanceWizardOrFinish(updated, itemIndex);
    }
  };

  const handleSaveModalInspection = () => {
    if (!activeModalItem) return;
    const itemIndex = checklistItems.findIndex((i) => i.idUnit === activeModalItem.idUnit);
    if (itemIndex === -1) return;

    const updated = [...checklistItems];
    updated[itemIndex] = {
      ...activeModalItem,
      done: true
    };
    setChecklistItems(updated);
    advanceWizardOrFinish(updated, itemIndex);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeModalItem) return;
    setIsCompressingPhoto(true);
    try {
      const compressed = await compressAndWatermarkImage(
        file,
        `${activeModalItem.idUnit} | CEKLIS CHASSIS`
      );
      setActiveModalItem({ ...activeModalItem, foto: compressed });
    } catch {
      // ignore compression failure
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const completedCount = checklistItems.filter((i) => i.done).length;
  const faultCount = checklistItems.filter((i) => getItemFaults(i).length > 0).length;
  const durationMinutes = startTimeMs
    ? Math.max(1, Math.round((Date.now() - startTimeMs) / 60000))
    : Math.max(1, checklistItems.length * 2);

  // Submit and export PDF + ReportToast
  const handleSubmitChecklist = () => {
    setIsSubmitting(true);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    const docNo = `CKL-${dateStr}-${timeStr}`;
    const snapshotItems = [...checklistItems];

    // Auto schedule Work Orders for units with faults
    const createdWoIds: string[] = [];
    snapshotItems.forEach((item) => {
      const faults = getItemFaults(item);
      if (faults.length > 0) {
        const wo = createWorkOrder({
          kategori: 'CHASSIS',
          idUnit: item.idUnit,
          jenisServis: 'Inspeksi & Tindak Lanjut Ceklis Harian',
          tglRencana: new Date().toISOString().slice(0, 19).replace('T', ' '),
          teknisi: state.userPic || 'Mekanik On-Duty',
          keluhan: `Temuan Ceklis (${docNo}): ${faults.join(', ')}. ${
            item.note ? `Catatan: ${item.note}` : ''
          }`,
          prioritas: 'Mendesak',
          bay: 'Bay 3'
        });
        createdWoIds.push(`${item.idUnit} -> ${wo.woId}`);
      }
    });

    // Export Official F-S-031-003-000 PDF Report
    exportChassisChecklistPdf(
      docNo,
      state.userLocation,
      state.userPic,
      snapshotItems,
      durationMinutes
    );

    // Build WhatsApp Report & Trigger Toast
    const bodyLines = [
      `Total Diperiksa: *${snapshotItems.length} Unit Chassis*`,
      `Durasi Inspeksi: *${durationMinutes} Menit*`,
      `Kondisi Siap Jalan: *${snapshotItems.length - faultCount} Unit*`,
      `Perlu Servis (Auto-WO): *${faultCount} Unit*`,
      ``,
      `*RINCIAN UNIT CHASSIS:*`,
      ...snapshotItems.map((it, idx) => {
        const flt = getItemFaults(it);
        return flt.length === 0
          ? `${idx + 1}. *${it.idUnit}* (${it.tipe}) : SIAP JALAN (13 Titik OK)`
          : `${idx + 1}. *${it.idUnit}* (${it.tipe}) : TEMUAN [${flt.join(', ')}] ${
              it.note ? `- ${it.note}` : ''
            }`;
      }),
      ...(createdWoIds.length > 0
        ? [``, `*AUTO WORK ORDER TERJADWAL:*`, ...createdWoIds.map((w) => `- ${w}`)]
        : [])
    ];

    const waReportText = buildBmiWhatsAppReport(
      'Ceklis Standar 13 Titik Chassis (F-S-031-003-000)',
      state.userLocation,
      state.userPic,
      bodyLines,
      docNo
    );

    triggerReportToast({
      title: `Ceklis Chassis ${docNo}`,
      text: waReportText,
      pdfLabel: 'Cetak Ulang PDF',
      pdfAction: () =>
        exportChassisChecklistPdf(
          docNo,
          state.userLocation,
          state.userPic,
          snapshotItems,
          durationMinutes
        )
    });

    setIsSubmitting(false);
    setShowReviewModal(false);
    setChecklistItems([]);
    setStartTimeMs(null);
  };

  const activeIndex = activeModalItem
    ? checklistItems.findIndex((i) => i.idUnit === activeModalItem.idUnit)
    : -1;
  const wizardProgressPct =
    checklistItems.length > 0
      ? Math.round((completedCount / checklistItems.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#073E7F] mb-1">
                Standar Inspeksi Harian · Form F-S-031-003-000
              </div>
              <h1 className="text-xl font-bold text-[#0F172A]">
                Wizard Ceklis Standar 13 Titik Chassis
              </h1>
              <p className="text-xs text-[#475569] mt-1">
                Pilih chassis ke keranjang inspeksi, jalankan wizard berurutan di lapangan, dan
                unduh dokumen resmi A4 landscape beserta laporan ringkas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {checklistItems.length > 0 && completedCount < checklistItems.length && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartWizard}
                  leftIcon={<Play className="w-4 h-4 text-[#D19F0F]" />}
                >
                  Mulai Periksa ({checklistItems.length - completedCount})
                </Button>
              )}

              {checklistItems.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowReviewModal(true)}
                  disabled={completedCount < checklistItems.length}
                  leftIcon={<Download className="w-4 h-4 text-[#073E7F]" />}
                >
                  Review Dokumen ({completedCount}/{checklistItems.length})
                </Button>
              )}
            </div>
          </div>

          {/* Add Chassis Toolbar */}
          <div className="mt-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchChassisQuery}
                onChange={(e) => setSearchChassisQuery(e.target.value)}
                placeholder="Cari chassis (cth: BMI-CH40-01)..."
                className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#073E7F] focus:ring-1 focus:ring-[#073E7F]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {availableChassis.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddAllAvailable}
                >
                  + Muat Semua Chassis ({availableChassis.length})
                </Button>
              )}

              {checklistItems.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChecklistItems([]);
                    setStartTimeMs(null);
                  }}
                  className="text-[#DC2626] hover:text-[#B91C1C]"
                >
                  Kosongkan Keranjang
                </Button>
              )}
            </div>
          </div>

          {/* Quick Pills for Available Chassis */}
          {availableChassis.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#64748B]">Klik Cepat Tambah:</span>
              {availableChassis.slice(0, 8).map((c) => (
                <button
                  key={c.idUnit}
                  type="button"
                  onClick={() => handleAddChassisToChecklist(c.idUnit)}
                  className="px-2.5 py-1 bg-[#F8FAFC] hover:bg-[#FFFBEB] border border-[#E2E8F0] hover:border-[#D19F0F] rounded-[6px] text-xs font-mono font-bold text-[#0F172A] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>+ {c.idUnit}</span>
                  <span className="text-xs font-sans font-normal text-[#64748B]">
                    ({c.tipeChassis.includes('20') ? '20ft' : '40ft'})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Progress Bar when Cart is Active */}
          {checklistItems.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#475569]">
                  Progres Inspeksi: {completedCount} dari {checklistItems.length} Selesai
                </span>
                <span className="font-mono tabular-nums font-bold text-[#0A2547]">
                  {wizardProgressPct}%
                </span>
              </div>
              <div className="w-full h-2 bg-[#F1F5F9] rounded-[6px] overflow-hidden border border-[#E2E8F0]">
                <div
                  className="h-full bg-[#D19F0F] transition-all duration-300"
                  style={{ width: `${wizardProgressPct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Checklist Inspection Cart */}
      <div className="space-y-3">
        {checklistItems.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Keranjang Inspeksi Kosong"
            description="Pilih kode chassis pada kotak pencarian di atas atau muat semua chassis tersedia untuk memulai inspeksi harian 13 titik."
            actionLabel={
              availableChassis.length > 0
                ? `Muat ${availableChassis.length} Chassis`
                : undefined
            }
            onAction={availableChassis.length > 0 ? handleAddAllAvailable : undefined}
          />
        ) : (
          checklistItems.map((item, idx) => {
            const faults = getItemFaults(item);
            const hasFault = faults.length > 0;

            return (
              <Card
                key={item.idUnit}
                className={`transition-all ${
                  !item.done
                    ? 'border-[#E2E8F0]'
                    : hasFault
                    ? 'border-[#FDE68A] bg-[#FFFBEB]/40'
                    : 'border-[#A7F3D0] bg-[#ECFDF5]/30'
                }`}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-7 h-7 rounded-[6px] bg-[#F1F5F9] border border-[#CBD5E1] font-mono tabular-nums text-xs font-bold text-[#475569] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="bmi-plate text-xs">{item.idUnit}</span>
                        <span className="text-xs text-[#334155] font-semibold">{item.tipe}</span>
                        <Badge variant="neutral">
                          {item.a3 ? '3 Axle (12 Roda)' : '2 Axle (8 Roda)'}
                        </Badge>
                      </div>

                      <div className="text-xs mt-1.5 flex items-center gap-2 flex-wrap">
                        {!item.done ? (
                          <Badge variant="neutral">Menunggu pemeriksaan fisik</Badge>
                        ) : hasFault ? (
                          <Badge variant="warning">
                            Temuan: {faults.join(', ')} {item.note ? `· ${item.note}` : ''}
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            13 Titik Normal (OK)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {!item.done && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickAllOk(item.idUnit)}
                        className="text-[#059669] border-[#A7F3D0] hover:bg-[#ECFDF5]"
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />}
                      >
                        Semua OK
                      </Button>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setActiveModalItem({ ...item })}
                    >
                      {item.done ? 'Ubah Ceklis' : 'Periksa Wizard'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Hapus ${item.idUnit} dari inspeksi`}
                      onClick={() => handleRemoveItem(item.idUnit)}
                      className="text-[#94A3B8] hover:text-[#DC2626] p-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* MODAL WIZARD: Sequential 13-Point Inspection */}
      {activeModalItem && (
        <Modal
          isOpen={!!activeModalItem}
          onClose={() => setActiveModalItem(null)}
          size="lg"
          title={`Inspeksi ${activeModalItem.idUnit}`}
          subtitle={`Chassis ${activeIndex + 1} dari ${checklistItems.length} · ${activeModalItem.tipe} (${activeModalItem.a3 ? '3 Axle' : '2 Axle'})`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModalItem(null)}
              >
                Tutup Sementara
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveModalInspection}
                rightIcon={<ArrowRight className="w-4 h-4 text-[#D19F0F]" />}
              >
                Simpan & Lanjut
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Sequential Progress Bar inside modal */}
            <div>
              <div className="flex items-center justify-between text-xs text-[#64748B] mb-1.5">
                <span className="font-medium">Kemajuan Alur Inspeksi</span>
                <span className="font-mono tabular-nums font-bold text-[#0A2547]">
                  {activeIndex + 1} / {checklistItems.length} Unit
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#F1F5F9] rounded-[6px] overflow-hidden border border-[#E2E8F0]">
                <div
                  className="h-full bg-[#D19F0F] transition-all duration-300"
                  style={{
                    width: `${Math.round(((activeIndex + 1) / Math.max(checklistItems.length, 1)) * 100)}%`
                  }}
                />
              </div>
            </div>

            {/* 1-Tap Quick All OK Button */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => handleQuickAllOk(activeModalItem.idUnit)}
              className="w-full text-[#059669] border-[#A7F3D0] hover:bg-[#ECFDF5] font-semibold"
              leftIcon={<CheckCircle2 className="w-4 h-4 text-[#059669]" />}
            >
              Semua 13 Titik Normal (OK) · Simpan & Lanjut
            </Button>

            <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] text-center">
              atau laporkan temuan komponen fisik di bawah
            </div>

            {/* 1. Ban Sasis */}
            <div className="bg-[#F8FAFC] p-3.5 rounded-[6px] border border-[#E2E8F0]">
              <div className="font-bold text-[#0F172A] mb-2">1. Kondisi Fisik Ban Chassis</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'B', label: 'Bagus (OK)' },
                  { val: 'L', label: 'Bocor / Kempes' },
                  { val: 'R', label: 'Rusak / Gundul' }
                ].map((opt) => {
                  const isActive = activeModalItem.v.ban === opt.val;
                  const activeColorClass =
                    opt.val === 'B'
                      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                      : opt.val === 'L'
                      ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]'
                      : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]';

                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() =>
                        setActiveModalItem({
                          ...activeModalItem,
                          v: { ...activeModalItem.v, ban: opt.val as 'B' | 'L' | 'R' }
                        })
                      }
                      className={`py-2 px-2 rounded-[6px] font-semibold text-center border transition-colors cursor-pointer text-xs ${
                        isActive
                          ? activeColorClass
                          : 'bg-white text-[#475569] border-[#E2E8F0] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {activeModalItem.v.ban !== 'B' && (
                <input
                  type="text"
                  value={activeModalItem.banNote || ''}
                  onChange={(e) =>
                    setActiveModalItem({ ...activeModalItem, banNote: e.target.value })
                  }
                  placeholder="Catat posisi roda (cth: CA, CB, CF)..."
                  className="w-full mt-2 bg-white border border-[#CBD5E1] rounded-[6px] px-3 py-1.5 text-xs font-mono focus:border-[#073E7F] focus:outline-none"
                />
              )}
            </div>

            {/* 2–6. Main Mechanical & Structural Points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'gajah', label: '2. Kaki Gajah (Landing Gear)' },
                { key: 'lampu', label: '3. Lampu Belakang & Kabel' },
                { key: 'rem', label: '4. Sistem Rem & Chamber' },
                { key: 'pagar', label: '5. Pagar Pelindung Samping' },
                { key: 'slebor', label: '6. Slebor / Spakbor Roda' }
              ].map((item) => {
                const val = (activeModalItem.v as Record<string, unknown>)[item.key];
                return (
                  <div
                    key={item.key}
                    className="bg-[#F8FAFC] p-2.5 rounded-[6px] border border-[#E2E8F0]"
                  >
                    <div className="font-semibold text-[#0F172A] mb-1.5">{item.label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModalItem({
                            ...activeModalItem,
                            v: { ...activeModalItem.v, [item.key]: 1 }
                          })
                        }
                        className={`py-1.5 rounded-[6px] text-center font-semibold text-xs border transition-colors cursor-pointer ${
                          val === 1
                            ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        Normal (OK)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModalItem({
                            ...activeModalItem,
                            v: { ...activeModalItem.v, [item.key]: 0 }
                          })
                        }
                        className={`py-1.5 rounded-[6px] text-center font-semibold text-xs border transition-colors cursor-pointer ${
                          val === 0
                            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        Rusak (X)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 7–9. Baut Roda Exel 1, 2, 3 */}
            <div className="bg-[#F8FAFC] p-3 rounded-[6px] border border-[#E2E8F0]">
              <div className="font-semibold text-[#0F172A] mb-1.5">
                7–9. Kelengkapan Baut Roda per Exel
              </div>
              <div className="flex gap-2">
                {['b1', 'b2', ...(activeModalItem.a3 ? ['b3'] : [])].map((k, idx) => {
                  const isOk = (activeModalItem.v as Record<string, unknown>)[k] === 1;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setActiveModalItem({
                          ...activeModalItem,
                          v: { ...activeModalItem.v, [k]: isOk ? 0 : 1 }
                        })
                      }
                      className={`flex-1 py-2 rounded-[6px] font-semibold border transition-colors cursor-pointer text-xs ${
                        isOk
                          ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                          : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                      }`}
                    >
                      Exel {idx + 1}: {isOk ? 'Lengkap (OK)' : 'Kurang/Kendor (X)'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 10–12. Twist Lock Pengaman Kontainer */}
            <div className="bg-[#F8FAFC] p-3 rounded-[6px] border border-[#E2E8F0]">
              <div className="font-semibold text-[#0F172A] mb-1.5">
                10–12. Twist Lock Pengaman Kontainer
              </div>
              <div className="flex gap-2">
                {[
                  { k: 'ld', label: 'Depan' },
                  { k: 'lt', label: 'Tengah' },
                  { k: 'lb', label: 'Belakang' }
                ].map((lock) => {
                  const isOk = (activeModalItem.v as Record<string, unknown>)[lock.k] === 1;
                  return (
                    <button
                      key={lock.k}
                      type="button"
                      onClick={() =>
                        setActiveModalItem({
                          ...activeModalItem,
                          v: { ...activeModalItem.v, [lock.k]: isOk ? 0 : 1 }
                        })
                      }
                      className={`flex-1 py-2 rounded-[6px] font-semibold border transition-colors cursor-pointer text-xs ${
                        isOk
                          ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                          : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                      }`}
                    >
                      Lock {lock.label}: {isOk ? 'OK' : 'Macet/Rusak'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 13. Catatan & Bukti Foto Terkompresi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  13. Catatan Temuan Fisik (Opsional)
                </label>
                <textarea
                  value={activeModalItem.note || ''}
                  onChange={(e) =>
                    setActiveModalItem({ ...activeModalItem, note: e.target.value })
                  }
                  rows={3}
                  placeholder="Contoh: Perlu las dudukan lampu kiri..."
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] p-2.5 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Foto Bukti Temuan (Watermark Otomatis)
                </label>
                <label className="border-2 border-dashed border-[#CBD5E1] hover:border-[#073E7F] rounded-[6px] p-3 flex flex-col items-center justify-center text-center cursor-pointer bg-[#F8FAFC] h-20 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  {isCompressingPhoto ? (
                    <span className="text-xs font-semibold text-[#073E7F]">
                      Mengompresi & Watermark...
                    </span>
                  ) : activeModalItem.foto ? (
                    <span className="text-xs font-bold text-[#059669]">
                      Foto Bukti Tersimpan (1280px)
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[#64748B]">
                      <Camera className="w-4 h-4" />
                      <span>Unggah / Ambil Foto</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Paper-Style Review Matrix (F-S-031-003-000) & PDF Export */}
      {showReviewModal && (
        <Modal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          size="xl"
          title="Review Form Pengecekan Chassis (F-S-031-003-000)"
          subtitle={`Lokasi: ${state.userLocation} · Pemeriksa: ${state.userPic} · Durasi: ${durationMinutes} Menit`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowReviewModal(false)}
              >
                Kembali Edit
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isSubmitting}
                onClick={handleSubmitChecklist}
                leftIcon={<Download className="w-4 h-4" />}
              >
                Simpan & Unduh Laporan
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-xs font-semibold text-[#64748B] uppercase">Total Unit</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
                  {checklistItems.length} Chassis
                </div>
              </div>
              <div className="p-3 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0]">
                <div className="text-xs font-semibold text-[#059669] uppercase">
                  Siap Operasi
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-[#059669] mt-0.5">
                  {checklistItems.length - faultCount} Unit
                </div>
              </div>
              <div className="p-3 rounded-[8px] bg-[#FFFBEB] border border-[#FDE68A]">
                <div className="text-xs font-semibold text-[#D97706] uppercase">
                  Temuan Servis
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-[#D97706] mt-0.5">
                  {faultCount} Unit
                </div>
              </div>
              <div className="p-3 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-xs font-semibold text-[#64748B] uppercase">
                  Durasi Lapangan
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>{durationMinutes} Menit</span>
                </div>
              </div>
            </div>

            {/* 13-Point Paper Matrix Table Preview */}
            <TableContainer className="max-h-96">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>No</TableHeaderCell>
                    <TableHeaderCell>Chassis</TableHeaderCell>
                    <TableHeaderCell>Ban</TableHeaderCell>
                    <TableHeaderCell>Gajah</TableHeaderCell>
                    <TableHeaderCell>Lampu</TableHeaderCell>
                    <TableHeaderCell>Rem</TableHeaderCell>
                    <TableHeaderCell>Pagar</TableHeaderCell>
                    <TableHeaderCell>Slebor</TableHeaderCell>
                    <TableHeaderCell>Baut 1/2/3</TableHeaderCell>
                    <TableHeaderCell>Lock D/T/B</TableHeaderCell>
                    <TableHeaderCell>Kesimpulan</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {checklistItems.map((item, idx) => {
                    const faults = getItemFaults(item);
                    const hasFault = faults.length > 0;
                    return (
                      <TableRow
                        key={item.idUnit}
                        className={hasFault ? 'bg-[#FFFBEB]/40' : undefined}
                      >
                        <TableCell className="font-mono tabular-nums text-xs text-[#64748B]">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-[#0F172A]">
                          {item.idUnit}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.ban === 'B' ? 'OK' : item.v.ban}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.gajah ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.lampu ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.rem ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.pagar ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.slebor ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.b1 ? 'OK' : 'X'}/{item.v.b2 ? 'OK' : 'X'}/
                          {item.a3 ? (item.v.b3 ? 'OK' : 'X') : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.v.ld ? 'OK' : 'X'}/{item.v.lt ? 'OK' : 'X'}/
                          {item.v.lb ? 'OK' : 'X'}
                        </TableCell>
                        <TableCell>
                          {hasFault ? (
                            <Badge variant="warning" className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                              <span>Auto-WO: {faults.join(', ')}</span>
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              Ready Operasi
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </Modal>
      )}
    </div>
  );
};
