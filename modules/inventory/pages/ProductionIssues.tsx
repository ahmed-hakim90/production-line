import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { productionIssueService, isProductionIssueApprovalError } from '../services/productionIssueService';
import {
  approveProductionIssueRequest,
  issueProductionIssueOrder,
  rejectProductionIssueRequest,
} from '../usecases/approveProductionIssue';
import { unwrapOrThrow } from '@/shared/usecases';
import { warehouseService } from '../services/warehouseService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import { componentReturnService } from '../services/componentReturnService';
import { componentCompensationService } from '../services/componentCompensationService';
import { componentScrapService } from '../services/componentScrapService';
import type {
  ComponentCompensationReason,
  ComponentReturnReason,
  ProductionIssueOrder,
  ProductionIssueOrderLine,
  ProductionIssueShortageRow,
  Warehouse,
  WarehouseLocation,
  WarehouseRack,
} from '../types';
import type { PaperSize } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '../../../utils/printManager';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const ISSUE_ORDERS_PAGE_SIZE = 15;
const PRODUCTION_ISSUES_CACHE_KEY = 'inventory:production-issues';

type ProductionIssuesLocalData = {
  orders: ProductionIssueOrder[];
  warehouses: Warehouse[];
  locations: WarehouseLocation[];
  racks: WarehouseRack[];
};

function statusLabel(status: ProductionIssueOrder['status']) {
  if (status === 'requested') return 'طلب إنتاج';
  if (status === 'draft') return 'مسودة';
  if (status === 'submitted') return 'مرسلة';
  if (status === 'issued') return 'مصروفة';
  if (status === 'rejected') return 'مرفوض';
  return 'ملغاة';
}

const formatQty = (value: number | undefined, digits = 2) => {
  const qty = Number(value || 0);
  return qty.toLocaleString('en-US', {
    minimumFractionDigits: qty % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });
};

