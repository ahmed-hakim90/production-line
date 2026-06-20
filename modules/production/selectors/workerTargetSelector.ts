import type { FirestoreProduct, LineProductConfig, ProductionWorkerTarget } from '@/types';

export interface ResolvedWorkerTarget {
  dailyTargetQty: number;
  source:
    | 'worker_product_line'
    | 'worker_product'
    | 'line_product'
    | 'product_default'
    | 'missing';
  warning?: string;
}

const isActiveOnDate = (target: ProductionWorkerTarget, date: string): boolean => {
  if (!target.isActive) return false;
  if (target.effectiveFrom > date) return false;
  if (target.effectiveTo && target.effectiveTo < date) return false;
  return true;
};

export function findLineProductConfig(
  configs: LineProductConfig[] | undefined,
  lineId?: string,
  productId?: string,
): LineProductConfig | null {
  if (!lineId || !productId || !configs?.length) return null;
  return configs.find((c) => c.lineId === lineId && c.productId === productId) ?? null;
}

export function resolveWorkerTarget(params: {
  workerId: string;
  productId: string;
  lineId?: string;
  date: string;
  targets: ProductionWorkerTarget[];
  product?: Pick<FirestoreProduct, 'defaultWorkerTargetQty'> | null;
  lineProductConfigs?: LineProductConfig[];
}): ResolvedWorkerTarget {
  const { workerId, productId, lineId, date, targets, product, lineProductConfigs } = params;
  const active = targets.filter((t) => isActiveOnDate(t, date));

  if (lineId) {
    const lineSpecific = active.find(
      (t) => t.workerId === workerId && t.productId === productId && t.lineId === lineId,
    );
    if (lineSpecific) {
      return {
        dailyTargetQty: Number(lineSpecific.dailyTargetQty || 0),
        source: 'worker_product_line',
      };
    }
  }

  const workerProduct = active.find(
    (t) => t.workerId === workerId && t.productId === productId && !t.lineId,
  );
  if (workerProduct) {
    return {
      dailyTargetQty: Number(workerProduct.dailyTargetQty || 0),
      source: 'worker_product',
    };
  }

  const lineProduct = findLineProductConfig(lineProductConfigs, lineId, productId);
  const lineProductTarget = Number(lineProduct?.dailyWorkerTargetQty || 0);
  if (lineProductTarget > 0) {
    return {
      dailyTargetQty: lineProductTarget,
      source: 'line_product',
    };
  }

  const productDefault = Number(product?.defaultWorkerTargetQty || 0);
  if (productDefault > 0) {
    return {
      dailyTargetQty: productDefault,
      source: 'product_default',
    };
  }

  return {
    dailyTargetQty: 0,
    source: 'missing',
    warning: 'لا يوجد هدف يومي لهذا المنتج/الخط',
  };
}

export function computeAchievementPercent(outputQty: number, targetQty: number): number {
  if (targetQty <= 0) return outputQty > 0 ? 100 : 0;
  return Math.round((outputQty / targetQty) * 1000) / 10;
}
