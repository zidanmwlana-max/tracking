import React, { useState, useEffect, useRef } from 'react';
import {
  FolderTree,
  Database,
  Key,
  GitBranch,
  CheckCircle2,
  Server,
  RefreshCw,
  Download,
  Upload,
  ShieldCheck,
  HardDrive,
  AlertCircle
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { getAuthHeaders } from '../../services/authSession';

interface ServerHealthInfo {
  status: string;
  service: string;
  timestamp: string;
  storageMode: string;
  hasLocalDatabase: boolean;
}

export const ProjectStructureView: React.FC = () => {
  const {
    state,
    syncWithCompanyServer,
    exportWorkshopSnapshot,
    importWorkshopSnapshot
  } = useWorkshopStore();

  const [health, setHealth] = useState<ServerHealthInfo | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [syncingServer, setSyncingServer] = useState(false);
  const [showConnectorForm, setShowConnectorForm] = useState(false);
  const [savingConnector, setSavingConnector] = useState(false);
  const [connectorConfig, setConnectorConfig] = useState({
    enabled: false,
    externalApiUrl: '',
    externalApiKey: '',
    stateEndpoint: '/workshop/state',
    syncEndpoint: '/workshop/sync'
  });
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const checkServerHealth = async () => {
    setCheckingHealth(true);
    try {
      const [resHealth, resCfg] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/config/adapter', { headers: { ...getAuthHeaders() } })
      ]);
      if (resHealth.ok) {
        const data = await resHealth.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
      if (resCfg.ok) {
        const cfg = await resCfg.json();
        setConnectorConfig({
          enabled: Boolean(cfg.enabled),
          externalApiUrl: cfg.externalApiUrl || '',
          externalApiKey: cfg.externalApiKey || '',
          stateEndpoint: cfg.stateEndpoint || '/workshop/state',
          syncEndpoint: cfg.syncEndpoint || '/workshop/sync'
        });
      }
    } catch {
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    checkServerHealth();
  }, []);

  const handleSaveConnectorConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConnector(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/config/adapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(connectorConfig)
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        await checkServerHealth();
        setFeedbackMsg({
          type: 'success',
          text: connectorConfig.enabled
            ? `Koneksi Server Eksternal (${connectorConfig.externalApiUrl || 'Belum diisi'}) berhasil diaktifkan.`
            : 'Disimpan dalam Mode Lokal Mandiri (Koneksi Server Eksternal di-skip untuk sementara).'
        });
        setShowConnectorForm(false);
      } else {
        setFeedbackMsg({
          type: 'error',
          text: resData.error || 'Gagal menyimpan konfigurasi adapter server.'
        });
      }
    } catch {
      setFeedbackMsg({
        type: 'error',
        text: 'Gagal terhubung ke endpoint konfigurasi lokal.'
      });
    } finally {
      setSavingConnector(false);
    }
  };

  const handleManualServerSync = async () => {
    setSyncingServer(true);
    setFeedbackMsg(null);
    const res = await syncWithCompanyServer();
    setSyncingServer(false);
    if (res.ok) {
      await checkServerHealth();
      setFeedbackMsg({
        type: 'success',
        text: `Database lokal (.data/workshop-db.json) & backup harian berhasil disinkronkan pada ${res.updatedAt}.`
      });
    } else {
      setFeedbackMsg({
        type: 'error',
        text: 'Gagal menghubungi endpoint /api/workshop/sync pada server lokal.'
      });
    }
  };

  const handleDownloadBackup = () => {
    try {
      const jsonStr = exportWorkshopSnapshot();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `bmi-workshop-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedbackMsg({
        type: 'success',
        text: `File snapshot bmi-workshop-backup-${dateStr}.json berhasil diunduh.`
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Gagal mengunduh file backup JSON.'
      });
    }
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = String(ev.target?.result || '');
        importWorkshopSnapshot(content);
        await syncWithCompanyServer();
        await checkServerHealth();
        setFeedbackMsg({
          type: 'success',
          text: `Backup "${file.name}" berhasil dipulihkan ke aplikasi dan disimpan ke server lokal.`
        });
      } catch (err: any) {
        setFeedbackMsg({
          type: 'error',
          text: err?.message || 'File backup JSON tidak valid.'
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#2563EB] mb-1">
              Dokumentasi Sistem, Infrastruktur Server Mandiri & Standar Operasional
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Arsitektur Full-Stack, Server Lokal Perusahaan & Standar Penomoran BMI
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Pusat kendali kesiapan migrasi server perusahaan mandiri (<code>server.ts</code>),
              pencadangan database lokal otomatis, serta dokumentasi struktur modul dan kode aset
              resmi PT Bumi Menara Internusa.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-md shrink-0">
            BMI Corporate Enterprise v3.0
          </div>
        </div>
      </div>

      {/* Live Local Company Server & Database Migration Control Panel */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0A2547] text-[#D19F0F] flex items-center justify-center shrink-0 mt-0.5">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900">
                  Status Server Mandiri & Konektor Server Berikutnya (Plug & Play)
                </h2>
                {health ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> ONLINE ({health.storageMode})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertCircle className="w-3 h-3" /> MODE BROWSER FALLBACK
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Saat ini berjalan mandiri (server eksternal di-skip). Jika kode server/API proyek
                berikutnya sudah siap, klik <strong>Atur Koneksi Server/API</strong> untuk
                menghubungkan URL tanpa perlu mengubah kode aplikasi.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConnectorForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              {showConnectorForm ? 'Tutup Pengaturan URL' : 'Atur Koneksi Server/API'}
            </button>

            <button
              type="button"
              onClick={handleManualServerSync}
              disabled={syncingServer}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-[#0A2547] hover:bg-[#153661] text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingServer ? 'animate-spin' : ''}`} />
              {syncingServer ? 'Menyimpan...' : 'Sinkronkan Lokal'}
            </button>

            <button
              type="button"
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#2563EB]" />
              Unduh Backup (.json)
            </button>

            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              Pulihkan Backup
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportBackupFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {showConnectorForm && (
          <form
            onSubmit={handleSaveConnectorConfig}
            className="mb-5 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Konfigurasi Koneksi Server / API Eksternal (Editable Plug & Play)
                </h3>
                <p className="text-[11px] text-slate-600">
                  Biarkan tidak dicentang jika Anda belum memiliki kode server eksternal. Saat
                  proyek server Anda siap, centang dan masukkan Base URL-nya di bawah ini.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={connectorConfig.enabled}
                  onChange={(e) =>
                    setConnectorConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                Aktifkan Forwarding ke Server Eksternal
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Base URL Server / API Eksternal
                </label>
                <input
                  type="text"
                  value={connectorConfig.externalApiUrl}
                  onChange={(e) =>
                    setConnectorConfig((prev) => ({ ...prev, externalApiUrl: e.target.value }))
                  }
                  placeholder="Contoh: http://192.168.1.50:4000/api atau https://api.perusahaan.co.id"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  API Key / Bearer Token (Opsional)
                </label>
                <input
                  type="password"
                  value={connectorConfig.externalApiKey}
                  onChange={(e) =>
                    setConnectorConfig((prev) => ({ ...prev, externalApiKey: e.target.value }))
                  }
                  placeholder="Kosongkan jika belum ada token autentikasi"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Path Endpoint GET State
                </label>
                <input
                  type="text"
                  value={connectorConfig.stateEndpoint}
                  onChange={(e) =>
                    setConnectorConfig((prev) => ({ ...prev, stateEndpoint: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Path Endpoint POST Sync
                </label>
                <input
                  type="text"
                  value={connectorConfig.syncEndpoint}
                  onChange={(e) =>
                    setConnectorConfig((prev) => ({ ...prev, syncEndpoint: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConnectorForm(false)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingConnector}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[#0A2547] hover:bg-[#153661] text-white cursor-pointer disabled:opacity-50"
              >
                {savingConnector ? 'Menyimpan...' : 'Simpan Pengaturan Koneksi'}
              </button>
            </div>
          </form>
        )}

        {feedbackMsg && (
          <div
            className={`mb-4 p-3 rounded-md border text-xs flex items-center justify-between ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-[11px] font-semibold underline ml-3 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 font-medium mb-1">
              <span>Adapter Penyimpanan Aktif</span>
              <HardDrive className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm">
              {checkingHealth
                ? 'Memeriksa...'
                : health?.storageMode || 'LOCAL_STORAGE_FALLBACK'}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              {health?.hasLocalDatabase
                ? 'File .data/workshop-db.json tersedia & aktif'
                : 'Siap menginisialisasi file database lokal'}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 font-medium mb-1">
              <span>Proteksi Keamanan API</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-bold text-slate-900 text-sm">
              HMAC-SHA256 + Rate Limit
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              Anti Brute-Force (5x/15m) & Sanitasi Formula Sheet
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 font-medium mb-1">
              <span>Populasi Entitas Tersimpan</span>
              <Database className="w-4 h-4 text-amber-600" />
            </div>
            <div className="font-bold text-slate-900 text-sm">
              {state.trucks.length} Truk · {state.chassis.length} Chassis · {state.tires.length} Ban
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              {state.workOrders.length} Work Order · {state.maintenanceParameters.length} Parameter PM
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 font-medium mb-1">
              <span>Sinkronisasi Terakhir</span>
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm">
              {state.lastSyncTime || '-'}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              Auto-backup harian di .data/backups/
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Ideal Modular Folder Tree */}
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-lg p-6">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
            <FolderTree className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-sm font-bold text-slate-900">
              Struktur Direktori Proyek Full-Stack (Siap Deploy Server Perusahaan)
            </h2>
          </div>

          <pre className="bg-[#0F172A] text-slate-200 p-4 rounded-lg text-xs font-mono leading-relaxed overflow-x-auto">
{`bmi-enterprise-workshop/
├── server.ts                          # Backend Express + API Adapter + Rate Limiter
├── .env.example                       # Template Konfigurasi Server & Paid API Adapter
├── .data/                             # Penyimpanan Lokal Server Perusahaan (Gratis)
│   ├── workshop-db.json               # Database Operasional Utama (Auto-Sync)
│   ├── backups/                       # Snapshot Backup Harian Otomatis
│   └── error-telemetry.log            # Log Error Terpusat dari ErrorBoundary
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── LoginPage.tsx          # Halaman Masuk & Otorisasi Peran (HMAC)
│   │   ├── ui/
│   │   │   ├── Modal.tsx              # Dialog Aksesibel (Focus-Safe Keyboard)
│   │   │   └── ErrorBoundary.tsx      # Isolasi Crash Modul & Telemetry
│   │   ├── dashboard/
│   │   │   └── GlobalDashboard.tsx    # Ringkasan Armada & 25 Parameter Komponen
│   │   ├── fleet/
│   │   │   └── FleetManagement.tsx    # Manajemen Armada & Registrasi Aset
│   │   ├── tires/
│   │   │   ├── TireManagement.tsx     # Pemetaan & Rotasi Roda Armada
│   │   │   └── WarehouseStock.tsx     # Kesiapan Stok Ban Gudang
│   │   ├── chassis/
│   │   │   └── ChassisChecklist.tsx   # Inspeksi 13 Titik Chassis (Auto-Draft)
│   │   ├── workorder/
│   │   │   └── WorkOrderPortal.tsx    # Antrean Servis & Work Order
│   │   ├── inventory/
│   │   │   └── SparepartWarehouse.tsx # Gudang & Persetujuan Suku Cadang
│   │   ├── incidents/
│   │   │   └── IncidentManagement.tsx # Laporan Kendala & Klaim Insiden
│   │   └── sheets/
│   │       └── GoogleSheetsModal.tsx  # Sinkronisasi Cloud & Formula Sanitizer
│   ├── services/
│   │   ├── authSession.ts             # Manajemen Sesi & Anti-Tamper Signature
│   │   ├── workshopStore.ts           # State Store + Sync Server Lokal & Sheet
│   │   ├── maintenanceEngine.ts       # Evaluasi 25 Parameter Servis Berkala
│   │   ├── googleSheets.ts            # Konektor Google Sheets + OWASP Sanitizer
│   │   └── initialData.ts             # Data Master Operasional Resmi BMI
│   ├── App.tsx                        # Lazy Code-Splitting & Hash Router
│   └── index.css                      # Desain Korporat BMI Navy & Gold
└── package.json`}
          </pre>
        </div>

        {/* Right Column: Business Rules & Database Schemas */}
        <div className="lg:col-span-6 space-y-6">
          {/* Asset Numbering Standards */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <Key className="w-4 h-4 text-[#10B981]" />
              <h2 className="text-sm font-bold text-slate-900">
                Standar Penomoran Identitas Aset Armada (Sistem Terbaru BMI)
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F1F5F9] text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Kategori Aset</th>
                    <th className="py-2.5 px-3">Format & Aturan Penamaan</th>
                    <th className="py-2.5 px-3">Contoh Resmi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      Truk Milik BMI (Head / Box / Penumpang)
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <code>BMI-{'{HTR|BOX|PNP}{SEQ 3 Digit}'}</code> sesuai sub-jenis armada
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#2563EB]">
                      BMI-HTR001 / BMI-BOX018 / BMI-PNP017
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      Truk Sewa Vendor
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <code>{'{3 Huruf Vendor}-{HTR|BOX|PNP}{SEQ 3 Digit}'}</code>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#2563EB]">
                      SBA-HTR001
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">Chassis Trailer</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <code>{'{OWNER}{2A/3A}{SEQ 3 Digit}'}</code> tanpa tanda hubung
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#2563EB]">
                      BMI2A001 / BMI3A012
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">Genset Reefer</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <code>GNZ-{'{CG/UG}-{SEQ 2 Digit}'}</code> (Clip-On / Underslung)
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#2563EB]">
                      GNZ-CG-01 / GNZ-UG-02
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">Inventaris Ban</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <code>{'{PLANT 2-3}{WWYY 4 Digit Akhir DOT}{SEQ 4 Digit}{Siklus}'}</code>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#2563EB]">
                      1NL29250001R0
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4 Main Asset Categories */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <Database className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-900">
                Presisi Skema Google Sheets LOG (100% Dipertahankan)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>TRK (LOG)</span>
                  <span className="font-mono text-[#2563EB]">33 Kolom</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Kolom AF = Masa STNK, Kolom AG = Masa Pajak, terintegrasi dengan 25 Parameter
                  Servis Berkala (Oli, Filter, Rem, Kopling, Ban).
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>CHA (LOG)</span>
                  <span className="font-mono text-[#2563EB]">39 Kolom</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Kolom AG = Karoseri, AI = GVW, AM = Nomor Rangka (VIN), dan 13 titik checklist
                  kelayakan fisik.
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>GNZ (LOG)</span>
                  <span className="font-mono text-[#2563EB]">32 Kolom</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Pemantauan Hour Meter (HM) dan jadwal servis berkala per 250 Jam untuk genset
                  Clip-On dan Underslung.
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>Ban (LOG)</span>
                  <span className="font-mono text-[#2563EB]">37 Kolom</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Validasi minggu produksi WW (01–53) dari 4 digit terakhir DOT, siklus R0/R1/R2,
                  dan mutasi posisi roda.
                </p>
              </div>
            </div>
          </div>

          {/* Work Order State Machine */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
              <GitBranch className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Alur Sekuensial State Machine Work Order
              </h2>
            </div>
            <div className="text-xs text-slate-600 leading-relaxed space-y-2">
              <div className="font-mono text-[11px] bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-800">
                SCHEDULED &rarr; ARRIVED &rarr; IN PROGRESS (Wajib Foto Before) &rarr; WAITING PART &rarr; READY FOR QC (Wajib Foto After) &rarr; COMPLETED & RELEASED (Khusus Supervisor)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

