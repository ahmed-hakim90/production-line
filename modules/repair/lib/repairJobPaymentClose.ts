import type { RepairPaymentAuthorization } from '../types';
import { isWarrantySettlementAuth } from './repairManufacturerWarranty';
import { isDeliveredStatus } from '../utils/repairWorkflowNormalize';

export type RepairJobPaymentCloseStep =
  | 'prepare'
  | 'collect'
  | 'deliver'
  | 'print'
  | 'blocked'
  | 'hidden';

export type RepairJobPaymentCloseState = {
  showPanel: boolean;
  step: RepairJobPaymentCloseStep;
  stepLabel: string;
  canPrepareAction: boolean;
  canCollectAction: boolean;
  canCollectAndDeliverAction: boolean;
  canDeliverOnlyAction: boolean;
  canPrintAction: boolean;
  isWarrantySettlement: boolean;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceDue: number;
  authStatus: string;
};

const money = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

const hasActiveAuth = (auth: RepairPaymentAuthorization | null | undefined) => {
  if (!auth || String(auth.status || '') === 'void') return false;
  if (isWarrantySettlementAuth(auth)) return true;
  return money(auth.grossAmount) > 0;
};

/**
 * Visibility and primary actions for closing payment + delivery from the job detail page.
 * Discount/credit approval flows stay on the dedicated payments screen.
 * Manufacturer warranty: prepare → deliver → print (no collection).
 */
export function resolveRepairJobPaymentCloseState(input: {
  jobStatus: string;
  authorization: RepairPaymentAuthorization | null | undefined;
  canPrepare: boolean;
  canCollect: boolean;
  /** When false, hide partial/custom amount collection on the job page. */
  allowPartialCollection?: boolean;
  canDeliver: boolean;
  /** Job-level manufacturer warranty (before/after prepare). */
  isManufacturerWarrantyJob?: boolean;
}): RepairJobPaymentCloseState {
  const status = String(input.jobStatus || '');
  const auth = input.authorization || null;
  const warranty = isWarrantySettlementAuth(auth) || Boolean(input.isManufacturerWarrantyJob);
  const settlementAuth = isWarrantySettlementAuth(auth);
  const grossAmount = money(auth?.grossAmount);
  const netAmount = money(auth?.netAmount);
  const paidAmount = money(auth?.paidAmount);
  const balanceDue = money(auth?.balanceDue);
  const authStatus = String(auth?.status || '');
  const creditApproved = String(auth?.creditApprovalStatus || '') === 'approved';
  const active = hasActiveAuth(auth);
  const collectible = active && !settlementAuth && ['approved', 'partial'].includes(authStatus) && balanceDue > 0;
  const deliverable = active && (
    settlementAuth
      ? authStatus === 'paid'
      : (authStatus === 'paid' || (balanceDue > 0 && creditApproved))
  );
  const allowPartial = input.allowPartialCollection !== false;

  const baseAmounts = {
    isWarrantySettlement: warranty,
    grossAmount,
    netAmount,
    paidAmount,
    balanceDue,
    authStatus,
  };

  if (isDeliveredStatus(status)) {
    return {
      showPanel: true,
      step: 'print',
      stepLabel: settlementAuth ? 'ضمان — جاهز للطباعة' : 'جاهز للطباعة',
      canPrepareAction: false,
      canCollectAction: false,
      canCollectAndDeliverAction: false,
      canDeliverOnlyAction: false,
      canPrintAction: true,
      ...baseAmounts,
    };
  }

  if (status !== 'ready') {
    return {
      showPanel: false,
      step: 'hidden',
      stepLabel: '',
      canPrepareAction: false,
      canCollectAction: false,
      canCollectAndDeliverAction: false,
      canDeliverOnlyAction: false,
      canPrintAction: false,
      ...baseAmounts,
    };
  }

  if (!active) {
    return {
      showPanel: true,
      step: 'prepare',
      stepLabel: warranty
        ? 'يحتاج تجهيز إقفال الضمان (بدون تحصيل)'
        : 'يحتاج تجهيز إذن الدفع',
      canPrepareAction: input.canPrepare,
      canCollectAction: false,
      canCollectAndDeliverAction: false,
      canDeliverOnlyAction: false,
      canPrintAction: false,
      ...baseAmounts,
    };
  }

  if (authStatus === 'pending_approval') {
    return {
      showPanel: true,
      step: 'blocked',
      stepLabel: 'بانتظار اعتماد الخصم من شاشة التحصيل',
      canPrepareAction: false,
      canCollectAction: false,
      canCollectAndDeliverAction: false,
      canDeliverOnlyAction: false,
      canPrintAction: false,
      ...baseAmounts,
    };
  }

  if (collectible) {
    return {
      showPanel: true,
      step: 'collect',
      stepLabel: 'جاهز للتحصيل',
      canPrepareAction: false,
      canCollectAction: input.canCollect && allowPartial,
      canCollectAndDeliverAction: input.canCollect && input.canDeliver,
      canDeliverOnlyAction: false,
      canPrintAction: false,
      ...baseAmounts,
    };
  }

  if (deliverable) {
    return {
      showPanel: true,
      step: 'deliver',
      stepLabel: settlementAuth ? 'ضمان مصنّع — جاهز للتسليم (بدون تحصيل)' : 'مدفوع وجاهز للتسليم',
      canPrepareAction: false,
      canCollectAction: false,
      canCollectAndDeliverAction: false,
      canDeliverOnlyAction: input.canDeliver,
      canPrintAction: false,
      ...baseAmounts,
    };
  }

  return {
    showPanel: true,
    step: 'blocked',
    stepLabel: 'أكمل الاعتماد المالي من شاشة التحصيل إن لزم',
    canPrepareAction: false,
    canCollectAction: false,
    canCollectAndDeliverAction: false,
    canDeliverOnlyAction: false,
    canPrintAction: false,
    ...baseAmounts,
  };
}
