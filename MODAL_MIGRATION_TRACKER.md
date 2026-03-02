# Modal Migration Tracker

Tracks migration from page-scoped modals to Global Modal Manager architecture.

## Done

- `reports.create`
- `reports.import`
- `workOrders.create`
- `products.create`
- `lines.create`
- `inventory.warehouses.create`
- `inventory.rawMaterials.create`
- `inventory.movements.importInByCode`

## In Progress

- Production module (remaining modals in `Reports`, `WorkOrders`, `Products`, `Lines`, `ProductionPlans`)

## Backlog

- HR module modals
- Costs module modals
- System module modals

## Migration Rules

- Add key in `components/modal-manager/modalKeys.ts`
- Add managed modal component in `components/modal-manager/modals/`
- Mount in `components/modal-manager/ModalHost.tsx`
- Add `data-modal-key` on opener button/link
- Keep temporary enhancer inference only for backward compatibility

