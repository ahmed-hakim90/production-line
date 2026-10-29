import React, { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { lazyNamed } from '../../modules/shared/routes/lazyNamed';
import { MODAL_KEYS } from './modalKeys';
import { useGlobalModalManager } from './GlobalModalManager';

/**
 * Keys are registered up front so open/hasModalTarget stay synchronous.
 * The modal chunk itself loads only after that key is opened, then stays
 * mounted so the next open does not download it again.
 */
const GLOBAL_MODAL_REGISTRY = [
  { key: MODAL_KEYS.REPORTS_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateReportModal'), 'GlobalCreateReportModal') },
  { key: MODAL_KEYS.REPORTS_IMPORT, Modal: lazyNamed(() => import('./modals/GlobalImportReportsModal'), 'GlobalImportReportsModal') },
  { key: MODAL_KEYS.WORK_ORDERS_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateWorkOrderModal'), 'GlobalCreateWorkOrderModal') },
  { key: MODAL_KEYS.PRODUCTS_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateProductModal'), 'GlobalCreateProductModal') },
  { key: MODAL_KEYS.PRODUCTS_BOM_MANAGE, Modal: lazyNamed(() => import('./modals/GlobalProductBomModal'), 'GlobalProductBomModal') },
  { key: MODAL_KEYS.LINES_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateLineModal'), 'GlobalCreateLineModal') },
  { key: MODAL_KEYS.INVENTORY_IMPORT_IN_BY_CODE, Modal: lazyNamed(() => import('./modals/GlobalImportInventoryInByCodeModal'), 'GlobalImportInventoryInByCodeModal') },
  { key: MODAL_KEYS.PRODUCTION_PLANS_IMPORT, Modal: lazyNamed(() => import('./modals/GlobalImportProductionPlansModal'), 'GlobalImportProductionPlansModal') },
  { key: MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateWarehouseModal'), 'GlobalCreateWarehouseModal') },
  { key: MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT, Modal: lazyNamed(() => import('./modals/GlobalEditWarehouseModal'), 'GlobalEditWarehouseModal') },
  { key: MODAL_KEYS.INVENTORY_APPROVE_TRANSFER, Modal: lazyNamed(() => import('./modals/GlobalApproveTransferModal'), 'GlobalApproveTransferModal') },
  { key: MODAL_KEYS.INVENTORY_STOCK_ADJUSTMENT, Modal: lazyNamed(() => import('./modals/GlobalStockAdjustmentModal'), 'GlobalStockAdjustmentModal') },
  { key: MODAL_KEYS.MANUFACTURING_MATERIAL_REQUIREMENTS, Modal: lazyNamed(() => import('./modals/GlobalMaterialRequirementDetailsModal'), 'GlobalMaterialRequirementDetailsModal') },
  { key: MODAL_KEYS.INVENTORY_STOCK_COUNT_SESSION, Modal: lazyNamed(() => import('./modals/GlobalStockCountSessionModal'), 'GlobalStockCountSessionModal') },
  { key: MODAL_KEYS.PRODUCTION_PLAN_FOLLOW_UP_CREATE, Modal: lazyNamed(() => import('./modals/GlobalProductionPlanFollowUpModal'), 'GlobalProductionPlanFollowUpModal') },
  { key: MODAL_KEYS.SYSTEM_USERS_MANAGE, Modal: lazyNamed(() => import('./modals/GlobalManageUserModal'), 'GlobalManageUserModal') },
  { key: MODAL_KEYS.SYSTEM_USERS_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateSystemUserModal'), 'GlobalCreateSystemUserModal') },
  { key: MODAL_KEYS.SYSTEM_USERS_IMPORT, Modal: lazyNamed(() => import('./modals/GlobalImportSystemUsersModal'), 'GlobalImportSystemUsersModal') },
  { key: MODAL_KEYS.SYSTEM_ROLES_CREATE, Modal: lazyNamed(() => import('./modals/GlobalSystemRoleModal'), 'GlobalSystemRoleModal') },
  { key: MODAL_KEYS.COST_CENTERS_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCostCenterModal'), 'GlobalCostCenterModal') },
  { key: MODAL_KEYS.VEHICLES_CREATE, Modal: lazyNamed(() => import('./modals/GlobalCreateVehicleModal'), 'GlobalCreateVehicleModal') },
  { key: MODAL_KEYS.ORGANIZATION_CREATE, Modal: lazyNamed(() => import('./modals/GlobalOrganizationModal'), 'GlobalOrganizationModal') },
  { key: MODAL_KEYS.DAILY_WELCOME, Modal: lazyNamed(() => import('./modals/GlobalDailyWelcomeModal'), 'GlobalDailyWelcomeModal') },
  { key: MODAL_KEYS.PRODUCTION_SUPERVISOR_ASSIGNMENT_HISTORY, Modal: lazyNamed(() => import('./modals/GlobalSupervisorAssignmentHistoryModal'), 'GlobalSupervisorAssignmentHistoryModal') },
  { key: MODAL_KEYS.ATTENDANCE_SHIFT_RULES, Modal: lazyNamed(() => import('./modals/GlobalAttendanceShiftRulesModal'), 'GlobalAttendanceShiftRulesModal') },
  { key: MODAL_KEYS.ATTENDANCE_SIGNATURE_FIX, Modal: lazyNamed(() => import('./modals/GlobalAttendanceSignatureFixModal'), 'GlobalAttendanceSignatureFixModal') },
] as const;

/** Central host for global modal components (keyed via GlobalModalManager). */
export const ModalHost: React.FC = () => {
  const { resetAllModals, registerManagedModal, openedModalKeys } = useGlobalModalManager();
  const [mountedKeys, setMountedKeys] = useState<readonly string[]>([]);

  useLayoutEffect(() => {
    const unregister = GLOBAL_MODAL_REGISTRY.map((entry) => registerManagedModal(entry.key));
    return () => {
      unregister.forEach((dispose) => dispose());
    };
  }, [registerManagedModal]);

  // When this host unmounts (e.g. brief auth/loading gate), clear managed modal state so
  // isOpen does not survive and reopen on remount without the user clicking again.
  useEffect(() => () => resetAllModals(), [resetAllModals]);

  useEffect(() => {
    if (openedModalKeys.length === 0) return;
    setMountedKeys((current) => {
      let changed = false;
      const next = new Set(current);
      for (const key of openedModalKeys) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? [...next] : current;
    });
  }, [openedModalKeys]);

  const mounted = new Set(mountedKeys);

  return (
    <>
      {GLOBAL_MODAL_REGISTRY.map(({ key, Modal }) => (
        mounted.has(key) ? (
          <Suspense key={key} fallback={null}>
            <Modal />
          </Suspense>
        ) : null
      ))}
    </>
  );
};
