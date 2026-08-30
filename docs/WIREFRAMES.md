# Wireframe Architecture — pro-tech-erp-functions

## Repository evidence

- Local path: `/Users/hakimo/Developer/production-line`
- Detected stack: **JavaScript/Node.js**
- Product class: **operations/admin**
- Existing uncommitted paths before this foundation pass: **1**
- Package/workspace manifests: `functions/package.json`, `package.json`

### Detected application areas

- `components`
- `docs/company-showcase/modules`
- `docs/handover/_screenshots/modules`
- `functions/lib`
- `functions/src`
- `lib`
- `modules`
- `modules/accounting/components`
- `modules/accounting/lib`
- `modules/accounting/pages`
- `modules/auth/components`
- `modules/auth/pages`
- `modules/catalog/components`
- `modules/catalog/lib`
- `modules/catalog/pages`
- `modules/costs/components`
- `modules/costs/lib`
- `modules/costs/pages`
- `modules/customers/components`
- `modules/customers/lib`
- `modules/customers/pages`
- `modules/dashboards/components`
- `modules/dashboards/lib`
- `modules/dashboards/pages`
- `modules/hr/attendance/pages`
- `modules/hr/components`
- `modules/hr/pages`
- `modules/inventory/components`
- `modules/inventory/lib`
- `modules/inventory/pages`

### Representative routes/screens

- None found in the inspected depth.

### Representative UI/component files

- `components/CommandPalette.tsx`
- `components/CustomDashboardWidgets.tsx`
- `components/DynamicImportRecoveryScreen.tsx`
- `components/EmployeeDashboardWidget.tsx`
- `components/EnglishDigitsInputGuard.tsx`
- `components/FirestoreNetworkRecovery.tsx`
- `components/ForcedClientUpdateGate.tsx`
- `components/Layout.tsx`
- `components/NotificationBell.tsx`
- `components/NotificationPopupOverlay.tsx`
- `components/OrderedDashboardWidgets.tsx`
- `components/PageHeader.tsx`
- `components/PageRouteFallback.tsx`
- `components/ProtectedRoute.tsx`
- `components/RouteErrorBoundary.tsx`
- `components/RouterRealtimeSubscriptions.tsx`
- `components/SelectableTable.tsx`
- `components/Toast.tsx`
- `components/UI.tsx`
- `components/background-jobs/GlobalBackgroundJobs.tsx`
- `components/background-jobs/JobCard.tsx`
- `components/background-jobs/JobsPanel.tsx`
- `components/modal-manager/GlobalModalManager.tsx`
- `components/modal-manager/ManagedModalPortal.tsx`
- `components/modal-manager/ModalHost.tsx`
- `components/modal-manager/modals/GlobalApproveTransferModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceShiftRulesModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceSignatureFixModal.tsx`
- `components/modal-manager/modals/GlobalCostCenterModal.tsx`
- `components/modal-manager/modals/GlobalCreateLineModal.tsx`
- `components/modal-manager/modals/GlobalCreateProductModal.tsx`
- `components/modal-manager/modals/GlobalCreateReportModal.tsx`

### Styling/token evidence

- `App.css`
- `docs/company-showcase/assets/showcase.css`
- `docs/handover/_print/operator-guide.css`
- `modules/production/pages/WorkOrders/WorkOrders.module.css`
- `src/index.css`
- `tailwind.config.ts`

This is a behavioral blueprint, not a redesign.

Global navigation → location/title/context/one primary action → only useful search/filter/summary → main task content → contextual detail/edit surface → local feedback and recovery.

Before implementation map: **Page goal → user journey → information architecture → sections → priority → actions → states → responsive/RTL behavior → shared components.**

Prove the system on a high-traffic primary-journey screen, a data-dense/management screen when present, and a form/detail screen. Mobile uses a priority column, reachable actions, sheets for secondary controls, safe-area and keyboard awareness. Tablet adapts deliberately; desktop uses efficient density and consistent containers; RTL/LTR preserve equal information priority.

