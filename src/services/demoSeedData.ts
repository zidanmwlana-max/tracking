import type {
  TruckAsset,
  ChassisAsset,
  GensetAsset,
  TireAsset,
  WorkOrder,
  MasterPart,
  PartRequest,
  IncidentReport
} from '../types';

/**
 * Fase 2.7: UU PDP No. 27/2022 & Japan APPI-Compliant Anonymized Demo Seed Dataset
 * Ensures zero real employee PII, zero real company license plates, and zero confidential vendor pricing
 * are exposed when running in Public Portfolio / Recruiter Demo Mode (`VITE_DEMO_MODE=true`).
 */

const DEMO_MODE_STORAGE_KEY = 'bmi_portfolio_demo_mode';

export function isPortfolioDemoMode(): boolean {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_MODE === 'true'
    ) {
      return true;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
    }
  } catch {
    // Ignore environment access errors
  }
  return false;
}

export function setPortfolioDemoMode(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (enabled) {
        localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export const DEMO_SAFE_TRUCKS: TruckAsset[] = [
  {
    idUnit: 'B9101DX',
    noLambung: 'BMI-HTR001',
    jenisArmada: 'Head Truck',
    merkModel: 'HINO 500 Ranger FM260JD (Unit Demo A)',
    kmSaatIni: 248500,
    kmServisTerakhir: 240000,
    intervalServisKm: 12000,
    kmServisBerikutnya: 252000,
    sisaKmServis: 3500,
    targetUkuranBan: '1000',
    statusServis: 'Selesai',
    tglMulai: '2026-10-20',
    targetSelesai: '2026-10-21',
    keluhan: 'Inspeksi Berkala 240.000 KM',
    catatanBengkel: 'Tekanan pengereman & sistem suspensi normal',
    pic: 'Teknisi Demo 01',
    masaSTNK: '2027-08-15',
    masaPajak: '2027-08-15',
    kepemilikan: 'BMI'
  },
  {
    idUnit: 'B9102DX',
    noLambung: 'BMI-HTR002',
    jenisArmada: 'Head Truck',
    merkModel: 'ISUZU Giga FVM 285 PS (Unit Demo B)',
    kmSaatIni: 189400,
    kmServisTerakhir: 180000,
    intervalServisKm: 12000,
    kmServisBerikutnya: 192000,
    sisaKmServis: 2600,
    targetUkuranBan: '1000',
    statusServis: 'In Progress',
    tglMulai: '2026-11-01',
    targetSelesai: '2026-11-05',
    keluhan: 'Penggantian Kampas Rem & Kalibrasi Injektor',
    catatanBengkel: 'Menunggu suku cadang kampas rem axle belakang',
    pic: 'Teknisi Demo 02',
    masaSTNK: '2027-05-10',
    masaPajak: '2027-05-10',
    kepemilikan: 'BMI'
  },
  {
    idUnit: 'B9103DX',
    noLambung: 'BMI-HTR003',
    jenisArmada: 'Head Truck',
    merkModel: 'UD Trucks Quester GKE 280 (Unit Demo C)',
    kmSaatIni: 312100,
    kmServisTerakhir: 310000,
    intervalServisKm: 12000,
    kmServisBerikutnya: 322000,
    sisaKmServis: 9900,
    targetUkuranBan: '1000',
    statusServis: 'Selesai',
    keluhan: 'Siap Operasi',
    pic: 'Teknisi Demo 01',
    masaSTNK: '2027-11-20',
    masaPajak: '2027-11-20',
    kepemilikan: 'BMI'
  }
];

export const DEMO_SAFE_CHASSIS: ChassisAsset[] = [
  {
    idUnit: 'BMI-CH40-01',
    tipeChassis: 'Chassis 40ft 3-Axle Skeletal',
    targetUkuranBan: '1000',
    masaKIR: '2027-03-31',
    statusKIR: 'Aktif',
    statusMilik: 'BMI',
    statusServis: 'Selesai',
    karoseri: 'Patria',
    tahun: '2024',
    gvw: 45000,
    tare: 7500,
    sistemRem: 'Dual Circuit Air Brake',
    vin: 'DEMO-VIN-40-0001',
    catatan: 'Twist lock lengkap, kondisi normal'
  },
  {
    idUnit: 'BMI-CH20-02',
    tipeChassis: 'Chassis 20ft 2-Axle Flatbed',
    targetUkuranBan: '1000',
    masaKIR: '2026-12-15',
    statusKIR: 'Segera Perpanjang',
    statusMilik: 'BMI',
    statusServis: 'In Progress',
    karoseri: 'Patria',
    tahun: '2023',
    gvw: 24000,
    tare: 4200,
    vin: 'DEMO-VIN-20-0002',
    tglMulai: '2026-11-02',
    catatan: 'Perbaikan instalasi kabel lampu belakang & pengecekan baut axle 2'
  }
];

export const DEMO_SAFE_GENSETS: GensetAsset[] = [
  {
    idUnit: 'BMI-GNZ001',
    tipeGenset: 'Clip-On',
    merkKapasitas: 'Thermo King SG-3000 (15 kVA)',
    jamKerja: 1420,
    servisTerakhir: 1250,
    intervalServis: 250,
    statusServis: 'Selesai'
  }
];

export const DEMO_SAFE_TIRES: TireAsset[] = [
  {
    idSiklus: 'DEMO1001R0',
    idBanFisik: 'DEMO1001',
    siklus: 'R0',
    dot: '2924',
    unitTerpasang: 'B9101DX',
    posisiRoda: 'FL',
    merk: 'Bridgestone R156',
    ukuran: '1000',
    kmTempuh: 18500,
    statusKelayakan: 'Aktif Terpasang',
    catatanKondisi: 'Ready Pasang',
    tglMasuk: '2026-08-10',
    konstruksi: 'Radial',
    harga: 3600000,
    vendor: 'Vendor Demo A'
  },
  {
    idSiklus: 'DEMO1002R0',
    idBanFisik: 'DEMO1002',
    siklus: 'R0',
    dot: '4024',
    unitTerpasang: 'GUDANG SBY',
    posisiRoda: 'GUDANG',
    merk: 'Gajah Tunggal GT Super',
    ukuran: '1000',
    kmTempuh: 1200,
    statusKelayakan: 'Spare / Gudang',
    catatanKondisi: 'Vulkanisir Dingin',
    tglMasuk: '2026-10-15',
    konstruksi: 'Bias',
    harga: 2850000,
    vendor: 'Vendor Demo B'
  }
];

export const DEMO_SAFE_WORK_ORDERS: WorkOrder[] = [
  {
    woId: 'WO-DEMO-2611-001',
    timestamp: '2026-11-01T08:30:00+07:00',
    kategori: 'TRUK',
    idUnit: 'B9102DX',
    jenisServis: 'Perbaikan Rem & Kalibrasi',
    tglRencana: '2026-11-01',
    teknisi: 'Teknisi Demo 02',
    keluhan: 'Penggantian Kampas Rem & Kalibrasi Injektor',
    status: 'IN PROGRESS',
    tArrived: '2026-11-01T08:30:00+07:00',
    tMulai: '2026-11-01T09:00:00+07:00',
    pic: 'Supervisor Demo',
    prioritas: 'Mendesak',
    odo: 189400,
    bay: 'Bay 1',
    klasifikasi: 'Sedang'
  }
];

export const DEMO_SAFE_PARTS: MasterPart[] = [
  {
    sku: 'BRK-HN500-RR',
    kategori: 'Sistem Pengereman',
    nama: 'Brake Lining Set Hino 500 Rear',
    harga: 485000,
    stok: 14,
    min: 6,
    updatedAt: '2026-11-01'
  }
];

export const DEMO_SAFE_PART_REQUESTS: PartRequest[] = [];
export const DEMO_SAFE_INCIDENTS: IncidentReport[] = [];
