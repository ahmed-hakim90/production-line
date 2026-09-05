import type { CostingPolicySettings } from '../types';

export const DEFAULT_COSTING_POLICY: CostingPolicySettings = {
  legacyConversionEnabled: false,
  fullManufacturingEnabled: true,
  primaryCostView: 'full_manufacturing',
  includeDirectLabor: true,
  includeSupervisor: false,
  includeIndirectCenters: false,
  includeDepreciation: false,
  includeActualMaterials: false,
  includePackaging: false,
  allowBomEstimateFallback: false,
  allowLinePercentageAllocation: false,
  allowQuantityAllocation: false,
  dailyAllocationDriver: 'work_hours',
  fallbackToQuantity: false,
  prorateOpenPeriod: false,
  allowProvisionalValues: false,
  requireActualBeforeClose: false,
  requireFullAllocationBeforeClose: false,
  freezeClosedSnapshots: true,
};

export function resolveCostingPolicy(
  input?: Partial<CostingPolicySettings> | null,
): CostingPolicySettings {
  // The historical policy is retained in storage only for compatibility.
  // Production costing is now an enforced, labor-only policy.
  void input;
  return { ...DEFAULT_COSTING_POLICY };
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
