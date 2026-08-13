import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '../components/UI';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { sparePartsReplenishmentService } from '../services/sparePartsReplenishmentService';
import { ImportStockCountSheetModal } from '../components/ImportStockCountSheetModal';
import { WAREHOUSE_ROLE_LABELS, sourceModuleLabel } from '../lib/stockLabels';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
} from '../lib/sparePartsReplenishment';
import type {
  SparePartsReplenishmentRequest,
  StockItemBalance,
  StockLocationBalance,
  StockTransaction,
  Warehouse,
  WarehouseLocation,
  WarehouseRole,
} from '../types';
import type { InventoryTransferRequest } from '../types';
import { repairBranchService } from '../../repair/services/repairBranchService';
import { sparePartsService } from '../../repair/services/sparePartsService';
import { CreateRepairSparePartModal } from '../../repair/components/CreateRepairSparePartModal';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairSparePart,
} from '../../repair/types';
import { resolveRepairAccessContext } from '../../repair/utils/repairAccessContext';
import {
  isMaintenanceCenterWarehouseRole,
  repairCenterWarehouseMenuPath,
  resolveRepairCenterWarehouseIds,
} from '../../repair/lib/repairCenterWarehouseMenu';
import { resolveRepairSettings } from '../../repair/config/repairSettings';
import { materialService } from '../../manufacturing/services/materialService';
import type { StockCountCatalogMaterial } from '../lib/stockCountSheet';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { toUserSafeFirestoreError } from '../../repair/lib/repairFirestoreErrors';
import { useWarehouseCountSheetPrint } from '../hooks/useWarehouseCountSheetPrint';
import { WarehousePartInquiry, type WarehouseLabelEngineSeed } from '../components/WarehousePartInquiry';
import { BarcodeLabelPrintEngineModal } from '../components/BarcodeLabelPrintEngineModal';
import { WarehouseCountSheetPrintModal } from '../components/WarehouseCountSheetPrintModal';
import { loadWarehouseCountLocationLabels, resolveWarehouseItemLocation } from '../lib/warehouseCountSheet';
import { canUploadOpeningBalances } from '../lib/openingBalanceAccess';
import { warehouseLocationService } from '../services/warehouseLocationService';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n || 0));

type ActionLink = {
  label: string;
  path: string;
  description: string;
};

