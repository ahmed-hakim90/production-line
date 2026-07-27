import type {
  FirestoreProduct,
  LineProductConfig,
  ProductAssemblyMode,
  ProductionReportWorkerOutput,
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

export type TeamPlanShareWorker = {
  workerId: string;
  workerName: string;
  isPresent?: boolean;
};

export type TeamPlanShareRow = {
  workerId: string;
  workerName: string;
  isPresent: boolean;
  dailyTargetQty: number;
  outputQty: number;
  achievementPercent: number;
};

const roundShareQty = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Fair shared performance for team (plan-based) products:
 * split Q and T equally across present workers only; absentees get zeros.
 * Team achievement Q/T is unchanged by who is absent.
 */
export function splitTeamPlanPerformance(params: {
  quantityProduced: number;
  planDailyTarget: number;
  workers: TeamPlanShareWorker[];
}): TeamPlanShareRow[] {
  const quantityProduced = Math.max(0, Number(params.quantityProduced) || 0);
  const planDailyTarget = Math.max(0, Number(params.planDailyTarget) || 0);
  const workers = params.workers
    .map((worker) => ({
      workerId: String(worker.workerId || '').trim(),
      workerName: String(worker.workerName || worker.workerId || '').trim(),
      isPresent: worker.isPresent !== false,
    }))
    .filter((worker) => worker.workerId);

  const presentWorkers = workers.filter((worker) => worker.isPresent);
  const presentCount = presentWorkers.length;
  const teamAchievement = computeAchievementPercent(quantityProduced, planDailyTarget);

  let remainingOutput = quantityProduced;
  let remainingTarget = planDailyTarget;
  const presentById = new Map<string, TeamPlanShareRow>();

  presentWorkers.forEach((worker, index) => {
    const isLast = index === presentCount - 1;
    const outputQty = presentCount <= 0
      ? 0
      : isLast
        ? roundShareQty(remainingOutput)
        : roundShareQty(quantityProduced / presentCount);
    const dailyTargetQty = presentCount <= 0
      ? 0
      : isLast
        ? roundShareQty(remainingTarget)
        : roundShareQty(planDailyTarget / presentCount);
    remainingOutput = roundShareQty(remainingOutput - outputQty);
    remainingTarget = roundShareQty(remainingTarget - dailyTargetQty);
    presentById.set(worker.workerId, {
      workerId: worker.workerId,
      workerName: worker.workerName,
      isPresent: true,
      dailyTargetQty,
      outputQty,
      achievementPercent: teamAchievement,
    });
  });

  return workers.map((worker) => {
    if (!worker.isPresent) {
      return {
        workerId: worker.workerId,
        workerName: worker.workerName,
        isPresent: false,
        dailyTargetQty: 0,
        outputQty: 0,
        achievementPercent: 0,
      };
    }
    return presentById.get(worker.workerId) ?? {
      workerId: worker.workerId,
      workerName: worker.workerName,
      isPresent: true,
      dailyTargetQty: 0,
      outputQty: 0,
      achievementPercent: teamAchievement,
    };
  });
}

export function buildTeamPlanWorkerOutputs(params: {
  quantityProduced: number;
  planDailyTarget: number;
  workers: Array<
    TeamPlanShareWorker & Pick<
      ProductionReportWorkerOutput,
      'productId' | 'productName' | 'lineId' | 'lineName'
    > & { notes?: string }
  >;
}): ProductionReportWorkerOutput[] {
  const shares = splitTeamPlanPerformance({
    quantityProduced: params.quantityProduced,
    planDailyTarget: params.planDailyTarget,
    workers: params.workers,
  });
  const metaById = new Map(
    params.workers.map((worker) => [String(worker.workerId || '').trim(), worker]),
  );

  return shares.map((share) => {
    const meta = metaById.get(share.workerId);
    return {
      workerId: share.workerId,
      workerName: share.workerName,
      productId: String(meta?.productId || ''),
      productName: String(meta?.productName || ''),
      lineId: String(meta?.lineId || ''),
      lineName: String(meta?.lineName || ''),
      dailyTargetQty: share.dailyTargetQty,
      outputQty: share.outputQty,
      achievementPercent: share.achievementPercent,
      isPresent: share.isPresent,
      notes: meta?.notes,
    };
  });
}
