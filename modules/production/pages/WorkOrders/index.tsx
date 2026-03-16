import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { PageHeader } from '../../../../components/PageHeader';
import { toast } from '../../../../components/Toast';
import { useGlobalModalManager } from '../../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../../components/modal-manager/modalKeys';
import { db, isConfigured } from '../../../auth/services/firebase';
import { useAppStore, useShallowStore } from '../../../../store/useAppStore';
import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { addDaysToDate, formatNumber } from '../../../../utils/calculations';
import { estimateReportCost } from '../../../../utils/costCalculations';
import { exportWorkOrders, type WorkOrderExportRow } from '../../../../utils/exportExcel';
import { useManagedPrint } from '../../../../utils/printManager';
import { usePermission } from '../../../../utils/permissions';
import { reportService } from '../../services/reportService';
import { WorkOrderPrint } from '../../components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../../components/ProductionReportPrint';
import { WorkOrderDrawer } from './WorkOrderDrawer';
import { WorkOrderFilters } from './WorkOrderFilters';
import { WorkOrdersTable } from './WorkOrdersTable';
import { useWorkOrderFilters } from './hooks/useWorkOrderFilters';
import { useWorkOrdersRealtime } from './hooks/useWorkOrdersRealtime';
import { useWorkOrderStore } from './store/workOrderStore';
import type { WorkOrderRowView } from './WorkOrderRow';
import styles from './WorkOrders.module.css';

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

interface WorkOrderReportMeta {
  count: number;
  firstReportDate: string | null;
  producedQuantity: number;
}

const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

const resolveEstimatedDays = (order: WorkOrder, avgDaily: number): number => {
  const explicit = Number((order as any).estimatedDays ?? (order as any).estimatedDurationDays ?? 0);
  if (explicit > 0) return Math.ceil(explicit);
  if (avgDaily <= 0) return 0;
  return Math.ceil(Math.max(Number(order.quantity || 0), 0) / avgDaily);
};

