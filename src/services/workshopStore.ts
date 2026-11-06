import { useState, useEffect } from 'react';
import {
  TruckAsset,
  ChassisAsset,
  GensetAsset,
  TireAsset,
  WorkOrder,
  MasterPart,
  PartRequest,
  IncidentReport,
  NotificationItem,
  Role,
  PoolLocation,
  WOStatus
} from '../types';
import {
  INITIAL_TRUCKS,
  INITIAL_CHASSIS,
  INITIAL_GENSETS,
  INITIAL_TIRES,
  INITIAL_WORK_ORDERS,
  INITIAL_PARTS,
  INITIAL_PART_REQUESTS,
  INITIAL_INCIDENTS,
  INITIAL_NOTIFICATIONS
} from './initialData';

import {
  MaintenanceParameter,
  ComponentHealthStatus
} from '../types';
import {
  DEFAULT_MAINTENANCE_PARAMETERS,
  evaluateTruckRoutineService,
  evaluateTruckComponents,
  buildAutoWorkOrderDraft,
  ROUTINE_SERVICE_INTERVAL_KM,
  ComponentReplacementLog
} from './maintenanceEngine';
import {
  getStoredAuthSession,
  isFeatureAllowedForUser,
  FeaturePermissionKey,
  getAuthHeaders,
  getAuthSessionToken
} from './authSession';
import {
  fetchAllLiveSheetsPublic,
  DEFAULT_BMI_SPREADSHEET_ID,
  normalizeUnitId,
  cleanNumeric
} from './liveSheetSync';
import {
  standardizeTruckLambungList,
  standardizeGensetIdList
} from './autoIdGenerator';
import {
  saveStateToIndexedDb,
  loadStateFromIndexedDb
} from './indexedDbStorage';
import {
  isPortfolioDemoMode,
  DEMO_SAFE_TRUCKS,
  DEMO_SAFE_CHASSIS,
  DEMO_SAFE_GENSETS,
  DEMO_SAFE_TIRES,
  DEMO_SAFE_WORK_ORDERS,
  DEMO_SAFE_PARTS,
  DEMO_SAFE_PART_REQUESTS,
  DEMO_SAFE_INCIDENTS
} from './demoSeedData';

const STORAGE_KEY_PREFIX = 'bmi_workshop_state_';
const CURRENT_STORAGE_VERSION = 'v6';

/**
 * Validasi otorisasi ketat di level Store (Data Mutation Guard)
 * Memastikan aksi seperti Fleet Management ('fleet') atau Inventory ('inventory')
 * hanya dapat dieksekusi jika Role pengguna di Sheet 'User Access' mengizinkan.
 */
function assertStorePermission(feature: FeaturePermissionKey, actionLabel: string): void {
  const session = getStoredAuthSession();
  if (!session) {
    throw new Error(`Akses Ditolak (401): Sesi belum terautentikasi untuk menjalankan "${actionLabel}".`);
  }
  if (!isFeatureAllowedForUser(session, feature)) {
    throw new Error(
      `Akses Ditolak (403): Role "${session.roleRaw || session.role}" pada Sheet 'User Access' tidak diizinkan untuk "${actionLabel}" (modul: ${feature}).`
    );
  }
}

interface WorkshopState {
  trucks: TruckAsset[];
  chassis: ChassisAsset[];
  gensets: GensetAsset[];
  tires: TireAsset[];
  workOrders: WorkOrder[];
  parts: MasterPart[];
  partRequests: PartRequest[];
  incidents: IncidentReport[];
  notifications: NotificationItem[];
  userRole: Role;
  userPic: string;
  userLocation: PoolLocation;
  lastSyncTime: string | null;
  maintenanceParameters: MaintenanceParameter[];
  componentLogs?: ComponentReplacementLog[];
}

function enrichTrucksWithPm(trucks: TruckAsset[]): TruckAsset[] {
  return trucks.map((t) => {
    const pm = evaluateTruckRoutineService(t, ROUTINE_SERVICE_INTERVAL_KM);
    return {
      ...t,
      kmServisBerikutnya: pm.kmServisBerikutnya,
      sisaKmServis: pm.sisaKmServis,
      statusPm: pm.statusPm
    };
  });
}

/**
 * Synchronize asset statuses (TRUK, CHASSIS, GENSET) with active Work Orders
 * so that if all Work Orders for a unit are COMPLETED & RELEASED or CANCELLED,
 * the unit's statusServis is guaranteed to be 'Selesai' (Siap Operasi).
 */
function reconcileAssetsWithWorkOrders(
  trucks: TruckAsset[],
  chassis: ChassisAsset[],
  gensets: GensetAsset[],
  workOrders: WorkOrder[]
): {
  trucks: TruckAsset[];
  chassis: ChassisAsset[];
  gensets: GensetAsset[];
} {
  const standardizedTrucks = standardizeTruckLambungList(trucks).trucks;
  const standardizedGensets = standardizeGensetIdList(gensets).gensets;

  const activeWoByUnit = new Map<string, WorkOrder>();
  workOrders.forEach((wo) => {
    if (wo.status !== 'COMPLETED & RELEASED' && wo.status !== 'CANCELLED') {
      const key = normalizeUnitId(wo.idUnit);
      if (key && !activeWoByUnit.has(key)) {
        activeWoByUnit.set(key, wo);
      }
    }
  });

  const mapWoStatusToAssetStatus = (
    woStatus: WOStatus
  ): 'Scheduled' | 'Arrived' | 'In Progress' | 'Selesai' => {
    if (woStatus === 'SCHEDULED') return 'Scheduled';
    if (woStatus === 'ARRIVED') return 'Arrived';
    if (woStatus === 'IN PROGRESS' || woStatus === 'WAITING PART' || woStatus === 'READY FOR QC') {
      return 'In Progress';
    }
    return 'Selesai';
  };

  const nextTrucks = standardizedTrucks.map((t) => {
    if (t.statusServis === 'AFKIR') return t;
    const activeWo = activeWoByUnit.get(normalizeUnitId(t.idUnit));
    if (activeWo) {
      return {
        ...t,
        statusServis: mapWoStatusToAssetStatus(activeWo.status),
        keluhan: activeWo.keluhan || t.keluhan,
        pic: activeWo.teknisi || t.pic
      };
    }
    return {
      ...t,
      statusServis: 'Selesai' as const
    };
  });

  const nextChassis = chassis.map((c) => {
    if (c.statusServis === 'AFKIR') return c;
    const activeWo = activeWoByUnit.get(normalizeUnitId(c.idUnit));
    if (activeWo) {
      return {
        ...c,
        statusServis: mapWoStatusToAssetStatus(activeWo.status),
        catatan: activeWo.keluhan || c.catatan,
        pic: activeWo.teknisi || c.pic
      };
    }
    return {
      ...c,
      statusServis: 'Selesai' as const
    };
  });

  const nextGensets = standardizedGensets.map((g) => {
    if (g.statusServis === 'AFKIR') return g;
    const activeWo = activeWoByUnit.get(normalizeUnitId(g.idUnit));
    if (activeWo) {
      return {
        ...g,
        statusServis: mapWoStatusToAssetStatus(activeWo.status),
        catatan: activeWo.keluhan || g.catatan,
        pic: activeWo.teknisi || g.pic
      };
    }
    return {
      ...g,
      statusServis: 'Selesai' as const
    };
  });

  return {
    trucks: enrichTrucksWithPm(nextTrucks),
    chassis: nextChassis,
    gensets: nextGensets
  };
}

