# Mobile/Tablet Responsive Route Inventory

Viewport targets: `360x800`, `390x844`, `430x932`, `768x1024`, `1024x1366`

## Public

- `/setup` -> `modules/auth/pages/SetupPage.tsx`
- `/login` -> `modules/auth/pages/Login.tsx`
- `/pending` -> `modules/auth/pages/PendingApproval.tsx`

## Dashboards

- `/employee-dashboard` -> `modules/dashboards/pages/EmployeeDashboard.tsx`
- `/factory-dashboard` -> `modules/dashboards/pages/FactoryManagerDashboard.tsx`
- `/admin-dashboard` -> `modules/dashboards/pages/AdminDashboard.tsx`
- `/supervisor-dashboard` -> redirect

## Production

- `/products` -> `modules/production/pages/Products.tsx`
- `/products/raw-materials` -> `modules/production/pages/RawMaterials.tsx`
- `/products/:id` -> `modules/production/pages/ProductDetails.tsx`
- `/lines` -> `modules/production/pages/Lines.tsx`
- `/lines/:id` -> `modules/production/pages/LineDetails.tsx`
- `/production-plans` -> `modules/production/pages/ProductionPlans.tsx`
- `/work-orders` -> `modules/production/pages/WorkOrders.tsx`
- `/work-orders/:id/scanner` -> `modules/production/pages/WorkOrderScanner.tsx`
- `/supervisors` -> `modules/production/pages/Supervisors.tsx`
- `/supervisors/:id` -> `modules/production/pages/SupervisorDetails.tsx`
- `/production-workers` -> `modules/production/pages/ProductionWorkers.tsx`
- `/production-workers/:id` -> `modules/production/pages/ProductionWorkerDetails.tsx`
- `/reports` -> `modules/production/pages/Reports.tsx`
- `/quick-action` -> `modules/production/pages/QuickAction.tsx`
- `/line-workers` -> `modules/production/pages/LineWorkers.tsx`

## Inventory

- `/inventory` -> `modules/inventory/pages/InventoryDashboard.tsx`
- `/inventory/balances` -> `modules/inventory/pages/InventoryBalances.tsx`
- `/inventory/transactions` -> `modules/inventory/pages/InventoryTransactions.tsx`
- `/inventory/movements` -> `modules/inventory/pages/StockMovements.tsx`
- `/inventory/transfer-approvals` -> `modules/inventory/pages/TransferApprovals.tsx`
- `/inventory/counts` -> `modules/inventory/pages/InventoryCounts.tsx`

## HR

- `/hr-dashboard` -> `modules/hr/pages/HRDashboard.tsx`
- `/employees` -> `modules/hr/pages/Employees.tsx`
- `/employees/import` -> `modules/hr/pages/EmployeesImport.tsx`
- `/employees/:id` -> `modules/hr/pages/EmployeeDetails.tsx`
- `/organization` -> `modules/hr/pages/Organization.tsx`
- `/self-service` -> `modules/hr/pages/SelfService.tsx`
- `/attendance` -> `modules/hr/pages/Attendance.tsx`
- `/attendance/import` -> `modules/hr/pages/AttendanceImport.tsx`
- `/leave-requests` -> `modules/hr/pages/LeaveRequests.tsx`
- `/loan-requests` -> `modules/hr/pages/LoanRequests.tsx`
- `/approval-center` -> `modules/hr/pages/ApprovalCenter.tsx`
- `/delegations` -> `modules/hr/pages/Delegations.tsx`
- `/payroll` -> `modules/hr/pages/Payroll.tsx`
- `/employee-financials` -> `modules/hr/pages/EmployeeFinancials.tsx`
- `/hr-transactions` -> `modules/hr/pages/HRTransactions.tsx`
- `/vehicles` -> `modules/hr/pages/Vehicles.tsx`
- `/hr-settings` -> `modules/hr/pages/HRSettings.tsx`

## Costs

- `/cost-centers` -> `modules/costs/pages/CostCenters.tsx`
- `/cost-centers/:id` -> `modules/costs/pages/CostCenterDetails.tsx`
- `/cost-settings` -> `modules/costs/pages/CostSettings.tsx`
- `/monthly-costs` -> `modules/costs/pages/MonthlyCosts.tsx`

## Quality

- `/quality/settings` -> `modules/quality/pages/QualitySettings.tsx`
- `/quality/workers` -> `modules/quality/pages/QualityWorkers.tsx`
- `/quality/final-inspection` -> `modules/quality/pages/FinalInspection.tsx`
- `/quality/ipqc` -> `modules/quality/pages/IPQC.tsx`
- `/quality/rework` -> `modules/quality/pages/Rework.tsx`
- `/quality/capa` -> `modules/quality/pages/CAPA.tsx`
- `/quality/reports` -> `modules/quality/pages/QualityReports.tsx`

## System

- `/roles` -> `modules/system/pages/RolesAndPermissions.tsx`
- `/activity-log` -> `modules/system/pages/ActivityLog.tsx`
- `/settings` -> `modules/system/pages/Settings.tsx`

## Responsive Acceptance Checklist (per page)

- Header/tools do not overlap on mobile and tablet.
- Filters/actions wrap or stack and remain tappable.
- Dense tables provide a mobile-friendly mode or safe horizontal scroll.
- Card grids behave as 1-column or horizontal card rail on narrow width.
- Forms and dialogs fit `360px` width without clipping.
- Charts stay readable (short labels, clipped legends avoided).
- No hidden primary actions under overflow.
