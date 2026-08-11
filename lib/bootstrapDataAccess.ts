export type BootstrapPermissionChecker = (permission: string) => boolean;

/**
 * Optional financial datasets must not block the production workspace for
 * operational roles that are intentionally denied access to cost data.
 */
export function resolveBootstrapDataAccess(can: BootstrapPermissionChecker) {
  const canReadProductionCosts = can('costs.view') || can('costs.manage');

  return {
    costCenters:
      canReadProductionCosts
      || can('accounting.view')
      || can('accounting.settings.manage'),
    costDetails: canReadProductionCosts,
  };
}
