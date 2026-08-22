/**
 * Mirror of modules/production/lib/requiresProductionIssue.ts
 * (functions package cannot import app modules).
 */
export function resolveRequiresProductionIssueOnReport(input) {
    if (typeof input.workOrderRequiresProductionIssue === 'boolean') {
        return input.workOrderRequiresProductionIssue;
    }
    if (typeof input.planRequiresProductionIssue === 'boolean') {
        return input.planRequiresProductionIssue;
    }
    return Boolean(input.companyRequire);
}