function roleActions(
  role: WarehouseRole | undefined,
  warehouseId: string,
  canUploadOpening = false,
): ActionLink[] {
  switch (role) {
    case 'spare_parts_central':
      // Primary ops live in «تحكم المخزن» — keep inquiry/count links here only.
      return [
        {
          label: 'إذن إضافة',
          path: `/inventory/movements?warehouseId=${encodeURIComponent(warehouseId)}&movementType=IN`,
          description: 'تسجيل وارد متعدد الأسطر لقطع الغيار',
        },
        {
          label: canUploadOpening ? 'أرصدة أول المدة / الجرد' : 'الجرد',
          path: `/inventory/counts?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: canUploadOpening
            ? 'جلسات الجرد والاعتماد — أو ارفع أول المدة من أعلى هذه الصفحة'
            : 'جلسات الجرد والمطابقة واعتماد الفروق',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة ومواقع أصناف المخزن المركزي',
        },
        {
          label: 'كارت الصنف',
          path: '/inventory/item-card',
          description: 'تتبع حركة صنف عبر المخزن',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}&focus=spare`,
          description: 'أذون الإضافة والصرف وحركات قطع الغيار',
        },
        {
          label: 'مواقع الأرفف',
          path: `/inventory/locations?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرفف ولوكيشنات المخزن المركزي',
        },
      ];
    case 'maintenance_center':
      return [
        {
          label: 'طلب تموين / الاستلام',
          path: '/repair/parts-replenishment',
          description: 'طلب قطع غيار من المخزن المركزي ثم تأكيد الاستلام',
        },
        {
          label: 'تأكيد سحب للرئيسي',
          path: '/inventory/spare-parts-recall',
          description: 'تأكيد طلبات سحب القطع من هذا المركز إلى المخزن الرئيسي',
        },
        {
          label: 'سندات الصرف',
          path: '/repair/spare-issues',
          description: 'صرف قطع الغيار على أوامر الصيانة',
        },
      ];
    case 'final_product':
      return [
        {
          label: 'اعتماد التحويلات',
          path: '/inventory/transfer-approvals',
          description: 'الوارد بعد التحويل الذي يحتاج اعتماداً',
        },
        {
          label: 'اعتمادات الإنتاج المخزنية',
          path: '/inventory/production-approvals',
          description: 'إدخالات إنتاج بانتظار الاعتماد',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'رصيد المنتج التام',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث حركات المنتج التام',
        },
      ];
    case 'raw_material':
    case 'decomposed':
      return [
        {
          label: 'تحكم مخزن المستلزمات',
          path: '/inventory/raw-materials/control',
          description: 'عمليات المستلزمات والتنبيهات',
        },
        {
          label: 'استلام مستلزمات',
          path: '/inventory/raw-materials/receive',
          description: 'استلام توريدات',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة المخزن',
        },
      ];
    case 'production_floor':
      return [
        {
          label: 'مخزون صالة الإنتاج',
          path: '/inventory/production-floor',
          description: 'متابعة رصيد الصالة',
        },
        {
          label: 'صرف إنتاج',
          path: '/inventory/production-issues',
          description: 'طلبات وأوامر الصرف',
        },
      ];
    case 'finished_staging':
    case 'production_wip':
      return [
        {
          label: 'تحكم التغليف',
          path: '/production/packaging/control',
          description: 'استلام تحت التسليم / بانتظار التغليف',
        },
        {
          label: 'اعتماد التحويلات',
          path: '/inventory/transfer-approvals',
          description: 'تحويلات معلّقة',
        },
      ];
    default:
      return [
        {
          label: 'كارت الصنف',
          path: `/inventory/item-card?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'عرض مكونات وحركات صنف مع الطباعة',
        },
        {
          label: 'الأرصدة',
          path: `/inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أرصدة هذا المخزن',
        },
        {
          label: 'الحركات',
          path: `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`,
          description: 'أحدث الحركات',
        },
        {
          label: 'تحويل سريع',
          path: '/quick-inventory-transfer',
          description: 'إنشاء تحويل من/إلى المخزن',
        },
      ];
  }
}

export const WarehouseWorkspace: React.FC = () => {
  const { tenantSlug, warehouseId } = useParams<{ tenantSlug?: string; warehouseId?: string }>();
  const location = useLocation();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const canViewInventory = can('inventory.view');
  const canViewRepairParts = can('repair.parts.view');
  const canManageParts = can('repair.parts.manage');
  const canManageCounts = can('inventory.counts.manage');
  const canUploadOpening = canUploadOpeningBalances(can);
  const canCreateMovements = can('inventory.transactions.create');
  const canViewReplenishment =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.prepare')
    || can('sparePartsReplenishment.approve');
  const canViewCenterStock =
    can('sparePartsRecall.view')
    || can('sparePartsReplenishment.view')
    || can('inventory.view');
  const canCreateRecall = can('sparePartsRecall.create');
  const { printWarehouseCount, countSheetHost, printing } = useWarehouseCountSheetPrint();
  const printSettings = useAppStore((s) => s.systemSettings?.printTemplate);
  const [labelEngineOpen, setLabelEngineOpen] = useState(false);
  const [labelEngineSeed, setLabelEngineSeed] = useState<WarehouseLabelEngineSeed>({ mode: 'items' });
  const openLabelEngine = useCallback((seed: WarehouseLabelEngineSeed) => {
    setLabelEngineSeed(seed);
    setLabelEngineOpen(true);
  }, []);
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );
  const isRepairRoute = location.pathname.includes('/repair/warehouses/');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [countBalances, setCountBalances] = useState<StockItemBalance[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<InventoryTransferRequest[]>([]);
  const [replenishments, setReplenishments] = useState<SparePartsReplenishmentRequest[]>([]);
  const [linkedBranch, setLinkedBranch] = useState<RepairBranch | null>(null);
  const [branchParts, setBranchParts] = useState<RepairSparePart[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<StockCountCatalogMaterial[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [countImportOpen, setCountImportOpen] = useState(false);
  const [printPickerOpen, setPrintPickerOpen] = useState(false);
  const [locationByKey, setLocationByKey] = useState<Map<string, string>>(() => new Map());
  const [locationBalances, setLocationBalances] = useState<StockLocationBalance[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocation[]>([]);

  const load = useCallback(async () => {
    const id = String(warehouseId || '').trim();
    if (!id || (!canViewInventory && !canViewRepairParts)) return;
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    try {
      const [wh, branches] = await Promise.all([
        warehouseService.getById(id).catch(() => null),
        repairBranchService.list().catch(() => [] as RepairBranch[]),
      ]);
      if (!wh) {
        setWarehouse(null);
        setLinkedBranch(null);
        setBranchParts([]);
        setLocationByKey(new Map());
        setLocationBalances([]);
        setWarehouseLocations([]);
        setError('المخزن غير موجود.');
        return;
      }

      const isCenter = isMaintenanceCenterWarehouseRole(wh.warehouseRole);
      const isCentralSpareParts = wh.warehouseRole === 'spare_parts_central';
      if (!canViewInventory && !(canViewRepairParts && isCenter)) {
        setWarehouse(null);
        setLinkedBranch(null);
        setBranchParts([]);
        setLocationByKey(new Map());
        setLocationBalances([]);
        setWarehouseLocations([]);
        setAccessDenied(true);
        setError('ليس لديك صلاحية عرض هذا المخزن.');
        return;
      }

      if (isCenter && (isRepairRoute || !canViewInventory)) {
        const allowedIds = new Set(
          resolveRepairCenterWarehouseIds({
            branches,
            canViewAllBranches: repairCtx.canViewAllBranches || repairCtx.adminSeesAllBranches,
            userBranchIds: resolveUserRepairBranchIds(user),
            inventoryWarehouseId: user?.inventoryWarehouseId,
          }),
        );
        if (allowedIds.size > 0 && !allowedIds.has(id) && !repairCtx.canViewAllBranches) {
          setWarehouse(null);
          setLinkedBranch(null);
          setBranchParts([]);
          setLocationByKey(new Map());
          setLocationBalances([]);
          setWarehouseLocations([]);
          setAccessDenied(true);
          setError('هذا المخزن غير مرتبط بفرعك.');
          return;
        }
      }

      const branch = branches.find((row) => String(row.warehouseId || '').trim() === id) || null;
      setWarehouse(wh);
      setLinkedBranch(branch);

      const [bal, tx, transfers, spr, parts, materials, locations, locBalances, shelves] = await Promise.all([
        stockService.getBalances(id).catch(() => [] as StockItemBalance[]),
        stockService.getTransactions(id).catch(() => [] as StockTransaction[]),
        canViewInventory
          ? transferApprovalService.getAll().catch(() => [] as InventoryTransferRequest[])
          : Promise.resolve([] as InventoryTransferRequest[]),
        sparePartsReplenishmentService.listRecent(50).catch(() => [] as SparePartsReplenishmentRequest[]),
        branch?.id && isCenter
          ? sparePartsService.listParts(String(branch.id)).catch(() => [] as RepairSparePart[])
          : Promise.resolve([] as RepairSparePart[]),
        isCenter || isCentralSpareParts
          ? materialService.getAll().catch(() => [])
          : Promise.resolve([]),
        loadWarehouseCountLocationLabels(id).catch(() => new Map<string, string>()),
        stockService.getLocationBalances({ warehouseId: id }).catch(() => [] as StockLocationBalance[]),
        warehouseLocationService.getAll(id).catch(() => [] as WarehouseLocation[]),
      ]);
      setCountBalances(bal);
      setBalances(bal.slice(0, 30));
      setLocationByKey(locations);
      setLocationBalances(locBalances);
      setWarehouseLocations(shelves);
      setBranchParts(parts);
      setCatalogMaterials(
        (materials || [])
          .filter((row) => row.isActive !== false && row.id)
          .map((row) => ({
            id: String(row.id),
            code: String(row.code || ''),
            name: String(row.name || ''),
            unit: String(row.baseUnit || 'piece'),
            categoryName: String(row.categoryName || ''),
            minStock: Number(row.minStock || 0),
            barcode: String(row.barcode || ''),
          })),
      );
      setTransactions(tx.slice(0, 20));
      setPendingTransfers(
        (transfers || [])
          .filter((t) => (
            (t.toWarehouseId === id || t.fromWarehouseId === id)
            && t.status === 'pending'
          ))
          .slice(0, 15),
      );
      {
        const pendingOrder: Record<string, number> = {
          submitted: 0,
          approved: 1,
          prepared: 2,
          responsible_approved: 3,
        };
        const scoped = spr.filter(
          (r) => r.fromWarehouseId === id || r.toWarehouseId === id,
        );
        const sorted = [...scoped].sort((a, b) => {
          const aPending = a.status in pendingOrder;
          const bPending = b.status in pendingOrder;
          if (aPending !== bPending) return aPending ? -1 : 1;
          if (aPending && bPending) {
            return (pendingOrder[a.status] ?? 9) - (pendingOrder[b.status] ?? 9);
          }
          return 0;
        });
        setReplenishments(sorted.slice(0, 20));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل مساحة المخزن.');
    } finally {
      setLoading(false);
    }
  }, [
    canViewInventory,
    canViewRepairParts,
    isRepairRoute,
    repairCtx.adminSeesAllBranches,
    repairCtx.canViewAllBranches,
    user,
    warehouseId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () =>
      warehouse?.id
        ? roleActions(warehouse.warehouseRole, warehouse.id, canUploadOpening)
        : [],
    [canUploadOpening, warehouse],
  );

  const isCenterWarehouse = isMaintenanceCenterWarehouseRole(warehouse?.warehouseRole);
  const isCentralSparePartsWarehouse = warehouse?.warehouseRole === 'spare_parts_central';
  const backPath = isRepairRoute || isCenterWarehouse
    ? '/repair/parts'
    : isCentralSparePartsWarehouse
      ? '/inventory/spare-parts-replenishment'
      : '/inventory/warehouses';
  const backLabel = isRepairRoute || isCenterWarehouse
    ? 'مخزون الفرع'
    : isCentralSparePartsWarehouse
      ? 'تموين قطع الغيار'
      : 'كل المخازن';
  const canEnterPage = canViewInventory || canViewRepairParts;
  const showAddPart = isCenterWarehouse && canManageParts && Boolean(linkedBranch?.id);
  const showCountImport = canManageCounts;
  const canCenterCreateFromCount = canUploadOpening
    && isCenterWarehouse
    && Boolean(linkedBranch?.id);
  const canCatalogSeedFromCount = canUploadOpening
    && isCentralSparePartsWarehouse
    && catalogMaterials.length > 0;
  const showOpeningBalanceImport = canUploadOpening
    && (isCentralSparePartsWarehouse || canCenterCreateFromCount);

  const openCreatedCountSession = useCallback(async (sessionId: string | null) => {
    await load();
    if (!sessionId || !canManageCounts) return;
    try {
      const sessions = await stockService.getCountSessions(String(warehouseId || ''));
      const session = sessions.find((row) => row.id === sessionId);
      if (!session) return;
      openModal(MODAL_KEYS.INVENTORY_STOCK_COUNT_SESSION, {
        session,
        canManage: canManageCounts,
        createdBy: userDisplayName || 'Current User',
        onUpdated: () => {
          void load();
        },
      });
    } catch (error: unknown) {
      toast.error(toUserSafeFirestoreError(error, 'تم إنشاء الجلسة. حدّث الصفحة لفتحها.'));
    }
  }, [canManageCounts, load, openModal, userDisplayName, warehouseId]);

  const lowStock = useMemo(
    () => countBalances.filter((b) => Number(b.quantity || 0) <= Number(b.minStock || 0)).length,
    [countBalances],
  );
  const totalSkus = countBalances.length;
  const awaitingApprove = replenishments.filter((r) => r.status === 'submitted').length;
  const awaitingPrepare = replenishments.filter((r) => r.status === 'approved').length;
  const awaitingResponsible = replenishments.filter((r) => r.status === 'prepared').length;
  const awaitingReceipt = replenishments.filter((r) => r.status === 'responsible_approved').length;
  const centralWorkQueue = awaitingApprove + awaitingPrepare + awaitingResponsible;
  const pendingReplenishments = useMemo(
    () => replenishments.filter((r) => (
      r.status === 'submitted'
      || r.status === 'approved'
      || r.status === 'prepared'
      || r.status === 'responsible_approved'
    )).slice(0, 8),
    [replenishments],
  );

  if (!canEnterPage) {
    return (
      <ModuleOpsPageShell eyebrow="المخزون" rangeLabel="مساحة المخزن">
        <OpsDashPanel accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (
    warehouse
    && isMaintenanceCenterWarehouseRole(warehouse.warehouseRole)
    && !isRepairRoute
    && warehouseId
  ) {
    return (
      <Navigate
        to={withTenantPath(tenantSlug, repairCenterWarehouseMenuPath(warehouseId))}
        replace
      />
    );
  }

  if (loading) {
    return (
      <ModuleOpsPageShell eyebrow="المخزون" rangeLabel="مساحة المخزن">
        <OpsDashPanel accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (!warehouse) {
    return (
      <ModuleOpsPageShell eyebrow="المخزون" rangeLabel="مساحة المخزن">
        <OpsDashPanel accent="inventory">
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--color-danger))]">{error || 'المخزن غير موجود.'}</p>
            <Link className="text-sm font-bold text-primary underline" to={withTenantPath(tenantSlug, backPath)}>
              {accessDenied ? 'العودة' : backLabel}
            </Link>
          </div>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="المخزون"
      rangeLabel={`${WAREHOUSE_ROLE_LABELS[warehouse.warehouseRole || 'general']} · ${warehouse.code}`}
      onRefresh={() => void load()}
      actions={(
        <Link
          className="text-sm font-bold text-primary underline"
          to={withTenantPath(tenantSlug, backPath)}
        >
          {backLabel}
        </Link>
      )}
    >
      <p className="text-lg font-bold text-[var(--color-text)] -mt-2 mb-2">{warehouse.name}</p>

      <WarehousePartInquiry
        warehouseId={warehouse.id || ''}
        warehouseName={warehouse.name}
        balances={countBalances}
        locationBalances={locationBalances}
        locations={warehouseLocations}
        catalogItems={catalogMaterials.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          barcode: row.barcode,
          itemType: 'material' as const,
        }))}
        onOpenLabelEngine={openLabelEngine}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OpsDashPanel title="أصناف لها رصيد" accent="inventory">
          <div className="text-2xl font-black">{totalSkus}</div>
        </OpsDashPanel>
        <OpsDashPanel title="تحت الحد الأدنى" accent="inventory">
          <div className="text-2xl font-black">{lowStock}</div>
          {isCentralSparePartsWarehouse && warehouse.id ? (
            <Link
              className="mt-1 inline-block text-xs font-bold text-primary underline"
              to={withTenantPath(
                tenantSlug,
                `/inventory/balances?warehouseId=${encodeURIComponent(warehouse.id)}`,
              )}
            >
              عرض الأرصدة
            </Link>
          ) : null}
        </OpsDashPanel>
        {isCentralSparePartsWarehouse ? (
          <>
            <OpsDashPanel title="بانتظارك (تموين)" accent="inventory">
              <div className="text-2xl font-black text-[rgb(var(--color-warning))]">{centralWorkQueue}</div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                اعتماد {awaitingApprove} · تجهيز {awaitingPrepare} · موافقة {awaitingResponsible}
              </p>
              {canViewReplenishment ? (
                <Link
                  className="mt-1 inline-block text-xs font-bold text-primary underline"
                  to={withTenantPath(tenantSlug, '/inventory/spare-parts-replenishment')}
                >
                  فتح قائمة التموين
                </Link>
              ) : null}
            </OpsDashPanel>
            <OpsDashPanel title="بانتظار استلام المراكز" accent="inventory">
              <div className="text-2xl font-black">{awaitingReceipt}</div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                معتمد من المسؤول — ينتظر تأكيد المركز
              </p>
            </OpsDashPanel>
          </>
        ) : (
          <>
            <OpsDashPanel title="تحويلات معلّقة" accent="inventory">
              <div className="text-2xl font-black">{pendingTransfers.length}</div>
            </OpsDashPanel>
            <OpsDashPanel title="طلبات تموين نشطة" accent="inventory">
              <div className="text-2xl font-black">
                {centralWorkQueue + awaitingReceipt}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                بانتظار معالجة {centralWorkQueue} · بانتظار استلام {awaitingReceipt}
              </p>
            </OpsDashPanel>
          </>
        )}
      </div>

      {(showAddPart || showCountImport || isCentralSparePartsWarehouse || countBalances.length > 0) ? (
        <OpsDashPanel title="تحكم المخزن" accent="inventory">
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            {isCentralSparePartsWarehouse
              ? 'إضافة وارد، صرف تموين للمراكز، متابعة أرصدة المراكز والسحب للرئيسي — من هنا مباشرة.'
              : 'الإضافة والجرد تتم من هنا مباشرة دون مغادرة مساحة المخزن.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {showAddPart ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => setAddPartOpen(true)}
                disabled={!linkedBranch?.id}
              >
                إضافة صنف
              </Button>
            ) : null}
            {isCentralSparePartsWarehouse && canCreateMovements && warehouse.id ? (
              <Link
                to={withTenantPath(
                  tenantSlug,
                  `/inventory/movements?warehouseId=${encodeURIComponent(warehouse.id)}&movementType=IN`,
                )}
              >
                <Button type="button" variant="primary">إذن إضافة</Button>
              </Link>
            ) : null}
            {isCentralSparePartsWarehouse && canViewReplenishment ? (
              <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-replenishment')}>
                <Button type="button" variant="secondary">إذن صرف للمراكز</Button>
              </Link>
            ) : null}
            {isCentralSparePartsWarehouse && canViewCenterStock ? (
              <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-center-stock')}>
                <Button type="button" variant="secondary">أرصدة المراكز</Button>
              </Link>
            ) : null}
            {isCentralSparePartsWarehouse && canCreateRecall ? (
              <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-recall')}>
                <Button type="button" variant="secondary">سحب من المراكز</Button>
              </Link>
            ) : null}
            {showCountImport ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (countBalances.length === 0 && !canCenterCreateFromCount && !canCatalogSeedFromCount) {
                    toast.error(
                      showOpeningBalanceImport && isCentralSparePartsWarehouse
                        ? 'لا توجد مواد في الماستر لرفع أرصدة أول المدة.'
                        : 'لا توجد أصناف في هذا المخزن لرفع الجرد.',
                    );
                    return;
                  }
                  setCountImportOpen(true);
                }}
              >
                {showOpeningBalanceImport
                  ? 'رفع أرصدة أول المدة'
                  : 'رفع جرد Excel'}
              </Button>
            ) : null}
            {warehouse.id ? (
              <Button
                type="button"
                variant="secondary"
                disabled={printing}
                onClick={() => setPrintPickerOpen(true)}
              >
                {printing ? 'جاري تجهيز الجرد…' : 'طباعة الجرد'}
              </Button>
            ) : null}
            {warehouse.id && (countBalances.length > 0 || warehouseLocations.length > 0) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => openLabelEngine({ mode: 'items', copies: 1 })}
              >
                طباعة ملصقات باركود الأصناف
              </Button>
            ) : null}
          </div>
          {isCenterWarehouse && canManageParts && !linkedBranch?.id ? (
            <p className="mt-2 text-xs text-[rgb(var(--color-warning))]">
              لا يوجد فرع صيانة مربوط بهذا المخزن — لا يمكن إضافة صنف من هنا.
            </p>
          ) : null}
        </OpsDashPanel>
      ) : null}

      {actions.length > 0 ? (
        <OpsDashPanel title={isCentralSparePartsWarehouse ? 'استعلامات وجرد' : 'إجراءات هذا المخزن'} accent="inventory">
          <div className="grid gap-2 md:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.path}
                to={withTenantPath(tenantSlug, action.path)}
                className="rounded-xl border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface-hover)]"
              >
                <div className="font-bold text-sm">{action.label}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1">{action.description}</div>
              </Link>
            ))}
          </div>
        </OpsDashPanel>
      ) : null}

      {(warehouse.warehouseRole === 'spare_parts_central'
        || warehouse.warehouseRole === 'maintenance_center')
        && (isCentralSparePartsWarehouse ? pendingReplenishments.length > 0 : replenishments.length > 0) ? (
        <OpsDashPanel title={isCentralSparePartsWarehouse ? 'طابور تموين يحتاج إجراء' : 'طلبات تموين قطع الغيار'} accent="inventory">
          <div className="space-y-2">
            {(isCentralSparePartsWarehouse ? pendingReplenishments : replenishments).map((row) => {
              const path = warehouse.warehouseRole === 'maintenance_center'
                ? '/repair/parts-replenishment'
                : `/inventory/spare-parts-replenishment?requestId=${encodeURIComponent(String(row.id || ''))}`;
              return (
                <Link
                  key={row.id}
                  to={withTenantPath(tenantSlug, path)}
                  className="flex flex-wrap justify-between gap-2 text-sm border-b border-[var(--color-border)]/50 py-2 hover:bg-[var(--color-surface-hover)] rounded-lg px-1"
                >
                  <div>
                    <div className="font-semibold">{row.referenceNo}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {row.fromWarehouseName} → {row.toWarehouseName}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-[rgb(var(--color-warning))]">
                    {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status]}
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-3">
            <Link
              className="text-sm font-bold text-primary underline"
              to={withTenantPath(
                tenantSlug,
                warehouse.warehouseRole === 'maintenance_center'
                  ? '/repair/parts-replenishment'
                  : '/inventory/spare-parts-replenishment',
              )}
            >
              فتح شاشة التموين الكاملة
            </Link>
          </div>
        </OpsDashPanel>
      ) : null}

      {warehouse.warehouseRole === 'final_product' && pendingTransfers.length > 0 ? (
        <OpsDashPanel title="تحويلات تحتاج متابعة / اعتماد" accent="inventory">
          <div className="space-y-2">
            {pendingTransfers.map((row) => (
              <div key={row.id} className="text-sm border-b border-[var(--color-border)]/50 py-2">
                <div className="font-semibold">{row.referenceNo || row.id}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {row.fromWarehouseName || row.fromWarehouseId} → {row.toWarehouseName || row.toWarehouseId}
                  {' · '}
                  {row.status}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link
              className="text-sm font-bold text-primary underline"
              to={withTenantPath(tenantSlug, '/inventory/transfer-approvals')}
            >
              فتح اعتماد التحويلات
            </Link>
          </div>
        </OpsDashPanel>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <OpsDashPanel title="أرصدة سريعة" accent="inventory">
          {balances.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا أرصدة بعد.</p>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--color-text-muted)]">
                    <th className="text-start py-1">الصنف</th>
                    <th className="text-start py-1">الكمية</th>
                    <th className="text-start py-1">الموقع</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={`${b.itemType}-${b.itemId}`} className="border-t border-[var(--color-border)]/40">
                      <td className="py-1">{b.itemName}</td>
                      <td className="py-1">{fmt(b.quantity)}</td>
                      <td className="py-1 font-mono">{resolveWarehouseItemLocation(locationByKey, b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpsDashPanel>
        <OpsDashPanel title="أحدث الحركات" accent="inventory">
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا حركات بعد.</p>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--color-text-muted)]">
                    <th className="text-start py-1">الصنف</th>
                    <th className="text-start py-1">النوع</th>
                    <th className="text-start py-1">الكمية</th>
                    <th className="text-start py-1">المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-[var(--color-border)]/40">
                      <td className="py-1">{tx.itemName}</td>
                      <td className="py-1">{tx.movementType}{tx.transferDirection ? `/${tx.transferDirection}` : ''}</td>
                      <td className="py-1">{fmt(tx.quantity)}</td>
                      <td className="py-1">{sourceModuleLabel(tx.sourceModule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpsDashPanel>
      </div>

      {showAddPart && linkedBranch?.id ? (
        <CreateRepairSparePartModal
          open={addPartOpen}
          onOpenChange={setAddPartOpen}
          branchId={String(linkedBranch.id)}
          existingParts={branchParts}
          defaultMinStock={repairSettings.defaults.defaultMinStock}
          onCreated={async () => {
            const parts = await sparePartsService.listParts(String(linkedBranch.id)).catch(() => [] as RepairSparePart[]);
            setBranchParts(parts);
            await load();
          }}
        />
      ) : null}

      {showCountImport ? (
        <ImportStockCountSheetModal
          open={countImportOpen}
          onClose={() => setCountImportOpen(false)}
          warehouseId={String(warehouse.id)}
          warehouseName={warehouse.name}
          balances={countBalances}
          centerCreate={
            canCenterCreateFromCount && linkedBranch?.id
              ? {
                  branchId: String(linkedBranch.id),
                  catalogMaterials,
                  existingParts: branchParts,
                  canManageParts,
                }
              : undefined
          }
          catalogSeed={
            canCatalogSeedFromCount && !canCenterCreateFromCount
              ? { catalogMaterials }
              : undefined
          }
          onPartsChanged={setBranchParts}
          onCreated={(sessionId) => void openCreatedCountSession(sessionId)}
        />
      ) : null}
      {countSheetHost}
      {warehouse.id ? (
        <WarehouseCountSheetPrintModal
          open={printPickerOpen}
          onClose={() => setPrintPickerOpen(false)}
          warehouses={[warehouse]}
          balances={countBalances}
          initialWarehouseId={String(warehouse.id)}
          warehouseSelectLocked
          printing={printing}
          resolveWarehouseRole={() => warehouse.warehouseRole}
          onPrint={printWarehouseCount}
        />
      ) : null}
      <BarcodeLabelPrintEngineModal
        open={labelEngineOpen}
        onClose={() => setLabelEngineOpen(false)}
        warehouseName={warehouse.name}
        printSettings={printSettings}
        items={countBalances.map((row) => {
          const cat = catalogMaterials.find((m) => m.id === row.itemId);
          return {
            id: String(row.itemId || ''),
            code: String(row.itemCode || ''),
            name: String(row.itemName || ''),
            barcode: cat?.barcode,
          };
        })}
        locations={warehouseLocations
          .filter((loc) => loc.id)
          .map((loc) => ({
            id: String(loc.id),
            code: String(loc.code || ''),
            rackName: loc.rackName || loc.rack,
            shelf: loc.shelfName || loc.shelf,
          }))}
        initialMode={labelEngineSeed.mode}
        initialItemId={labelEngineSeed.itemId || ''}
        initialLocationId={labelEngineSeed.locationId || ''}
        initialLocationIds={labelEngineSeed.locationIds}
        initialCopies={labelEngineSeed.copies || 1}
      />
    </ModuleOpsPageShell>
  );
};