const useDemoSeed = isPortfolioDemoMode();
const seedTrucks = useDemoSeed ? DEMO_SAFE_TRUCKS : INITIAL_TRUCKS;
const seedChassis = useDemoSeed ? DEMO_SAFE_CHASSIS : INITIAL_CHASSIS;
const seedGensets = useDemoSeed ? DEMO_SAFE_GENSETS : INITIAL_GENSETS;
const seedTires = useDemoSeed ? DEMO_SAFE_TIRES : INITIAL_TIRES;
const seedWorkOrders = useDemoSeed ? DEMO_SAFE_WORK_ORDERS : INITIAL_WORK_ORDERS;
const seedParts = useDemoSeed ? DEMO_SAFE_PARTS : INITIAL_PARTS;
const seedPartRequests = useDemoSeed ? DEMO_SAFE_PART_REQUESTS : INITIAL_PART_REQUESTS;
const seedIncidents = useDemoSeed ? DEMO_SAFE_INCIDENTS : INITIAL_INCIDENTS;

const initialReconciled = reconcileAssetsWithWorkOrders(
  seedTrucks,
  seedChassis,
  seedGensets,
  seedWorkOrders
);

const DEFAULT_STATE: WorkshopState = {
  trucks: initialReconciled.trucks,
  chassis: initialReconciled.chassis,
  gensets: initialReconciled.gensets,
  tires: seedTires,
  workOrders: seedWorkOrders,
  parts: seedParts,
  partRequests: seedPartRequests,
  incidents: seedIncidents,
  notifications: INITIAL_NOTIFICATIONS,
  userRole: 'SUPERVISOR',
  userPic: useDemoSeed ? 'Supervisor Demo' : 'Zidan Maulana',
  userLocation: 'BMI Surabaya',
  lastSyncTime: '2026-11-02 16:23:00',
  maintenanceParameters: DEFAULT_MAINTENANCE_PARAMETERS
};

function loadStoredState(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + CURRENT_STORAGE_VERSION);
    if (raw) {
      const parsed = JSON.parse(raw);
      const reconciled = reconcileAssetsWithWorkOrders(
        parsed.trucks || INITIAL_TRUCKS,
        parsed.chassis || INITIAL_CHASSIS,
        parsed.gensets || INITIAL_GENSETS,
        parsed.workOrders || INITIAL_WORK_ORDERS
      );
      const rawParams = parsed.maintenanceParameters;
      const isCorruptedParams =
        !Array.isArray(rawParams) ||
        rawParams.length > 40 ||
        rawParams.some(
          (p: any) =>
            !p ||
            !p.komponen ||
            /^(R0|RJ|R1|R2|B1|B2|Storage|Level \d|II\. AMBANG|PETUNJUK|CPK_)/i.test(p.komponen) ||
            p.komponen.toLowerCase().includes('ambang batas') ||
            (p.intervalKm && p.intervalKm < 1000)
        );

      return {
        ...DEFAULT_STATE,
        ...parsed,
        trucks: reconciled.trucks,
        chassis: reconciled.chassis,
        gensets: reconciled.gensets,
        maintenanceParameters: isCorruptedParams ? DEFAULT_MAINTENANCE_PARAMETERS : rawParams
      };
    }
  } catch (e) {
    console.error('Failed to parse stored workshop state', e);
  }
  return DEFAULT_STATE;
}

let globalState: WorkshopState = loadStoredState();
const listeners = new Set<(state: WorkshopState) => void>();
let hasAutoSyncedFromLiveSheet = false;
let hasHydratedFromIndexedDb = false;
let hasSyncedWithAuthenticatedServer = false;
let lastKnownServerVersion: number | undefined = undefined;
let localPersistenceTimer: ReturnType<typeof setTimeout> | null = null;
let serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

function mergeConcurrentListsById<T>(
  serverList: T[] | undefined,
  localList: T[],
  idSelector: (item: T) => string
): T[] {
  if (!Array.isArray(serverList) || serverList.length === 0) return localList;
  const mergedMap = new Map<string, T>();
  for (const sItem of serverList) {
    mergedMap.set(idSelector(sItem), sItem);
  }
  for (const lItem of localList) {
    mergedMap.set(idSelector(lItem), lItem);
  }
  return Array.from(mergedMap.values());
}

async function pullAndReconcileFromCompanyServer(): Promise<void> {
  const token = getAuthSessionToken();
  if (!token) return;
  try {
    const res = await fetch('/api/workshop/state', {
      headers: { ...getAuthHeaders() },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return;
    const serverData = await res.json();
    hasSyncedWithAuthenticatedServer = true;

    if (serverData && serverData.state && Array.isArray(serverData.state.trucks)) {
      const parsed = serverData.state;
      if (typeof serverData.stateVersion === 'number') {
        lastKnownServerVersion = serverData.stateVersion;
      }
      const reconciled = reconcileAssetsWithWorkOrders(
        parsed.trucks || DEFAULT_STATE.trucks,
        parsed.chassis || DEFAULT_STATE.chassis,
        parsed.gensets || DEFAULT_STATE.gensets,
        parsed.workOrders || DEFAULT_STATE.workOrders
      );
      globalState = {
        ...DEFAULT_STATE,
        ...parsed,
        trucks: reconciled.trucks,
        chassis: reconciled.chassis,
        gensets: reconciled.gensets,
        maintenanceParameters:
          parsed.maintenanceParameters && parsed.maintenanceParameters.length >= 20
            ? parsed.maintenanceParameters
            : DEFAULT_MAINTENANCE_PARAMETERS
      };
      try {
        localStorage.setItem(
          STORAGE_KEY_PREFIX + CURRENT_STORAGE_VERSION,
          JSON.stringify(globalState)
        );
      } catch {
        // Ignore localStorage quota warning
      }
      listeners.forEach((fn) => fn(globalState));
    } else {
      // Seed local company server database (.data/workshop-db.json) on first authenticated run
      const syncRes = await fetch('/api/workshop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ state: globalState, baseVersion: lastKnownServerVersion }),
        signal: AbortSignal.timeout(8000)
      });
      if (syncRes.ok) {
        const syncJson = await syncRes.json().catch(() => ({}));
        if (typeof syncJson.stateVersion === 'number') {
          lastKnownServerVersion = syncJson.stateVersion;
        }
      }
    }
  } catch {
    // Ignore if running in static preview without backend
  }
}

function notify() {
  listeners.forEach((fn) => fn(globalState));

  // Fase 2.4: Debounced (400ms) asynchronous persistence to IndexedDB + fallback localStorage
  if (localPersistenceTimer) clearTimeout(localPersistenceTimer);
  localPersistenceTimer = setTimeout(() => {
    const storageKey = STORAGE_KEY_PREFIX + CURRENT_STORAGE_VERSION;
    saveStateToIndexedDb(storageKey, globalState).catch(() => {});
    try {
      localStorage.setItem(storageKey, JSON.stringify(globalState));
    } catch (err) {
      console.warn('localStorage quota exceeded, state safely persisted in IndexedDB & server:', err);
    }
  }, 400);

  // Debounced authenticated sync with optimistic concurrency control (/api/workshop/sync)
  if (serverSyncTimer) clearTimeout(serverSyncTimer);
  serverSyncTimer = setTimeout(async () => {
    if (!getAuthSessionToken()) return;
    try {
      const res = await fetch('/api/workshop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          state: globalState,
          baseVersion: lastKnownServerVersion
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.stateVersion === 'number') {
          lastKnownServerVersion = data.stateVersion;
        }
      } else if (res.status === 409) {
        // Fase 1.6: Optimistic Concurrency Conflict Resolution — Merge concurrent records without losing work
        const conflictData = await res.json().catch(() => ({}));
        if (typeof conflictData.serverVersion === 'number') {
          lastKnownServerVersion = conflictData.serverVersion;
        }
        if (conflictData.state && typeof conflictData.state === 'object') {
          const sState = conflictData.state;
          const mergedWorkOrders = mergeConcurrentListsById(
            sState.workOrders,
            globalState.workOrders,
            (w) => w.woId
          );
          const mergedPartRequests = mergeConcurrentListsById(
            sState.partRequests,
            globalState.partRequests,
            (p) => p.txId
          );
          const mergedIncidents = mergeConcurrentListsById(
            sState.incidents,
            globalState.incidents,
            (i) => i.idLaka
          );
          const reconciled = reconcileAssetsWithWorkOrders(
            mergeConcurrentListsById(sState.trucks, globalState.trucks, (t) => t.idUnit),
            mergeConcurrentListsById(sState.chassis, globalState.chassis, (c) => c.idUnit),
            mergeConcurrentListsById(sState.gensets, globalState.gensets, (g) => g.idUnit),
            mergedWorkOrders
          );
          globalState = {
            ...globalState,
            trucks: reconciled.trucks,
            chassis: reconciled.chassis,
            gensets: reconciled.gensets,
            workOrders: mergedWorkOrders,
            partRequests: mergedPartRequests,
            incidents: mergedIncidents
          };
          listeners.forEach((fn) => fn(globalState));

          // Re-push merged state on top of latest server version
          const retryRes = await fetch('/api/workshop/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              state: globalState,
              baseVersion: lastKnownServerVersion
            }),
            signal: AbortSignal.timeout(8000)
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json().catch(() => ({}));
            if (typeof retryData.stateVersion === 'number') {
              lastKnownServerVersion = retryData.stateVersion;
            }
          }
        }
      }
    } catch {
      // Ignore if running in static preview without backend
    }
  }, 800);
}

