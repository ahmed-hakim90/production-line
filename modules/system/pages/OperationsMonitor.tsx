import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
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

interface SessionEventItem {
  id: string;
  atMs: number;
  operation: string;
  module: string;
  status: 'started' | 'succeeded' | 'failed';
  description: string;
}

interface SessionGroup {
  sessionId: string;
  title: string;
  userName: string;
  module: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  events: SessionEventItem[];
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

const getRowStatus = (row: AuditRecord): 'started' | 'succeeded' | 'failed' => {
  if (row.status === 'started' || row.status === 'failed' || row.status === 'succeeded') return row.status;
  return 'succeeded';
};

const getSessionId = (row: AuditRecord): string | null => {
  const metadata = row.metadata as Record<string, unknown> | undefined;
  const value = metadata?.sessionId;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value;
};

const buildSessionGroups = (events: AuditRecord[]): SessionGroup[] => {
  const grouped = new Map<string, AuditRecord[]>();

  events.forEach((row) => {
    const sessionId = getSessionId(row);
    if (!sessionId) return;
    const bucket = grouped.get(sessionId) ?? [];
    bucket.push(row);
    grouped.set(sessionId, bucket);
  });

  const groups: SessionGroup[] = [];
  grouped.forEach((rows, sessionId) => {
    const sorted = [...rows].sort((a, b) => {
      const aMs = toMillis(a.startedAt || a.timestamp);
      const bMs = toMillis(b.startedAt || b.timestamp);
      return aMs - bMs;
    });
    if (sorted.length === 0) return;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startedAtMs = toMillis(first.startedAt || first.timestamp);
    const endedAtMs = toMillis(last.endedAt || last.timestamp || last.startedAt);
    const durationMs = Math.max(0, (endedAtMs || startedAtMs) - startedAtMs);
    const userName = String(first.userName || first.performedBy || 'Unknown');
    const module = String(first.module || 'unknown');
    const title = `Session ${sessionId.slice(0, 8)}`;

    groups.push({
      sessionId,
      title,
      userName,
      module,
      startedAtMs,
      endedAtMs: endedAtMs || startedAtMs,
      durationMs,
      events: sorted.map((row, idx) => ({
        id: row.id || `${sessionId}_${idx}`,
        atMs: toMillis(row.startedAt || row.timestamp),
        operation: String(row.operation || row.action || 'unknown.operation'),
        module: String(row.module || 'unknown'),
        status: getRowStatus(row),
        description: String(row.description || row.action || 'No description'),
      })),
    });
  });

  return groups.sort((a, b) => b.startedAtMs - a.startedAtMs);
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
  const [openSessionIds, setOpenSessionIds] = useState<Record<string, boolean>>({});

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
    () =>
      Array.from(new Set(snapshots.map((row) => String(row.operation))))
        .sort((a, b) => String(a).localeCompare(String(b))),
    [snapshots],
  );
  const filteredSnapshots = useMemo(
    () => (kindFilter ? snapshots.filter((row) => row.kind === kindFilter) : snapshots),
    [kindFilter, snapshots],
  );
  const sessionGroups = useMemo(() => buildSessionGroups(events), [events]);
  const filteredSessionGroups = useMemo(() => {
    if (!kindFilter) return sessionGroups;
    return sessionGroups.filter((session) =>
      session.events.some((event) => getOperationKind(event.operation) === kindFilter),
    );
  }, [kindFilter, sessionGroups]);
  const activeFilterCount = useMemo(
    () => [moduleFilter, statusFilter, operationFilter, kindFilter, fromDate, toDate].filter(Boolean).length,
    [fromDate, kindFilter, moduleFilter, operationFilter, statusFilter, toDate],
  );

  const now = Date.now();
  const delayed = useMemo(() => {
    const startedSessions = filteredSessionGroups.filter((session) => {
      const latest = session.events[session.events.length - 1];
      return latest?.status === 'started';
    });
    return startedSessions.filter(
      (session) => session.startedAtMs > 0 && now - session.startedAtMs >= DELAY_THRESHOLD_MS,
    );
  }, [filteredSessionGroups, now]);

