import React, { useState } from 'react';
import { Sidebar, NavTabId } from './Sidebar';
import { TopHeader } from './TopHeader';
import { MobileNav } from './MobileNav';
import { AuthUser } from '../../services/authSession';
import { useWorkshopStore } from '../../services/workshopStore';
import { Role } from '../../types';
import { ReportToast, ReportHistoryModal } from '../common/ReportToast';
import { ExportCsvModal } from '../common/ExportCsvModal';

interface AppLayoutProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  currentUser: AuthUser;
  onLogout: () => void;
  onRoleSwitch: (role: Role) => void;
  onOpenSheetsModal: () => void;
  isSheetsConnected: boolean;
  sheetsUserEmail: string | null;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  onLogout,
  onRoleSwitch,
  onOpenSheetsModal,
  isSheetsConnected,
  sheetsUserEmail,
  onGoogleSignIn,
  onGoogleSignOut,
  children
}) => {
  const { state } = useWorkshopStore();
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [isExportCsvOpen, setIsExportCsvOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bmi_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsMobileDrawerOpen((prev) => !prev);
      return;
    }

    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('bmi_sidebar_collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const activeWoCount = state.workOrders.filter(
    (wo) => wo.status !== 'COMPLETED & RELEASED' && wo.status !== 'CANCELLED'
  ).length;

  const pendingPartCount = state.partRequests.filter(
    (p) => p.status === 'Menunggu Approval Supervisor'
  ).length;

  const unreadyTireCount = state.tires.filter(
    (t) =>
      t.statusKelayakan === 'Spare / Gudang' &&
      !t.catatanKondisi.toLowerCase().includes('ready')
  ).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex antialiased">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        isMobileOpen={isMobileDrawerOpen}
        onCloseMobile={() => setIsMobileDrawerOpen(false)}
        userRole={state.userRole}
        activeWoCount={activeWoCount}
        pendingPartCount={pendingPartCount}
        unreadyTireCount={unreadyTireCount}
        onOpenSheetsModal={onOpenSheetsModal}
        isSheetsConnected={isSheetsConnected}
      />

      {/* Right Column: TopHeader + Main Content + Footer */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeTab={activeTab}
          currentUser={currentUser}
          onLogout={onLogout}
          onRoleSwitch={onRoleSwitch}
          onOpenSheetsModal={onOpenSheetsModal}
          onOpenExportCsv={() => setIsExportCsvOpen(true)}
          onOpenReportHistory={() => setShowReportHistory(true)}
          isSheetsConnected={isSheetsConnected}
          sheetsUserEmail={sheetsUserEmail}
          onGoogleSignIn={onGoogleSignIn}
          onGoogleSignOut={onGoogleSignOut}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />

        {/* Content Area */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-8">
          {children}
        </main>

        {/* Enterprise Footer */}
        <footer className="hidden md:block bg-white border-t border-[#E2E8F0] py-3.5 px-6 text-xs text-[#475569]">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#0F172A]">
                Sistem Manajemen Bengkel BMI
              </span>
              <span aria-hidden="true">·</span>
              <span>PT Bumi Menara Internusa</span>
              <span aria-hidden="true">·</span>
              <span>Pool Surabaya, Lamongan, Dampit</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenSheetsModal}
                className="font-medium text-[#073E7F] hover:underline cursor-pointer"
              >
                Sinkronisasi data cloud
              </button>
            </div>
          </div>
        </footer>

        {/* Mobile Navigation */}
        <MobileNav
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          userRole={state.userRole}
        />
      </div>

      {/* Floating Report Log & Modal */}
      <ReportToast />
      <ReportHistoryModal
        isOpen={showReportHistory}
        onClose={() => setShowReportHistory(false)}
      />

      {/* Advanced CSV Export Modal */}
      <ExportCsvModal
        isOpen={isExportCsvOpen}
        onClose={() => setIsExportCsvOpen(false)}
      />
    </div>
  );
};
