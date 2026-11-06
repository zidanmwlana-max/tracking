export type Role = 'MEKANIK' | 'SUPERVISOR';
export type PoolLocation = 'BMI Surabaya' | 'BMI Lamongan' | 'BMI Dampit';

export type TruckLayout = 'ENGKEL' | 'DOUBLE' | 'SUPPORT_4';
export type ChassisLayout = 'CHASSIS_8' | 'CHASSIS_12';

export interface TruckAsset {
  idUnit: string; // Nopol, e.g. "L 9438 UU"
  noLambung: string; // e.g. "BMI-HTR001"
  jenisArmada: string; // "Head Truck", "Engkel", "Tronton", "Dump Truck", "Support", "Box", "Pick Up", "Thermo"
  merkModel: string;
  kmSaatIni: number;
  kmServisTerakhir?: number;
  intervalServisKm?: number;
  targetUkuranBan: string; // "1000", "750", "R14", "R16"
  tglMulai?: string;
  targetSelesai?: string;
  keluhan?: string;
  catatanBengkel?: string;
  pic?: string;
  statusServis: 'Selesai' | 'Scheduled' | 'In Progress' | 'Arrived' | 'AFKIR';
  masaSTNK?: string;
  masaPajak?: string;
  kepemilikan: 'BMI' | 'SEWA';
  vendorName?: string;
  // Field servis rutin & Parameter mesin
  kmServisBerikutnya?: number;
  sisaKmServis?: number;
  statusPm?: 'OVERDUE' | 'DUE_SOON' | 'SAFE';
  lastComponentService?: Record<string, number>; // component id -> KM/HM saat terakhir ganti
}

export interface MaintenanceParameter {
  id: string;
  kodePm?: string; // Kode PM resmi (PM-TRK-xx / PM-SUP-xx / PM-PAS-xx)
  komponen: string;
  kategori: string;
  urgensi?: 'Kritis' | 'Penting' | 'Normal'; // Prioritas PM untuk Decision Engine
  kategoriArmada?: 'TRUK' | 'SUPPORT' | 'PASSENGER' | string;
  intervalKm: number;
  intervalJam?: number;
  skuDefault?: string;
  namaPartDefault?: string;
  deskripsiPekerjaan: string;
  warningThresholdKm: number; // default 1000 KM
  slots?: string[]; // Alias slot posisi roda/komponen yang dipetakan ke parameter ini
}

export interface ComponentHealthStatus {
  parameter: MaintenanceParameter;
  kmTerakhirGanti: number;
  kmJatuhTempo: number;
  sisaKm: number;
  persenSisa: number; // 0% - 100%
  status: 'OVERDUE' | 'DUE_SOON' | 'SAFE';
  tglTerakhirGanti?: string;
  sumberData?: 'LOGBOOK' | 'ESTIMASI';
}

export interface ChassisAsset {
  idUnit: string; // Kode Chassis, e.g. "BMI-CH40-01"
  tipeChassis: string; // "Chassis 40ft", "Chassis 20ft", "Chassis 40ft High Cube"
  targetUkuranBan: string; // "1000"
  masaKIR: string;
  statusKIR: 'Aktif' | 'Segera Perpanjang' | 'Mati';
  catatan?: string;
  pic?: string;
  tglMulai?: string;
  targetSelesai?: string;
  statusMilik: 'BMI' | 'Sewa / Vendor';
  statusServis: 'Selesai' | 'Scheduled' | 'In Progress' | 'Arrived' | 'AFKIR';
  karoseri?: string;
  tahun?: string | number;
  gvw?: number;
  tare?: number;
  landingGear?: string;
  sistemRem?: string;
  vin?: string;
}

export interface GensetAsset {
  idUnit: string; // Kode Genset, e.g. "GNZ-CL-01"
  tipeGenset: 'Clip-On' | 'Underslung';
  merkKapasitas: string;
  jamKerja: number; // HM
  servisTerakhir?: number;
  intervalServis?: number; // default 250 jam
  pic?: string;
  catatan?: string;
  tglMulai?: string;
  targetSelesai?: string;
  statusServis: 'Selesai' | 'Scheduled' | 'In Progress' | 'Arrived' | 'AFKIR';
}

