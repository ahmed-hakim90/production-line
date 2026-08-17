import {
  CUSTOMER_SIZE_TIER_LABELS,
  CUSTOMER_TYPE_LABELS,
  type Customer,
  type CustomerSizeTier,
  type CustomerType,
} from '../types';

export const CUSTOMER_BOARD_RANK_LIMIT = 8;

export type CustomerBoardRankRow = {
  id: string;
  code: string;
  name: string;
  type: CustomerType;
  value: number;
};

export type CustomerFrequencyBucket = {
  key: string;
  label: string;
  count: number;
  sharePct: number;
};

function toRankRow(customer: Customer, value: number): CustomerBoardRankRow | null {
  const id = String(customer.id || '').trim();
  if (!id) return null;
  return {
    id,
    code: customer.code,
    name: customer.name,
    type: customer.type,
    value,
  };
}

function sortRankRows(rows: CustomerBoardRankRow[], direction: 'asc' | 'desc'): CustomerBoardRankRow[] {
  return [...rows].sort((a, b) => {
    const delta = direction === 'desc' ? b.value - a.value : a.value - b.value;
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name, 'ar');
  });
}

export function rankCustomersByVolume(
  customers: readonly Customer[],
  direction: 'asc' | 'desc',
  limit = CUSTOMER_BOARD_RANK_LIMIT,
): CustomerBoardRankRow[] {
  const scored: CustomerBoardRankRow[] = [];
  for (const customer of customers) {
    if (customer.businessVolume == null || !Number.isFinite(customer.businessVolume)) continue;
    const row = toRankRow(customer, Number(customer.businessVolume));
    if (row) scored.push(row);
  }
  return sortRankRows(scored, direction).slice(0, limit);
}

/** أعلى مديونية = أكبر رصيد موجب (العميل مدين للشركة). */
export function rankCustomersByDebt(
  customers: readonly Customer[],
  limit = CUSTOMER_BOARD_RANK_LIMIT,
): CustomerBoardRankRow[] {
  const scored: CustomerBoardRankRow[] = [];
  for (const customer of customers) {
    if (customer.balance == null || !Number.isFinite(customer.balance) || customer.balance <= 0) continue;
    const row = toRankRow(customer, Number(customer.balance));
    if (row) scored.push(row);
  }
  return sortRankRows(scored, 'desc').slice(0, limit);
}

export function rankCustomersByJobCount(
  jobs: ReadonlyArray<{ customerId?: string | null }>,
  customers: readonly Customer[],
  limit = CUSTOMER_BOARD_RANK_LIMIT,
): CustomerBoardRankRow[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const customerId = String(job.customerId || '').trim();
    if (!customerId) continue;
    counts.set(customerId, (counts.get(customerId) || 0) + 1);
  }
  const byId = new Map<string, Customer>();
  for (const customer of customers) {
    if (customer.id) byId.set(customer.id, customer);
  }
  const scored: CustomerBoardRankRow[] = [];
  for (const [customerId, value] of counts) {
    const customer = byId.get(customerId);
    if (!customer) continue;
    const row = toRankRow(customer, value);
    if (row) scored.push(row);
  }
  return sortRankRows(scored, 'desc').slice(0, limit);
}

function sharePct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export function mostFrequentCustomerType(customers: readonly Customer[]): CustomerFrequencyBucket | null {
  const total = customers.length;
  if (total === 0) return null;
  const counts: Record<CustomerType, number> = { consumer: 0, trader: 0 };
  for (const customer of customers) {
    counts[customer.type] += 1;
  }
  const key: CustomerType = counts.trader > counts.consumer ? 'trader' : 'consumer';
  if (counts.consumer === 0 && counts.trader === 0) return null;
  return {
    key,
    label: CUSTOMER_TYPE_LABELS[key],
    count: counts[key],
    sharePct: sharePct(counts[key], total),
  };
}

export function mostFrequentCustomerSizeTier(customers: readonly Customer[]): CustomerFrequencyBucket | null {
  const total = customers.length;
  if (total === 0) return null;
  const counts: Record<CustomerSizeTier, number> = {
    large: 0,
    medium: 0,
    small: 0,
    unclassified: 0,
  };
  for (const customer of customers) {
    const tier = customer.sizeTier || 'unclassified';
    counts[tier] += 1;
  }
  const ranked = (Object.keys(counts) as CustomerSizeTier[])
    .map((key) => ({ key, count: counts[key] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const top = ranked[0];
  if (!top || top.count === 0) return null;
  return {
    key: top.key,
    label: CUSTOMER_SIZE_TIER_LABELS[top.key],
    count: top.count,
    sharePct: sharePct(top.count, total),
  };
}
