import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LoginPage } from './components/auth/LoginPage';
import { FeatureAccessGuard } from './components/auth/FeatureAccessGuard';
import { AppLayout } from './components/layout/AppLayout';
import { NavTabId } from './components/layout/Sidebar';
import { GoogleSheetsModal } from './components/sheets/GoogleSheetsModal';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { initAuth, googleSignIn, logoutGoogle } from './services/firebaseAuth';
import { useWorkshopStore } from './services/workshopStore';
import {
  AuthUser,
  getStoredAuthSession,
  saveAuthSession,
  clearAuthSession,
  isFeatureAllowedForUser,
  verifyUserSession,
  syncUserAccessFromSheetRealTime
} from './services/authSession';
import { Role } from './types';
import { ToastProvider, toast } from './components/ui/Toast';

// Code-Split Enterprise Modules via React.lazy (Improves LCP & Initial Bundle Size)
const GlobalDashboard = lazy(() =>
  import('./components/dashboard/GlobalDashboard').then((m) => ({ default: m.GlobalDashboard }))
);
const FleetManagement = lazy(() =>
  import('./components/fleet/FleetManagement').then((m) => ({ default: m.FleetManagement }))
);
const TireManagement = lazy(() =>
  import('./components/tires/TireManagement').then((m) => ({ default: m.TireManagement }))
);
const WarehouseStock = lazy(() =>
  import('./components/tires/WarehouseStock').then((m) => ({ default: m.WarehouseStock }))
);
const ChassisChecklist = lazy(() =>
  import('./components/chassis/ChassisChecklist').then((m) => ({ default: m.ChassisChecklist }))
);
const WorkOrderPortal = lazy(() =>
  import('./components/workorder/WorkOrderPortal').then((m) => ({ default: m.WorkOrderPortal }))
);
const SparepartWarehouse = lazy(() =>
  import('./components/inventory/SparepartWarehouse').then((m) => ({
    default: m.SparepartWarehouse
  }))
);
const IncidentManagement = lazy(() =>
  import('./components/incidents/IncidentManagement').then((m) => ({
    default: m.IncidentManagement
  }))
);
const UserAccessManager = lazy(() =>
  import('./components/auth/UserAccessManager').then((m) => ({ default: m.UserAccessManager }))
);
const ProjectStructureView = lazy(() =>
  import('./components/architecture/ProjectStructureView').then((m) => ({
    default: m.ProjectStructureView
  }))
);

const VALID_TABS: NavTabId[] = [
  'dashboard',
  'fleet',
  'workorders',
  'tires',
  'warehouse-tires',
  'chassis-checklist',
  'inventory',
  'incidents',
  'user-access',
  'architecture'
];

const TAB_TITLES: Record<NavTabId, string> = {
  dashboard: 'Ringkasan Eksekutif | BMI Workshop Management',
  fleet: 'Manajemen Armada | BMI Workshop Management',
  workorders: 'Monitoring Work Order | BMI Workshop Management',
  tires: 'Manajemen Ban & Roda | BMI Workshop Management',
  'warehouse-tires': 'Stok Ban Gudang | BMI Workshop Management',
  'chassis-checklist': 'Ceklis 13 Titik Chassis | BMI Workshop Management',
  inventory: 'Gudang Suku Cadang | BMI Workshop Management',
  incidents: 'Laporan Insiden & Laka | BMI Workshop Management',
  'user-access': 'Manajemen Akses Pengguna | BMI Workshop Management',
  architecture: 'Arsitektur & Skema Sistem | BMI Workshop Management'
};

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 Menit Auto-Logout sesuai Indexx.txt

