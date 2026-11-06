import React from 'react';
import {
  LayoutDashboard,
  CircleDot,
  Layers,
  CheckCircle2,
  Wrench,
  Truck,
  Package,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { NavTabId } from './Sidebar';
import { Role } from '../../types';
import { getStoredAuthSession, isFeatureAllowedForUser } from '../../services/authSession';

interface MobileNavProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  userRole: Role;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onSelectTab,
  userRole
}) => {
  const activeUser = getStoredAuthSession();

  // Portal Lapangan (Mekanik)
  const allMechanicItems: { id: NavTabId; label: string; icon: React.ElementType }[] = [
    { id: 'tires', label: 'Posisi ban', icon: CircleDot },
    { id: 'warehouse-tires', label: 'Stok gudang', icon: Layers },
    { id: 'chassis-checklist', label: 'Cek sasis', icon: CheckCircle2 },
    { id: 'workorders', label: 'Work order', icon: Wrench }
  ];
  const mechanicItems = allMechanicItems.filter((item) =>
    isFeatureAllowedForUser(activeUser, item.id)
  );

  // Portal Supervisor
  const allSupervisorItems: { id: NavTabId; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dasbor', icon: LayoutDashboard },
    { id: 'workorders', label: 'Work order', icon: Wrench },
    { id: 'incidents', label: 'Insiden', icon: ShieldAlert },
    { id: 'inventory', label: 'Suku cadang', icon: Package },
    { id: 'fleet', label: 'Armada', icon: Truck },
    { id: 'user-access', label: 'Hak akses', icon: ShieldCheck }
  ];
  const supervisorItems = allSupervisorItems.filter((item) =>
    isFeatureAllowedForUser(activeUser, item.id)
  );

  const items = userRole === 'MEKANIK' ? mechanicItems : supervisorItems;

  return (
    <nav
      aria-label="Navigasi utama mobile"
      className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-[#0A2547] border-t border-[#073E7F] z-40 px-1.5 flex items-center justify-around"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center min-h-[44px] min-w-[52px] px-2 py-1 rounded-[6px] transition-colors duration-150 ease-out cursor-pointer whitespace-nowrap shrink-0 ${
              isActive
                ? 'text-white bg-[#073E7F]'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#073E7F]/40'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-[#D19F0F]' : 'text-[#94A3B8]'}`} />
            <span className="text-[10px] font-medium mt-0.5 tracking-tight whitespace-nowrap">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
