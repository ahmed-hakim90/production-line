import React, { useEffect } from 'react';
import { useGlobalModalManager } from './GlobalModalManager';
import { GlobalCreateReportModal } from './modals/GlobalCreateReportModal';
import { GlobalImportReportsModal } from './modals/GlobalImportReportsModal';
import { GlobalCreateWorkOrderModal } from './modals/GlobalCreateWorkOrderModal';
import { GlobalCreateProductModal } from './modals/GlobalCreateProductModal';
import { GlobalCreateLineModal } from './modals/GlobalCreateLineModal';
import { GlobalCreateWarehouseModal } from './modals/GlobalCreateWarehouseModal';
import { GlobalEditWarehouseModal } from './modals/GlobalEditWarehouseModal';
import { GlobalApproveTransferModal } from './modals/GlobalApproveTransferModal';
import { GlobalStockAdjustmentModal } from './modals/GlobalStockAdjustmentModal';
import { GlobalProductionRoutingSettingsModal } from './modals/GlobalProductionRoutingSettingsModal';
import { GlobalMaterialRequirementDetailsModal } from './modals/GlobalMaterialRequirementDetailsModal';
import { GlobalStockCountSessionModal } from './modals/GlobalStockCountSessionModal';
import { GlobalImportInventoryInByCodeModal } from './modals/GlobalImportInventoryInByCodeModal';
import { GlobalImportProductionPlansModal } from './modals/GlobalImportProductionPlansModal';
import { GlobalProductionPlanFollowUpModal } from './modals/GlobalProductionPlanFollowUpModal';
import { GlobalManageUserModal } from './modals/GlobalManageUserModal';
import { GlobalCreateSystemUserModal } from './modals/GlobalCreateSystemUserModal';
import { GlobalImportSystemUsersModal } from './modals/GlobalImportSystemUsersModal';
import { GlobalSystemRoleModal } from './modals/GlobalSystemRoleModal';
import { GlobalCostCenterModal } from './modals/GlobalCostCenterModal';
import { GlobalCreateVehicleModal } from './modals/GlobalCreateVehicleModal';
import { GlobalOrganizationModal } from './modals/GlobalOrganizationModal';
import { GlobalDailyWelcomeModal } from './modals/GlobalDailyWelcomeModal';
import { GlobalSupervisorAssignmentHistoryModal } from './modals/GlobalSupervisorAssignmentHistoryModal';
import { GlobalAttendanceShiftRulesModal } from './modals/GlobalAttendanceShiftRulesModal';
import { GlobalAttendanceSignatureFixModal } from './modals/GlobalAttendanceSignatureFixModal';

/** Central host for global modal components (keyed via GlobalModalManager). */
export const ModalHost: React.FC = () => {
  const { resetAllModals } = useGlobalModalManager();

  // When this host unmounts (e.g. brief auth/loading gate), clear managed modal state so
  // isOpen does not survive and reopen on remount without the user clicking again.
  useEffect(() => () => resetAllModals(), [resetAllModals]);

  return (
    <>
      <GlobalCreateReportModal />
      <GlobalImportReportsModal />
      <GlobalCreateWorkOrderModal />
      <GlobalCreateProductModal />
      <GlobalCreateLineModal />
      <GlobalImportInventoryInByCodeModal />
      <GlobalImportProductionPlansModal />
      <GlobalCreateWarehouseModal />
      <GlobalEditWarehouseModal />
      <GlobalApproveTransferModal />
      <GlobalStockAdjustmentModal />
      <GlobalProductionRoutingSettingsModal />
      <GlobalMaterialRequirementDetailsModal />
      <GlobalStockCountSessionModal />
      <GlobalProductionPlanFollowUpModal />
      <GlobalManageUserModal />
      <GlobalCreateSystemUserModal />
      <GlobalImportSystemUsersModal />
      <GlobalSystemRoleModal />
      <GlobalCostCenterModal />
      <GlobalCreateVehicleModal />
      <GlobalOrganizationModal />
      <GlobalDailyWelcomeModal />
      <GlobalSupervisorAssignmentHistoryModal />
      <GlobalAttendanceShiftRulesModal />
      <GlobalAttendanceSignatureFixModal />
    </>
  );
};