export default function App() {
  const { setRole, setPic, setLocation } = useWorkshopStore();

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    return getStoredAuthSession();
  });

  const [activeTab, setActiveTab] = useState<NavTabId>(() => {
    const hashTab = window.location.hash.replace('#', '') as NavTabId;
    if (VALID_TABS.includes(hashTab)) {
      return hashTab;
    }
    const saved = getStoredAuthSession();
    return saved?.role === 'MEKANIK' ? 'tires' : 'dashboard';
  });

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);

  // Sync URL Hash & Dynamic Document Title with activeTab
  useEffect(() => {
    if (!currentUser) {
      document.title = 'Login Portal | BMI Workshop Management';
      return;
    }
    document.title = TAB_TITLES[activeTab] || 'BMI Workshop Management';
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab, currentUser]);

  // Listen to browser Back/Forward hash navigation
  useEffect(() => {
    const onHashChange = () => {
      const hashTab = window.location.hash.replace('#', '') as NavTabId;
      if (VALID_TABS.includes(hashTab)) {
        setActiveTab(hashTab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync initial stored user with workshopStore
  useEffect(() => {
    if (currentUser) {
      setRole(currentUser.role);
      setPic(currentUser.nama);
      setLocation(currentUser.lokasi);

      if (!isFeatureAllowedForUser(currentUser, activeTab)) {
        const fallbackTab = (currentUser.allowedFeatures?.[0] as NavTabId) || 'tires';
        setActiveTab(fallbackTab);
      }
    }
  }, [currentUser]);

  // Refresh session permissions whenever Role Mapping or Sheet User Access is updated
  const refreshActiveSessionFromUserAccess = () => {
    if (!currentUser) return;
    const check = verifyUserSession(currentUser.nama, currentUser.roleRaw || currentUser.role);
    if (!check.valid || !check.syncedUser) {
      clearAuthSession();
      setCurrentUser(null);
      return;
    }
    const updatedUser: AuthUser = {
      ...currentUser,
      roleRaw: check.syncedUser.roleRaw,
      role: check.syncedUser.role,
      status: check.syncedUser.status,
      allowedFeatures: check.syncedUser.allowedFeatures
    };
    saveAuthSession(updatedUser);
    setCurrentUser(updatedUser);
    setRole(updatedUser.role);
  };

  // 15-Minute Idle Timeout & Real-Time Sheet 'User Access' Role Verification Heartbeat
  useEffect(() => {
    if (!currentUser) return;

    let idleTimer: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        clearAuthSession();
        setCurrentUser(null);
      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    // Sinkronisasi berkala dari Sheet 'User Access' & validasi verifyUserSession()
    const sessionCheckInterval = setInterval(async () => {
      await syncUserAccessFromSheetRealTime();
      refreshActiveSessionFromUserAccess();
    }, 30000);

    return () => {
      clearTimeout(idleTimer);
      clearInterval(sessionCheckInterval);
      events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [currentUser?.id, currentUser?.roleRaw]);

  // Initialize Google Workspace / Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setIsGoogleSignedIn(true);
        setGoogleUserEmail(user.email);
      },
      () => {
        setIsGoogleSignedIn(false);
        setGoogleUserEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setRole(user.role);
    setPic(user.nama);
    setLocation(user.lokasi);

    // Role-based landing destination sesuai enterPortal() & Role Mapping Sheet User Access
    if (user.role === 'MEKANIK') {
      setActiveTab('tires');
    } else if (isFeatureAllowedForUser(user, 'dashboard')) {
      setActiveTab('dashboard');
    } else {
      setActiveTab((user.allowedFeatures?.[0] as NavTabId) || 'workorders');
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
  };

  // Strict RBAC Tab Selection Guard
  const handleSelectTabGuarded = (tab: NavTabId) => {
    if (!currentUser) return;
    window.history.pushState(null, '', `#${tab}`);
    setActiveTab(tab);
  };

  const handleRoleSwitch = (_newRole: Role) => {
    // Dikunci sesuai Sheet User Access
  };

  const handleSignInGoogle = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setIsGoogleSignedIn(true);
        setGoogleUserEmail(res.user.email);
        await syncUserAccessFromSheetRealTime();
        toast.success('Berhasil masuk Google');
      }
    } catch (e: any) {
      toast.error('Gagal masuk Google: ' + (e.message || String(e)));
    }
  };

  const handleSignOutGoogle = async () => {
    await logoutGoogle();
    setIsGoogleSignedIn(false);
    setGoogleUserEmail(null);
  };

  // Auth Guard: Show Enterprise Login Page when not logged in
  if (!currentUser) {
    return (
      <ToastProvider>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </ToastProvider>
    );
  }

  const defaultAllowedTab: NavTabId =
    currentUser.role === 'MEKANIK'
      ? 'tires'
      : (currentUser.allowedFeatures?.[0] as NavTabId) || 'dashboard';

  return (
    <ToastProvider>
      <AppLayout
        activeTab={activeTab}
        onSelectTab={handleSelectTabGuarded}
        currentUser={currentUser}
        onLogout={handleLogout}
        onRoleSwitch={handleRoleSwitch}
        onOpenSheetsModal={() => {
          if (currentUser.role === 'SUPERVISOR') {
            setIsSheetsModalOpen(true);
          }
        }}
        isSheetsConnected={isGoogleSignedIn}
        sheetsUserEmail={googleUserEmail}
        onGoogleSignIn={handleSignInGoogle}
        onGoogleSignOut={handleSignOutGoogle}
      >
        <ErrorBoundary key={activeTab} moduleName={TAB_TITLES[activeTab]?.split('|')[0]?.trim()}>
          <Suspense
            fallback={
              <div className="p-8 bg-white border border-[#E2E8F0] rounded-[10px] flex flex-col items-center justify-center gap-2 text-xs text-[#475569]">
                <div className="w-5 h-5 border-2 border-[#0A2547] border-t-transparent rounded-full animate-spin" />
                <span>Memuat modul operasional...</span>
              </div>
            }
          >
            {activeTab === 'dashboard' && (
              <FeatureAccessGuard
                feature="dashboard"
                featureTitle="Dashboard & Parameter Servis 15.000 KM"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <GlobalDashboard
                  onNavigateToTab={(tabId) => handleSelectTabGuarded(tabId as NavTabId)}
                />
              </FeatureAccessGuard>
            )}

            {activeTab === 'fleet' && (
              <FeatureAccessGuard
                feature="fleet"
                featureTitle="Manajemen & Analisis Aset (Fleet Management)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <FleetManagement
                  onNavigateToTapRoda={() => {
                    handleSelectTabGuarded('tires');
                  }}
                />
              </FeatureAccessGuard>
            )}

            {activeTab === 'tires' && (
              <FeatureAccessGuard
                feature="tires"
                featureTitle="Manajemen Roda (Tap Roda & Matriks Sasis)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <TireManagement />
              </FeatureAccessGuard>
            )}

            {activeTab === 'warehouse-tires' && (
              <FeatureAccessGuard
                feature="warehouse-tires"
                featureTitle="Inventaris Gudang Ban (Proses Set Ready)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <WarehouseStock />
              </FeatureAccessGuard>
            )}

            {activeTab === 'chassis-checklist' && (
              <FeatureAccessGuard
                feature="chassis-checklist"
                featureTitle="Inspeksi Armada (Ceklis 13 Titik Sasis)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <ChassisChecklist />
              </FeatureAccessGuard>
            )}

            {activeTab === 'workorders' && (
              <FeatureAccessGuard
                feature="workorders"
                featureTitle="Eksekusi & Monitoring Work Order"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <WorkOrderPortal />
              </FeatureAccessGuard>
            )}

            {activeTab === 'inventory' && (
              <FeatureAccessGuard
                feature="inventory"
                featureTitle="Kontrol Inventaris & Persetujuan Suku Cadang (Inventory)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <SparepartWarehouse />
              </FeatureAccessGuard>
            )}

            {activeTab === 'incidents' && (
              <FeatureAccessGuard
                feature="incidents"
                featureTitle="Manajemen Insiden (Laka) & Klaim Asuransi"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <IncidentManagement />
              </FeatureAccessGuard>
            )}

            {activeTab === 'user-access' && (
              <FeatureAccessGuard
                feature="user-access"
                featureTitle="Manajemen Hak Akses (Sheet User Access)"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <UserAccessManager
                  isSheetsConnected={isGoogleSignedIn}
                  onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
                  onRoleMappingsUpdated={refreshActiveSessionFromUserAccess}
                />
              </FeatureAccessGuard>
            )}

            {activeTab === 'architecture' && (
              <FeatureAccessGuard
                feature="architecture"
                featureTitle="Struktur Proyek & Skema Database"
                currentUser={currentUser}
                onRedirectBack={() => setActiveTab(defaultAllowedTab)}
              >
                <ProjectStructureView />
              </FeatureAccessGuard>
            )}
          </Suspense>
        </ErrorBoundary>
      </AppLayout>

      {/* Google Sheets Extractor & Sync Modal */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => {
          setIsSheetsModalOpen(false);
          refreshActiveSessionFromUserAccess();
        }}
        isLoggedIn={isGoogleSignedIn}
        userEmail={googleUserEmail}
        onSignIn={handleSignInGoogle}
      />
    </ToastProvider>
  );
}
