import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';

import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '../../components/UI';
import { toast } from '../../../../components/Toast';
import { useGlobalModalManager } from '../../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../../components/modal-manager/modalKeys';
import { isConfigured } from '../../../auth/services/firebase';
import { useAppStore, useShallowStore } from '../../../../store/useAppStore';
import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { addDaysToDate, formatNumber, getTodayDateString } from '../../../../utils/calculations';
import {
  deriveWorkOrderStatusFromProduced,
  getWorkOrderStatusDetail,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_SORT_RANK,
} from '../../utils/workOrderReportLinking';
import { estimateReportCost } from '../../../../utils/costCalculations';
import { exportWorkOrders, type WorkOrderExportRow } from '../../../../utils/exportExcel';
import { commitAndPrint, useManagedPrint } from '../../../../utils/printManager';
import { usePermission } from '../../../../utils/permissions';
import { reportService } from '../../services/reportService';
import {
  reopenCompletedWorkOrder,
} from '../../usecases/updateWorkOrderStatus';
import { unwrapOrThrow } from '@/shared/usecases';
import { sumQuantityProducedForWorkOrderExcludingPackaging } from '../../utils/packagingLine';
import { WorkOrderPrint } from '../../components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../../components/ProductionReportPrint';
import { PrintOffscreenHost } from '@/src/components/erp/PrintOffscreenHost';
import { WorkOrderDrawer } from './WorkOrderDrawer';
import { WorkOrderFilters } from './WorkOrderFilters';
import { WorkOrdersTable } from './WorkOrdersTable';
import { useWorkOrderFilters } from './hooks/useWorkOrderFilters';
import { useWorkOrdersRealtime } from './hooks/useWorkOrdersRealtime';
import { useWorkOrderStore } from './store/workOrderStore';
import type { WorkOrderRowView } from './WorkOrderRow';
import styles from './WorkOrders.module.css';
import {
  loadReportsComponentLabelOptions,
  type InjectionComponentOption,
} from '../../utils/injectionComponentOptions';
import { resolveWorkOrderReportType } from '../../utils/reportTypes';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  PRODUCTION_REPORT_OPERATION_KEYS,
  PRODUCTION_REPORT_RECONCILE_PATHS,
  WORK_ORDER_CREATE_PATHS,
  WORK_ORDER_OPERATION_KEYS,
  WORK_ORDER_UPDATE_PATHS,
  isOperationPathEnabled,
} from '@/modules/system/lib/operationPathSettings';