<!-- CODEX-PRODUCT-FOUNDATION:START -->
# Wireframe Architecture — pro-tech-erp-functions

## Repository evidence

- Detected stack: **JavaScript/Node.js**
- Product class: **operations/admin**
- Package/workspace manifests: `functions/package.json`, `package.json`

### Detected application areas

- `components`
- `docs/company-showcase/modules`
- `docs/handover/_screenshots/modules`
- `functions/lib`
- `functions/src`
- `lib`
- `modules`
- `modules/accounting/components`
- `modules/accounting/lib`
- `modules/accounting/pages`
- `modules/auth/components`
- `modules/auth/pages`
- `modules/catalog/components`
- `modules/catalog/lib`
- `modules/catalog/pages`
- `modules/costs/components`
- `modules/costs/lib`
- `modules/costs/pages`
- `modules/customers/components`
- `modules/customers/lib`
- `modules/customers/pages`
- `modules/dashboards/components`
- `modules/dashboards/lib`
- `modules/dashboards/pages`
- `modules/hr/attendance/pages`
- `modules/hr/components`
- `modules/hr/pages`
- `modules/inventory/components`
- `modules/inventory/lib`
- `modules/inventory/pages`

### Representative routes/screens

- None found in the inspected depth.

### Representative UI/component files

- `components/CommandPalette.tsx`
- `components/CustomDashboardWidgets.tsx`
- `components/DynamicImportRecoveryScreen.tsx`
- `components/EmployeeDashboardWidget.tsx`
- `components/EnglishDigitsInputGuard.tsx`
- `components/FirestoreNetworkRecovery.tsx`
- `components/ForcedClientUpdateGate.tsx`
- `components/Layout.tsx`
- `components/NotificationBell.tsx`
- `components/NotificationPopupOverlay.tsx`
- `components/OrderedDashboardWidgets.tsx`
- `components/PageHeader.tsx`
- `components/PageRouteFallback.tsx`
- `components/ProtectedRoute.tsx`
- `components/RouteErrorBoundary.tsx`
- `components/RouterRealtimeSubscriptions.tsx`
- `components/SelectableTable.tsx`
- `components/Toast.tsx`
- `components/UI.tsx`
- `components/background-jobs/GlobalBackgroundJobs.tsx`
- `components/background-jobs/JobCard.tsx`
- `components/background-jobs/JobsPanel.tsx`
- `components/modal-manager/GlobalModalManager.tsx`
- `components/modal-manager/ManagedModalPortal.tsx`
- `components/modal-manager/ModalHost.tsx`
- `components/modal-manager/modals/GlobalApproveTransferModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceShiftRulesModal.tsx`
- `components/modal-manager/modals/GlobalAttendanceSignatureFixModal.tsx`
- `components/modal-manager/modals/GlobalCostCenterModal.tsx`
- `components/modal-manager/modals/GlobalCreateLineModal.tsx`
- `components/modal-manager/modals/GlobalCreateProductModal.tsx`
- `components/modal-manager/modals/GlobalCreateReportModal.tsx`

### Styling/token evidence

- `App.css`
- `docs/company-showcase/assets/showcase.css`
- `docs/handover/_print/operator-guide.css`
- `modules/production/pages/WorkOrders/WorkOrders.module.css`
- `src/index.css`
- `tailwind.config.ts`

This is a behavioral blueprint, not a redesign.

Global navigation → location/title/context/one primary action → only useful search/filter/summary → main task content → contextual detail/edit surface → local feedback and recovery.

Before implementation map: **Page goal → user journey → information architecture → sections → priority → actions → states → responsive/RTL behavior → shared components.**

Prove the system on a high-traffic primary-journey screen, a data-dense/management screen when present, and a form/detail screen. Mobile uses a priority column, reachable actions, sheets for secondary controls, safe-area and keyboard awareness. Tablet adapts deliberately; desktop uses efficient density and consistent containers; RTL/LTR preserve equal information priority.
<!-- CODEX-PRODUCT-FOUNDATION:END -->
