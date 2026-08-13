import type { Permission } from '../../../utils/permissions';

/**
 * Opening-balance Excel upload is a one-time setup action for مدير النظام.
 * Warehouse operators keep inventory.counts.manage for regular count sessions.
 */
export function canUploadOpeningBalances(can: (permission: Permission) => boolean): boolean {
  return can('roles.manage') === true;
}
