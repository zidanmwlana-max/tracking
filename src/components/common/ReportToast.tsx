import React, { useState, useEffect } from 'react';
import {
  FileText,
  Copy,
  Check,
  Share2,
  Download,
  X,
  History,
  Clock
} from 'lucide-react';

export interface ReportLogEntry {
  id: string;
  title: string;
  text: string;
  time: string;
  pdfAction?: () => void;
  pdfLabel?: string;
}

const REPORT_STORAGE_KEY = 'bmi_workshop_reports_v1';

let reportHistory: ReportLogEntry[] = (() => {
  try {
    const raw = sessionStorage.getItem(REPORT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();

let activeReportToast: ReportLogEntry | null = null;
const reportListeners = new Set<() => void>();

function notifyReportListeners() {
  try {
    sessionStorage.setItem(
      REPORT_STORAGE_KEY,
      JSON.stringify(
        reportHistory.map(({ pdfAction, ...rest }) => rest).slice(0, 30)
      )
    );
  } catch {
    // ignore storage errors
  }
  reportListeners.forEach((fn) => fn());
}

/**
 * Formats standardized BMI WhatsApp Report Header & Footer (Ported from GAS V9.5 rpHead & RP_FOOT)
 */
export function buildBmiWhatsAppReport(
  title: string,
  location: string,
  pic: string,
  bodyLines: string[],
  docNo?: string
): string {
  const nowStr = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const header = [
    `*LAPORAN OPERASIONAL BENGKEL BMI*`,
    `*${title.toUpperCase()}*`,
    `--------------------------------`,
    ...(docNo ? [`No. Dok: *${docNo}*`] : []),
    `Waktu: ${nowStr} WIB`,
    `Lokasi: ${location}`,
    `Petugas (PIC): ${pic}`,
    `--------------------------------`
  ];

  const footer = [
    `--------------------------------`,
    `_Sistem Manajemen Bengkel BMI_`
  ];

  return [...header, ...bodyLines, ...footer].join('\n');
}

/**
 * Pushes a new formatted report and opens the floating ReportToast
 */
export function triggerReportToast(entry: {
  title: string;
  text: string;
  pdfAction?: () => void;
  pdfLabel?: string;
}) {
  const newItem: ReportLogEntry = {
    id: `rep-${Date.now()}`,
    title: entry.title,
    text: entry.text,
    time: new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }),
    pdfAction: entry.pdfAction,
    pdfLabel: entry.pdfLabel
  };

  reportHistory = [newItem, ...reportHistory].slice(0, 30);
  activeReportToast = newItem;
  notifyReportListeners();
}

export function closeReportToast() {
  activeReportToast = null;
  notifyReportListeners();
}

export function useReportToastStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    reportListeners.add(listener);
    return () => {
      reportListeners.delete(listener);
    };
  }, []);

  return {
    activeToast: activeReportToast,
    history: reportHistory,
    closeToast: closeReportToast,
    reopenReport: (item: ReportLogEntry) => {
      activeReportToast = item;
      notifyReportListeners();
    }
  };
}

export const ReportToast: React.FC = () => {
  const { activeToast, closeToast } = useReportToastStore();
  const [copied, setCopied] = useState(false);

  if (!activeToast) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeToast.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea');
      ta.value = activeToast.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    const encoded = encodeURIComponent(activeToast.text);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    const a = document.createElement('a');
    a.href = waUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-md bg-white border-2 border-[#0A2547] rounded-xl shadow-2xl overflow-hidden">
      {/* Header Bar with BMI Gold Accent */}
      <div className="bg-[#0A2547] border-b-[3px] border-[#D19F0F] px-4 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[#D19F0F] shrink-0" />
          <div className="truncate">
            <div className="text-xs font-bold truncate">{activeToast.title}</div>
            <div className="text-[10px] text-slate-300 font-mono">
              Laporan Siap Kirim · {activeToast.time} WIB
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={closeToast}
          className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          aria-label="Tutup laporan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Formatted Monospace Preview */}
      <div className="p-3.5 bg-slate-50 border-b border-slate-200 max-h-56 overflow-y-auto">
        <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
          {activeToast.text}
        </pre>
      </div>

      {/* Action Buttons: Copy, WhatsApp, PDF */}
      <div className="p-3 bg-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>Salin Teks</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex-1 py-2 px-3 bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Kirim WA</span>
          </button>
        </div>

        {activeToast.pdfAction && (
          <button
            type="button"
            onClick={activeToast.pdfAction}
            className="py-2 px-3 bg-[#0A2547] hover:bg-[#073E7F] text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#D19F0F]" />
            <span>{activeToast.pdfLabel || 'Unduh PDF'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const ReportHistoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { history, reopenReport } = useReportToastStore();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A2547]/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Riwayat Laporan Operasional Sesi Ini"
    >
      <div className="bg-white rounded-[10px] border border-[#E2E8F0] shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-[#0A2547] border-b-[3px] border-[#D19F0F] px-5 py-3.5 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#D19F0F]" />
            <h3 className="text-sm font-bold">Riwayat Laporan Operasional Sesi Ini</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup riwayat laporan"
            className="p-1.5 text-slate-300 hover:text-white rounded-[6px] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto divide-y divide-slate-100 flex-1">
          {history.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#475569]">
              Belum ada laporan aktivitas pada sesi ini. Setiap transaksi ceklis chassis, mutasi ban,
              atau work order akan terekam di sini.
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-[6px] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-[#475569] flex items-center gap-1.5 mt-0.5 font-mono">
                    <Clock className="w-3 h-3 text-[#475569]" />
                    <span>{item.time} WIB</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    reopenReport(item);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-[#0A2547] hover:bg-[#073E7F] text-white text-xs font-bold rounded-[6px] shrink-0 cursor-pointer"
                >
                  Buka Laporan
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