export const WorkOrders: React.FC = () => {
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
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);

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

  const { filters, setFilter, clearFilters } = useWorkOrderFilters();
  const { orders: liveOrders, loading, loadingMore, hasMore, error, loadMore } = useWorkOrdersRealtime({
    status: filters.status,
    lineId: filters.lineId,
    supervisorId: scopedSupervisorId,
    dateRange: normalizeDateRange(filters.dateRange),
  });

  const setOrders = useWorkOrderStore((s) => s.setOrders);
  const updateOrder = useWorkOrderStore((s) => s.updateOrder);
  const setSelectedOrder = useWorkOrderStore((s) => s.setSelectedOrder);
  const orderMap = useWorkOrderStore((s) => s.orders);
  const selectedOrderId = useWorkOrderStore((s) => s.selectedOrderId);

  const [syncingStatus, setSyncingStatus] = useState<string | null>(null);
  const [reportMetaByOrderId, setReportMetaByOrderId] = useState<Record<string, WorkOrderReportMeta>>({});
  const [printData, setPrintData] = useState<WorkOrderPrintData | null>(null);
  const woPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: woPrintRef, printSettings: printTemplate });
  const canCreateWorkOrder = can('workOrders.create') || can('workOrders.componentInjection.manage');

  useEffect(() => {
    setOrders(liveOrders);
  }, [liveOrders, setOrders]);

  const productNameMap = useMemo(() => {
    return new Map(_rawProducts.map((p) => [p.id || '', p.name]));
  }, [_rawProducts]);

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
            const firstReportDate = reports.reduce<string | null>((minDate, report) => {
              const date = String(report.date || '').trim();
              if (!date) return minDate;
              if (!minDate || date < minDate) return date;
              return minDate;
            }, null);
            const producedQuantity = reports.reduce((sum, report) => sum + Number(report.quantityProduced || 0), 0);
            return [id, { count: reports.length, firstReportDate, producedQuantity }] as const;
          } catch (error) {
            console.error('work order report meta error', error);
            return [id, { count: -1, firstReportDate: null, producedQuantity: 0 }] as const;
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
  }, [orderIds, orderIdsKey]);

  const searchedOrders = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return allOrders;
    return allOrders.filter((order) => {
      const productName = productNameMap.get(order.productId || '') || '';
      return (
        order.workOrderNumber.toLowerCase().includes(search) ||
        productName.toLowerCase().includes(search)
      );
    });
  }, [allOrders, filters.search, productNameMap]);

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
      const expectedEndByFirstReport = firstReportDate && estimatedDays > 0
        ? addDaysToDate(firstReportDate, estimatedDays)
        : '';
      const expectedEnd = String(expectedEndByFirstReport || (order as any).expectedEnd || order.targetDate || '');
      const deviationPct = Number((order as any).executionDeviationPct ?? 0);
      const supervisorName = supervisorNameMap.get(order.supervisorId || '') || '—';
      const effectiveStatus: WorkOrderStatus =
        order.status === 'in_progress' && reportMeta && reportMeta.count === 0
          ? 'pending'
          : order.status;
      const quantity = Number(order.quantity || 0);
      const producedFromOrder = Number(order.producedQuantity || 0);
      const producedFromScans = Number(order.actualProducedFromScans || order.scanSummary?.completedUnits || 0);
      const producedFromReports = Number(reportMeta?.producedQuantity || 0);
      const produced = Math.max(producedFromOrder, producedFromScans, producedFromReports);
      const hasExecutionSignal = reportCount > 0 || produced > 0 || Boolean((order as any).startedAt);
      const diff = expectedEnd ? dayDiff(expectedEnd) : 0;
      const isCompleted = effectiveStatus === 'completed';
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
          startedAt: firstReportDate || undefined,
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
        startDateLabel: firstReportDate || '—',
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
  const selectedOrder = selectedRowView?.order ?? null;
  const selectedProductName = selectedRowView?.productName ?? '—';
  const selectedLineName = selectedRowView?.lineName ?? '—';
  const selectedSupervisorName = selectedOrder
    ? (supervisorNameMap.get(selectedOrder.supervisorId || '') || '—')
    : '—';

  const counts = useMemo(() => {
    const byStatus = {
      all: allOrders.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const order of allOrders) {
      const meta = order.id ? reportMetaByOrderId[order.id] : undefined;
      const effectiveStatus: WorkOrderStatus =
        order.status === 'in_progress' && meta && meta.count === 0
          ? 'pending'
          : order.status;
      byStatus[effectiveStatus] += 1;
    }
    return byStatus;
  }, [allOrders, reportMetaByOrderId]);

  const kpis = useMemo(() => {
    const inProgress = counts.in_progress;
    const completed = counts.completed;
    const overdue = rowViews.filter((row) => row.expectedEndTone === 'overdue').length;
    return { inProgress, completed, overdue };
  }, [counts, rowViews]);

  const handleStatusChange = async (id: string, status: WorkOrderStatus) => {
    if (!id || !isConfigured || !db) return;
    const previous = orderMap[id]?.status;
    if (!previous || previous === status) return;

    updateOrder(id, { status });
    setSyncingStatus(id);

    try {
      await updateDoc(doc(db, 'work_orders', id), {
        status,
        updatedAt: serverTimestamp(),
        [`statusHistory.${status}`]: serverTimestamp(),
      });
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
    await handleStatusChange(order.id, 'completed');
  };

  const handleEditOrder = (order: WorkOrder) => {
    if (!order.id) return;
    openModal(MODAL_KEYS.WORK_ORDERS_CREATE, {
      source: 'workOrders.drawer',
      mode: 'edit',
      workOrderId: order.id,
    });
    toast.info('تم فتح نموذج أمر الشغل. دعم التحميل التلقائي لبيانات التعديل سيتم إضافته في خطوة لاحقة.');
  };

  const handlePrintOrder = (order: WorkOrder) => {
    setPrintData({
      workOrderNumber: order.workOrderNumber,
      productName: productNameMap.get(order.productId || '') || '—',
      lineName: lineNameMap.get(order.lineId || '') || '—',
      supervisorName: supervisorNameMap.get(order.supervisorId || '') || '—',
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
    });
    setTimeout(() => {
      handlePrint();
      setTimeout(() => setPrintData(null), 600);
    }, 220);
  };

  const handleExport = () => {
    const detailedRows: WorkOrderExportRow[] = rowViews.map((row) => ({
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
      searchedOrders,
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

  return (
    <div className={`erp-ds-clean ${styles.page}`}>
      <PageHeader
        title="أوامر الشغل"
        subtitle="نسخة مضغوطة مع تفاصيل في درج جانبي وتحديث لحظي"
        icon="assignment"
        primaryAction={canCreateWorkOrder ? {
          label: 'أمر شغل جديد',
          icon: 'add',
          onClick: handleOpenCreate,
          dataModalKey: MODAL_KEYS.WORK_ORDERS_CREATE,
        } : undefined}
        moreActions={[
          {
            label: 'تصدير أوامر الشغل Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: rowViews.length === 0,
            onClick: handleExport,
          },
          {
            label: 'استيراد أوامر الشغل',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !canCreateWorkOrder,
            onClick: handleImport,
          },
        ]}
      />

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span>قيد التنفيذ</span>
          <strong>{kpis.inProgress}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span>مكتمل</span>
          <strong>{kpis.completed}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span>متأخر</span>
          <strong>{kpis.overdue}</strong>
        </div>
      </div>

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
        rows={rowViews}
        groupBy={filters.groupBy}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onRowClick={(order) => setSelectedOrder(order.id || null)}
        onStatusChange={handleStatusChange}
        onEdit={handleEditOrder}
        onCloseOrder={(order) => void handleCloseOrder(order)}
        onLoadMore={() => void loadMore()}
      />

      <WorkOrderDrawer
        order={selectedOrder}
        rowView={selectedRowView}
        isOpen={Boolean(selectedOrder)}
        productName={selectedProductName}
        lineName={selectedLineName}
        supervisorName={selectedSupervisorName}
        onClose={() => setSelectedOrder(null)}
        onEdit={handleEditOrder}
        onCloseOrder={handleCloseOrder}
        onPrint={handlePrintOrder}
      />
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <WorkOrderPrint ref={woPrintRef} data={printData} printSettings={printTemplate} />
      </div>
    </div>
  );
};
