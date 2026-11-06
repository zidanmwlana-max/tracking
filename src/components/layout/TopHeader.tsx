import React, { useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  MapPin,
  FileSpreadsheet,
  Download,
  Bell,
  LogOut,
  ChevronRight,
  History,
  Lock,
  PanelLeft,
  X,
  Globe
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { PoolLocation } from '../../types';
import { AuthUser } from '../../services/authSession';
import { NavTabId } from './Sidebar';
import { useReportToastStore } from '../common/ReportToast';
import { Button } from '../ui/Button';
import { useLocaleStore, AppLocale } from '../../i18n/localeStore';

interface TopHeaderProps {
  activeTab: NavTabId;
  currentUser: AuthUser;
  onLogout: () => void;
  onRoleSwitch?: (newRole: any) => void;
  onOpenSheetsModal: () => void;
  onOpenExportCsv?: () => void;
  onOpenReportHistory: () => void;
  isSheetsConnected: boolean;
  sheetsUserEmail: string | null;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  currentUser,
  onLogout,
  onOpenSheetsModal,
  onOpenExportCsv,
  onOpenReportHistory,
  isSheetsConnected,
  sheetsUserEmail,
  onGoogleSignIn,
  onGoogleSignOut,
  isSidebarCollapsed,
  onToggleSidebar
}) => {
  const { state, setLocation, markAllNotificationsRead } = useWorkshopStore();
  const { history: reportHistory } = useReportToastStore();
  const { locale, t, setLocale } = useLocaleStore();
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const portalMap: Record<NavTabId, string> = {
    dashboard: t.portals.supervisor,
    fleet: t.portals.supervisor,
    inventory: t.portals.supervisor,
    incidents: t.portals.supervisor,
    'user-access': t.portals.supervisor,
    workorders: t.portals.workshopOps,
    tires: t.portals.technician,
    'warehouse-tires': t.portals.technician,
    'chassis-checklist': t.portals.technician,
    architecture: t.portals.systemDocs
  };

  const currentCrumb = {
    portal: portalMap[activeTab] || t.portals.supervisor,
    title: t.tabs[activeTab] || t.tabs.dashboard
  };

  const isMekanik = state.userRole === 'MEKANIK';
  const roleLabel = currentUser.roleRaw || (isMekanik ? 'Teknisi' : 'Supervisor');

  const localePills: { code: AppLocale; label: string }[] = [
    { code: 'id', label: 'ID' },
    { code: 'en', label: 'EN' },
    { code: 'ja', label: 'JP' }
  ];

  return (
    <header className="h-14 bg-[#0A2547] border-b border-[#073E7F] text-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Mobile/Collapsed Toggle + Breadcrumbs */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Toggle Button for Collapsed Desktop or Mobile */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? 'Bentangkan menu samping' : 'Ciutkan menu samping'}
          className={`p-1.5 rounded-[6px] text-[#94A3B8] hover:text-white hover:bg-[#073E7F] transition-colors duration-150 ease-out cursor-pointer ${
            isSidebarCollapsed ? 'inline-flex' : 'inline-flex md:hidden'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Mobile Mini Logo */}
        <div className="md:hidden bg-white rounded-[6px] p-0.5 flex items-center justify-center shrink-0">
          <img
            src="/assets/aistudio/logo-bmi_9490acc1.png"
            alt="BMI"
            className="h-4 w-auto object-contain"
          />
        </div>

        {/* Breadcrumb Items */}
        <span className="text-xs text-[#94A3B8] hidden sm:inline whitespace-nowrap">
          {currentCrumb.portal}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:inline shrink-0" />
        <span className="text-xs sm:text-sm font-semibold text-white truncate">
          {currentCrumb.title}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language Switcher (ID / EN / JP) */}
        <div
          className="hidden sm:flex items-center gap-0.5 bg-[#073E7F]/60 border border-[#073E7F] rounded-[6px] p-0.5 text-[11px]"
          role="group"
          aria-label="Language switcher"
        >
          <Globe className="w-3 h-3 text-[#D19F0F] mx-1 shrink-0" />
          {localePills.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => setLocale(p.code)}
              aria-pressed={locale === p.code}
              className={`px-1.5 py-0.5 rounded-[4px] font-mono font-bold transition-colors cursor-pointer ${
                locale === p.code
                  ? 'bg-[#D19F0F] text-slate-950'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Pool Selector */}
        <div className="hidden lg:flex items-center gap-1.5 bg-[#073E7F]/60 border border-[#073E7F] rounded-[6px] px-2.5 py-1 text-xs">
          <MapPin className="w-3.5 h-3.5 text-[#D19F0F] shrink-0" />
          <select
            value={state.userLocation}
            onChange={(e) => setLocation(e.target.value as PoolLocation)}
            className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            aria-label="Pilih lokasi pool"
          >
            <option value="BMI Surabaya" className="bg-[#0A2547] text-white">
              Surabaya (SBY)
            </option>
            <option value="BMI Lamongan" className="bg-[#0A2547] text-white">
              Lamongan (LMG)
            </option>
            <option value="BMI Dampit" className="bg-[#0A2547] text-white">
              Dampit (DMP)
            </option>
          </select>
        </div>

        {/* Role Badge */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] text-xs text-white"
          title={`Peran aktif: ${roleLabel}`}
        >
          {isMekanik ? (
            <Wrench className="w-3.5 h-3.5 text-[#D19F0F] shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-[#D19F0F] shrink-0" />
          )}
          <span>{roleLabel}</span>
          <Lock className="w-3 h-3 text-[#94A3B8] shrink-0" />
        </div>

        {/* Laporan Operasional History Button */}
        <button
          type="button"
          onClick={onOpenReportHistory}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] text-[#94A3B8] hover:text-white hover:bg-[#073E7F] text-xs font-medium transition-colors duration-150 ease-out cursor-pointer whitespace-nowrap"
          title="Riwayat laporan sesi ini"
        >
          <History className="w-3.5 h-3.5 text-[#D19F0F] shrink-0" />
          <span className="hidden xl:inline">{t.domainTerms.reportBtn}</span>
          {reportHistory.length > 0 && (
            <span className="font-mono tabular-nums text-[11px] px-1.5 rounded-[6px] bg-[#0A2547] text-white border border-[#073E7F]">
              {reportHistory.length}
            </span>
          )}
        </button>

        {/* Google Sheets Status Button (Supervisor Only) */}
        {!isMekanik && (
          <button
            type="button"
            onClick={onOpenSheetsModal}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium border border-[#073E7F] transition-colors duration-150 ease-out cursor-pointer whitespace-nowrap ${
              isSheetsConnected
                ? 'bg-[#073E7F]/50 text-white hover:bg-[#073E7F]'
                : 'bg-transparent text-[#94A3B8] hover:bg-[#073E7F]/40 hover:text-white'
            }`}
            title="Kelola koneksi Google Sheets"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span className="hidden xl:inline">
              {isSheetsConnected ? 'Tersambung' : 'Google Sheets'}
            </span>
          </button>
        )}

        {/* Advanced CSV Export Button (Supervisor & Admin) */}
        {!isMekanik && onOpenExportCsv && (
          <button
            type="button"
            onClick={onOpenExportCsv}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium border border-[#073E7F] bg-transparent text-[#94A3B8] hover:bg-[#073E7F]/40 hover:text-white transition-colors duration-150 ease-out cursor-pointer whitespace-nowrap"
            title="Download Laporan Data CSV (Advanced CSV Export)"
          >
            <Download className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span className="hidden xl:inline">Export CSV</span>
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNotifDrawer(!showNotifDrawer);
              setShowUserMenu(false);
              if (!showNotifDrawer) markAllNotificationsRead();
            }}
            aria-label="Lihat notifikasi"
            className="p-1.5 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] text-[#94A3B8] hover:text-white hover:bg-[#073E7F] transition-colors duration-150 ease-out cursor-pointer relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#DC2626] text-white font-mono text-[10px] w-4 h-4 rounded-[6px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifDrawer && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-[#0F172A] rounded-[10px] shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0] overflow-hidden z-50">
              <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                <span className="font-bold text-xs text-[#0F172A]">Notifikasi sistem</span>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(false)}
                  className="text-xs text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-[#E2E8F0]">
                {state.notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#475569]">
                    Tidak ada notifikasi baru.
                  </div>
                ) : (
                  state.notifications.map((n) => (
                    <div key={n.id} className="p-3.5 hover:bg-[#F8FAFC] transition-colors flex gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[#0F172A] truncate">{n.title}</p>
                          <span className="text-[10px] font-mono text-[#475569] shrink-0">
                            {n.time}
                          </span>
                        </div>
                        <p className="text-xs text-[#475569] mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifDrawer(false);
            }}
            aria-label="Menu pengguna"
            className="flex items-center gap-2 px-2 py-1 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] hover:bg-[#073E7F] transition-colors duration-150 ease-out text-xs cursor-pointer"
          >
            <div className="w-5 h-5 rounded-[6px] bg-[#0A2547] text-white flex items-center justify-center font-bold text-[11px] border border-[#073E7F]">
              {currentUser.nama.charAt(0)}
            </div>
            <span className="hidden sm:inline font-medium text-white truncate max-w-[120px]">
              {currentUser.nama}
            </span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white text-[#0F172A] rounded-[10px] shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0] overflow-hidden z-50">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0F172A] truncate">
                    {currentUser.nama}
                  </span>
                  <span className="text-[11px] font-semibold text-[#073E7F] bg-[#F1F5F9] px-2 py-0.5 rounded-[6px] border border-[#E2E8F0] shrink-0">
                    {roleLabel}
                  </span>
                </div>
                <p className="text-[11px] text-[#475569] mt-0.5 truncate">
                  {currentUser.departemen || 'Operasional Bengkel'}
                </p>
                <p className="text-[11px] font-mono text-[#475569] mt-1 truncate">
                  ID: {currentUser.id} · {state.userLocation}
                </p>
              </div>

              <div className="p-3 space-y-2.5 text-xs">
                {!isMekanik && (
                  <div>
                    {isSheetsConnected ? (
                      <div className="p-2 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                        <div className="font-semibold text-[#059669]">Google Sheets aktif</div>
                        <div className="truncate text-[11px] font-mono text-[#475569] mt-0.5">
                          {sheetsUserEmail}
                        </div>
                        {onGoogleSignOut && (
                          <button
                            type="button"
                            onClick={() => {
                              onGoogleSignOut();
                              setShowUserMenu(false);
                            }}
                            className="mt-2 w-full py-1 text-xs text-[#DC2626] border border-[#E2E8F0] bg-white rounded-[6px] hover:bg-[#FEF2F2] font-medium"
                          >
                            Putus koneksi Google
                          </button>
                        )}
                      </div>
                    ) : (
                      onGoogleSignIn && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            onGoogleSignIn();
                            setShowUserMenu(false);
                          }}
                        >
                          Masuk akun Google
                        </Button>
                      )
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-[#E2E8F0]">
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  >
                    {t.domainTerms.logoutBtn}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
