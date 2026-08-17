/**
 * Whether a finished-product report must have an issued production issue
 * before save / inventory posting.
 *
 * Explicit work-order flag wins, then plan, then company routing default.
 * Missing fields on legacy docs inherit the company setting.
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

/** Default checkbox value when creating a plan/WO (inherit company setting). */
export function defaultRequiresProductionIssueFromCompany(companyRequire: boolean): boolean {
  return Boolean(companyRequire);
}
