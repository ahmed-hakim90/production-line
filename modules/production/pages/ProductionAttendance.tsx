import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SelectableTable, type TableBulkAction, type TableColumn } from '@/components/SelectableTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { FirestoreProductionLine, FirestoreProduct, ProductionAttendanceRecord } from '@/types';
import { getTodayDateString } from '@/utils/calculations';
import { productionAttendanceService } from '../services/productionAttendanceService';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';

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
  const { can } = usePermission();
  const canManage = can('production.attendance.manage') || can('reports.edit');
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getTodayDateString);
  const [lineId, setLineId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [records, setRecords] = useState<ProductionAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lineNames = useMemo(
    () => new Map(lines.map((line: FirestoreProductionLine) => [String(line.id || ''), line.name])),
    [lines],
  );
  const productNames = useMemo(
    () => new Map(products.map((product: FirestoreProduct) => [String(product.id || ''), product.name || product.code || ''])),
    [products],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await productionAttendanceService.list({
        startDate,
        endDate,
        lineId,
        status,
      });
      setRecords(rows);
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر تحميل سجل حضور الإنتاج.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, lineId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = useCallback(async (
    record: ProductionAttendanceRecord,
    nextStatus: ProductionAttendanceRecord['status'],
  ) => {
    if (!record.id || record.status === nextStatus) return;
    setBusyId(record.id);
    try {
      await productionAttendanceService.updateRecordStatus(record, nextStatus);
      setRecords((current) => current.map((row) => (
        row.id === record.id ? { ...row, status: nextStatus } : row
      )));
      showAppToast('success', 'تم تحديث حالة الحضور.');
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر تحديث سجل الحضور.');
    } finally {
      setBusyId(null);
    }
  }, []);

  const deleteRows = useCallback(async (rows: ProductionAttendanceRecord[]) => {
    const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    if (!window.confirm(`سيتم حذف ${ids.length} سجل من حضور الإنتاج. هل تريد المتابعة؟`)) return;
    setBusyId('bulk-delete');
    try {
      await productionAttendanceService.deleteByIds(ids);
      setRecords((current) => current.filter((row) => !row.id || !ids.includes(row.id)));
      showAppToast('success', 'تم حذف السجلات المحددة.');
    } catch (error) {
      showAppToast('error', (error as Error).message || 'تعذر حذف سجلات الحضور.');
    } finally {
      setBusyId(null);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل حضور الإنتاج"
        subtitle="الحضور والغياب المسجل وقت حفظ تقارير الإنتاج فقط، وليس بتوليد يومي تلقائي."
        icon="fact_check"
        moreActions={[
          { label: 'تحديث', icon: 'refresh', onClick: load, disabled: loading },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">إجمالي السجلات</p>
          <p className="text-2xl font-black tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs text-emerald-700">حضور</p>
          <p className="text-2xl font-black tabular-nums text-emerald-700">{stats.present}</p>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-xs text-rose-700">غياب</p>
          <p className="text-2xl font-black tabular-nums text-rose-700">{stats.absent}</p>
        </div>
      </div>

      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="space-y-1 text-sm font-bold">
            <span>من تاريخ</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>إلى تاريخ</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>الخط</span>
            <select
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2"
            >
              <option value="">كل الخطوط</option>
              {lines.map((line: FirestoreProductionLine) => (
                <option key={line.id} value={line.id}>{line.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>الحالة</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2"
            >
              <option value="all">الكل</option>
              <option value="present">حضور</option>
              <option value="absent">غياب</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? 'جاري التحميل...' : 'تطبيق الفلاتر'}
            </button>
          </div>
        </div>
      </div>

      <SelectableTable
        data={records}
        columns={columns}
        getId={(row) => row.id || `${row.reportId}-${row.employeeId || row.workerId}`}
        bulkActions={canManage ? bulkActions : []}
        renderActions={(row) => canManage ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busyId === row.id || row.status === 'present'}
              onClick={() => void updateStatus(row, 'present')}
              className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 disabled:opacity-50"
            >
              حضور
            </button>
            <button
              type="button"
              disabled={busyId === row.id || row.status === 'absent'}
              onClick={() => void updateStatus(row, 'absent')}
              className="rounded-md border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700 disabled:opacity-50"
            >
              غياب
            </button>
          </div>
        ) : null}
        actionsHeader="إدارة"
        loading={loading}
        pageSize={20}
        enableSearch
        searchPlaceholder="بحث باسم العامل أو التقرير..."
        tableId="production-attendance-records"
        emptyIcon="fact_check"
        emptyTitle="لا توجد سجلات حضور إنتاج"
        emptySubtitle="سيتم إنشاء السجلات عند حفظ أو إغلاق تقرير إنتاج يحتوي على عمال."
      />
    </div>
  );
};
