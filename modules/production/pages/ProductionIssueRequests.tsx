import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatNumber, getTodayDateString, addDaysToDate, calculateEstimatedDays } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '../../../utils/printManager';
import { productionIssueService } from '../../inventory/services/productionIssueService';
import { createProductionIssueRequest } from '../usecases/createProductionIssueRequest';
import { unwrapOrThrow } from '@/shared/usecases';
import { componentCompensationService } from '../../inventory/services/componentCompensationService';
import { assemblableCapacityService, type AssemblableCapacityRow } from '../../inventory/services/assemblableCapacityService';
import { warehouseService } from '../../inventory/services/warehouseService';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../../inventory/lib/resolveSuppliesWarehouse';
import { missingComponentsForTarget, componentShortageQtyForTarget } from '../../inventory/lib/assemblableCapacity';
import {
  requestRemainingQty,
  suggestRequestQuantity,
  summarizeOrdersForSource,
} from '../../inventory/lib/productionIssueRequest';
import type {
  ComponentCompensationReason,
  ComponentCompensationRequest,
  ProductionIssueOrder,
} from '../../inventory/types';
import {
  MissingComponentsReportPrint,
  type MissingComponentsReportSection,
} from '../components/MissingComponentsReportPrint';
import { ClipboardList } from 'lucide-react';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import {
  PRODUCTION_PLAN_CREATE_PATHS,
  PRODUCTION_PLAN_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

const ISSUE_REQUESTS_CACHE_KEY = 'production:issue-requests';

type ProductionIssueRequestsLocalData = {
  issueRows: ProductionIssueOrder[];
  capacityRows: AssemblableCapacityRow[];
  compensationRows: ComponentCompensationRequest[];
  suppliesWarehouseName: string;
};

const COMP_REASON_LABELS: Record<ComponentCompensationReason, string> = {
  scrap: 'هالك',
  shortage: 'نقص',
  damage: 'تلف',
  correction: 'تصحيح',
};

function compensationStatusMeta(status: ComponentCompensationRequest['status']): {
  label: string;
  type: 'warning' | 'info' | 'success' | 'danger';
} {
  switch (status) {
    case 'pending':
      return { label: 'بانتظار الاعتماد', type: 'warning' };
    case 'approved':
      return { label: 'معتمد', type: 'success' };
    case 'rejected':
      return { label: 'مرفوض', type: 'danger' };
    default:
      return { label: status, type: 'info' };
  }
}

function statusMeta(status: ProductionIssueOrder['status']): { label: string; type: 'warning' | 'info' | 'success' | 'danger' } {
  switch (status) {
    case 'requested':
      return { label: 'بانتظار المستلزم', type: 'warning' };
    case 'draft':
      return { label: 'مسودة', type: 'info' };
    case 'submitted':
      return { label: 'مُرسل', type: 'info' };
    case 'issued':
      return { label: 'مصروف', type: 'success' };
    case 'rejected':
      return { label: 'مرفوض', type: 'danger' };
    case 'cancelled':
      return { label: 'ملغى', type: 'danger' };
    default:
      return { label: status, type: 'info' };
  }
}

function planRemaining(plan: {
  remainingQuantity?: number;
  plannedQuantity?: number;
  producedQuantity?: number;
}): number {
  const remaining = Number(plan.remainingQuantity ?? 0);
  if (remaining > 0) return remaining;
  return Math.max(0, Number(plan.plannedQuantity || 0) - Number(plan.producedQuantity || 0));
}

/**
 * Production-facing: request materials issue + track issued/remaining + assemblable + create plan.
 */
export const ProductionIssueRequests: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const canRequest = can('productionIssue.request');
  const canCreatePlanPermission = can('plans.create');
  const plans = useAppStore((s) => s.productionPlans);
  const workOrders = useAppStore((s) => s.workOrders);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s.productionLines);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const canCreatePlan = canCreatePlanPermission && isOperationPathEnabled(
    systemSettings,
    PRODUCTION_PLAN_OPERATION_KEYS.create,
    PRODUCTION_PLAN_CREATE_PATHS.productionIssueRequests,
  );
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  const fetchProducts = useAppStore((s) => s.fetchProducts);
  const fetchLines = useAppStore((s) => s.fetchLines);
  const createProductionPlan = useAppStore((s) => s.createProductionPlan);

  const [orders, setOrders] = useState<ProductionIssueOrder[]>(() => {
    const cached = peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY);
    if (!cached) return [];
    return cached.issueRows.filter(
      (row) =>
        row.origin === 'production_request' ||
        row.status === 'requested' ||
        row.status === 'rejected' ||
        Boolean(row.requestedQuantity),
    );
  });
  const [allIssueOrders, setAllIssueOrders] = useState<ProductionIssueOrder[]>(
    () => peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY)?.issueRows ?? [],
  );
  const [compensations, setCompensations] = useState<ComponentCompensationRequest[]>(
    () => peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY)?.compensationRows ?? [],
  );
  const [capacity, setCapacity] = useState<AssemblableCapacityRow[]>(
    () => peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY)?.capacityRows ?? [],
  );
  const [loading, setLoading] = useState(
    () => peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY) == null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sourceKind, setSourceKind] = useState<'production_plan' | 'work_order'>('production_plan');
  const [sourceId, setSourceId] = useState(() => searchParams.get('planId') || searchParams.get('workOrderId') || '');
  const [quantity, setQuantity] = useState(() => searchParams.get('quantity') || '');

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planProductId, setPlanProductId] = useState('');
  const [planQuantity, setPlanQuantity] = useState('');
  const [planSaving, setPlanSaving] = useState(false);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [compensationModalOpen, setCompensationModalOpen] = useState(false);

  const [compIssueId, setCompIssueId] = useState('');
  const [compLineKey, setCompLineKey] = useState('');
  const [compQty, setCompQty] = useState('');
  const [compReason, setCompReason] = useState<ComponentCompensationReason>('shortage');
  const [compNote, setCompNote] = useState('');
  const [compBusy, setCompBusy] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedShortageProductId, setExpandedShortageProductId] = useState<string | null>(null);
  const [suppliesWarehouseName, setSuppliesWarehouseName] = useState(
    () =>
      peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY)?.suppliesWarehouseName
      ?? '',
  );
  const [printSections, setPrintSections] = useState<MissingComponentsReportSection[]>([]);
  const [printSubtitle, setPrintSubtitle] = useState('كل المنتجات ذات النقص مقابل الخطط المفتوحة');
  const shortagePrintRef = useRef<HTMLDivElement>(null);
  const handleShortagePrint = useManagedPrint({
    contentRef: shortagePrintRef,
    printSettings: printTemplate,
    documentTitle: 'تقرير المكونات الناقصة',
  });

  const actor = userDisplayName || userEmail || 'Current User';
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p.name || p.code || p.id);
    });
    return map;
  }, [products]);

  const openPlans = useMemo(
    () =>
      plans.filter((plan) => {
        if (!(plan.status === 'planned' || plan.status === 'in_progress' || plan.status === 'paused')) return false;
        return planRemaining(plan) > 0;
      }),
    [plans],
  );

  const openPlanByProductId = useMemo(() => {
    const map = new Map<string, typeof openPlans[0]>();
    openPlans.forEach((plan) => {
      if (!plan.productId || !plan.id) return;
      const existing = map.get(plan.productId);
      if (!existing || planRemaining(plan) > planRemaining(existing)) {
        map.set(plan.productId, plan);
      }
    });
    return map;
  }, [openPlans]);

  const openWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress' || wo.status === 'paused'),
    [workOrders],
  );

  const activeLines = useMemo(
    () => lines.filter((line) => Boolean(line.id)),
    [lines],
  );

  const selectedProductId = useMemo(() => {
    if (sourceKind === 'work_order') {
      return openWorkOrders.find((wo) => wo.id === sourceId)?.productId || '';
    }
    return openPlans.find((plan) => plan.id === sourceId)?.productId || '';
  }, [sourceKind, sourceId, openPlans, openWorkOrders]);

  const sourceRemaining = useMemo(() => {
    if (!sourceId) return 0;
    if (sourceKind === 'work_order') {
      return Number(openWorkOrders.find((wo) => wo.id === sourceId)?.quantity || 0);
    }
    const plan = openPlans.find((row) => row.id === sourceId);
    return plan ? planRemaining(plan) : 0;
  }, [sourceId, sourceKind, openPlans, openWorkOrders]);

  const maxAssemblable = useMemo(() => {
    if (!selectedProductId) return 0;
    return Math.max(0, Number(capacity.find((row) => row.productId === selectedProductId)?.maxAssemblable || 0));
  }, [capacity, selectedProductId]);

  const suggestedQty = suggestRequestQuantity(sourceRemaining, maxAssemblable);

  const assemblableRows = useMemo(
    () =>
      capacity
        .filter((row) => Number(row.maxAssemblable || 0) > 0)
        .slice()
        .sort((a, b) => Number(b.maxAssemblable || 0) - Number(a.maxAssemblable || 0)),
    [capacity],
  );

  const issuedOrders = useMemo(
    () =>
      allIssueOrders
        .filter((row) => row.status === 'issued' && (row.lines || []).length > 0)
        .slice()
        .sort((a, b) => String(b.issuedAt || b.createdAt || '').localeCompare(String(a.issuedAt || a.createdAt || ''))),
    [allIssueOrders],
  );

  const selectedCompOrder = useMemo(
    () => issuedOrders.find((row) => row.id === compIssueId) || null,
    [issuedOrders, compIssueId],
  );

  const selectedCompLine = useMemo(() => {
    if (!selectedCompOrder || !compLineKey) return null;
    return (selectedCompOrder.lines || []).find(
      (line) => `${line.itemType}:${line.itemId}` === compLineKey,
    ) || null;
  }, [selectedCompOrder, compLineKey]);

  const productionCompensations = useMemo(
    () => compensations.filter((row) => row.origin === 'production_request'),
    [compensations],
  );

  const noComponentAlerts = useMemo(() => {
    const byProduct = new Map<string, {
      productId: string;
      productName: string;
      remaining: number;
      capacity: AssemblableCapacityRow | undefined;
    }>();
    openPlans.forEach((plan) => {
      const remaining = planRemaining(plan);
      if (!(remaining > 0) || !plan.productId) return;
      const capacityRow = capacity.find((row) => row.productId === plan.productId);
      const max = Math.max(0, Number(capacityRow?.maxAssemblable || 0));
      if (max > 0) return;
      const existing = byProduct.get(plan.productId);
      if (existing) existing.remaining += remaining;
      else {
        byProduct.set(plan.productId, {
          productId: plan.productId,
          productName: productNameById.get(plan.productId) || plan.productId,
          remaining,
          capacity: capacityRow,
        });
      }
    });
    return [...byProduct.values()].sort((a, b) => b.remaining - a.remaining);
  }, [openPlans, capacity, productNameById]);

  const partialCoverageAlerts = useMemo(() => {
    const rows: Array<{
      productId: string;
      productName: string;
      remaining: number;
      maxAssemblable: number;
      capacity: AssemblableCapacityRow;
    }> = [];
    openPlans.forEach((plan) => {
      if (!plan.productId) return;
      const remaining = planRemaining(plan);
      if (!(remaining > 0)) return;
      const capacityRow = capacity.find((row) => row.productId === plan.productId);
      if (!capacityRow) return;
      const max = Math.max(0, Number(capacityRow.maxAssemblable || 0));
      if (!(max > 0) || max >= remaining - 0.000001) return;
      const existing = rows.find((row) => row.productId === plan.productId);
      if (existing) {
        existing.remaining += remaining;
      } else {
        rows.push({
          productId: plan.productId,
          productName: productNameById.get(plan.productId) || plan.productId,
          remaining,
          maxAssemblable: max,
          capacity: capacityRow,
        });
      }
    });
    return rows.sort((a, b) => (b.remaining - b.maxAssemblable) - (a.remaining - a.maxAssemblable));
  }, [openPlans, capacity, productNameById]);

  const shortageReportSections = useMemo((): MissingComponentsReportSection[] => {
    const noneSections: MissingComponentsReportSection[] = noComponentAlerts.map((row) => {
      const missing = missingComponentsForTarget(row.capacity, row.remaining);
      return {
        productId: row.productId,
        productName: row.productName,
        productCode: row.capacity?.productCode,
        kind: 'none',
        remaining: row.remaining,
        maxAssemblable: 0,
        lines: missing.map((line) => ({
          materialName: line.materialName,
          materialCode: line.materialCode,
          requiredForTarget: line.requiredForTarget,
          availableQty: line.availableQty,
          shortageQty: line.shortageQty,
        })),
      };
    });
    const partialSections: MissingComponentsReportSection[] = partialCoverageAlerts.map((row) => {
      const missing = missingComponentsForTarget(row.capacity, row.remaining);
      return {
        productId: row.productId,
        productName: row.productName,
        productCode: row.capacity?.productCode,
        kind: 'partial',
        remaining: row.remaining,
        maxAssemblable: row.maxAssemblable,
        lines: missing.map((line) => ({
          materialName: line.materialName,
          materialCode: line.materialCode,
          requiredForTarget: line.requiredForTarget,
          availableQty: line.availableQty,
          shortageQty: line.shortageQty,
        })),
      };
    });
    return [...noneSections, ...partialSections];
  }, [noComponentAlerts, partialCoverageAlerts]);

  const printShortageReport = async (
    sections: MissingComponentsReportSection[],
    subtitle: string,
  ) => {
    if (!sections.length) {
      setMessage('لا توجد مكونات ناقصة للطباعة حالياً.');
      return;
    }
    setPrintSections(sections);
    setPrintSubtitle(subtitle);
    // Wait for React commit + layout so the off-screen print tree includes all product lines.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    handleShortagePrint();
  };

  const load = useCallback(async (force = false) => {
    const cached = peekPageDataCache<ProductionIssueRequestsLocalData>(ISSUE_REQUESTS_CACHE_KEY);
    if (cached) {
      setAllIssueOrders(cached.issueRows);
      setOrders(
        cached.issueRows.filter(
          (row) =>
            row.origin === 'production_request' ||
            row.status === 'requested' ||
            row.status === 'rejected' ||
            Boolean(row.requestedQuantity),
        ),
      );
      setCapacity(cached.capacityRows);
      setCompensations(cached.compensationRows);
      setSuppliesWarehouseName(cached.suppliesWarehouseName);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      await Promise.all([fetchProductionPlans(), fetchWorkOrders(), fetchProducts(), fetchLines()]);
      const { data } = await fetchCachedPageData(
        ISSUE_REQUESTS_CACHE_KEY,
        async () => {
          const warehouses = await warehouseService.getAllWarehouses();
          const suppliesId = resolveSuppliesWarehouseId(routing, warehouses);
          const suppliesWh = warehouses.find((w) => w.id === suppliesId);
          const [issueRows, capacityRows, compensationRows] = await Promise.all([
            productionIssueService.getAll(),
            suppliesId
              ? assemblableCapacityService.getForWarehouse(suppliesId).catch((err) => {
                  console.error('assemblableCapacityService.getForWarehouse error:', err);
                  return [] as Awaited<ReturnType<typeof assemblableCapacityService.getForWarehouse>>;
                })
              : Promise.resolve([]),
            componentCompensationService.getAll().catch((err) => {
              console.error('componentCompensationService.getAll error:', err);
              return [] as Awaited<ReturnType<typeof componentCompensationService.getAll>>;
            }),
          ]);
          return {
            issueRows,
            capacityRows,
            compensationRows,
            suppliesWarehouseName: suppliesWh?.name || suppliesWh?.code || '',
          } satisfies ProductionIssueRequestsLocalData;
        },
        { force, maxAgeMs: 45_000 },
      );
      setAllIssueOrders(data.issueRows);
      setOrders(
        data.issueRows.filter(
          (row) =>
            row.origin === 'production_request' ||
            row.status === 'requested' ||
            row.status === 'rejected' ||
            Boolean(row.requestedQuantity),
        ),
      );
      setCapacity(data.capacityRows);
      setCompensations(data.compensationRows);
      setSuppliesWarehouseName(data.suppliesWarehouseName);
    } catch (err) {
      console.error('ProductionIssueRequests load error:', err);
      toast.error('تعذر تحميل طلبات صرف الإنتاج');
    } finally {
      setLoading(false);
    }
  }, [fetchProductionPlans, fetchWorkOrders, fetchProducts, fetchLines, routing]);

  const reload = useCallback(async () => {
    invalidatePageDataCache(ISSUE_REQUESTS_CACHE_KEY);
    await load(true);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const planId = String(searchParams.get('planId') || '').trim();
    const workOrderId = String(searchParams.get('workOrderId') || '').trim();
    const q = String(searchParams.get('quantity') || '').trim();
    if (planId) {
      setSourceKind('production_plan');
      setSourceId(planId);
      if (q) setQuantity(q);
      if (canRequest) setRequestModalOpen(true);
    } else if (workOrderId) {
      setSourceKind('work_order');
      setSourceId(workOrderId);
      if (q) setQuantity(q);
      if (canRequest) setRequestModalOpen(true);
    } else if (q) {
      setQuantity(q);
    }
  }, [searchParams, canRequest]);

  useEffect(() => {
    if (!requestModalOpen || !sourceId) return;
    if (quantity.trim()) return;
    if (suggestedQty > 0) setQuantity(String(suggestedQty));
  }, [requestModalOpen, sourceId, suggestedQty, quantity]);

  const openRequestModalForPlan = (planId: string, assemblable: number) => {
    if (!canRequest) {
      setMessage('لا تملك صلاحية طلب صرف الإنتاج.');
      return;
    }
    const plan = openPlans.find((p) => p.id === planId);
    if (!plan?.id) {
      setMessage('الخطة غير متاحة.');
      return;
    }
    const rem = planRemaining(plan);
    const qty = suggestRequestQuantity(rem, assemblable);
    setSourceKind('production_plan');
    setSourceId(planId);
    setQuantity(qty > 0 ? String(qty) : '');
    setMessage('');
    setRequestModalOpen(true);
  };

  const openBlankRequestModal = () => {
    if (!canRequest) return;
    setMessage('');
    setRequestModalOpen(true);
  };

  const openCompensationModal = () => {
    if (!canRequest) return;
    setMessage('');
    setCompensationModalOpen(true);
  };

  const resetCompensationForm = () => {
    setCompIssueId('');
    setCompLineKey('');
    setCompQty('');
    setCompReason('shortage');
    setCompNote('');
  };

  const openCreatePlan = (row: AssemblableCapacityRow) => {
    setPlanProductId(row.productId);
    setPlanQuantity(String(Math.max(1, Math.floor(Number(row.maxAssemblable || 0)) || 1)));
    setPlanModalOpen(true);
  };

  const savePlan = async () => {
    if (!canCreatePlan || !uid) return;
    const qty = Number(planQuantity);
    if (!planProductId || !(qty > 0)) {
      setMessage('حدد المنتج وكمية أكبر من صفر لإنشاء الخطة.');
      return;
    }
    setPlanSaving(true);
    setMessage('');
    try {
      const startDate = getTodayDateString();
      const avgDailyTarget = Math.max(1, Math.ceil(qty));
      const estimatedDays = Math.max(1, calculateEstimatedDays(qty, avgDailyTarget));
      const planId = await createProductionPlan({
        productId: planProductId,
        planType: 'finished_product',
        plannedQuantity: qty,
        producedQuantity: 0,
        startDate,
        plannedStartDate: startDate,
        plannedEndDate: addDaysToDate(startDate, estimatedDays),
        estimatedDurationDays: estimatedDays,
        avgDailyTarget,
        priority: 'medium',
        estimatedCost: 0,
        actualCost: 0,
        acceptsProductionFromReports: true,
        status: 'planned',
        createdBy: uid,
      }, { path: PRODUCTION_PLAN_CREATE_PATHS.productionIssueRequests });
      setPlanModalOpen(false);
      await fetchProductionPlans();
      if (planId) {
        setSourceKind('production_plan');
        setSourceId(planId);
        const assemblable = Math.max(0, Number(capacity.find((r) => r.productId === planProductId)?.maxAssemblable || 0));
        setQuantity(String(suggestRequestQuantity(qty, assemblable) || qty));
        setMessage('تم إنشاء الخطة — راجع الكمية ثم أرسل طلب الصرف للمستلزم.');
        if (canRequest) setRequestModalOpen(true);
      } else {
        setMessage('تم إنشاء الخطة.');
      }
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إنشاء الخطة.');
    } finally {
      setPlanSaving(false);
    }
  };

  const createRequest = async () => {
    if (!canRequest) return;
    if (!sourceId) {
      setMessage('اختر خطة أو أمر شغل.');
      return;
    }
    const qty = Number(quantity);
    if (!(qty > 0)) {
      setMessage('أدخل كمية أكبر من صفر.');
      return;
    }
    if (!(maxAssemblable > 0)) {
      setMessage('لا توجد مكونات كافية للتجميع — أبلغ مخزن المستلزمات.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      unwrapOrThrow(await createProductionIssueRequest({
        workOrderId: sourceKind === 'work_order' ? sourceId : undefined,
        productionPlanId: sourceKind === 'production_plan' ? sourceId : undefined,
        quantity: qty,
        createdBy: actor,
        createdByUserId: uid || undefined,
      }));
      setMessage('تم إرسال طلب الصرف إلى مخزن المستلزمات.');
      setQuantity('');
      setRequestModalOpen(false);
      await reload();
      window.requestAnimationFrame(() => {
        document.getElementById('production-issue-orders')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إرسال الطلب.');
    } finally {
      setBusy(false);
    }
  };

  const createCompensationRequest = async () => {
    if (!canRequest) return;
    if (!compIssueId || !selectedCompLine) {
      setMessage('اختر إذن صرف إنتاج ومكوّناً للتعويض.');
      return;
    }
    const qty = Number(compQty);
    if (!(qty > 0)) {
      setMessage('أدخل كمية تعويض أكبر من صفر.');
      return;
    }
    setCompBusy(true);
    setMessage('');
    try {
      await componentCompensationService.createFromProductionRequest({
        issueOrderId: compIssueId,
        itemType: selectedCompLine.itemType,
        itemId: selectedCompLine.itemId,
        quantity: qty,
        reason: compReason,
        createdBy: actor,
        createdByUserId: uid || undefined,
        note: compNote.trim() || undefined,
      });
      setMessage('تم إرسال طلب الصرف التعويضي للمستلزم — ينتظر الاعتماد قبل الخصم.');
      resetCompensationForm();
      setCompensationModalOpen(false);
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر إرسال طلب التعويض.');
    } finally {
      setCompBusy(false);
    }
  };

  const sourceSummary = useMemo(() => {
    if (!sourceId) return null;
    const related = orders.filter((row) =>
      sourceKind === 'work_order'
        ? row.workOrderId === sourceId
        : row.productionPlanId === sourceId,
    );
    return summarizeOrdersForSource(related);
  }, [orders, sourceId, sourceKind]);

  if (!canRequest && !can('inventory.view') && !canCreatePlan) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية طلب صرف الإنتاج.</p>;
  }

  const planProductName = productNameById.get(planProductId) || planProductId;

  return (
    <ModuleOpsPageShell
      eyebrow="طلبات صرف الإنتاج"
      rangeLabel="تحليل الجاهزية والمكونات الناقصة، ثم طلب الصرف والتعويض من المودال"
      onRefresh={() => {
        invalidatePageDataCache(ISSUE_REQUESTS_CACHE_KEY);
        void reload();
      }}
      refreshing={loading}
      actions={(
        <div className="flex flex-wrap gap-2">
          {canRequest && (
            <>
              <PrimaryButton iconName="precision_manufacturing" tone="edit" onClick={openBlankRequestModal}>طلب صرف</PrimaryButton>
              <GhostButton iconName="replay" tone="undo" onClick={openCompensationModal}>طلب تعويضي</GhostButton>
            </>
          )}
          <GhostButton
            iconName="print"
            tone="print"
            disabled={loading || shortageReportSections.length === 0}
            onClick={() => void printShortageReport(
              shortageReportSections,
              'كل المنتجات ذات النقص مقابل الخطط المفتوحة',
            )}
          >
            طباعة تقرير الناقص
          </GhostButton>
        </div>
      )}
    >
      {message && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">
          {message}
        </p>
      )}

      <OpsDashPanel
        title="المتاح للتجميع من مخزن المستلزمات"
        accent="production"
        bodyClassName="p-0"
        action={(
          <p className="text-xs text-[var(--color-text-muted)]">
            منتجات يمكن تجميعها بالمكونات الحالية. اضغط السهم لعرض المكونات وحدودها. لو مفيش خطة مفتوحة — أنشئ خطة ثم اطلب الصرف.
          </p>
        )}
      >
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th w-10" />
                  <th className="erp-th text-start">المنتج</th>
                  <th className="erp-th text-center">متاح للتجميع</th>
                  <th className="erp-th text-start">عنق الزجاجة</th>
                  <th className="erp-th text-center">خطة مفتوحة</th>
                  <th className="erp-th text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">جاري التحميل…</td>
                  </tr>
                ) : assemblableRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      لا يوجد متاح للتجميع حالياً — راجع أرصدة المستلزمات.
                    </td>
                  </tr>
                ) : (
                  assemblableRows.map((row) => {
                    const openPlan = openPlanByProductId.get(row.productId);
                    const rem = openPlan ? planRemaining(openPlan) : 0;
                    const expanded = expandedProductId === row.productId;
                    const bn = row.bottleneck;
                    const targetForMissing = rem > 0 ? rem : Number(row.maxAssemblable || 0) + 1;
                    const missingForPlan = rem > Number(row.maxAssemblable || 0)
                      ? missingComponentsForTarget(row, rem)
                      : [];
                    return (
                      <React.Fragment key={row.productId}>
                        <tr className="border-b border-[var(--color-border)]">
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                              aria-label={expanded ? 'إخفاء المكونات' : 'عرض المكونات'}
                              onClick={() =>
                                setExpandedProductId((prev) => (prev === row.productId ? null : row.productId))
                              }
                            >
                              <span className="material-icons-round text-[20px]">
                                {expanded ? 'expand_less' : 'expand_more'}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <p className="font-medium">{row.productName}</p>
                            <p className="text-xs text-[var(--color-text-muted)] font-mono">{row.productCode || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold tabular-nums text-[rgb(var(--color-success))]">
                            {formatNumber(row.maxAssemblable)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {bn ? (
                              <>
                                <p className="font-medium text-[rgb(var(--color-warning))]">{bn.materialName}</p>
                                <p className="text-xs text-[var(--color-text-muted)] font-mono">{bn.materialCode || '—'}</p>
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {openPlan ? (
                              <span className="text-[var(--color-text)]">متبقي {formatNumber(rem)}</span>
                            ) : (
                              <span className="text-[rgb(var(--color-warning))] font-semibold">لا توجد خطة</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-wrap justify-center gap-2">
                              {openPlan?.id ? (
                                canRequest ? (
                                  <PrimaryButton
                                    iconName="precision_manufacturing"
                                    tone="edit"
                                    onClick={() => openRequestModalForPlan(openPlan.id!, Number(row.maxAssemblable || 0))}
                                  >
                                    طلب صرف
                                  </PrimaryButton>
                                ) : (
                                  <span className="text-xs text-[var(--color-text-muted)]">يلزم صلاحية طلب الصرف</span>
                                )
                              ) : canCreatePlan ? (
                                <PrimaryButton iconName="add_circle" tone="submit" onClick={() => openCreatePlan(row)}>
                                  إنشاء خطة
                                </PrimaryButton>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)]">يلزم صلاحية إنشاء خطة</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-[var(--color-bg)]">
                                      <th className="px-3 py-2 text-start font-medium">المكوّن</th>
                                      <th className="px-3 py-2 text-center font-medium">مطلوب/وحدة</th>
                                      <th className="px-3 py-2 text-center font-medium">متاح</th>
                                      <th className="px-3 py-2 text-center font-medium">حد التجميع</th>
                                      {rem > 0 && (
                                        <th className="px-3 py-2 text-center font-medium text-[rgb(var(--color-danger))]">
                                          ناقص لكمية الخطة
                                        </th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.components.map((component) => {
                                      const isBottleneck = bn?.materialId === component.materialId;
                                      const shortage = rem > 0
                                        ? componentShortageQtyForTarget(component, rem)
                                        : 0;
                                      return (
                                        <tr
                                          key={`${row.productId}-${component.materialId}`}
                                          className={
                                            shortage > 0
                                              ? 'bg-[rgb(var(--color-danger)/0.1)]/70'
                                              : isBottleneck
                                                ? 'bg-[rgb(var(--color-warning)/0.1)]/80'
                                                : ''
                                          }
                                        >
                                          <td className="px-3 py-2">
                                            <span className="font-medium">{component.materialName}</span>
                                            {isBottleneck && (
                                              <StatusBadge label="عنق زجاجي" type="warning" className="ms-2" />
                                            )}
                                            {shortage > 0 && (
                                              <StatusBadge label="ناقص" type="danger" className="ms-2" />
                                            )}
                                            <p className="text-xs text-[var(--color-text-muted)] font-mono">{component.materialCode || '—'}</p>
                                          </td>
                                          <td className="px-3 py-2 text-center tabular-nums">
                                            {formatNumber(component.requiredPerUnit)}
                                          </td>
                                          <td className="px-3 py-2 text-center tabular-nums">
                                            {formatNumber(component.availableQty)}
                                          </td>
                                          <td className="px-3 py-2 text-center font-bold tabular-nums">
                                            {formatNumber(component.maxAssemblable)}
                                          </td>
                                          {rem > 0 && (
                                            <td className="px-3 py-2 text-center font-bold tabular-nums text-[rgb(var(--color-danger))]">
                                              {shortage > 0 ? formatNumber(shortage) : '—'}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {missingForPlan.length > 0 && (
                                <p className="mt-2 text-xs font-semibold text-[rgb(var(--color-danger))]">
                                  لتغطية متبقي الخطة ({formatNumber(rem)}) ينقص {missingForPlan.length} مكوّن
                                  — أبرزها: {missingForPlan[0].materialName} ({formatNumber(missingForPlan[0].shortageQty)}).
                                </p>
                              )}
                              {!(rem > 0) && targetForMissing && (
                                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                                  المكوّن عنق الزجاجة يحدد أقصى كمية يمكن صرفها الآن.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
      </OpsDashPanel>

      {(noComponentAlerts.length > 0 || partialCoverageAlerts.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {noComponentAlerts.length > 0 && (
            <OpsDashPanel
              title="خطط مفتوحة بدون مكونات — الناقص"
              accent="production"
              className="border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/60 shadow-none h-full min-w-0"
              action={(
                <div className="flex flex-wrap items-start justify-between gap-2 w-full">
                  <p className="text-xs text-[rgb(var(--color-danger))]">
                    المتاح للتجميع = 0. اعرض المكونات الناقصة أو اطبع تقريراً للمستلزم.
                  </p>
                  <GhostButton
                    iconName="print"
                    tone="print"
                    onClick={() => void printShortageReport(
                      shortageReportSections.filter((row) => row.kind === 'none'),
                      'خطط مفتوحة بدون مكونات (متاح تجميع = 0)',
                    )}
                  >
                    طباعة هذا القسم
                  </GhostButton>
                </div>
              )}
            >
                {noComponentAlerts.slice(0, 12).map((row) => {
                  const expanded = expandedShortageProductId === row.productId;
                  const missing = missingComponentsForTarget(row.capacity, row.remaining);
                  const section = shortageReportSections.find(
                    (item) => item.productId === row.productId && item.kind === 'none',
                  );
                  return (
                    <div key={row.productId} className="rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[var(--color-card)] overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-medium text-[var(--color-text)]">{row.productName}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[rgb(var(--color-danger))] tabular-nums">
                            متبقي خطط {formatNumber(row.remaining)} · متاح تجميع 0
                          </span>
                          <GhostButton
                            iconName={expanded ? 'visibility_off' : 'visibility'}
                            tone="view"
                            onClick={() =>
                              setExpandedShortageProductId((prev) => (prev === row.productId ? null : row.productId))
                            }
                          >
                            {expanded ? 'إخفاء الناقص' : 'عرض الناقص'}
                          </GhostButton>
                          {section && section.lines.length > 0 && (
                            <GhostButton
                              iconName="print"
                              tone="print"
                              onClick={() => void printShortageReport(
                                [section],
                                `ناقص المنتج: ${row.productName}`,
                              )}
                            >
                              طباعة
                            </GhostButton>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-[rgb(var(--color-danger)/0.25)] px-3 py-2">
                          {missing.length === 0 ? (
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {row.capacity
                                ? 'لا توجد تفاصيل مكوّنات — راجع تعريف BOM للمنتج.'
                                : 'لا توجد بيانات تجميع لهذا المنتج — تأكد من BOM والأرصدة.'}
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-xs text-[var(--color-text-muted)]">
                                    <th className="py-1 text-start font-medium">المكوّن</th>
                                    <th className="py-1 text-center font-medium">مطلوب للخطة</th>
                                    <th className="py-1 text-center font-medium">متاح</th>
                                    <th className="py-1 text-center font-medium text-[rgb(var(--color-danger))]">ناقص</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {missing.map((component) => (
                                    <tr key={component.materialId} className="border-b border-[rgb(var(--color-danger)/0.1)]">
                                      <td className="py-1.5">
                                        <span className="font-medium">{component.materialName}</span>
                                        <p className="text-xs text-[var(--color-text-muted)] font-mono">{component.materialCode || '—'}</p>
                                      </td>
                                      <td className="py-1.5 text-center tabular-nums">{formatNumber(component.requiredForTarget)}</td>
                                      <td className="py-1.5 text-center tabular-nums">{formatNumber(component.availableQty)}</td>
                                      <td className="py-1.5 text-center font-bold tabular-nums text-[rgb(var(--color-danger))]">
                                        {formatNumber(component.shortageQty)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </OpsDashPanel>
          )}

          {partialCoverageAlerts.length > 0 && (
            <OpsDashPanel
              title="تغطية جزئية — مكونات ناقصة لباقي الخطة"
              accent="production"
              className="border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/50 shadow-none h-full min-w-0"
              action={(
                <div className="flex flex-wrap items-start justify-between gap-2 w-full">
                  <p className="text-xs text-[rgb(var(--color-warning))]">
                    فيه متاح للتجميع، لكنه أقل من متبقي الخطة. تقدر تطلب المتاح، والناقص يظهر بالتفصيل أو يُطبع.
                  </p>
                  <GhostButton
                    iconName="print"
                    tone="print"
                    onClick={() => void printShortageReport(
                      shortageReportSections.filter((row) => row.kind === 'partial'),
                      'تغطية جزئية — مكونات ناقصة لباقي الخطط',
                    )}
                  >
                    طباعة هذا القسم
                  </GhostButton>
                </div>
              )}
            >
                {partialCoverageAlerts.slice(0, 12).map((row) => {
                  const expanded = expandedShortageProductId === `partial:${row.productId}`;
                  const missing = missingComponentsForTarget(row.capacity, row.remaining);
                  const section = shortageReportSections.find(
                    (item) => item.productId === row.productId && item.kind === 'partial',
                  );
                  return (
                    <div key={row.productId} className="rounded-lg border border-[rgb(var(--color-warning)/0.25)] bg-[var(--color-card)] overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-medium text-[var(--color-text)]">{row.productName}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[rgb(var(--color-warning))] tabular-nums">
                            متاح {formatNumber(row.maxAssemblable)} / متبقي {formatNumber(row.remaining)}
                          </span>
                          <GhostButton
                            iconName={expanded ? 'visibility_off' : 'visibility'}
                            tone="view"
                            onClick={() =>
                              setExpandedShortageProductId((prev) =>
                                prev === `partial:${row.productId}` ? null : `partial:${row.productId}`,
                              )
                            }
                          >
                            {expanded ? 'إخفاء الناقص' : 'عرض الناقص'}
                          </GhostButton>
                          {section && section.lines.length > 0 && (
                            <GhostButton
                              iconName="print"
                              tone="print"
                              onClick={() => void printShortageReport(
                                [section],
                                `ناقص المنتج: ${row.productName}`,
                              )}
                            >
                              طباعة
                            </GhostButton>
                          )}
                        </div>
                      </div>
                      {expanded && missing.length > 0 && (
                        <div className="border-t border-[rgb(var(--color-warning)/0.25)] px-3 py-2 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                                <th className="py-1 text-start font-medium">المكوّن</th>
                                <th className="py-1 text-center font-medium">مطلوب للخطة</th>
                                <th className="py-1 text-center font-medium">متاح</th>
                                <th className="py-1 text-center font-medium text-[rgb(var(--color-danger))]">ناقص</th>
                              </tr>
                            </thead>
                            <tbody>
                              {missing.map((component) => (
                                <tr key={component.materialId} className="border-b border-[rgb(var(--color-warning)/0.1)]">
                                  <td className="py-1.5">
                                    <span className="font-medium">{component.materialName}</span>
                                    <p className="text-xs text-[var(--color-text-muted)] font-mono">{component.materialCode || '—'}</p>
                                  </td>
                                  <td className="py-1.5 text-center tabular-nums">{formatNumber(component.requiredForTarget)}</td>
                                  <td className="py-1.5 text-center tabular-nums">{formatNumber(component.availableQty)}</td>
                                  <td className="py-1.5 text-center font-bold tabular-nums text-[rgb(var(--color-danger))]">
                                    {formatNumber(component.shortageQty)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </OpsDashPanel>
          )}
        </div>
      )}

      {productionCompensations.length > 0 && (
        <OpsDashPanel title="طلبات الصرف التعويضي" accent="production" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th text-start">المرجع</th>
                    <th className="erp-th text-start">إذن الصرف</th>
                    <th className="erp-th text-start">المكوّن</th>
                    <th className="erp-th text-center">الكمية</th>
                    <th className="erp-th text-center">السبب</th>
                    <th className="erp-th text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {productionCompensations.slice(0, 40).map((row) => {
                    const meta = compensationStatusMeta(row.status);
                    return (
                      <tr key={row.id} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3 text-sm font-bold">{row.referenceNo}</td>
                        <td className="px-4 py-3 text-sm font-mono text-xs">
                          {row.issueReferenceNo || row.issueOrderId}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <p className="font-medium">{row.line?.itemName}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{row.line?.itemCode || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-sm">{formatNumber(row.quantity)}</td>
                        <td className="px-4 py-3 text-center text-sm">
                          {COMP_REASON_LABELS[row.reason] || row.reason}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge label={meta.label} type={meta.type} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </OpsDashPanel>
      )}

      <div id="production-issue-orders" className="scroll-mt-24">
      <OpsDashPanel title="سجل الطلبات والمصروف" accent="production" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-start">المرجع</th>
                  <th className="erp-th text-start">المنتج</th>
                  <th className="erp-th text-center">مطلوب</th>
                  <th className="erp-th text-center">مصروف</th>
                  <th className="erp-th text-center">متبقي طلب</th>
                  <th className="erp-th text-center">متاح عند الطلب</th>
                  <th className="erp-th text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">جاري التحميل…</td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد طلبات بعد.</td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const meta = statusMeta(order.status);
                    const requested = Number(order.requestedQuantity ?? order.quantity ?? 0);
                    const issued = order.status === 'issued' ? Number(order.quantity || 0) : 0;
                    const remaining = requestRemainingQty(order);
                    return (
                      <tr key={order.id} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3 text-sm font-bold">{order.referenceNo}</td>
                        <td className="px-4 py-3 text-sm">
                          <p className="font-medium">{order.productName}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{order.productCode || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-sm">{formatNumber(requested)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-sm">{formatNumber(issued)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-sm">{formatNumber(remaining)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-sm">
                          {order.assemblableAtRequest != null ? formatNumber(order.assemblableAtRequest) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge label={meta.label} type={meta.type} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
      </OpsDashPanel>
      </div>

      <Dialog open={planModalOpen} onOpenChange={setPlanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>إنشاء خطة على المتاح للتجميع</DialogTitle>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[var(--color-text-muted)]">
              المنتج: <span className="font-bold text-[var(--color-text)]">{planProductName}</span>
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">كمية الخطة</span>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                value={planQuantity}
                onChange={(e) => setPlanQuantity(e.target.value)}
              />
              <span className="text-[11px] text-[var(--color-text-muted)]">مقترح حسب المتاح للتجميع — عدّلها إن لزم.</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton iconName="close" tone="neutral" onClick={() => setPlanModalOpen(false)} disabled={planSaving}>إلغاء</GhostButton>
            <PrimaryButton iconName="add_circle" tone="submit" disabled={planSaving || !planProductId} onClick={() => void savePlan()}>
              {planSaving ? 'جاري الحفظ…' : 'إنشاء الخطة'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>إرسال طلب صرف للمستلزم</DialogTitle>
          <div className="space-y-3 py-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              اختر الخطة أو أمر الشغل، راجع الكمية المقترحة، ثم أرسل الطلب لمخزن المستلزمات.
            </p>
            {message && requestModalOpen && (
              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary">
                {message}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">نوع المصدر</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={sourceKind}
                  onChange={(e) => {
                    setSourceKind(e.target.value as typeof sourceKind);
                    setSourceId('');
                    setQuantity('');
                  }}
                >
                  <option value="production_plan">خطة إنتاج</option>
                  <option value="work_order">أمر شغل</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">المصدر</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={sourceId}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    setQuantity('');
                  }}
                >
                  <option value="">اختر…</option>
                  {sourceKind === 'production_plan'
                    ? openPlans.map((plan) => {
                      const remaining = planRemaining(plan);
                      const name = productNameById.get(plan.productId) || plan.productId;
                      return (
                        <option key={plan.id} value={plan.id}>
                          {name} — متبقي {remaining}
                        </option>
                      );
                    })
                    : openWorkOrders.map((wo) => {
                      const name = productNameById.get(wo.productId) || wo.productId;
                      return (
                        <option key={wo.id} value={wo.id || ''}>
                          {wo.workOrderNumber} — {name} — كمية {wo.quantity}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">كمية الطلب</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={!(maxAssemblable > 0)}
                />
              </label>
            </div>
            {sourceId && (
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                متبقي المصدر: {formatNumber(sourceRemaining)}
                {' · '}
                متاح للتجميع: {formatNumber(maxAssemblable)}
                {suggestedQty > 0 ? ` · مقترح: ${formatNumber(suggestedQty)}` : ''}
                {maxAssemblable <= 0 ? ' — لا يمكن الطلب حتى يتوفر رصيد مكونات.' : ''}
              </p>
            )}
            {sourceSummary && (
              <p className="text-xs text-[var(--color-text-muted)]">
                لهذا المصدر — مصروف: {formatNumber(sourceSummary.issuedQty)}
                {' · '}
                طلبات معلّقة: {formatNumber(sourceSummary.openRequestedQty)}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <GhostButton iconName="close" tone="neutral" onClick={() => setRequestModalOpen(false)} disabled={busy}>إلغاء</GhostButton>
            <PrimaryButton
              iconName="send"
              tone="submit"
              disabled={busy || !sourceId || !(maxAssemblable > 0)}
              onClick={() => void createRequest()}
            >
              {busy ? 'جاري الإرسال…' : 'إرسال للمستلزم'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compensationModalOpen} onOpenChange={setCompensationModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>طلب صرف تعويضي</DialogTitle>
          <div className="space-y-3 py-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              اختر إذن صرف تم ترحيله، وحدد المكوّن والكمية. الطلب يروح للمستلزم للاعتماد قبل أي خصم مخزون.
            </p>
            {message && compensationModalOpen && (
              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary">
                {message}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">إذن الصرف المصروف</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={compIssueId}
                  onChange={(e) => {
                    setCompIssueId(e.target.value);
                    setCompLineKey('');
                    setCompQty('');
                  }}
                >
                  <option value="">اختر إذن صرف…</option>
                  {issuedOrders.map((order) => (
                    <option key={order.id} value={order.id || ''}>
                      {order.referenceNo} — {order.productName} — كمية {formatNumber(order.quantity)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">المكوّن</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={compLineKey}
                  disabled={!selectedCompOrder}
                  onChange={(e) => setCompLineKey(e.target.value)}
                >
                  <option value="">اختر مكوّناً…</option>
                  {(selectedCompOrder?.lines || []).map((line) => (
                    <option key={`${line.itemType}:${line.itemId}`} value={`${line.itemType}:${line.itemId}`}>
                      {line.itemName} — مصروف {formatNumber(line.issuedQty)} / تعويض {formatNumber(line.compensatedQty)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">سبب التعويض</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={compReason}
                  onChange={(e) => setCompReason(e.target.value as ComponentCompensationReason)}
                >
                  {(Object.keys(COMP_REASON_LABELS) as ComponentCompensationReason[]).map((key) => (
                    <option key={key} value={key}>{COMP_REASON_LABELS[key]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">كمية التعويض</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
                  value={compQty}
                  onChange={(e) => setCompQty(e.target.value)}
                  disabled={!selectedCompLine}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">ملاحظة (اختياري)</span>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={compNote}
                onChange={(e) => setCompNote(e.target.value)}
                placeholder="مثال: هالك خط / نقص في التجميع"
              />
            </label>
            {selectedCompLine && (
              <p className="text-xs text-[var(--color-text-muted)]">
                مصروف أصلي: {formatNumber(selectedCompLine.issuedQty)}
                {' · '}
                تعويض سابق: {formatNumber(selectedCompLine.compensatedQty)}
                {' · '}
                الوحدة: {selectedCompLine.unit || '—'}
              </p>
            )}
            {issuedOrders.length === 0 && (
              <p className="text-xs text-[rgb(var(--color-warning))]">لا يوجد إذن صرف مُرحّل بعد لطلب التعويض عليه.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <GhostButton iconName="close" tone="neutral" onClick={() => setCompensationModalOpen(false)} disabled={compBusy}>إلغاء</GhostButton>
            <PrimaryButton
              iconName="send"
              tone="submit"
              disabled={compBusy || !compIssueId || !selectedCompLine}
              onClick={() => void createCompensationRequest()}
            >
              {compBusy ? 'جاري الإرسال…' : 'إرسال طلب تعويض للمستلزم'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '210mm',
          maxWidth: 'none',
          overflow: 'hidden',
          pointerEvents: 'none',
          direction: 'rtl',
          zIndex: -1,
        }}
        aria-hidden
      >
        <MissingComponentsReportPrint
          ref={shortagePrintRef}
          sections={printSections}
          subtitle={printSubtitle}
          warehouseName={suppliesWarehouseName || undefined}
          printSettings={printTemplate}
        />
      </div>
    </ModuleOpsPageShell>
  );
};
