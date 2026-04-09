import type { ProductionRoutingPlan } from '../modules/production/routing/types';
import type { FirestoreProduct } from '../types';

/**
 * Map productId → total standard route time in seconds (active plan).
 */
export function buildRoutingTotalSecondsByProductId(
  plans: Pick<ProductionRoutingPlan, 'productId' | 'totalTimeSeconds'>[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of plans) {
    const pid = String(p.productId || '').trim();
    if (!pid || typeof p.totalTimeSeconds !== 'number' || p.totalTimeSeconds <= 0) continue;
    m[pid] = p.totalTimeSeconds;
  }
  return m;
}

/**
 * Seconds per unit for report expected-qty variance: routing target when set, else sum of steps.
 */
export function buildRoutingVarianceBasisSecondsByProductId(
  plans: Pick<ProductionRoutingPlan, 'productId' | 'totalTimeSeconds' | 'routingTargetUnitSeconds'>[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of plans) {
    const pid = String(p.productId || '').trim();
    if (!pid) continue;
    const total = typeof p.totalTimeSeconds === 'number' ? p.totalTimeSeconds : 0;
    const target =
      typeof p.routingTargetUnitSeconds === 'number' && Number.isFinite(p.routingTargetUnitSeconds)
        ? p.routingTargetUnitSeconds
        : undefined;
    const basis =
      target != null && target > 0 ? Math.round(target) : total > 0 ? total : 0;
    if (basis > 0) m[pid] = basis;
  }
  return m;
}

/** Sparse map: productId → routingTargetUnitSeconds when set on active plan (for UI / labels). */
export function buildRoutingTargetSecondsOnlyByProductId(
  plans: Pick<ProductionRoutingPlan, 'productId' | 'routingTargetUnitSeconds'>[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of plans) {
    const pid = String(p.productId || '').trim();
    const t = p.routingTargetUnitSeconds;
    if (!pid || typeof t !== 'number' || !(t > 0)) continue;
    m[pid] = Math.round(t);
  }
  return m;
}

/** Sparse map from product documents (no routing plan required). */
export function buildProductRoutingTargetSecondsByProductId(
  products: Pick<FirestoreProduct, 'id' | 'routingTargetUnitSeconds'>[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of products) {
    const pid = String(p.id || '').trim();
    const t = p.routingTargetUnitSeconds;
    if (!pid || typeof t !== 'number' || !(t > 0)) continue;
    m[pid] = Math.round(t);
  }
  return m;
}

/**
 * Fill variance basis from product-level targets only where the active plan did not define a positive basis.
 */
export function mergeProductTargetsIntoRoutingVarianceBasis(
  basisFromPlans: Record<string, number>,
  productTargets: Record<string, number>,
): Record<string, number> {
  const out = { ...basisFromPlans };
  for (const [pid, sec] of Object.entries(productTargets)) {
    if (!pid || !(sec > 0)) continue;
    const existing = out[pid];
    if (existing != null && existing > 0) continue;
    out[pid] = sec;
  }
  return out;
}

/**
 * Standard assembly time in minutes per unit: sum of routing step durations (seconds) / 60,
 * else line_product_config.standardAssemblyTime (already stored in minutes).
 */
export function effectiveStandardAssemblyMinutes(
  productId: string,
  configStandardMinutes: number | undefined,
  routingTotalsByProductId: Record<string, number> | undefined,
): number {
  const pid = String(productId || '').trim();
  if (!pid) return configStandardMinutes ?? 0;
  const sec = routingTotalsByProductId?.[pid];
  if (sec != null && sec > 0) return sec / 60;
  return configStandardMinutes ?? 0;
}
