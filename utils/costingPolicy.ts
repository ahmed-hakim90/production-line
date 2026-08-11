import type { CostingPolicySettings } from '../types';

export const DEFAULT_COSTING_POLICY: CostingPolicySettings = {
  legacyConversionEnabled: true,
  fullManufacturingEnabled: true,
  primaryCostView: 'legacy_conversion',
  includeDirectLabor: true,
  includeSupervisor: true,
  includeIndirectCenters: true,
  includeDepreciation: true,
  includeActualMaterials: true,
  includePackaging: true,
  allowBomEstimateFallback: true,
  allowLinePercentageAllocation: true,
  allowQuantityAllocation: true,
  dailyAllocationDriver: 'work_hours',
  fallbackToQuantity: true,
  prorateOpenPeriod: true,
  allowProvisionalValues: true,
  requireActualBeforeClose: true,
  requireFullAllocationBeforeClose: true,
  freezeClosedSnapshots: true,
};

export function resolveCostingPolicy(
  input?: Partial<CostingPolicySettings> | null,
): CostingPolicySettings {
  return { ...DEFAULT_COSTING_POLICY, ...(input || {}) };
}

export function validateCostingPolicy(policy: CostingPolicySettings): string[] {
  const errors: string[] = [];
  if (!policy.legacyConversionEnabled && !policy.fullManufacturingEnabled) {
    errors.push('يجب تشغيل تكلفة التحويل أو التكلفة الصناعية الكاملة على الأقل.');
  }
  if (policy.primaryCostView === 'full_manufacturing' && !policy.fullManufacturingEnabled) {
    errors.push('لا يمكن اعتماد التكلفة الكاملة كرقم رئيسي وهي غير مفعلة.');
  }
  if (
    policy.includeIndirectCenters &&
    !policy.allowLinePercentageAllocation &&
    !policy.allowQuantityAllocation
  ) {
    errors.push('فعّل طريقة توزيع واحدة على الأقل للمراكز غير المباشرة.');
  }
  if (!policy.allowProvisionalValues && policy.allowBomEstimateFallback) {
    errors.push('BOM التقديري يحتاج السماح بالقيم المبدئية.');
  }
  return errors;
}
