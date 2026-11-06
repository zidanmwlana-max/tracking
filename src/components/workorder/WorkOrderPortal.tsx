import React, { useState, useDeferredValue, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Truck,
  Package,
  Download,
  ShieldCheck
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { rankWorkOrders } from '../../domain/decisionEngine';
import { WorkOrder, WOStatus } from '../../types';
import { exportWorkOrderSummaryPdf } from '../../services/pdfExport';
import { compressAndWatermarkImage } from '../../services/autoIdGenerator';
import { buildBmiWhatsAppReport, triggerReportToast } from '../common/ReportToast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell
} from '../ui/Table';
import { EmptyState } from '../ui/EmptyState';

const getWoStatusBadgeVariant = (
  status: string
): 'neutral' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'COMPLETED & RELEASED':
      return 'success';
    case 'WAITING PART':
    case 'READY FOR QC':
      return 'warning';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'neutral';
  }
};

const getPriorityBadgeVariant = (
  level?: 'A' | 'B' | 'C'
): 'neutral' | 'warning' | 'danger' => (level === 'A' ? 'danger' : level === 'B' ? 'warning' : 'neutral');

export const WorkOrderPortal: React.FC = () => {
  const {
    state,
    createWorkOrder,
    updateWorkOrderStatus,
    updateWorkOrderDetails,
    cancelWorkOrder,
    requestSparepart
  } = useWorkshopStore();

  const isSupervisor = state.userRole === 'SUPERVISOR';

  // Active Selected WO for Mechanic Execution
  const [selectedWoId, setSelectedWoId] = useState<string>(
    state.workOrders.find(
      (w) => w.status !== 'COMPLETED & RELEASED' && w.status !== 'CANCELLED'
    )?.woId || ''
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [bayFilter, setBayFilter] = useState<string>('ALL');

  // Timeline Gantt State (Kade Meter)
  const [timelineSpanHours, setTimelineSpanHours] = useState<number>(72); // 3 days default
  const [timelineOffsetHours, setTimelineOffsetHours] = useState<number>(0);

  // Modals & Banners
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<WorkOrder | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<WorkOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showPartRequestModal, setShowPartRequestModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [woCurrentPage, setWoCurrentPage] = useState(1);
  const [woPageSize, setWoPageSize] = useState(15);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Create WO Form State
  const [createForm, setCreateForm] = useState({
    kategori: 'TRUK' as 'TRUK' | 'CHASSIS' | 'GENSET',
    idUnit: state.trucks[0]?.idUnit || '',
    jenisServis: 'Perbaikan Ringan',
    tglRencana: new Date().toISOString().slice(0, 16),
    teknisi: 'Rudi Hartono',
    keluhan: '',
    prioritas: 'Normal' as 'Normal' | 'Mendesak' | 'Darurat / Breakdown',
    odo: state.trucks[0]?.kmSaatIni || 0,
    tEst: new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16),
    bay: 'Bay 1' as 'Bay 1' | 'Bay 2' | 'Bay 3' | 'Bay 4' | 'Bay 5' | 'Bay 6'
  });

  // Part Request Form
  const [partReqForm, setPartReqForm] = useState({
    sku: '',
    namaPart: '',
    qty: 1,
    hargaSatuan: 0
  });

  // Photo state for Before / After with compression & watermark
  const [photoBefore, setPhotoBefore] = useState<string>('');
  const [photoAfter, setPhotoAfter] = useState<string>('');
  const [isWatermarking, setIsWatermarking] = useState<'BEFORE' | 'AFTER' | null>(null);

  const activeWo = state.workOrders.find((w) => w.woId === selectedWoId);

  useEffect(() => {
    setWoCurrentPage(1);
  }, [statusFilter, bayFilter, deferredSearchQuery, woPageSize]);

  // Skor prioritas deterministik (Decision Engine) — dipakai untuk sorting + badge
  const priorityByWo = new Map(
    rankWorkOrders(state.workOrders).map((r) => [r.woId, r] as const)
  );
  const urgencyRank: Record<WorkOrder['prioritas'], number> = {
    'Darurat / Breakdown': 3,
    Mendesak: 2,
    Normal: 1
  };

  // Filtered Work Orders for Table (auto-sort: skor prioritas, lalu urgensi)
  const filteredWorkOrders = state.workOrders
    .filter((w) => {
    if (statusFilter !== 'ALL' && w.status !== statusFilter) return false;
    if (bayFilter !== 'ALL' && w.bay !== bayFilter) return false;
    if (!deferredSearchQuery) return true;
    const q = deferredSearchQuery.toLowerCase();
    return (
      w.woId.toLowerCase().includes(q) ||
      w.idUnit.toLowerCase().includes(q) ||
      w.jenisServis.toLowerCase().includes(q) ||
      w.teknisi.toLowerCase().includes(q) ||
      w.keluhan.toLowerCase().includes(q)
    );
    })
    .sort((a, b) => {
      const scoreA = priorityByWo.get(a.woId)?.score ?? 0;
      const scoreB = priorityByWo.get(b.woId)?.score ?? 0;
      return scoreB - scoreA || urgencyRank[b.prioritas] - urgencyRank[a.prioritas];
    });

  const woTotalPages = Math.max(1, Math.ceil(filteredWorkOrders.length / woPageSize));
  const safeWoPage = Math.min(woCurrentPage, woTotalPages);
  const woStartIndex = (safeWoPage - 1) * woPageSize;
  const paginatedWorkOrders = filteredWorkOrders.slice(woStartIndex, woStartIndex + woPageSize);

  const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'] as const;

  // Handle Photo Upload with 1280px compression & bottom banner watermark (woWm)
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'BEFORE' | 'AFTER'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeWo) return;
    setValidationError(null);
    setIsWatermarking(type);
    try {
      const watermarked = await compressAndWatermarkImage(
        file,
        `${activeWo.idUnit} | ${type} | ${activeWo.woId}`
      );
      if (type === 'BEFORE') setPhotoBefore(watermarked);
      else setPhotoAfter(watermarked);
    } catch {
      setValidationError('Gagal memproses kompresi & watermark foto.');
    } finally {
      setIsWatermarking(null);
    }
  };

  // State Machine Transition Handler
  const handleTransition = (newStatus: WOStatus) => {
    if (!activeWo) return;
    setValidationError(null);

    if (newStatus === 'IN PROGRESS' && !photoBefore && !activeWo.fotoBefore) {
      setValidationError(
        'Wajib mengunggah Foto BEFORE (Kondisi Awal) sebelum memulai pengerjaan (IN PROGRESS).'
      );
      return;
    }
    if (newStatus === 'READY FOR QC' && !photoAfter && !activeWo.fotoAfter) {
      setValidationError(
        'Wajib mengunggah Foto AFTER (Hasil Akhir) sebelum menandai Selesai & Siap QC.'
      );
      return;
    }

    updateWorkOrderStatus(activeWo.woId, newStatus, {
      fotoBefore: photoBefore || activeWo.fotoBefore,
      fotoAfter: photoAfter || activeWo.fotoAfter
    });

    const waText = buildBmiWhatsAppReport(
      `Update Status Work Order (${newStatus})`,
      state.userLocation,
      state.userPic,
      [
        `No. WO: *${activeWo.woId}*`,
        `Unit Armada: *${activeWo.idUnit}* (${activeWo.kategori})`,
        `Alokasi Bay: *${activeWo.bay}*`,
        `Jenis Servis: ${activeWo.jenisServis}`,
        `Teknisi: ${activeWo.teknisi}`,
        `Status Baru: *${newStatus}*`,
        `Keluhan: ${activeWo.keluhan || '-'}`
      ],
      activeWo.woId
    );

    triggerReportToast({
      title: `WO ${activeWo.idUnit} -> ${newStatus}`,
      text: waText,
      pdfLabel: 'Cetak Lembar WO',
      pdfAction: () => exportWorkOrderSummaryPdf({ ...activeWo, status: newStatus })
    });

    setPhotoBefore('');
    setPhotoAfter('');
  };

  // Submit Part Request
  const handleSubmitPartRequest = () => {
    if (!activeWo) return;
    if (!partReqForm.namaPart.trim() || partReqForm.qty <= 0) {
      setValidationError('Nama suku cadang dan kuantitas wajib diisi.');
      return;
    }

    const req = requestSparepart({
      woId: activeWo.woId,
      nopol: activeWo.idUnit,
      sku: partReqForm.sku,
      namaPart: partReqForm.namaPart,
      qty: partReqForm.qty,
      hargaSatuan: partReqForm.hargaSatuan,
      mekanik: state.userPic
    });

    const waText = buildBmiWhatsAppReport(
      'Permintaan Suku Cadang (Sparepart Request)',
      state.userLocation,
      state.userPic,
      [
        `No. Transaksi: *${req.txId}*`,
        `Ref Work Order: *${activeWo.woId}*`,
        `Unit Armada: *${activeWo.idUnit}*`,
        `Suku Cadang: *${req.namaPart}* (${req.sku})`,
        `Kuantitas: *${req.qty} Pcs*`,
        `Estimasi Biaya: Rp ${req.total.toLocaleString('id-ID')}`,
        `Status: *Menunggu Approval Supervisor*`
      ],
      req.txId
    );

    triggerReportToast({
      title: `Request Part ${activeWo.idUnit}`,
      text: waText
    });

    setPartReqForm({ sku: '', namaPart: '', qty: 1, hargaSatuan: 0 });
    setShowPartRequestModal(false);
  };

  // Kade Meter Time-Axis labels
  const nowDate = new Date(Date.now() + timelineOffsetHours * 3600 * 1000);
  const timeTicks = Array.from({ length: 7 }, (_, idx) => {
    const offsetH = (idx - 2) * (timelineSpanHours / 6);
    const d = new Date(nowDate.getTime() + offsetH * 3600 * 1000);
    return timelineSpanHours <= 24
      ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit' });
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#073E7F] mb-1">
              {isSupervisor
                ? 'Manajemen antrean bay armada'
                : 'Portal kerja teknisi bengkel'}
            </div>
            <h1 className="text-xl font-bold text-[#0F172A]">
              {isSupervisor
                ? 'Monitoring Work Order'
                : 'Eksekusi Work Order Lapangan'}
            </h1>
            <p className="text-sm text-[#475569] mt-0.5">
              {isSupervisor
                ? 'Pantau antrean pengerjaan di Bay 1 s/d 6 dan verifikasi rilis unit.'
                : 'Perbarui tahapan status perbaikan, unggah foto bukti, dan ajukan part.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isSupervisor && (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setCreateForm({
                    kategori: 'TRUK',
                    idUnit: state.trucks[0]?.idUnit || '',
                    jenisServis: 'Perbaikan Ringan',
                    tglRencana: new Date().toISOString().slice(0, 16),
                    teknisi: 'Rudi Hartono',
                    keluhan: '',
                    prioritas: 'Normal',
                    odo: state.trucks[0]?.kmSaatIni || 0,
                    tEst: new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 16),
                    bay: 'Bay 1'
                  });
                  setShowCreateModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1.5 text-[#D19F0F]" />
                Buat work order
              </Button>
            )}
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nopol, servis, teknisi..."
              className="h-9 w-full pl-9 pr-3 bg-white border border-[#E2E8F0] rounded-[6px] text-xs font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold rounded-[6px] px-3 focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            >
              <option value="ALL">Status: Semua</option>
              <option value="SCHEDULED">Dijadwalkan</option>
              <option value="ARRIVED">Tiba di Pool</option>
              <option value="IN PROGRESS">Dikerjakan</option>
              <option value="WAITING PART">Menunggu Part</option>
              <option value="READY FOR QC">Siap QC</option>
              <option value="COMPLETED & RELEASED">Selesai & Rilis</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>

            <select
              value={bayFilter}
              onChange={(e) => setBayFilter(e.target.value)}
              className="h-9 bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold rounded-[6px] px-3 focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            >
              <option value="ALL">Lokasi: Semua Bay</option>
              {BAYS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-[6px] p-3 flex items-center justify-between text-xs text-[#DC2626]">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            <span>{validationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-[#DC2626] hover:underline font-bold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* MECHANIC VIEW: TASK EXECUTION & STATE MACHINE */}
      {!isSupervisor && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* WO Selector Sidebar */}
          <div className="bg-white border border-[#E2E8F0] rounded-[10px] p-4 space-y-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Daftar antrean tugas
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.workOrders
                .filter((w) => w.status !== 'COMPLETED & RELEASED' && w.status !== 'CANCELLED')
                .map((wo) => {
                  const isSelected = wo.woId === selectedWoId;
                  return (
                    <div
                      key={wo.woId}
                      onClick={() => {
                        setSelectedWoId(wo.woId);
                        setValidationError(null);
                      }}
                      className={`p-3 rounded-[6px] border cursor-pointer transition-colors duration-150 ease-out ${
                        isSelected
                          ? 'border-[#073E7F] bg-[#F1F5F9]'
                          : 'border-[#E2E8F0] hover:border-[#94A3B8] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="bmi-plate text-[11px]">{wo.idUnit}</span>
                        <span className="font-mono text-xs text-[#475569]">{wo.woId}</span>
                      </div>
                      <div className="text-xs text-[#0F172A] font-semibold truncate">
                        {wo.jenisServis}
                      </div>
                      <div className="text-xs text-[#475569] mt-1.5 flex items-center justify-between">
                        <span className="font-semibold text-[#0F172A] font-mono">{wo.bay}</span>
                        <Badge variant={getWoStatusBadgeVariant(wo.status)}>{wo.status}</Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Active WO State Machine Execution Panel */}
          <Card className="lg:col-span-2 p-6">
            {!activeWo ? (
              <div className="p-12 text-center text-[#94A3B8] text-xs">
                Pilih work order dari antrean di samping untuk memulai eksekusi.
              </div>
            ) : (
              <div className="space-y-5">
                {/* Active WO Title */}
                <div className="flex items-start justify-between pb-4 border-b border-[#E2E8F0]">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                      Work order aktif
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="bmi-plate text-sm">{activeWo.idUnit}</span>
                      <span className="text-xs font-mono font-bold text-[#475569]">
                        ({activeWo.woId})
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1">
                      {activeWo.jenisServis} · Prioritas: {activeWo.prioritas} · Alokasi:{' '}
                      <span className="font-bold text-[#0F172A]">{activeWo.bay}</span>
                    </p>
                  </div>

                  <Badge variant={getWoStatusBadgeVariant(activeWo.status)} className="text-xs font-mono font-bold">
                    {activeWo.status}
                  </Badge>
                </div>

                {/* Complaint & Notes */}
                <div className="bg-[#F8FAFC] p-3 rounded-[6px] border border-[#E2E8F0] text-xs">
                  <span className="font-semibold text-[#0F172A] block mb-1">
                    Keluhan dan instruksi kerja:
                  </span>
                  <p className="text-[#475569] leading-relaxed">{activeWo.keluhan || '-'}</p>
                </div>

                {/* State Machine Transition Actions */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                    Perbarui tahapan pengerjaan
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeWo.status === 'SCHEDULED' && (
                      <Button
                        variant="primary"
                        size="md"
                        className="col-span-full"
                        onClick={() => handleTransition('ARRIVED')}
                      >
                        <Truck className="w-4 h-4 mr-1.5 text-[#D19F0F]" />
                        Unit tiba di pool
                      </Button>
                    )}

                    {activeWo.status === 'ARRIVED' && (
                      <Button
                        variant="primary"
                        size="md"
                        className="col-span-full"
                        onClick={() => handleTransition('IN PROGRESS')}
                      >
                        <Wrench className="w-4 h-4 mr-1.5" />
                        Mulai kerjakan di {activeWo.bay}
                      </Button>
                    )}

                    {activeWo.status === 'IN PROGRESS' && (
                      <>
                        <Button
                          variant="secondary"
                          size="md"
                          className="col-span-2"
                          onClick={() => handleTransition('WAITING PART')}
                        >
                          <Package className="w-4 h-4 mr-1.5 text-[#D97706]" />
                          Menunggu suku cadang
                        </Button>
                        <Button
                          variant="primary"
                          size="md"
                          className="col-span-2"
                          onClick={() => handleTransition('READY FOR QC')}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Selesai pengerjaan
                        </Button>
                      </>
                    )}

                    {activeWo.status === 'WAITING PART' && (
                      <Button
                        variant="primary"
                        size="md"
                        className="col-span-full"
                        onClick={() => handleTransition('IN PROGRESS')}
                      >
                        <Wrench className="w-4 h-4 mr-1.5" />
                        Lanjutkan pengerjaan
                      </Button>
                    )}

                    {activeWo.status === 'READY FOR QC' && (
                      <div className="col-span-full p-3 bg-emerald-50 border border-emerald-200 text-[#059669] rounded-[6px] text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                        <span>
                          Pengerjaan fisik selesai. Menunggu verifikasi supervisor untuk rilis unit.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Photo Before / After Upload Section with Watermark Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#E2E8F0]">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#0F172A]">
                      Foto kondisi awal
                    </label>
                    <label className="border-2 border-dashed border-[#E2E8F0] hover:border-[#073E7F] rounded-[6px] p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150 ease-out bg-[#F8FAFC] min-h-32 overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoUpload(e, 'BEFORE')}
                        className="hidden"
                      />
                      {isWatermarking === 'BEFORE' ? (
                        <span className="text-xs font-semibold text-[#073E7F]">
                          Memproses kompresi foto...
                        </span>
                      ) : photoBefore || activeWo.fotoBefore ? (
                        <div className="space-y-1 w-full">
                          <img
                            src={photoBefore || activeWo.fotoBefore}
                            alt="Foto before"
                            className="h-20 w-full object-cover rounded-[6px] border border-[#E2E8F0]"
                          />
                          <div className="text-xs font-semibold text-[#059669]">
                            Foto awal terlampir
                          </div>
                        </div>
                      ) : (
                        <>
                          <Camera className="w-5 h-5 text-[#94A3B8] mb-1" />
                          <span className="text-xs font-semibold text-[#475569]">
                            Unggah foto awal
                          </span>
                          <span className="text-[10px] text-[#94A3B8] mt-0.5">
                            Otomatis cap waktu BMI
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#0F172A]">
                      Foto hasil akhir
                    </label>
                    <label className="border-2 border-dashed border-[#E2E8F0] hover:border-[#073E7F] rounded-[6px] p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150 ease-out bg-[#F8FAFC] min-h-32 overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoUpload(e, 'AFTER')}
                        className="hidden"
                      />
                      {isWatermarking === 'AFTER' ? (
                        <span className="text-xs font-semibold text-[#073E7F]">
                          Memproses kompresi foto...
                        </span>
                      ) : photoAfter || activeWo.fotoAfter ? (
                        <div className="space-y-1 w-full">
                          <img
                            src={photoAfter || activeWo.fotoAfter}
                            alt="Foto after"
                            className="h-20 w-full object-cover rounded-[6px] border border-[#E2E8F0]"
                          />
                          <div className="text-xs font-semibold text-[#059669]">
                            Foto akhir terlampir
                          </div>
                        </div>
                      ) : (
                        <>
                          <Camera className="w-5 h-5 text-[#94A3B8] mb-1" />
                          <span className="text-xs font-semibold text-[#475569]">
                            Unggah foto akhir
                          </span>
                          <span className="text-[10px] text-[#94A3B8] mt-0.5">
                            Otomatis cap waktu BMI
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {/* Sparepart Request Button */}
                <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowPartRequestModal(true)}
                  >
                    <Package className="w-4 h-4 mr-1.5 text-[#D19F0F]" />
                    Ajukan suku cadang
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exportWorkOrderSummaryPdf(activeWo)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Cetak PDF WO
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* SUPERVISOR VIEW: KADE METER (BERTH GANTT TIMELINE) */}
      {isSupervisor && (
        <div className="bg-[#0A2547] border border-[#073E7F] text-white rounded-[10px] p-5 space-y-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
            <div>
              <div className="text-xs font-mono font-bold text-[#D19F0F] uppercase tracking-wider mb-0.5">
                Alokasi bay armada
              </div>
              <h2 className="text-base font-bold text-white">
                Kade Meter Pemeliharaan Armada (Bay 1 s/d Bay 6)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-900/90 border border-slate-700 p-1 rounded-[6px] text-xs font-bold">
                {[
                  { h: 12, label: '12 Jam' },
                  { h: 24, label: '24 Jam' },
                  { h: 72, label: '3 Hari' },
                  { h: 168, label: '7 Hari' }
                ].map((item) => (
                  <button
                    key={item.h}
                    type="button"
                    onClick={() => {
                      setTimelineSpanHours(item.h);
                      setTimelineOffsetHours(0);
                    }}
                    className={`px-3 py-1 rounded-[6px] transition-colors duration-150 ease-out cursor-pointer ${
                      timelineSpanHours === item.h
                        ? 'bg-[#D19F0F] text-[#0A2547]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 p-1 rounded-[6px] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTimelineOffsetHours((prev) => prev - timelineSpanHours / 3)}
                  className="px-2.5 py-1 text-slate-300 hover:text-white cursor-pointer"
                  title="Geser mundur"
                  aria-label="Geser mundur"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineOffsetHours(0)}
                  className="px-2.5 py-1 bg-slate-800 text-[#D19F0F] hover:text-white rounded-[6px] cursor-pointer font-mono"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineOffsetHours((prev) => prev + timelineSpanHours / 3)}
                  className="px-2.5 py-1 text-slate-300 hover:text-white cursor-pointer"
                  title="Geser maju"
                  aria-label="Geser maju"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Kade Meter Time-Axis Header & Bay Tracks */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[780px] space-y-2.5 relative">
              {/* Time Ruler Header */}
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-[10px] font-mono uppercase text-slate-400 text-center">
                  Dermaga / Bay
                </div>
                <div className="flex-1 grid grid-cols-7 bg-slate-900/80 border border-slate-800 rounded-[6px] px-3 py-1.5 text-[10px] font-mono text-slate-300">
                  {timeTicks.map((t, i) => (
                    <div
                      key={i}
                      className={`text-center ${
                        i === 2 && timelineOffsetHours === 0 ? 'text-[#D19F0F] font-bold' : ''
                      }`}
                    >
                      {i === 2 && timelineOffsetHours === 0 ? `NOW (${t})` : t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bay Tracks with Vertical Gold NOW Line */}
              <div className="space-y-2.5 relative">
                {timelineOffsetHours === 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[#D19F0F] z-20 pointer-events-none"
                    style={{ left: 'calc(6rem + 12px + 33%)' }}
                  >
                    <div className="bg-[#D19F0F] text-[#0A2547] font-mono font-extrabold text-[9px] px-1.5 py-0.2 rounded-b -ml-4">
                      NOW
                    </div>
                  </div>
                )}

                {BAYS.map((bay) => {
                  const bayWos = state.workOrders.filter(
                    (w) => w.bay === bay && w.status !== 'CANCELLED'
                  );

                  return (
                    <div key={bay} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 font-mono font-bold text-xs text-white bg-slate-900 border border-slate-700 px-2 py-3.5 rounded-[6px] text-center">
                        {bay}
                      </div>

                      <div className="flex-1 bmi-blueprint-grid border border-slate-800 rounded-[6px] h-14 relative px-3 py-1.5 overflow-hidden flex items-center gap-3">
                        {bayWos.length === 0 ? (
                          <span className="text-[11px] text-slate-400 font-mono pl-2">
                            Bay Kosong · Siap Dialokasikan
                          </span>
                        ) : (
                          bayWos.map((wo) => {
                            const isCompleted = wo.status === 'COMPLETED & RELEASED';
                            const isReadyQc = wo.status === 'READY FOR QC';
                            const isWaitingPart = wo.status === 'WAITING PART';
                            const isLate =
                              wo.status === 'IN PROGRESS' &&
                              wo.tEst &&
                              new Date().getTime() > new Date(wo.tEst).getTime();

                            return (
                              <div
                                key={wo.woId}
                                role="button"
                                tabIndex={0}
                                onClick={() => setShowEditModal(wo)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setShowEditModal(wo);
                                  }
                                }}
                                aria-label={`Buka detail Work Order ${wo.woId} unit ${wo.idUnit} di ${bay}`}
                                title={`${wo.woId} | ${wo.idUnit} | ${wo.jenisServis} | Status: ${wo.status}`}
                                className={`ship-polygon h-10 pl-3 pr-5 flex items-center justify-between gap-4 text-xs font-mono font-bold cursor-pointer transition-colors duration-150 ease-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D19F0F] relative z-10 min-w-[230px] border ${
                                  isCompleted
                                    ? 'bg-emerald-900/95 border-emerald-400/80 text-emerald-100'
                                    : isLate
                                    ? 'ship-late-stripes border-[#DC2626] text-white'
                                    : isReadyQc
                                    ? 'bg-teal-900/95 border-teal-400/80 text-teal-100'
                                    : isWaitingPart
                                    ? 'bg-amber-900/95 border-[#D19F0F] text-amber-100'
                                    : 'bg-[#073E7F] border-[#D19F0F]/90 text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="bmi-plate text-[10px] py-0 px-1.5">
                                    {wo.idUnit}
                                  </span>
                                  <span className="text-[11px] font-sans font-semibold truncate max-w-36">
                                    {wo.jenisServis}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-semibold">
                                    {wo.status}
                                  </span>
                                  {isLate && (
                                    <span className="bg-[#DC2626] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-[6px] whitespace-nowrap">
                                      Telat
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Kade Meter Legend */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[2px] bg-[#073E7F] border border-[#D19F0F] inline-block" />
                <span>Dikerjakan</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[2px] bg-amber-800 border border-[#D19F0F] inline-block" />
                <span>Menunggu part</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[2px] ship-late-stripes border border-red-500 inline-block" />
                <span>Melewati estimasi</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[2px] bg-emerald-800 border border-emerald-400 inline-block" />
                <span>Selesai rilis</span>
              </span>
            </div>
            <span className="text-xs text-slate-400">
              Klik blok armada untuk verifikasi QC atau pindah bay
            </span>
          </div>
        </div>
      )}

      {/* SMART TABLE: ALL WORK ORDERS */}
      <TableContainer>
        <div className="p-4 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
            Daftar antrean work order ({filteredWorkOrders.length})
          </h3>
          <span className="text-xs text-[#475569]">
            Diurutkan otomatis: skor prioritas & urgensi
          </span>
        </div>

        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Unit & WO</TableHeaderCell>
              <TableHeaderCell>Alokasi Bay</TableHeaderCell>
              <TableHeaderCell>Jenis Servis</TableHeaderCell>
              <TableHeaderCell>Teknisi & Odometer</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {filteredWorkOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <EmptyState
                    icon={Wrench}
                    title="Tidak ada work order"
                    description="Tidak ada data yang cocok dengan kriteria pencarian."
                  />
                </td>
              </tr>
            ) : (
              paginatedWorkOrders.map((wo) => (
                <TableRow key={wo.woId}>
                  <TableCell>
                    <span className="bmi-plate text-xs">{wo.idUnit}</span>
                    <div className="text-xs font-mono text-[#475569] mt-0.5">{wo.woId}</div>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-[#0F172A]">{wo.bay}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-[#0F172A]">{wo.jenisServis}</div>
                    <div className="text-xs text-[#475569] truncate max-w-xs">
                      {wo.keluhan || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-[#0F172A]">{wo.teknisi}</div>
                    <div className="text-xs text-[#475569] font-mono tabular-nums">
                      {wo.odo ? `${Number(wo.odo).toLocaleString('id-ID')} KM/HM` : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={getWoStatusBadgeVariant(wo.status)}>{wo.status}</Badge>
                      {priorityByWo.get(wo.woId) && (
                        <Badge variant={getPriorityBadgeVariant(priorityByWo.get(wo.woId)?.level)}>
                          Lv {priorityByWo.get(wo.woId)?.level}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {isSupervisor && wo.status === 'READY FOR QC' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            updateWorkOrderStatus(wo.woId, 'COMPLETED & RELEASED')
                          }
                        >
                          Rilis QC
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => exportWorkOrderSummaryPdf(wo)}
                        aria-label={`Cetak PDF ${wo.woId}`}
                      >
                        PDF
                      </Button>
                      {isSupervisor && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowEditModal(wo)}
                            aria-label={`Ubah ${wo.woId}`}
                          >
                            Ubah
                          </Button>
                          {wo.status !== 'COMPLETED & RELEASED' &&
                            wo.status !== 'CANCELLED' && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setShowCancelModal(wo);
                                  setCancelReason('');
                                }}
                                aria-label={`Batalkan ${wo.woId}`}
                              >
                                Batal
                              </Button>
                            )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {filteredWorkOrders.length > 0 && (
          <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#475569]">
            <div className="flex items-center gap-2">
              <span>
                Menampilkan{' '}
                <strong className="text-[#0F172A] font-mono">
                  {woStartIndex + 1}–{Math.min(woStartIndex + woPageSize, filteredWorkOrders.length)}
                </strong>{' '}
                dari <strong className="text-[#0F172A] font-mono">{filteredWorkOrders.length}</strong>{' '}
                work order
              </span>
              <select
                aria-label="Jumlah work order per halaman"
                value={woPageSize}
                onChange={(e) => setWoPageSize(Number(e.target.value))}
                className="ml-2 h-7 px-2 rounded border border-[#CBD5E1] bg-white text-[#0F172A] font-semibold focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              >
                <option value={10}>10 / hal</option>
                <option value={15}>15 / hal</option>
                <option value={30}>30 / hal</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeWoPage <= 1}
                onClick={() => setWoCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-[#CBD5E1] bg-white text-[#0F172A] font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Sebelumnya
              </button>
              <span className="px-2.5 py-1 font-mono font-semibold text-[#0F172A]">
                Hal {safeWoPage} / {woTotalPages}
              </span>
              <button
                type="button"
                disabled={safeWoPage >= woTotalPages}
                onClick={() => setWoCurrentPage((p) => Math.min(woTotalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-[#CBD5E1] bg-white text-[#0F172A] font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </TableContainer>

      {/* MODAL: Create Work Order */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateModalError(null);
        }}
        size="md"
        title="Jadwalkan Work Order Baru"
        subtitle="Pilih unit armada, alokasi bay, dan rincian pengerjaan"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowCreateModal(false);
                setCreateModalError(null);
              }}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateModalError(null);
                const resolvedUnit =
                  createForm.idUnit ||
                  (createForm.kategori === 'TRUK'
                    ? state.trucks[0]?.idUnit || ''
                    : createForm.kategori === 'CHASSIS'
                    ? state.chassis[0]?.idUnit || ''
                    : state.gensets[0]?.idUnit || '');
                if (!resolvedUnit) {
                  setCreateModalError('Silakan pilih ID Unit / Nopol terlebih dahulu.');
                  return;
                }
                if (createForm.kategori === 'TRUK') {
                  const targetTruck = state.trucks.find((t) => t.idUnit === resolvedUnit);
                  if (
                    targetTruck &&
                    Number(createForm.odo) > 0 &&
                    Number(createForm.odo) < targetTruck.kmSaatIni
                  ) {
                    setCreateModalError(
                      `Odometer masuk (${Number(createForm.odo).toLocaleString('id-ID')} KM) tidak boleh lebih rendah dari odometer tercatat saat ini (${targetTruck.kmSaatIni.toLocaleString('id-ID')} KM).`
                    );
                    return;
                  }
                }
                if (
                  createForm.tEst &&
                  createForm.tglRencana &&
                  new Date(createForm.tEst).getTime() < new Date(createForm.tglRencana).getTime()
                ) {
                  setCreateModalError(
                    'Waktu estimasi target selesai tidak boleh lebih awal dari waktu rencana masuk.'
                  );
                  return;
                }

                const newWo = createWorkOrder({
                  ...createForm,
                  idUnit: resolvedUnit
                });
                setShowCreateModal(false);
                const waText = buildBmiWhatsAppReport(
                  'Jadwal Work Order Baru',
                  state.userLocation,
                  state.userPic,
                  [
                    `No. WO: *${newWo.woId}*`,
                    `Unit Armada: *${newWo.idUnit}* (${newWo.kategori})`,
                    `Alokasi Bay: *${newWo.bay}*`,
                    `Prioritas: *${newWo.prioritas}*`,
                    `Jenis Servis: ${newWo.jenisServis}`,
                    `Teknisi PIC: ${newWo.teknisi}`,
                    `Keluhan: ${newWo.keluhan || '-'}`
                  ],
                  newWo.woId
                );
                triggerReportToast({
                  title: `WO Baru ${newWo.woId}`,
                  text: waText,
                  pdfLabel: 'Cetak PDF WO',
                  pdfAction: () => exportWorkOrderSummaryPdf(newWo)
                });
              }}
            >
              Simpan work order
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {createModalError && (
            <div className="p-3 rounded-[6px] bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-[#DC2626] font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{createModalError}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Kategori unit</label>
              <select
                value={createForm.kategori}
                onChange={(e) => {
                  const k = e.target.value as 'TRUK' | 'CHASSIS' | 'GENSET';
                  const firstUnit =
                    k === 'TRUK'
                      ? state.trucks[0]?.idUnit || ''
                      : k === 'CHASSIS'
                      ? state.chassis[0]?.idUnit || ''
                      : state.gensets[0]?.idUnit || '';
                  setCreateForm({ ...createForm, kategori: k, idUnit: firstUnit });
                }}
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              >
                <option value="TRUK">Truk armada</option>
                <option value="CHASSIS">Chassis trailer</option>
                <option value="GENSET">Genset reefer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">ID unit atau nopol</label>
              <select
                value={createForm.idUnit}
                onChange={(e) => setCreateForm({ ...createForm, idUnit: e.target.value })}
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              >
                {createForm.kategori === 'TRUK' &&
                  state.trucks.map((t) => (
                    <option key={t.idUnit} value={t.idUnit}>
                      {t.idUnit} ({t.noLambung})
                    </option>
                  ))}
                {createForm.kategori === 'CHASSIS' &&
                  state.chassis.map((c) => (
                    <option key={c.idUnit} value={c.idUnit}>
                      {c.idUnit} ({c.tipeChassis})
                    </option>
                  ))}
                {createForm.kategori === 'GENSET' &&
                  state.gensets.map((g) => (
                    <option key={g.idUnit} value={g.idUnit}>
                      {g.idUnit} ({g.tipeGenset})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Tingkat prioritas</label>
              <select
                value={createForm.prioritas}
                onChange={(e) =>
                  setCreateForm({ ...createForm, prioritas: e.target.value as any })
                }
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              >
                <option value="Normal">Normal</option>
                <option value="Mendesak">Mendesak</option>
                <option value="Darurat / Breakdown">Darurat / Breakdown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Alokasi bay</label>
              <select
                value={createForm.bay}
                onChange={(e) => setCreateForm({ ...createForm, bay: e.target.value as any })}
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              >
                {BAYS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Teknisi bertugas</label>
              <input
                type="text"
                value={createForm.teknisi}
                onChange={(e) => setCreateForm({ ...createForm, teknisi: e.target.value })}
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Odometer atau HM masuk
              </label>
              <input
                type="number"
                value={createForm.odo}
                onChange={(e) =>
                  setCreateForm({ ...createForm, odo: Number(e.target.value) })
                }
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Jenis servis</label>
              <input
                type="text"
                value={createForm.jenisServis}
                onChange={(e) =>
                  setCreateForm({ ...createForm, jenisServis: e.target.value })
                }
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Estimasi target selesai
              </label>
              <input
                type="datetime-local"
                value={createForm.tEst}
                onChange={(e) => setCreateForm({ ...createForm, tEst: e.target.value })}
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">
              Keluhan dan catatan
            </label>
            <textarea
              value={createForm.keluhan}
              onChange={(e) => setCreateForm({ ...createForm, keluhan: e.target.value })}
              rows={2}
              className="w-full bg-white border border-[#E2E8F0] rounded-[6px] p-2.5 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: Edit / Supervisor QC Release Work Order */}
      <Modal
        isOpen={Boolean(showEditModal)}
        onClose={() => setShowEditModal(null)}
        size="md"
        title={showEditModal ? `Kelola Work Order: ${showEditModal.woId}` : 'Kelola Work Order'}
        subtitle={showEditModal ? `Unit ${showEditModal.idUnit} · Status: ${showEditModal.status}` : ''}
        footer={
          <div className="w-full flex items-center justify-between">
            {isSupervisor && showEditModal && showEditModal.status !== 'COMPLETED & RELEASED' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  updateWorkOrderStatus(showEditModal.woId, 'COMPLETED & RELEASED');
                  setShowEditModal(null);
                }}
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Rilis QC unit
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowEditModal(null)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (showEditModal) {
                    updateWorkOrderDetails(showEditModal.woId, showEditModal);
                    setShowEditModal(null);
                  }
                }}
              >
                Simpan perubahan
              </Button>
            </div>
          </div>
        }
      >
        {showEditModal && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Alokasi bay</label>
                <select
                  value={showEditModal.bay}
                  onChange={(e) =>
                    setShowEditModal({ ...showEditModal, bay: e.target.value as any })
                  }
                  className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
                >
                  {BAYS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Prioritas</label>
                <select
                  value={showEditModal.prioritas}
                  onChange={(e) =>
                    setShowEditModal({ ...showEditModal, prioritas: e.target.value as any })
                  }
                  className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
                >
                  <option value="Normal">Normal</option>
                  <option value="Mendesak">Mendesak</option>
                  <option value="Darurat / Breakdown">Darurat / Breakdown</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Teknisi</label>
                <input
                  type="text"
                  value={showEditModal.teknisi}
                  onChange={(e) =>
                    setShowEditModal({ ...showEditModal, teknisi: e.target.value })
                  }
                  className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Estimasi target selesai
                </label>
                <input
                  type="datetime-local"
                  value={(showEditModal.tEst || '').slice(0, 16)}
                  onChange={(e) =>
                    setShowEditModal({ ...showEditModal, tEst: e.target.value })
                  }
                  className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Keluhan dan catatan</label>
              <textarea
                value={showEditModal.keluhan}
                onChange={(e) =>
                  setShowEditModal({ ...showEditModal, keluhan: e.target.value })
                }
                rows={2}
                className="w-full bg-white border border-[#E2E8F0] rounded-[6px] p-2.5 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Soft Delete Work Order */}
      <Modal
        isOpen={Boolean(showCancelModal)}
        onClose={() => setShowCancelModal(null)}
        size="sm"
        title={showCancelModal ? `Batalkan Work Order: ${showCancelModal.woId}` : 'Batalkan Work Order'}
        subtitle="Status work order akan diubah menjadi batal"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCancelModal(null)}
            >
              Kembali
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!cancelReason.trim()}
              onClick={() => {
                if (showCancelModal) {
                  cancelWorkOrder(showCancelModal.woId, cancelReason);
                  setShowCancelModal(null);
                }
              }}
            >
              Konfirmasi batal
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">
              Alasan pembatalan <span className="text-[#DC2626]">*</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Contoh: Dialihkan ke jadwal servis lain..."
              rows={3}
              className="w-full bg-white border border-[#E2E8F0] rounded-[6px] p-2.5 text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: Request Sparepart */}
      <Modal
        isOpen={showPartRequestModal}
        onClose={() => setShowPartRequestModal(false)}
        size="sm"
        title="Permintaan Suku Cadang"
        subtitle="Kirimkan permintaan part ke gudang"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPartRequestModal(false)}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitPartRequest}
            >
              Kirim permintaan
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">
              Pilih dari katalog gudang
            </label>
            <select
              value={partReqForm.sku}
              onChange={(e) => {
                const selected = state.parts.find((p) => p.sku === e.target.value);
                if (selected) {
                  setPartReqForm({
                    sku: selected.sku,
                    namaPart: selected.nama,
                    qty: 1,
                    hargaSatuan: selected.harga
                  });
                }
              }}
              className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            >
              <option value="">Pilih suku cadang gudang</option>
              {state.parts.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} - {p.nama} (Stok: {p.stok})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Nama suku cadang</label>
            <input
              type="text"
              value={partReqForm.namaPart}
              onChange={(e) => setPartReqForm({ ...partReqForm, namaPart: e.target.value })}
              placeholder="Nama suku cadang..."
              className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Kuantitas</label>
              <input
                type="number"
                min={1}
                value={partReqForm.qty}
                onChange={(e) =>
                  setPartReqForm({ ...partReqForm, qty: Number(e.target.value) })
                }
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Estimasi harga satuan
              </label>
              <input
                type="number"
                value={partReqForm.hargaSatuan}
                onChange={(e) =>
                  setPartReqForm({ ...partReqForm, hargaSatuan: Number(e.target.value) })
                }
                className="h-9 w-full bg-white border border-[#E2E8F0] rounded-[6px] px-3 font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#073E7F]"
              />
            </div>
          </div>

          <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] text-xs flex items-center justify-between font-mono">
            <span className="text-[#475569]">Total estimasi biaya:</span>
            <span className="font-bold text-[#0F172A]">
              Rp {(partReqForm.qty * partReqForm.hargaSatuan).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
