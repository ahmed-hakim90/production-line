import { roundProductionMoney } from './fullProductionCost';

export type ProductionCostJournalLine = {
  accountCode: string;
  debit: number;
  credit: number;
  costCenterId: string;
  costObjectType: 'production_report';
  costObjectId: string;
  workOrderId?: string;
  productId: string;
  description: string;
};

export type ProductionCostJournal = {
  source: 'production_cost';
  sourceId: string;
  idempotencyKey: string;
  date: string;
  description: string;
  lines: ProductionCostJournalLine[];
  totalDebit: number;
  totalCredit: number;
};

export type ProductionCostJournalInput = {
  tenantId: string;
  reportId: string;
  revision: number;
  date: string;
  costCenterId: string;
  productId: string;
  workOrderId?: string;
  /** Only actual stock issues are journalized as material consumption. */
  actualMaterialCost: number;
  absorbedDirectLaborCost: number;
  absorbedFactoryOverheadCost: number;
};

const line = (
  input: ProductionCostJournalInput,
  accountCode: string,
  debit: number,
  credit: number,
  description: string,
): ProductionCostJournalLine => ({
  accountCode,
  debit: roundProductionMoney(debit),
  credit: roundProductionMoney(credit),
  costCenterId: input.costCenterId,
  costObjectType: 'production_report',
  costObjectId: input.reportId,
  workOrderId: input.workOrderId,
  productId: input.productId,
  description,
});

/**
 * Builds the absorption entry for a production report. It deliberately does
 * not journal BOM estimates as material consumption; stock issue valuation is
 * the authoritative source for that part.
 */
export function buildProductionCostAbsorptionJournal(
  input: ProductionCostJournalInput,
): ProductionCostJournal {
  const material = Math.max(0, roundProductionMoney(input.actualMaterialCost));
  const labor = Math.max(0, roundProductionMoney(input.absorbedDirectLaborCost));
  const overhead = Math.max(0, roundProductionMoney(input.absorbedFactoryOverheadCost));
  const total = roundProductionMoney(material + labor + overhead);
  if (!input.reportId || !input.tenantId || !input.productId || !input.costCenterId) {
    throw new Error('بيانات تقرير الإنتاج ومركز التكلفة مطلوبة لإنشاء قيد التكلفة.');
  }
  if (total <= 0) throw new Error('لا توجد تكلفة قابلة للترحيل على تقرير الإنتاج.');

  const lines: ProductionCostJournalLine[] = [];
  if (material > 0) {
    lines.push(
      line(input, '132001', material, 0, 'تحميل الخامات الفعلية على الإنتاج تحت التشغيل'),
      line(input, '131001', 0, material, 'صرف خامات من المخزون للإنتاج'),
    );
  }
  if (labor > 0) {
    lines.push(
      line(input, '132001', labor, 0, 'تحميل العمالة المباشرة على الإنتاج تحت التشغيل'),
      line(input, '521001', 0, labor, 'تسوية العمالة الصناعية المحملة'),
    );
  }
  if (overhead > 0) {
    lines.push(
      line(input, '132001', overhead, 0, 'تحميل التكاليف الصناعية على الإنتاج تحت التشغيل'),
      line(input, '529001', 0, overhead, 'مقابل التكاليف الصناعية المحملة'),
    );
  }

  return {
    source: 'production_cost',
    sourceId: input.reportId,
    idempotencyKey: `${input.tenantId}__production_cost__${input.reportId}__r${Math.max(1, Math.round(input.revision || 1))}`,
    date: input.date,
    description: `تحميل تكلفة تقرير الإنتاج ${input.reportId}`,
    lines,
    totalDebit: total,
    totalCredit: total,
  };
}

export function buildProductionCompletionJournal(input: {
  tenantId: string;
  reportId: string;
  revision: number;
  date: string;
  costCenterId: string;
  productId: string;
  workOrderId?: string;
  completedCost: number;
}): ProductionCostJournal {
  const amount = Math.max(0, roundProductionMoney(input.completedCost));
  if (amount <= 0) throw new Error('تكلفة الإنتاج التام يجب أن تكون أكبر من صفر.');
  const basis: ProductionCostJournalInput = {
    ...input,
    actualMaterialCost: 0,
    absorbedDirectLaborCost: 0,
    absorbedFactoryOverheadCost: 0,
  };
  return {
    source: 'production_cost',
    sourceId: input.reportId,
    idempotencyKey: `${input.tenantId}__production_completion__${input.reportId}__r${Math.max(1, Math.round(input.revision || 1))}`,
    date: input.date,
    description: `إتمام إنتاج التقرير ${input.reportId}`,
    lines: [
      line(basis, '133001', amount, 0, 'إضافة الإنتاج التام للمخزون'),
      line(basis, '132001', 0, amount, 'تحويل الإنتاج تحت التشغيل إلى إنتاج تام'),
    ],
    totalDebit: amount,
    totalCredit: amount,
  };
}
