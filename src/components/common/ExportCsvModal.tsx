import React, { useState } from 'react';
import {
  Download,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import Papa from 'papaparse';
import { Modal, Button, toast } from '../ui';
import { useWorkshopStore } from '../../services/workshopStore';
import { getAuthSessionToken } from '../../services/authSession';

/**
 * Formula Injection Sanitizer (OWASP CSV/Formula Injection protection)
 */
export function sanitizeCellForCsv(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export interface ExportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: 'armada' | 'chassis' | 'ban' | 'logs';
}

export type ExportCategory = 'armada' | 'chassis' | 'ban' | 'logs';
export type ExportStatusFilter = 'ALL' | 'ACTIVE' | 'MAINTENANCE' | 'WARNING' | 'COMPLETED';

export const ExportCsvModal: React.FC<ExportCsvModalProps> = ({
  isOpen,
  onClose,
  defaultCategory
}) => {
  const { state } = useWorkshopStore();

  const [selectedCategories, setSelectedCategories] = useState<ExportCategory[]>(() =>
    defaultCategory ? [defaultCategory] : ['armada', 'chassis', 'ban', 'logs']
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ExportStatusFilter>('ALL');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const toggleCategory = (cat: ExportCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategories(['armada', 'chassis', 'ban', 'logs']);
  };

  const clearCategories = () => {
    setSelectedCategories([]);
  };

  /**
   * Format Date to Human-Readable Local String (YYYY-MM-DD HH:mm:ss)
   */
  const formatDateTime = (raw?: string | null): string => {
    if (!raw) return '-';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  /**
   * Client-side fallback generator using PapaParse with UTF-8 BOM and Formula Sanitization
   */
  const generateClientCsvFallback = (filename: string): Blob => {
    const sections: string[] = [];

    // Helper for safe cell
    const safe = (val: unknown): string | number => {
      if (val === null || val === undefined || val === '') return '-';
      return sanitizeCellForCsv(val) as string | number;
    };

    // 1. ARMADA
    if (selectedCategories.includes('armada')) {
      const filteredTrucks = state.trucks.filter((t) => {
        if (statusFilter === 'ACTIVE' && t.statusServis !== 'Selesai') return false;
        if (statusFilter === 'MAINTENANCE' && t.statusServis !== 'In Progress') return false;
        if (statusFilter === 'WARNING' && t.statusPm === 'SAFE') return false;
        return true;
      });

      const armadaRows = filteredTrucks.map((t) => ({
        ID_Armada: safe(t.noLambung),
        Nomor_Plat: safe(t.idUnit),
        Jenis_Armada: safe(t.jenisArmada),
        Merk_Model: safe(t.merkModel),
        Odometer_KM: safe(t.kmSaatIni),
        Target_Ukuran_Ban: safe(t.targetUkuranBan),
        Status_Servis: safe(t.statusServis),
        Status_PM: safe(t.statusPm),
        Masa_STNK: safe(t.masaSTNK),
        Masa_Pajak: safe(t.masaPajak),
        Kepemilikan: safe(t.kepemilikan),
        PIC: safe(t.pic),
        Tanggal_Update: formatDateTime(t.tglMulai)
      }));

      sections.push('=== DATA ARMADA / FLEET (TRUK & SUPPORT) ===');
      sections.push(Papa.unparse(armadaRows));
      sections.push('');
    }

    // 2. CHASSIS
    if (selectedCategories.includes('chassis')) {
      const filteredChassis = state.chassis.filter((c) => {
        if (statusFilter === 'ACTIVE' && c.statusServis !== 'Selesai') return false;
        if (statusFilter === 'MAINTENANCE' && c.statusServis !== 'In Progress') return false;
        if (statusFilter === 'WARNING' && c.statusKIR === 'Aktif') return false;
        return true;
      });

      const chassisRows = filteredChassis.map((c) => ({
        ID_Chassis: safe(c.idUnit),
        Tipe_Chassis: safe(c.tipeChassis),
        Target_Ukuran_Ban: safe(c.targetUkuranBan),
        Masa_KIR: safe(c.masaKIR),
        Status_KIR: safe(c.statusKIR),
        Karoseri: safe(c.karoseri),
        Tahun_Pembuatan: safe(c.tahun),
        GVW_Kg: safe(c.gvw),
        Tare_Kg: safe(c.tare),
        Nomor_Rangka_VIN: safe(c.vin),
        Status_Servis: safe(c.statusServis),
        Status_Milik: safe(c.statusMilik),
        Tanggal_Update: formatDateTime(c.tglMulai)
      }));

      sections.push('=== DATA CHASSIS (13 TITIK INSPEKSI) ===');
      sections.push(Papa.unparse(chassisRows));
      sections.push('');
    }

    // 3. BAN (TIRES)
    if (selectedCategories.includes('ban')) {
      const filteredTires = state.tires.filter((t) => {
        if (statusFilter === 'ACTIVE' && t.statusKelayakan !== 'Aktif Terpasang') return false;
        if (statusFilter === 'MAINTENANCE' && t.statusKelayakan !== 'Spare / Gudang') return false;
        // WARNING: ban terpasang yang sudah menempuh >= 80.000 KM (indikator usia pakai, tanpa tread depth)
        if (statusFilter === 'WARNING' && !(t.statusKelayakan === 'Aktif Terpasang' && t.kmTempuh >= 80000))
          return false;
        return true;
      });

      const tireRows = filteredTires.map((t) => ({
        ID_Siklus: safe(t.idSiklus),
        ID_Ban_Fisik: safe(t.idBanFisik),
        Siklus: safe(t.siklus),
        Merk_Ban: safe(t.merk),
        Ukuran_Ban: safe(t.ukuran),
        Konstruksi: safe(t.konstruksi),
        Kode_DOT_WWYY: safe(t.dot),
        Posisi_Roda: safe(t.posisiRoda),
        Unit_Terpasang: safe(t.unitTerpasang),
        Status_Kelayakan: safe(t.statusKelayakan),
        KM_Tempuh: safe(t.kmTempuh),
        Harga_IDR: safe(t.harga),
        Vendor: safe(t.vendor),
        Catatan_Kondisi: safe(t.catatanKondisi),
        Tanggal_Masuk: formatDateTime(t.tglMasuk)
      }));

      sections.push('=== DATA MASTER BAN & POSISI RODA ===');
      sections.push(Papa.unparse(tireRows));
      sections.push('');
    }

    // 4. LOGS & WORK ORDERS
    if (selectedCategories.includes('logs')) {
      const filteredWo = state.workOrders.filter((wo) => {
        if (statusFilter === 'ACTIVE' && wo.status === 'COMPLETED & RELEASED') return false;
        if (statusFilter === 'MAINTENANCE' && wo.status !== 'IN PROGRESS') return false;
        if (statusFilter === 'COMPLETED' && wo.status !== 'COMPLETED & RELEASED') return false;
        const masuk = (wo.tArrived || wo.timestamp || '').slice(0, 10);
        if (startDate && masuk && masuk < startDate) return false;
        if (endDate && masuk && masuk > endDate) return false;
        return true;
      });

      const woRows = filteredWo.map((wo) => ({
        Nomor_Work_Order: safe(wo.woId),
        Kategori_Aset: safe(wo.kategori),
        ID_Unit_Aset: safe(wo.idUnit),
        Jenis_Servis: safe(wo.jenisServis),
        Deskripsi_Keluhan: safe(wo.keluhan),
        Status_Pengerjaan: safe(wo.status),
        Tingkat_Prioritas: safe(wo.prioritas),
        Mekanik_Bertugas: safe(wo.teknisi),
        Bay: safe(wo.bay),
        Status_QC: safe(wo.status === 'COMPLETED & RELEASED' ? 'LULUS QC' : 'BELUM QC'),
        Downtime_Hari: safe(wo.downtime),
        Odometer: safe(wo.odo),
        Tanggal_Rencana: formatDateTime(wo.tglRencana),
        Tanggal_Masuk_Bengkel: formatDateTime(wo.tArrived),
        Tanggal_Mulai: formatDateTime(wo.tMulai),
        Tanggal_Selesai: formatDateTime(wo.tSelesai),
        Tanggal_Rilis: formatDateTime(wo.tRilis)
      }));

      sections.push('=== RIWAYAT LOGS & WORK ORDER BENGKEL ===');
      sections.push(Papa.unparse(woRows));
      sections.push('');
    }

    const fullContent = sections.join('\r\n');
    // Prepend UTF-8 Byte Order Mark (BOM) \uFEFF to guarantee Excel renders Indonesian/Japanese/accents without mojibake
    return new Blob(['\uFEFF', fullContent], { type: 'text/csv;charset=utf-8;' });
  };

  const handleDownload = async () => {
    // Edge case: No category chosen
    if (selectedCategories.length === 0) {
      toast.error('Pilih minimal satu kategori data untuk diexport.');
      return;
    }

    setIsExporting(true);

    try {
      // Dynamic informative filename: [Kategori]_Export_[YYYYMMDD_HHMM].csv
      const categoryLabel =
        selectedCategories.length === 4
          ? 'Full_Workshop'
          : selectedCategories
              .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
              .join('_dan_');

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
        now.getDate()
      )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `${categoryLabel}_Export_${timeStamp}.csv`;

      // Try Server-Side Streaming API first with Authorization Token
      let downloadedViaApi = false;
      const token = getAuthSessionToken();

      try {
        const queryParams = new URLSearchParams({
          categories: selectedCategories.join(','),
          startDate: startDate || '',
          endDate: endDate || '',
          status: statusFilter
        });

        const res = await fetch(`/api/export/csv?${queryParams.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token || ''}`
          }
        });

        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
          downloadedViaApi = true;
        }
      } catch {
        downloadedViaApi = false;
      }

      // If Server API failed or offline, execute high-fidelity Client-Side Streaming fallback
      if (!downloadedViaApi) {
        const blob = generateClientCsvFallback(filename);
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }

      toast.success(`Laporan CSV berhasil diunduh: ${filename}`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengekspor data CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Advanced CSV Export (Laporan Bengkel)"
      size="lg"
    >
      <div className="space-y-5 text-[#0F172A]">
        {/* Deskripsi & Excel Best Practice Info */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-[#073E7F]">
          <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
          <div className="leading-relaxed">
            File dienkode dengan <strong>UTF-8 BOM</strong> agar karakter khusus, aksen, dan
            koma terbaca rapi langsung di <strong>Microsoft Excel</strong> tanpa <em>mojibake</em>.
          </div>
        </div>

        {/* 1. Pilih Kategori Data (Checkbox Multi-Select) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Pilih Kategori Data</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllCategories}
                className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                Pilih Semua
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearCategories}
                className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              {
                id: 'armada' as ExportCategory,
                label: 'Armada / Fleet (Truk & Support)',
                count: state.trucks.length + state.gensets.length,
                desc: 'Head Truck, Support, Box, PM, Pajak'
              },
              {
                id: 'chassis' as ExportCategory,
                label: 'Sasis 20ft / 40ft',
                count: state.chassis.length,
                desc: '13 Titik Ceklis, GVW, VIN, Karoseri'
              },
              {
                id: 'ban' as ExportCategory,
                label: 'Master Ban & Roda',
                count: state.tires.length,
                desc: 'DOT WWYY, Tread Depth, CPK, Posisi'
              },
              {
                id: 'logs' as ExportCategory,
                label: 'Work Order & Logs Servis',
                count: state.workOrders.length,
                desc: 'Keluhan, Teknisi, QC, Downtime, Biaya'
              }
            ].map((cat) => {
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <div
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="mt-0.5 text-blue-600">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0F172A] truncate">{cat.label}</span>
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        {cat.count}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{cat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Filter Waktu (Opsional untuk Logs/WO) */}
        <div>
          <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>2. Filter Waktu (Khusus Logs & Work Order)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Dari Tanggal:
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs text-[#0F172A] bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Sampai Tanggal:
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs text-[#0F172A] bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* 3. Filter Status Aset / Pekerjaan (Opsional) */}
        <div>
          <label className="text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>3. Filter Status Operasional</span>
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExportStatusFilter)}
            className="w-full px-3 py-2 text-xs text-[#0F172A] bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">Semua Status (Lengkap)</option>
            <option value="ACTIVE">Hanya yang Aktif / Beroperasi Normal</option>
            <option value="MAINTENANCE">Hanya yang Sedang Perbaikan / Pengerjaan Bay</option>
            <option value="WARNING">Hanya Status Peringatan (PM Overdue / Ban Tipis ≤ 3mm)</option>
            <option value="COMPLETED">Hanya Work Order Selesai & Rilis</option>
          </select>
        </div>

        {/* Tombol Aksi */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isExporting}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleDownload}
            disabled={isExporting || selectedCategories.length === 0}
            leftIcon={
              isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Download className="w-4 h-4 text-white" />
              )
            }
          >
            {isExporting ? 'Memproses CSV...' : 'Download CSV'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