export function useWorkshopStore() {
  const [state, setState] = useState<WorkshopState>(globalState);

  useEffect(() => {
    listeners.add(setState);
    if (!hasHydratedFromIndexedDb) {
      hasHydratedFromIndexedDb = true;
      const storageKey = STORAGE_KEY_PREFIX + CURRENT_STORAGE_VERSION;
      loadStateFromIndexedDb<WorkshopState>(storageKey)
        .then((idbState) => {
          if (idbState && Array.isArray(idbState.trucks) && idbState.trucks.length > 0) {
            const reconciled = reconcileAssetsWithWorkOrders(
              idbState.trucks,
              idbState.chassis || DEFAULT_STATE.chassis,
              idbState.gensets || DEFAULT_STATE.gensets,
              idbState.workOrders || DEFAULT_STATE.workOrders
            );
            globalState = {
              ...DEFAULT_STATE,
              ...idbState,
              trucks: reconciled.trucks,
              chassis: reconciled.chassis,
              gensets: reconciled.gensets
            };
            listeners.forEach((fn) => fn(globalState));
          }
        })
        .catch(() => {});
    }

    if (!hasAutoSyncedFromLiveSheet) {
      hasAutoSyncedFromLiveSheet = true;

      // 1. Check Local Company Server (/api/workshop/state) if authenticated
      pullAndReconcileFromCompanyServer();

      // 2. Fallback / initial sync with Live Google Sheets if no local override
      fetchAllLiveSheetsPublic(DEFAULT_BMI_SPREADSHEET_ID)
        .then((dataset) => {
          if (dataset.totalExtractedRows > 0) {
            const existingRaw = localStorage.getItem(STORAGE_KEY_PREFIX + CURRENT_STORAGE_VERSION);
            if (!existingRaw) {
              const nextWorkOrders =
                dataset.workOrders && dataset.workOrders.length > 0
                  ? dataset.workOrders
                  : globalState.workOrders;
              const reconciled = reconcileAssetsWithWorkOrders(
                dataset.trucks && dataset.trucks.length > 0 ? dataset.trucks : globalState.trucks,
                dataset.chassis && dataset.chassis.length > 0
                  ? dataset.chassis
                  : globalState.chassis,
                dataset.gensets && dataset.gensets.length > 0
                  ? dataset.gensets
                  : globalState.gensets,
                nextWorkOrders
              );
              globalState = {
                ...globalState,
                trucks: reconciled.trucks,
                chassis: reconciled.chassis,
                gensets: reconciled.gensets,
                tires:
                  dataset.tires && dataset.tires.length > 0 ? dataset.tires : globalState.tires,
                workOrders: nextWorkOrders,
                partRequests:
                  dataset.partRequests && dataset.partRequests.length > 0
                    ? dataset.partRequests
                    : globalState.partRequests,
                incidents:
                  dataset.incidents && dataset.incidents.length > 0
                    ? dataset.incidents
                    : globalState.incidents,
                maintenanceParameters:
                  dataset.parameters && dataset.parameters.length > 0
                    ? dataset.parameters
                    : globalState.maintenanceParameters,
                lastSyncTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
              };
              notify();
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // --- ACTIONS ---

  const setRole = (role: Role) => {
    globalState = {
      ...globalState,
      userRole: role
    };
    if (!hasSyncedWithAuthenticatedServer && getAuthSessionToken()) {
      pullAndReconcileFromCompanyServer();
    }
    notify();
  };

  const setLocation = (loc: PoolLocation) => {
    globalState = { ...globalState, userLocation: loc };
    notify();
  };

  const setPic = (name: string) => {
    globalState = { ...globalState, userPic: name };
    notify();
  };

  // --- WORK ORDERS ---
  const createWorkOrder = (payload: {
    kategori: 'TRUK' | 'CHASSIS' | 'GENSET';
    idUnit: string;
    jenisServis: string;
    tglRencana: string;
    teknisi: string;
    keluhan: string;
    prioritas: 'Normal' | 'Mendesak' | 'Darurat / Breakdown';
    odo?: number | string;
    tEst?: string;
    bay: 'Bay 1' | 'Bay 2' | 'Bay 3' | 'Bay 4' | 'Bay 5' | 'Bay 6';
  }) => {
    assertStorePermission('workorders.manage', 'Membuat Work Order Baru');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(globalState.workOrders.length + 1).padStart(3, '0');
    const newWo: WorkOrder = {
      woId: `WO-${dateStr}-${seq}`,
      kategori: payload.kategori,
      idUnit: payload.idUnit,
      jenisServis: payload.jenisServis,
      tglRencana: payload.tglRencana,
      teknisi: payload.teknisi,
      keluhan: payload.keluhan,
      status: 'SCHEDULED',
      prioritas: payload.prioritas,
      odo: payload.odo,
      tEst: payload.tEst,
      bay: payload.bay,
      pic: globalState.userPic
    };

    const nextWorkOrders = [newWo, ...globalState.workOrders];
    const reconciled = reconcileAssetsWithWorkOrders(
      globalState.trucks,
      globalState.chassis,
      globalState.gensets,
      nextWorkOrders
    );

    globalState = {
      ...globalState,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      workOrders: nextWorkOrders,
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title: 'Work Order Dijadwalkan',
          message: `${newWo.woId} untuk unit ${newWo.idUnit} telah dijadwalkan di ${newWo.bay}.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'wo',
          referenceId: newWo.woId
        },
        ...globalState.notifications
      ]
    };
    notify();
    return newWo;
  };

  const updateWorkOrderStatus = (
    woId: string,
    newStatus: WOStatus,
    extra?: { fotoBefore?: string; fotoAfter?: string }
  ) => {
    assertStorePermission('workorders', 'Update Status Work Order');
    if (newStatus === 'COMPLETED & RELEASED') {
      assertStorePermission('workorders.manage', 'Verifikasi & Rilis QC Work Order');
    }
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const woIndex = globalState.workOrders.findIndex((w) => w.woId === woId);
    if (woIndex === -1) throw new Error(`Work Order ${woId} tidak ditemukan.`);

    const currentWo = globalState.workOrders[woIndex];

    // v5.0 — Gate deterministik: foto BEFORE/AFTER & QC wajib sebelum transisi
    if (newStatus === 'IN PROGRESS' && !(extra?.fotoBefore || currentWo.fotoBefore)) {
      throw new Error('Foto BEFORE wajib diunggah sebelum Work Order masuk IN PROGRESS.');
    }
    if (newStatus === 'READY FOR QC' && !(extra?.fotoAfter || currentWo.fotoAfter)) {
      throw new Error('Foto AFTER wajib diunggah sebelum Work Order masuk READY FOR QC.');
    }
    if (newStatus === 'COMPLETED & RELEASED' && !currentWo.qcApproved) {
      throw new Error('QC belum disetujui. Work Order tidak dapat dirilis (wajib qcApproved = true).');
    }

    const updatedWo = { ...currentWo, status: newStatus };

    let nextTrucks = [...globalState.trucks];
    let nextChassis = [...globalState.chassis];
    let nextGensets = [...globalState.gensets];
    let nextTires = [...globalState.tires];
    let nextPartRequests = [...globalState.partRequests];

    if (newStatus === 'ARRIVED') {
      updatedWo.tArrived = nowStr;
    } else if (newStatus === 'IN PROGRESS') {
      if (!updatedWo.tMulai) updatedWo.tMulai = nowStr;
      if (extra?.fotoBefore) updatedWo.fotoBefore = extra.fotoBefore;
    } else if (newStatus === 'READY FOR QC') {
      updatedWo.tSelesai = nowStr;
      if (extra?.fotoAfter) updatedWo.fotoAfter = extra.fotoAfter;
    } else if (newStatus === 'COMPLETED & RELEASED') {
      updatedWo.tRilis = nowStr;
      if (!updatedWo.tSelesai) updatedWo.tSelesai = nowStr;

      // Calculate downtime
      if (updatedWo.tArrived) {
        const diffDays = Math.max(
          0.1,
          (new Date().getTime() - new Date(updatedWo.tArrived).getTime()) / (1000 * 3600 * 24)
        );
        updatedWo.downtime = Math.round(diffDays * 10) / 10;
        updatedWo.klasifikasi =
          updatedWo.downtime <= 3 ? 'Ringan' : updatedWo.downtime <= 5 ? 'Sedang' : 'Berat';
      }

      const normTarget = normalizeUnitId(currentWo.idUnit);
      const woOdo = cleanNumeric(currentWo.odo);
      const isPmOrRoutine =
        /pm|rutin|berkala|oli|filter|servis/i.test(currentWo.jenisServis) ||
        /pm|rutin|berkala|oli|filter/i.test(currentWo.keluhan || '');

      if (currentWo.kategori === 'TRUK') {
        nextTrucks = nextTrucks.map((t) => {
          if (normalizeUnitId(t.idUnit) !== normTarget) return t;
          const newKm = Math.max(t.kmSaatIni, woOdo || t.kmSaatIni);
          const deltaKm = Math.max(0, newKm - t.kmSaatIni);

          // Update installed tires KM tempuh if odometer increased
          if (deltaKm > 0) {
            nextTires = nextTires.map((b) =>
              normalizeUnitId(b.unitTerpasang) === normTarget &&
              b.statusKelayakan === 'Aktif Terpasang'
                ? { ...b, kmTempuh: (b.kmTempuh || 0) + deltaKm }
                : b
            );
          }

          // Update lastComponentService if PM/Routine or matching component keywords
          const nextLastComp = { ...(t.lastComponentService || {}) };
          if (isPmOrRoutine) {
            globalState.maintenanceParameters.forEach((p) => {
              const kw = p.komponen.toLowerCase();
              if (
                p.intervalKm <= 15000 ||
                (currentWo.keluhan && currentWo.keluhan.toLowerCase().includes(kw))
              ) {
                nextLastComp[p.id] = newKm;
              }
            });
          }

          return {
            ...t,
            kmSaatIni: newKm,
            kmServisTerakhir: isPmOrRoutine ? newKm : t.kmServisTerakhir,
            statusServis: 'Selesai',
            tglMulai: undefined,
            targetSelesai: nowStr.slice(0, 10),
            keluhan: `Selesai (${woId}): ${currentWo.jenisServis}`,
            lastComponentService: nextLastComp
          };
        });
      } else if (currentWo.kategori === 'CHASSIS') {
        nextChassis = nextChassis.map((c) =>
          normalizeUnitId(c.idUnit) === normTarget
            ? {
                ...c,
                statusServis: 'Selesai',
                tglMulai: undefined,
                targetSelesai: nowStr.slice(0, 10),
                catatan: `Selesai (${woId}): ${currentWo.keluhan || currentWo.jenisServis}`
              }
            : c
        );
      } else if (currentWo.kategori === 'GENSET') {
        nextGensets = nextGensets.map((g) => {
          if (normalizeUnitId(g.idUnit) !== normTarget) return g;
          const newHm = Math.max(g.jamKerja, woOdo || g.jamKerja);
          return {
            ...g,
            jamKerja: newHm,
            servisTerakhir: isPmOrRoutine ? newHm : g.servisTerakhir,
            statusServis: 'Selesai',
            tglMulai: undefined,
            targetSelesai: nowStr.slice(0, 10),
            catatan: `Selesai (${woId}): ${currentWo.keluhan || currentWo.jenisServis}`
          };
        });
      }

      // Auto-approve any pending part requests tied to this completed WO
      nextPartRequests = nextPartRequests.map((pr) =>
        pr.woId === woId && pr.status === 'Menunggu Approval Supervisor'
          ? { ...pr, status: 'Approved' }
          : pr
      );
    }

    const updatedList = [...globalState.workOrders];
    updatedList[woIndex] = updatedWo;

    const reconciled = reconcileAssetsWithWorkOrders(
      nextTrucks,
      nextChassis,
      nextGensets,
      updatedList
    );

    globalState = {
      ...globalState,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      tires: nextTires,
      partRequests: nextPartRequests,
      workOrders: updatedList,
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title:
            newStatus === 'COMPLETED & RELEASED'
              ? 'Work Order Selesai & Dirilis'
              : 'Update Status Work Order',
          message:
            newStatus === 'COMPLETED & RELEASED'
              ? `${woId} (${currentWo.idUnit}) telah selesai & dirilis. Status armada, odometer, dan jadwal servis otomatis diperbarui.`
              : `${woId} (${currentWo.idUnit}) diperbarui ke status ${newStatus}.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'wo',
          referenceId: woId
        },
        ...globalState.notifications
      ]
    };
    notify();
  };

  const updateWorkOrderDetails = (
    woId: string,
    payload: Partial<WorkOrder>
  ) => {
    assertStorePermission('workorders.manage', 'Mengubah Detail Work Order');
    const woIndex = globalState.workOrders.findIndex((w) => w.woId === woId);
    if (woIndex === -1) throw new Error(`Work Order ${woId} tidak ditemukan.`);

    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updatedWo: WorkOrder = {
      ...globalState.workOrders[woIndex],
      ...payload,
      terakhirDiubah: `${nowStr} oleh ${globalState.userPic}`
    };

    const updatedList = [...globalState.workOrders];
    updatedList[woIndex] = updatedWo;
    const reconciled = reconcileAssetsWithWorkOrders(
      globalState.trucks,
      globalState.chassis,
      globalState.gensets,
      updatedList
    );
    globalState = {
      ...globalState,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      workOrders: updatedList
    };
    notify();
  };

  const cancelWorkOrder = (woId: string, alasan: string) => {
    assertStorePermission('workorders.manage', 'Membatalkan / Menghapus Work Order');
    const woIndex = globalState.workOrders.findIndex((w) => w.woId === woId);
    if (woIndex === -1) throw new Error(`Work Order ${woId} tidak ditemukan.`);

    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updatedWo: WorkOrder = {
      ...globalState.workOrders[woIndex],
      status: 'CANCELLED',
      alasanHapus: alasan,
      terakhirDiubah: `${nowStr} oleh ${globalState.userPic} (Dibatalkan)`
    };

    const updatedList = [...globalState.workOrders];
    updatedList[woIndex] = updatedWo;
    const reconciled = reconcileAssetsWithWorkOrders(
      globalState.trucks,
      globalState.chassis,
      globalState.gensets,
      updatedList
    );
    globalState = {
      ...globalState,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      workOrders: updatedList
    };
    notify();
  };

  const updateAssetServiceStatus = (
    kategori: 'TRUK' | 'CHASSIS' | 'GENSET',
    idUnit: string,
    status: 'Selesai' | 'Scheduled' | 'In Progress' | 'Arrived' | 'AFKIR'
  ) => {
    const normId = normalizeUnitId(idUnit);
    if (kategori === 'TRUK') {
      globalState.trucks = globalState.trucks.map((t) =>
        normalizeUnitId(t.idUnit) === normId ? { ...t, statusServis: status } : t
      );
    } else if (kategori === 'CHASSIS') {
      globalState.chassis = globalState.chassis.map((c) =>
        normalizeUnitId(c.idUnit) === normId ? { ...c, statusServis: status } : c
      );
    } else if (kategori === 'GENSET') {
      globalState.gensets = globalState.gensets.map((g) =>
        normalizeUnitId(g.idUnit) === normId ? { ...g, statusServis: status } : g
      );
    }
  };

  // --- SPAREPART WAREHOUSE ---
  const requestSparepart = (payload: {
    woId: string;
    nopol: string;
    sku: string;
    namaPart: string;
    qty: number;
    hargaSatuan: number;
    mekanik: string;
  }) => {
    const total = payload.qty * payload.hargaSatuan;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const txId = `PART-TX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const newReq: PartRequest = {
      txId,
      ts: nowStr,
      woId: payload.woId,
      nopol: payload.nopol,
      sku: payload.sku || 'GENERAL-PART',
      namaPart: payload.namaPart,
      qty: payload.qty,
      hargaSatuan: payload.hargaSatuan,
      total,
      mekanik: payload.mekanik,
      status: 'Menunggu Approval Supervisor'
    };

    globalState = {
      ...globalState,
      partRequests: [newReq, ...globalState.partRequests],
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title: 'Permintaan Suku Cadang',
          message: `${payload.mekanik} meminta ${payload.qty} pcs ${payload.namaPart} untuk ${payload.nopol}.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'part',
          referenceId: txId
        },
        ...globalState.notifications
      ]
    };
    notify();
    return newReq;
  };

  const processPartApproval = (txId: string, action: 'Approved' | 'Rejected') => {
    assertStorePermission('inventory', 'Approval / Penolakan Permintaan Sparepart');
    const reqIndex = globalState.partRequests.findIndex((r) => r.txId === txId);
    if (reqIndex === -1) return;

    const req = globalState.partRequests[reqIndex];
    const updatedReq: PartRequest = { ...req, status: action };
    const updatedReqList = [...globalState.partRequests];
    updatedReqList[reqIndex] = updatedReq;

    // Auto-deduct stock if approved
    let updatedParts = [...globalState.parts];
    if (action === 'Approved') {
      updatedParts = updatedParts.map((p) => {
        if (p.sku === req.sku || p.nama.toLowerCase() === req.namaPart.toLowerCase()) {
          return { ...p, stok: Math.max(0, p.stok - req.qty) };
        }
        return p;
      });
    }

    globalState = {
      ...globalState,
      partRequests: updatedReqList,
      parts: updatedParts
    };
    notify();
  };

  const registerNewMasterPart = (part: MasterPart) => {
    assertStorePermission('inventory', 'Pendaftaran Master SKU Sparepart Baru');
    if (globalState.parts.some((p) => p.sku === part.sku)) {
      throw new Error(`SKU ${part.sku} sudah terdaftar.`);
    }
    globalState = {
      ...globalState,
      parts: [part, ...globalState.parts]
    };
    notify();
  };

  const processInboundPart = (sku: string, qty: number, totalInvoice: number) => {
    assertStorePermission('inventory', 'Restock Inbound Gudang Sparepart');
    const part = globalState.parts.find((p) => p.sku === sku);
    if (!part) throw new Error('SKU part tidak ditemukan.');

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const txId = `INB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const newReq: PartRequest = {
      txId,
      ts: nowStr,
      woId: 'RESTOCK',
      nopol: 'GUDANG',
      sku: part.sku,
      namaPart: part.nama,
      qty,
      hargaSatuan: totalInvoice > 0 ? Math.round(totalInvoice / qty) : part.harga,
      total: totalInvoice,
      mekanik: globalState.userPic,
      status: 'RESTOCK INBOUND'
    };

    globalState = {
      ...globalState,
      parts: globalState.parts.map((p) => (p.sku === sku ? { ...p, stok: p.stok + qty } : p)),
      partRequests: [newReq, ...globalState.partRequests]
    };
    notify();
  };

  // --- TIRE MATRIX & BLUEPRINT MUTATIONS ---
  const commitBatchTireMutation = (
    nopol: string,
    kmTruk: number,
    changes: {
      posisi: string;
      idBanLama: string;
      aksiBanLama: 'GUDANG' | 'SERVIS' | 'AFKIR';
      idBanBaru: string;
      pic: string;
    }[]
  ) => {
    assertStorePermission('tires', 'Mutasi Tap Roda / Tire Matrix');
    let updatedTires = [...globalState.tires];
    const normNopol = normalizeUnitId(nopol);
    const todayStr = new Date().toISOString().slice(0, 10);

    changes.forEach((ch) => {
      // 1. Handle old tire release
      if (ch.idBanLama) {
        let newTargetUnit = 'Gudang SBY';
        let newPos = 'GUDANG';
        let newStatus: TireAsset['statusKelayakan'] = 'Spare / Gudang';
        let newCatatan = 'Selesai mutasi & Belum Pasang Velg';

        if (ch.aksiBanLama === 'SERVIS') {
          newTargetUnit = 'Vendor Vulkanisir';
          newPos = 'VENDOR';
          newStatus = 'Histori (Terupdate)';
          newCatatan = 'Kirim ke vendor vulkanisir';
        } else if (ch.aksiBanLama === 'AFKIR') {
          newTargetUnit = 'AFKIR';
          newPos = 'AFKIR';
          newStatus = 'Afkir / Dibuang';
          newCatatan = 'Ban diafkir / scrap';
        }

        updatedTires = updatedTires.map((b) =>
          b.idBanFisik.toUpperCase() === ch.idBanLama.toUpperCase()
            ? {
                ...b,
                unitTerpasang: newTargetUnit,
                posisiRoda: newPos,
                statusKelayakan: newStatus,
                catatanKondisi: newCatatan,
                kmTempuh: (b.kmTempuh || 0) + (kmTruk > 0 ? Math.min(10000, Math.round(kmTruk * 0.01)) : 0)
              }
            : b
        );
      }

      // 2. Handle new tire installation
      if (ch.idBanBaru) {
        updatedTires = updatedTires.map((b) =>
          b.idBanFisik.toUpperCase() === ch.idBanBaru.toUpperCase()
            ? {
                ...b,
                unitTerpasang: normNopol,
                posisiRoda: ch.posisi.toUpperCase(),
                statusKelayakan: 'Aktif Terpasang',
                catatanKondisi: `Mutasi pasang ke ${normNopol} (${ch.posisi.toUpperCase()})`,
                tglMasuk: todayStr
              }
            : b
        );
      }
    });

    // Update truck odometer if specified and re-enrich PM
    let nextTrucks = [...globalState.trucks];
    if (kmTruk > 0) {
      nextTrucks = enrichTrucksWithPm(
        nextTrucks.map((t) =>
          normalizeUnitId(t.idUnit) === normNopol ? { ...t, kmSaatIni: Math.max(t.kmSaatIni, kmTruk) } : t
        )
      );
    }

    globalState = {
      ...globalState,
      trucks: nextTrucks,
      tires: updatedTires
    };
    notify();
  };

  const updateBanToReadyBatch = (idArray: string[]) => {
    assertStorePermission('warehouse-tires', 'Proses Set Ready Velg Ban Gudang');
    const idSet = new Set(idArray.map((x) => x.toUpperCase()));
    globalState = {
      ...globalState,
      tires: globalState.tires.map((b) =>
        idSet.has(b.idBanFisik.toUpperCase())
          ? {
              ...b,
              unitTerpasang: b.unitTerpasang.toUpperCase().includes('BENGKEL')
                ? 'Bengkel SBY'
                : 'Gudang SBY',
              posisiRoda: b.posisiRoda === 'BENGKEL' ? 'BENGKEL' : 'GUDANG',
              statusKelayakan: 'Spare / Gudang',
              catatanKondisi: 'Ready Pasang'
            }
          : b
      )
    };
    notify();
  };

  // --- INCIDENTS (LAKA) ---
  const submitIncidentReport = (incident: Omit<IncidentReport, 'idLaka' | 'timestamp'>) => {
    assertStorePermission('incidents', 'Pencatatan Laporan Insiden (Laka)');
    const idLaka = `LAKA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const newInc: IncidentReport = {
      ...incident,
      idLaka,
      timestamp: nowStr
    };

    globalState = {
      ...globalState,
      incidents: [newInc, ...globalState.incidents],
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title: 'Laporan Insiden (Laka)',
          message: `Insiden baru pada unit ${incident.idUnit} dicatat di ${incident.lokasi}.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'laka',
          referenceId: idLaka
        },
        ...globalState.notifications
      ]
    };
    notify();
  };

  const updateIncidentStatus = (
    idLaka: string,
    status: IncidentReport['status'],
    finalLoss?: number,
    dokumenUrl?: string
  ) => {
    assertStorePermission('incidents', 'Update Status Klaim Insiden (Laka)');
    globalState = {
      ...globalState,
      incidents: globalState.incidents.map((inc) =>
        inc.idLaka === idLaka
          ? {
              ...inc,
              status,
              kerugian: finalLoss !== undefined ? finalLoss : inc.kerugian,
              dokumen: dokumenUrl || inc.dokumen
            }
          : inc
      )
    };
    notify();
  };

  const deleteIncidentReport = (idLaka: string) => {
    assertStorePermission('incidents', 'Hapus Laporan Insiden (Laka)');
    globalState = {
      ...globalState,
      incidents: globalState.incidents.filter((inc) => inc.idLaka !== idLaka)
    };
    notify();
  };

  // --- ASSET MANAGEMENT ---
  const registerNewAssetBulk = (assets: any[]) => {
    assertStorePermission('fleet', 'Pendaftaran Aset Armada Baru (Fleet Management)');
    const newTrucks = [...globalState.trucks];
    const newChassis = [...globalState.chassis];
    const newGensets = [...globalState.gensets];
    const newTires = [...globalState.tires];

    assets.forEach((a) => {
      if (a.kategori === 'TRUK') {
        newTrucks.unshift({
          idUnit: normalizeUnitId(a.idUnit),
          noLambung: a.noLambung || `BMI-HTR${String(newTrucks.length + 1).padStart(3, '0')}`,
          jenisArmada: a.jenis || 'Head Truck',
          merkModel: a.merk || '',
          kmSaatIni: a.odo || 0,
          kmServisTerakhir: a.odo || 0,
          targetUkuranBan: a.targetUkuranBan || '1000',
          statusServis: 'Selesai',
          masaSTNK: a.stnk || '',
          masaPajak: a.pajak || a.stnk || '',
          kepemilikan: a.milik || 'BMI',
          vendorName: a.vendorName || ''
        });
      } else if (a.kategori === 'CHASSIS') {
        newChassis.unshift({
          idUnit: normalizeUnitId(a.idUnit),
          tipeChassis: a.jenis || 'Chassis 40ft (3 Axle)',
          targetUkuranBan: '1000',
          masaKIR: a.kir || '',
          statusKIR: a.statusKir || 'Aktif',
          statusMilik: a.milik === 'SEWA' ? 'Sewa / Vendor' : 'BMI',
          statusServis: 'Selesai',
          karoseri: a.karoseri || '',
          tahun: a.tahun || undefined,
          gvw: a.gvw || undefined,
          tare: a.tare || undefined,
          landingGear: a.landingGear || '',
          sistemRem: a.sistemRem || '',
          vin: a.vin || ''
        });
      } else if (a.kategori === 'GENSET') {
        newGensets.unshift({
          idUnit: a.idUnit,
          tipeGenset: a.jenis || 'Clip-On',
          merkKapasitas: a.merk || '',
          jamKerja: a.odo || 0,
          servisTerakhir: a.odo || 0,
          intervalServis: a.interval || 250,
          statusServis: 'Selesai'
        });
      } else if (a.kategori === 'BAN') {
        const siklus = a.siklus || 'R0';
        newTires.unshift({
          idSiklus: a.idSiklus || `${a.idUnit}${siklus}`,
          idBanFisik: a.idUnit,
          siklus,
          dot: a.dot || '',
          unitTerpasang: 'Gudang SBY',
          posisiRoda: 'GUDANG',
          merk: a.merk || '',
          ukuran: a.jenis || '1000',
          kmTempuh: 0,
          statusKelayakan: 'Spare / Gudang',
          catatanKondisi: 'Registrasi Ban Baru',
          tglMasuk: new Date().toISOString().slice(0, 10),
          konstruksi: a.konstruksi || 'Radial',
          harga: a.harga || 0,
          vendor: a.vendorName || ''
        });
      }
    });

    globalState = {
      ...globalState,
      trucks: enrichTrucksWithPm(newTrucks),
      chassis: newChassis,
      gensets: newGensets,
      tires: newTires
    };
    notify();
  };

  const afkirAsset = (idUnit: string, kategori: string) => {
    assertStorePermission('fleet', 'Afkir / Decommission Unit Armada (Fleet Management)');
    const normId = normalizeUnitId(idUnit);
    if (kategori === 'TRUK') {
      globalState.trucks = globalState.trucks.map((t) =>
        normalizeUnitId(t.idUnit) === normId ? { ...t, statusServis: 'AFKIR' } : t
      );
      // Auto release tires back to warehouse
      globalState.tires = globalState.tires.map((b) =>
        normalizeUnitId(b.unitTerpasang) === normId
          ? {
              ...b,
              unitTerpasang: 'Gudang SBY',
              posisiRoda: 'GUDANG',
              statusKelayakan: 'Spare / Gudang',
              catatanKondisi: 'Auto-release (Truk Diafkir/Dijual)'
            }
          : b
      );
    } else if (kategori === 'CHASSIS') {
      globalState.chassis = globalState.chassis.map((c) =>
        normalizeUnitId(c.idUnit) === normId ? { ...c, statusServis: 'AFKIR' } : c
      );
    } else if (kategori === 'GENSET') {
      globalState.gensets = globalState.gensets.map((g) =>
        normalizeUnitId(g.idUnit) === normId ? { ...g, statusServis: 'AFKIR' } : g
      );
    } else if (kategori === 'BAN') {
      globalState.tires = globalState.tires.map((b) =>
        b.idBanFisik.toUpperCase() === idUnit.toUpperCase()
          ? {
              ...b,
              unitTerpasang: 'AFKIR',
              posisiRoda: 'AFKIR',
              statusKelayakan: 'Afkir / Dibuang',
              catatanKondisi: 'Ban diafkir / scrap'
            }
          : b
      );
    }
    notify();
  };

  const markAllNotificationsRead = () => {
    globalState = {
      ...globalState,
      notifications: globalState.notifications.map((n) => ({ ...n, read: true }))
    };
    notify();
  };

  const setCustomMaintenanceParameters = (parameters: MaintenanceParameter[]) => {
    globalState = {
      ...globalState,
      maintenanceParameters: parameters,
      trucks: enrichTrucksWithPm(globalState.trucks)
    };
    notify();
  };

  const createAutoWorkOrderFromPm = (truckId: string) => {
    const normId = normalizeUnitId(truckId);
    const truck = globalState.trucks.find((t) => normalizeUnitId(t.idUnit) === normId);
    if (!truck) throw new Error(`Truk ${truckId} tidak ditemukan.`);

    const components = evaluateTruckComponents(truck, globalState.maintenanceParameters);
    const dueComponents = components.filter((c) => c.status === 'OVERDUE' || c.status === 'DUE_SOON');

    const draft = buildAutoWorkOrderDraft(truck, dueComponents, globalState.userPic);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(globalState.workOrders.length + 1).padStart(3, '0');
    const newWo: WorkOrder = {
      ...draft,
      woId: `WO-${dateStr}-${seq}`
    };

    // Update truck status
    updateAssetServiceStatus('TRUK', truck.idUnit, 'Scheduled');

    // Auto-create part requests for due components that have default SKU
    const newPartRequests: PartRequest[] = [];
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    dueComponents.forEach((comp, idx) => {
      if (comp.parameter.skuDefault) {
        const part = globalState.parts.find((p) => p.sku === comp.parameter.skuDefault);
        const harga = part ? part.harga : 150000;
        newPartRequests.push({
          txId: `PART-TX-${dateStr}-${Math.floor(100 + Math.random() * 900)}_${idx}`,
          ts: nowStr,
          woId: newWo.woId,
          nopol: truck.idUnit,
          sku: comp.parameter.skuDefault,
          namaPart: comp.parameter.namaPartDefault || comp.parameter.komponen,
          qty: 1,
          hargaSatuan: harga,
          total: harga,
          mekanik: 'Mekanik On-Duty',
          status: 'Menunggu Approval Supervisor'
        });
      }
    });

    globalState = {
      ...globalState,
      workOrders: [newWo, ...globalState.workOrders],
      partRequests: [...newPartRequests, ...globalState.partRequests],
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title: 'Auto Work Order Servis Berkala',
          message: `${newWo.woId} dibuat otomatis untuk unit ${truck.idUnit} (${newWo.jenisServis}).`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'pm',
          referenceId: newWo.woId
        },
        ...globalState.notifications
      ]
    };
    notify();
    return newWo;
  };

  const syncFromGoogleSheetsData = (imported: {
    trucks?: TruckAsset[];
    chassis?: ChassisAsset[];
    gensets?: GensetAsset[];
    tires?: TireAsset[];
    workOrders?: WorkOrder[];
    parts?: MasterPart[];
    partRequests?: PartRequest[];
    incidents?: IncidentReport[];
    parameters?: MaintenanceParameter[];
  }) => {
    const nextWorkOrders =
      imported.workOrders && imported.workOrders.length
        ? imported.workOrders
        : globalState.workOrders;
    const rawTrucks =
      imported.trucks && imported.trucks.length ? imported.trucks : globalState.trucks;
    const rawChassis =
      imported.chassis && imported.chassis.length ? imported.chassis : globalState.chassis;
    const rawGensets =
      imported.gensets && imported.gensets.length ? imported.gensets : globalState.gensets;

    const reconciled = reconcileAssetsWithWorkOrders(
      rawTrucks,
      rawChassis,
      rawGensets,
      nextWorkOrders
    );
    const finalTrucks = reconciled.trucks;
    const finalParams =
      imported.parameters && imported.parameters.length
        ? imported.parameters
        : globalState.maintenanceParameters;

    // Check for any overdue or due soon trucks to generate system alert notifications
    const newPmNotifications: NotificationItem[] = [];
    finalTrucks.forEach((t) => {
      if (t.statusPm === 'OVERDUE') {
        newPmNotifications.push({
          id: `pm-overdue-${t.idUnit}-${Date.now()}`,
          title: 'Servis Berkala Lewat Batas (Overdue)',
          message: `Unit ${t.idUnit} telah melewati jadwal servis 15.000 KM (KM saat ini: ${t.kmSaatIni.toLocaleString('id-ID')}). Segera jadwalkan pengerjaan.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'pm',
          referenceId: t.idUnit
        });
      } else if (t.statusPm === 'DUE_SOON') {
        newPmNotifications.push({
          id: `pm-duesoon-${t.idUnit}-${Date.now()}`,
          title: 'Servis Berkala Mendekati Batas',
          message: `Unit ${t.idUnit} tersisa ${t.sisaKmServis?.toLocaleString('id-ID')} KM lagi menuju jadwal servis 15.000 KM.`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type: 'pm',
          referenceId: t.idUnit
        });
      }
    });

    globalState = {
      ...globalState,
      trucks: finalTrucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      tires: imported.tires && imported.tires.length ? imported.tires : globalState.tires,
      workOrders: nextWorkOrders,
      parts: imported.parts && imported.parts.length ? imported.parts : globalState.parts,
      partRequests:
        imported.partRequests && imported.partRequests.length
          ? imported.partRequests
          : globalState.partRequests,
      incidents:
        imported.incidents && imported.incidents.length
          ? imported.incidents
          : globalState.incidents,
      maintenanceParameters: finalParams,
      notifications: [...newPmNotifications, ...globalState.notifications],
      lastSyncTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    notify();
  };

  const resetToInitialDefaults = () => {
    const reconciled = reconcileAssetsWithWorkOrders(
      INITIAL_TRUCKS,
      INITIAL_CHASSIS,
      INITIAL_GENSETS,
      INITIAL_WORK_ORDERS
    );
    globalState = {
      ...DEFAULT_STATE,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      lastSyncTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    notify();
  };

  const syncWithCompanyServer = async (): Promise<{ ok: boolean; updatedAt?: string }> => {
    try {
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      globalState = { ...globalState, lastSyncTime: nowStr };
      const res = await fetch('/api/workshop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          state: globalState,
          baseVersion: lastKnownServerVersion
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      if (typeof data.stateVersion === 'number') {
        lastKnownServerVersion = data.stateVersion;
      }
      notify();
      return { ok: true, updatedAt: data.updatedAt || nowStr };
    } catch {
      return { ok: false };
    }
  };

  const exportWorkshopSnapshot = (): string => {
    return JSON.stringify(
      {
        version: '3.0.0-enterprise',
        exportedAt: new Date().toISOString(),
        state: globalState
      },
      null,
      2
    );
  };

  const importWorkshopSnapshot = (rawJson: string): void => {
    assertStorePermission('fleet', 'Import / Restore Backup Database Server');
    const parsedPayload = JSON.parse(rawJson);
    const candidateState = parsedPayload.state ? parsedPayload.state : parsedPayload;
    if (!candidateState || !Array.isArray(candidateState.trucks)) {
      throw new Error('Format file backup JSON tidak valid (tidak ditemukan data armada truk).');
    }

    const reconciled = reconcileAssetsWithWorkOrders(
      candidateState.trucks || DEFAULT_STATE.trucks,
      candidateState.chassis || DEFAULT_STATE.chassis,
      candidateState.gensets || DEFAULT_STATE.gensets,
      candidateState.workOrders || DEFAULT_STATE.workOrders
    );

    globalState = {
      ...DEFAULT_STATE,
      ...candidateState,
      trucks: reconciled.trucks,
      chassis: reconciled.chassis,
      gensets: reconciled.gensets,
      maintenanceParameters:
        candidateState.maintenanceParameters && candidateState.maintenanceParameters.length >= 20
          ? candidateState.maintenanceParameters
          : DEFAULT_MAINTENANCE_PARAMETERS,
      lastSyncTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    notify();
  };

  // --- v5.0: ODOMETER COMMIT, FOTO WO & QC GATE ---
  const applyOdometerUpdates = (
    updates: Array<{ idUnit: string; kmBaru: number }>
  ): number => {
    assertStorePermission('workorders.manage', 'Commit Import Odometer');
    if (!updates || updates.length === 0) return 0;

    const map = new Map(updates.map((u) => [normalizeUnitId(u.idUnit), Number(u.kmBaru)]));
    let applied = 0;
    let nextTires = globalState.tires;

    const nextTrucks = globalState.trucks.map((t) => {
      const kmBaru = map.get(normalizeUnitId(t.idUnit));
      if (kmBaru === undefined || !Number.isFinite(kmBaru) || kmBaru <= 0) return t;

      const deltaKm = Math.max(0, kmBaru - (t.kmSaatIni || 0));
      if (deltaKm > 0) {
        nextTires = nextTires.map((b) =>
          normalizeUnitId(b.unitTerpasang) === normalizeUnitId(t.idUnit) &&
          b.statusKelayakan === 'Aktif Terpasang'
            ? { ...b, kmTempuh: (b.kmTempuh || 0) + deltaKm }
            : b
        );
      }
      applied += 1;
      return { ...t, kmSaatIni: kmBaru };
    });

    globalState = { ...globalState, trucks: nextTrucks, tires: nextTires };
    notify();
    return applied;
  };

  const attachWorkOrderPhoto = (woId: string, stage: 'BEFORE' | 'AFTER', url: string): void => {
    assertStorePermission('workorders', 'Unggah Foto Work Order');
    globalState = {
      ...globalState,
      workOrders: globalState.workOrders.map((w) =>
        w.woId === woId
          ? { ...w, ...(stage === 'BEFORE' ? { fotoBefore: url } : { fotoAfter: url }) }
          : w
      )
    };
    notify();
  };

  const approveWorkOrderQc = (woId: string, approved: boolean): void => {
    assertStorePermission('workorders.manage', 'Approval QC Work Order');
    const target = globalState.workOrders.find((w) => w.woId === woId);
    if (!target) throw new Error(`Work Order ${woId} tidak ditemukan.`);
    if (approved && target.status !== 'READY FOR QC') {
      throw new Error('QC hanya dapat disetujui saat Work Order berstatus READY FOR QC.');
    }
    globalState = {
      ...globalState,
      workOrders: globalState.workOrders.map((w) =>
        w.woId === woId ? { ...w, qcApproved: approved, terakhirDiubah: new Date().toISOString() } : w
      )
    };
    notify();
  };

  return {
    state,
    setRole,
    setLocation,
    setPic,
    applyOdometerUpdates,
    attachWorkOrderPhoto,
    approveWorkOrderQc,
    createWorkOrder,
    updateWorkOrderStatus,
    updateWorkOrderDetails,
    cancelWorkOrder,
    requestSparepart,
    processPartApproval,
    registerNewMasterPart,
    processInboundPart,
    commitBatchTireMutation,
    updateBanToReadyBatch,
    submitIncidentReport,
    updateIncidentStatus,
    deleteIncidentReport,
    registerNewAssetBulk,
    afkirAsset,
    markAllNotificationsRead,
    syncFromGoogleSheetsData,
    resetToInitialDefaults,
    setCustomMaintenanceParameters,
    createAutoWorkOrderFromPm,
    syncWithCompanyServer,
    exportWorkshopSnapshot,
    importWorkshopSnapshot
  };
}

