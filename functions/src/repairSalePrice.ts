/**
 * Shared repair spare-part sale price resolution (consumer vs trader).
 * Never falls back to purchase cost.
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export type RepairCustomerType = 'consumer' | 'trader';

export function normalizeRepairSalePrice(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10000) / 10000;
}

export function roundRepairMoney(value: unknown): number {
  return Math.round(normalizeRepairSalePrice(value) * 100) / 100;
}

/**
 * trader → traderSalePrice when > 0, else consumer.
 * consumer / missing → consumer (defaultSalePrice), then optional legacy fallback.
 */
export function pickRepairSalePrice(input: {
  customerType?: string | null;
  consumerSalePrice?: unknown;
  traderSalePrice?: unknown;
  fallbackSalePrice?: unknown;
}): number {
  const consumer =
    normalizeRepairSalePrice(input.consumerSalePrice)
    || normalizeRepairSalePrice(input.fallbackSalePrice);
  if (input.customerType === 'trader') {
    const trader = normalizeRepairSalePrice(input.traderSalePrice);
    if (trader > 0) return trader;
  }
  return consumer;
}

export function parseCustomerType(value: unknown): RepairCustomerType | null {
  if (value === 'trader') return 'trader';
  if (value === 'consumer') return 'consumer';
  return null;
}

export async function loadCustomerType(
  db: Firestore,
  tenantId: string,
  customerId: string | undefined | null,
): Promise<RepairCustomerType | null> {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const snap = await db.collection('customers').doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as { tenantId?: string; type?: string };
  if (String(data.tenantId || '').trim() !== tenantId) return null;
  return parseCustomerType(data.type);
}

export async function loadCustomerTypeInTx(
  t: Transaction,
  db: Firestore,
  tenantId: string,
  customerId: string | undefined | null,
): Promise<RepairCustomerType | null> {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const snap = await t.get(db.collection('customers').doc(id));
  if (!snap.exists) return null;
  const data = snap.data() as { tenantId?: string; type?: string };
  if (String(data.tenantId || '').trim() !== tenantId) return null;
  return parseCustomerType(data.type);
}
