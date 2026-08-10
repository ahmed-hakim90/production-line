import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, SearchableSelect } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { FirestoreRole } from '../../../types';
import { useTranslation } from 'react-i18next';

type EmployeeOption = { value: string; label: string };
type WarehouseOption = { value: string; label: string };
type RepairBranchOption = { value: string; label: string };
type ManageUserPayload = {
  row: {
    user: {
      id?: string;
      email: string;
      displayName: string;
      roleId: string;
      isActive: boolean;
      inventoryWarehouseId?: string | null;
      repairBranchId?: string | null;
      repairBranchIds?: string[] | null;
    };
    employee: { id?: string } | null;
  };
  roles: FirestoreRole[];
  employeeOptions: EmployeeOption[];
  warehouseOptions: WarehouseOption[];
  repairBranchOptions: RepairBranchOption[];
  onUpdateRole: (roleId: string) => Promise<void>;
  onUpdateInventoryWarehouse: (warehouseId: string) => Promise<void>;
  onUpdateRepairBranch: (branchId: string) => Promise<void>;
  onLinkEmployee: (employeeId: string) => Promise<void>;
  onUnlinkEmployee: () => Promise<void>;
  onToggleActive: () => Promise<void>;
  onApproveAccess: (roleId: string, employeeId: string) => Promise<void>;
  onUpdateCredentials: (input: { email?: string; password?: string }) => Promise<void>;
  onHardDelete: () => Promise<void>;
};

const toUserSafeError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  // Keep Arabic/business messages; hide provider/stack-style internals.
  if (/firebase|firestore|https?:\/\/|stack|permission-denied|internal/i.test(trimmed)) {
    return fallback;
  }
  return trimmed;
};

