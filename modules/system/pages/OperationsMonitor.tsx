import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { FilterBar } from '../../../components/FilterBar';
import { Card, LoadingSkeleton } from '../components/UI';
import { auditService } from '../audit/services/audit.service';
import type { AuditRecord } from '../audit/types/audit.types';

const DELAY_THRESHOLD_MS = 15 * 60 * 1000;
const MAX_RESULTS = 180;

interface OperationSnapshot {
  correlationId: string;
  operation: string;
  module: string;
  userName: string;
  status: 'started' | 'succeeded' | 'failed';
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number | null;
  sessionId?: string;
  kind: 'business' | 'session' | 'ui';
  errorMessage?: string;
}

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value: unknown): string => {
  const ms = toMillis(value);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)}ms`;
  const sec = value / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${(sec / 60).toFixed(1)}m`;
};

const readSessionId = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = value as Record<string, unknown>;
  const sessionId = metadata.sessionId;
  return typeof sessionId === 'string' && sessionId.trim().length > 0 ? sessionId : undefined;
};

const getOperationKind = (operation: string): 'business' | 'session' | 'ui' => {
  if (operation.startsWith('session.')) return 'session';
  if (operation === 'navigate' || operation === 'click') return 'ui';
  return 'business';
};

const extractSnapshots = (events: AuditRecord[]): OperationSnapshot[] => {
  const grouped = new Map<string, AuditRecord[]>();
  events.forEach((row) => {
    const key = row.correlationId || row.id || '';
    if (!key) return;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  const snapshots: OperationSnapshot[] = [];
  grouped.forEach((rows, correlationId) => {
    const sorted = [...rows].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));
    const started = sorted.find((r) => r.status === 'started');
    const finished = [...sorted].reverse().find((r) => r.status === 'succeeded' || r.status === 'failed');
    const latest = sorted[sorted.length - 1];
    if (!latest) return;

    const startedAtMs = toMillis(started?.startedAt || started?.timestamp || latest.startedAt || latest.timestamp);
    const endedAtMs = toMillis(finished?.endedAt || finished?.timestamp || latest.endedAt);
    const status = (finished?.status || latest.status || 'started') as 'started' | 'succeeded' | 'failed';
    const durationMs = typeof finished?.durationMs === 'number'
      ? finished.durationMs
      : (status !== 'started' && startedAtMs && endedAtMs ? Math.max(0, endedAtMs - startedAtMs) : null);

    snapshots.push({
      correlationId,
      operation: String(latest.operation || latest.action || 'unknown.operation'),
      module: String(latest.module || 'unknown'),
      userName: String(latest.userName || latest.performedBy || 'Unknown'),
      status,
      startedAtMs,
      endedAtMs,
      durationMs,
      sessionId: readSessionId(latest.metadata),
      kind: getOperationKind(String(latest.operation || latest.action || 'unknown.operation')),
      errorMessage: latest.errorMessage || finished?.errorMessage || undefined,
    });
  });

  return snapshots.sort((a, b) => Math.max(b.endedAtMs, b.startedAtMs) - Math.max(a.endedAtMs, a.startedAtMs));
};

