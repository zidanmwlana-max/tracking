import { getAuthSessionToken } from './authSession';
import { compressAndWatermarkImage } from './autoIdGenerator';

/**
 * Foto Work Order, seringan mungkin: kompres di browser (fungsi yang sudah ada di
 * autoIdGenerator), server simpan file di .data/photos, state hanya simpan URL.
 */
const MAX_BYTES = 1_500_000;

export async function uploadWorkOrderPhoto(
  woId: string,
  stage: 'BEFORE' | 'AFTER',
  file: File
): Promise<{ url: string; sizeBytes: number }> {
  const dataUrl = await compressAndWatermarkImage(file);
  const sizeBytes = Math.round((dataUrl.split(',')[1]?.length || 0) * 0.75);
  if (sizeBytes > MAX_BYTES) {
    throw new Error('Foto masih melebihi 1.5 MB setelah kompresi. Gunakan resolusi lebih kecil.');
  }

  const token = getAuthSessionToken();
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ woId, stage, mimeType: 'image/jpeg', dataBase64: dataUrl })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Gagal mengunggah foto Work Order.');
  }
  return { url: String(data.url), sizeBytes: Number(data.sizeBytes || sizeBytes) };
}
