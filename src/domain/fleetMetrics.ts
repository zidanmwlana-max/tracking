import type {
  TruckAsset,
  ChassisAsset,
  GensetAsset,
  TireAsset,
  WorkOrder,
  ChassisInspectionItem
} from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses Indonesian / ISO / US date strings safely into a Date instance.
 */
export function parseFlexibleDate(raw?: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return null;

  // Handle DD/MM/YYYY vs MM/DD/YYYY or YYYY-MM-DD
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    // If first > 12, it is DD/MM/YYYY
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Fase 2.6: Centralized Downtime Calculation (In-Service & Warehouse Idle Downtime)
 * Business Rule: Once an asset/tire is registered and sits in the warehouse (not mounted/used on a truck),
 * or is undergoing workshop repair, its idle duration counts toward downtime.
 */
export function calculateDowntimeDays(
  startDateStr?: string,
  endDateStr?: string,
  isStillIdleOrInRepair: boolean = true,
  referenceDate: Date = new Date()
): number {
  const startDt = parseFlexibleDate(startDateStr);
  if (!startDt) return 0;

  const endDt = !isStillIdleOrInRepair && endDateStr ? parseFlexibleDate(endDateStr) : null;
  const effectiveEnd = endDt || referenceDate;

  const diffMs = effectiveEnd.getTime() - startDt.getTime();
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.floor(diffMs / MS_PER_DAY));
}

/**
 * Calculates downtime days for a TireAsset.
 * Includes time spent in the warehouse ('Spare / Gudang' or unmounted) as well as vulcanization/service.
 */
export interface TireDowntimeInput {
  statusKelayakan: TireAsset['statusKelayakan'];
  unitTerpasang?: string;
  idUnitTerpasang?: string; // alias kolom Sheets lama
  tglMasuk?: string;
  tglPasang?: string;
  tglUpdate?: string; // alias kolom Sheets lama
  jumlahHariDowntime?: number;
}

export function calculateTireDowntimeDays(
  tire: TireDowntimeInput,
  referenceDate: Date = new Date()
): number {
  const unitMounted = String(tire.unitTerpasang ?? tire.idUnitTerpasang ?? '')
    .trim()
    .toUpperCase();
  const isActivelyMountedOnVehicle =
    tire.statusKelayakan === 'Aktif Terpasang' &&
    Boolean(unitMounted) &&
    unitMounted !== '-' &&
    !unitMounted.includes('GUDANG') &&
    !unitMounted.includes('STOCK');

  if (isActivelyMountedOnVehicle) {
    return Math.max(0, Number(tire.jumlahHariDowntime || 0));
  }

  const anchorDate = tire.tglMasuk || tire.tglUpdate || tire.tglPasang;
  const computedDays = calculateDowntimeDays(anchorDate, undefined, true, referenceDate);
  return Math.max(computedDays, Number(tire.jumlahHariDowntime || 0));
}

/**
 * Calculates Tire Cost-Per-Kilometer (CPK) and Remaining Tread Health.
 */
export interface TireCpkResult {
  cpkIdrPerKm: number;
  wearMillimeters: number;
  usableTreadRemainingPct: number;
  projectedRemainingKm: number;
  needsReplacementOrRetread: boolean;
}

export function calculateTireCpkAndWear(
  hargaBeliIdr: number,
  kmTempuh: number,
  ketebalanAwalMm: number = 16,
  ketebalanSaatIniMm: number = 10,
  batasAmanMm: number = 3
): TireCpkResult {
  const safePrice = Math.max(0, Number(hargaBeliIdr || 0));
  const safeKm = Math.max(0, Number(kmTempuh || 0));
  const initMm = Math.max(batasAmanMm + 1, Number(ketebalanAwalMm || 16));
  const currMm = Math.max(0, Number(ketebalanSaatIniMm ?? initMm));

  const cpkIdrPerKm = safeKm > 0 ? Math.round(safePrice / safeKm) : 0;
  const wearMillimeters = Math.max(0, Number((initMm - currMm).toFixed(2)));
  const totalUsableMm = Math.max(1, initMm - batasAmanMm);
  const remainingUsableMm = Math.max(0, currMm - batasAmanMm);
  const usableTreadRemainingPct = Math.min(
    100,
    Math.max(0, Math.round((remainingUsableMm / totalUsableMm) * 100))
  );

  const kmPerMm = wearMillimeters > 0 ? safeKm / wearMillimeters : 6000;
  const projectedRemainingKm = Math.round(remainingUsableMm * kmPerMm);

  return {
    cpkIdrPerKm,
    wearMillimeters,
    usableTreadRemainingPct,
    projectedRemainingKm,
    needsReplacementOrRetread: currMm <= batasAmanMm
  };
}

