/**
 * ISO 2859-1 general inspection level II ranges used by the standalone quality system.
 * These are inspection criteria, not factory history. They apply only when the tenant
 * has not saved its own active plans.
 */
export interface AqlPlanRange {
  id?: string;
  batchMin: number;
  batchMax: number;
  sampleSize: number;
  acceptLimit: number;
  rejectLimit: number;
  aqlLevel: string;
  notes?: string;
  isActive: boolean;
}

export type AqlDecisionMode = 'auto' | 'manual_accept' | 'manual_reject';
export type AqlDecision = 'مقبول' | 'مرفوض' | 'قيد الفحص';

export const AQL_LEVEL_II_LABEL = 'المستوى العام الثاني (Level II)';

export const STANDARD_AQL_LEVEL_II: AqlPlanRange[] = [
  { batchMin: 2, batchMax: 8, sampleSize: 2, acceptLimit: 0, rejectLimit: 1, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'حجم كمية صغيرة جداً', isActive: true },
  { batchMin: 9, batchMax: 15, sampleSize: 3, acceptLimit: 0, rejectLimit: 1, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'حجم كمية صغيرة', isActive: true },
  { batchMin: 16, batchMax: 25, sampleSize: 5, acceptLimit: 0, rejectLimit: 1, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'حجم كمية متوسطة', isActive: true },
  { batchMin: 26, batchMax: 50, sampleSize: 8, acceptLimit: 1, rejectLimit: 2, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'فحص عادي', isActive: true },
  { batchMin: 51, batchMax: 90, sampleSize: 13, acceptLimit: 1, rejectLimit: 2, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'فحص عادي', isActive: true },
  { batchMin: 91, batchMax: 150, sampleSize: 20, acceptLimit: 2, rejectLimit: 3, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'من 100 إلى 150: عينة 20، قبول حتى 2، رفض من 3', isActive: true },
  { batchMin: 151, batchMax: 280, sampleSize: 32, acceptLimit: 2, rejectLimit: 3, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'فحص قياسي', isActive: true },
  { batchMin: 281, batchMax: 500, sampleSize: 50, acceptLimit: 3, rejectLimit: 4, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'فحص قياسي للبلتات المتوسطة', isActive: true },
  { batchMin: 501, batchMax: 1200, sampleSize: 80, acceptLimit: 5, rejectLimit: 6, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'بلتات التصدير والتوزيع الكبيرة', isActive: true },
  { batchMin: 1201, batchMax: 3200, sampleSize: 125, acceptLimit: 7, rejectLimit: 8, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'دفعة تشغيل كبيرة', isActive: true },
  { batchMin: 3201, batchMax: 10000, sampleSize: 200, acceptLimit: 10, rejectLimit: 11, aqlLevel: AQL_LEVEL_II_LABEL, notes: 'دفعة إنتاج ضخمة', isActive: true },
];

export interface ResolvedAqlPlan {
  sampleSize: number;
  acceptLimit: number;
  rejectLimit: number;
  aqlLevel: string;
}

const activePlans = (plans: AqlPlanRange[]): AqlPlanRange[] =>
  plans.filter((plan) => plan.isActive !== false);

export function lookupAqlPlan(quantity: number, plans: AqlPlanRange[] = STANDARD_AQL_LEVEL_II): ResolvedAqlPlan {
  const qty = Number.parseInt(String(quantity || 0), 10);
  const source = activePlans(plans.length > 0 ? plans : STANDARD_AQL_LEVEL_II);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { sampleSize: 0, acceptLimit: 0, rejectLimit: 1, aqlLevel: 'غير محدد' };
  }

  const exact = source
    .filter((plan) => plan.batchMin <= qty && plan.batchMax >= qty)
    .sort((a, b) => a.batchMin - b.batchMin)[0];
  if (exact) {
    return {
      sampleSize: exact.sampleSize,
      acceptLimit: exact.acceptLimit,
      rejectLimit: exact.rejectLimit,
      aqlLevel: exact.aqlLevel,
    };
  }

  const nearest = [...source].sort(
    (a, b) => Math.abs(a.batchMax - qty) - Math.abs(b.batchMax - qty),
  )[0];
  if (nearest) {
    return {
      sampleSize: nearest.sampleSize,
      acceptLimit: nearest.acceptLimit,
      rejectLimit: nearest.rejectLimit,
      aqlLevel: nearest.aqlLevel,
    };
  }

  return {
    sampleSize: Math.min(20, Math.max(2, Math.round(qty * 0.1))),
    acceptLimit: 1,
    rejectLimit: 2,
    aqlLevel: 'المستوى العام الثاني (افتراضي)',
  };
}

/** Same gap rule as the standalone system: defects at or above Re reject; at or below Ac accept; anything between rejects. */
export function calculateAqlDecision(
  rejectedQty: number,
  acceptLimit: number,
  rejectLimit: number,
  decisionMode: AqlDecisionMode = 'auto',
): Exclude<AqlDecision, 'قيد الفحص'> {
  if (decisionMode === 'manual_accept') return 'مقبول';
  if (decisionMode === 'manual_reject') return 'مرفوض';
  const defects = Number.parseInt(String(rejectedQty || 0), 10);
  const accept = Number.parseInt(String(acceptLimit ?? 0), 10);
  const reject = Number.parseInt(String(rejectLimit ?? 1), 10);
  if (defects >= reject) return 'مرفوض';
  if (defects <= accept) return 'مقبول';
  return 'مرفوض';
}

export function assertPalletInspectionQuantities(input: {
  quantityOnPallet: number;
  inspectedQuantity: number;
  rejectedQuantity: number;
}): void {
  const lot = Number(input.quantityOnPallet);
  const inspected = Number(input.inspectedQuantity);
  const rejected = Number(input.rejectedQuantity);
  if (!Number.isInteger(lot) || lot < 0) throw new Error('كمية البالتة غير صالحة.');
  if (!Number.isInteger(inspected) || inspected < 0) throw new Error('كمية الفحص غير صالحة.');
  if (!Number.isInteger(rejected) || rejected < 0) throw new Error('عدد العيوب غير صالح.');
  if (inspected > lot) throw new Error('كمية الفحص لا يمكن أن تتجاوز الكمية الإجمالية على البالتة.');
  if (rejected > inspected) throw new Error('عدد العيوب لا يمكن أن يزيد عن الكمية المفحوصة.');
}

export function assertAqlPlanRange(plan: Pick<AqlPlanRange, 'batchMin' | 'batchMax' | 'sampleSize' | 'acceptLimit' | 'rejectLimit'>): void {
  if (!Number.isInteger(plan.batchMin) || !Number.isInteger(plan.batchMax) || plan.batchMin < 1 || plan.batchMax < plan.batchMin) {
    throw new Error('نطاق كمية خطة AQL غير صالح.');
  }
  if (!Number.isInteger(plan.sampleSize) || plan.sampleSize < 1) throw new Error('حجم العينة يجب أن يكون أكبر من صفر.');
  if (!Number.isInteger(plan.acceptLimit) || plan.acceptLimit < 0) throw new Error('حد القبول غير صالح.');
  if (!Number.isInteger(plan.rejectLimit) || plan.rejectLimit <= plan.acceptLimit) {
    throw new Error('حد الرفض يجب أن يكون أكبر من حد القبول.');
  }
}