const formatPrintDate = (value: string) => new Date(value).toLocaleString('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type LineActionKind = 'return' | 'compensate' | 'scrap';
type LineActionModal = {
  kind: LineActionKind;
  order: ProductionIssueOrder;
  line: ProductionIssueOrderLine;
} | null;

function shortageReasonLabel(row: ProductionIssueShortageRow) {
  if (row.kind === 'inactive_location') {
    return row.locationCode
      ? `اللوكيشن ${row.locationCode} موقوف أو غير صالح`
      : 'اللوكيشن موقوف أو غير صالح';
  }
  if (row.kind === 'stale_balance') {
    return row.locationCode
      ? `رصيد ${row.locationCode} أقل من المطلوب`
      : 'الرصيد الحالي أقل من المطلوب';
  }
  return 'اللوكيشنات لا تغطي الكمية المطلوبة';
}

const IssuePrint = React.forwardRef<HTMLDivElement, { order: ProductionIssueOrder | null; sourceLabel?: string; paperSize: PaperSize }>(({ order, sourceLabel, paperSize }, ref) => {
  if (!order) return <div ref={ref} />;
  const isA5 = paperSize === 'a5';
  const totalBase = order.lines.reduce((sum, line) => sum + Number(line.baseRequiredQty || 0), 0);
  const totalWaste = order.lines.reduce((sum, line) => sum + Number(line.plannedWasteQty || 0), 0);
  const totalRequired = order.lines.reduce((sum, line) => sum + Number(line.requiredQty || 0), 0);
  const cell: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '5.5px 6.5px', verticalAlign: 'top' };
  const headCell: React.CSSProperties = { ...cell, background: '#0f172a', color: '#fff', fontWeight: 800, textAlign: 'center' };
  const numericCell: React.CSSProperties = { ...cell, textAlign: 'center', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const avoidBreak: React.CSSProperties = { breakInside: 'avoid', pageBreakInside: 'avoid' };
  const infoBox: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '6px 8px', minHeight: 40 };
  const infoLabel: React.CSSProperties = { margin: 0, color: '#64748b', fontSize: 9.5, fontWeight: 800 };
  const infoValue: React.CSSProperties = { margin: '2px 0 0', color: '#0f172a', fontSize: 11.5, fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.35 };

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: '190mm',
        minHeight: isA5 ? '128mm' : '270mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#0f172a',
        padding: '7mm 9mm',
        fontFamily: '"Cairo", "Tahoma", "Arial", sans-serif',
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: '2px solid #0f172a', paddingBottom: 8, marginBottom: 8 }}>
        <div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>مخازن الإنتاج</p>
          <h1 style={{ margin: '1px 0', color: '#0f172a', fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>إذن صرف إنتاج</h1>
          <p style={{ margin: 0, direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontSize: 12.5, fontWeight: 800 }}>{order.referenceNo}</p>
        </div>
        <div style={{ width: 210, border: '1px solid #cbd5e1', borderRadius: 7, overflow: 'hidden', fontSize: 10 }}>
          {[
            ['الحالة', statusLabel(order.status)],
            ['التاريخ', formatPrintDate(order.createdAt)],
            ['المخزن', order.sourceWarehouseName || order.sourceWarehouseId],
          ].map(([label, value], index) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '66px 1fr', borderBottom: index === 2 ? 'none' : '1px solid #e2e8f0' }}>
              <span style={{ background: '#f1f5f9', padding: '4px 6px', fontWeight: 800 }}>{label}</span>
              <span style={{ padding: '4px 6px', overflowWrap: 'anywhere' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.75fr 0.75fr 1fr', gap: 7, marginBottom: 8 }}>
        {[
          ['المنتج', order.productName],
          ['كود المنتج', order.productCode || '—'],
          ['كمية الصرف للإنتاج', formatQty(order.quantity, 3)],
          ['أمر/خطة/تقرير', sourceLabel || order.productionReportCode || order.workOrderId || order.productionPlanId || '—'],
        ].map(([label, value]) => (
          <div key={label} style={infoBox}>
            <p style={infoLabel}>{label}</p>
            <p style={infoValue}>{value}</p>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10 }}>
        <colgroup>
          <col style={{ width: '14%' }} />
          <col style={{ width: '38%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: 'right' }}>اللوكيشن</th>
            <th style={{ ...headCell, textAlign: 'right' }}>المكون</th>
            <th style={headCell}>لكل وحدة</th>
            <th style={headCell}>طبيعي</th>
            <th style={headCell}>هالك قياسي</th>
            <th style={headCell}>إجمالي الصرف</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={`${line.itemType}-${line.itemId}`}>
              <td style={{ ...cell, fontSize: 9.5, overflowWrap: 'anywhere' }}>
                {line.allocations.map((a) => {
                  const rackShelf = [a.rack, a.shelf].filter(Boolean).join(' / ');
                  return `${a.locationCode}${rackShelf ? ` (${rackShelf})` : ''}: ${formatQty(a.quantity)}`;
                }).join('، ')}
              </td>
              <td style={{ ...cell, fontWeight: 800, overflowWrap: 'anywhere' }}>{line.itemName}</td>
              <td style={numericCell}>{formatQty(line.qtyPerUnit, 4)}</td>
              <td style={numericCell}>{formatQty(line.baseRequiredQty)}</td>
              <td style={numericCell}>{formatQty(line.plannedWasteQty)}</td>
              <td style={{ ...numericCell, fontWeight: 900 }}>{formatQty(line.requiredQty)} {line.unit}</td>
            </tr>
          ))}
          <tr style={{ background: '#f1f5f9', fontWeight: 900, ...avoidBreak }}>
            <td style={cell} colSpan={3}>الإجمالي</td>
            <td style={numericCell}>{formatQty(totalBase)}</td>
            <td style={numericCell}>{formatQty(totalWaste)}</td>
            <td style={numericCell}>{formatQty(totalRequired)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...avoidBreak, marginTop: 6 }}>
        {order.note?.trim() && (
          <div style={{ ...infoBox, marginBottom: 12 }}>
            <p style={infoLabel}>ملاحظات</p>
            <p style={infoValue}>{order.note}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 34, textAlign: 'center', fontSize: 11, fontWeight: 800 }}>
          {['أمين المخزن', 'مستلم الإنتاج', 'اعتماد الإدارة'].map((label) => (
            <div key={label} style={{ borderTop: '1.5px solid #0f172a', paddingTop: 5 }}>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
});
IssuePrint.displayName = 'IssuePrint';

export const ProductionIssues: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryWarehouseId = searchParams.get('warehouseId') || '';
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    routingConfigured,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const { can } = usePermission();
  const workOrders = useAppStore((s) => s.workOrders);
  const plans = useAppStore((s) => s.productionPlans);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s.productionLines);
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const fetchProducts = useAppStore((s) => s.fetchProducts);
  const fetchLines = useAppStore((s) => s.fetchLines);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const inventoryRouting = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);

  const productLabelById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (!p.id) return;
      const code = String(p.code || '').trim();
      const name = String(p.name || '').trim();
      map.set(p.id, [code, name].filter(Boolean).join(' — ') || p.id);
    });
    return map;
  }, [products]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p.name || p.code || p.id);
    });
    return map;
  }, [products]);

  const lineNameById = useMemo(() => {
    const map = new Map<string, string>();
    lines.forEach((line) => {
      if (line.id) map.set(line.id, line.name || line.id);
    });
    return map;
  }, [lines]);

  const [orders, setOrders] = useState<ProductionIssueOrder[]>(
    () => peekPageDataCache<ProductionIssuesLocalData>(PRODUCTION_ISSUES_CACHE_KEY)?.orders ?? [],
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>(
    () => {
      const cached = peekPageDataCache<ProductionIssuesLocalData>(PRODUCTION_ISSUES_CACHE_KEY);
      return cached ? filterWarehouses(cached.warehouses) : [];
    },
  );
  const [locations, setLocations] = useState<WarehouseLocation[]>(
    () => peekPageDataCache<ProductionIssuesLocalData>(PRODUCTION_ISSUES_CACHE_KEY)?.locations ?? [],
  );
  const [racks, setRacks] = useState<WarehouseRack[]>(
    () => peekPageDataCache<ProductionIssuesLocalData>(PRODUCTION_ISSUES_CACHE_KEY)?.racks ?? [],
  );
  const [listTab, setListTab] = useState<'requests' | 'all'>(() =>
    searchParams.get('tab') === 'all' ? 'all' : 'requests',
  );
  const [approveQty, setApproveQty] = useState('');
  const [sourceKind, setSourceKind] = useState<'work_order' | 'production_plan'>('work_order');
  const [sourceId, setSourceId] = useState('');
  const [warehouseId, setWarehouseId] = useState(() => queryWarehouseId);
  const [issueQuantity, setIssueQuantity] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [issuePaperSize, setIssuePaperSize] = useState<PaperSize>('a4');
  const [printOrder, setPrintOrder] = useState<ProductionIssueOrder | null>(null);
  const [lineAction, setLineAction] = useState<LineActionModal>(null);
  const [shortageRows, setShortageRows] = useState<ProductionIssueShortageRow[]>([]);
  const [shortageModalOpen, setShortageModalOpen] = useState(false);
  const [actionQty, setActionQty] = useState(0);
  const [actionLocationId, setActionLocationId] = useState('');
  const [compensationReason, setCompensationReason] = useState<ComponentCompensationReason>('scrap');
  const [returnReason, setReturnReason] = useState<ComponentReturnReason>('unused');
  const [scrapReason, setScrapReason] = useState<ComponentCompensationReason>('scrap');
  const [scrapNeedsCompensation, setScrapNeedsCompensation] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparingLines, setPreparingLines] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const autoPreparedRequestIdsRef = useRef<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);
  const issuePrintSettings = useMemo(
    () => ({
      ...printTemplate,
      paperSize: issuePaperSize,
      orientation: issuePaperSize === 'a5' ? 'landscape' : printTemplate.orientation,
    }),
    [printTemplate, issuePaperSize],
  );
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: issuePrintSettings, documentTitle: 'إذن صرف إنتاج' });
  const actor = userDisplayName || userEmail || 'Current User';

  const load = async (force = false) => {
    const cached = peekPageDataCache<ProductionIssuesLocalData>(PRODUCTION_ISSUES_CACHE_KEY);
    if (cached) {
      setOrders(cached.orders);
      setWarehouses(filterWarehouses(cached.warehouses));
      setLocations(cached.locations);
      setRacks(cached.racks);
    }

    const [{ data },] = await Promise.all([
      fetchCachedPageData(
        PRODUCTION_ISSUES_CACHE_KEY,
        async () => {
          const [issueRows, whs, locs, rackRows] = await Promise.all([
            productionIssueService.getAll(),
            warehouseService.getActiveWarehouses(),
            warehouseLocationService.getAll(),
            warehouseRackService.getAll(),
          ]);
          return {
            orders: issueRows,
            warehouses: whs,
            locations: locs,
            racks: rackRows,
          } satisfies ProductionIssuesLocalData;
        },
        { force, maxAgeMs: 45_000 },
      ),
      fetchWorkOrders(),
      fetchProductionPlans(),
      fetchProducts(),
      fetchLines(),
    ]);

    const visibleWarehouses = filterWarehouses(data.warehouses);
    setOrders(data.orders);
    setWarehouses(visibleWarehouses);
    setLocations(data.locations);
    setRacks(data.racks);
    const suppliesId = resolveSuppliesWarehouseId(inventoryRouting, data.warehouses);
    setWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, suppliesId, scopedWarehouseId, visibleWarehouses[0]?.id || '']),
    );
  };

  const reload = async () => {
    invalidatePageDataCache(PRODUCTION_ISSUES_CACHE_KEY);
    await load(true);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'all' || tab === 'requests') setListTab(tab);
  }, [searchParams]);

  useEffect(() => {
    setWarehouseId((prev) => resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]));
  }, [scoped, warehouseIds.join('|'), queryWarehouseId, scopedWarehouseId, resolveScopedWarehouseId]);

  /** Deep-link from plan-issue alerts: ?planId= / ?workOrderId= / ?productId= / ?quantity= */
  useEffect(() => {
    const planId = String(searchParams.get('planId') || '').trim();
    const workOrderId = String(searchParams.get('workOrderId') || '').trim();
    const productId = String(searchParams.get('productId') || '').trim();

    if (planId && plans.some((p) => p.id === planId)) {
      setSourceKind('production_plan');
      setSourceId(planId);
      return;
    }
    if (workOrderId && workOrders.some((wo) => wo.id === workOrderId)) {
      setSourceKind('work_order');
      setSourceId(workOrderId);
      return;
    }
    if (productId) {
      const openPlan = plans.find(
        (plan) =>
          plan.productId === productId &&
          (plan.status === 'planned' || plan.status === 'in_progress' || plan.status === 'paused') &&
          (Number(plan.remainingQuantity ?? 0) > 0 ||
            Math.max(0, Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0)) > 0),
      );
      if (openPlan?.id) {
        setSourceKind('production_plan');
        setSourceId(openPlan.id);
        return;
      }
      const openWo = workOrders.find(
        (wo) =>
          wo.productId === productId &&
          (wo.status === 'pending' || wo.status === 'in_progress'),
      );
      if (openWo?.id) {
        setSourceKind('work_order');
        setSourceId(openWo.id);
      }
    }
  }, [searchParams, plans, workOrders]);

  const sourceOptions = useMemo(() => {
    if (sourceKind === 'work_order') {
      const open = workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress');
      const selected = sourceId ? workOrders.find((wo) => wo.id === sourceId) : null;
      const rows = selected && !open.some((wo) => wo.id === selected.id)
        ? [selected, ...open]
        : open;
      return rows.map((wo) => {
        const productLabel = productLabelById.get(wo.productId) || productNameById.get(wo.productId) || wo.productId;
        const lineName = lineNameById.get(wo.lineId);
        return {
          id: wo.id || '',
          label: [wo.workOrderNumber, productLabel, lineName, `كمية ${wo.quantity}`].filter(Boolean).join(' — '),
        };
      });
    }
    const open = plans.filter(
      (plan) => plan.status === 'planned' || plan.status === 'in_progress' || plan.status === 'paused',
    );
    const selected = sourceId ? plans.find((plan) => plan.id === sourceId) : null;
    const rows = selected && !open.some((plan) => plan.id === selected.id)
      ? [selected, ...open]
      : open;
    return rows.map((plan) => {
      const productLabel = productLabelById.get(plan.productId) || productNameById.get(plan.productId) || plan.productId;
      const lineName = lineNameById.get(plan.lineId);
      const date = plan.plannedStartDate || plan.startDate;
      const remaining = Number(plan.remainingQuantity ?? 0) > 0
        ? Number(plan.remainingQuantity)
        : Math.max(0, Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0));
      return {
        id: plan.id || '',
        label: [productLabel, lineName, `متبقي ${remaining}`, date].filter(Boolean).join(' — '),
      };
    });
  }, [
    sourceKind,
    sourceId,
    workOrders,
    plans,
    productLabelById,
    productNameById,
    lineNameById,
  ]);

  const selectedSourceQuantity = useMemo(() => {
    if (!sourceId) return 0;
    if (sourceKind === 'work_order') {
      const wo = workOrders.find((row) => row.id === sourceId);
      return Number(wo?.quantity || 0);
    }
    const plan = plans.find((row) => row.id === sourceId);
    const remaining = Number(plan?.remainingQuantity ?? 0);
    return remaining > 0
      ? remaining
      : Math.max(0, Number(plan?.plannedQuantity || 0) - Number(plan?.producedQuantity || 0));
  }, [sourceId, sourceKind, workOrders, plans]);

  useEffect(() => {
    if (!sourceId) {
      setIssueQuantity('');
      return;
    }
    const fromQuery = Number(String(searchParams.get('quantity') || '').trim());
    if (Number.isFinite(fromQuery) && fromQuery > 0) {
      const capped = selectedSourceQuantity > 0
        ? Math.min(fromQuery, selectedSourceQuantity)
        : fromQuery;
      setIssueQuantity(String(capped));
      return;
    }
    if (selectedSourceQuantity > 0) {
      setIssueQuantity(String(selectedSourceQuantity));
      return;
    }
    setIssueQuantity('');
  }, [sourceId, sourceKind, selectedSourceQuantity, searchParams]);

  const listOrders = useMemo(() => {
    if (listTab === 'requests') {
      return orders.filter((row) => row.status === 'requested');
    }
    return orders.filter((row) => row.status !== 'requested');
  }, [orders, listTab]);
  const selectedOrder =
    listOrders.find((row) => row.id === selectedOrderId)
    || orders.find((row) => row.id === selectedOrderId)
    || listOrders[0]
    || null;
  const ordersTotalPages = Math.max(1, Math.ceil(listOrders.length / ISSUE_ORDERS_PAGE_SIZE));
  const safeOrdersPage = Math.min(ordersPage, ordersTotalPages);
  const pagedOrders = useMemo(
    () => listOrders.slice((safeOrdersPage - 1) * ISSUE_ORDERS_PAGE_SIZE, safeOrdersPage * ISSUE_ORDERS_PAGE_SIZE),
    [listOrders, safeOrdersPage],
  );
  const sourceLabelByOrder = useMemo(() => {
    const labels = new Map<string, string>();
    orders.forEach((order) => {
      if (!order.id) return;
      if (order.productionReportId || order.sourceType === 'production_report') {
        const productName = productNameById.get(order.productId) || order.productName;
        labels.set(
          order.id,
          ['تقرير', order.productionReportCode || order.productionReportId, order.productionReportDate, productName]
            .filter(Boolean)
            .join(' - '),
        );
        return;
      }
      if (order.workOrderId) {
        const wo = workOrders.find((row) => row.id === order.workOrderId);
        labels.set(order.id, wo?.workOrderNumber || order.workOrderId);
        return;
      }
      if (order.productionPlanId) {
        const plan = plans.find((row) => row.id === order.productionPlanId);
        const productName = productNameById.get(plan?.productId || order.productId) || order.productName;
        const lineName = lineNameById.get(plan?.lineId || order.lineId || '') || '';
        const date = plan?.plannedStartDate || plan?.startDate || '';
        labels.set(order.id, ['خطة إنتاج', productName, lineName, date].filter(Boolean).join(' - '));
      }
    });
    return labels;
  }, [orders, workOrders, plans, productNameById, lineNameById]);
  const inactiveRackIds = useMemo(
    () => new Set(racks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean)),
    [racks],
  );
  const warehouseLocations = locations.filter((loc) =>
    loc.warehouseId === (selectedOrder?.sourceWarehouseId || warehouseId)
    && loc.isActive !== false
    && (!loc.rackId || !inactiveRackIds.has(loc.rackId)));

  const createOrder = async () => {
    if (!sourceId || !warehouseId) return;
    const requestedQty = issueQuantity.trim() ? Number(issueQuantity) : selectedSourceQuantity;
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      setMessage('حدد كمية صرف أكبر من صفر.');
      return;
    }
    if (selectedSourceQuantity > 0 && requestedQty > selectedSourceQuantity) {
      setMessage(`كمية الصرف لا يمكن أن تتجاوز كمية المصدر (${formatQty(selectedSourceQuantity, 3)}).`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const id = await productionIssueService.createDraft({
        workOrderId: sourceKind === 'work_order' ? sourceId : undefined,
        productionPlanId: sourceKind === 'production_plan' ? sourceId : undefined,
        sourceWarehouseId: warehouseId,
        quantityOverride: requestedQty,
        createdBy: actor,
        createdByUserId: uid || undefined,
      });
      setSelectedOrderId(id || '');
      setIssueQuantity('');
      setMessage('تم إنشاء أمر الصرف كمسودة.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إنشاء أمر الصرف.');
    } finally {
      setBusy(false);
    }
  };

  const resolveQtyOverride = () => (approveQty.trim() ? Number(approveQty) : undefined);

  const refreshComponentLines = async (order: ProductionIssueOrder) => {
    if (!order.id) return;
    if (order.status !== 'requested' && order.status !== 'draft') return;
    setPreparingLines(true);
    setMessage('');
    try {
      const updated = await productionIssueService.prepareRequestLines(order.id, {
        quantityOverride: resolveQtyOverride(),
        sourceWarehouseId: warehouseId || order.sourceWarehouseId,
      });
      setApproveQty(String(updated.quantity || ''));
      setMessage('تم تحديث بنود المكونات حسب الكمية الحالية.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تجهيز بنود المكونات.');
    } finally {
      setPreparingLines(false);
    }
  };

  const saveProductionRequestDraft = async (order: ProductionIssueOrder) => {
    if (!order.id || order.status !== 'requested') return;
    setBusy(true);
    setMessage('');
    try {
      const updated = await productionIssueService.saveRequestAsDraft(order.id, {
        quantityOverride: resolveQtyOverride(),
        sourceWarehouseId: warehouseId || order.sourceWarehouseId,
      });
      setSelectedOrderId(updated.id || order.id);
      setApproveQty(String(updated.quantity || ''));
      setListTab('all');
      setMessage('تم حفظ المسودة مع بنود المكونات — يمكنك الطباعة ثم الاعتماد.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر حفظ المسودة.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedOrder?.id) return;
    if (selectedOrder.status !== 'requested') return;
    if (selectedOrder.lines.length > 0) return;
    if (preparingLines || busy) return;
    if (autoPreparedRequestIdsRef.current.has(selectedOrder.id)) return;
    if (!can('productionIssue.approve') && !can('productionIssue.create')) return;
    autoPreparedRequestIdsRef.current.add(selectedOrder.id);
    void refreshComponentLines(selectedOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prepare once per bare request id
  }, [selectedOrder?.id, selectedOrder?.status, selectedOrder?.lines.length, preparingLines, busy]);

  const isProductionRequestFlow =
    selectedOrder?.status === 'requested'
    || (selectedOrder?.status === 'draft' && selectedOrder.origin === 'production_request');
  const canPrintSelected = Boolean(
    selectedOrder
    && can('productionIssue.print')
    && selectedOrder.lines.length > 0
    && selectedOrder.status !== 'rejected'
    && selectedOrder.status !== 'cancelled',
  );

  const submitAndIssue = async (order: ProductionIssueOrder) => {
    if (!order.id) return;
    if (order.status === 'requested' || (order.status === 'draft' && order.origin === 'production_request')) {
      setBusy(true);
      setMessage('');
      setShortageModalOpen(false);
      try {
        const qtyOverride = resolveQtyOverride();
        unwrapOrThrow(await approveProductionIssueRequest({
          orderId: order.id,
          actor,
          quantityOverride: qtyOverride,
          sourceWarehouseId: warehouseId || order.sourceWarehouseId,
        }));
        setShortageRows([]);
        setApproveQty('');
        setMessage('تم اعتماد طلب الإنتاج وترحيل الصرف.');
        await reload();
      } catch (error: any) {
        if (isProductionIssueApprovalError(error)) {
          setShortageRows(error.shortages);
          setShortageModalOpen(true);
          setMessage(`لا يمكن اعتماد الصرف: ${error.shortages.length} صنف بدون رصيد كافٍ.`);
        } else {
          setMessage(error?.message || 'تعذر اعتماد الطلب.');
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setMessage('');
    setShortageModalOpen(false);
    try {
      unwrapOrThrow(await issueProductionIssueOrder({
        orderId: order.id,
        actor,
        submitIfDraft: order.status === 'draft',
      }));
      setShortageRows([]);
      setMessage('تم اعتماد وصرف المكونات.');
      await reload();
    } catch (error: any) {
      if (isProductionIssueApprovalError(error)) {
        setShortageRows(error.shortages);
        setShortageModalOpen(true);
        setMessage(`لا يمكن اعتماد الصرف: ${error.shortages.length} صنف بدون رصيد كافٍ.`);
      } else {
        setMessage(error?.message || 'تعذر اعتماد الصرف.');
      }
    } finally {
      setBusy(false);
    }
  };

  const rejectProductionRequest = async (order: ProductionIssueOrder) => {
    if (!order.id || order.status !== 'requested') return;
    const reason = window.prompt('سبب الرفض (اختياري):') || undefined;
    setBusy(true);
    setMessage('');
    try {
      unwrapOrThrow(await rejectProductionIssueRequest({
        orderId: order.id,
        actor,
        reason,
      }));
      setMessage('تم رفض طلب الإنتاج.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر رفض الطلب.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (order: ProductionIssueOrder) => {
    if (!order.id || order.status === 'cancelled') return;
    const confirmMsg = order.status === 'issued'
      ? `إلغاء أمر الصرف ${order.referenceNo}؟ سيتم إرجاع الكميات للمخزن واللوكيشن وحذف حركات الصرف.`
      : `إلغاء أمر الصرف ${order.referenceNo}؟`;
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setMessage('');
    try {
      await productionIssueService.cancel(order.id, actor);
      setMessage(order.status === 'issued'
        ? 'تم إلغاء أمر الصرف وإرجاع الكميات للمخزن.'
        : 'تم إلغاء أمر الصرف.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إلغاء أمر الصرف.');
    } finally {
      setBusy(false);
    }
  };

  const print = async (order: ProductionIssueOrder) => {
    flushSync(() => {
      setPrintOrder(order);
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    handlePrint();
  };

  const openLineAction = (kind: LineActionKind, order: ProductionIssueOrder, line: ProductionIssueOrderLine) => {
    setLineAction({ kind, order, line });
    setActionQty(0);
    setActionLocationId(line.allocations[0]?.locationId || warehouseLocations[0]?.id || '');
    setCompensationReason('scrap');
    setReturnReason('unused');
    setScrapReason('scrap');
    setScrapNeedsCompensation(kind === 'compensate');
  };

  const closeLineAction = () => {
    setLineAction(null);
    setActionQty(0);
    setActionLocationId('');
  };

  const submitReturn = async (order: ProductionIssueOrder, line: ProductionIssueOrderLine) => {
    if (!actionQty) return;
    const loc = warehouseLocations.find((row) => row.id === actionLocationId);
    if (!loc?.id) return;
    await componentReturnService.returnComponent({
      issueOrderId: order.id!,
      warehouseId: order.sourceWarehouseId,
      warehouseName: order.sourceWarehouseName,
      locationId: loc.id,
      locationCode: loc.code,
      line,
      quantity: actionQty,
      reason: returnReason,
      returnedBy: actor,
      returnedByUserId: uid || undefined,
      receivedBy: actor,
      receivedByUserId: uid || undefined,
      createdBy: actor,
      createdByUserId: uid || undefined,
    });
    closeLineAction();
    await reload();
  };

  const changeLineLocation = async (order: ProductionIssueOrder, line: ProductionIssueOrderLine, nextLocationId: string) => {
    if (!order.id || !nextLocationId) return;
    setMessage('');
    try {
      await productionIssueService.setLineSingleLocation({
        orderId: order.id,
        itemType: line.itemType,
        itemId: line.itemId,
        locationId: nextLocationId,
      });
      await reload();
      setSelectedOrderId(order.id);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تعديل لوكيشن المكون.');
    }
  };

  const submitCompensation = async (order: ProductionIssueOrder, line: ProductionIssueOrderLine) => {
    if (!actionQty) return;
    const loc = warehouseLocations.find((row) => row.id === actionLocationId);
    if (!loc?.id) {
      setMessage('لا يوجد لوكيشن نشط للتعويض.');
      return;
    }
    await componentCompensationService.create({
      issueOrderId: order.id!,
      reason: compensationReason,
      line,
      quantity: actionQty,
      warehouseId: order.sourceWarehouseId,
      warehouseName: order.sourceWarehouseName,
      locationId: loc.id,
      locationCode: loc.code,
      createdBy: actor,
      createdByUserId: uid || undefined,
    });
    setMessage('تم إنشاء طلب التعويض، ويحتاج اعتماد قبل الخصم.');
    closeLineAction();
    await reload();
  };

  const submitScrap = async (order: ProductionIssueOrder, line: ProductionIssueOrderLine) => {
    if (!actionQty || !order.id) return;
    await componentScrapService.create({
      issueOrderId: order.id,
      itemType: line.itemType,
      itemId: line.itemId,
      quantity: actionQty,
      reason: scrapReason,
      needsCompensation: scrapNeedsCompensation,
      createdBy: actor,
      createdByUserId: uid || undefined,
    });
    if (scrapNeedsCompensation) {
      const loc = warehouseLocations.find((row) => row.id === actionLocationId);
      if (loc?.id) {
        await componentCompensationService.create({
          issueOrderId: order.id,
          reason: scrapReason,
          line,
          quantity: actionQty,
          warehouseId: order.sourceWarehouseId,
          warehouseName: order.sourceWarehouseName,
          locationId: loc.id,
          locationCode: loc.code,
          createdBy: actor,
          createdByUserId: uid || undefined,
          note: 'Auto-created from actual scrap record',
        });
      }
    }
    setMessage('تم تسجيل الهالك الفعلي للتحليل بدون خصم مخزون إضافي.');
    closeLineAction();
    await reload();
  };

  const submitLineAction = async () => {
    if (!lineAction) return;
    setMessage('');
    try {
      if (lineAction.kind === 'return') await submitReturn(lineAction.order, lineAction.line);
      if (lineAction.kind === 'compensate') await submitCompensation(lineAction.order, lineAction.line);
      if (lineAction.kind === 'scrap') await submitScrap(lineAction.order, lineAction.line);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تنفيذ الإجراء.');
    }
  };

  if (!can('inventory.view')) return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="صرف إنتاج"
        subtitle="طلبات موديول الإنتاج تظهر هنا لاعتماد أو رفض المستلزم. يمكن للمستودع أيضاً إنشاء إذن صرف مباشر عند الحاجة."
        icon="inventory_2"
      />
      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {can('productionIssue.create') && (
      <Card title="إنشاء أمر صرف (من المستودع)">
        <div className="grid grid-cols-1 lg:grid-cols-[150px_minmax(240px,1fr)_180px_180px_110px] gap-3 p-4 items-end">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">نوع المصدر</span>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={sourceKind} onChange={(e) => { setSourceKind(e.target.value as typeof sourceKind); setSourceId(''); }}>
              <option value="work_order">أمر شغل</option>
              <option value="production_plan">خطة إنتاج</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">أمر الشغل / الخطة</span>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">اختر المصدر</option>
              {sourceOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">مخزن المستلزمات</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-700"
              value={warehouseId}
              disabled={warehouseSelectLocked || warehouses.length === 0}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">كمية الصرف للإنتاج</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
              type="number"
              min="0"
              step="0.001"
              value={issueQuantity}
              placeholder={selectedSourceQuantity > 0 ? formatQty(selectedSourceQuantity, 3) : '0'}
              onChange={(e) => setIssueQuantity(e.target.value)}
              autoFocus={Boolean(String(searchParams.get('quantity') || '').trim())}
            />
          </label>
          <Button variant="primary" disabled={busy || !can('productionIssue.create')} onClick={() => void createOrder()}>إنشاء إذن</Button>
          <div className="lg:col-start-4 text-xs font-semibold text-slate-500">
            {issueQuantity.trim()
              ? `عدّل الكمية إن لزم ثم أنشئ الإذن (حد المصدر: ${formatQty(selectedSourceQuantity || Number(issueQuantity) || 0, 3)}).`
              : selectedSourceQuantity > 0
                ? `اتركها فارغة لصرف كامل الكمية: ${formatQty(selectedSourceQuantity, 3)}`
                : 'اختر المصدر لعرض الكمية الافتراضية.'}
          </div>
        </div>
      </Card>
      )}

      {message && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <p className="text-sm font-bold text-primary">{message}</p>
          {shortageRows.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShortageModalOpen(true)}
            >
              عرض تفاصيل النقص
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        <Card className="!p-0 overflow-hidden" title="أوامر الصرف">
          <div className="flex gap-2 px-3 pt-3">
            {([
              ['requests', `طلبات من الإنتاج (${orders.filter((o) => o.status === 'requested').length})`],
              ['all', 'أوامر المستودع'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setListTab(key);
                  setOrdersPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  listTab === key ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {listOrders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {listTab === 'requests' ? 'لا توجد طلبات إنتاج معلّقة.' : 'لا توجد أوامر صرف بعد.'}
            </p>
          ) : (
            <>
              {pagedOrders.map((order) => (
                <button
                  key={order.id}
                  className={`block w-full text-start border-b px-4 py-3 ${selectedOrder?.id === order.id ? 'bg-primary/10' : ''}`}
                  onClick={() => {
                    setSelectedOrderId(order.id || '');
                    setApproveQty(String(order.quantity || ''));
                  }}
                >
                  <p className="font-bold">{order.referenceNo}</p>
                  <p className="text-xs text-slate-500">{order.productName} - {statusLabel(order.status)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {order.status === 'requested' ? 'كمية الطلب' : 'كمية الصرف'}: {formatQty(order.quantity, 3)}
                    {order.requestedBy ? ` · من ${order.requestedBy}` : ''}
                  </p>
                </button>
              ))}
              <DataPaginationFooter
                page={safeOrdersPage}
                totalPages={ordersTotalPages}
                totalItems={listOrders.length}
                onPageChange={setOrdersPage}
                itemLabel="أمر"
              />
            </>
          )}
        </Card>

        <Card className="!p-0 overflow-hidden" title={selectedOrder ? `تفاصيل ${selectedOrder.referenceNo}` : 'التفاصيل'}>
          {selectedOrder && (
            <>
              <div className="flex flex-wrap gap-2 p-4 border-b">
                {isProductionRequestFlow ? (
                  <>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      كمية الاعتماد
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="w-28 rounded border px-2 py-1.5 text-sm tabular-nums"
                        value={approveQty}
                        onChange={(e) => setApproveQty(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      disabled={busy || preparingLines || !can('productionIssue.approve')}
                      onClick={() => void refreshComponentLines(selectedOrder)}
                    >
                      {preparingLines ? 'جاري التحديث…' : 'تحديث المكونات'}
                    </Button>
                    {selectedOrder.status === 'requested' && (
                      <Button
                        variant="secondary"
                        disabled={busy || preparingLines || !can('productionIssue.approve')}
                        onClick={() => void saveProductionRequestDraft(selectedOrder)}
                      >
                        حفظ مسودة
                      </Button>
                    )}
                    <ToneActionButton
                      action="approve"
                      disabled={
                        busy
                        || preparingLines
                        || selectedOrder.lines.length === 0
                        || !can('productionIssue.approve')
                      }
                      onClick={() => void submitAndIssue(selectedOrder)}
                    >
                      اعتماد وترحيل صرف
                    </ToneActionButton>
                    {selectedOrder.status === 'requested' && (
                      <ToneActionButton
                        action="reject"
                        disabled={busy || preparingLines || !can('productionIssue.approve')}
                        onClick={() => void rejectProductionRequest(selectedOrder)}
                      >
                        رفض الطلب
                      </ToneActionButton>
                    )}
                  </>
                ) : (
                  <ToneActionButton
                    action="approve"
                    disabled={
                      busy
                      || selectedOrder.status === 'issued'
                      || selectedOrder.status === 'cancelled'
                      || selectedOrder.status === 'rejected'
                      || !can('productionIssue.approve')
                    }
                    onClick={() => void submitAndIssue(selectedOrder)}
                  >
                    اعتماد وصرف
                  </ToneActionButton>
                )}
                <Button
                  variant="danger"
                  disabled={
                    busy
                    || selectedOrder.status === 'cancelled'
                    || selectedOrder.status === 'rejected'
                    || !can('productionIssue.approve')
                  }
                  onClick={() => void cancelOrder(selectedOrder)}
                >
                  إلغاء الأمر
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canPrintSelected || busy || preparingLines}
                  onClick={() => void print(selectedOrder)}
                >
                  طباعة PDF
                </Button>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-bold">
                  {(['a4', 'a5'] as PaperSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setIssuePaperSize(size)}
                      className={`px-3 py-2 ${issuePaperSize === size ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {size.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b bg-slate-50/60">
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">المنتج</p>
                  <p className="mt-1 text-sm font-black">{selectedOrder.productName}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">كمية الصرف للإنتاج</p>
                  <p className="mt-1 text-sm font-black tabular-nums">{formatQty(selectedOrder.quantity, 3)}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">مخزن الصرف (من)</p>
                  <p className="mt-1 text-sm font-black">{selectedOrder.sourceWarehouseName || selectedOrder.sourceWarehouseId}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">صالة الإنتاج (إلى)</p>
                  <p className="mt-1 text-sm font-black">{selectedOrder.targetWarehouseName || selectedOrder.targetWarehouseId || '—'}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">الحالة</p>
                  <p className="mt-1 text-sm font-black">{statusLabel(selectedOrder.status)}</p>
                </div>
              </div>
              {isProductionRequestFlow && selectedOrder.lines.length === 0 && (
                <p className="px-4 py-3 text-sm font-semibold text-amber-800 bg-amber-50 border-b border-amber-100">
                  {preparingLines
                    ? 'جاري حساب بنود المكونات…'
                    : 'اضغط «تحديث المكونات» لعرض البنود قبل الاعتماد والطباعة.'}
                  {selectedOrder.assemblableAtRequest != null
                    ? ` متاح للتجميع وقت الطلب: ${formatQty(selectedOrder.assemblableAtRequest, 3)}.`
                    : ''}
                </p>
              )}
              {isProductionRequestFlow && selectedOrder.lines.length > 0 && (
                <p className="px-4 py-3 text-sm font-semibold text-emerald-800 bg-emerald-50 border-b border-emerald-100">
                  بنود المكونات جاهزة للمراجعة والطباعة.
                  {selectedOrder.status === 'requested'
                    ? ' احفظ مسودة إن أردت، ثم اعتمد ورحّل الصرف.'
                    : ' راجع الكمية واللوكيشنات ثم اعتمد ورحّل الصرف.'}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="p-3 text-start">المكون</th>
                      <th className="p-3 text-center">طبيعي</th>
                      <th className="p-3 text-center">هالك قياسي</th>
                      <th className="p-3 text-center">مطلوب</th>
                      <th className="p-3 text-center">متاح</th>
                      <th className="p-3 text-start">لوكيشن</th>
                      <th className="p-3 text-center">تحليل</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preparingLines && selectedOrder.lines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-sm text-slate-400">
                          جاري حساب بنود المكونات…
                        </td>
                      </tr>
                    ) : selectedOrder.lines.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-sm text-slate-400">
                          لا توجد بنود مكونات بعد.
                        </td>
                      </tr>
                    ) : (
                      selectedOrder.lines.map((line) => (
                      <tr key={`${line.itemType}-${line.itemId}`} className="border-b">
                        <td className="p-3">{line.itemName}<br /><span className="text-xs font-mono">{line.itemCode}</span></td>
                        <td className="p-3 text-center tabular-nums">{formatQty(line.baseRequiredQty)}</td>
                        <td className="p-3 text-center tabular-nums">{formatQty(line.plannedWasteQty)}</td>
                        <td className="p-3 text-center font-bold tabular-nums">{formatQty(line.requiredQty)}</td>
                        <td className={`p-3 text-center tabular-nums ${line.shortageQty > 0 ? 'text-rose-600 font-bold' : ''}`}>{formatQty(line.availableQty)}</td>
                        <td className="p-3 text-xs">
                          <div className="space-y-1">
                            <p>{line.allocations.map((a) => `${a.locationCode}: ${formatQty(a.quantity)}`).join('، ') || '—'}</p>
                            {selectedOrder.status !== 'issued' && (
                              <select
                                className="rounded border px-2 py-1 text-xs"
                                value={line.allocations[0]?.locationId || ''}
                                onChange={(e) => void changeLineLocation(selectedOrder, line, e.target.value)}
                              >
                                <option value="">تغيير اللوكيشن</option>
                                {warehouseLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          مصروف {formatQty(line.issuedQty)} / تعويض {formatQty(line.compensatedQty)} / مرتجع {formatQty(line.returnedQty)} / هالك {formatQty(line.actualScrapQty)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex flex-wrap items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" disabled={!can('productionIssue.return')} onClick={() => openLineAction('return', selectedOrder, line)}>مرتجع</Button>
                            <Button size="sm" variant="ghost" disabled={!can('productionIssue.compensate')} onClick={() => openLineAction('compensate', selectedOrder, line)}>تعويض</Button>
                            <Button size="sm" variant="ghost" disabled={!can('productionIssue.compensate')} onClick={() => openLineAction('scrap', selectedOrder, line)}>هالك</Button>
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: -1,
          pointerEvents: 'none',
          direction: 'rtl',
          width: '210mm',
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        <IssuePrint
          ref={printRef}
          order={printOrder}
          sourceLabel={printOrder?.id ? sourceLabelByOrder.get(printOrder.id) : undefined}
          paperSize={issuePaperSize}
        />
      </div>
      {shortageModalOpen && shortageRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShortageModalOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-base font-black text-rose-700">لا يمكن اعتماد الصرف</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  الأصناف التالية بدون رصيد كافٍ — المطلوب مقابل المتاح حالياً.
                </p>
              </div>
              <button type="button" className="text-xl leading-none text-slate-500" onClick={() => setShortageModalOpen(false)}>×</button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600">
                    <th className="p-3 text-start">المكون</th>
                    <th className="p-3 text-center">تحاول تصرف</th>
                    <th className="p-3 text-center">المتاح</th>
                    <th className="p-3 text-center">النقص</th>
                    <th className="p-3 text-start">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {shortageRows.map((row, index) => {
                    const shortage = Math.max(0, Number(row.requiredQty || 0) - Number(row.availableQty || 0));
                    return (
                      <tr key={`${row.itemCode}-${row.locationCode || 'all'}-${index}`} className="border-b align-top">
                        <td className="p-3">
                          <p className="font-bold">{row.itemName}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{row.itemCode}</p>
                          {row.locationCode && (
                            <p className="mt-1 text-xs font-semibold text-slate-500">لوكيشن: {row.locationCode}</p>
                          )}
                        </td>
                        <td className="p-3 text-center font-black tabular-nums text-slate-900">
                          {formatQty(row.requiredQty)} {row.unit}
                        </td>
                        <td className="p-3 text-center font-bold tabular-nums text-amber-700">
                          {formatQty(row.availableQty)} {row.unit}
                        </td>
                        <td className="p-3 text-center font-black tabular-nums text-rose-600">
                          {formatQty(shortage)} {row.unit}
                        </td>
                        <td className="p-3 text-xs font-semibold text-slate-600">{shortageReasonLabel(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t px-5 py-4">
              <Button variant="primary" onClick={() => setShortageModalOpen(false)}>حسناً</Button>
            </div>
          </div>
        </div>
      )}
      {lineAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeLineAction}>
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-black">
                {lineAction.kind === 'return' ? 'تسجيل مرتجع مكون' : lineAction.kind === 'compensate' ? 'طلب تعويض مكون' : 'تسجيل هالك فعلي'}
              </h3>
              <button className="text-xl leading-none text-slate-500" onClick={closeLineAction}>x</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-bold">{lineAction.line.itemName}</p>
                <p className="text-xs text-slate-500">{lineAction.order.referenceNo} - {lineAction.line.itemCode}</p>
              </div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="number"
                min="0"
                placeholder="الكمية"
                value={actionQty || ''}
                onChange={(e) => setActionQty(Number(e.target.value || 0))}
              />
              {lineAction.kind !== 'scrap' || scrapNeedsCompensation ? (
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={actionLocationId} onChange={(e) => setActionLocationId(e.target.value)}>
                  <option value="">اختر اللوكيشن</option>
                  {warehouseLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
                </select>
              ) : null}
              {lineAction.kind === 'return' && (
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={returnReason} onChange={(e) => setReturnReason(e.target.value as ComponentReturnReason)}>
                  <option value="unused">غير مستخدم</option>
                  <option value="over_issue">صرف زائد</option>
                  <option value="production_cancelled">إلغاء إنتاج</option>
                  <option value="correction">تصحيح</option>
                </select>
              )}
              {lineAction.kind === 'compensate' && (
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={compensationReason} onChange={(e) => setCompensationReason(e.target.value as ComponentCompensationReason)}>
                  <option value="scrap">هالك</option>
                  <option value="shortage">نقص</option>
                  <option value="damage">تلف</option>
                  <option value="correction">تصحيح</option>
                </select>
              )}
              {lineAction.kind === 'scrap' && (
                <>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={scrapReason} onChange={(e) => setScrapReason(e.target.value as ComponentCompensationReason)}>
                    <option value="scrap">هالك</option>
                    <option value="damage">تلف</option>
                    <option value="shortage">نقص</option>
                    <option value="correction">تصحيح</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={scrapNeedsCompensation} onChange={(e) => setScrapNeedsCompensation(e.target.checked)} />
                    إنشاء طلب تعويض بنفس الكمية
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeLineAction}>إلغاء</Button>
                <Button variant="primary" disabled={!actionQty} onClick={() => void submitLineAction()}>حفظ</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
