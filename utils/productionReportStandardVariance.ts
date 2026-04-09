import type { LineProductConfig } from '../types';

export type ProductionReportStandardQtyVariance =
  | {
      kind: 'comparable';
      direction: 'above' | 'below' | 'on';
      expectedQty: number;
      actualQty: number;
      diff: number;
      pctOfExpected: number | null;
      sourceLabel: string;
    }
  | { kind: 'no_standard' }
  | { kind: 'no_labor' };

/**
 * Expected quantity for one report: (workHours × 3600 s) ÷ seconds per unit for variance.
 * Uses routing target when set on the active plan, else sum of route step times.
 * Line standardAssemblyTime is not used here. workersCount / lineProductConfigs are kept for call-site compatibility only.
 */
export function computeProductionReportStandardQtyVariance(params: {
  productId: string;
  lineId: string;
  quantityProduced: number;
  workersCount: number;
  workHours: number;
  lineProductConfigs: LineProductConfig[];
  /** target ?? totalTimeSeconds from active routing plan, merged with product-level targets where plan has no basis */
  routingVarianceBasisSecondsByProduct: Record<string, number>;
  /** Sparse: plan routingTargetUnitSeconds when set (drives sourceLabel). */
  routingPlanTargetUnitSecondsByProduct?: Record<string, number>;
  /** Sparse: product.routingTargetUnitSeconds when set — used for label when plan has no explicit target */
  routingProductTargetUnitSecondsByProduct?: Record<string, number>;
}): ProductionReportStandardQtyVariance {
  const {
    productId,
    lineId,
    quantityProduced,
    workHours,
    routingVarianceBasisSecondsByProduct,
    routingPlanTargetUnitSecondsByProduct,
    routingProductTargetUnitSecondsByProduct,
  } = params;
  const pid = String(productId || '').trim();
  const lid = String(lineId || '').trim();
  if (!pid || !lid) return { kind: 'no_standard' };

  const stdSecondsPerUnit = routingVarianceBasisSecondsByProduct[pid];
  if (stdSecondsPerUnit == null || !(stdSecondsPerUnit > 0)) return { kind: 'no_standard' };

  const h = Math.max(0, Number(workHours) || 0);
  const runtimeSeconds = h * 3600;
  if (!(runtimeSeconds > 0)) return { kind: 'no_labor' };

  const expectedQty = Math.floor(runtimeSeconds / stdSecondsPerUnit);
  const actualQty = Math.max(0, Number(quantityProduced) || 0);
  const diff = actualQty - expectedQty;
  const planT = routingPlanTargetUnitSecondsByProduct?.[pid];
  const prodT = routingProductTargetUnitSecondsByProduct?.[pid];
  const planTargetRounded = typeof planT === 'number' && planT > 0 ? Math.round(planT) : null;
  const prodTargetRounded = typeof prodT === 'number' && prodT > 0 ? Math.round(prodT) : null;
  const usedPlanTarget =
    planTargetRounded != null && stdSecondsPerUnit === planTargetRounded;
  const usedProductTarget =
    !usedPlanTarget &&
    prodTargetRounded != null &&
    stdSecondsPerUnit === prodTargetRounded;
  const sourceLabel = usedPlanTarget
    ? 'حسب تارجت المسار النشط'
    : usedProductTarget
      ? 'حسب تارجت المنتج'
      : 'حسب مجموع زمن المسار النشط';

  let direction: 'above' | 'below' | 'on';
  if (diff > 0) direction = 'above';
  else if (diff < 0) direction = 'below';
  else direction = 'on';

  const pctOfExpected =
    expectedQty > 0 ? Number(((diff / expectedQty) * 100).toFixed(1)) : diff !== 0 ? null : 0;

  return {
    kind: 'comparable',
    direction,
    expectedQty,
    actualQty,
    diff,
    pctOfExpected,
    sourceLabel,
  };
}

export type ShareStandardVarianceTone = 'emerald' | 'rose' | 'slate' | 'amber';

export type ShareStandardVarianceBanner = {
  headline: string;
  lines: string[];
  tone: ShareStandardVarianceTone;
};

/** Tailwind classes for bordered callouts (form preview + share capture). */
export const shareVarianceTailwindToneClass: Record<ShareStandardVarianceTone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  rose: 'border-rose-200 bg-rose-50 text-rose-950',
  slate: 'border-slate-200 bg-slate-50 text-slate-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
};

export function buildShareStandardVarianceBanner(
  v: ProductionReportStandardQtyVariance,
): ShareStandardVarianceBanner {
  if (v.kind === 'no_standard') {
    return {
      headline: 'لا يتوفر مرجع زمني للمقارنة',
      lines: [
        'لاحتساب «أعلى/أقل من المتوقع»: أنشئ مساراً نشطاً بزمن خطوات، أو عيّن «تارجت المسار» في بناء المسار، أو «تارجت المتوقع» على المنتج (ثانية/وحدة) عند عدم وجود مسار.',
      ],
      tone: 'slate',
    };
  }
  if (v.kind === 'no_labor') {
    return {
      headline: 'تعذر احتساب المتوقع القياسي',
      lines: ['أدخل ساعات التشغيل في التقرير (يُحوَّل الزمن إلى ثوانٍ ويُقسَم على زمن المسار لكل وحدة).'],
      tone: 'amber',
    };
  }

  const pctSuffix =
    v.pctOfExpected != null && v.expectedQty > 0
      ? ` (${v.pctOfExpected > 0 ? '+' : ''}${v.pctOfExpected}% عن المتوقع)`
      : '';

  if (v.direction === 'above') {
    return {
      headline: 'الإنتاج أعلى من المتوقع القياسي',
      lines: [
        `${v.sourceLabel}: المتوقع ≈ ${v.expectedQty} وحدة — الفعلي ${v.actualQty} وحدة.`,
        `الفرق: +${v.diff} وحدة${pctSuffix}`,
      ],
      tone: 'emerald',
    };
  }
  if (v.direction === 'below') {
    return {
      headline: 'الإنتاج أقل من المتوقع القياسي',
      lines: [
        `${v.sourceLabel}: المتوقع ≈ ${v.expectedQty} وحدة — الفعلي ${v.actualQty} وحدة.`,
        `الفرق: ${v.diff} وحدة${pctSuffix}`,
      ],
      tone: 'rose',
    };
  }
  return {
    headline: 'الإنتاج على المتوقع القياسي',
    lines: [`${v.sourceLabel}: المتوقع ≈ ${v.expectedQty} وحدة — الفعلي ${v.actualQty} وحدة.`],
    tone: 'slate',
  };
}
