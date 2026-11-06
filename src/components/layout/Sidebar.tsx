import React from 'react';
import {
  LayoutDashboard,
  Truck,
  CircleDot,
  Layers,
  CheckCircle2,
  Wrench,
  Package,
  ShieldAlert,
  FileSpreadsheet,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
  Server,
  X
} from 'lucide-react';
import { Role } from '../../types';
import { getStoredAuthSession, isFeatureAllowedForUser } from '../../services/authSession';
import { useLocaleStore } from '../../i18n/localeStore';

export type NavTabId =
  | 'dashboard'
  | 'fleet'
  | 'tires'
  | 'warehouse-tires'
  | 'chassis-checklist'
  | 'workorders'
  | 'inventory'
  | 'incidents'
  | 'user-access'
  | 'architecture';

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  userRole: Role;
  activeWoCount: number;
  pendingPartCount: number;
  unreadyTireCount: number;
  onOpenSheetsModal: () => void;
  isSheetsConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  userRole,
  activeWoCount,
  pendingPartCount,
  unreadyTireCount,
  onOpenSheetsModal,
  isSheetsConnected
}) => {
  const activeUser = getStoredAuthSession();
  const { t } = useLocaleStore();

  // 1. Menu Portal Supervisor / Service Advisor
  const supervisorNavItems = [
    {
      id: 'dashboard' as NavTabId,
      label: t.tabs.dashboard,
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'workorders' as NavTabId,
      label: t.tabs.workorders,
      icon: Wrench,
      badge: activeWoCount > 0 ? activeWoCount : null
    },
    {
      id: 'incidents' as NavTabId,
      label: t.tabs.incidents,
      icon: ShieldAlert,
      badge: null
    },
    {
      id: 'inventory' as NavTabId,
      label: t.tabs.inventory,
      icon: Package,
      badge: pendingPartCount > 0 ? pendingPartCount : null
    },
    {
      id: 'fleet' as NavTabId,
      label: t.tabs.fleet,
      icon: Truck,
      badge: null
    },
    {
      id: 'user-access' as NavTabId,
      label: t.tabs['user-access'],
      icon: ShieldCheck,
      badge: null
    },
    {
      id: 'architecture' as NavTabId,
      label: t.tabs.architecture,
      icon: Server,
      badge: null
    }
  ].filter((item) => isFeatureAllowedForUser(activeUser, item.id));

  // 2. Menu Portal Teknisi / Lapangan
  const technicianNavItems = [
    {
      id: 'tires' as NavTabId,
      label: t.tabs.tires,
      icon: CircleDot,
      badge: null
    },
    {
      id: 'warehouse-tires' as NavTabId,
      label: t.tabs['warehouse-tires'],
      icon: Layers,
      badge: unreadyTireCount > 0 ? unreadyTireCount : null
    },
    {
      id: 'chassis-checklist' as NavTabId,
      label: t.tabs['chassis-checklist'],
      icon: CheckCircle2,
      badge: null
    },
    {
      id: 'workorders' as NavTabId,
      label: t.tabs.workorders,
      icon: Wrench,
      badge: activeWoCount > 0 ? activeWoCount : null
    }
  ].filter((item) => isFeatureAllowedForUser(activeUser, item.id));

  // Menu Operasional Tambahan untuk Supervisor
  const supervisorFieldItems = [
    {
      id: 'tires' as NavTabId,
      label: t.tabs.tires,
      icon: CircleDot,
      badge: null
    },
    {
      id: 'warehouse-tires' as NavTabId,
      label: t.tabs['warehouse-tires'],
      icon: Layers,
      badge: unreadyTireCount > 0 ? unreadyTireCount : null
    },
    {
      id: 'chassis-checklist' as NavTabId,
      label: t.tabs['chassis-checklist'],
      icon: CheckCircle2,
      badge: null
    }
  ].filter((item) => isFeatureAllowedForUser(activeUser, item.id));

  const sections =
    userRole === 'MEKANIK'
      ? [{ title: t.navSections.technicianOps, items: technicianNavItems }]
      : [
          { title: t.navSections.mainManagement, items: supervisorNavItems },
          { title: t.navSections.fleetInspection, items: supervisorFieldItems }
        ].filter((sec) => sec.items.length > 0);

  const showCollapsedDesktop = isCollapsed && !isMobileOpen;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0A2547]/60 md:hidden bmi-modal-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${
          isMobileOpen ? 'fixed inset-y-0 left-0 z-50 flex w-64' : 'hidden md:flex'
        } flex-col sticky top-0 h-screen ${
          showCollapsedDesktop ? 'w-16' : 'w-64'
        } bg-[#0A2547] text-white border-r border-[#073E7F] shrink-0 select-none transition-[width] duration-150 ease-out z-40`}
      >
        {/* Brand & Toggle Header */}
        <div className="h-14 px-3 border-b border-[#073E7F] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white rounded-[6px] p-1 flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/logo-bmi_9490acc1.png"
                alt="Logo BMI"
                className="h-5 w-auto object-contain"
              />
            </div>
            {!showCollapsedDesktop && (
              <div className="truncate">
                <div className="text-xs font-bold text-white tracking-tight truncate leading-tight">
                  {t.brandTitle}
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate leading-tight">
                  {t.brandSubtitle}
                </div>
              </div>
            )}
          </div>

          {/* Toggle Button for Desktop or Close on Mobile */}
          {isMobileOpen ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Tutup menu samping"
              className="p-1.5 rounded-[6px] text-[#94A3B8] hover:text-white hover:bg-[#073E7F] transition-colors duration-150 ease-out md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={showCollapsedDesktop ? 'Bentangkan menu samping' : 'Ciutkan menu samping'}
              title={showCollapsedDesktop ? 'Bentangkan menu' : 'Ciutkan menu'}
              className="p-1.5 rounded-[6px] text-[#94A3B8] hover:text-white hover:bg-[#073E7F] transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            >
              {showCollapsedDesktop ? (
                <PanelLeftOpen className="w-4 h-4 text-white" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Role Access Indicator */}
        <div className="px-2.5 pt-3 shrink-0">
          {!showCollapsedDesktop ? (
            <div className="px-2.5 py-1.5 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] text-xs flex items-center justify-between text-white">
              <div className="flex items-center gap-1.5 font-medium truncate">
                <Lock className="w-3.5 h-3.5 text-[#D19F0F] shrink-0" />
                <span className="truncate">{activeUser?.roleRaw || userRole}</span>
              </div>
              <span className="text-[11px] text-[#94A3B8]">RBAC</span>
            </div>
          ) : (
            <div
              className="flex items-center justify-center p-1.5 rounded-[6px] bg-[#073E7F]/60 border border-[#073E7F] text-[#D19F0F]"
              title={`Peran: ${activeUser?.roleRaw || userRole}`}
            >
              <Lock className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5" aria-label="Menu navigasi">
          {sections.map((section) => (
            <div key={section.title} className="space-y-1">
              {!showCollapsedDesktop && (
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {section.title}
                </div>
              )}

              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobile?.();
                    }}
                    title={showCollapsedDesktop ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center ${
                      showCollapsedDesktop
                        ? 'justify-center px-2 py-2'
                        : 'justify-between gap-2.5 px-2.5 py-2'
                    } rounded-[6px] text-sm transition-colors duration-150 ease-out cursor-pointer ${
                      isActive
                        ? 'bg-[#073E7F] text-white font-semibold'
                        : 'text-[#94A3B8] font-normal hover:bg-[#073E7F]/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#D19F0F]' : 'text-[#94A3B8]'
                        }`}
                      />
                      {!showCollapsedDesktop && (
                        <span className="truncate text-xs">{item.label}</span>
                      )}
                    </div>

                    {!showCollapsedDesktop && item.badge !== null && (
                      <span className="font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-[6px] font-medium bg-[#0A2547] border border-[#073E7F] text-white shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Sheet Sync Action */}
        <div className="p-2 border-t border-[#073E7F] shrink-0">
          {userRole === 'SUPERVISOR' && (
            <button
              type="button"
              onClick={() => {
                onOpenSheetsModal();
                onCloseMobile?.();
              }}
              title={showCollapsedDesktop ? 'Sinkronisasi sheet' : undefined}
              className={`w-full flex items-center ${
                showCollapsedDesktop ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
              } rounded-[6px] text-xs font-medium border border-[#073E7F] transition-colors duration-150 ease-out cursor-pointer ${
                isSheetsConnected
                  ? 'bg-[#073E7F]/50 text-white hover:bg-[#073E7F]'
                  : 'bg-transparent text-[#94A3B8] hover:bg-[#073E7F]/40 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-[#059669] shrink-0" />
              {!showCollapsedDesktop && (
                <div className="text-left truncate flex-1 leading-tight">
                  <div className="font-semibold truncate">
                    {isSheetsConnected ? 'Sheet terhubung' : 'Sinkronisasi data'}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] truncate">Google Sheets</div>
                </div>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
