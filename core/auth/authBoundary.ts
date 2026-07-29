/**
 * Auth boundary — server vs UI
 *
 * UI layer (`usePermission`, disabled buttons, menu filters):
 *   - Improves UX only
 *   - Must NEVER be treated as authorization
 *
 * Server layer (Firestore rules + Cloud Functions):
 *   - Authenticates the Firebase Auth session
 *   - Authorizes by role/permissions and tenant ownership
 *   - Is the only trust boundary for writes and privileged reads
 *
 * Usecase layer:
 *   - May pre-check permissions for clearer Arabic errors
 *   - Must still rely on rules/Functions for enforcement
 *   - Must stamp trusted `tenantId` via `withTrustedTenantId` / services
 *
 * Note: this helper intentionally avoids importing `utils/permissions`
 * (that module loads the app store / Firebase). Use `checkPermission` in UI.
 */

export type PermissionMap = Record<string, boolean> | null | undefined;

export function assertUiPermission(
  permissions: PermissionMap,
  permission: string,
  message = 'غير مصرح بتنفيذ هذا الإجراء.',
): void {
  if (permissions?.[permission] !== true) {
    throw new Error(message);
  }
}

export function assertAnyUiPermission(
  permissions: PermissionMap,
  required: string[],
  message = 'غير مصرح بتنفيذ هذا الإجراء.',
): void {
  if (!required.some((permission) => permissions?.[permission] === true)) {
    throw new Error(message);
  }
}
