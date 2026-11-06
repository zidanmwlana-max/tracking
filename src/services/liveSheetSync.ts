import {
  TruckAsset,
  ChassisAsset,
  GensetAsset,
  TireAsset,
  WorkOrder,
  MasterPart,
  PartRequest,
  IncidentReport,
  MaintenanceParameter,
  WOStatus
} from '../types';
import { parseSheetParameters } from './maintenanceEngine';
import { parseUserAccessSheetRows, saveUserAccessList } from './authSession';
import { standardizeTruckLambungList, standardizeGensetIdList } from './autoIdGenerator';

export const DEFAULT_BMI_SPREADSHEET_ID = '1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4';

export interface LiveSyncedDataset {
  trucks?: TruckAsset[];
  chassis?: ChassisAsset[];
  gensets?: GensetAsset[];
  tires?: TireAsset[];
  workOrders?: WorkOrder[];
  parts?: MasterPart[];
  partRequests?: PartRequest[];
  incidents?: IncidentReport[];
  parameters?: MaintenanceParameter[];
  totalExtractedRows: number;
}

export function cleanNumeric(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeUnitId(val: unknown): string {
  return String(val || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeTireSize(val: unknown, fallback = '1000'): string {
  const s = String(val || '')
    .trim()
    .replace(/\.0+$/, '');
  if (s && s !== '-' && s !== '0') return s;
  return fallback;
}

export function isWarehouseTire(tire: TireAsset): boolean {
  if (tire.statusKelayakan === 'Afkir / Dibuang' || tire.statusKelayakan === 'Histori (Terupdate)') {
    return false;
  }
  const unitUpper = String(tire.unitTerpasang || '').toUpperCase();
  const posUpper = String(tire.posisiRoda || '').toUpperCase();
  if (unitUpper.includes('AFKIR') || unitUpper.includes('VENDOR')) return false;
  return (
    tire.statusKelayakan === 'Spare / Gudang' ||
    unitUpper.includes('GUDANG') ||
    unitUpper.includes('BENGKEL') ||
    unitUpper.includes('STORAGE') ||
    posUpper === 'GUDANG' ||
    posUpper === 'BENGKEL'
  );
}

export function isReadyWarehouseTire(tire: TireAsset): boolean {
  return isWarehouseTire(tire) && String(tire.catatanKondisi || '').toLowerCase().includes('ready');
}

export function parseCsvString(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function fetchPublicSheetCsvRows(
  spreadsheetId: string,
  sheetName: string
): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId
  )}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal mengunduh sheet "${sheetName}" (${res.status})`);
  }
  const csvText = await res.text();
  return parseCsvString(csvText);
}

/**
 * Deduplicate TRK (LOG) rows by normalized Nopol, keeping the LATEST row per truck
 * and inheriting any non-empty metadata from earlier rows.
 */
export function parseTrkLogRows(rows: any[][]): TruckAsset[] {
  const trkMap = new Map<string, TruckAsset>();
  rows.forEach((r) => {
    const nopol = normalizeUnitId(r[3]);
    if (!nopol || nopol.includes('NOPOL') || nopol.includes('POLISI') || nopol === '-') return;
    const prev = trkMap.get(nopol);
    const kmSaatIni = cleanNumeric(r[6]) || (prev ? prev.kmSaatIni : 0);
    const kmServisTerakhir = cleanNumeric(r[7]) || (prev ? prev.kmServisTerakhir : kmSaatIni);
    const intervalServisKm = cleanNumeric(r[8]) || prev?.intervalServisKm || undefined;
    const kmServisBerikutnya = cleanNumeric(r[9]) || prev?.kmServisBerikutnya || undefined;
    const sisaKmRaw = String(r[10] ?? '').trim();
    const sisaKmServis =
      sisaKmRaw !== '' && sisaKmRaw !== '-' ? cleanNumeric(r[10]) : prev?.sisaKmServis;

    const jenis = String(r[4] || (prev ? prev.jenisArmada : 'Head Truck'))
      .trim()
      .replace(/\s+/g, ' ');
    const isSmall = ['support', 'box', 'pick up', 'penumpang', 'thermo'].some((k) =>
      jenis.toLowerCase().includes(k)
    );
    const targetBan = isSmall ? 'R14' : jenis.toLowerCase().includes('engkel') ? '750' : '1000';
    const rawStatus = String(r[20] || 'Selesai').trim();
    const statusServis: TruckAsset['statusServis'] = (
      ['Scheduled', 'In Progress', 'Arrived', 'AFKIR'].includes(rawStatus) ? rawStatus : 'Selesai'
    ) as TruckAsset['statusServis'];

    const tglMulaiRaw = String(r[16] || '').trim();
    const targetSelesaiRaw = String(r[17] || '').trim();
    const keluhanRaw = String(r[18] || '').trim();
    const catatanRaw = String(r[14] || '').trim();
    const stnkRaw = String(r[31] || '').trim();
    const pajakRaw = String(r[32] || '').trim();

    trkMap.set(nopol, {
      idUnit: nopol,
      noLambung: String(r[2] || (prev ? prev.noLambung : '')).trim(),
      jenisArmada: jenis,
      merkModel: String(r[5] || (prev ? prev.merkModel : '')).trim(),
      kmSaatIni,
      kmServisTerakhir,
      intervalServisKm,
      kmServisBerikutnya,
      sisaKmServis,
      targetUkuranBan: targetBan,
      statusServis,
      tglMulai: tglMulaiRaw && tglMulaiRaw !== '-' ? tglMulaiRaw : prev?.tglMulai || '',
      targetSelesai:
        targetSelesaiRaw && targetSelesaiRaw !== '-' ? targetSelesaiRaw : prev?.targetSelesai || '',
      keluhan: keluhanRaw && keluhanRaw !== '-' ? keluhanRaw : prev?.keluhan || '',
      catatanBengkel: catatanRaw && catatanRaw !== '-' ? catatanRaw : prev?.catatanBengkel || '',
      pic: String(r[19] || (prev ? prev.pic : '')).trim(),
      masaSTNK: stnkRaw && stnkRaw !== '-' ? stnkRaw : prev?.masaSTNK || '',
      masaPajak: pajakRaw && pajakRaw !== '-' ? pajakRaw : prev?.masaPajak || '',
      kepemilikan: 'BMI',
      lastComponentService: prev?.lastComponentService
    });
  });
  return standardizeTruckLambungList(Array.from(trkMap.values())).trucks;
}

/**
 * Deduplicate CHA (LOG) rows by Kode Chassis, keeping the LATEST row per chassis.
 * Empty or '-' fields in the CSV remain empty ('') or undefined.
 */
export function parseChaLogRows(rows: any[][]): ChassisAsset[] {
  const chaMap = new Map<string, ChassisAsset>();
  rows.forEach((r) => {
    const idUnit = normalizeUnitId(r[2]);
    if (!idUnit || idUnit.includes('KODE') || idUnit === '-') return;
    const prev = chaMap.get(idUnit);
    const rawKirStatus = String(r[5] || 'Aktif').trim();
    const statusKIR: ChassisAsset['statusKIR'] = rawKirStatus.toLowerCase().includes('mati')
      ? 'Mati'
      : rawKirStatus.toLowerCase().includes('segera')
      ? 'Segera Perpanjang'
      : 'Aktif';
    const rawStatusServis = String(r[26] || 'Selesai').trim();
    const statusServis: ChassisAsset['statusServis'] = (
      ['Scheduled', 'In Progress', 'Arrived', 'AFKIR'].includes(rawStatusServis)
        ? rawStatusServis
        : 'Selesai'
    ) as ChassisAsset['statusServis'];

    const cleanField = (val: unknown, fallback = ''): string => {
      const s = String(val ?? '').trim();
      return s && s !== '-' ? s : fallback;
    };

    chaMap.set(idUnit, {
      idUnit,
      tipeChassis: cleanField(r[3], prev?.tipeChassis || ''),
      targetUkuranBan: '1000',
      masaKIR: cleanField(r[4], prev?.masaKIR || ''),
      statusKIR,
      statusMilik: 'BMI',
      statusServis,
      tglMulai: cleanField(r[27], prev?.tglMulai || ''),
      targetSelesai: cleanField(r[28], prev?.targetSelesai || ''),
      catatan: cleanField(r[31], cleanField(r[23], prev?.catatan || '')),
      pic: cleanField(r[25], prev?.pic || ''),
      karoseri: cleanField(r[32], prev?.karoseri || ''),
      tahun: cleanNumeric(r[33]) || prev?.tahun || undefined,
      gvw: cleanNumeric(r[34]) || prev?.gvw || undefined,
      tare: cleanNumeric(r[35]) || prev?.tare || undefined,
      landingGear: cleanField(r[36], prev?.landingGear || ''),
      sistemRem: cleanField(r[37], prev?.sistemRem || ''),
      vin: cleanField(r[38], prev?.vin || '')
    });
  });
  return Array.from(chaMap.values());
}

/**
 * Deduplicate GNZ (LOG) rows by Kode Genset, keeping the LATEST row per genset.
 */
export function parseGnzLogRows(rows: any[][]): GensetAsset[] {
  const gnzMap = new Map<string, GensetAsset>();
  rows.forEach((r) => {
    const idUnit = String(r[2] || '').trim().toUpperCase();
    if (!idUnit || idUnit.includes('KODE') || idUnit === '-') return;
    const prev = gnzMap.get(idUnit);
    const rawTipe = String(r[3] || (prev ? prev.tipeGenset : 'Clip-On')).trim();
    const tipeGenset = rawTipe.toLowerCase().includes('under') ? 'Underslung' : 'Clip-On';
    const rawServis = String(r[28] || 'Selesai').trim();
    const statusServis: GensetAsset['statusServis'] = (
      ['Scheduled', 'In Progress', 'Arrived', 'AFKIR'].includes(rawServis) ? rawServis : 'Selesai'
    ) as GensetAsset['statusServis'];

    const tglMulaiRaw = String(r[25] || '').trim();
    const targetSelesaiRaw = String(r[26] || '').trim();

    gnzMap.set(idUnit, {
      idUnit,
      tipeGenset,
      merkKapasitas: String(r[4] || (prev ? prev.merkKapasitas : '')).trim(),
      jamKerja: cleanNumeric(r[5]) || (prev ? prev.jamKerja : 0),
      servisTerakhir: cleanNumeric(r[6]) || (prev ? prev.servisTerakhir : 0),
      intervalServis: cleanNumeric(r[7]) || (prev ? prev.intervalServis : 250),
      statusServis,
      tglMulai: tglMulaiRaw && tglMulaiRaw !== '-' ? tglMulaiRaw : prev?.tglMulai || '',
      targetSelesai:
        targetSelesaiRaw && targetSelesaiRaw !== '-' ? targetSelesaiRaw : prev?.targetSelesai || '',
      catatan: String(r[23] || prev?.catatan || '').trim(),
      pic: String(r[22] || prev?.pic || '').trim()
    });
  });
  return standardizeGensetIdList(Array.from(gnzMap.values())).gensets;
}

/**
 * Deduplicate Ban (LOG) rows by ID Ban Fisik, keeping the LATEST row per physical tire
 * and resolving active positions vs warehouse stock vs historical/vendor rows.
 */
export function parseBanLogRows(rows: any[][]): TireAsset[] {
  const tireMap = new Map<string, TireAsset>();
  rows.forEach((r) => {
    const idFisik = String(r[3] || '').trim().toUpperCase();
    if (!idFisik || idFisik.includes('FISIK') || idFisik === '-') return;
    const prev = tireMap.get(idFisik);
    const siklusRaw = String(r[4] || (prev ? prev.siklus : 'R0')).trim().toUpperCase();
    const siklus = (['R0', 'R1', 'R2', 'RJ'].includes(siklusRaw) ? siklusRaw : 'R0') as TireAsset['siklus'];
    const idSiklus = String(r[2] || `${idFisik}${siklus}`).trim();
    const dotRaw = String(r[5] || r[6] || '').trim();
    const dot = dotRaw && dotRaw !== '-' ? dotRaw : prev?.dot || '';
    const unitRaw = String(r[7] || (prev ? prev.unitTerpasang : 'Gudang SBY')).trim();
    const unitUpper = unitRaw.toUpperCase();
    const posRaw = String(r[8] || (prev ? prev.posisiRoda : 'GUDANG')).trim().toUpperCase();
    const merkRaw = String(r[9] || '').trim();
    const merk = merkRaw && merkRaw !== '-' ? merkRaw : prev?.merk || '';
    const ukuran = normalizeTireSize(r[10], prev ? prev.ukuran : '1000');
    const kmTempuh = cleanNumeric(r[15]) || (prev ? prev.kmTempuh : 0);
    const rawStatus = String(r[17] || 'Spare / Gudang').trim();
    const catatanRaw = String(r[20] || '').trim();
    const catatan = catatanRaw && catatanRaw !== '-' ? catatanRaw : '';
    const tglMasuk = String(r[11] || r[1] || (prev ? prev.tglMasuk : ''))
      .trim()
      .slice(0, 10);
    const konstruksi = String(r[24] || (prev ? prev.konstruksi : 'Radial')).trim();
    const harga = cleanNumeric(r[25]) || (prev ? prev.harga : 0);
    const vendorRaw = String(r[26] || r[31] || '').trim();
    const vendor = vendorRaw && vendorRaw !== '-' ? vendorRaw : '';

    let statusKelayakan: TireAsset['statusKelayakan'] = 'Spare / Gudang';
    const isInstalledOnVehicle =
      !unitUpper.includes('GUDANG') &&
      !unitUpper.includes('BENGKEL') &&
      !unitUpper.includes('VENDOR') &&
      !unitUpper.includes('AFKIR') &&
      posRaw !== 'GUDANG' &&
      posRaw !== 'BENGKEL' &&
      posRaw !== 'VENDOR' &&
      posRaw !== 'AFKIR';

    if (unitUpper.includes('AFKIR') || rawStatus === 'Afkir / Dibuang') {
      statusKelayakan = 'Afkir / Dibuang';
    } else if (unitUpper.includes('VENDOR')) {
      statusKelayakan = 'Histori (Terupdate)';
    } else if (rawStatus === 'Aktif Terpasang' || (rawStatus === 'Histori (Terupdate)' && isInstalledOnVehicle)) {
      statusKelayakan = 'Aktif Terpasang';
    } else if (rawStatus === 'Histori (Terupdate)') {
      statusKelayakan = 'Histori (Terupdate)';
    } else {
      statusKelayakan = 'Spare / Gudang';
    }

    const formattedUnit =
      unitUpper.includes('GUDANG') || unitUpper.includes('BENGKEL') || unitUpper.includes('VENDOR')
        ? unitRaw
        : normalizeUnitId(unitRaw);

    tireMap.set(idFisik, {
      idSiklus,
      idBanFisik: idFisik,
      siklus,
      dot,
      unitTerpasang: formattedUnit,
      posisiRoda: posRaw,
      merk,
      ukuran,
      kmTempuh,
      statusKelayakan,
      catatanKondisi: catatan,
      tglMasuk,
      konstruksi,
      harga,
      vendor
    });
  });

  // Ensure only the latest tire installed on a given (unitTerpasang, posisiRoda) remains 'Aktif Terpasang'
  const posOwner = new Map<string, string>();
  for (const [id, t] of tireMap.entries()) {
    if (t.statusKelayakan === 'Aktif Terpasang') {
      posOwner.set(`${t.unitTerpasang}:${t.posisiRoda}`, id);
    }
  }
  for (const [id, t] of tireMap.entries()) {
    if (t.statusKelayakan === 'Aktif Terpasang') {
      if (posOwner.get(`${t.unitTerpasang}:${t.posisiRoda}`) !== id) {
        t.statusKelayakan = 'Histori (Terupdate)';
      }
    }
  }

  return Array.from(tireMap.values());
}

/**
 * Parse SCH (Maintenance Queue) rows into WorkOrder items, deduplicated by woId.
 */
export function parseSchQueueRows(rows: any[][]): WorkOrder[] {
  const woMap = new Map<string, WorkOrder>();
  rows.forEach((r) => {
    const col0 = String(r[0] || '').trim();
    if (!col0.startsWith('WO-')) return;
    const rawKat = String(r[2] || 'TRUK').trim().toUpperCase();
    const kategori: WorkOrder['kategori'] =
      rawKat === 'CHASSIS' ? 'CHASSIS' : rawKat === 'GENSET' ? 'GENSET' : 'TRUK';
    const idUnit = normalizeUnitId(r[3]);
    if (!idUnit) return;

    const rawStatus = String(r[8] || 'SCHEDULED').trim().toUpperCase();
    const validStatuses: WOStatus[] = [
      'SCHEDULED',
      'ARRIVED',
      'IN PROGRESS',
      'WAITING PART',
      'READY FOR QC',
      'COMPLETED & RELEASED',
      'CANCELLED'
    ];
    const status: WOStatus = (
      validStatuses.includes(rawStatus as WOStatus) ? rawStatus : 'SCHEDULED'
    ) as WOStatus;

    const rawPrio = String(r[16] || 'Normal');
    const prioritas: WorkOrder['prioritas'] = rawPrio.toLowerCase().includes('darurat')
      ? 'Darurat / Breakdown'
      : rawPrio.toLowerCase().includes('mendesak')
      ? 'Mendesak'
      : 'Normal';

    const rawBay = String(r[19] || 'Bay 1').trim();
    const bay = (
      ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6'].includes(rawBay) ? rawBay : 'Bay 1'
    ) as WorkOrder['bay'];

    woMap.set(col0, {
      woId: col0,
      timestamp: String(r[1] || '').trim(),
      kategori,
      idUnit,
      jenisServis: String(r[4] || 'Perbaikan').trim(),
      tglRencana: String(r[5] || '').trim(),
      teknisi: String(r[6] || '').trim(),
      keluhan: String(r[7] || '').trim(),
      status,
      tArrived: String(r[9] || '').trim() || undefined,
      tMulai: String(r[10] || '').trim() || undefined,
      tSelesai: String(r[11] || '').trim() || undefined,
      tRilis: String(r[12] || '').trim() || undefined,
      pic: String(r[13] || '').trim(),
      fotoBefore: String(r[14] || '').trim() || undefined,
      fotoAfter: String(r[15] || '').trim() || undefined,
      prioritas,
      odo: cleanNumeric(r[17]) || undefined,
      tEst: String(r[18] || '').trim() || undefined,
      bay,
      downtime: cleanNumeric(r[20]) || undefined,
      klasifikasi: (String(r[21] || '').trim() as any) || undefined,
      alasanHapus: String(r[22] || '').trim() || undefined,
      terakhirDiubah: String(r[23] || '').trim() || undefined
    });
  });
  return Array.from(woMap.values());
}

/**
 * Parse PART (LOG) rows into PartRequest items.
 */
export function parsePartLogRows(rows: any[][]): PartRequest[] {
  const list: PartRequest[] = [];
  rows.forEach((r) => {
    const txId = String(r[0] || '').trim();
    if (!txId || txId.toUpperCase().includes('ID LOG')) return;
    list.push({
      txId,
      ts: String(r[1] || '').trim(),
      woId: String(r[2] || '').trim(),
      noLambung: String(r[3] || '').trim(),
      nopol: normalizeUnitId(r[4]),
      sku: String(r[5] || '').trim(),
      namaPart: String(r[6] || '').trim(),
      kategoriPart: String(r[7] || '').trim(),
      qty: cleanNumeric(r[8]) || 1,
      hargaSatuan: cleanNumeric(r[9]),
      total: cleanNumeric(r[10]),
      mekanik: String(r[11] || '').trim(),
      petugasGudang: String(r[12] || '').trim(),
      keterangan: String(r[13] || '').trim(),
      status: 'Approved'
    });
  });
  return list;
}

/**
 * Parse MASTER PART rows into MasterPart items.
 */
export function parseMasterPartRows(rows: any[][]): MasterPart[] {
  const list: MasterPart[] = [];
  rows.forEach((r) => {
    const sku = String(r[0] || '').trim();
    if (!sku || sku.toUpperCase() === 'SKU') return;
    list.push({
      sku,
      kategori: String(r[1] || 'Lainnya').trim(),
      nama: String(r[2] || sku).trim(),
      harga: cleanNumeric(r[3]),
      stok: cleanNumeric(r[4]),
      min: cleanNumeric(r[5]),
      updatedAt: String(r[6] || '').trim()
    });
  });
  return list;
}

/**
 * Parse INC (LOG) rows into IncidentReport items.
 */
export function parseIncLogRows(rows: any[][]): IncidentReport[] {
  const list: IncidentReport[] = [];
  rows.forEach((r) => {
    const idInc = String(r[0] || '').trim();
    if (!idInc || idInc.toUpperCase().includes('ID INSIDEN')) return;
    const ts = String(r[1] || '').trim();
    const rawStatus = String(r[17] || 'Selesai').trim();
    const status: IncidentReport['status'] =
      rawStatus === 'Selesai'
        ? 'Selesai'
        : rawStatus === 'Proses Klaim' || rawStatus === 'Klaim Cair'
        ? rawStatus
        : 'Belum Diklaim';

    list.push({
      idLaka: idInc,
      jenisLog: 'INC',
      tgl: ts.slice(0, 10),
      kategoriUnit: String(r[2] || '').trim(),
      idUnit: normalizeUnitId(r[3]),
      supir: String(r[4] || '').trim(),
      lokasi: String(r[5] || '').trim(),
      kategoriKendala: String(r[6] || '').trim(),
      kronologi: String(r[7] || '').trim(),
      tingkatKeparahan: String(r[8] || '').trim(),
      waktuMulai: String(r[9] || '').trim(),
      waktuSelesai: String(r[10] || '').trim(),
      durasiDowntime: String(r[11] || '').trim(),
      tindakanMitigasi: String(r[12] || '').trim(),
      teknisiVendor: String(r[13] || '').trim(),
      biayaDerek: cleanNumeric(r[14]),
      biayaDarurat: cleanNumeric(r[15]),
      kerugian: cleanNumeric(r[16]),
      status,
      pic: String(r[13] || '').trim(),
      timestamp: ts
    });
  });
  return list;
}

/**
 * Parse LAKA (LOG) rows into IncidentReport items.
 */
export function parseLakaLogRows(rows: any[][]): IncidentReport[] {
  const list: IncidentReport[] = [];
  rows.forEach((r) => {
    const idLaka = String(r[0] || '').trim();
    if (!idLaka || idLaka.toUpperCase().includes('ID LAKA')) return;
    const rawStatus = String(r[7] || 'Belum Diklaim').trim();
    const status: IncidentReport['status'] =
      rawStatus === 'Proses Klaim' || rawStatus === 'Klaim Cair' ? rawStatus : 'Belum Diklaim';
    list.push({
      idLaka,
      jenisLog: 'LAKA',
      tgl: String(r[1] || '').trim(),
      idUnit: normalizeUnitId(r[2]),
      supir: String(r[3] || '').trim(),
      lokasi: String(r[4] || '').trim(),
      kronologi: String(r[5] || '').trim(),
      kerugian: cleanNumeric(r[6]),
      status,
      pic: String(r[8] || '').trim(),
      timestamp: String(r[9] || '').trim()
    });
  });
  return list;
}

/**
 * Directly synchronize all LOG sheets from a Google Spreadsheet via public GViz CSV
 * (works automatically without requiring user OAuth login when the sheet is link-shared).
 */
export async function fetchAllLiveSheetsPublic(
  spreadsheetId: string = DEFAULT_BMI_SPREADSHEET_ID,
  sheetFilter?: Record<string, boolean>
): Promise<LiveSyncedDataset> {
  const shouldFetch = (name: string) => !sheetFilter || sheetFilter[name] !== false;
  const dataset: LiveSyncedDataset = { totalExtractedRows: 0 };
  const collectedIncidents: IncidentReport[] = [];

  const tasks: Promise<void>[] = [];

  if (shouldFetch('User Access')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'User Access')
        .then((rows) => {
          const users = parseUserAccessSheetRows(rows.slice(1));
          if (users.length > 0) {
            saveUserAccessList(users);
            dataset.totalExtractedRows += users.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('PARAMETER')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'Parameter')
        .then((rows) => {
          const params = parseSheetParameters(rows);
          if (params.length > 0) {
            dataset.parameters = params;
            dataset.totalExtractedRows += params.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('TRK (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'TRK (LOG)')
        .then((rows) => {
          const trucks = parseTrkLogRows(rows.slice(1));
          if (trucks.length > 0) {
            dataset.trucks = trucks;
            dataset.totalExtractedRows += trucks.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('CHA (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'CHA (LOG)')
        .then((rows) => {
          const chassis = parseChaLogRows(rows.slice(1));
          if (chassis.length > 0) {
            dataset.chassis = chassis;
            dataset.totalExtractedRows += chassis.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('GNZ (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'GNZ (LOG)')
        .then((rows) => {
          const gensets = parseGnzLogRows(rows.slice(1));
          if (gensets.length > 0) {
            dataset.gensets = gensets;
            dataset.totalExtractedRows += gensets.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('Ban (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'Ban (LOG)')
        .then((rows) => {
          const tires = parseBanLogRows(rows.slice(1));
          if (tires.length > 0) {
            dataset.tires = tires;
            dataset.totalExtractedRows += tires.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('SCH (Maintenance Queue)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'SCH (Maintenance Queue)')
        .then((rows) => {
          const wos = parseSchQueueRows(rows);
          if (wos.length > 0) {
            dataset.workOrders = wos;
            dataset.totalExtractedRows += wos.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('PART (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'PART (LOG)')
        .then((rows) => {
          const reqs = parsePartLogRows(rows.slice(1));
          if (reqs.length > 0) {
            dataset.partRequests = reqs;
            dataset.totalExtractedRows += reqs.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('MASTER PART')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'MASTER PART')
        .then((rows) => {
          const parts = parseMasterPartRows(rows.slice(1));
          if (parts.length > 0) {
            dataset.parts = parts;
            dataset.totalExtractedRows += parts.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('INC (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'INC (LOG)')
        .then((rows) => {
          const incs = parseIncLogRows(rows.slice(1));
          if (incs.length > 0) {
            collectedIncidents.push(...incs);
            dataset.totalExtractedRows += incs.length;
          }
        })
        .catch(() => {})
    );
  }

  if (shouldFetch('LAKA (LOG)')) {
    tasks.push(
      fetchPublicSheetCsvRows(spreadsheetId, 'LAKA (LOG)')
        .then((rows) => {
          const lakas = parseLakaLogRows(rows.slice(1));
          if (lakas.length > 0) {
            collectedIncidents.push(...lakas);
            dataset.totalExtractedRows += lakas.length;
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
  if (collectedIncidents.length > 0) {
    dataset.incidents = collectedIncidents;
  }
  return dataset;
}