export interface TireAsset {
  idSiklus: string; // e.g. "202401001R0"
  idBanFisik: string; // e.g. "202401001"
  siklus: 'R0' | 'R1' | 'R2' | 'RJ';
  dot: string; // e.g. "2924" (WWYY)
  unitTerpasang: string; // Nopol, Kode Sasis, atau "GUDANG SBY", "AFKIR"
  posisiRoda: string; // "A".."J" atau "CA".."CL" atau "GUDANG"
  merk: string;
  ukuran: string; // "1000", "750", "R14", "R16", "11.00 R20"
  kmTempuh: number;
  statusKelayakan: 'Aktif Terpasang' | 'Spare / Gudang' | 'Afkir / Dibuang' | 'Histori (Terupdate)';
  catatanKondisi: string; // "Ready Pasang", "Belum Pasang Velg", etc.
  tglMasuk?: string;
  konstruksi?: 'Radial' | 'Bias' | string;
  harga?: number;
  vendor?: string;
}

export type WOStatus = 
  | 'SCHEDULED' 
  | 'ARRIVED' 
  | 'IN PROGRESS' 
  | 'WAITING PART' 
  | 'READY FOR QC' 
  | 'COMPLETED & RELEASED' 
  | 'CANCELLED';

export interface WorkOrder {
  woId: string; // e.g. "WO-20261006-001"
  timestamp?: string;
  kategori: 'TRUK' | 'CHASSIS' | 'GENSET';
  idUnit: string;
  jenisServis: string;
  tglRencana: string;
  teknisi: string;
  keluhan: string;
  status: WOStatus;
  tArrived?: string;
  tMulai?: string;
  tSelesai?: string;
  tRilis?: string;
  pic: string;
  fotoBefore?: string;
  fotoAfter?: string;
  qcApproved?: boolean; // Gate wajib sebelum COMPLETED & RELEASED
  prioritas: 'Normal' | 'Mendesak' | 'Darurat / Breakdown';
  odo?: number | string;
  tEst?: string;
  bay: 'Bay 1' | 'Bay 2' | 'Bay 3' | 'Bay 4' | 'Bay 5' | 'Bay 6';
  downtime?: number; // Days
  klasifikasi?: 'Ringan' | 'Sedang' | 'Berat';
  alasanHapus?: string;
  terakhirDiubah?: string;
}

export interface MasterPart {
  sku: string; // KODE MATERIAL — identitas tunggal yang mengikat nama + kategori
  kategori: string;
  nama: string;
  satuan?: string; // "PCS", "Set", "Liter", "Drum"
  spek?: PartSpecDetail; // spesifikasi detail (katalog)
  /**
   * @deprecated Harga final TIDAK disimpan di master SKU.
   * Gunakan PartPriceOffer (per vendor/toko & merk) + summarizePartPrices().
   */
  harga?: number;
  stok: number;
  min: number; // Safety stock
  updatedAt?: string;
}

export interface PartRequest {
  txId: string;
  ts: string;
  woId: string;
  noLambung?: string;
  nopol: string;
  sku: string;
  namaPart: string;
  kategoriPart?: string;
  qty: number;
  hargaSatuan: number;
  total: number;
  mekanik: string;
  petugasGudang?: string;
  keterangan?: string;
  status: 'Menunggu Approval Supervisor' | 'Approved' | 'Rejected' | 'RESTOCK INBOUND';
}

export interface IncidentReport {
  idLaka: string;
  jenisLog?: 'INC' | 'LAKA';
  tgl: string;
  kategoriUnit?: string;
  idUnit: string;
  supir: string;
  lokasi: string;
  kategoriKendala?: string;
  kronologi: string;
  tingkatKeparahan?: string;
  waktuMulai?: string;
  waktuSelesai?: string;
  durasiDowntime?: string | number;
  tindakanMitigasi?: string;
  teknisiVendor?: string;
  biayaDerek?: number;
  biayaDarurat?: number;
  kerugian: number;
  status: 'Belum Diklaim' | 'Proses Klaim' | 'Klaim Cair' | 'Ditolak / Non-Asuransi' | 'Selesai Perbaikan' | 'Selesai';
  pic: string;
  timestamp: string;
  dokumen?: string;
}

