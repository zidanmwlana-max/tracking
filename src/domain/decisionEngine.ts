import type {
  PrioritizedWorkOrder,
  PriorityFactors,
  ScheduleResult,
  ScheduleSlot,
  WorkOrder
} from '../types';

/**
 * v5.0 — Decision Engine (deterministik, greedy constraint-based).
 * 1) Prioritization: Weighted Priority Score di memory.
 * 2) Safety Level A (Rem/Kemudi) = HARD OVERRIDE (selalu di atas skor apa pun).
 * 3) Scheduling: greedy slot assignment (Bay + Shift + Teknisi) + load balancing.
 */

export interface DecisionContext {
  healthByUnit?: Record<string, number>; // Health Index 0-100 (kecil = rusak)
  overdueByUnit?: Record<string, number>; // jumlah komponen PM OVERDUE
}

const SAFETY_KEYWORDS = [
  'rem',
  'brake',
  'kemudi',
  'steering',
  'kopling',
  'clutch',
  'ban',
  'tire',
  'roda'
];

export function isSafetyCritical(wo: Pick<WorkOrder, 'keluhan' | 'jenisServis'>): boolean {
  const text = `${wo.keluhan || ''} ${wo.jenisServis || ''}`.toLowerCase();
  return SAFETY_KEYWORDS.some((k) => text.includes(k));
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function computePriority(wo: WorkOrder, ctx: DecisionContext = {}): PrioritizedWorkOrder {
  const health = clamp(Number(ctx.healthByUnit?.[wo.idUnit] ?? 100));
  const overdueCount = Math.max(0, Number(ctx.overdueByUnit?.[wo.idUnit] ?? 0));

  const safetyCritical = isSafetyCritical(wo) || wo.prioritas === 'Darurat / Breakdown';
  const safetyRisk = safetyCritical ? 100 : clamp(60 - overdueCount * 10);
  const overdue = clamp(overdueCount * 25);
  const healthIndex = clamp(health);

  const score = Math.round(0.5 * safetyRisk + 0.3 * overdue + 0.2 * (100 - healthIndex));
  const hardOverride = safetyRisk === 100;

  const level: 'A' | 'B' | 'C' = hardOverride || score >= 75 ? 'A' : score >= 45 ? 'B' : 'C';

  const reasons: string[] = [];
  if (hardOverride) reasons.push('Safety Level A — komponen rem/kemudi/ban (hard override)');
  if (overdueCount > 0) reasons.push(`${overdueCount} komponen PM overdue`);
  if (healthIndex < 50) reasons.push(`Health Index unit rendah (${healthIndex}%)`);
  if (reasons.length === 0) reasons.push('Tidak ada faktor kritis — prioritas normal');

  const factors: PriorityFactors = { safetyRisk, overdue, healthIndex };
  return { woId: wo.woId, idUnit: wo.idUnit, score, level, hardOverride, factors, reasons };
}

export function rankWorkOrders(list: WorkOrder[], ctx: DecisionContext = {}): PrioritizedWorkOrder[] {
  return (list || [])
    .filter((wo) => wo && wo.status !== 'COMPLETED & RELEASED' && wo.status !== 'CANCELLED')
    .map((wo) => computePriority(wo, ctx))
    .sort((a, b) => {
      if (a.hardOverride !== b.hardOverride) return a.hardOverride ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.woId.localeCompare(b.woId);
    });
}

export interface ScheduleResources {
  bays: string[];
  shifts: Array<'PAGI' | 'SIANG' | 'MALAM'>;
  teknisi: string[];
  maxJobPerTeknisi?: number;
}

export const DEFAULT_SCHEDULE_RESOURCES: ScheduleResources = {
  bays: ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'],
  shifts: ['PAGI', 'SIANG', 'MALAM'],
  teknisi: ['Teknisi 1', 'Teknisi 2', 'Teknisi 3', 'Teknisi 4'],
  maxJobPerTeknisi: 2
};

export function scheduleWorkOrders(
  ranked: PrioritizedWorkOrder[],
  resources: ScheduleResources = DEFAULT_SCHEDULE_RESOURCES
): ScheduleResult {
  const maxJob = Math.max(1, resources.maxJobPerTeknisi ?? 2);
  const bays = resources.bays.length > 0 ? resources.bays : DEFAULT_SCHEDULE_RESOURCES.bays;
  const shifts = resources.shifts.length > 0 ? resources.shifts : DEFAULT_SCHEDULE_RESOURCES.shifts;
  const teknisi = resources.teknisi.length > 0 ? resources.teknisi : DEFAULT_SCHEDULE_RESOURCES.teknisi;

  const occupied = new Set<string>(); // `${bay}|${shift}`
  const loadByTeknisi: Record<string, number> = {};
  teknisi.forEach((t) => (loadByTeknisi[t] = 0));

  const assignments: ScheduleSlot[] = [];
  const unassigned: ScheduleResult['unassigned'] = [];

  ranked.forEach((item) => {
    let placed = false;

    for (const shift of shifts) {
      for (const bay of bays) {
        const slotKey = `${bay}|${shift}`;
        if (occupied.has(slotKey)) continue;

        // Load balancing: pilih teknisi dengan beban terendah yang masih punya kuota
        const candidate = teknisi
          .filter((t) => (loadByTeknisi[t] || 0) < maxJob)
          .sort((a, b) => (loadByTeknisi[a] || 0) - (loadByTeknisi[b] || 0) || a.localeCompare(b))[0];

        if (!candidate) continue;

        occupied.add(slotKey);
        loadByTeknisi[candidate] = (loadByTeknisi[candidate] || 0) + 1;
        assignments.push({ woId: item.woId, bay, shift, teknisi: candidate, score: item.score });
        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      unassigned.push({
        woId: item.woId,
        reason: 'Kapasitas bay/shift/teknisi pada horizon ini habis.'
      });
    }
  });

  return { assignments, unassigned, loadByTeknisi };
}
