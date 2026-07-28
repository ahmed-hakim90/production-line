/**
 * Plan/work-order remaining demand vs assemblable capacity in the supplies warehouse.
 * Pure helpers — used by alerts service/UI and unit tests.
 *
 * Business rule:
 * - قابل للتجميع = how many finished units current supplies stock can support (BOM).
 * - If > 0 but less than plan remaining → suggest إصدار صرف for that available qty only.
 * - If 0 → cannot issue; alert is replenishment / نقص مستلزمات, not صرف.
 */

export type OpenPlanDemandInput = {
  id?: string;
  productId: string;
  productName?: string;
  productCode?: string;
  plannedQuantity?: number;
  producedQuantity?: number;
  remainingQuantity?: number;
  status?: string;
};

export type AggregatedProductDemand = {
  productId: string;
  productName: string;
  productCode: string;
  remainingQuantity: number;
  planIds: string[];
  /** Remaining qty per plan id (same order as planIds). */
  planRemainings: number[];
};

export type CapacityLookup = {
  maxAssemblable: number;
  productName?: string;
  productCode?: string;
};

export type PlanIssueAlertAction = 'issue' | 'replenish';

export type PlanIssueAlertRow = {
  productId: string;
  productName: string;
  productCode: string;
  remainingQuantity: number;
  maxAssemblable: number;
  shortfall: number;
  planIds: string[];
  planRemainings: number[];
  /**
   * Qty to prefill on production-issue form.
   * Only > 0 when action === 'issue' (capped by assemblable stock).
   */
  suggestedIssueQuantity: number;
  action: PlanIssueAlertAction;
  /** Coverage ratio: assemblable / remaining (0 when remaining is 0). */
  coverageRatio: number;
};

const OPEN_PLAN_STATUSES = new Set(['planned', 'in_progress', 'paused']);

export function planRemainingQuantity(plan: OpenPlanDemandInput): number {
  const explicit = Number(plan.remainingQuantity);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const planned = Number(plan.plannedQuantity || 0);
  const produced = Number(plan.producedQuantity || 0);
  return Math.max(0, planned - produced);
}

export function isOpenProductionPlan(plan: OpenPlanDemandInput): boolean {
  const status = String(plan.status || '').trim();
  if (!status) return planRemainingQuantity(plan) > 0;
  return OPEN_PLAN_STATUSES.has(status);
}

/** Aggregate remaining qty by product across open plans. */
export function aggregateOpenPlanDemand(plans: OpenPlanDemandInput[]): AggregatedProductDemand[] {
  const byProduct = new Map<string, AggregatedProductDemand>();

  for (const plan of plans) {
    if (!isOpenProductionPlan(plan)) continue;
    const remaining = planRemainingQuantity(plan);
    if (!(remaining > 0)) continue;
    const productId = String(plan.productId || '').trim();
    if (!productId) continue;

    const existing = byProduct.get(productId);
    if (existing) {
      existing.remainingQuantity += remaining;
      if (plan.id) {
        existing.planIds.push(plan.id);
        existing.planRemainings.push(remaining);
      }
      if (!existing.productName && plan.productName) existing.productName = plan.productName;
      if (!existing.productCode && plan.productCode) existing.productCode = plan.productCode;
    } else {
      byProduct.set(productId, {
        productId,
        productName: String(plan.productName || '').trim() || productId,
        productCode: String(plan.productCode || '').trim(),
        remainingQuantity: remaining,
        planIds: plan.id ? [plan.id] : [],
        planRemainings: plan.id ? [remaining] : [],
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => b.remainingQuantity - a.remainingQuantity);
}

/**
 * Alert when assemblable capacity cannot cover remaining plan demand.
 * - Stock available (assemblable > 0): action=issue, suggest min(assemblable, first plan remaining).
 * - No stock (assemblable = 0): action=replenish — cannot create issue.
 */
export function buildPlanIssueAlerts(
  demands: AggregatedProductDemand[],
  capacityByProductId: Map<string, CapacityLookup>,
  options?: { safetyRatio?: number },
): PlanIssueAlertRow[] {
  const safetyRatio = Number(options?.safetyRatio);
  const ratio = Number.isFinite(safetyRatio) && safetyRatio > 0 ? safetyRatio : 1;
  const alerts: PlanIssueAlertRow[] = [];

  for (const demand of demands) {
    const remaining = Number(demand.remainingQuantity || 0);
    if (!(remaining > 0)) continue;
    const capacity = capacityByProductId.get(demand.productId);
    const maxAssemblable = Math.max(0, Number(capacity?.maxAssemblable || 0));
    const needed = remaining * ratio;
    if (maxAssemblable >= needed) continue;

    const shortfall = Math.max(0, remaining - maxAssemblable);
    const primaryPlanRemaining = Number(demand.planRemainings[0] || remaining) || remaining;
    const canIssue = maxAssemblable > 0;
    const suggestedIssueQuantity = canIssue
      ? Math.min(maxAssemblable, primaryPlanRemaining)
      : 0;

    alerts.push({
      productId: demand.productId,
      productName: capacity?.productName || demand.productName,
      productCode: capacity?.productCode || demand.productCode,
      remainingQuantity: remaining,
      maxAssemblable,
      shortfall,
      planIds: demand.planIds,
      planRemainings: demand.planRemainings,
      suggestedIssueQuantity,
      action: canIssue ? 'issue' : 'replenish',
      coverageRatio: remaining > 0 ? maxAssemblable / remaining : 0,
    });
  }

  return alerts.sort((a, b) => b.shortfall - a.shortfall || b.remainingQuantity - a.remainingQuantity);
}

/** Deep-link to create production issue — only when assemblable stock allows. */
export function planIssueAlertHref(alert: PlanIssueAlertRow, warehouseId?: string): string | null {
  if (alert.action !== 'issue' || !(alert.suggestedIssueQuantity > 0)) return null;
  const params = new URLSearchParams();
  if (warehouseId) params.set('warehouseId', warehouseId);
  params.set('productId', alert.productId);
  if (alert.planIds[0]) params.set('planId', alert.planIds[0]);
  params.set('quantity', String(alert.suggestedIssueQuantity));
  return `/inventory/production-issues?${params.toString()}`;
}

/** Deep-link when no components available — go receive / review assemblable. */
export function planReplenishAlertHref(alert: PlanIssueAlertRow, warehouseId?: string): string {
  const params = new URLSearchParams();
  if (warehouseId) params.set('warehouseId', warehouseId);
  if (alert.productId) params.set('productId', alert.productId);
  const qs = params.toString();
  return qs
    ? `/inventory/raw-materials/control?${qs}#assemblable`
    : '/inventory/raw-materials/control#assemblable';
}
