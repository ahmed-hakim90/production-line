import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/UI';
import { SelectableTable, type TableBulkAction, type TableColumn } from '@/components/SelectableTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { FirestoreProductionLine, FirestoreProduct, ProductionAttendanceRecord } from '@/types';
import { getTodayDateString } from '@/utils/calculations';
import { productionAttendanceService } from '../services/productionAttendanceService';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useEnsureStoreData } from '@/hooks/useEnsureStoreData';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
  setPageDataCache,
} from '../../shared/lib/pageDataCache';

type StatusFilter = 'all' | ProductionAttendanceRecord['status'];

const STATUS_LABELS: Record<ProductionAttendanceRecord['status'], string> = {
  present: 'حضور',
  absent: 'غياب',
};

const STATUS_TYPES: Record<ProductionAttendanceRecord['status'], 'success' | 'danger'> = {
  present: 'success',
  absent: 'danger',
};

const SOURCE_LABELS: Record<ProductionAttendanceRecord['source'], string> = {
  shift_workers: 'وردية إنتاج',
  worker_outputs: 'إنتاج العمال',
};

const getMonthStart = (): string => {
  const today = getTodayDateString();
  return `${today.slice(0, 7)}-01`;
};

export const ProductionAttendance: React.FC = () => {
  const referenceDataLoading = useEnsureStoreData(['products', 'lines']);
  const { can } = usePermission();
  const canManage = can('production.attendance.manage') || can('reports.edit');
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getTodayDateString);
  const [lineId, setLineId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const attendanceCacheKey = `production:attendance:${startDate}:${endDate}:${lineId || 'all'}:${status}`;
  const initialCache = peekPageDataCache<ProductionAttendanceRecord[]>(attendanceCacheKey);
  const [records, setRecords] = useState<ProductionAttendanceRecord[]>(() => initialCache ?? []);
  const [loading, setLoading] = useState(() => initialCache == null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lineNames = useMemo(
    () => new Map(lines.map((line: FirestoreProductionLine) => [String(line.id || ''), line.name])),
    [lines],
  );
  const productNames = useMemo(
    () => new Map(products.map((product: FirestoreProduct) => [String(product.id || ''), product.name || product.code || ''])),
    [products],
  );

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<ProductionAttendanceRecord[]>(attendanceCacheKey);
    if (cached) {
      setRecords(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        attendanceCacheKey,
        () => productionAttendanceService.list({ startDate, endDate, lineId, status }),
        { force: opts?.force === true, maxAgeMs: 45_000 },
      );
      setRecords(data);
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر تحميل سجل حضور الإنتاج.');
    } finally {
      setLoading(false);
    }
  }, [attendanceCacheKey, startDate, endDate, lineId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    invalidatePageDataCache(attendanceCacheKey);
    await load({ force: true });
  }, [attendanceCacheKey, load]);

  const updateStatus = useCallback(async (
    record: ProductionAttendanceRecord,
    nextStatus: ProductionAttendanceRecord['status'],
  ) => {
    if (!record.id || record.status === nextStatus) return;
    setBusyId(record.id);
    try {
      await productionAttendanceService.updateRecordStatus(record, nextStatus);
      setRecords((current) => {
        const next = current.map((row) => (
          row.id === record.id ? { ...row, status: nextStatus } : row
        ));
        setPageDataCache(attendanceCacheKey, next);
        return next;
      });
      showAppToast('success', 'تم تحديث حالة الحضور.');
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر تحديث سجل الحضور.');
    } finally {
      setBusyId(null);
    }
  }, [attendanceCacheKey]);

  const deleteRows = useCallback(async (rows: ProductionAttendanceRecord[]) => {
    const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    if (!window.confirm(`سيتم حذف ${ids.length} سجل من حضور الإنتاج. هل تريد المتابعة؟`)) return;
    setBusyId('bulk-delete');
    try {
      await productionAttendanceService.deleteByIds(ids);
      setRecords((current) => {
        const next = current.filter((row) => !row.id || !ids.includes(row.id));
        setPageDataCache(attendanceCacheKey, next);
        return next;
      });
      showAppToast('success', 'تم حذف السجلات المحددة.');
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر حذف سجلات الحضور.');
    } finally {
      setBusyId(null);
    }
  }, [attendanceCacheKey]);

  const stats = useMemo(() => {
    const present = records.filter((row) => row.status === 'present').length;
    const absent = records.filter((row) => row.status === 'absent').length;
    return { total: records.length, present, absent };
  }, [records]);

  const columns = useMemo<TableColumn<ProductionAttendanceRecord>[]>(() => [
    {
      header: 'التاريخ',
      render: (row) => row.date,
      sortKey: (row) => row.date,
    },
    {
      header: 'العامل',
      render: (row) => (
        <div>
          <p className="font-bold">{row.employeeName || row.workerName || row.employeeId || row.workerId}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{row.employeeCode || row.employeeId || row.workerId || '—'}</p>
        </div>
      ),
    },
    {
      header: 'الخط',
      render: (row) => lineNames.get(row.lineId) || row.lineId,
    },
    {
      header: 'المنتج',
      render: (row) => productNames.get(row.productId) || row.productId,
    },
    {
      header: 'الحالة',
      render: (row) => (
        <StatusBadge
          label={STATUS_LABELS[row.status] || row.status}
          type={STATUS_TYPES[row.status] || 'muted'}
          dot
        />
      ),
      sortKey: (row) => row.status,
    },
    {
      header: 'المصدر',
      render: (row) => SOURCE_LABELS[row.source] || row.source,
    },
    {
      header: 'التقرير',
      render: (row) => row.reportCode || row.reportId,
    },
  ], [lineNames, productNames]);

  const bulkActions = useMemo<TableBulkAction<ProductionAttendanceRecord>[]>(() => [
    {
      label: 'حذف المحدد',
      icon: 'delete',
      action: deleteRows,
      permission: 'production.attendance.manage',
      variant: 'danger',
      disabled: Boolean(busyId),
    },
  ], [busyId, deleteRows]);

  if (referenceDataLoading && records.length === 0) {
    return <PageContentSkeleton variant="list" showFilters tableRows={8} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="سجل حضور الإنتاج"
      rangeLabel="الحضور والغياب المسجل وقت حفظ تقارير الإنتاج فقط، وليس بتوليد يومي تلقائي"
      hero={[
        { key: 'total', label: 'إجمالي السجلات', value: stats.total },
        { key: 'present', label: 'حضور', value: stats.present },
        { key: 'absent', label: 'غياب', value: stats.absent },
      ]}
      onRefresh={() => void reload()}
      refreshing={loading || referenceDataLoading}
    >
      <OpsDashPanel title="سجلات الحضور" accent="production" bodyClassName="p-0 overflow-hidden">
      <SmartFilterBar
      pageId="production-attendance"
        searchPlaceholder="بحث باسم العامل أو التقرير..."
        searchValue={search}
        onSearchChange={setSearch}
        quickFilters={[
          {
            key: 'lineId',
            placeholder: 'كل الخطوط',
            options: lines.map((line: FirestoreProductionLine) => ({
              value: line.id,
              label: line.name,
            })),
          },
          {
            key: 'status',
            placeholder: 'كل الحالات',
            options: [
              { value: 'present', label: 'حضور' },
              { value: 'absent', label: 'غياب' },
            ],
          },
        ]}
        quickFilterValues={{
          lineId: lineId || 'all',
          status: status === 'all' ? 'all' : status,
        }}
        onQuickFilterChange={(key, value) => {
          if (key === 'lineId') setLineId(value === 'all' ? '' : value);
          if (key === 'status') setStatus(value === 'all' ? 'all' : (value as StatusFilter));
        }}
        advancedFilters={[
          { key: 'startDate', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
          { key: 'endDate', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        ]}
        advancedFilterValues={{ startDate, endDate }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'startDate') setStartDate(value);
          if (key === 'endDate') setEndDate(value);
        }}
        onApply={() => void reload()}
        applyLabel={loading ? 'جاري التحميل...' : 'تطبيق الفلاتر'}
        className="mb-0 border-0 rounded-none"
      />

      <SelectableTable
        data={records}
        columns={columns}
        getId={(row) => row.id || `${row.reportId}-${row.employeeId || row.workerId}`}
        bulkActions={canManage ? bulkActions : []}
        enableSearch={false}
        renderActions={(row) => canManage ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              iconName="check_circle"
              tone="approve"
              solid={row.status === 'present'}
              disabled={busyId === row.id || row.status === 'present'}
              onClick={() => void updateStatus(row, 'present')}
              className="!h-auto !px-2 !py-1 text-xs"
            >
              حضور
            </Button>
            <Button
              type="button"
              size="sm"
              iconName="cancel"
              tone="reject"
              solid={row.status === 'absent'}
              disabled={busyId === row.id || row.status === 'absent'}
              onClick={() => void updateStatus(row, 'absent')}
              className="!h-auto !px-2 !py-1 text-xs"
            >
              غياب
            </Button>
          </div>
        ) : null}
        actionsHeader="إدارة"
        loading={loading}
        pageSize={20}
        tableId="production-attendance-records"
        emptyIcon="fact_check"
        emptyTitle="لا توجد سجلات حضور إنتاج"
        emptySubtitle="سيتم إنشاء السجلات عند حفظ أو إغلاق تقرير إنتاج يحتوي على عمال."
      />
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
