import {
  TruckAsset,
  MaintenanceParameter,
  ComponentHealthStatus,
  WorkOrder
} from '../types';

export const ROUTINE_SERVICE_INTERVAL_KM = 10000;
export const WARNING_THRESHOLD_KM = 1000;

export interface ComponentReplacementLog {
  id: string;
  tanggal: string;
  nopol: string;
  noLambung: string;
  kodePm: string;
  komponen: string;
  kmGanti: number;
  biayaPart: number;
  keterangan: string;
}

/**
 * 25 Parameter Komponen Preventive Maintenance Resmi Standar Workshop BMI
 */
export const DEFAULT_MAINTENANCE_PARAMETERS: MaintenanceParameter[] = [
  {
    id: 'PM-TRK-01',
    kodePm: 'PM-TRK-01',
    komponen: 'Oli Mesin',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Penggantian oli mesin 15W-40 CI-4',
    skuDefault: 'OIL-ENG-15W40',
    namaPartDefault: 'Pertamina Meditran SX 15W-40 (Liter)'
  },
  {
    id: 'PM-TRK-02',
    kodePm: 'PM-TRK-02',
    komponen: 'Filter Oli Mesin',
    kategori: 'Filter & Udara',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Penggantian elemen saringan oli mesin',
    skuDefault: 'FLT-OIL-01',
    namaPartDefault: 'Oil Filter Hino 500 / Isuzu Giga'
  },
  {
    id: 'PM-TRK-03',
    kodePm: 'PM-TRK-03',
    komponen: 'Filter Solar Atas',
    kategori: 'Filter & Udara',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Penggantian fuel filter secondary',
    skuDefault: 'FLT-FUL-SEC',
    namaPartDefault: 'Fuel Filter Secondary Atas'
  },
  {
    id: 'PM-TRK-04',
    kodePm: 'PM-TRK-04',
    komponen: 'Filter Solar Bawah / Separator',
    kategori: 'Filter & Udara',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Penggantian fuel water separator',
    skuDefault: 'FLT-FUL-SEP',
    namaPartDefault: 'Fuel Water Separator Filter'
  },
  {
    id: 'PM-TRK-05',
    kodePm: 'PM-TRK-05',
    komponen: 'Filter Udara',
    kategori: 'Filter & Udara',
    kategoriArmada: 'TRUK',
    intervalKm: 24000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Penggantian air cleaner element',
    skuDefault: 'FLT-AIR-01',
    namaPartDefault: 'Air Filter Element'
  },
  {
    id: 'PM-TRK-06',
    kodePm: 'PM-TRK-06',
    komponen: 'Oli Transmisi',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 24000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Penggantian oli transmisi SAE 90 GL-4',
    skuDefault: 'OIL-TRN-90',
    namaPartDefault: 'Pertamina Rored EPA 90 (Liter)'
  },
  {
    id: 'PM-TRK-07',
    kodePm: 'PM-TRK-07',
    komponen: 'Oli Gardan / Differential',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 24000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Penggantian oli gardan SAE 140 GL-5',
    skuDefault: 'OIL-GRD-140',
    namaPartDefault: 'Pertamina Rored HDA 140 (Liter)'
  },
  {
    id: 'PM-TRK-08',
    kodePm: 'PM-TRK-08',
    komponen: 'Grease Chassis & Propeller Shaft',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 6000,
    warningThresholdKm: 500,
    deskripsiPekerjaan: 'Pelumasan nipel chassis, king pin & spider joint',
    skuDefault: 'GRS-EP2',
    namaPartDefault: 'Lithium Grease EP-2 (KG)'
  },
  {
    id: 'PM-TRK-09',
    kodePm: 'PM-TRK-09',
    komponen: 'Kampas Rem Roda Depan',
    kategori: 'Pengereman & Kemudi',
    kategoriArmada: 'TRUK',
    intervalKm: 36000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Pengecekan tebal & penggantian brake shoe depan',
    skuDefault: 'BRK-SH-FR',
    namaPartDefault: 'Brake Lining Set Front'
  },
  {
    id: 'PM-TRK-10',
    kodePm: 'PM-TRK-10',
    komponen: 'Kampas Rem Roda Belakang',
    kategori: 'Pengereman & Kemudi',
    kategoriArmada: 'TRUK',
    intervalKm: 36000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Pengecekan tebal & penggantian brake shoe belakang',
    skuDefault: 'BRK-SH-RR',
    namaPartDefault: 'Brake Lining Set Rear'
  },
  {
    id: 'PM-TRK-11',
    kodePm: 'PM-TRK-11',
    komponen: 'Air Dryer Filter / Cartridge',
    kategori: 'Pengereman & Kemudi',
    kategoriArmada: 'TRUK',
    intervalKm: 48000,
    warningThresholdKm: 3000,
    deskripsiPekerjaan: 'Penggantian cartridge desiccant sistem angin',
    skuDefault: 'FLT-AIR-DRY',
    namaPartDefault: 'Air Dryer Desiccant Cartridge'
  },
  {
    id: 'PM-TRK-12',
    kodePm: 'PM-TRK-12',
    komponen: 'Minyak Kopling / Brake Fluid',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 24000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Kuras & ganti minyak kopling DOT 3 / DOT 4',
    skuDefault: 'OIL-DOT4',
    namaPartDefault: 'Brake Fluid DOT 4 (Botol)'
  },
  {
    id: 'PM-TRK-13',
    kodePm: 'PM-TRK-13',
    komponen: 'Air Radiator / Coolant',
    kategori: 'Pendingin & Mesin',
    kategoriArmada: 'TRUK',
    intervalKm: 48000,
    warningThresholdKm: 3000,
    deskripsiPekerjaan: 'Kuras radiator & pengisian coolant 50/50',
    skuDefault: 'CLN-RAD-01',
    namaPartDefault: 'Heavy Duty Radiator Coolant (Liter)'
  },
  {
    id: 'PM-TRK-14',
    kodePm: 'PM-TRK-14',
    komponen: 'V-Belt Alternator & Fan',
    kategori: 'Pendingin & Mesin',
    kategoriArmada: 'TRUK',
    intervalKm: 40000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Pemeriksaan retak/kendur & penggantian fan belt',
    skuDefault: 'BLT-FAN-01',
    namaPartDefault: 'Fan Belt Set Heavy Duty'
  },
  {
    id: 'PM-TRK-15',
    kodePm: 'PM-TRK-15',
    komponen: 'V-Belt Kompresor AC',
    kategori: 'Pendingin & Mesin',
    kategoriArmada: 'TRUK',
    intervalKm: 40000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Penggantian tali kipas kompresor AC kabin',
    skuDefault: 'BLT-AC-01',
    namaPartDefault: 'V-Belt Kompresor AC'
  },
  {
    id: 'PM-TRK-16',
    kodePm: 'PM-TRK-16',
    komponen: 'Grease Wheel Bearing (Stel Roda)',
    kategori: 'Sasis & Kaki-kaki',
    kategoriArmada: 'TRUK',
    intervalKm: 24000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Bongkar, cuci bearing roda & repacking grease',
    skuDefault: 'GRS-BRG-HT',
    namaPartDefault: 'High Temp Wheel Bearing Grease'
  },
  {
    id: 'PM-TRK-17',
    kodePm: 'PM-TRK-17',
    komponen: 'Spooring & Kesejajaran Axle',
    kategori: 'Sasis & Kaki-kaki',
    kategoriArmada: 'TRUK',
    intervalKm: 20000,
    warningThresholdKm: 1500,
    deskripsiPekerjaan: 'Penyetelan toe-in / toe-out & kelurusan gandar',
    skuDefault: 'SRV-SPOR-01',
    namaPartDefault: 'Jasa Spooring Axle Truk'
  },
  {
    id: 'PM-TRK-18',
    kodePm: 'PM-TRK-18',
    komponen: 'Baterai / Aki (Pemeriksaan BJ)',
    kategori: 'Kelistrikan',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Cek berat jenis air aki, tegangan charging & kutub',
    skuDefault: 'BAT-12V-N120',
    namaPartDefault: 'Aki Basah 12V 120Ah'
  },
  {
    id: 'PM-TRK-19',
    kodePm: 'PM-TRK-19',
    komponen: 'Rotasi Ban (Tire Rotation)',
    kategori: 'Sasis & Kaki-kaki',
    kategoriArmada: 'TRUK',
    intervalKm: 15000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Rotasi silang & pemindahan ban sesuai tingkat keausan',
    skuDefault: 'SRV-ROT-BAN',
    namaPartDefault: 'Jasa Rotasi Ban Truk'
  },
  {
    id: 'PM-TRK-20',
    kodePm: 'PM-TRK-20',
    komponen: 'Oli Power Steering',
    kategori: 'Oli & Pelumas',
    kategoriArmada: 'TRUK',
    intervalKm: 48000,
    warningThresholdKm: 3000,
    deskripsiPekerjaan: 'Kuras & ganti oli power steering ATF Dexron III',
    skuDefault: 'OIL-ATF-D3',
    namaPartDefault: 'Automatic Transmission Fluid ATF Dexron III'
  },
  {
    id: 'PM-TRK-21',
    kodePm: 'PM-TRK-21',
    komponen: 'Kalibrasi / Uji Nozzle Injector',
    kategori: 'Pendingin & Mesin',
    kategoriArmada: 'TRUK',
    intervalKm: 60000,
    warningThresholdKm: 5000,
    deskripsiPekerjaan: 'Tes semprotan & kalibrasi tekanan injektor solar',
    skuDefault: 'SRV-INJ-CAL',
    namaPartDefault: 'Jasa Kalibrasi Injector Common Rail'
  },
  {
    id: 'PM-TRK-22',
    kodePm: 'PM-TRK-22',
    komponen: 'Stel Klep / Valve Clearance',
    kategori: 'Pendingin & Mesin',
    kategoriArmada: 'TRUK',
    intervalKm: 40000,
    warningThresholdKm: 3000,
    deskripsiPekerjaan: 'Penyetelan kerenggangan katup hisap & buang mesin',
    skuDefault: 'SRV-VLV-ADJ',
    namaPartDefault: 'Jasa Tune Up & Stel Klep Mesin'
  },
  {
    id: 'PM-TRK-23',
    kodePm: 'PM-TRK-23',
    komponen: 'Baut Roda & Torsi Nut Axle',
    kategori: 'Sasis & Kaki-kaki',
    kategoriArmada: 'TRUK',
    intervalKm: 6000,
    warningThresholdKm: 500,
    deskripsiPekerjaan: 'Pengecekan kekencangan torsi baut roda dengan torque wrench',
    skuDefault: 'SRV-TORQ-WHL',
    namaPartDefault: 'Jasa Torsi Baut Roda'
  },
  {
    id: 'PM-TRK-24',
    kodePm: 'PM-TRK-24',
    komponen: 'U-Bolt & Baut Gantungan Per Daun',
    kategori: 'Sasis & Kaki-kaki',
    kategoriArmada: 'TRUK',
    intervalKm: 12000,
    warningThresholdKm: 1000,
    deskripsiPekerjaan: 'Pengecekan torsi U-bolt pegas daun & bushing per',
    skuDefault: 'PRT-UBOLT-01',
    namaPartDefault: 'U-Bolt Spring Rear Axle'
  },
  {
    id: 'PM-TRK-25',
    kodePm: 'PM-TRK-25',
    komponen: 'Uji KIR & Emisi Berkala (Dishub)',
    kategori: 'Kepatuhan & Sertifikasi',
    kategoriArmada: 'TRUK',
    intervalKm: 25000,
    warningThresholdKm: 2000,
    deskripsiPekerjaan: 'Uji kelaikan jalan KIR berkala 6 bulanan Dishub',
    skuDefault: 'ADM-KIR-DSH',
    namaPartDefault: 'Retribusi Uji Berkala KIR Dishub'
  }
];

