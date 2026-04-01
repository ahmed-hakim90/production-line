# Sprint 1 Review

## 1) New stores and line counts

- `store/useAuthStore.ts`: 27 lines
- `store/useProductionStore.ts`: 28 lines
- `store/useInventoryStore.ts`: 19 lines
- `store/useRepairStore.ts`: 19 lines
- `store/useCostsStore.ts`: 25 lines
- `store/useUIStore.ts`: 34 lines

## 2) Confirmation: useAppInitialization uses Promise.all

Confirmed. `hooks/useAppInitialization.ts` uses `Promise.all` when running app bootstrap.

## 3) Files still calling legacy useAppStore

The following files still contain direct `useAppStore(...)` calls and are pending migration to domain stores:

- `App.tsx`
- `modules/repair/pages/RepairJobDetail.tsx`
- `modules/repair/pages/NewRepairJob.tsx`
- `modules/repair/pages/RepairTreasury.tsx`
- `modules/repair/pages/RepairTechnicianKPIs.tsx`
- `modules/repair/pages/SparePartsInventory.tsx`
- `modules/repair/pages/RepairSalesInvoice.tsx`
- `modules/production/pages/Reports.tsx`
- `utils/permissions.ts`
- `modules/repair/pages/RepairDashboard.tsx`
- `modules/dashboards/pages/AdminDashboard.tsx`
- `modules/repair/pages/RepairJobs.tsx`
- `modules/quality/pages/ReworkOrders.tsx`
- `modules/production/pages/WorkOrders/index.tsx`
- `modules/production/pages/SupervisorDetails.tsx`
- `modules/hr/pages/Payroll.tsx`
- `modules/dashboards/pages/FactoryManagerDashboard.tsx`
- `modules/dashboards/pages/EmployeeDashboard.tsx`
- `modules/auth/pages/RegisterCompany.tsx`
- `modules/auth/pages/Login.tsx`
- `components/modal-manager/modals/GlobalCreateReportModal.tsx`
- `modules/attendance/pages/AttendanceLogs.tsx`
- `modules/inventory/pages/StockTransactions.tsx`
- `modules/attendance/pages/AttendanceDailyView.tsx`
- `modules/hr/pages/EmployeeEvaluation.tsx`
- `modules/super-admin/SuperAdminGuard.tsx`
- `modules/system/hooks/useBackupRestore.ts`
- `src/shared/ui/layout/Topbar.tsx`
- `modules/system/pages/Settings.tsx`
- `src/shared/ui/layout/AppLayout.tsx`
- `modules/hr/pages/EmployeeSelfService.tsx`
- `modules/production/pages/ProductionWorkerDetails.tsx`
- `modules/production/pages/LineDetails.tsx`
- `modules/system/components/settings/UiDensitySection.tsx`
- `core/ui-engine/theme/useTenantTheme.ts`
- `src/shared/ui/layout/Sidebar.tsx`
- `modules/system/components/settings/CompanyTenantSection.tsx`
- `modules/inventory/pages/QuickWarehouseTransfer.tsx`
- `modules/catalog/pages/hooks/useProductDetail.ts`
- `modules/system/pages/UsersManagement.tsx`
- `modules/quality/pages/QualityWorkers.tsx`
- `modules/quality/pages/QualitySettings.tsx`
- `modules/quality/pages/QualityReports.tsx`
- `modules/quality/pages/CAPA.tsx`
- `modules/production/pages/WorkOrders.tsx`
- `modules/production/pages/Products.tsx`
- `modules/production/pages/ProductionPlans.tsx`
- `modules/production/pages/ProductDetails.tsx`
- `modules/production/pages/LineWorkerAssignment.tsx`
- `modules/production/pages/Lines.tsx`
- `modules/inventory/pages/TransferApprovals.tsx`
- `modules/inventory/pages/StockCounts.tsx`
- `modules/inventory/pages/StockBalances.tsx`
- `modules/hr/pages/PayrollAccounts.tsx`
- `modules/hr/pages/Organization.tsx`
- `modules/hr/pages/LoanRequests.tsx`
- `modules/hr/pages/HRTransactions.tsx`
- `modules/hr/pages/LeaveRequests.tsx`
- `modules/hr/pages/HRSettings.tsx`
- `modules/hr/pages/HRImport.tsx`
- `modules/hr/pages/HRDashboard.tsx`
- `modules/hr/pages/EmployeeProfile.tsx`
- `modules/hr/pages/EmployeeFinancials.tsx`
- `modules/dashboards/pages/Dashboard.tsx`
- `modules/costs/pages/CostSettings.tsx`
- `modules/catalog/pages/Categories.tsx`
- `modules/attendance/pages/AttendanceMonthlyReport.tsx`
- `components/modal-manager/modals/GlobalImportProductionPlansModal.tsx`
- `components/modal-manager/modals/GlobalImportInventoryInByCodeModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceSignatureFixModal.tsx`
- `components/RouterRealtimeSubscriptions.tsx`
- `modules/production/pages/QuickAction.tsx`
- `modules/quality/pages/FinalInspection.tsx`
- `modules/quality/pages/IPQC.tsx`
- `modules/super-admin/pages/TenantsApproval.tsx`
- `modules/system/pages/RolesManagement.tsx`
- `modules/costs/pages/CostCenterDistribution.tsx`
- `modules/inventory/pages/StockMovementForm.tsx`
- `modules/production/pages/ProductionWorkers.tsx`
- `modules/hr/pages/ApprovalCenter.tsx`
- `modules/hr/pages/DelegationManagement.tsx`
- `modules/hr/pages/Vehicles.tsx`
- `modules/hr/pages/Employees.tsx`
- `modules/costs/pages/CostCenters.tsx`
- `modules/production/pages/Supervisors.tsx`
- `modules/auth/pages/PendingApproval.tsx`
- `modules/attendance/pages/AttendanceSyncDashboard.tsx`
- `components/NotificationBell.tsx`
- `components/GuestDemoShell.tsx`
- `components/ProtectedRoute.tsx`
- `components/ForcedClientUpdateGate.tsx`
- `components/modal-manager/modals/GlobalCreateWorkOrderModal.tsx`
- `components/EmployeeDashboardWidget.tsx`
- `components/SelectableTable.tsx`
- `components/modal-manager/modals/GlobalComponentScrapModal.tsx`
- `components/modal-manager/modals/GlobalImportReportsModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceShiftRulesModal.tsx`
- `components/modal-manager/modals/GlobalCreateProductModal.tsx`
- `components/modal-manager/modals/GlobalProductionPlanFollowUpModal.tsx`
- `components/modal-manager/modals/GlobalDailyWelcomeModal.tsx`
- `components/modal-manager/modals/GlobalSystemRoleModal.tsx`
- `components/modal-manager/modals/GlobalCreateLineModal.tsx`
- `components/modal-manager/modals/GlobalCostCenterModal.tsx`
- `core/auth/usePermissions.ts`