const dayDiff = (value: string): number => {
  const target = new Date(value);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const normalizeDateRange = (dateRange: { from: string; to: string } | null) => {
  if (!dateRange) return null;
  if (!dateRange.from && !dateRange.to) return null;
  return dateRange;
};

function buildWorkOrderPrintData(
  order: WorkOrder,
  names: { productName: string; lineName: string; supervisorName: string },
): WorkOrderPrintData {
  return {
    workOrderNumber: order.workOrderNumber,
    productName: names.productName || '—',
    lineName: names.lineName || '—',
    supervisorName: names.supervisorName || '—',
    quantity: Number(order.quantity || 0),
    producedQuantity: Number(order.producedQuantity || 0),
    maxWorkers: Number(order.maxWorkers || 0),
    targetDate: String(order.targetDate || '—'),
    status: order.status,
    statusLabel: WORK_ORDER_STATUS_LABELS[order.status] || order.status,
    estimatedCost: Number(order.estimatedCost || 0),
    actualCost: Number(order.actualCost || 0),
    notes: String(order.notes || ''),
    showCosts: true,
  };
}

interface WorkOrderReportMeta {
  count: number;
  firstReportDate: string | null;
  lastProducingReportDate: string | null;
  producedQuantity: number;
}

const resolveEstimatedDays = (order: WorkOrder, avgDaily: number): number => {
  const explicit = Number((order as any).estimatedDays ?? (order as any).estimatedDurationDays ?? 0);
  if (explicit > 0) return Math.ceil(explicit);
  if (avgDaily <= 0) return 0;
  return Math.ceil(Math.max(Number(order.quantity || 0), 0) / avgDaily);
};

export const WorkOrders: React.FC = () => {
  const navigate = useTenantNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const { _rawProducts, _rawLines, _rawEmployees, laborSettings, costCenters, costCenterValues, costAllocations } = useShallowStore((s) => ({
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    laborSettings: s.laborSettings,
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
  }));
  const systemSettings = useAppStore((s) => s.systemSettings);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const deleteWorkOrder = useAppStore((s) => s.deleteWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const reconcileWorkOrderFromReports = useAppStore((s) => s.reconcileWorkOrderFromReports);
  const fetchProducts = useAppStore((s) => s.fetchProducts);
  const fetchLines = useAppStore((s) => s.fetchLines);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);

  useEffect(() => {
    void Promise.all([fetchProducts(), fetchLines(), fetchEmployees()]).catch(() => undefined);
  }, [fetchEmployees, fetchLines, fetchProducts]);
  const workOrderReconcileEnabled = isOperationPathEnabled(
    systemSettings,
    PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
    PRODUCTION_REPORT_RECONCILE_PATHS.workOrdersPage,
  );

  const loggedInSupervisor = useMemo(() => {
    if (currentEmployee?.id) return currentEmployee;
    if (!uid) return null;
    return _rawEmployees.find((employee) => employee.userId === uid) ?? null;
  }, [currentEmployee, _rawEmployees, uid]);

  const scopedSupervisorId = useMemo(() => {
    const roleName = String(userRoleName || '').trim();
    const isSupervisorRole = roleName.includes('مشرف') || loggedInSupervisor?.level === 2;
    if (!isSupervisorRole || !loggedInSupervisor?.id) return null;
    return loggedInSupervisor.id;
  }, [userRoleName, loggedInSupervisor]);

  const initialWorkOrderTypeParam = String(
    searchParams.get('workOrderType') || searchParams.get('planType') || '',
  ).trim();
  const { filters, setFilter, clearFilters } = useWorkOrderFilters({
    workOrderType: initialWorkOrderTypeParam === 'component_injection' || initialWorkOrderTypeParam === 'all'
      ? initialWorkOrderTypeParam
      : 'finished_product',
  });
  const debouncedWorkOrderSearch = useDebouncedValue(filters.search, 350);
  const realtimeStatus = filters.status === 'completed' || filters.status === 'cancelled'
    ? filters.status
    : 'all';
  const { orders: liveOrders, loading, loadingMore, hasMore, hasPrevious, page, error, loadMore, loadPrevious } = useWorkOrdersRealtime({
    status: realtimeStatus,
    lineId: filters.lineId,
    supervisorId: scopedSupervisorId,
    dateRange: normalizeDateRange(filters.dateRange),
    search: debouncedWorkOrderSearch,
  });

  const setOrders = useWorkOrderStore((s) => s.setOrders);
  const updateOrder = useWorkOrderStore((s) => s.updateOrder);
  const setSelectedOrder = useWorkOrderStore((s) => s.setSelectedOrder);
  const orderMap = useWorkOrderStore((s) => s.orders);
  const [componentLabelOptions, setComponentLabelOptions] = useState<InjectionComponentOption[]>([]);

  useEffect(() => {
    let mounted = true;
    loadReportsComponentLabelOptions()
      .then((rows) => {
        if (mounted) setComponentLabelOptions(rows);
      })
      .catch(() => {
        if (mounted) setComponentLabelOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const selectedOrderId = useWorkOrderStore((s) => s.selectedOrderId);

  const [syncingStatus, setSyncingStatus] = useState<string | null>(null);
  const [reconcilingOrderId, setReconcilingOrderId] = useState<string | null>(null);
  const [reportMetaByOrderId, setReportMetaByOrderId] = useState<Record<string, WorkOrderReportMeta>>({});
  const [printData, setPrintData] = useState<WorkOrderPrintData | null>(null);
  const woPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: woPrintRef,
    printSettings: printTemplate,
    documentTitle: 'أمر شغل',
  });
  const canCreateWorkOrderPermission = can('workOrders.create') || can('workOrders.componentInjection.manage');
  const canCreateWorkOrder = canCreateWorkOrderPermission && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.create,
    WORK_ORDER_CREATE_PATHS.workOrdersPage,
  );
  const canCreateWorkOrderFromPlan = canCreateWorkOrderPermission && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.create,
    WORK_ORDER_CREATE_PATHS.productionPlan,
  );
  const canUpdateWorkOrderStatus = can('workOrders.edit') && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.workOrdersPageStatus,
  );
  const canEditWorkOrderInModal = can('workOrders.edit') && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.workOrderModal,
  );
  const canUseWorkOrderScanner = can('workOrders.edit') && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.scanner,
  );
  const canDeleteWorkOrder = can('workOrders.delete');
  const openedCreateFromParamsRef = useRef(false);

  useEffect(() => {
    if (!canCreateWorkOrderFromPlan || openedCreateFromParamsRef.current) return;
    const planId = searchParams.get('planId')?.trim() || '';
    const productId = searchParams.get('productId')?.trim() || '';
    if (!planId && !productId) return;
    openedCreateFromParamsRef.current = true;
    openModal(MODAL_KEYS.WORK_ORDERS_CREATE, {
      source: 'workOrders.queryParams',
      planId,
      productId,
    });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('planId');
      next.delete('productId');
      return next;
    }, { replace: true });
  }, [canCreateWorkOrderFromPlan, openModal, searchParams, setSearchParams]);

  useEffect(() => {
    setOrders(liveOrders);
  }, [liveOrders, setOrders]);

  const productNameMap = useMemo(() => {
    const map = new Map(_rawProducts.map((p) => [p.id || '', p.name]));
    componentLabelOptions.forEach((row) => {
      if (row.id && !map.has(row.id)) map.set(row.id, row.name);
    });
    return map;
  }, [_rawProducts, componentLabelOptions]);

  const lineNameMap = useMemo(() => {
    return new Map(_rawLines.map((line) => [line.id || '', line.name]));
  }, [_rawLines]);

  const productAvgDailyMap = useMemo(() => {
    return new Map(
      _rawProducts.map((p) => [p.id || '', Math.max(0, Number((p as any).avgDailyProduction || 0))]),
    );
  }, [_rawProducts]);

  const supervisorNameMap = useMemo(() => {
    return new Map(_rawEmployees.map((employee) => [employee.id || '', employee.name]));
  }, [_rawEmployees]);

  const allOrders = useMemo(() => {
    return Object.values(orderMap).sort((a, b) => {
      const aAt = (a.createdAt as any)?.seconds || 0;
      const bAt = (b.createdAt as any)?.seconds || 0;
      return bAt - aAt;
    });
  }, [orderMap]);

  const orderIds = useMemo(
    () => allOrders.map((order) => order.id).filter((id): id is string => Boolean(id)),
    [allOrders],
  );

  const orderIdsKey = useMemo(() => orderIds.join('|'), [orderIds]);

  useEffect(() => {
    let cancelled = false;
    if (orderIds.length === 0) {
      setReportMetaByOrderId({});
      return () => {
        cancelled = true;
      };
    }

    const loadReportMeta = async () => {
      const entries = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const reports = await reportService.getByWorkOrderId(id);
            const producingDates = reports
              .filter((report) => Number(report.quantityProduced || 0) > 0)
              .map((report) => String(report.date || '').trim().slice(0, 10))
              .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
              .sort((a, b) => a.localeCompare(b));
            const firstReportDate = producingDates[0] || reports.reduce<string | null>((minDate, report) => {
              const date = String(report.date || '').trim().slice(0, 10);
              if (!date) return minDate;
              if (!minDate || date < minDate) return date;
              return minDate;
            }, null);
            const lastProducingReportDate = producingDates[producingDates.length - 1] || null;
            const producedQuantity = sumQuantityProducedForWorkOrderExcludingPackaging(reports, _rawLines);
            return [id, { count: reports.length, firstReportDate, lastProducingReportDate, producedQuantity }] as const;
          } catch (error) {
            console.error('work order report meta error', error);
            return [id, { count: -1, firstReportDate: null, lastProducingReportDate: null, producedQuantity: 0 }] as const;
          }
        }),
      );
      if (cancelled) return;
      setReportMetaByOrderId(Object.fromEntries(entries));
    };

    void loadReportMeta();
    return () => {
      cancelled = true;
    };
  }, [orderIds, orderIdsKey, _rawLines]);

  const searchedOrders = useMemo(() => {
    const byType = filters.workOrderType === 'all'
      ? allOrders
      : allOrders.filter(
        (order) => resolveWorkOrderReportType(order.workOrderType) === filters.workOrderType,
      );
    const search = filters.search.trim().toLowerCase();
    if (!search) return byType;
    return byType.filter((order) => {
      const productName = productNameMap.get(order.productId || '') || '';
      return (
        order.workOrderNumber.toLowerCase().includes(search) ||
        productName.toLowerCase().includes(search)
      );
    });
  }, [allOrders, filters.search, filters.workOrderType, productNameMap]);

  const rowViews = useMemo<WorkOrderRowView[]>(() => {
    return searchedOrders.map((order) => {
      const orderId = order.id || '';
      const reportMeta = orderId ? reportMetaByOrderId[orderId] : undefined;
      const reportCount = reportMeta && reportMeta.count >= 0 ? reportMeta.count : 0;
      const firstReportDate = reportMeta?.firstReportDate || '';
      const productName = productNameMap.get(order.productId || '') || '—';
      const lineName = lineNameMap.get(order.lineId || '') || '—';
      const dailyAverage = Number(productAvgDailyMap.get(order.productId || '') || 0);
      const estimatedDays = resolveEstimatedDays(order, dailyAverage);
      const plannedStartDate = String(order.startDate || '').trim();
      const executionStartDate = firstReportDate || plannedStartDate;
      const expectedEndByFirstReport = executionStartDate && estimatedDays > 0
        ? addDaysToDate(executionStartDate, estimatedDays)
        : '';
      const expectedEnd = String(expectedEndByFirstReport || (order as any).expectedEnd || order.targetDate || '');
      const deviationPct = Number((order as any).executionDeviationPct ?? 0);
      const supervisorName = supervisorNameMap.get(order.supervisorId || '') || '—';
      const quantity = Number(order.quantity || 0);
      const producedFromOrder = Number(order.producedQuantity || 0);
      const producedFromScans = Number(order.actualProducedFromScans || order.scanSummary?.completedUnits || 0);
      const producedFromReports = Number(reportMeta?.producedQuantity || 0);
      const produced = Math.max(producedFromOrder, producedFromScans, producedFromReports);
      const effectiveStatus = deriveWorkOrderStatusFromProduced(
        produced,
        quantity,
        order.status,
        reportMeta?.lastProducingReportDate,
        getTodayDateString(),
      );
      const hasExecutionSignal = reportCount > 0 || produced > 0 || Boolean((order as any).startedAt);
      const diff = expectedEnd ? dayDiff(expectedEnd) : 0;
      const isCompleted = effectiveStatus === 'completed';
      const statusDetail = getWorkOrderStatusDetail(effectiveStatus, diff);
      const isDelayTrackable = !isCompleted && ((effectiveStatus === 'in_progress') || hasExecutionSignal);
      const expectedEndTone = isDelayTrackable
        ? (diff < 0 ? 'overdue' : diff <= 3 ? 'near' : 'normal')
        : 'normal';
      const remainingDaysLabel = !expectedEnd
        ? '—'
        : isCompleted
          ? 'مكتمل'
        : !isDelayTrackable
          ? 'لم يبدأ'
          : diff < 0
            ? `متأخر ${Math.abs(diff)} يوم`
            : diff === 0
              ? 'اليوم'
              : `${diff} يوم`;
      const remainingQuantity = Math.max(0, quantity - produced);
      const progressPct = quantity > 0 ? Math.min(100, (produced / quantity) * 100) : 0;
      const lineDailyHours = Number(_rawLines.find((line) => line.id === order.lineId)?.dailyWorkingHours || 0);
      const baseHourlyRate = Number(laborSettings?.hourlyRate || 0);
      const supervisorHourlyRate = Number(
        _rawEmployees.find((employee) => employee.id === order.supervisorId)?.hourlyRate
        || baseHourlyRate
        || 0,
      );
      const dailyTargetQty = estimatedDays > 0
        ? quantity / Math.max(estimatedDays, 1)
        : dailyAverage;
      const reportDateForEstimate = firstReportDate || String(order.targetDate || '');
      const estimatedDailyCost = (
        dailyTargetQty > 0
        && lineDailyHours > 0
        && baseHourlyRate > 0
      )
        ? estimateReportCost(
          Number(order.maxWorkers || 0),
          lineDailyHours,
          dailyTargetQty,
          baseHourlyRate,
          supervisorHourlyRate,
          order.lineId,
          reportDateForEstimate,
          costCenters,
          costCenterValues,
          costAllocations,
        ).totalCost
        : 0;
      const computedEstimatedCost = estimatedDailyCost > 0 && estimatedDays > 0
        ? estimatedDailyCost * estimatedDays
        : 0;
      const resolvedEstimatedCost = computedEstimatedCost > 0
        ? Number(computedEstimatedCost.toFixed(2))
        : Number(order.estimatedCost || 0);
      const costDiff = Number(order.actualCost || 0) - resolvedEstimatedCost;
      const costVariancePct = resolvedEstimatedCost > 0
        ? (costDiff / resolvedEstimatedCost) * 100
        : 0;

      return {
        order: {
          ...order,
          supervisorName,
          status: effectiveStatus,
          producedQuantity: produced,
          estimatedCost: resolvedEstimatedCost,
          startedAt: executionStartDate || undefined,
          expectedEnd,
          dailyAverage,
          estimatedDays,
          reportCount,
        } as WorkOrder,
        productName,
        lineName,
        expectedEndLabel: expectedEnd || '—',
        remainingDaysLabel,
        expectedEndTone,
        deviationPct,
        storedStatus: order.status,
        effectiveStatus,
        statusDetail,
        startDateLabel: executionStartDate || '—',
        estimatedDays,
        dailyAverage,
        reportCount,
        remainingQuantity,
        progressPct,
        costDiff,
        costVariancePct,
      };
    });
  }, [
    searchedOrders,
    reportMetaByOrderId,
    productNameMap,
    lineNameMap,
    productAvgDailyMap,
    supervisorNameMap,
    _rawLines,
    _rawEmployees,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
  ]);

  const selectedRowView = useMemo(
    () => (selectedOrderId ? (rowViews.find((row) => row.order.id === selectedOrderId) ?? null) : null),
    [selectedOrderId, rowViews],
  );

  const visibleRowViews = useMemo(() => {
    const filtered = filters.status === 'all'
      ? rowViews
      : rowViews.filter((row) => row.effectiveStatus === filters.status);
    return [...filtered].sort((a, b) => {
      const statusDiff =
        (WORK_ORDER_STATUS_SORT_RANK[a.effectiveStatus] ?? 99)
        - (WORK_ORDER_STATUS_SORT_RANK[b.effectiveStatus] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      const aAt = (a.order.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      const bAt = (b.order.createdAt as { seconds?: number } | undefined)?.seconds || 0;
      return bAt - aAt;
    });
  }, [filters.status, rowViews]);
  const selectedOrder = selectedRowView?.order ?? null;
  const selectedProductName = selectedRowView?.productName ?? '—';
  const selectedLineName = selectedRowView?.lineName ?? '—';
  const selectedSupervisorName = selectedOrder
    ? (supervisorNameMap.get(selectedOrder.supervisorId || '') || '—')
    : '—';
  const livePrintData = useMemo(() => {
    if (!selectedOrder) return printData;
    return buildWorkOrderPrintData(selectedOrder, {
      productName: selectedProductName,
      lineName: selectedLineName,
      supervisorName: selectedSupervisorName,
    });
  }, [printData, selectedLineName, selectedOrder, selectedProductName, selectedSupervisorName]);

  const counts = useMemo(() => {
    const byStatus = {
      all: rowViews.length,
      pending: 0,
      in_progress: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of rowViews) {
      byStatus[row.effectiveStatus] += 1;
    }
    return byStatus;
  }, [rowViews]);

  const kpis = useMemo(() => {
    const working = counts.in_progress;
    const paused = counts.paused;
    const overdue = rowViews.filter((row) => row.expectedEndTone === 'overdue').length;
    return { working, paused, overdue };
  }, [counts, rowViews]);

  const handleStatusChange = async (id: string, status: WorkOrderStatus) => {
    if (!id || !isConfigured) return;
    const previous = orderMap[id]?.status;
    if (!previous || previous === status) return;

    updateOrder(id, { status });
    setSyncingStatus(id);

    try {
      await updateWorkOrder(
        id,
        {
          status,
          ...(status === 'completed'
            ? {
                completedAt: new Date().toISOString(),
                actualWorkHours: orderMap[id]?.actualWorkHours,
              }
            : {}),
        },
        { path: WORK_ORDER_UPDATE_PATHS.workOrdersPageStatus },
      );
      toast.success('تم تحديث الحالة');
    } catch (updateError) {
      updateOrder(id, { status: previous });
      toast.error('فشل تحديث الحالة - تم التراجع');
      console.error('work order status update error', updateError);
    } finally {
      setSyncingStatus(null);
    }
  };

  const handleCloseOrder = async (order: WorkOrder) => {
    if (!order.id) return;
    if (
      !window.confirm(
        'تأكيد إغلاق أمر الشغل وتسجيله كـ «مكتمل»؟ تأكد أن الإنتاج والتقارير صحيحة قبل المتابعة.',
      )
    ) {
      return;
    }
    await handleStatusChange(order.id, 'completed');
  };

  const handleViewLinkedReports = useCallback((order: WorkOrder) => {
    if (!order.id) return;
    navigate(`/reports?workOrderId=${encodeURIComponent(order.id)}`);
  }, [navigate]);

  const handleReconcileLinkedReports = useCallback(async (order: WorkOrder) => {
    if (!order.id || !isConfigured) return;
    if (reconcilingOrderId) return;
    const confirmed = window.confirm(
      `مزامنة أمر الشغل مع تقارير الإنتاج من تاريخ إنشائه وبعده؟\n` +
      `سيتم ربط التقارير غير المربوطة وإعادة حساب الكمية المنتجة من مجموع التقارير (بدون مضاعفة).`,
    );
    if (!confirmed) return;

    setReconcilingOrderId(order.id);
    try {
      const result = await reconcileWorkOrderFromReports(order.id, {
        path: PRODUCTION_REPORT_RECONCILE_PATHS.workOrdersPage,
      });
      setReportMetaByOrderId((prev) => ({
        ...prev,
        [order.id!]: {
          count: result.reportCount,
          firstReportDate: prev[order.id!]?.firstReportDate ?? null,
          lastProducingReportDate: prev[order.id!]?.lastProducingReportDate ?? null,
          producedQuantity: result.producedQuantity,
        },
      }));
      updateOrder(order.id, {
        producedQuantity: result.producedQuantity,
      });
      toast.success(
        `تمت المزامنة: ${result.reportCount} تقرير مربوط` +
        (result.linked > 0 ? ` (ربط جديد: ${result.linked})` : '') +
        ` — الكمية: ${formatNumber(result.producedQuantity)}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر مزامنة التقارير مع أمر الشغل.');
    } finally {
      setReconcilingOrderId(null);
    }
  }, [reconcilingOrderId, reconcileWorkOrderFromReports, updateOrder]);

  const handleReopenCompletedOrder = useCallback(
    async (order: WorkOrder) => {
      const id = order.id;
      if (!id || !isConfigured) return;
      if (!can('workOrders.edit')) {
        toast.error('غير مصرح بإعادة فتح أمر الشغل.');
        return;
      }
      const stored = orderMap[id]?.status;
      if (stored !== 'completed') return;
      if (
        !window.confirm(
          'أمر الشغل مسجّل كمكتمل. هل تريد إعادته إلى «شغال»؟ استخدم ذلك عند الإغلاق بالخطأ؛ يمكنك إغلاقه مرة أخرى بعد التصحيح.',
        )
      ) {
        return;
      }

      const previous = orderMap[id];
      updateOrder(id, { status: 'in_progress' });
      setSyncingStatus(id);

      try {
        unwrapOrThrow(await reopenCompletedWorkOrder({ workOrderId: id }));
        toast.success('تم إعادة فتح أمر الشغل.');
      } catch (reopenError) {
        if (previous) updateOrder(id, { status: previous.status });
        toast.error('تعذر إعادة فتح الأمر. تحقق من الصلاحيات أو الاتصال.');
        console.error('work order reopen error', reopenError);
      } finally {
        setSyncingStatus(null);
      }
    },
    [can, isConfigured, orderMap, updateOrder],
  );

  const handleEditOrder = (order: WorkOrder) => {
    if (!order.id) return;
    setSelectedOrder(null);
    openModal(MODAL_KEYS.WORK_ORDERS_CREATE, {
      source: 'workOrders.drawer',
      mode: 'edit',
      workOrderId: order.id,
    });
  };

  const handleDeleteOrder = useCallback(
    async (order: WorkOrder) => {
      if (!order.id) return;
      if (!canDeleteWorkOrder) {
        toast.error('غير مصرح بحذف أمر الشغل.');
        return;
      }
      if (
        !window.confirm(
          `حذف أمر الشغل ${order.workOrderNumber}؟\nلا يمكن التراجع عن هذا الإجراء.`,
        )
      ) {
        return;
      }

      try {
        setSelectedOrder(null);
        await deleteWorkOrder(order.id);
        toast.success('تم حذف أمر الشغل.');
      } catch (deleteError) {
        toast.error('تعذر حذف أمر الشغل. تحقق من الصلاحيات أو الاتصال.');
        console.error('work order delete error', deleteError);
      }
    },
    [canDeleteWorkOrder, deleteWorkOrder, setSelectedOrder],
  );

  const handleOpenScanner = useCallback(
    (order: WorkOrder) => {
      if (!order.id || order.status === 'cancelled') return;
      setSelectedOrder(null);
      navigate(`/work-orders/${order.id}/scanner`);
    },
    [navigate, setSelectedOrder],
  );

  const handlePrintOrder = (order: WorkOrder) => {
    const next = buildWorkOrderPrintData(order, {
      productName: productNameMap.get(order.productId || '') || '—',
      lineName: lineNameMap.get(order.lineId || '') || '—',
      supervisorName: supervisorNameMap.get(order.supervisorId || '') || '—',
    });
    commitAndPrint(() => {
      setPrintData(next);
    }, handlePrint);
  };

  const handleExport = () => {
    const detailedRows: WorkOrderExportRow[] = visibleRowViews.map((row) => ({
      workOrderNumber: row.order.workOrderNumber,
      productName: row.productName,
      lineName: row.lineName,
      supervisorName: supervisorNameMap.get(row.order.supervisorId || '') || '—',
      status: row.effectiveStatus,
      storedStatus: row.storedStatus,
      quantity: Number(row.order.quantity || 0),
      producedQuantity: Number(row.order.producedQuantity || 0),
      remainingQuantity: row.remainingQuantity,
      progressPct: row.progressPct,
      reportCount: row.reportCount,
      startDate: row.startDateLabel === '—' ? '' : row.startDateLabel,
      estimatedDays: row.estimatedDays,
      expectedEnd: row.expectedEndLabel === '—' ? '' : row.expectedEndLabel,
      targetDate: String(row.order.targetDate || ''),
      dailyAverage: row.dailyAverage,
      deviationPct: row.deviationPct,
      estimatedCost: Number(row.order.estimatedCost || 0),
      actualCost: Number(row.order.actualCost || 0),
      costDiff: row.costDiff,
      notes: String(row.order.notes || '').trim(),
    }));

    exportWorkOrders(
      visibleRowViews.map((row) => row.order),
      {
        getProductName: (id) => productNameMap.get(id) || '—',
        getLineName: (id) => lineNameMap.get(id) || '—',
        getSupervisorName: (id) => supervisorNameMap.get(id) || '—',
      },
      { detailedRows },
    );
  };

  const handleOpenCreate = () => {
    openModal(MODAL_KEYS.WORK_ORDERS_CREATE, { source: 'workOrders.page.header' });
  };

  const handleImport = () => {
    toast.info('ميزة استيراد أوامر الشغل ستتوفر قريباً.');
  };

  if (loading && liveOrders.length === 0) {
    return <PageContentSkeleton variant="list" showFilters tableRows={10} />;
  }

  return (
    <ModuleOpsPageShell
      className={styles.page}
      eyebrow="أوامر الشغل"
      rangeLabel="إدارة وتتبع أوامر الشغل"
      hero={[
        { key: 'working', label: 'شغال', value: kpis.working },
        {
          key: 'paused',
          label: 'متوقف',
          value: kpis.paused,
          accent: kpis.paused > 0,
        },
        { key: 'overdue', label: 'متأخر', value: kpis.overdue, accent: kpis.overdue > 0 },
      ]}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {canCreateWorkOrder ? (
            <Button variant="primary" onClick={handleOpenCreate} data-modal-key={MODAL_KEYS.WORK_ORDERS_CREATE}>
              <span className="material-icons-round text-sm">add</span>
              أمر شغل جديد
            </Button>
          ) : null}
          {can('productionIssue.request') ? (
            <Button type="button" variant="outline" onClick={() => navigate('/production/issue-requests')}>
              <span className="material-icons-round text-sm">fact_check</span>
              طلب صرف إنتاج
            </Button>
          ) : null}
          {visibleRowViews.length > 0 ? (
            <Button type="button" variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير أوامر الشغل Excel
            </Button>
          ) : null}
          {canCreateWorkOrder ? (
            <Button type="button" variant="outline" onClick={handleImport}>
              <span className="material-icons-round text-sm">file_download</span>
              استيراد أوامر الشغل
            </Button>
          ) : null}
        </div>
      )}
    >
      <OpsDashPanel title="قائمة أوامر الشغل" accent="production" bodyClassName="p-0 overflow-hidden">
        <WorkOrderFilters
          filters={filters}
          counts={counts}
          lines={_rawLines.map((line) => ({ id: line.id || '', name: line.name }))}
          onSetFilter={setFilter}
          onClear={clearFilters}
        />

        {(syncingStatus || error) && (
          <div className={styles.toolbar}>
            {syncingStatus && <span className={styles.syncHint}>جاري مزامنة الحالة...</span>}
            {error && <span className={styles.errorHint}>{error}</span>}
          </div>
        )}

        <WorkOrdersTable
          rows={visibleRowViews}
          groupBy={filters.groupBy}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          hasPrevious={hasPrevious}
          page={page}
          onRowClick={(order) => setSelectedOrder(order.id || null)}
          onStatusChange={canUpdateWorkOrderStatus ? handleStatusChange : undefined}
          onEdit={canEditWorkOrderInModal ? handleEditOrder : undefined}
          onCloseOrder={canUpdateWorkOrderStatus ? (order) => void handleCloseOrder(order) : undefined}
          onDelete={canDeleteWorkOrder ? (order) => void handleDeleteOrder(order) : undefined}
          onReopenCompleted={can('workOrders.edit') ? handleReopenCompletedOrder : undefined}
          onOpenScanner={canUseWorkOrderScanner ? handleOpenScanner : undefined}
          onLoadMore={() => void loadMore()}
          onPrevious={loadPrevious}
        />
      </OpsDashPanel>

      <WorkOrderDrawer
        order={selectedOrder}
        rowView={selectedRowView}
        isOpen={Boolean(selectedOrder)}
        productName={selectedProductName}
        lineName={selectedLineName}
        supervisorName={selectedSupervisorName}
        onClose={() => setSelectedOrder(null)}
        onEdit={canEditWorkOrderInModal ? handleEditOrder : undefined}
        onCloseOrder={canUpdateWorkOrderStatus ? handleCloseOrder : undefined}
        onPrint={handlePrintOrder}
        onOpenScanner={canUseWorkOrderScanner ? handleOpenScanner : undefined}
        canReopenCompleted={can('workOrders.edit')}
        onReopenCompleted={handleReopenCompletedOrder}
        onViewReports={can('reports.view') || can('reports.create') ? handleViewLinkedReports : undefined}
        onReconcileReports={workOrderReconcileEnabled && (can('workOrders.edit') || can('reports.edit')) ? handleReconcileLinkedReports : undefined}
        reconcilingReports={Boolean(selectedOrder?.id && reconcilingOrderId === selectedOrder.id)}
      />
      <PrintOffscreenHost>
        <WorkOrderPrint ref={woPrintRef} data={livePrintData} printSettings={printTemplate} />
      </PrintOffscreenHost>
    </ModuleOpsPageShell>
  );
};