/**
 * Filter dan evaluasi kesehatan 25 komponen PM resmi untuk unit truk.
 * Menghilangkan sepenuhnya data sampah (R0, R2, B1, B2, Level 1..5, AMBANG BATAS, dll.).
 */
export function evaluateTruckComponents(
  truck: TruckAsset,
  parameters: MaintenanceParameter[] = DEFAULT_MAINTENANCE_PARAMETERS,
  componentLogs: ComponentReplacementLog[] = []
): ComponentHealthStatus[] {
  const currentKm = truck.kmSaatIni || 0;
  const lastBase = truck.kmServisTerakhir || 0;

  // Sanitasi ketat: hanya izinkan komponen PM valid
  const sanitizedParams = (parameters && parameters.length > 0 ? parameters : DEFAULT_MAINTENANCE_PARAMETERS).filter(
    (p) => {
      if (!p || !p.komponen) return false;
      const k = p.komponen.trim();
      // Filter out junk rows from Section I/II/III
      if (/^(R0|RJ|R1|R2|B1|B2|Storage|Level \d|II\. AMBANG|PETUNJUK|CPK_)/i.test(k)) return false;
      if (k.toLowerCase().includes('ambang batas') || k.toLowerCase().includes('catatan sistem')) return false;
      if (p.intervalKm < 1000) return false;
      return true;
    }
  );

  // Sesuaikan dengan jenis armada (Commercial Heavy Duty Truk vs Niaga Ringan vs Penumpang)
  const armadaType = (truck.jenisArmada || '').toLowerCase();
  let targetParams = sanitizedParams;

  if (armadaType.includes('support') || armadaType.includes('l300') || armadaType.includes('box') || armadaType.includes('pick up')) {
    const supportOnly = sanitizedParams.filter((p) => p.kategoriArmada === 'SUPPORT');
    if (supportOnly.length > 0) targetParams = supportOnly;
  } else if (armadaType.includes('passenger') || armadaType.includes('innova') || armadaType.includes('zenix') || armadaType.includes('mpv')) {
    const passOnly = sanitizedParams.filter((p) => p.kategoriArmada === 'PASSENGER');
    if (passOnly.length > 0) targetParams = passOnly;
  } else {
    // Default: Commercial Heavy Duty Truck (Head Truck, Tronton, Engkel, Dump)
    const trukOnly = sanitizedParams.filter((p) => !p.kategoriArmada || p.kategoriArmada === 'TRUK');
    if (trukOnly.length > 0) targetParams = trukOnly;
  }

  // Jika setelah difilter kosong, gunakan default 25 komponen PM TRK
  if (targetParams.length === 0) {
    targetParams = DEFAULT_MAINTENANCE_PARAMETERS;
  }

  return targetParams.map((param) => {
    let lastReplacedKm = lastBase;
    let tglTerakhirGanti: string | undefined;
    let sumberData: 'LOGBOOK' | 'ESTIMASI' = 'ESTIMASI';

    if (truck.lastComponentService && truck.lastComponentService[param.id] !== undefined) {
      lastReplacedKm = truck.lastComponentService[param.id];
    }

    // Logbook penggantian komponen (jika ada) menjadi sumber paling akurat
    const kode = param.kodePm || param.id;
    const relatedLogs = componentLogs.filter(
      (l) => l && (l.kodePm === kode || l.kodePm === param.id)
    );
    if (relatedLogs.length > 0) {
      const latest = relatedLogs.reduce((a, b) => (Number(a.kmGanti) >= Number(b.kmGanti) ? a : b));
      if (Number(latest.kmGanti) > lastReplacedKm) {
        lastReplacedKm = Number(latest.kmGanti);
        tglTerakhirGanti = latest.tanggal;
        sumberData = 'LOGBOOK';
      }
    }

    const interval = param.intervalKm || ROUTINE_SERVICE_INTERVAL_KM;
    const warningBuffer = param.warningThresholdKm || WARNING_THRESHOLD_KM;

    // Kalkulasi target KM jatuh tempo berikutnya
    let nextTargetKm = lastReplacedKm + interval;
    if (nextTargetKm <= currentKm) {
      const cycles = Math.floor((currentKm - lastReplacedKm) / interval);
      nextTargetKm = lastReplacedKm + (cycles + 1) * interval;
    }

    const sisaKm = nextTargetKm - currentKm;
    const persenSisa = Math.max(0, Math.min(100, Math.round((sisaKm / interval) * 100)));

    let status: 'OVERDUE' | 'DUE_SOON' | 'SAFE' = 'SAFE';
    if (sisaKm <= 0) {
      status = 'OVERDUE';
    } else if (sisaKm <= warningBuffer) {
      status = 'DUE_SOON';
    }

    return {
      parameter: param,
      kmTerakhirGanti: lastReplacedKm,
      kmJatuhTempo: nextTargetKm,
      sisaKm,
      persenSisa,
      status,
      tglTerakhirGanti,
      sumberData
    };
  });
}

