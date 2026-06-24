import type {
  FirestoreProduct,
  LineProductConfig,
  ProductAssemblyMode,
  ProductionWorkerTarget,
} from '@/types';

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

export function getProductAssemblyMode(
  product?: Pick<FirestoreProduct, 'assemblyMode'> | null,
): ProductAssemblyMode {
  return product?.assemblyMode === 'team' ? 'team' : 'individual';
}

export function getAvailableIndividualLineWorkerTargetProducts<
  T extends Pick<FirestoreProduct, 'id' | 'name' | 'code' | 'assemblyMode'>,
>(
  products: T[],
  configs: LineProductConfig[] | undefined,
  lineId: string,
): T[] {
  const usedProductIds = new Set(
    (configs ?? [])
      .filter((config) => config.lineId === lineId)
      .map((config) => config.productId),
  );

  return products.filter((product) => {
    if (!product.id || usedProductIds.has(product.id)) return false;
    return getProductAssemblyMode(product) === 'individual';
  });
}

export function hasLineSpecificWorkerTarget(
  configs: LineProductConfig[] | undefined,
  lineId?: string,
  productId?: string,
): boolean {
  const lineProduct = findLineProductConfig(configs, lineId, productId);
  return Number(lineProduct?.dailyWorkerTargetQty || 0) > 0;
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

export function resolveReportWorkerTarget(params: {
  lineId?: string;
  productId: string;
  lineProductConfigs?: LineProductConfig[];
}): ResolvedWorkerTarget {
  const { lineId, productId, lineProductConfigs } = params;
  const lineProduct = findLineProductConfig(lineProductConfigs, lineId, productId);
  const lineProductTarget = Number(lineProduct?.dailyWorkerTargetQty || 0);
  if (lineProductTarget > 0) {
    return {
      dailyTargetQty: lineProductTarget,
      source: 'line_product',
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