export interface ChassisInspectionItem {
  idUnit: string;
  tipe: string;
  a3: boolean; // 3-axle
  done: boolean;
  v: {
    ban: 'B' | 'L' | 'R'; // Bagus, Bocor, Rusak
    gajah: number; // 1 = berfungsi, 0 = rusak
    lampu: number;
    rem: number;
    pagar: number;
    slebor: number;
    b1: number; // baut exel 1
    b2: number; // baut exel 2
    b3: number | null; // baut exel 3 (null if 2-axle)
    ld: number; // lock depan
    lt: number; // lock tengah
    lb: number; // lock belakang
  };
  banNote?: string;
  note?: string;
  foto?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'wo' | 'part' | 'laka' | 'stock' | 'system' | 'pm';
  referenceId?: string;
}

/* ============ v5.0 — SPAREPART MASTER (SKU = KODE MATERIAL) ============ */

/** Spesifikasi teknis detail per kode material (katalog). */
export interface PartSpecDetail {
  ukuran?: string; // "11.00 R20", "Ø 30 x 120 mm"
  material?: string; // "Baja Karbon", "Ferodo", "Karet NBR"
  tipe?: string; // "Set", "Radial", "Bias", "Oli Mineral"
  standar?: string; // "JIS B 1180", "DIN 933"
  dimensi?: string; // "P x L x T (mm)"
  beratKg?: number;
  catatan?: string;
}

/** Penawaran harga per vendor/toko dan merk — sumber satu-satunya untuk harga. */
export interface PartPriceOffer {
  id: string;
  sku: string; // kode material
  vendor: string; // nama toko/supplier
  merk: string; // merek produk (beda merk = beda penawaran)
  hargaSatuan: number;
  tanggal: string; // ISO date penawaran/pembelian
  qtyMin?: number;
  catatan?: string;
}

/* ============ v5.0 — ODOMETER STAGING ============ */

export interface OdometerImportRow {
  rowNo: number;
  idUnit: string; // nopol
  noLambung?: string;
  kmBaru: number;
  tanggal: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  kmLama?: number;
}

export type OdometerBatchStatus = 'STAGED' | 'COMMITTED' | 'REJECTED';

export interface OdometerImportBatch {
  id: string;
  fileName: string;
  createdAt: string;
  createdBy: string;
  status: OdometerBatchStatus;
  rows: OdometerImportRow[];
  committedAt?: string;
  committedBy?: string;
}

export interface OdometerLogEntry {
  id: string;
  idUnit: string;
  kmLama: number;
  kmBaru: number;
  tanggal: string;
  batchId: string;
  pic: string;
  sumber: 'IMPORT' | 'MANUAL';
}

/* ============ v5.0 — RECOMMENDATION BUNDLE ============ */

export type RecommendationType =
  | 'MINIMAL'
  | 'AXLE_PAIR'
  | 'MIXED'
  | 'ALL_NEW'
  | 'ALL_USED_ELIGIBLE'
  | 'ROTATION_REPLACE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RecommendationItem {
  idSiklus: string;
  idBanFisik: string;
  merk: string;
  ukuran: string;
  siklus: TireAsset['siklus'];
  kmTempuh: number;
  harga: number;
}

export interface RecommendationOption {
  type: RecommendationType;
  label: string;
  items: RecommendationItem[];
  estimasiBiaya: number;
  reasons: string[];
  warnings: string[];
  riskLevel: RiskLevel;
  valid: boolean;
  invalidReason?: string;
}

export interface RecommendationResult {
  unitId: string;
  ukuranTarget: string;
  kebutuhan: number;
  options: RecommendationOption[];
  generatedAt: string;
}

/* ============ v5.0 — DECISION ENGINE (PRIORITAS & SCHEDULING) ============ */

export interface PriorityFactors {
  safetyRisk: number; // 0-100
  overdue: number; // 0-100
  healthIndex: number; // 0-100 (semakin kecil semakin rusak)
}

export interface PrioritizedWorkOrder {
  woId: string;
  idUnit: string;
  score: number; // 0-100
  level: 'A' | 'B' | 'C';
  hardOverride: boolean;
  factors: PriorityFactors;
  reasons: string[];
}

export interface ScheduleSlot {
  woId: string;
  bay: string;
  shift: 'PAGI' | 'SIANG' | 'MALAM';
  teknisi: string;
  score: number;
}

export interface ScheduleResult {
  assignments: ScheduleSlot[];
  unassigned: { woId: string; reason: string }[];
  loadByTeknisi: Record<string, number>;
}

/* ============ v5.0 — FOTO WORK ORDER ============ */

export interface WorkOrderPhoto {
  id: string;
  woId: string;
  stage: 'BEFORE' | 'AFTER';
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes?: number;
}