/**
 * Parsing cerdas tab 'Parameter' dari Google Sheets.
 * Hanya mengekstrak baris PM resmi dari Bagian IV (Kode PM: PM-TRK, PM-SUP, PM-PAS).
 * Menolak baris siklus ban, rumus conditional formatting, dan catatan teks.
 */
export function parseSheetParameters(rows: any[][]): MaintenanceParameter[] {
  if (!rows || rows.length <= 1) return DEFAULT_MAINTENANCE_PARAMETERS;

  const parsed: MaintenanceParameter[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();
    let code = '';
    let fleetCat = '';
    let namaServis = '';
    let intervalStr = '';
    let warningStr = '';
    let deskripsi = '';

    if (col1.toUpperCase().startsWith('PM-')) {
      code = col1.toUpperCase();
      fleetCat = String(row[2] || '').trim();
      namaServis = String(row[3] || '').trim();
      intervalStr = String(row[4] || '');
      warningStr = String(row[6] || '');
      deskripsi = String(row[11] || '');
    } else if (col0.toUpperCase().startsWith('PM-')) {
      code = col0.toUpperCase();
      fleetCat = String(row[1] || '').trim();
      namaServis = String(row[2] || '').trim();
      intervalStr = String(row[3] || '');
      warningStr = String(row[5] || '');
      deskripsi = String(row[10] || '');
    } else {
      // Lewati baris di luar Bagian IV (Siklus ban R0-B2, Ambang Batas Level 1-5, CPK, petunjuk)
      continue;
    }

    if (!namaServis || namaServis.length < 3) continue;

    const intervalKm = Number(intervalStr.replace(/[^0-9]/g, '')) || ROUTINE_SERVICE_INTERVAL_KM;
    const warningThresholdKm = Number(warningStr.replace(/[^0-9]/g, '')) || WARNING_THRESHOLD_KM;

    let kategoriArmada: 'TRUK' | 'SUPPORT' | 'PASSENGER' = 'TRUK';
    if (code.startsWith('PM-SUP') || fleetCat.toUpperCase().includes('SUPP')) {
      kategoriArmada = 'SUPPORT';
    } else if (code.startsWith('PM-PAS') || fleetCat.toUpperCase().includes('PASS')) {
      kategoriArmada = 'PASSENGER';
    }

    let kategori = 'Sasis & Kaki-kaki';
    const lowerName = namaServis.toLowerCase();
    if (lowerName.includes('oli') || lowerName.includes('grease') || lowerName.includes('pelumas')) {
      kategori = 'Oli & Pelumas';
    } else if (lowerName.includes('filter') || lowerName.includes('saringan') || lowerName.includes('separator')) {
      kategori = 'Filter & Udara';
    } else if (lowerName.includes('rem') || lowerName.includes('brake') || lowerName.includes('dryer')) {
      kategori = 'Pengereman & Kemudi';
    } else if (lowerName.includes('radiator') || lowerName.includes('belt') || lowerName.includes('injektor') || lowerName.includes('klep')) {
      kategori = 'Pendingin & Mesin';
    } else if (lowerName.includes('aki') || lowerName.includes('baterai') || lowerName.includes('lampu') || lowerName.includes('kabel')) {
      kategori = 'Kelistrikan';
    } else if (lowerName.includes('kir') || lowerName.includes('dishub') || lowerName.includes('stnk')) {
      kategori = 'Kepatuhan & Sertifikasi';
    }

    parsed.push({
      id: code,
      kodePm: code,
      komponen: namaServis,
      kategori,
      kategoriArmada,
      intervalKm,
      warningThresholdKm,
      deskripsiPekerjaan: deskripsi || `Servis rutin ${namaServis}`
    });
  }

  return parsed.length > 0 ? parsed : DEFAULT_MAINTENANCE_PARAMETERS;
}

