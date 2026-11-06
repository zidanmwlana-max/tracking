import type { MasterPart, PartPriceOffer, PartSpecDetail } from '../types';

/**
 * v5.0 — Sparepart Pricing (deterministik).
 * Master SKU hanya menyimpan IDENTITAS (kode material, nama, kategori, spek).
 * Harga selalu berasal dari PartPriceOffer per (vendor/toko, merk) sehingga:
 *  - sparepart sama merk dari toko berbeda → penawaran berbeda;
 *  - sparepart beda merk untuk kode material sama → penawaran berbeda;
 *  - harga final tidak pernah "menempel" di master.
 */

export interface PriceSnapshot {
  harga: number;
  vendor: string;
  merk: string;
  tanggal: string;
}

export interface VendorPriceStat {
  vendor: string;
  merk: string;
  hargaTerendah: number;
  hargaTerakhir: number;
  jumlahPenawaran: number;
  tanggalTerakhir: string;
}

export interface PartPriceSummary {
  sku: string;
  jumlahPenawaran: number;
  lastPrice?: PriceSnapshot;
  weightedAverage?: number;
  hargaTerendah?: number;
  hargaTertinggi?: number;
  bestOffer?: PriceSnapshot;
  perVendor: VendorPriceStat[];
}

function toTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Ringkasan harga: last price, weighted average (bobot qtyMin), range, dan penawaran terbaik. */
export function summarizePartPrices(sku: string, offers: PartPriceOffer[]): PartPriceSummary {
  const rows = (offers || [])
    .filter((o) => o && o.sku === sku && Number.isFinite(Number(o.hargaSatuan)))
    .slice()
    .sort((a, b) => toTime(a.tanggal) - toTime(b.tanggal));

  if (rows.length === 0) {
    return { sku, jumlahPenawaran: 0, perVendor: [] };
  }

  const latest = rows[rows.length - 1];
  let weightSum = 0;
  let weighted = 0;
  rows.forEach((r) => {
    const w = Math.max(1, Number(r.qtyMin || 1));
    weightSum += w;
    weighted += Number(r.hargaSatuan) * w;
  });

  const cheapest = rows.reduce((a, b) =>
    Number(a.hargaSatuan) <= Number(b.hargaSatuan) ? a : b
  );

  const vendorMap = new Map<string, VendorPriceStat>();
  rows.forEach((r) => {
    const key = `${r.vendor}::${r.merk}`;
    const prev = vendorMap.get(key);
    const harga = Number(r.hargaSatuan);
    if (!prev) {
      vendorMap.set(key, {
        vendor: r.vendor,
        merk: r.merk,
        hargaTerendah: harga,
        hargaTerakhir: harga,
        jumlahPenawaran: 1,
        tanggalTerakhir: r.tanggal
      });
      return;
    }
    prev.hargaTerendah = Math.min(prev.hargaTerendah, harga);
    prev.hargaTerakhir = harga;
    prev.jumlahPenawaran += 1;
    prev.tanggalTerakhir = r.tanggal;
  });

  return {
    sku,
    jumlahPenawaran: rows.length,
    lastPrice: {
      harga: Number(latest.hargaSatuan),
      vendor: latest.vendor,
      merk: latest.merk,
      tanggal: latest.tanggal
    },
    weightedAverage: weightSum > 0 ? Math.round(weighted / weightSum) : undefined,
    hargaTerendah: Number(cheapest.hargaSatuan),
    hargaTertinggi: rows.reduce((m, r) => Math.max(m, Number(r.hargaSatuan)), 0),
    bestOffer: {
      harga: Number(cheapest.hargaSatuan),
      vendor: cheapest.vendor,
      merk: cheapest.merk,
      tanggal: cheapest.tanggal
    },
    perVendor: Array.from(vendorMap.values()).sort((a, b) => a.hargaTerendah - b.hargaTerendah)
  };
}

/** Validasi kelengkapan identitas katalog SKU (kode material wajib unik, nama & kategori wajib). */
export function validatePartIdentity(
  part: Pick<MasterPart, 'sku' | 'nama' | 'kategori' | 'spek'>,
  existing: Pick<MasterPart, 'sku'>[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sku = String(part.sku || '').trim().toUpperCase();

  if (!sku) errors.push('Kode material (SKU) wajib diisi.');
  if (sku && existing.some((p) => String(p.sku).trim().toUpperCase() === sku)) {
    errors.push(`Kode material ${sku} sudah terdaftar.`);
  }
  if (!String(part.nama || '').trim()) errors.push('Nama sparepart wajib diisi.');
  if (!String(part.kategori || '').trim()) errors.push('Kategori wajib dipilih.');
  if (part.spek && part.spek.beratKg !== undefined && Number(part.spek.beratKg) < 0) {
    errors.push('Berat spesifikasi tidak boleh negatif.');
  }

  return { valid: errors.length === 0, errors };
}

/** Label spesifikasi ringkas untuk ditampilkan di tabel katalog. */
export function formatSpecLabel(spek?: PartSpecDetail): string {
  if (!spek) return '-';
  const parts = [spek.ukuran, spek.material, spek.tipe, spek.standar].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '-';
}
