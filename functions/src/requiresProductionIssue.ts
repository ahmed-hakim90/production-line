/**
 * Mirror of modules/production/lib/requiresProductionIssue.ts
 * (functions package cannot import app modules).
 */
export function resolveRequiresProductionIssueOnReport(input: {
  companyRequire: boolean;
  workOrderRequiresProductionIssue?: boolean | null;
  planRequiresProductionIssue?: boolean | null;
}): boolean {
  if (typeof input.workOrderRequiresProductionIssue === 'boolean') {
    return input.workOrderRequiresProductionIssue;
  }
  if (typeof input.planRequiresProductionIssue === 'boolean') {
    return input.planRequiresProductionIssue;
  }
  return Boolean(input.companyRequire);
}