/**
 * Filter parameter yang berlaku untuk unit truk tertentu.
 */
export function resolveParametersForTruck(
  truck: TruckAsset,
  parameters: MaintenanceParameter[] = DEFAULT_MAINTENANCE_PARAMETERS
): MaintenanceParameter[] {
  const armadaType = (truck.jenisArmada || '').toLowerCase();

  if (armadaType.includes('support') || armadaType.includes('l300') || armadaType.includes('box') || armadaType.includes('pick up')) {
    const res = parameters.filter((p) => p.kategoriArmada === 'SUPPORT');
    if (res.length > 0) return res;
  } else if (armadaType.includes('passenger') || armadaType.includes('innova') || armadaType.includes('zenix') || armadaType.includes('mpv')) {
    const res = parameters.filter((p) => p.kategoriArmada === 'PASSENGER');
    if (res.length > 0) return res;
  }

  const defaultTruk = parameters.filter((p) => !p.kategoriArmada || p.kategoriArmada === 'TRUK');
  return defaultTruk.length > 0 ? defaultTruk : parameters;
}

/**
 * Evaluasi status servis rutin keseluruhan unit truk.
 */
export function evaluateTruckRoutineService(
  truck: TruckAsset,
  intervalKmFallback: number = ROUTINE_SERVICE_INTERVAL_KM,
  parameters: MaintenanceParameter[] = DEFAULT_MAINTENANCE_PARAMETERS
): {
  kmServisBerikutnya: number;
  sisaKmServis: number;
  statusPm: 'OVERDUE' | 'DUE_SOON' | 'SAFE';
} {
  const currentKm = truck.kmSaatIni || 0;
  const lastKm = truck.kmServisTerakhir || 0;

  const intervalKm =
    truck.intervalServisKm ||
    (truck.jenisArmada && truck.jenisArmada.toLowerCase().includes('head') ? 12000 : 10000) ||
    intervalKmFallback;

  let nextServiceKm =
    truck.kmServisBerikutnya && truck.kmServisBerikutnya > 0
      ? truck.kmServisBerikutnya
      : lastKm + intervalKm;

  if (!truck.kmServisBerikutnya && nextServiceKm <= currentKm) {
    nextServiceKm = Math.ceil((currentKm - lastKm) / intervalKm) * intervalKm + lastKm;
    if (nextServiceKm === currentKm) nextServiceKm += intervalKm;
  }

  const sisaKm =
    truck.sisaKmServis !== undefined && truck.kmServisBerikutnya === nextServiceKm
      ? truck.sisaKmServis
      : nextServiceKm - currentKm;

  let statusPm: 'OVERDUE' | 'DUE_SOON' | 'SAFE' = 'SAFE';
  if (sisaKm <= 0) {
    statusPm = 'OVERDUE';
  } else if (sisaKm <= WARNING_THRESHOLD_KM) {
    statusPm = 'DUE_SOON';
  }

  return {
    kmServisBerikutnya: nextServiceKm,
    sisaKmServis: sisaKm,
    statusPm
  };
}

