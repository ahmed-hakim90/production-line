import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, SearchableSelect } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppStore } from '../../../store/useAppStore';
import { stockService } from '../services/stockService';
import { createStockMovement } from '../usecases/createStockMovement';
import { createTransferRequest } from '../usecases/createTransferRequest';
import { unwrapOrThrow } from '@/shared/usecases';
import { rawMaterialService } from '../services/rawMaterialService';
import { warehouseService } from '../services/warehouseService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import type { RawMaterial, StockAdjustmentReason, Warehouse, WarehouseLocation, StockItemBalance, WarehouseRack, TransferRequestLine, StockTransaction } from '../types';
import { resolveInventoryRoutingV1 } from '../services/inventoryRoutingService';
import { StockAvailabilityHint } from '../components/StockAvailabilityHint';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import {
  exportToPDF,
  getShareResultFeedbackMessage,
  shareToWhatsApp,
  waitForExportPaint,
  type ShareResult,
} from '../../../utils/reportExport';
import { StockTransferPrint, StockTransferShareCard, type StockTransferPrintData } from '../components/StockTransferPrint';
import type { TransferDisplayUnitMode } from '../utils/transferUnits';
import {
  INV_REF_REGEX,
  applyScannedCodeToLines,
  createTransferLine,
  findItemOptionByCode,
  formatInvReference,
  lineQuantityInPieces as lineQtyPieces,
  validateTransferLines,
  buildTransferPrintDataPayload,
  type TransferFormLine,
  type TransferItemOption,
} from '../utils/transferFormShared';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  INVENTORY_TRANSFER_CREATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import {
  buildComponentCatalogOptions,
  getComponentAvailableQty,
  resolveComponentStockIdentity,
  type ComponentCatalogOption,
} from '../lib/componentCatalogOptions';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';
import { movementLabel } from './stockTransactions/types';
import { formatNumber } from '../../../utils/calculations';
import {
  flattenRecentVoucherFeed,
  voucherDestinationLabel,
  voucherMovementTitle,
  voucherPrintFilePrefix,
} from '../lib/groupStockVouchers';
import { filterManualTransferWarehouses } from '../lib/manualTransferWarehouses';
import {
  defaultItemLocationKey,
  indexDefaultItemLocations,
  resolveManualTransferDestinationLocation,
  resolveManualTransferSourceLocations,
} from '../lib/manualTransferLocations';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import { applyWarehouseBalanceDeltas, type WarehouseBalanceDelta } from '../lib/localBalancePatch';
import { mapGroupedSequentialParallel } from '../../shared/lib/mapGroupedSequentialParallel';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
type ItemType = 'finished_good' | 'raw_material';
type TransferLine = TransferFormLine;
const APP_VERSION = __APP_VERSION__;
const SPARE_WAREHOUSE_ROLES = new Set(['spare_parts_central', 'maintenance_center']);
const STOCK_MOVE_FORM_CATALOG_CACHE_KEY = 'inventory:stock-movement-form-catalog';

type StockMoveFormCatalog = {
  warehouses: Warehouse[];
  rawMaterials: RawMaterial[];
  materials: Material[];
  warehouseLocations: WarehouseLocation[];
  warehouseRacks: WarehouseRack[];
  nextReferenceSeq: number;
};

function isSparePartsWarehouse(warehouse: Warehouse | undefined): boolean {
  return Boolean(warehouse?.warehouseRole && SPARE_WAREHOUSE_ROLES.has(warehouse.warehouseRole));
}

