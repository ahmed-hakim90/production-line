import type { RepairDiscountType } from '../types';

export const roundRepairMoney = (value: unknown): number => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round((parsed + Number.EPSILON) * 100) / 100);
};

export function calculateRepairPaymentTotals(input: {
  grossAmount: number;
  discountType: RepairDiscountType;
  discountValue: number;
}) {
  const grossAmount = roundRepairMoney(input.grossAmount);
  const discountValue = roundRepairMoney(input.discountValue);
  if (input.discountType === 'percent' && discountValue > 100) {
    throw new Error('نسبة الخصم يجب ألا تتجاوز 100%.');
  }
  const discountAmount = input.discountType === 'percent'
    ? roundRepairMoney(grossAmount * discountValue / 100)
    : input.discountType === 'amount' ? discountValue : 0;
  if (discountAmount > grossAmount) {
    throw new Error('الخصم لا يمكن أن يتجاوز إجمالي الطلب.');
  }
  return {
    grossAmount,
    discountType: input.discountType,
    discountValue,
    discountAmount,
    netAmount: roundRepairMoney(grossAmount - discountAmount),
  };
}

export function calculateRepairBalance(netAmount: number, paidAmount: number) {
  const net = roundRepairMoney(netAmount);
  const paid = roundRepairMoney(paidAmount);
  if (paid > net) throw new Error('مجموع الدفعات لا يمكن أن يتجاوز صافي المطلوب.');
  const balanceDue = roundRepairMoney(net - paid);
  return {
    paidAmount: paid,
    balanceDue,
    paymentStatus: balanceDue <= 0 ? 'paid' as const : paid > 0 ? 'partial' as const : 'unpaid' as const,
  };
}
