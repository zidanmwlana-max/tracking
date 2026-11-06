import { TruckAsset, ChassisAsset, GensetAsset, TireAsset } from '../types';

export interface VendorMasterEntry {
  vendorName: string;
  normalizedName: string;
  code: string;
}

/**
 * Strips corporate prefixes (PT, CV, UD, PD, KOPERASI, YAYASAN) and normalizes vendor name.
 * Ported from GAS V9.5 normalizeVendorName_
 */
export function normalizeVendorName(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/\b(PT|CV|UD|PD|FA|KOPERASI|YAYASAN)\.?\s+/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a unique 3-letter vendor code (e.g. "Aminah Logistik" -> "AMN").
 * Ported from GAS V9.5 generateVendorCode_ with collision resolution.
 */
export function generateVendorCode(
  vendorName: string,
  existingMap: Record<string, string> = {}
): string {
  const norm = normalizeVendorName(vendorName);
  if (!norm) return 'VND';
  if (existingMap[norm]) return existingMap[norm];

  const usedCodes = new Set(Object.values(existingMap));
  usedCodes.add('BMI');

  const clean = norm.replace(/[^A-Z]/g, '');
  if (!clean) return 'VND';

  const first = clean[0];
  const rest = clean.slice(1);
  const consonants = rest.replace(/[AEIOU]/g, '');
  const vowels = rest.replace(/[^AEIOU]/g, '');

  const pool = first + consonants + vowels + 'XXX';
  let candidate = pool.slice(0, 3).toUpperCase();

  if (!usedCodes.has(candidate)) return candidate;

  // Try alternative consonant combinations
  for (let i = 1; i < clean.length - 1; i++) {
    for (let j = i + 1; j < clean.length; j++) {
      const alt = (first + clean[i] + clean[j]).toUpperCase();
      if (!usedCodes.has(alt)) return alt;
    }
  }

  // Fallback with numeric suffix
  for (let n = 1; n <= 99; n++) {
    const numStr = String(n);
    const alt = (candidate.slice(0, 3 - numStr.length) + numStr).toUpperCase();
    if (!usedCodes.has(alt)) return alt;
  }

  return candidate;
}

/**
 * Maps fleet vehicle type to 3-letter code for Truck Hull ID (No Lambung).
 * Ported from GAS V9.5 getTruckTypeCode_
 */
export function getTruckTypeCode(jenisArmada: string): string {
  const j = String(jenisArmada || '').toLowerCase();
  if (j.includes('head')) return 'HTR';
  if (j.includes('engkel')) return 'ENG';
  if (j.includes('tronton')) return 'TRT';
  if (j.includes('dump')) return 'DMP';
  if (j.includes('box')) return 'BOX';
  if (j.includes('pick')) return 'PUP';
  if (j.includes('penumpang')) return 'PNP';
  if (j.includes('thermo')) return 'THM';
  if (j.includes('support')) return 'SUP';
  return 'TRK';
}

/**
 * Builds vendor dictionary from existing trucks & chassis
 */
export function buildVendorCodeMap(
  trucks: TruckAsset[],
  chassis: ChassisAsset[],
  cartItems: any[] = []
): Record<string, string> {
  const map: Record<string, string> = {};

  trucks.forEach((t) => {
    if (t.kepemilikan === 'SEWA' && t.vendorName) {
      const norm = normalizeVendorName(t.vendorName);
      const prefix = t.noLambung?.split('-')[0];
      if (norm && prefix && prefix.length === 3 && prefix !== 'BMI') {
        map[norm] = prefix;
      } else if (norm && !map[norm]) {
        map[norm] = generateVendorCode(t.vendorName, map);
      }
    }
  });

  chassis.forEach((c) => {
    if (c.statusMilik !== 'BMI' && c.idUnit.length >= 6) {
      const prefix = c.idUnit.slice(0, 3).toUpperCase();
      if (prefix !== 'BMI') {
        map[prefix] = prefix;
      }
    }
  });

  cartItems.forEach((item) => {
    if (item.milik === 'SEWA' && item.vendorName) {
      const norm = normalizeVendorName(item.vendorName);
      if (norm && !map[norm]) {
        map[norm] = generateVendorCode(item.vendorName, map);
      }
    }
  });

  return map;
}

/**
 * Nomor urut terbesar dari ID yang cocok pola (grup 1 = angka). 0 bila tidak ada.
 * Satu-satunya tempat logika "scan prefix -> max seq" hidup.
 */
export function maxSequence(ids: Array<string | undefined>, pattern: RegExp): number {
  return ids.reduce((max, raw) => {
    const hit = String(raw || '').toUpperCase().trim().match(pattern);
    const n = hit ? parseInt(hit[1], 10) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

/**
 * Generates next Truck No Lambung: {OWNER}-{TYPE3}{SEQ3} (e.g. BMI-HTR001 or AMN-HTR001)
 */
export function generateTruckLambungId(
  jenisArmada: string,
  kepemilikan: 'BMI' | 'SEWA',
  vendorName: string,
  trucks: TruckAsset[],
  cartItems: any[] = []
): { noLambung: string; ownerCode: string } {
  const vMap = buildVendorCodeMap(trucks, [], cartItems);
  const ownerCode =
    kepemilikan === 'BMI'
      ? 'BMI'
      : generateVendorCode(vendorName || 'Vendor Sewa', vMap);
  const typeCode = getTruckTypeCode(jenisArmada);
  const prefix = `${ownerCode}-${typeCode}`;

  const maxSeq = maxSequence(
    [
      ...trucks.map((t) => t.noLambung),
      ...cartItems.filter((c) => c.kategori === 'TRUK').map((c) => c.noLambung)
    ],
    new RegExp(`^${prefix}(\\d+)$`)
  );

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return {
    noLambung: `${prefix}${nextSeq}`,
    ownerCode
  };
}

/**
 * Generates next Chassis Auto-ID: {OWNER}{2A/3A}{SEQ3} (e.g. BMI2A001, BMI3A002, HNM3A001).
 *
 * v5.0 — Nomor urut GLOBAL per kepemilikan (owner), TIDAK direset oleh kode axle:
 *   BMI3A001 + chassis 2-axle baru  -> BMI2A002
 *   HNM3A001 + chassis 2-axle baru  -> HNM2A002
 * Prefix hanya berubah pada bagian owner (BMI = milik, kode vendor = sewa) dan axle (2A/3A);
 * counter diambil dari nilai maksimum seluruh ID milik owner yang sama.
 */
export function generateChassisAutoId(
  tipeChassis: string,
  kepemilikan: 'BMI' | 'SEWA',
  vendorName: string,
  chassisList: ChassisAsset[],
  trucks: TruckAsset[] = [],
  cartItems: any[] = []
): { idUnit: string; ownerCode: string; axleCode: '2A' | '3A' } {
  const vMap = buildVendorCodeMap(trucks, chassisList, cartItems);
  const ownerCode =
    kepemilikan === 'BMI'
      ? 'BMI'
      : generateVendorCode(vendorName || 'Vendor Sewa', vMap);
  const is2Axle =
    String(tipeChassis || '').toLowerCase().includes('2 axle') ||
    String(tipeChassis || '').toLowerCase().includes('20ft');
  const axleCode: '2A' | '3A' = is2Axle ? '2A' : '3A';

  // Counter per owner, lintas axle: BMI3A001 -> BMI2A002 (bukan reset ke 001).
  const ownerPattern = new RegExp(`^${ownerCode.replace(/[^A-Z0-9]/g, '')}(?:2A|3A)(\\d{3,})$`);
  const usedIds = new Set(
    [
      ...chassisList.map((c) => c.idUnit),
      ...cartItems.filter((c) => c.kategori === 'CHASSIS').map((c) => c.idUnit)
    ].map((id) => String(id || '').toUpperCase().trim())
  );
  let maxSeq = maxSequence([...usedIds], ownerPattern);

  // Fallback: hitung ID legacy (BMI-CH20-xx / BMI-CH40-xx) milik owner yang sama
  if (maxSeq === 0) {
    const legacyPrefix = `${ownerCode}-CH`;
    maxSeq = [...usedIds].filter((id) => id.startsWith(legacyPrefix)).length;
  }

  let nextSeq = maxSeq + 1;
  let idUnit = `${ownerCode}${axleCode}${String(nextSeq).padStart(3, '0')}`;

  // Jaga keunikan bila ada lubang/duplikasi pada data lama
  while (usedIds.has(idUnit)) {
    nextSeq += 1;
    idUnit = `${ownerCode}${axleCode}${String(nextSeq).padStart(3, '0')}`;
  }

  return {
    idUnit,
    ownerCode,
    axleCode
  };
}

/**
 * Generates next Genset Auto-ID: GNZ-{CG/UG}-{SEQ2} (e.g. GNZ-CG-01 or GNZ-UG-01)
 */
export function generateGensetAutoId(
  tipeGenset: string,
  gensets: GensetAsset[],
  cartItems: any[] = []
): { idUnit: string; typeCode: 'CG' | 'UG' } {
  const isUnderslung = String(tipeGenset || '').toLowerCase().includes('under');
  const typeCode: 'CG' | 'UG' = isUnderslung ? 'UG' : 'CG';
  const prefix = `GNZ-${typeCode}-`;

  const pattern =
    typeCode === 'CG' ? /^(?:GNZ-CG-|GNZ-CL-)(\d+)$/ : /^(?:GNZ-UG-|GNZ-UN-)(\d+)$/;
  const maxSeq = maxSequence(
    [
      ...gensets.map((g) => g.idUnit),
      ...cartItems.filter((c) => c.kategori === 'GENSET').map((c) => c.idUnit)
    ],
    pattern
  );

  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return {
    idUnit: `${prefix}${nextSeq}`,
    typeCode
  };
}

/**
 * Normalizes all Truck Hull IDs (noLambung) to the latest BMI Enterprise naming convention:
 * {OWNER}-{TYPE3}{SEQ3} per category (e.g., BMI-HTR001..008, BMI-PNP001..012, BMI-BOX001..006,
 * BMI-PUP001..003, BMI-THM001, BMI-DMP001, BMI-ENG001).
 */
export function standardizeTruckLambungList(trucks: TruckAsset[]): {
  trucks: TruckAsset[];
  nopolToLambungMap: Record<string, string>;
} {
  const hasLegacyIds = trucks.some((t) => {
    const id = String(t.noLambung || '').toUpperCase().trim();
    const expectedType = getTruckTypeCode(t.jenisArmada);
    return (
      !id ||
      id.includes('-TRK') ||
      id.includes('-PAS') ||
      id.includes('-PKU') ||
      id.includes('-TRM') ||
      id.includes('-EKL') ||
      id === 'BMI-BOX018' ||
      !id.includes(`-${expectedType}`)
    );
  });

  const nopolToLambungMap: Record<string, string> = {};
  if (!hasLegacyIds) {
    trucks.forEach((t) => {
      nopolToLambungMap[t.idUnit.replace(/\s+/g, '').toUpperCase()] = t.noLambung;
    });
    return { trucks, nopolToLambungMap };
  }

  const vMap = buildVendorCodeMap(trucks, []);
  const seqCounters: Record<string, number> = {};

  const standardized = trucks.map((t) => {
    const ownerCode =
      t.kepemilikan === 'SEWA'
        ? generateVendorCode(t.vendorName || 'Vendor Sewa', vMap)
        : 'BMI';
    const typeCode = getTruckTypeCode(t.jenisArmada);
    const prefix = `${ownerCode}-${typeCode}`;
    seqCounters[prefix] = (seqCounters[prefix] || 0) + 1;
    const newLambung = `${prefix}${String(seqCounters[prefix]).padStart(3, '0')}`;
    const normNopol = t.idUnit.replace(/\s+/g, '').toUpperCase();
    nopolToLambungMap[normNopol] = newLambung;
    return {
      ...t,
      noLambung: newLambung
    };
  });

  return { trucks: standardized, nopolToLambungMap };
}

/**
 * Normalizes all Genset IDs (idUnit) to the latest BMI Enterprise naming convention:
 * GNZ-{CG/UG}-{SEQ2} (e.g., GNZ-CG-01..06, GNZ-UG-01..04).
 */
export function standardizeGensetIdList(gensets: GensetAsset[]): {
  gensets: GensetAsset[];
  oldToNewIdMap: Record<string, string>;
} {
  const hasLegacyIds = gensets.some((g) => {
    const id = String(g.idUnit || '').toUpperCase().trim();
    return !/^GNZ-(CG|UG)-\d{2,}$/.test(id);
  });

  const oldToNewIdMap: Record<string, string> = {};
  if (!hasLegacyIds) {
    gensets.forEach((g) => {
      oldToNewIdMap[g.idUnit.toUpperCase()] = g.idUnit;
    });
    return { gensets, oldToNewIdMap };
  }

  const seqCounters: Record<string, number> = { CG: 0, UG: 0 };
  const standardized = gensets.map((g) => {
    const isUnderslung = String(g.tipeGenset || '').toLowerCase().includes('under');
    const typeCode: 'CG' | 'UG' = isUnderslung ? 'UG' : 'CG';
    seqCounters[typeCode] += 1;
    const newId = `GNZ-${typeCode}-${String(seqCounters[typeCode]).padStart(2, '0')}`;
    oldToNewIdMap[String(g.idUnit || '').toUpperCase().trim()] = newId;
    return {
      ...g,
      idUnit: newId
    };
  });

  return { gensets: standardized, oldToNewIdMap };
}

export interface ParsedBanDot {
  valid: boolean;
  error?: string;
  plant?: string;
  wwyy?: string;
  week?: number;
  year?: number;
  prefix?: string;
  idBanFisik?: string;
  idSiklus?: string;
}

/**
 * Parses and validates full Tire DOT code according to BMI V9.5 specification:
 * - First char digit -> 3-char plant code (min total length 7)
 * - First char letter -> 2-char plant code (min total length 6)
 * - Last 4 chars -> WWYY (digits), where 01 <= WW <= 53
 * - Auto ID Ban Fisik -> {PLANT}{WWYY}{SEQ4} (e.g. 1NL29250001)
 * - Auto ID Siklus -> {ID_BAN}{R0|R1|R2|RJ} (e.g. 1NL29250001R0)
 */
export function parseAndGenerateBanId(
  dotRaw: string,
  siklus: 'R0' | 'R1' | 'R2' | 'RJ' = 'R0',
  tires: TireAsset[] = [],
  cartItems: any[] = []
): ParsedBanDot {
  const clean = String(dotRaw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (!clean) {
    return {
      valid: false,
      error: 'Masukkan Kode DOT lengkap (contoh: 1NL2925 atau B92824).'
    };
  }

  const firstChar = clean.charAt(0);
  const isDigitStart = /^[0-9]$/.test(firstChar);
  const plantLen = isDigitStart ? 3 : 2;
  const minLen = plantLen + 4;

  if (clean.length < minLen) {
    return {
      valid: false,
      error: `Kode DOT terlalu pendek. Minimal ${minLen} karakter (${plantLen} digit Plant + 4 digit WWYY, cth: ${
        isDigitStart ? '1NL2925' : 'B92824'
      }).`
    };
  }

  const plant = clean.substring(0, plantLen);
  const wwyy = clean.substring(clean.length - 4);

  if (!/^\d{4}$/.test(wwyy)) {
    return {
      valid: false,
      error: `4 karakter terakhir DOT (${wwyy}) wajib berupa angka Minggu & Tahun (WWYY).`
    };
  }

  const week = parseInt(wwyy.substring(0, 2), 10);
  const year = parseInt(wwyy.substring(2, 4), 10);

  if (week < 1 || week > 53) {
    return {
      valid: false,
      error: `Minggu produksi pada DOT (${String(week).padStart(2, '0')}) tidak valid. Harus antara 01 s/d 53.`
    };
  }

  const prefix = `${plant}${wwyy}`;
  const maxSeq = maxSequence(
    [
      ...tires.map((t) => t.idBanFisik),
      ...cartItems.filter((c) => c.kategori === 'BAN').map((c) => c.idUnit)
    ],
    new RegExp(`^${prefix}(\\d{4})`)
  );

  const seq4 = String(maxSeq + 1).padStart(4, '0');
  const idBanFisik = `${prefix}${seq4}`;
  const idSiklus = `${idBanFisik}${siklus}`;

  return {
    valid: true,
    plant,
    wwyy,
    week,
    year: 2000 + year,
    prefix,
    idBanFisik,
    idSiklus
  };
}

/**
 * Compresses an uploaded image file to max 1280px and optionally burns a bottom watermark banner (woWm).
 * Ported from GAS V9.5 compressImg & woWm
 */
export function compressAndWatermarkImage(
  file: File,
  watermarkText?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const MAX_DIM = 1280;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(ev.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        if (watermarkText) {
          const barHeight = Math.max(32, Math.round(h * 0.055));
          ctx.fillStyle = 'rgba(10, 37, 71, 0.82)';
          ctx.fillRect(0, h - barHeight, w, barHeight);

          // Gold top line on watermark bar
          ctx.fillStyle = '#D19F0F';
          ctx.fillRect(0, h - barHeight, w, 2.5);

          const fontSize = Math.max(12, Math.round(barHeight * 0.45));
          ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textBaseline = 'middle';

          const nowStr = new Date().toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          const fullText = `${watermarkText}  |  ${nowStr} WIB`;
          ctx.fillText(fullText, 14, h - barHeight / 2 + 1);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