/**
 * Evaluates a 13-Point Chassis Inspection item (Daily Inspection / 日常点検).
 */
export interface ChassisChecklistEvaluation {
  totalPoints: number;
  passedPoints: number;
  faultPoints: number;
  isRoadworthy: boolean;
  faultComponents: string[];
}

export interface ChassisChecklistInput {
  a3: boolean;
  v: ChassisInspectionItem['v'] & {
    tl?: number | boolean; // Twist Lock
    lg?: number | boolean; // Landing Gear
    kp?: number | boolean; // King Pin
  };
}

export function evaluateChassis13PointChecklist(
  item: ChassisChecklistInput
): ChassisChecklistEvaluation {
  const v = item.v;
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'Twist Lock', ok: Boolean(v.tl) },
    { label: 'Landing Gear', ok: Boolean(v.lg) },
    { label: 'King Pin', ok: Boolean(v.kp) },
    { label: 'Kondisi Ban', ok: v.ban === 'B' },
    { label: 'Kaki Gajah', ok: Boolean(v.gajah) },
    { label: 'Instalasi Lampu', ok: Boolean(v.lampu) },
    { label: 'Sistem Pengereman', ok: Boolean(v.rem) },
    { label: 'Pagar Pengaman', ok: Boolean(v.pagar) },
    { label: 'Slebor / Spakbor', ok: Boolean(v.slebor) },
    { label: 'Baut Roda Axle 1', ok: Boolean(v.b1) },
    { label: 'Baut Roda Axle 2', ok: Boolean(v.b2) },
    { label: 'Baut Roda Axle 3', ok: item.a3 ? Boolean(v.b3) : true },
    {
      label: 'Lantai (Depan/Tengah/Belakang)',
      ok: Boolean(v.ld && v.lt && v.lb)
    }
  ];

  const faultComponents = checks.filter((c) => !c.ok).map((c) => c.label);
  const totalPoints = 13;
  const faultPoints = faultComponents.length;
  const passedPoints = totalPoints - faultPoints;

  return {
    totalPoints,
    passedPoints,
    faultPoints,
    isRoadworthy: faultPoints === 0,
    faultComponents
  };
}

/**
 * Calculates overall Fleet Availability & Workshop Active Load Summary.
 */
export interface FleetAvailabilitySummary {
  totalUnits: number;
  readyUnits: number;
  inMaintenanceUnits: number;
  availabilityRatePct: number;
  openWorkOrdersCount: number;
}

export function calculateFleetAvailabilitySummary(
  trucks: TruckAsset[],
  chassis: ChassisAsset[],
  gensets: GensetAsset[],
  workOrders: WorkOrder[]
): FleetAvailabilitySummary {
  const activeWoUnits = new Set(
    (workOrders || [])
      .filter((w) => w.status !== 'COMPLETED & RELEASED' && w.status !== 'CANCELLED')
      .map((w) => String(w.idUnit || '').trim().toUpperCase())
  );

  const countInRepair = (units: Array<{ idUnit: string; statusServis?: string }>) =>
    (units || []).filter(
      (u) =>
        activeWoUnits.has(String(u.idUnit || '').trim().toUpperCase()) ||
        (u.statusServis && u.statusServis !== 'Selesai')
    ).length;

  const totalUnits =
    (trucks?.length || 0) + (chassis?.length || 0) + (gensets?.length || 0);
  const inMaintenanceUnits =
    countInRepair(trucks) + countInRepair(chassis) + countInRepair(gensets);
  const readyUnits = Math.max(0, totalUnits - inMaintenanceUnits);
  const availabilityRatePct =
    totalUnits > 0 ? Number(((readyUnits / totalUnits) * 100).toFixed(1)) : 100;

  return {
    totalUnits,
    readyUnits,
    inMaintenanceUnits,
    availabilityRatePct,
    openWorkOrdersCount: activeWoUnits.size
  };
}