export function findBySlot(
  comps: ComponentHealthStatus[],
  slotKey: string
): ComponentHealthStatus | undefined {
  return comps.find(
    (c) => c.parameter.id === slotKey || c.parameter.slots?.includes(slotKey)
  );
}

/**
 * Builds an automated WorkOrder draft object for a truck based on due maintenance components.
 */
export function buildAutoWorkOrderDraft(
  truck: TruckAsset,
  dueComponents: ComponentHealthStatus[],
  userPic: string = 'Supervisor Workshop'
): Omit<WorkOrder, 'woId'> {
  const compNames = dueComponents.map((c) => c.parameter.komponen).join(', ');
  const hasOverdue = dueComponents.some((c) => c.status === 'OVERDUE');
  const today = new Date().toISOString().slice(0, 10);

  return {
    kategori: 'TRUK',
    idUnit: truck.idUnit,
    jenisServis: 'PM Berkala (Auto-Generated)',
    tglRencana: today,
    teknisi: 'Tim Mekanik Bay',
    keluhan: compNames ? `Perawatan berkala komponen jatuh tempo: ${compNames}` : 'Perawatan servis berkala PM',
    status: 'SCHEDULED',
    pic: userPic,
    prioritas: hasOverdue ? 'Mendesak' : 'Normal',
    odo: truck.kmSaatIni || 0,
    bay: 'Bay 1',
    klasifikasi: hasOverdue ? 'Sedang' : 'Ringan'
  };
}
