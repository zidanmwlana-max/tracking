import type {
  RecommendationItem,
  RecommendationOption,
  RecommendationResult,
  TireAsset
} from '../types';

/**
 * v5.0 — Recommendation Engine (deterministik, tanpa LLM).
 * Output berupa BUNDLE pemasangan ban, bukan satu ban.
 * Aturan kelayakan memakai KM / usia pakai (tread depth TIDAK dipakai).
 */

export interface RecommendationInput {
  unitId: string;
  ukuranTarget: string;
  kebutuhan?: number; // jumlah ban yang dibutuhkan pada posisi yang dikerjakan (default 2)
  stok: TireAsset[]; // ban gudang (Spare / Gudang)
  terpasang?: TireAsset[]; // ban aktif terpasang di unit
  hargaJasaPerBan?: number; // estimasi biaya jasa pasang/balance per ban
}

const RISK_KM_HIGH = 120000; // ban bekas dengan tempuh tinggi = risiko tinggi
const RISK_KM_MED = 60000;

function tireEligible(t: TireAsset, ukuranTarget: string): boolean {
  if (!t) return false;
  if (t.ukuran !== ukuranTarget) return false;
  if (t.statusKelayakan === 'Afkir / Dibuang') return false;
  const cond = String(t.catatanKondisi || '').toLowerCase();
  // Cacat struktur (sidewall sobek/benjol) tidak eligible — data tersedia di catatan kondisi
  if (cond.includes('sobek') || cond.includes('benjol')) return false;
  return true;
}

function toItem(t: TireAsset): RecommendationItem {
  return {
    idSiklus: t.idSiklus,
    idBanFisik: t.idBanFisik,
    merk: t.merk,
    ukuran: t.ukuran,
    siklus: t.siklus,
    kmTempuh: Number(t.kmTempuh || 0),
    harga: Number(t.harga || 0)
  };
}

function riskFromKm(avgKm: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (avgKm >= RISK_KM_HIGH) return 'HIGH';
  if (avgKm >= RISK_KM_MED) return 'MEDIUM';
  return 'LOW';
}

function sumCost(items: RecommendationItem[], jasaPerBan: number): number {
  return items.reduce((s, i) => s + i.harga + jasaPerBan, 0);
}

