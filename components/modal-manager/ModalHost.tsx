import React, { Suspense, useEffect } from 'react';
import { lazyNamed } from '../../modules/shared/routes/lazyNamed';
import { useGlobalModalManager } from './GlobalModalManager';

/**
 * Lazy modal registry: keeps ModalHost mount API unchanged while code-splitting
 * each global modal out of the authenticated shell chunk. Each entry stays mounted
 * (inside its own Suspense) so managed-modal registration still works.
 */
const LAZY_GLOBAL_MODALS = [
  lazyNamed(() => import('./modals/GlobalCreateReportModal'), 'GlobalCreateReportModal'),
  lazyNamed(() => import('./modals/GlobalImportReportsModal'), 'GlobalImportReportsModal'),
  lazyNamed(() => import('./modals/GlobalCreateWorkOrderModal'), 'GlobalCreateWorkOrderModal'),
  lazyNamed(() => import('./modals/GlobalCreateProductModal'), 'GlobalCreateProductModal'),
  lazyNamed(() => import('./modals/GlobalProductBomModal'), 'GlobalProductBomModal'),
  lazyNamed(() => import('./modals/GlobalCreateLineModal'), 'GlobalCreateLineModal'),
  lazyNamed(() => import('./modals/GlobalImportInventoryInByCodeModal'), 'GlobalImportInventoryInByCodeModal'),
  lazyNamed(() => import('./modals/GlobalImportProductionPlansModal'), 'GlobalImportProductionPlansModal'),
  lazyNamed(() => import('./modals/GlobalCreateWarehouseModal'), 'GlobalCreateWarehouseModal'),
  lazyNamed(() => import('./modals/GlobalEditWarehouseModal'), 'GlobalEditWarehouseModal'),
  lazyNamed(() => import('./modals/GlobalApproveTransferModal'), 'GlobalApproveTransferModal'),
  lazyNamed(() => import('./modals/GlobalStockAdjustmentModal'), 'GlobalStockAdjustmentModal'),
  lazyNamed(
    () => import('./modals/GlobalMaterialRequirementDetailsModal'),
    'GlobalMaterialRequirementDetailsModal',
  ),
  lazyNamed(() => import('./modals/GlobalStockCountSessionModal'), 'GlobalStockCountSessionModal'),
  lazyNamed(
    () => import('./modals/GlobalProductionPlanFollowUpModal'),
    'GlobalProductionPlanFollowUpModal',
  ),
  lazyNamed(() => import('./modals/GlobalManageUserModal'), 'GlobalManageUserModal'),
  lazyNamed(() => import('./modals/GlobalCreateSystemUserModal'), 'GlobalCreateSystemUserModal'),
  lazyNamed(() => import('./modals/GlobalImportSystemUsersModal'), 'GlobalImportSystemUsersModal'),
  lazyNamed(() => import('./modals/GlobalSystemRoleModal'), 'GlobalSystemRoleModal'),
  lazyNamed(() => import('./modals/GlobalCostCenterModal'), 'GlobalCostCenterModal'),
  lazyNamed(() => import('./modals/GlobalCreateVehicleModal'), 'GlobalCreateVehicleModal'),
  lazyNamed(() => import('./modals/GlobalOrganizationModal'), 'GlobalOrganizationModal'),
  lazyNamed(() => import('./modals/GlobalDailyWelcomeModal'), 'GlobalDailyWelcomeModal'),
  lazyNamed(
    () => import('./modals/GlobalSupervisorAssignmentHistoryModal'),
    'GlobalSupervisorAssignmentHistoryModal',
  ),
  lazyNamed(
    () => import('./modals/GlobalAttendanceShiftRulesModal'),
    'GlobalAttendanceShiftRulesModal',
  ),
  lazyNamed(
    () => import('./modals/GlobalAttendanceSignatureFixModal'),
    'GlobalAttendanceSignatureFixModal',
  ),
] as const;

/** Central host for global modal components (keyed via GlobalModalManager). */
export const ModalHost: React.FC = () => {
  const { resetAllModals } = useGlobalModalManager();

  // When this host unmounts (e.g. brief auth/loading gate), clear managed modal state so
  // isOpen does not survive and reopen on remount without the user clicking again.
  useEffect(() => () => resetAllModals(), [resetAllModals]);

  return (
    <>
      {LAZY_GLOBAL_MODALS.map((Modal, index) => (
        <Suspense key={index} fallback={null}>
          <Modal />
        </Suspense>
      ))}
    </>
  );
};