export const OperationsMonitorPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditRecord[]>([]);
  const [moduleFilter, setModuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [operationFilter, setOperationFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await auditService.getOperationEvents({
      module: moduleFilter || undefined,
      status: (statusFilter || undefined) as 'started' | 'succeeded' | 'failed' | undefined,
      operation: operationFilter || undefined,
      startDateIso: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
      endDateIso: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      maxResults: MAX_RESULTS,
    });
    setEvents(rows);
    setLoading(false);
  }, [fromDate, moduleFilter, operationFilter, statusFilter, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshots = useMemo(() => extractSnapshots(events), [events]);
  const operations = useMemo(
    () => Array.from(new Set(snapshots.map((row) => row.operation))).sort((a, b) => a.localeCompare(b)),
    [snapshots],
  );
  const filteredSnapshots = useMemo(
    () => (kindFilter ? snapshots.filter((row) => row.kind === kindFilter) : snapshots),
    [kindFilter, snapshots],
  );
  const activeFilterCount = useMemo(
    () => [moduleFilter, statusFilter, operationFilter, kindFilter, fromDate, toDate].filter(Boolean).length,
    [fromDate, kindFilter, moduleFilter, operationFilter, statusFilter, toDate],
  );

  const now = Date.now();
  const delayed = useMemo(
    () => filteredSnapshots.filter((row) => row.status === 'started' && row.startedAtMs > 0 && now - row.startedAtMs >= DELAY_THRESHOLD_MS),
    [filteredSnapshots, now],
  );

  const kpis = useMemo(() => {
    const total = filteredSnapshots.length;
    const succeeded = filteredSnapshots.filter((row) => row.status === 'succeeded').length;
    const failed = filteredSnapshots.filter((row) => row.status === 'failed').length;
    const open = filteredSnapshots.filter((row) => row.status === 'started').length;
    const closedDurations = filteredSnapshots
      .filter((row) => row.status !== 'started' && typeof row.durationMs === 'number')
      .map((row) => Number(row.durationMs || 0));
    const avgDuration = closedDurations.length
      ? closedDurations.reduce((sum, value) => sum + value, 0) / closedDurations.length
      : null;
    return {
      total,
      successRate: total ? Math.round((succeeded / total) * 100) : 0,
      failureRate: total ? Math.round((failed / total) * 100) : 0,
      open,
      avgDuration,
    };
  }, [filteredSnapshots]);
  const clearFilters = () => {
    setModuleFilter('');
    setStatusFilter('');
    setOperationFilter('');
    setKindFilter('');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="متابعة العمليات"
        subtitle="مراقبة تنفيذ أكشنات الإنتاج والجودة (نجاح/فشل/تأخير)"
        icon="monitoring"
        secondaryAction={{ label: 'تحديث', icon: 'refresh', onClick: () => void load(), disabled: loading }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card title="Success Rate">
          <p className="erp-kpi-num text-emerald-600">{kpis.successRate}%</p>
          <p className="erp-kpi-label">نسبة العمليات الناجحة</p>
        </Card>
        <Card title="Failure Rate">
          <p className="erp-kpi-num text-rose-600">{kpis.failureRate}%</p>
          <p className="erp-kpi-label">نسبة العمليات الفاشلة</p>
        </Card>
        <Card title="Avg Duration">
          <p className="erp-kpi-num text-blue-600">{formatDuration(kpis.avgDuration)}</p>
          <p className="erp-kpi-label">متوسط زمن التنفيذ</p>
        </Card>
        <Card title="Open Operations">
          <p className="erp-kpi-num text-amber-600">{kpis.open}</p>
          <p className="erp-kpi-label">عمليات لم تكتمل بعد</p>
        </Card>
      </div>

      <FilterBar
        dateRange={{
          start: fromDate,
          end: toDate,
          onStartChange: setFromDate,
          onEndChange: setToDate,
          onApply: () => void load(),
          loading,
        }}
        selects={[
          {
            value: moduleFilter,
            onChange: setModuleFilter,
            placeholder: 'الموديول: الكل',
            options: [
              { label: 'Production', value: 'production' },
              { label: 'Quality', value: 'quality' },
            ],
            minWidth: 150,
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'الحالة: الكل',
            options: [
              { label: 'started', value: 'started' },
              { label: 'succeeded', value: 'succeeded' },
              { label: 'failed', value: 'failed' },
            ],
            minWidth: 150,
          },
          {
            value: kindFilter,
            onChange: setKindFilter,
            placeholder: 'نوع النشاط: الكل',
            options: [
              { label: 'Business', value: 'business' },
              { label: 'Session', value: 'session' },
              { label: 'UI', value: 'ui' },
            ],
            minWidth: 150,
          },
          {
            value: operationFilter,
            onChange: setOperationFilter,
            placeholder: 'العملية: الكل',
            options: operations.map((operation) => ({ label: operation, value: operation })),
            minWidth: 190,
          },
        ]}
        activeCount={activeFilterCount}
        onClear={clearFilters}
      />

      <Card title={`عمليات متأخرة (${delayed.length})`}>
        {delayed.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد عمليات متأخرة الآن.</p>
        ) : (
          <div className="space-y-2">
            {delayed.slice(0, 10).map((row) => (
              <div key={row.correlationId} className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-sm font-bold text-[var(--color-text)]">{row.operation}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {row.module} - {row.userName} - منذ {formatDuration(now - row.startedAtMs)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`آخر العمليات (${filteredSnapshots.length})`}>
        {loading ? (
          <LoadingSkeleton rows={8} type="table" />
        ) : filteredSnapshots.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد بيانات عمليات في الفلاتر الحالية.</p>
        ) : (
          <div className="erp-table-scroll">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[#f8f9fa]">
                  <th className="py-2 px-2">العملية</th>
                  <th className="py-2 px-2">النوع</th>
                  <th className="py-2 px-2">الموديول</th>
                  <th className="py-2 px-2">الحالة</th>
                  <th className="py-2 px-2">المدة</th>
                  <th className="py-2 px-2">البداية</th>
                  <th className="py-2 px-2">النهاية</th>
                  <th className="py-2 px-2">Session</th>
                  <th className="py-2 px-2">المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {filteredSnapshots.slice(0, 100).map((row) => (
                  <tr key={row.correlationId} className="border-b border-[var(--color-border)]">
                    <td className="py-2 px-2 font-semibold">{row.operation}</td>
                    <td className="py-2 px-2">{row.kind}</td>
                    <td className="py-2 px-2">{row.module}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                        row.status === 'succeeded'
                          ? 'bg-emerald-100 text-emerald-700'
                          : row.status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 px-2">{formatDuration(row.durationMs)}</td>
                    <td className="py-2 px-2">{formatDateTime(row.startedAtMs)}</td>
                    <td className="py-2 px-2">{formatDateTime(row.endedAtMs)}</td>
                    <td className="py-2 px-2 font-mono text-xs">{row.sessionId ?? '—'}</td>
                    <td className="py-2 px-2">
                      <div>{row.userName}</div>
                      {row.errorMessage && (
                        <div className="text-[11px] text-rose-600 max-w-[280px] truncate" title={row.errorMessage}>
                          {row.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