export function generateRecommendations(input: RecommendationInput): RecommendationResult {
  const kebutuhan = Math.max(1, input.kebutuhan ?? 2);
  const jasa = Math.max(0, input.hargaJasaPerBan ?? 0);
  const stok = (input.stok || []).filter((t) => tireEligible(t, input.ukuranTarget));
  const mounted = input.terpasang || [];

  const byNewest = stok.slice().sort((a, b) => Number(a.kmTempuh) - Number(b.kmTempuh));

  const options: RecommendationOption[] = [];

  const build = (
    type: RecommendationOption['type'],
    label: string,
    picked: TireAsset[],
    reasons: string[],
    warnings: string[]
  ): RecommendationOption => {
    const items = picked.map(toItem);
    const avgKm = items.length ? items.reduce((s, i) => s + i.kmTempuh, 0) / items.length : 0;
    const valid = items.length === kebutuhan;
    return {
      type,
      label,
      items,
      estimasiBiaya: sumCost(items, jasa),
      reasons,
      warnings,
      riskLevel: items.length ? riskFromKm(avgKm) : 'HIGH',
      valid,
      invalidReason: valid
        ? undefined
        : `Stok ban eligible ukuran ${input.ukuranTarget} hanya ${items.length} dari ${kebutuhan} yang dibutuhkan.`
    };
  };

  // 1. MINIMAL — 1 ban terbaik (KM terendah / paling baru)
  const minimalPick = byNewest.slice(0, 1);
  options.push(
    build(
      'MINIMAL',
      'Minimal (1 Ban)',
      minimalPick,
      ['Biaya terendah', 'Dipilih ban dengan KM tempuh paling rendah pada stok gudang'],
      minimalPick.length === 0 ? ['Tidak ada ban eligible di gudang'] : ['Hanya mengganti 1 posisi — axle tidak seimbang']
    )
  );

  // 2. AXLE_PAIR — 2 ban sepasang (merk & siklus sama)
  const pairPool = byNewest.filter((t) => t.siklus === byNewest[0]?.siklus || true);
  let axlePair: TireAsset[] = [];
  for (const a of pairPool) {
    const partner = pairPool.find(
      (b) => b.idSiklus !== a.idSiklus && b.merk === a.merk && b.siklus === a.siklus
    );
    if (partner) {
      axlePair = [a, partner];
      break;
    }
  }
  options.push(
    build(
      'AXLE_PAIR',
      'Axle Pair (Sepasang Sama)',
      axlePair,
      ['Satu axle memakai merk, ukuran, dan siklus yang sama', 'Putaran & keausan seimbang'],
      axlePair.length < 2 ? ['Tidak ada pasangan merk+siklus identik di gudang'] : []
    )
  );

  // 3. MIXED — sepasang lintas merk (ukuran tetap sama)
  let mixedPair: TireAsset[] = [];
  for (const a of byNewest) {
    const partner = byNewest.find((b) => b.idSiklus !== a.idSiklus && b.merk !== a.merk);
    if (partner) {
      mixedPair = [a, partner];
      break;
    }
  }
  options.push(
    build(
      'MIXED',
      'Mixed Brand (Ukuran Sama)',
      mixedPair,
      ['Ukuran ban tetap seragam sesuai target unit', 'Dua merk berbeda pada satu axle'],
      mixedPair.length < 2
        ? ['Stok tidak cukup untuk kombinasi lintas merk']
        : ['Pola tapak berbeda dapat menimbulkan keausan tidak merata']
    )
  );

  // 4. ALL_NEW — semua ban baru (siklus R0)
  const newTires = byNewest.filter((t) => t.siklus === 'R0');
  options.push(
    build(
      'ALL_NEW',
      `All New (${kebutuhan} Ban Baru)`,
      newTires.slice(0, kebutuhan),
      ['Semua posisi memakai ban baru siklus R0', 'Usia pakai paling panjang, risiko paling rendah'],
      newTires.length < kebutuhan ? ['Jumlah ban baru di gudang tidak mencukupi'] : []
    )
  );

  // 5. ALL_USED_ELIGIBLE — semua ban bekas layak pakai
  const usedEligible = byNewest.filter((t) => t.siklus !== 'R0' && t.kmTempuh < RISK_KM_HIGH);
  options.push(
    build(
      'ALL_USED_ELIGIBLE',
      `All Used Eligible (${kebutuhan} Ban Bekas Layak)`,
      usedEligible.slice(0, kebutuhan),
      ['Semua kandidat masih di bawah ambang KM kritis', 'Biaya lebih rendah dibanding ban baru'],
      usedEligible.length < kebutuhan ? ['Ban bekas layak pakai tidak mencukupi'] : ['Perlu pemeriksaan visual akhir sebelum mount']
    )
  );

  // 6. ROTATION_REPLACE — rotasi ban terpasang + ganti yang terburuk
  const worstMounted = mounted
    .slice()
    .sort((a, b) => Number(b.kmTempuh || 0) - Number(a.kmTempuh || 0))[0];
  const rotationItems = worstMounted ? [worstMounted] : [];
  const rotationPick = [...rotationItems, ...byNewest.slice(0, Math.max(0, kebutuhan - rotationItems.length))];
  options.push(
    build(
      'ROTATION_REPLACE',
      'Rotation + Replace',
      rotationPick,
      [
        worstMounted
          ? `Ban dengan KM tertinggi (${worstMounted.idBanFisik}) dipindahkan/diganti`
          : 'Tidak ada ban terpasang terdeteksi — rotasi memakai stok gudang',
        'Mempertahankan ban KM rendah di posisi yang menuntut traksi'
      ],
      ['Perlu pencatatan posisi roda sebelum dan sesudah rotasi']
    )
  );

  return {
    unitId: input.unitId,
    ukuranTarget: input.ukuranTarget,
    kebutuhan,
    options,
    generatedAt: new Date().toISOString()
  };
}