export const GlobalManageUserModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_USERS_MANAGE);
  const [roleTargetId, setRoleTargetId] = useState('');
  const [employeeTargetId, setEmployeeTargetId] = useState('');
  const [warehouseTargetId, setWarehouseTargetId] = useState('');
  const [repairBranchTargetId, setRepairBranchTargetId] = useState('');
  const [emailTarget, setEmailTarget] = useState('');
  const [passwordTarget, setPasswordTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const modalPayload = payload as ManageUserPayload | undefined;
  const row = modalPayload?.row;
  const roles = modalPayload?.roles ?? [];
  const employeeOptions = modalPayload?.employeeOptions ?? [];
  const warehouseOptions = modalPayload?.warehouseOptions ?? [];
  const repairBranchOptions = modalPayload?.repairBranchOptions ?? [];

  useEffect(() => {
    if (!isOpen || !row) return;
    setRoleTargetId(String(row.user.roleId || ''));
    setEmployeeTargetId(String(row.employee?.id || ''));
    setWarehouseTargetId(String(row.user.inventoryWarehouseId || ''));
    const fromIds = Array.isArray(row.user.repairBranchIds)
      ? row.user.repairBranchIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    setRepairBranchTargetId(String(row.user.repairBranchId || fromIds[0] || ''));
    setEmailTarget(String(row.user.email || ''));
    setPasswordTarget('');
  }, [isOpen, row]);

  const title = useMemo(() => {
    if (!row) return t('modalManager.manageUser.title');
    return t('modalManager.manageUser.titleWithEmail', { email: row.user.email });
  }, [row, t]);

  if (!isOpen || !row || !modalPayload) return null;

  const run = async (fn: () => Promise<void>, successText?: string, closeAfter?: boolean) => {
    setSubmitting(true);
    try {
      await fn();
      if (successText) toast.success(successText);
      if (closeAfter) close();
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, t('modalManager.manageUser.unexpectedError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !submitting && close()}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold sm:text-lg" title={title}>{title}</h3>
            <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{row.user.displayName || '—'}</p>
          </div>
          <button
            onClick={close}
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            disabled={submitting}
            aria-label={t('ui.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--color-text)]">{t('modalManager.manageUser.accountStatus')}</span>
            <Badge variant={row.user.isActive ? 'success' : 'warning'}>
              {row.user.isActive ? t('modalManager.manageUser.statusActive') : t('modalManager.manageUser.statusPendingApproval')}
            </Badge>
          </div>

          <section className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.role')}</label>
                <select
                  className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={roleTargetId}
                  onChange={(e) => setRoleTargetId(e.target.value)}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.linkedEmployee')}</label>
                <SearchableSelect
                  options={employeeOptions}
                  value={employeeTargetId}
                  onChange={setEmployeeTargetId}
                  placeholder={t('modalManager.manageUser.selectEmployee')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant="primary"
                onClick={() => void run(() => modalPayload.onUpdateRole(roleTargetId), t('modalManager.manageUser.updateRoleSuccess'))}
                disabled={submitting || !roleTargetId}
              >
                {t('modalManager.manageUser.saveRole')}
              </Button>
              <Button
                onClick={() => void run(() => modalPayload.onLinkEmployee(employeeTargetId), t('modalManager.manageUser.linkEmployeeSuccess'))}
                disabled={submitting || !employeeTargetId}
              >
                {t('modalManager.manageUser.linkEmployee')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void run(() => modalPayload.onUnlinkEmployee(), t('modalManager.manageUser.unlinkSuccess'))}
                disabled={submitting || !row.employee?.id}
              >
                {t('modalManager.manageUser.unlink')}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 sm:p-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">
                {t('modalManager.manageUser.inventoryWarehouse')}
              </label>
              <select
                className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
                value={warehouseTargetId}
                onChange={(e) => setWarehouseTargetId(e.target.value)}
              >
                <option value="">{t('modalManager.manageUser.allWarehouses')}</option>
                {warehouseOptions.map((wh) => (
                  <option key={wh.value} value={wh.value}>{wh.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {t('modalManager.manageUser.inventoryWarehouseHint')}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">
                {t('modalManager.manageUser.repairBranch')}
              </label>
              <select
                className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
                value={repairBranchTargetId}
                onChange={(e) => setRepairBranchTargetId(e.target.value)}
              >
                <option value="">{t('modalManager.manageUser.allRepairBranches')}</option>
                {repairBranchOptions.map((branch) => (
                  <option key={branch.value} value={branch.value}>{branch.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {t('modalManager.manageUser.repairBranchHint')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                onClick={() =>
                  void run(
                    () => modalPayload.onUpdateInventoryWarehouse(warehouseTargetId),
                    t('modalManager.manageUser.updateWarehouseSuccess'),
                  )
                }
                disabled={submitting}
              >
                {t('modalManager.manageUser.saveWarehouse')}
              </Button>
              <Button
                onClick={() =>
                  void run(
                    () => modalPayload.onUpdateRepairBranch(repairBranchTargetId),
                    t('modalManager.manageUser.updateRepairBranchSuccess'),
                  )
                }
                disabled={submitting}
              >
                {t('modalManager.manageUser.saveRepairBranch')}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.email')}</label>
                <input
                  className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                  placeholder="example@company.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.newPasswordOptional')}</label>
                <input
                  type="password"
                  className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={passwordTarget}
                  onChange={(e) => setPasswordTarget(e.target.value)}
                  placeholder={t('modalManager.manageUser.leaveBlankPasswordHint')}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                void run(
                  () =>
                    modalPayload.onUpdateCredentials({
                      email: emailTarget,
                      password: passwordTarget,
                    }),
                  t('modalManager.manageUser.updateCredentialsSuccess'),
                )
              }
              disabled={submitting || (!emailTarget.trim() && !passwordTarget.trim())}
            >
              {t('modalManager.manageUser.updateEmailPassword')}
            </Button>
          </section>

          <section className="space-y-2 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 sm:p-4">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.accountStatus')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {!row.user.isActive && (
                <Button
                  variant="primary"
                  onClick={() =>
                    void run(
                      () => modalPayload.onApproveAccess(roleTargetId, employeeTargetId),
                      t('modalManager.manageUser.approveAndActivateSuccess'),
                      true,
                    )
                  }
                  disabled={submitting || !roleTargetId}
                >
                  {t('modalManager.manageUser.approveAndActivate')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void run(() => modalPayload.onToggleActive(), undefined, true)}
                disabled={submitting}
              >
                {row.user.isActive ? t('modalManager.manageUser.disableUser') : t('modalManager.manageUser.enableUser')}
              </Button>
            </div>
          </section>

          <section className="space-y-2 rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.04)] p-3 sm:p-4">
            <Button
              tone="delete"
              solid
              className="w-full"
              onClick={() => {
                if (!window.confirm(t('modalManager.manageUser.hardDeleteConfirm'))) return;
                void run(() => modalPayload.onHardDelete(), undefined, true);
              }}
              disabled={submitting}
            >
              {t('modalManager.manageUser.hardDelete')}
            </Button>
          </section>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
