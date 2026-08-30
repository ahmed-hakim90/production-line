# Product QA Checklist — pro-tech-erp-functions

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

- [ ] Primary journey works with realistic data and permissions; business rules, APIs, integrations, and side effects are preserved.
- [ ] Loading, empty, error, partial, stale, disabled, read-only, validation, success, and permission states are covered.
- [ ] Tests pass and all consumers of shared changes are checked.
- [ ] Rendered QA completed at 320–375, 390–430, tablet, laptop, and large desktop.
- [ ] No overflow, clipping, layout jump, awkward density, duplicate actions, design-token drift, generic AI slop, or blind reference cloning.
- [ ] RTL/LTR structure, icons, and directional controls are correct.
- [ ] Semantics, labels, names, keyboard flow, focus, contrast, touch targets, and reduced motion pass.
- [ ] Dependency, bundle, render, query, caching, asset, and interaction costs are justified.
- [ ] Root cause and durable decisions are documented; a real rendered flow was inspected.
- [ ] Regression review follows: Foundation → Shared primitives → Shared patterns → Representative screens → Remaining screens → Responsive/RTL QA → Regression review.

<!-- CODEX-PRODUCT-FOUNDATION:START -->
# Product QA Checklist — pro-tech-erp-functions

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

- [ ] Primary journey works with realistic data and permissions; business rules, APIs, integrations, and side effects are preserved.
- [ ] Loading, empty, error, partial, stale, disabled, read-only, validation, success, and permission states are covered.
- [ ] Tests pass and all consumers of shared changes are checked.
- [ ] Rendered QA completed at 320–375, 390–430, tablet, laptop, and large desktop.
- [ ] No overflow, clipping, layout jump, awkward density, duplicate actions, design-token drift, generic AI slop, or blind reference cloning.
- [ ] RTL/LTR structure, icons, and directional controls are correct.
- [ ] Semantics, labels, names, keyboard flow, focus, contrast, touch targets, and reduced motion pass.
- [ ] Dependency, bundle, render, query, caching, asset, and interaction costs are justified.
- [ ] Root cause and durable decisions are documented; a real rendered flow was inspected.
- [ ] Regression review follows: Foundation → Shared primitives → Shared patterns → Representative screens → Remaining screens → Responsive/RTL QA → Regression review.
<!-- CODEX-PRODUCT-FOUNDATION:END -->
