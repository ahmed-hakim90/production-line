import { describe, expect, it } from 'vitest';
import { resolveWorkerTarget } from '../modules/production/selectors/workerTargetSelector';
import type { LineProductConfig, ProductionWorkerTarget } from '../types';

const baseTarget = (overrides: Partial<ProductionWorkerTarget>): ProductionWorkerTarget => ({
  workerId: 'w1',
  productId: 'p1',
  dailyTargetQty: 100,
  unit: 'piece',
  isActive: true,
  effectiveFrom: '2026-01-01',
  ...overrides,
});

const lineConfig = (overrides: Partial<LineProductConfig>): LineProductConfig => ({
  lineId: 'l1',
  productId: 'p1',
  standardAssemblyTime: 5,
  dailyWorkerTargetQty: 50,
  ...overrides,
});

describe('resolveWorkerTarget', () => {
  const date = '2026-06-17';

  it('uses line+product target for all workers when no worker-specific target exists', () => {
    const result = resolveWorkerTarget({
      workerId: 'w1',
      productId: 'p1',
      lineId: 'l1',
      date,
      targets: [],
      lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 80 })],
    });
    expect(result).toEqual({ dailyTargetQty: 80, source: 'line_product' });
  });

  it('prefers worker-specific override over line+product target', () => {
    const result = resolveWorkerTarget({
      workerId: 'w1',
      productId: 'p1',
      lineId: 'l1',
      date,
      targets: [baseTarget({ dailyTargetQty: 120, lineId: 'l1' })],
      lineProductConfigs: [lineConfig({ dailyWorkerTargetQty: 80 })],
    });
    expect(result).toEqual({ dailyTargetQty: 120, source: 'worker_product_line' });
  });

  it('falls back to product default when line+product target is missing', () => {
    const result = resolveWorkerTarget({
      workerId: 'w1',
      productId: 'p1',
      lineId: 'l1',
      date,
      targets: [],
      product: { defaultWorkerTargetQty: 60 },
      lineProductConfigs: [],
    });
    expect(result).toEqual({ dailyTargetQty: 60, source: 'product_default' });
  });

  it('returns missing when no target source is configured', () => {
    const result = resolveWorkerTarget({
      workerId: 'w1',
      productId: 'p1',
      lineId: 'l1',
      date,
      targets: [],
      lineProductConfigs: [],
    });
    expect(result.source).toBe('missing');
    expect(result.dailyTargetQty).toBe(0);
  });
});