  const kpis = useMemo(() => {
    const total = filteredSessionGroups.length;
    const succeeded = filteredSnapshots.filter((row) => row.status === 'succeeded').length;
    const failed = filteredSnapshots.filter((row) => row.status === 'failed').length;
    const open = filteredSessionGroups.filter((session) => {
      const latest = session.events[session.events.length - 1];
      return latest?.status === 'started';
    }).length;
    const closedDurations = filteredSessionGroups
      .filter((session) => session.durationMs >= 0)
      .map((session) => Number(session.durationMs || 0));
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
  }, [filteredSessionGroups, filteredSnapshots]);
  const toggleSession = (sessionId: string) => {
    setOpenSessionIds((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };
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

      <SmartFilterBar
        searchPlaceholder="ابحث باسم العملية..."
        searchValue={operationFilter}
        onSearchChange={setOperationFilter}
        quickFilters={[
          {
            key: 'module',
            placeholder: 'الموديول: الكل',
            options: [
              { label: 'Production', value: 'production' },
              { label: 'Quality', value: 'quality' },
            ],
            width: 'w-[150px]',
          },
          {
            key: 'status',
            placeholder: 'الحالة: الكل',
            options: [
              { label: 'started', value: 'started' },
              { label: 'succeeded', value: 'succeeded' },
              { label: 'failed', value: 'failed' },
            ],
            width: 'w-[150px]',
          },
        ]}
        quickFilterValues={{
          module: moduleFilter || 'all',
          status: statusFilter || 'all',
        }}
        onQuickFilterChange={(key, value) => {
          if (key === 'module') setModuleFilter(value === 'all' ? '' : value);
          if (key === 'status') setStatusFilter(value === 'all' ? '' : value);
        }}
        advancedFilters={[
          {
            key: 'kind',
            label: 'نوع النشاط',
            placeholder: 'نوع النشاط: الكل',
            options: [
              { label: 'Business', value: 'business' },
              { label: 'Session', value: 'session' },
              { label: 'UI', value: 'ui' },
            ],
            width: 'w-[150px]',
          },
          {
            key: 'operation',
            label: 'العملية',
            placeholder: 'العملية: الكل',
            options: operations.map((operation) => ({ label: operation, value: operation })),
            width: 'w-[200px]',
          },
          { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
          { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        ]}
        advancedFilterValues={{
          kind: kindFilter || 'all',
          operation: operationFilter || 'all',
          dateFrom: fromDate,
          dateTo: toDate,
        }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'kind') setKindFilter(value === 'all' ? '' : value);
          if (key === 'operation') setOperationFilter(value === 'all' ? '' : value);
          if (key === 'dateFrom') setFromDate(value);
          if (key === 'dateTo') setToDate(value);
        }}
        onApply={() => void load()}
        applyLabel={loading ? 'جار التحميل...' : 'عرض'}
        extra={activeFilterCount > 0 ? (
          <button
            type="button"
            className="inline-flex h-[34px] items-center rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            onClick={clearFilters}
          >
            مسح ({activeFilterCount})
          </button>
        ) : undefined}
      />

      <Card title={`جلسات متأخرة (${delayed.length})`}>
        {delayed.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد جلسات متأخرة الآن.</p>
        ) : (
          <div className="space-y-2">
            {delayed.slice(0, 10).map((session) => (
              <div key={session.sessionId} className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 py-2">
                <p className="text-sm font-bold text-[var(--color-text)]">{session.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {session.module} - {session.userName} - منذ {formatDuration(now - session.startedAtMs)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`الجلسات (${filteredSessionGroups.length})`}>
        {loading ? (
          <LoadingSkeleton rows={6} type="card" />
        ) : filteredSessionGroups.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد جلسات في الفلاتر الحالية.</p>
        ) : (
          <div className="space-y-3">
            {filteredSessionGroups.slice(0, 100).map((session) => {
              const isOpen = Boolean(openSessionIds[session.sessionId]);
              return (
                <div key={session.sessionId} className="rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => toggleSession(session.sessionId)}
                    className="w-full px-4 py-3 text-right hover:bg-[#f8f9fa] transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--color-text)]">{session.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)] font-mono">{session.sessionId}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[var(--color-text-muted)]">
                        <div><span className="font-semibold text-[var(--color-text)]">المستخدم:</span> {session.userName}</div>
                        <div><span className="font-semibold text-[var(--color-text)]">الموديول:</span> {session.module}</div>
                        <div><span className="font-semibold text-[var(--color-text)]">المدة:</span> {formatDuration(session.durationMs)}</div>
                        <div><span className="font-semibold text-[var(--color-text)]">التاريخ:</span> {formatDateTime(session.startedAtMs)}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>اضغط لعرض/إخفاء تفاصيل الجلسة</span>
                      <span className="material-icons-round text-base">{isOpen ? 'expand_less' : 'expand_more'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-[var(--color-border)] px-4 py-3">
                      <p className="text-sm font-bold text-[var(--color-text)] mb-3">Diagram الجلسة</p>
                      <div className="space-y-0">
                        {session.events.map((event, idx) => (
                          <div key={event.id} className="grid grid-cols-[20px_1fr] gap-2">
                            <div className="flex flex-col items-center">
                              <span
                                className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                                  event.status === 'succeeded'
                                    ? 'bg-emerald-500'
                                    : event.status === 'failed'
                                      ? 'bg-rose-500'
                                      : 'bg-amber-500'
                                }`}
                              />
                              {idx < session.events.length - 1 && (
                                <span className="mt-1 block w-px flex-1 bg-[var(--color-border)]" />
                              )}
                            </div>
                            <div className="pb-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[var(--color-text)]">{event.operation}</span>
                                <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#eef2f7] text-[var(--color-text-muted)]">
                                  {event.module}
                                </span>
                                <span className="text-[11px] text-[var(--color-text-muted)]">{formatDateTime(event.atMs)}</span>
                              </div>
                              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{event.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