export const StockMovementForm: React.FC = () => {
  const location = useLocation();
  const navigate = useTenantNavigate();
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const { openModal } = useGlobalModalManager();
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    routingConfigured,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const uid = useAppStore((s) => s.uid);
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const inventoryRouting = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const transferDisplayUnit = useAppStore(
    (s) => (s.systemSettings.planSettings?.transferDisplayUnit || 'piece') as TransferDisplayUnitMode,
  );
  const companyName = useAppStore((s) => s.systemSettings.branding?.factoryName ?? 'الشركة');
  const { can } = usePermission();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocation[]>([]);
  const [warehouseRacks, setWarehouseRacks] = useState<WarehouseRack[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);

  const initialSearch = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialMovement = initialSearch.get('movementType');
  const initialItemType = initialSearch.get('itemType');
  const [itemType, setItemType] = useState<ItemType>(
    scoped || initialItemType === 'raw_material' ? 'raw_material' : 'finished_good',
  );
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState(
    () => initialSearch.get('warehouseId') || scopedWarehouseId || '',
  );
  const [locationId, setLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [movementType, setMovementType] = useState<MovementType>(
    initialMovement === 'OUT' || initialMovement === 'TRANSFER' || initialMovement === 'ADJUSTMENT'
      ? initialMovement
      : 'IN',
  );
  const [adjustmentReason, setAdjustmentReason] = useState<StockAdjustmentReason>('manual_correction');
  const [quantity, setQuantity] = useState<number>(0);
  const [voucherNote, setVoucherNote] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [transferItems, setTransferItems] = useState<TransferLine[]>([createTransferLine()]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [nextReferenceSeq, setNextReferenceSeq] = useState(1);
  const [saving, setSaving] = useState(false);
  const [recentTxs, setRecentTxs] = useState<StockTransaction[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [defaultLocationsByKey, setDefaultLocationsByKey] = useState(
    () => new Map<string, { locationId: string; locationCode?: string }>(),
  );
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const [previewData, setPreviewData] = useState<StockTransferPrintData | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const transferPrintRef = useRef<HTMLDivElement>(null);
  const transferShareCardRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer',
  });

  const loadCatalog = useCallback(async () => {
    const cached = peekPageDataCache<StockMoveFormCatalog>(STOCK_MOVE_FORM_CATALOG_CACHE_KEY);
    if (cached) {
      setWarehouses(cached.warehouses);
      setRawMaterials(cached.rawMaterials);
      setMaterials(cached.materials);
      setWarehouseLocations(cached.warehouseLocations);
      setWarehouseRacks(cached.warehouseRacks);
      setNextReferenceSeq(cached.nextReferenceSeq);
    }
    const { data } = await fetchCachedPageData(
      STOCK_MOVE_FORM_CATALOG_CACHE_KEY,
      async () => {
        const [whs, rms, mats, peekRef, locs, racks] = await Promise.all([
          warehouseService.getActiveWarehouses(),
          rawMaterialService.getAll(),
          materialService.getAll().catch(() => [] as Material[]),
          stockService.getNextInvReferenceNo(),
          warehouseLocationService.getAll(),
          warehouseRackService.getAll(),
        ]);
        const match = peekRef.trim().match(INV_REF_REGEX);
        return {
          warehouses: whs,
          rawMaterials: rms.filter((m) => m.isActive !== false),
          materials: mats.filter((m) => m.isActive !== false),
          warehouseLocations: locs,
          warehouseRacks: racks,
          nextReferenceSeq: match ? Number(match[1] || 0) : 1,
        } satisfies StockMoveFormCatalog;
      },
      { maxAgeMs: 60_000 },
    );
    setWarehouses(data.warehouses);
    setRawMaterials(data.rawMaterials);
    setMaterials(data.materials);
    setWarehouseLocations(data.warehouseLocations);
    setWarehouseRacks(data.warehouseRacks);
    setNextReferenceSeq(data.nextReferenceSeq);
  }, []);

  const loadBalancesForWarehouse = useCallback(async (whId: string) => {
    if (!whId) {
      setBalances([]);
      return;
    }
    const bals = await stockService.getBalances(whId);
    setBalances(bals);
  }, []);

  const loadRecentMovements = useCallback(async (whId: string) => {
    if (!whId) {
      setRecentTxs([]);
      return;
    }
    setRecentLoading(true);
    try {
      const page = await stockService.getTransactionsPaged({
        warehouseId: whId,
        limit: 20,
      });
      setRecentTxs(page.items);
    } catch {
      setRecentTxs([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // balances loaded after effectiveWarehouseId is known (see below)

  useEffect(() => {
    const queryWarehouseId = initialSearch.get('warehouseId') || '';
    setWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]),
    );
    const nextItemType = initialSearch.get('itemType');
    if (scoped || nextItemType === 'raw_material') {
      setItemType('raw_material');
    } else if (nextItemType === 'finished_good') {
      setItemType('finished_good');
    }
    const nextMovement = initialSearch.get('movementType');
    if (
      nextMovement === 'IN' ||
      nextMovement === 'OUT' ||
      nextMovement === 'TRANSFER' ||
      nextMovement === 'ADJUSTMENT'
    ) {
      setMovementType(nextMovement);
    }
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, initialSearch, resolveScopedWarehouseId]);

  /** إذن إضافة من قائمة قطع الغيار: افترض المخزن المركزي إن لم يُحدَّد مخزن. */
  useEffect(() => {
    if (warehouseId || scopedWarehouseId || scoped) return;
    if (movementType !== 'IN') return;
    if (initialSearch.get('warehouseId')) return;
    const central = warehouses.find((w) => w.warehouseRole === 'spare_parts_central');
    if (!central?.id) return;
    setWarehouseId(central.id);
    setItemType('raw_material');
  }, [warehouses, warehouseId, scopedWarehouseId, scoped, movementType, initialSearch]);

  const sourceWarehouses = useMemo(
    () => filterManualTransferWarehouses(filterWarehouses(warehouses)),
    [filterWarehouses, warehouses],
  );

  const openImportInByCodeModal = useCallback((nextItemType: 'finished_good' | 'raw_material' = 'finished_good') => {
    openModal(MODAL_KEYS.INVENTORY_IMPORT_IN_BY_CODE, {
      warehouseId: warehouseId || '',
      itemType: nextItemType,
      onSaved: () => {
        void loadBalancesForWarehouse(warehouseId);
      },
    });
  }, [openModal, warehouseId, loadBalancesForWarehouse]);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'import-in-by-code' && can('inventory.transactions.create')) {
      const itemTypeParam = new URLSearchParams(location.search).get('itemType');
      const importItemType = itemTypeParam === 'raw_material' ? 'raw_material' : 'finished_good';
      openImportInByCodeModal(importItemType);
    }
  }, [location.search, can, openImportInByCodeModal]);

  const referenceNo = useMemo(() => formatInvReference(nextReferenceSeq), [nextReferenceSeq]);

  const rawProductMetaById = useMemo(
    () => new Map(_rawProducts.map((p) => [p.id, p])),
    [_rawProducts],
  );

  const selectedWarehouseRole = useMemo(
    () => warehouses.find((w) => w.id === warehouseId),
    [warehouses, warehouseId],
  );
  const isSparePartsContext = isSparePartsWarehouse(selectedWarehouseRole);
  const usesMultiLineItems = movementType === 'IN' || movementType === 'OUT' || movementType === 'TRANSFER';

  useEffect(() => {
    if (!isSparePartsContext || scoped) return;
    if (initialSearch.get('itemType') === 'finished_good') return;
    setItemType((prev) => (prev === 'raw_material' ? prev : 'raw_material'));
  }, [isSparePartsContext, scoped, initialSearch]);

  const finishedGoodOptions = useMemo((): TransferItemOption[] => products.map((p) => {
    const raw = rawProductMetaById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      minStock: 0,
      unitsPerCarton: Number(raw?.unitsPerCarton || 0),
      stockItemType: 'finished_good',
    };
  }), [products, rawProductMetaById]);

  const spareEligibleMaterials = useMemo(
    () =>
      isSparePartsContext
        ? materials.filter((m) => m.availableForSpareParts !== false)
        : materials,
    [materials, isSparePartsContext],
  );

  const componentOptions = useMemo(
    () => buildComponentCatalogOptions(spareEligibleMaterials, isSparePartsContext ? [] : rawMaterials),
    [spareEligibleMaterials, rawMaterials, isSparePartsContext],
  );

  const rawMaterialOptions = useMemo(
    (): TransferItemOption[] =>
      componentOptions.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        minStock: m.minStock,
        unitsPerCarton: 0,
        stockItemType: m.stockItemType,
      })),
    [componentOptions],
  );

  const componentById = useMemo(() => {
    const map = new Map<string, ComponentCatalogOption>();
    componentOptions.forEach((opt) => map.set(opt.id, opt));
    return map;
  }, [componentOptions]);

  const itemOptions = itemType === 'finished_good' ? finishedGoodOptions : rawMaterialOptions;
  const selectedItem = itemOptions.find((item) => item.id === itemId);
  const tamAlsnaaWarehouse = useMemo(
    () =>
      warehouses.find((w) => {
        const n = (w.name || '').trim().toLowerCase();
        return n === 'تم الصنع' || n.includes('تم الصنع');
      }) ?? null,
    [warehouses],
  );
  const autoTransferSourceWarehouseId =
    inventoryRouting.finishedStagingWarehouseId
    || inventoryRouting.productionWipWarehouseId
    || tamAlsnaaWarehouse?.id
    || '';
  const isFinishedTransferFlow = movementType === 'TRANSFER' && itemType === 'finished_good';
  const hasAutoTransferSource = !!autoTransferSourceWarehouseId;
  const effectiveWarehouseId = isFinishedTransferFlow
    ? (autoTransferSourceWarehouseId || warehouseId)
    : warehouseId;

  useEffect(() => {
    void loadBalancesForWarehouse(effectiveWarehouseId);
    void loadRecentMovements(effectiveWarehouseId);
  }, [effectiveWarehouseId, loadBalancesForWarehouse, loadRecentMovements]);

  const selectedFromWarehouse = warehouses.find((w) => w.id === effectiveWarehouseId);
  const selectedToWarehouse = warehouses.find((w) => w.id === toWarehouseId);
  const selectedLocation = warehouseLocations.find((loc) => loc.id === locationId);
  const selectedToLocation = warehouseLocations.find((loc) => loc.id === toLocationId);
  const isShelfTransfer =
    movementType === 'TRANSFER' &&
    Boolean(effectiveWarehouseId) &&
    toWarehouseId === effectiveWarehouseId;
  const selectedOperationPathEnabled = movementType === 'TRANSFER'
    ? isShelfTransfer
      ? isOperationPathEnabled(
          systemSettings,
          INVENTORY_OPERATION_KEYS.stockMove,
          INVENTORY_STOCK_MOVE_PATHS.immediateTransfer,
        )
      : isOperationPathEnabled(
          systemSettings,
          INVENTORY_OPERATION_KEYS.transferCreate,
          INVENTORY_TRANSFER_CREATE_PATHS.movementsForm,
        )
    : isOperationPathEnabled(
        systemSettings,
        INVENTORY_OPERATION_KEYS.stockMove,
        INVENTORY_STOCK_MOVE_PATHS.movementsForm,
      );
  const inactiveRackIds = useMemo(
    () => new Set(warehouseRacks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean)),
    [warehouseRacks],
  );
  const locationSelectOptions = useMemo(
    () =>
      warehouseLocations
        .filter((loc) => loc.warehouseId === effectiveWarehouseId && loc.isActive !== false && (!loc.rackId || !inactiveRackIds.has(loc.rackId)))
        .map((loc) => ({
          value: loc.id || '',
          label: `${loc.code} (راك ${loc.rackName || loc.rack} / رف ${loc.shelfName || loc.shelf})`,
        })),
    [warehouseLocations, effectiveWarehouseId, inactiveRackIds],
  );
  const usesLineLocations =
    (movementType === 'IN' || movementType === 'OUT')
    && locationSelectOptions.length > 0
    && (itemType === 'raw_material' || isSparePartsContext);

  useEffect(() => {
    if (!effectiveWarehouseId || !usesLineLocations) {
      setDefaultLocationsByKey(new Map());
      return;
    }
    let cancelled = false;
    void defaultItemLocationService.getAll(effectiveWarehouseId)
      .then((rows) => {
        if (cancelled) return;
        setDefaultLocationsByKey(indexDefaultItemLocations(rows));
      })
      .catch(() => {
        if (!cancelled) setDefaultLocationsByKey(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveWarehouseId, usesLineLocations]);

  const itemSelectOptions = useMemo(
    () =>
      itemOptions.map((opt) => {
        let available = 0;
        if (itemType === 'finished_good') {
          const row = balances.find(
            (b) =>
              b.warehouseId === effectiveWarehouseId &&
              b.itemType === 'finished_good' &&
              b.itemId === opt.id,
          );
          available = Number(row?.quantity || 0);
        } else {
          const component = componentById.get(opt.id);
          available = component
            ? getComponentAvailableQty(balances, effectiveWarehouseId, component)
            : 0;
        }
        return {
          value: opt.id,
          label: `${opt.name} (${opt.code}) — المتاح: ${available}`,
        };
      }),
    [itemOptions, balances, effectiveWarehouseId, itemType, componentById],
  );
  const warehouseSelectOptions = useMemo(
    () =>
      sourceWarehouses.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [sourceWarehouses],
  );
  const toWarehouseSelectOptions = useMemo(
    () => {
      const same = selectedFromWarehouse?.id
        ? [{
            value: selectedFromWarehouse.id,
            label: `${selectedFromWarehouse.name} (${selectedFromWarehouse.code}) — نقل رف → رف`,
          }]
        : [];
      const destinationCandidates = filterManualTransferWarehouses(warehouses, {
        sparePartsOnly: isSparePartsContext,
      });
      const others = destinationCandidates
        .filter((w) => w.id && w.id !== effectiveWarehouseId)
        .map((w) => ({
          value: w.id || '',
          label: `${w.name} (${w.code})`,
        }));
      return [...same, ...others];
    },
    [warehouses, effectiveWarehouseId, selectedFromWarehouse, isSparePartsContext],
  );

  useEffect(() => {
    if (!toWarehouseId) return;
    if (!toWarehouseSelectOptions.some((opt) => opt.value === toWarehouseId)) {
      setToWarehouseId('');
      setToLocationId('');
    }
  }, [toWarehouseId, toWarehouseSelectOptions]);

  const getItemById = (id: string) => itemOptions.find((item) => item.id === id);

  const getAvailableForItem = (lineItemId: string) => {
    if (!lineItemId || !effectiveWarehouseId) return 0;
    if (itemType === 'finished_good') {
      const row = balances.find(
        (b) =>
          b.warehouseId === effectiveWarehouseId &&
          b.itemType === 'finished_good' &&
          b.itemId === lineItemId,
      );
      return Number(row?.quantity || 0);
    }
    const component = componentById.get(lineItemId);
    if (!component) return 0;
    return getComponentAvailableQty(balances, effectiveWarehouseId, component);
  };

  const resolveLineStockIdentity = (
    lineItemId: string,
    movement: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT',
  ) => {
    if (itemType === 'finished_good') {
      return {
        itemType: 'finished_good' as const,
        itemId: lineItemId,
        available: getAvailableForItem(lineItemId),
      };
    }
    const component = componentById.get(lineItemId);
    if (!component) {
      return { itemType: 'raw_material' as const, itemId: lineItemId, available: 0 };
    }
    return resolveComponentStockIdentity(component, balances, effectiveWarehouseId, movement);
  };

  const resolvePreferredLineLocation = (itemId: string, currentLocationId?: string) => {
    const current = String(currentLocationId || '').trim();
    if (current) return current;
    if (!itemId) return String(locationId || '').trim();
    const identity = resolveLineStockIdentity(itemId, movementType === 'OUT' ? 'OUT' : 'IN');
    const linked = defaultLocationsByKey.get(
      defaultItemLocationKey(identity.itemType, identity.itemId),
    );
    return String(linked?.locationId || locationId || '').trim();
  };

  const lineQuantityInPieces = (line: TransferLine) =>
    lineQtyPieces(line, getItemById(line.itemId), itemType);

  useEffect(() => {
    if (!isFinishedTransferFlow || !hasAutoTransferSource) return;
    if (warehouseId !== autoTransferSourceWarehouseId) {
      setWarehouseId(autoTransferSourceWarehouseId);
    }
  }, [isFinishedTransferFlow, hasAutoTransferSource, warehouseId, autoTransferSourceWarehouseId]);

  const resetForm = (nextMovementType: MovementType = 'IN') => {
    setItemId('');
    if (!warehouseSelectLocked && !isSparePartsContext) {
      setWarehouseId('');
    }
    setLocationId('');
    setToLocationId('');
    setToWarehouseId('');
    setMovementType(nextMovementType);
    setQuantity(0);
    setVoucherNote('');
    setTransferItems([createTransferLine()]);
  };

  const buildTransferPrintData = (resolvedReferenceNo: string, txId: string | null): StockTransferPrintData =>
    buildTransferPrintDataPayload({
      resolvedReferenceNo,
      txId,
      transferItems,
      itemType,
      getItemById,
      qtyInPieces: lineQuantityInPieces,
      fromWarehouseName: selectedFromWarehouse?.name || '',
      effectiveWarehouseId,
      toWarehouseName: selectedToWarehouse?.name || '',
      toWarehouseId,
      transferDisplayUnit,
      createdBy: userDisplayName || 'Current User',
    });

  const showShareFeedback = (result: ShareResult) => {
    const msg = getShareResultFeedbackMessage(result, { downloadEntityLabel: 'الإذن' });
    if (!msg) return;
    toast.success(msg);
  };

  const buildInOutPrintPayload = (resolvedReferenceNo: string): StockTransferPrintData => ({
    transferNo: resolvedReferenceNo,
    createdAt: new Date().toISOString(),
    fromWarehouseName: selectedFromWarehouse?.name || effectiveWarehouseId,
    toWarehouseName: voucherDestinationLabel(
      movementType === 'OUT' ? 'OUT' : 'IN',
      isSparePartsContext,
    ),
    note: voucherNote.trim() || undefined,
    statusLabel: voucherMovementTitle(
      movementType === 'OUT' ? 'OUT' : 'IN',
      isSparePartsContext,
    ),
    items: transferItems.map((line) => {
      const item = getItemById(line.itemId)!;
      const isCarton = itemType === 'finished_good' && line.unit === 'carton';
      const qtyPieces = lineQuantityInPieces(line);
      return {
        itemName: item.name,
        itemCode: item.code,
        unitLabel: isCarton ? 'كرتونة' : 'قطعة',
        quantity: Number(line.quantity || 0),
        quantityPieces: qtyPieces,
        unitsPerCarton: isCarton ? Number(item.unitsPerCarton || 0) : undefined,
      };
    }),
    createdBy: userDisplayName || 'Current User',
  });

  const printDocument = async (fileName: string) => {
    if (!transferPrintRef.current) return;
    if (isMobilePrint) {
      await exportToPDF(transferPrintRef.current, fileName, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: 1,
      });
      return;
    }
    handleTransferPrint();
  };

  const printTransfer = async (fileName: string) => {
    await printDocument(fileName);
  };

  const handleSubmit = async (afterSaveAction: 'none' | 'print' | 'preview' | 'share' = 'none') => {
    if (!selectedOperationPathEnabled) {
      toast.error('هذا المسار متوقف من إعدادات النظام.');
      return;
    }
    if (!effectiveWarehouseId) {
      toast.error('اختر المخزن أولاً.');
      return;
    }
    if (movementType === 'TRANSFER' && !toWarehouseId) {
      toast.error('اختر مخزن الوجهة للتحويل.');
      return;
    }
    if (movementType === 'TRANSFER' && toWarehouseId === effectiveWarehouseId) {
      if (!locationId || !toLocationId) {
        toast.error('حدد رف المصدر ورف الوجهة لنقل داخل نفس المخزن.');
        return;
      }
      if (locationId === toLocationId) {
        toast.error('رف المصدر ورف الوجهة يجب أن يكونا مختلفين.');
        return;
      }
    }

    setSaving(true);
    try {
      const resolvedReferenceNo = referenceNo;
      let txId: string | null = null;

      if (movementType === 'TRANSFER') {
        const validationError = validateTransferLines(transferItems, itemType, getItemById);
        if (validationError) {
          toast.error(validationError);
          return;
        }

        if (toWarehouseId === effectiveWarehouseId) {
          const prepared: Array<{
            line: TransferLine;
            item: TransferItemOption;
            qty: number;
            stockIdentity: ReturnType<typeof resolveLineStockIdentity>;
          }> = [];
          for (const line of transferItems) {
            const item = getItemById(line.itemId);
            if (!item) continue;
            const qty = lineQuantityInPieces(line);
            const stockIdentity = resolveLineStockIdentity(line.itemId, 'TRANSFER');
            if (qty > stockIdentity.available) {
              toast.error(`الكمية تتجاوز الرصيد المتاح للصنف "${item.name}" (${stockIdentity.available}).`);
              return;
            }
            prepared.push({ line, item, qty, stockIdentity });
          }
          if (!prepared.length) {
            toast.error('تعذر ترحيل أي صنف.');
            return;
          }
          await mapGroupedSequentialParallel(
            prepared,
            (row) => `${row.stockIdentity.itemType}__${row.stockIdentity.itemId}`,
            async (row) => {
              txId = unwrapOrThrow(await createStockMovement({
                warehouseId: effectiveWarehouseId,
                toWarehouseId: effectiveWarehouseId,
                locationId,
                locationCode: selectedLocation?.code,
                toLocationId,
                toLocationCode: selectedToLocation?.code,
                itemType: row.stockIdentity.itemType,
                itemId: row.stockIdentity.itemId,
                itemName: row.item.name,
                itemCode: row.item.code,
                movementType: 'TRANSFER',
                quantity: row.qty,
                unit: itemType === 'finished_good' ? row.line.unit : 'unit',
                requestQuantity: Number(row.line.quantity || 0),
                requestUnit: itemType === 'finished_good' ? row.line.unit : 'unit',
                unitsPerCarton: itemType === 'finished_good' ? Number(row.item.unitsPerCarton || 0) : undefined,
                minStock: row.item.minStock,
                referenceNo: resolvedReferenceNo,
                note: 'نقل رف → رف داخل نفس المخزن',
                sourceModule: 'manual_movement',
                createdBy: userDisplayName || 'Current User',
              }, { path: INVENTORY_STOCK_MOVE_PATHS.immediateTransfer })).transactionId;
            },
          );
        } else {
          const [sourceDefaults, destDefaults, sourceLocBalances] = await Promise.all([
            defaultItemLocationService.getAll(effectiveWarehouseId).catch(() => []),
            defaultItemLocationService.getAll(toWarehouseId).catch(() => []),
            locationSelectOptions.length > 0
              ? stockService.getLocationBalances({ warehouseId: effectiveWarehouseId }).catch(() => [])
              : Promise.resolve([]),
          ]);
          const sourceDefaultsByKey = indexDefaultItemLocations(sourceDefaults);
          const destDefaultsByKey = indexDefaultItemLocations(destDefaults);
          const warehouseHasLocations = locationSelectOptions.length > 0;

          const requestLines: TransferRequestLine[] = [];
          for (const line of transferItems) {
            const item = getItemById(line.itemId);
            if (!item) {
              toast.error('كل صف يجب أن يحتوي على صنف.');
              return;
            }
            const identity = itemType === 'finished_good'
              ? { itemType: 'finished_good' as const, itemId: item.id, available: getAvailableForItem(item.id) }
              : resolveLineStockIdentity(line.itemId, 'TRANSFER');
            const qty = lineQuantityInPieces(line);
            if (qty > identity.available) {
              toast.error(`الكمية تتجاوز الرصيد المتاح للصنف "${item.name}" (${identity.available}).`);
              return;
            }
            const sourceDefault = sourceDefaultsByKey.get(
              defaultItemLocationKey(identity.itemType, identity.itemId),
            );
            const sourceResolved = resolveManualTransferSourceLocations({
              itemName: item.name,
              itemType: identity.itemType,
              itemId: identity.itemId,
              quantity: qty,
              warehouseHasLocations,
              defaultLocation: sourceDefault,
              locationBalances: sourceLocBalances,
            });
            if (sourceResolved.ok === false) {
              toast.error(sourceResolved.error);
              return;
            }
            const destination = resolveManualTransferDestinationLocation({
              itemType: identity.itemType,
              itemId: identity.itemId,
              defaultsByKey: destDefaultsByKey,
            });
            for (const slice of sourceResolved.slices) {
              const row: TransferRequestLine = {
                itemType: identity.itemType,
                itemId: identity.itemId,
                itemName: item.name,
                itemCode: item.code,
                quantity: slice.quantity,
                requestQuantity: itemType === 'finished_good' && line.unit === 'carton'
                  ? Number(line.quantity || 0)
                  : slice.quantity,
                requestUnit: (itemType === 'finished_good' ? line.unit : 'unit') as TransferRequestLine['requestUnit'],
                minStock: item.minStock,
              };
              if (itemType === 'finished_good') {
                row.unitsPerCarton = Number(item.unitsPerCarton || 0);
              }
              if (slice.locationId) {
                row.locationId = slice.locationId;
                if (slice.locationCode) row.locationCode = slice.locationCode;
              }
              if (destination.toLocationId) {
                row.toLocationId = destination.toLocationId;
                if (destination.toLocationCode) row.toLocationCode = destination.toLocationCode;
              }
              requestLines.push(row);
            }
          }
          if (!requestLines.length) {
            toast.error('تعذر تجهيز أصناف طلب التحويل.');
            return;
          }

          txId = unwrapOrThrow(await createTransferRequest({
            requestType: 'manual_transfer',
            fromWarehouseId: effectiveWarehouseId,
            fromWarehouseName: selectedFromWarehouse?.name || '',
            toWarehouseId,
            toWarehouseName: selectedToWarehouse?.name || '',
            referenceNo: resolvedReferenceNo,
            lines: requestLines,
            note: '',
            sourceModule: 'manual_movement',
            createdBy: userDisplayName || userEmail || 'Current User',
            createdByUserId: uid || undefined,
          }, { path: INVENTORY_TRANSFER_CREATE_PATHS.movementsForm })).requestId;
        }
      } else if (movementType === 'IN' || movementType === 'OUT') {
        const validationError = validateTransferLines(transferItems, itemType, getItemById, {
          requireLocation: usesLineLocations,
          allowSameItemDifferentLocation: usesLineLocations,
        });
        if (validationError) {
          toast.error(validationError);
          return;
        }

        const prepared: Array<{
          line: TransferLine;
          item: TransferItemOption;
          qty: number;
          stockIdentity: ReturnType<typeof resolveLineStockIdentity>;
          lineLocationId?: string;
          lineLocationCode?: string;
        }> = [];
        for (const line of transferItems) {
          const item = getItemById(line.itemId);
          if (!item) continue;
          const qty = lineQuantityInPieces(line);
          const stockIdentity = resolveLineStockIdentity(line.itemId, movementType);
          if (movementType === 'OUT' && qty > stockIdentity.available) {
            toast.error(`الكمية تتجاوز الرصيد المتاح للصنف "${item.name}" (${stockIdentity.available}).`);
            return;
          }
          const lineLocationId = String(line.locationId || locationId || '').trim();
          const lineLocation = warehouseLocations.find((loc) => loc.id === lineLocationId);
          prepared.push({
            line,
            item,
            qty,
            stockIdentity,
            lineLocationId: lineLocationId || undefined,
            lineLocationCode: lineLocation?.code,
          });
        }
        if (prepared.length === 0) {
          toast.error('تعذر ترحيل أي صنف.');
          return;
        }
        await mapGroupedSequentialParallel(
          prepared,
          (row) => `${row.stockIdentity.itemType}__${row.stockIdentity.itemId}`,
          async (row) => {
            txId = unwrapOrThrow(await createStockMovement({
              warehouseId: effectiveWarehouseId,
              locationId: row.lineLocationId,
              locationCode: row.lineLocationCode,
              toWarehouseId: undefined,
              itemType: row.stockIdentity.itemType,
              itemId: row.stockIdentity.itemId,
              itemName: row.item.name,
              itemCode: row.item.code,
              movementType,
              quantity: row.qty,
              unit: itemType === 'finished_good' ? row.line.unit : 'unit',
              requestQuantity: Number(row.line.quantity || 0),
              requestUnit: itemType === 'finished_good' ? row.line.unit : 'unit',
              unitsPerCarton: itemType === 'finished_good' ? Number(row.item.unitsPerCarton || 0) : undefined,
              minStock: row.item.minStock,
              referenceNo: resolvedReferenceNo,
              note: voucherNote.trim() || undefined,
              sourceModule: 'manual_movement',
              sourceId: `${resolvedReferenceNo}:${row.line.id}`,
              createdBy: userDisplayName || 'Current User',
            }, { path: INVENTORY_STOCK_MOVE_PATHS.movementsForm })).transactionId;
          },
        );
      } else {
        if (!selectedItem) {
          toast.error('اختر الصنف أولًا.');
          return;
        }
        if (quantity === 0) {
          toast.error('كمية التسوية لا يمكن أن تساوي صفر.');
          return;
        }
        if (itemType === 'raw_material' && locationSelectOptions.length > 0 && !locationId) {
          toast.error('حدد اللوكيشن قبل تسجيل حركة مكون.');
          return;
        }
        const stockIdentity = resolveLineStockIdentity(selectedItem.id, movementType);
        const available = stockIdentity.available;
        const nextBalance = available + Number(quantity || 0);
        if (nextBalance < 0) {
          toast.error(`التسوية ستجعل الرصيد سالباً (الحالي ${available}).`);
          return;
        }
        const effectiveQuantity = Number(quantity || 0);

        txId = unwrapOrThrow(await createStockMovement({
          warehouseId: effectiveWarehouseId,
          locationId: locationId || undefined,
          locationCode: selectedLocation?.code,
          toWarehouseId: undefined,
          itemType: stockIdentity.itemType,
          itemId: stockIdentity.itemId,
          itemName: selectedItem.name,
          itemCode: selectedItem.code,
          movementType,
          quantity: effectiveQuantity,
          minStock: selectedItem.minStock,
          referenceNo: resolvedReferenceNo,
          note: voucherNote.trim() || undefined,
          sourceModule: 'manual_movement',
          adjustmentReason,
          createdBy: userDisplayName || 'Current User',
        }, { path: INVENTORY_STOCK_MOVE_PATHS.movementsForm })).transactionId;
      }
      toast.success(movementType === 'TRANSFER'
          ? (isShelfTransfer
            ? 'تم نقل الأصناف من رف إلى رف بنجاح.'
            : 'تم إرسال التحويلة للاعتماد. سيتم ترحيل المخزون بعد الموافقة.')
          : movementType === 'IN'
            ? (isSparePartsContext
              ? `تم تسجيل إذن الإضافة (${transferItems.length} صنف) بنجاح.`
              : `تم تسجيل الوارد (${transferItems.length} صنف) بنجاح.`)
            : movementType === 'OUT'
              ? `تم تسجيل المنصرف (${transferItems.length} صنف) بنجاح.`
              : 'تم تسجيل الحركة بنجاح.',
        (movementType === 'IN' || movementType === 'OUT')
          ? {
              action: {
                label: 'فتح في السجل',
                onClick: () => {
                  const qs = new URLSearchParams();
                  if (effectiveWarehouseId) qs.set('warehouseId', effectiveWarehouseId);
                  if (isSparePartsContext) qs.set('focus', 'spare');
                  qs.set('q', resolvedReferenceNo);
                  navigate(`/inventory/transactions?${qs.toString()}`);
                },
              },
            }
          : undefined,
      );

      const balanceDeltas: WarehouseBalanceDelta[] = [];
      if ((movementType === 'IN' || movementType === 'OUT') && effectiveWarehouseId) {
        for (const line of transferItems) {
          const item = getItemById(line.itemId);
          if (!item) continue;
          const stockIdentity = resolveLineStockIdentity(line.itemId, movementType);
          const qty = lineQuantityInPieces(line);
          balanceDeltas.push({
            warehouseId: effectiveWarehouseId,
            itemType: stockIdentity.itemType,
            itemId: stockIdentity.itemId,
            delta: movementType === 'IN' ? qty : -qty,
            itemName: item.name,
            itemCode: item.code,
            minStock: item.minStock,
          });
        }
      } else if (movementType === 'ADJUSTMENT' && selectedItem && effectiveWarehouseId) {
        const stockIdentity = resolveLineStockIdentity(selectedItem.id, movementType);
        balanceDeltas.push({
          warehouseId: effectiveWarehouseId,
          itemType: stockIdentity.itemType,
          itemId: stockIdentity.itemId,
          delta: Number(quantity || 0),
          itemName: selectedItem.name,
          itemCode: selectedItem.code,
          minStock: selectedItem.minStock,
        });
      }
      if (balanceDeltas.length) {
        setBalances((prev) => applyWarehouseBalanceDeltas(prev, balanceDeltas));
      }

      const shouldPrintVoucher =
        afterSaveAction !== 'none'
        && (
          (movementType === 'TRANSFER' && !isShelfTransfer)
          || movementType === 'IN'
          || movementType === 'OUT'
        );
      const printPayload = !shouldPrintVoucher
        ? null
        : movementType === 'TRANSFER'
          ? buildTransferPrintData(resolvedReferenceNo, txId)
          : buildInOutPrintPayload(resolvedReferenceNo);
      const printAction = shouldPrintVoucher ? afterSaveAction : 'none';
      const printFilePrefix =
        movementType === 'TRANSFER'
          ? 'اذن-تحويل'
          : voucherPrintFilePrefix(movementType === 'OUT' ? 'OUT' : 'IN', isSparePartsContext);

      setNextReferenceSeq((prev) => {
        const match = resolvedReferenceNo.match(INV_REF_REGEX);
        const fromUsedRef = match ? Number(match[1] || 0) + 1 : prev + 1;
        return Math.max(prev + 1, fromUsedRef);
      });
      resetForm(movementType === 'TRANSFER' ? 'TRANSFER' : movementType === 'OUT' ? 'OUT' : 'IN');
      setSaving(false);
      invalidatePageDataCache('inventory:stock-transactions');
      void loadRecentMovements(effectiveWarehouseId);

      if (printPayload && printAction !== 'none') {
        if (printAction === 'preview') {
          setPreviewData(printPayload);
          setShowPrintPreview(true);
        } else if (printAction === 'share') {
          setPrintData(printPayload);
          await waitForExportPaint(150);
          if (transferShareCardRef.current) {
            const result = await shareToWhatsApp(transferShareCardRef.current, `stock-voucher-${printPayload.transferNo}`);
            showShareFeedback(result);
          }
          setTimeout(() => setPrintData(null), 1200);
        } else {
          setPrintData(printPayload);
          await new Promise((r) => setTimeout(r, 250));
          await printTransfer(`${printFilePrefix}-${printPayload.transferNo}`);
          setTimeout(() => setPrintData(null), 1200);
        }
      }
      return;
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ الحركة.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintFromPreview = async () => {
    if (!previewData) return;
    const prefix = previewData.statusLabel?.includes('إضافة')
      ? 'اذن-اضافة'
      : previewData.statusLabel?.includes('منصرف')
        ? 'اذن-منصرف'
        : previewData.toWarehouseName?.includes('وارد')
          ? 'اذن-وارد'
          : 'اذن';
    setPrintData(previewData);
    await new Promise((r) => setTimeout(r, 250));
    await printTransfer(`${prefix}-${previewData.transferNo}`);
    setTimeout(() => setPrintData(null), 1200);
  };

  const handlePreviewWithoutSave = () => {
    if (!effectiveWarehouseId) {
      toast.error('اختر المخزن أولاً.');
      return;
    }
    if (movementType === 'TRANSFER' && !toWarehouseId) {
      toast.error('اختر مخزن الوجهة للتحويل.');
      return;
    }

    if (movementType === 'TRANSFER' || movementType === 'IN' || movementType === 'OUT') {
      const validationError = validateTransferLines(
        transferItems,
        itemType,
        getItemById,
        movementType === 'TRANSFER'
          ? undefined
          : {
              requireLocation: usesLineLocations,
              allowSameItemDifferentLocation: usesLineLocations,
            },
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }
      if (movementType === 'TRANSFER') {
        setPreviewData(buildTransferPrintData(referenceNo, null));
      } else {
        setPreviewData(buildInOutPrintPayload(referenceNo));
      }
      setShowPrintPreview(true);
      return;
    }

    if (!selectedItem) {
      toast.error('اختر الصنف أولًا.');
      return;
    }
    if (quantity === 0) {
      toast.error('كمية التسوية لا يمكن أن تساوي صفر.');
      return;
    }

    const isCarton = itemType === 'finished_good' && Number(selectedItem.unitsPerCarton || 0) > 0;
    const qtyPieces = Number(quantity || 0);
    setPreviewData({
      transferNo: referenceNo,
      createdAt: new Date().toISOString(),
      fromWarehouseName: selectedFromWarehouse?.name || effectiveWarehouseId,
      toWarehouseName: 'تسوية',
      items: [{
        itemName: selectedItem.name,
        itemCode: selectedItem.code,
        unitLabel: isCarton ? 'كرتونة' : 'قطعة',
        quantity: qtyPieces,
        quantityPieces: qtyPieces,
        unitsPerCarton: isCarton ? Number(selectedItem.unitsPerCarton || 0) : undefined,
      }],
      createdBy: userDisplayName || 'Current User',
    });
    setShowPrintPreview(true);
  };

  const handleApplyScanCode = () => {
    const code = scanCode.trim();
    if (!code) return;
    if (!(movementType === 'IN' || movementType === 'OUT')) {
      toast.error('مسح الكود متاح لإذن الوارد والمنصرف فقط.');
      return;
    }
    const matched = findItemOptionByCode(itemOptions, code);
    if (!matched) {
      toast.error('لم يُعثر على صنف مطابق لهذا الكود تمامًا.');
      setScanCode('');
      scanInputRef.current?.focus();
      return;
    }
    const preferredLocation = resolvePreferredLineLocation(matched.id, locationId);
    const result = applyScannedCodeToLines({
      lines: transferItems,
      itemId: matched.id,
      locationId: preferredLocation || undefined,
      unit: 'piece',
    });
    setTransferItems(result.lines);
    setScanCode('');
    toast.success(
      result.action === 'incremented'
        ? `تمت زيادة كمية ${matched.name}`
        : `تمت إضافة ${matched.name}`,
    );
    scanInputRef.current?.focus();
  };

  const addVoucherLine = () => {
    setTransferItems((prev) => [
      ...prev,
      createTransferLine({
        locationId: locationId || '',
        unit: itemType === 'finished_good' ? 'piece' : 'piece',
      }),
    ]);
  };

  const pageTitle = isSparePartsContext && movementType === 'IN'
    ? 'إذن إضافة قطع غيار'
    : movementType === 'IN'
      ? 'إذن إضافة (وارد)'
      : movementType === 'OUT'
        ? 'إذن منصرف'
        : movementType === 'TRANSFER'
          ? 'تحويل مخزون'
          : 'تسوية مخزون';
  const pageSubtitle = isSparePartsContext && movementType === 'IN'
    ? 'تسجيل وارد متعدد الأسطر للمخزن المركزي أو مراكز الصيانة'
    : 'وارد، منصرف، تحويل أو تسوية مباشرة على الأرصدة';
  const linesSectionLabel =
    movementType === 'TRANSFER'
      ? 'أصناف التحويلة'
      : movementType === 'OUT'
        ? 'أصناف المنصرف'
        : 'أصناف الإذن';
  const addLineLabel = itemType === 'finished_good' ? 'إضافة منتج' : 'إضافة صنف';
  const primarySaveLabel =
    movementType === 'IN'
      ? (isSparePartsContext ? 'حفظ إذن الإضافة' : 'حفظ الوارد')
      : movementType === 'OUT'
        ? 'حفظ المنصرف'
        : movementType === 'TRANSFER'
          ? 'حفظ التحويلة'
          : 'حفظ التسوية';
  const recentFeed = useMemo(() => flattenRecentVoucherFeed(recentTxs), [recentTxs]);

  /* ── ERPNext field helpers ── */
  const fieldClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f8f9fa] text-[var(--color-text)] outline-none focus:border-[rgb(var(--color-primary))] focus:bg-white focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.12)] transition-all font-medium';
  const fieldDisabledClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f0f2f5] text-[var(--color-text)] font-medium select-none cursor-default';
  const labelClass = 'block text-[11.5px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide';

  return (
    <ModuleOpsPageShell
      eyebrow={pageTitle}
      rangeLabel={pageSubtitle}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => openImportInByCodeModal(itemType === 'raw_material' ? 'raw_material' : 'finished_good')}
            disabled={!can('inventory.transactions.create') || saving}
          >
            <span className="material-icons-round text-sm">upload</span>
            استيراد إدخال بالكود
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(
                warehouseId
                  ? `/inventory/transactions?warehouseId=${encodeURIComponent(warehouseId)}`
                  : '/inventory/transactions',
              )
            }
          >
            <span className="material-icons-round text-sm">swap_horiz</span>
            سجل حركات المخازن
          </Button>
          {can('inventory.transactions.create') ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmit('none')}
              disabled={saving}
            >
              {saving ? 'جاري الحفظ...' : primarySaveLabel}
            </Button>
          ) : null}
        </div>
      }
    >

      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {/* ── Main Form Card ── */}
      <OpsDashPanel accent="inventory" bodyClassName="p-0 overflow-hidden">
      <div
        className="bg-[var(--color-card)]"
      >
        {/* Card header */}
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--color-text)]">
              {isSparePartsContext && movementType === 'IN' ? 'تسجيل إذن الإضافة' : 'تسجيل الحركة'}
            </span>
            {isSparePartsContext && selectedWarehouseRole?.warehouseRole ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {WAREHOUSE_ROLE_LABELS[selectedWarehouseRole.warehouseRole] || 'قطع غيار'}
              </span>
            ) : null}
          </div>
          {/* Reference badge */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">رقم المرجع</span>
            <span
              className="text-[12.5px] font-bold px-2.5 py-0.5 rounded-full"
              style={{
                background: 'rgb(var(--color-primary)/0.1)',
                color: 'rgb(var(--color-primary))',
                border: '1px solid rgb(var(--color-primary)/0.2)',
              }}
            >
              {referenceNo}
            </span>
          </div>
        </div>

        {/* Form body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

          {/* Movement type segmented */}
          <div>
            <label className={labelClass}>نوع الحركة</label>
            <div className="erp-date-seg" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              {([
                { value: 'IN' as MovementType, label: isSparePartsContext ? 'إضافة' : 'وارد', icon: 'south_west' },
                { value: 'OUT' as MovementType, label: 'منصرف', icon: 'north_east' },
                { value: 'TRANSFER' as MovementType, label: 'تحويل', icon: 'swap_horiz' },
                { value: 'ADJUSTMENT' as MovementType, label: 'تسوية', icon: 'tune' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setMovementType(opt.value);
                    if (opt.value !== 'ADJUSTMENT' && transferItems.length === 0) {
                      setTransferItems([createTransferLine()]);
                    }
                  }}
                  className={`erp-date-seg-btn${movementType === opt.value ? ' active' : ''}`}
                  style={{ justifyContent: 'center' }}
                >
                  <span className="material-icons-round" style={{ fontSize: 14 }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item type */}
          <div>
            <label className={labelClass}>نوع الصنف</label>
              <Select
              value={itemType}
              disabled={scoped || isSparePartsContext}
              onValueChange={(value) => {
                const nextType = value as ItemType;
                setItemType(nextType);
                setItemId('');
                setTransferItems((prev) =>
                  prev.map((line) => ({ ...line, itemId: '', unit: nextType === 'finished_good' ? line.unit : 'piece' })),
                );
              }}
            >
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="اختر نوع الصنف">
                  {itemType === 'finished_good'
                    ? 'منتج نهائي'
                    : isSparePartsContext
                      ? 'قطع غيار / مواد'
                      : 'مكونات المنتجات'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {!isSparePartsContext ? (
                  <SelectItem value="finished_good">منتج نهائي</SelectItem>
                ) : null}
                <SelectItem value="raw_material">
                  {isSparePartsContext ? 'قطع غيار / مواد' : 'مكونات المنتجات'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source warehouse */}
          <div>
            <label className={labelClass}>المخزن</label>
            {isFinishedTransferFlow && hasAutoTransferSource ? (
              <div className={fieldDisabledClass}>
                {selectedFromWarehouse?.name || 'غير محدد'}
                <span className="text-[11px] text-[var(--color-text-muted)] mr-2">(من تم الصنع)</span>
              </div>
            ) : (
              <SearchableSelect
                  options={warehouseSelectOptions}
                  value={warehouseId}
                  disabled={warehouseSelectLocked}
                  onChange={(value) => {
                    setWarehouseId(value);
                    setLocationId('');
                  }}
                  placeholder="ابحث واختر المخزن"
                />
              )}
            </div>

          {movementType !== 'TRANSFER' && locationSelectOptions.length > 0 && (
            <div>
              <label className={labelClass}>
                {usesLineLocations
                  ? (isSparePartsContext ? 'الرف الافتراضي للأسطر' : 'اللوكيشن الافتراضي للأسطر')
                  : (isSparePartsContext ? 'الرف / اللوكيشن' : 'اللوكيشن')}
              </label>
              <SearchableSelect
                options={locationSelectOptions}
                value={locationId}
                onChange={(value) => {
                  setLocationId(value);
                  if (usesLineLocations && value) {
                    setTransferItems((prev) =>
                      prev.map((line) => (line.locationId ? line : { ...line, locationId: value })),
                    );
                  }
                }}
                placeholder={
                  usesLineLocations
                    ? 'يُطبَّق على الأسطر الجديدة والفارغة'
                    : itemType === 'raw_material'
                      ? 'مطلوب للمكونات وقطع الغيار'
                      : 'اختياري للمنتجات'
                }
              />
            </div>
          )}

          {/* Destination warehouse (TRANSFER only) */}
          {movementType === 'TRANSFER' && (
            <div>
              <label className={labelClass}>مخزن الوجهة</label>
              <SearchableSelect
                options={toWarehouseSelectOptions}
                value={toWarehouseId}
                onChange={(value) => {
                  setToWarehouseId(value);
                  setLocationId('');
                  setToLocationId('');
                }}
                placeholder={
                  isSparePartsContext
                    ? 'ابحث واختر مركز صيانة أو مخزن قطع غيار'
                    : 'ابحث واختر مخزن الوجهة أو نفس المخزن لنقل رف'
                }
              />
            </div>
          )}

          {isShelfTransfer && locationSelectOptions.length > 0 && (
            <>
              <div>
                <label className={labelClass}>رف المصدر</label>
                <SearchableSelect
                  options={locationSelectOptions}
                  value={locationId}
                  onChange={(value) => setLocationId(value)}
                  placeholder="اختر رف المصدر"
                />
              </div>
              <div>
                <label className={labelClass}>رف الوجهة</label>
                <SearchableSelect
                  options={locationSelectOptions.filter((opt) => opt.value !== locationId)}
                  value={toLocationId}
                  onChange={(value) => setToLocationId(value)}
                  placeholder="اختر رف الوجهة"
                />
              </div>
            </>
          )}

          {/* Item + qty (ADJUSTMENT only — single line) */}
          {movementType === 'ADJUSTMENT' && (
            <>
              <div>
                <label className={labelClass}>الصنف</label>
                <SearchableSelect
                  options={itemSelectOptions}
                  value={itemId}
                  onChange={(value) => setItemId(value)}
                  placeholder="ابحث واختر الصنف"
                />
              </div>
              <div>
                <label className={labelClass}>الكمية (+ زيادة / − نقص)</label>
                <input
                  type="number"
                  step="any"
                  className={fieldClass}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
                {itemId && effectiveWarehouseId && (
                  <StockAvailabilityHint
                    warehouseId={effectiveWarehouseId}
                    itemType={
                      itemType === 'finished_good'
                        ? 'finished_good'
                        : (resolveLineStockIdentity(itemId, movementType).itemType)
                    }
                    itemId={
                      itemType === 'finished_good'
                        ? itemId
                        : resolveLineStockIdentity(itemId, movementType).itemId
                    }
                    className="mt-1.5"
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>سبب التسوية</label>
                <select
                  className={fieldClass}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value as StockAdjustmentReason)}
                >
                  <option value="count_correction">تصحيح جرد</option>
                  <option value="damage">تلف</option>
                  <option value="missing">نقص</option>
                  <option value="extra">زيادة</option>
                  <option value="manual_correction">تصحيح يدوي</option>
                </select>
              </div>
            </>
          )}

          {(movementType === 'IN' || movementType === 'OUT') && (
            <div className="md:col-span-2">
              <label className={labelClass}>ملاحظة الإذن (اختياري)</label>
              <input
                type="text"
                className={fieldClass}
                value={voucherNote}
                onChange={(e) => setVoucherNote(e.target.value)}
                placeholder={isSparePartsContext ? 'مثال: توريد مورد / فاتورة شراء' : 'ملاحظة تظهر على الحركات'}
              />
            </div>
          )}

          {/* Multi-line items (IN / OUT / TRANSFER) */}
          {usesMultiLineItems && (
            <div className="md:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className={labelClass} style={{ marginBottom: 0 }}>{linesSectionLabel}</label>
                <Button
                  type="button"
                  variant="secondary"
                  className="hidden sm:inline-flex"
                  onClick={addVoucherLine}
                  disabled={saving}
                >
                  {addLineLabel}
                </Button>
              </div>

              {(movementType === 'IN' || movementType === 'OUT') && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={scanInputRef}
                    type="text"
                    className={fieldClass}
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyScanCode();
                      }
                    }}
                    placeholder="امسح أو اكتب كود الصنف ثم Enter"
                    autoComplete="off"
                    disabled={saving}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="sm:w-auto w-full shrink-0"
                    onClick={handleApplyScanCode}
                    disabled={saving || !scanCode.trim()}
                  >
                    إضافة بالكود
                  </Button>
                </div>
              )}

              {/* Lines table */}
              <div
                className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden"
                style={{ background: 'var(--color-card)' }}
              >
                {/* Table header — desktop only */}
                <div
                  className="hidden sm:grid gap-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] px-3 py-2"
                  style={{
                    gridTemplateColumns: itemType === 'finished_good'
                      ? (usesLineLocations ? '1fr 140px 180px 120px 40px' : '1fr 160px 140px 40px')
                      : (usesLineLocations ? '1fr 180px 120px 40px' : '1fr 140px 40px'),
                    borderBottom: '1px solid var(--color-border)',
                    background: '#f8f9fa',
                  }}
                >
                  <span>الصنف</span>
                  {itemType === 'finished_good' ? <span className="text-center">الوحدة</span> : null}
                  {usesLineLocations ? <span className="text-center">الرف</span> : null}
                  <span className="text-center">الكمية</span>
                  <span />
                </div>

                {/* Rows */}
                {transferItems.map((line, idx) => {
                  const lineItem = getItemById(line.itemId);
                  const available = getAvailableForItem(line.itemId);
                  const requestedForItem = transferItems
                    .filter((x) => x.itemId === line.itemId)
                    .reduce((sum, x) => sum + lineQuantityInPieces(x), 0);
                  const remaining = available - requestedForItem;
                  const showAvailability = movementType === 'OUT' || movementType === 'TRANSFER';
                  const desktopCols = itemType === 'finished_good'
                    ? (usesLineLocations ? '1fr 140px 180px 120px 40px' : '1fr 160px 140px 40px')
                    : (usesLineLocations ? '1fr 180px 120px 40px' : '1fr 140px 40px');
                  return (
                    <div
                      key={line.id}
                      className="px-3 py-2.5"
                      style={{ borderBottom: idx < transferItems.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                    >
                      {/* ── Desktop grid ── */}
                      <div
                        className="hidden sm:grid gap-0 items-start"
                        style={{ gridTemplateColumns: desktopCols }}
                      >
                        <div className="pl-3">
                          <SearchableSelect
                            options={itemSelectOptions}
                            value={line.itemId}
                            onChange={(value) =>
                              setTransferItems((prev) =>
                                prev.map((x) =>
                                  x.id === line.id
                                    ? {
                                        ...x,
                                        itemId: value,
                                        locationId: resolvePreferredLineLocation(value, x.locationId),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="ابحث واختر الصنف"
                          />
                          {line.itemId && showAvailability && (
                            <p className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}>
                              متاح: {available} · متبقي: {remaining}
                            </p>
                          )}
                          {line.itemId && movementType === 'IN' && (
                            <p className="text-[11px] font-semibold mt-1 text-[var(--color-text-muted)]">
                              الرصيد الحالي: {available}
                            </p>
                          )}
                        </div>

                        {itemType === 'finished_good' ? (
                          <div className="px-2">
                            <div className="erp-date-seg" style={{ width: '100%', display: 'flex' }}>
                              <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                                onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)))}>قطعة</button>
                              <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                                onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)))}>كرتونة</button>
                            </div>
                            {line.unit === 'carton' && (
                              <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1 text-center">
                                {Number(lineItem?.unitsPerCarton || 0) > 0 ? `${lineItem?.unitsPerCarton} وحدة/كرتونة` : 'لا توجد قيمة'}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {usesLineLocations ? (
                          <div className="px-2">
                            <SearchableSelect
                              options={locationSelectOptions}
                              value={line.locationId || ''}
                              onChange={(value) =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, locationId: value } : x)),
                                )
                              }
                              placeholder="اختر الرف"
                            />
                          </div>
                        ) : null}

                        <div className="px-2">
                          <input type="number" step="any" className={fieldClass} placeholder="0" value={line.quantity || ''}
                            onChange={(e) => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x)))} />
                        </div>

                        <div className="flex items-center justify-center pt-0.5">
                          <button type="button" onClick={() => setTransferItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev))}
                            className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                            disabled={transferItems.length <= 1} title="حذف الصف">
                            <span className="material-icons-round" style={{ fontSize: 16 }}>delete_outline</span>
                          </button>
                        </div>
                      </div>

                      {/* ── Mobile stacked ── */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[var(--color-text-muted)]">الصنف #{idx + 1}</span>
                          <button type="button"
                            onClick={() => setTransferItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev))}
                            className="w-7 h-7 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                            disabled={transferItems.length <= 1} title="حذف الصف">
                            <span className="material-icons-round" style={{ fontSize: 15 }}>delete_outline</span>
                          </button>
                        </div>

                        <div>
                          <SearchableSelect
                            options={itemSelectOptions}
                            value={line.itemId}
                            onChange={(value) =>
                              setTransferItems((prev) =>
                                prev.map((x) =>
                                  x.id === line.id
                                    ? {
                                        ...x,
                                        itemId: value,
                                        locationId: resolvePreferredLineLocation(value, x.locationId),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="ابحث واختر الصنف"
                          />
                          {line.itemId && showAvailability && (
                            <p className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}>
                              متاح: {available} · متبقي: {remaining}
                            </p>
                          )}
                          {line.itemId && movementType === 'IN' && (
                            <p className="text-[11px] font-semibold mt-1 text-[var(--color-text-muted)]">
                              الرصيد الحالي: {available}
                            </p>
                          )}
                        </div>

                        {usesLineLocations ? (
                          <div>
                            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">الرف</span>
                            <SearchableSelect
                              options={locationSelectOptions}
                              value={line.locationId || ''}
                              onChange={(value) =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, locationId: value } : x)),
                                )
                              }
                              placeholder="اختر الرف"
                            />
                          </div>
                        ) : null}

                        <div className={`grid gap-2 ${itemType === 'finished_good' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {itemType === 'finished_good' ? (
                            <div>
                              <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">الوحدة</span>
                              <div className="erp-date-seg" style={{ width: '100%', display: 'flex' }}>
                                <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                                  onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)))}>قطعة</button>
                                <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                                  onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)))}>كرتونة</button>
                              </div>
                            </div>
                          ) : null}
                          <div>
                            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">الكمية</span>
                            <input type="number" step="any" className={fieldClass} placeholder="0" value={line.quantity || ''}
                              onChange={(e) => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x)))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full sm:hidden"
                onClick={addVoucherLine}
                disabled={saving}
              >
                {addLineLabel}
              </Button>
            </div>
          )}
        </div>

        {/* Form actions */}
        <div
          className="px-5 py-3.5 border-t border-[var(--color-border)] flex flex-col-reverse gap-2 sm:flex-row sm:justify-end items-center"
          style={{ background: '#f8f9fa', borderRadius: '0 0 var(--border-radius-lg) var(--border-radius-lg)' }}
        >
          {(movementType === 'IN' || movementType === 'OUT' || movementType === 'TRANSFER') && (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => handlePreviewWithoutSave()}
              disabled={saving}
            >
              معاينة
            </Button>
          )}
          {(movementType === 'IN' || movementType === 'OUT' || movementType === 'TRANSFER') && (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => void handleSubmit('share')}
              disabled={!can('inventory.transactions.create') || saving}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ ومشاركة'}
            </Button>
          )}
          {(movementType === 'IN' || movementType === 'OUT' || (movementType === 'TRANSFER' && !isShelfTransfer)) && (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => void handleSubmit('print')}
              disabled={!can('inventory.transactions.create') || saving}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ وطباعة'}
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            className="w-full sm:w-auto"
            onClick={() => void handleSubmit('none')}
            disabled={!can('inventory.transactions.create') || saving}
          >
            {saving ? 'جاري الحفظ...' : primarySaveLabel}
          </Button>
        </div>
      </div>
      </OpsDashPanel>

      {effectiveWarehouseId ? (
        <OpsDashPanel
          title="آخر الحركات في المخزن"
          accent="inventory"
          bodyClassName="p-0"
          action={(
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate(
                  `/inventory/transactions?warehouseId=${encodeURIComponent(effectiveWarehouseId)}${
                    isSparePartsContext ? '&focus=spare' : ''
                  }`,
                )
              }
            >
              عرض السجل الكامل
            </Button>
          )}
        >
          <div className="overflow-x-auto">
            <table className="erp-table w-full min-w-[640px] text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">التاريخ</th>
                  <th className="erp-th">الصنف</th>
                  <th className="erp-th">الحركة</th>
                  <th className="erp-th text-center">الكمية</th>
                  <th className="erp-th">المرجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {recentLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                      جاري التحميل...
                    </td>
                  </tr>
                )}
                {!recentLoading && recentFeed.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                      لا توجد حركات حديثة لهذا المخزن.
                    </td>
                  </tr>
                )}
                {!recentLoading &&
                  recentFeed.map((entry) => {
                    if (entry.kind === 'voucher') {
                      const group = entry.group;
                      const qtySum = group.lines.reduce((s, l) => s + Math.abs(Number(l.quantity || 0)), 0);
                      return (
                        <tr key={`recent-voucher-${group.movementType}-${group.referenceNo}`} className="bg-sky-50/30">
                          <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">
                            {new Date(group.createdAt).toLocaleString('ar-EG')}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-bold">
                              {voucherMovementTitle(group.movementType, isSparePartsContext)} #{group.referenceNo}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {group.lines.length} أصناف
                              {group.note ? ` · ${group.note}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold">
                            {movementLabel[group.movementType]}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`font-black tabular-nums ${
                                group.movementType === 'IN' ? 'text-emerald-600' : 'text-rose-500'
                              }`}
                            >
                              {group.movementType === 'IN' ? '+' : '−'}
                              {formatNumber(qtySum)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                            {group.referenceNo}
                          </td>
                        </tr>
                      );
                    }
                    const tx = entry.tx;
                    return (
                      <tr key={tx.id || `${tx.itemId}-${tx.createdAt}`}>
                        <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">
                          {new Date(tx.createdAt).toLocaleString('ar-EG')}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-bold">{tx.itemName}</p>
                          <p className="text-xs font-mono text-[var(--color-text-muted)]">{tx.itemCode}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-semibold">
                          {movementLabel[tx.movementType] ?? tx.movementType}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`font-black tabular-nums ${
                              Number(tx.quantity) >= 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}
                          >
                            {Number(tx.quantity) >= 0 ? '+' : ''}
                            {formatNumber(tx.quantity)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                          {tx.referenceNo || '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </OpsDashPanel>
      ) : null}

      {/* Hidden print component */}
      <div style={{ position: 'fixed', right: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: 0 }}>
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>
      <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, direction: 'rtl', minWidth: 640, width: 'max-content' }}>
        <StockTransferShareCard
          ref={transferShareCardRef}
          data={printData}
          companyName={companyName}
          version={APP_VERSION ?? ''}
        />
      </div>

      {/* Print preview modal */}
      {showPrintPreview && previewData && (
        <ManagedModalPortal>
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowPrintPreview(false)}
        >
          <div
            className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-5xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 18 }}>preview</span>
                <span className="text-[14px] font-semibold">
                  {movementType === 'TRANSFER' ? 'معاينة التحويلة' : 'معاينة الإذن'}
                </span>
              </div>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors"
              >
                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-auto flex-1" style={{ background: '#f8f9fa' }}>
              <div className="mx-auto w-fit">
                <StockTransferPrint data={previewData} printSettings={printTemplate} />
              </div>
            </div>
            <div
              className="px-5 py-3.5 border-t border-[var(--color-border)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2"
              style={{ background: '#f8f9fa' }}
            >
              <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setShowPrintPreview(false)}>
                إغلاق
              </Button>
              <Button className="w-full sm:w-auto" variant="primary" onClick={() => void handlePrintFromPreview()}>
                طباعة الآن
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

    </ModuleOpsPageShell>
  );
};
