import type { PartPriceOffer } from '../types';

const STORAGE_KEY = 'bmi_part_price_offers_v1';

function safeParse(raw: string | null): PartPriceOffer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PartPriceOffer[]) : [];
  } catch {
    return [];
  }
}

export function getPartPriceOffers(sku?: string): PartPriceOffer[] {
  if (typeof localStorage === 'undefined') return [];
  const all = safeParse(localStorage.getItem(STORAGE_KEY));
  return sku ? all.filter((o) => o.sku === sku) : all;
}

export function savePartPriceOffer(
  offer: Omit<PartPriceOffer, 'id'>
): PartPriceOffer {
  const record: PartPriceOffer = {
    ...offer,
    id: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  };
  const all = getPartPriceOffers();
  all.push(record);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return record;
}
