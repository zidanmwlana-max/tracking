import React from 'react';
import { ShieldAlert, Lock, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import {
  AuthUser,
  FeaturePermissionKey,
  isFeatureAllowedForUser,
  getStoredAuthSession
} from '../../services/authSession';

interface FeatureAccessGuardProps {
  feature: FeaturePermissionKey;
  featureTitle: string;
  currentUser?: AuthUser | null;
  onRedirectBack?: () => void;
  children: React.ReactNode;
}

/**
 * Komponen Proteksi Ketat Berbasis Sheet 'User Access' (RBAC Guard)
 * Memastikan fitur sensitif (seperti Fleet Management, Inventory Sparepart, Laka, Dashboard)
 * tidak pernah bisa diakses atau dirender oleh Role yang tidak memiliki otorisasi di Sheet 'User Access'.
 */
export const FeatureAccessGuard: React.FC<FeatureAccessGuardProps> = ({
  feature,
  featureTitle,
  currentUser,
  onRedirectBack,
  children
}) => {
  const activeUser = currentUser ?? getStoredAuthSession();
  const isAllowed = isFeatureAllowedForUser(activeUser, feature);

  if (!isAllowed) {
    const roleLabel = activeUser?.roleRaw || activeUser?.role || 'Tidak Terotorisasi';
    const allowedList = activeUser?.allowedFeatures || [];

    return (
      <div className="max-w-2xl mx-auto my-8 bg-white border border-red-200 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-red-50 border border-red-200 text-[#EF4444] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-mono text-[11px] font-bold">
                AKSES FITUR DIBATASI
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0A2547] text-[#D19F0F] font-mono text-[11px] font-bold">
                KEBIJAKAN OTORISASI PENGGUNA
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900">
              Akses ke Modul &quot;{featureTitle}&quot; Dibatasi
            </h2>

            <p className="text-xs text-slate-600 leading-relaxed">
              Berdasarkan pengaturan hak akses pengguna, akun Anda (<b>{activeUser?.nama || '-'}</b>)
              memiliki peran{' '}
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                {roleLabel}
              </span>{' '}
              yang tidak memiliki otorisasi untuk membuka modul ini.
            </p>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Lock className="w-3.5 h-3.5 text-[#073E7F]" />
                <span>Daftar Modul yang Diizinkan untuk Peran &quot;{roleLabel}&quot;:</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allowedList.length > 0 ? (
                  allowedList.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-semibold"
                    >
                      {f}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">Tidak ada modul aktif</span>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Silakan hubungi Supervisor Bengkel untuk penyesuaian hak akses</span>
              </div>

              {onRedirectBack && (
                <button
                  type="button"
                  onClick={onRedirectBack}
                  className="px-4 py-2 bg-[#0A2547] hover:bg-[#073E7F] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#D19F0F]" />
                  <span>Kembali ke Portal Saya</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
