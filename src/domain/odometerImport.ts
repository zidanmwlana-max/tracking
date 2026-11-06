import type {
  OdometerImportBatch,
  OdometerImportRow,
  OdometerLogEntry,
  TruckAsset
} from '../types';

/**
 * v5.0 — Odometer Staging (WAJIB staging → validasi → preview → commit → logbook).
 * Tidak boleh ada update KM langsung ke master unit.
 */

export interface OdometerRawRow {
  rowNo: number;
  idUnit: string;
  noLambung?: string;
  kmBaru: number;
  tanggal: string;
}

export interface OdometerValidationContext {
  trucks: Array<Pick<TruckAsset, 'idUnit' | 'noLambung' | 'kmSaatIni'>>;
  /** Lonjakan KM per pencatatan yang dianggap wajar (default 3.000 KM). */
  maxJumpKm?: number;
}

function parseNumber(raw: string): number {
  const cleaned = String(raw ?? '')
    .replace(/[^\d.,-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Parser CSV/XLSX-teks sederhana (delimiter , ; atau tab) dengan deteksi header. */
export function parseOdometerCsv(text: string): OdometerRawRow[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const cells = lines.map((l) => l.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '')));

  const header = cells[0].map((c) => c.toLowerCase());
  const looksLikeHeader =
    header.some((c) => c.includes('nopol') || c.includes('unit') || c.includes('lambung')) &&
    header.some((c) => c.includes('km'));

  const body = looksLikeHeader ? cells.slice(1) : cells;

  const idxUnit = header.findIndex((c) => c.includes('nopol') || c === 'unit' || c.includes('plat'));
  const idxLambung = header.findIndex((c) => c.includes('lambung'));
  const idxKm = header.findIndex((c) => c.includes('km'));
  const idxTgl = header.findIndex((c) => c.includes('tanggal') || c.includes('tgl') || c.includes('date'));

  return body
    .map((row, i) => {
      const unit = (idxUnit >= 0 ? row[idxUnit] : row[0]) || '';
      const lambung = idxLambung >= 0 ? row[idxLambung] : '';
      const kmRaw = idxKm >= 0 ? row[idxKm] : row[1];
      const tgl = idxTgl >= 0 ? row[idxTgl] : row[2];
      return {
        rowNo: i + 1,
        idUnit: unit,
        noLambung: lambung,
        kmBaru: parseNumber(kmRaw),
        tanggal: tgl
      };
    })
    .filter((r) => r.idUnit || Number.isFinite(r.kmBaru));
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function validateOdometerRows(
  rows: OdometerRawRow[],
  ctx: OdometerValidationContext
): OdometerImportRow[] {
  const maxJump = Math.max(1, ctx.maxJumpKm ?? 3000);
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const key = String(row.idUnit || '').trim().toLowerCase();
    const truck = ctx.trucks.find(
      (t) =>
        String(t.idUnit).trim().toLowerCase() === key ||
        String(t.noLambung).trim().toLowerCase() === key ||
        (row.noLambung &&
          String(t.noLambung).trim().toLowerCase() === String(row.noLambung).trim().toLowerCase())
    );

    if (!truck) errors.push(`Unit "${row.idUnit}" tidak ditemukan pada master Armada/Fleet.`);

    const kmBaru = Number(row.kmBaru);
    if (!Number.isFinite(kmBaru)) errors.push('Nilai KM tidak valid.');
    else if (kmBaru <= 0) errors.push('KM tidak boleh 0 atau negatif.');

    const kmLama = truck ? Number(truck.kmSaatIni || 0) : undefined;
    if (truck && Number.isFinite(kmBaru) && kmBaru > 0) {
      if (kmBaru < kmLama!) errors.push(`KM mundur: ${kmBaru} < KM terakhir ${kmLama}.`);
      else if (kmBaru - kmLama! > maxJump) {
        warnings.push(`Lonjakan KM ${kmBaru - kmLama!} km melebihi ambang wajar ${maxJump} km.`);
      }
    }

    const tanggal = normalizeDate(row.tanggal);
    if (!tanggal) errors.push('Tanggal tidak valid (format YYYY-MM-DD atau DD/MM/YYYY).');

    if (truck) {
      const tKey = String(truck.idUnit).toLowerCase();
      if (seen.has(tKey)) {
        errors.push(`Unit duplikat pada baris ${seen.get(tKey)} dan baris ${row.rowNo}.`);
      } else {
        seen.set(tKey, row.rowNo);
      }
    }

    return {
      rowNo: row.rowNo,
      idUnit: truck ? truck.idUnit : row.idUnit,
      noLambung: truck ? truck.noLambung : row.noLambung,
      kmBaru,
      tanggal: tanggal || String(row.tanggal || ''),
      valid: errors.length === 0,
      errors,
      warnings,
      kmLama
    };
  });
}

export function buildOdometerBatch(
  fileName: string,
  rows: OdometerImportRow[],
  createdBy: string
): OdometerImportBatch {
  return {
    id: `ODO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    fileName,
    createdAt: new Date().toISOString(),
    createdBy,
    status: 'STAGED',
    rows
  };
}

/** Commit batch: hanya baris valid. Mengembalikan update unit + entri logbook. */
export function commitOdometerBatch(
  batch: OdometerImportBatch,
  pic: string
): { updates: Array<{ idUnit: string; kmBaru: number }>; logs: OdometerLogEntry[] } {
  const validRows = batch.rows.filter((r) => r.valid);
  const logs: OdometerLogEntry[] = validRows.map((r) => ({
    id: `ODL-${batch.id}-${r.rowNo}`,
    idUnit: r.idUnit,
    kmLama: Number(r.kmLama || 0),
    kmBaru: r.kmBaru,
    tanggal: r.tanggal,
    batchId: batch.id,
    pic,
    sumber: 'IMPORT'
  }));

  return {
    updates: validRows.map((r) => ({ idUnit: r.idUnit, kmBaru: r.kmBaru })),
    logs
  };
}
