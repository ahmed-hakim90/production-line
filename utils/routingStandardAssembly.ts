import type { ProductionRoutingPlan } from '../modules/production/routing/types';

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
