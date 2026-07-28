import type { ProductionIssueOrder, ProductionIssueOrderStatus } from '../types';

/** Statuses that block creating another open request/draft for the same WO/plan. */
export const BLOCKING_OPEN_ISSUE_STATUSES: ReadonlySet<ProductionIssueOrderStatus> = new Set([
  'requested',
  'draft',
  'submitted',
]);

export function isBlockingOpenIssueStatus(status: ProductionIssueOrderStatus | string | undefined): boolean {
  return BLOCKING_OPEN_ISSUE_STATUSES.has((status || '') as ProductionIssueOrderStatus);
}

export function findBlockingOpenIssue(
  orders: Pick<ProductionIssueOrder, 'id' | 'status' | 'sourceType'>[],
): ProductionIssueOrder | undefined {
  return orders.find(
    (row) => isBlockingOpenIssueStatus(row.status) && row.sourceType !== 'production_report',
  ) as ProductionIssueOrder | undefined;
}

export type IssueSourceSummary = {
  issuedQty: number;
  openRequestedQty: number;
  rejectedQty: number;
  orderCount: number;
};

export function summarizeOrdersForSource(
  orders: Pick<ProductionIssueOrder, 'status' | 'quantity' | 'requestedQuantity' | 'sourceType'>[],
): IssueSourceSummary {
  let issuedQty = 0;
  let openRequestedQty = 0;
  let rejectedQty = 0;
  let orderCount = 0;

  for (const row of orders) {
    if (row.sourceType === 'production_report') continue;
    orderCount += 1;
    const qty = Number(row.quantity || 0);
    const requested = Number(row.requestedQuantity ?? row.quantity ?? 0);
    if (row.status === 'issued') issuedQty += qty;
    else if (isBlockingOpenIssueStatus(row.status)) openRequestedQty += requested > 0 ? requested : qty;
    else if (row.status === 'rejected') rejectedQty += requested > 0 ? requested : qty;
  }

  return { issuedQty, openRequestedQty, rejectedQty, orderCount };
}

/** Remaining on a single request after materials issues (0 once issued/rejected/cancelled). */
export function requestRemainingQty(order: Pick<ProductionIssueOrder, 'status' | 'quantity' | 'requestedQuantity'>): number {
  if (order.status === 'issued' || order.status === 'cancelled' || order.status === 'rejected') return 0;
  const requested = Number(order.requestedQuantity ?? order.quantity ?? 0);
  return Math.max(0, requested);
}

export function suggestRequestQuantity(sourceRemaining: number, maxAssemblable: number): number {
  const remaining = Math.max(0, Number(sourceRemaining || 0));
  const assemblable = Math.max(0, Number(maxAssemblable || 0));
  if (!(remaining > 0) || !(assemblable > 0)) return 0;
  return Math.min(remaining, assemblable);
}
