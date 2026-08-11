import React, { memo, useEffect, useMemo, useState } from 'react';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { useSupervisorStore } from '../stores/useSupervisorStore';
import type {
  HistoryPeriod,
  SupervisorDistributionLine,
  SupervisorDistributionSupervisor,
} from '../services/supervisorDistributionService';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';

type ViewMode = 'grid' | 'list';

interface SupervisorLineAssignmentProps {
  /** When true, omit ModuleOpsPageShell (parent already provides chrome). */
  embedded?: boolean;
}

interface SearchableSupervisorFieldProps {
  supervisors: SupervisorDistributionSupervisor[];
  selectedSupervisorId: string | null;
  onSelect: (supervisorId: string | null) => void;
  placeholder: string;
}

interface LineCardProps {
  line: SupervisorDistributionLine;
  supervisors: SupervisorDistributionSupervisor[];
  selectedSupervisorId: string | null;
  pending: boolean;
  onPendingChange: (lineId: string, supervisorId: string | null) => void;
  onSave: (lineId: string) => void;
  onUnassign: (lineId: string) => void;
  onShowHistory: (line: SupervisorDistributionLine) => void;
  isSaving: boolean;
}

const todayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toAr = (value: number): string => value.toLocaleString('ar-EG');

const normalize = (value: string): string => String(value || '').trim().toLowerCase();

const getInitials = (name: string): string => {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.slice(0, 1) || '';
  const second = parts[1]?.slice(0, 1) || '';
  return `${first}${second}`;
};

const getShortName = (name: string): string => {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).join(' ');
};

const SearchableSupervisorField: React.FC<SearchableSupervisorFieldProps> = ({
  supervisors,
  selectedSupervisorId,
  onSelect,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const selectedSupervisor = useMemo(
    () => supervisors.find((item) => item.id === selectedSupervisorId) || null,
    [supervisors, selectedSupervisorId],
  );
  const [query, setQuery] = useState(selectedSupervisor?.name || '');

  useEffect(() => {
    setQuery(selectedSupervisor?.name || '');
  }, [selectedSupervisor?.id, selectedSupervisor?.name]);

  const filtered = useMemo(() => {
    const text = normalize(query);
    if (!text) return supervisors.slice(0, 20);
    return supervisors
      .filter((item) => {
        const byName = normalize(item.name).includes(text);
        const byCode = normalize(String(item.code || '')).includes(text);
        return byName || byCode;
      })
      .slice(0, 20);
  }, [query, supervisors]);

  return (
    <div className="relative w-full">
      <input
        type="search"
        className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[rgb(var(--color-primary))]"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 100);
        }}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setOpen(true);
          if (!value.trim()) onSelect(null);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">لا توجد نتائج مطابقة</div>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item.id);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <span>{item.name}</span>
              <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{item.code ?? '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const LineCard = memo(({
  line,
  supervisors,
  selectedSupervisorId,
  pending,
  onPendingChange,
  onSave,
  onUnassign,
  onShowHistory,
  isSaving,
}: LineCardProps) => {
  const activeSupervisor = useMemo(
    () => supervisors.find((item) => item.id === selectedSupervisorId) || null,
    [supervisors, selectedSupervisorId],
  );
  const hasSupervisor = Boolean(activeSupervisor);

  return (
    <article
      className={`rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 ${
        hasSupervisor
          ? 'border-r-[3px] border-r-[rgb(var(--color-primary))]'
          : 'border-r-[3px] border-r-[rgb(var(--color-danger))]'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold text-[var(--color-text)]">{line.name}</h3>
          {pending ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--color-warning))]"
              title="تغييرات غير محفوظة"
            />
          ) : null}
        </div>
        <StatusBadge
          label={hasSupervisor ? `الحالي: ${getShortName(activeSupervisor?.name || '')}` : 'بدون مشرف'}
          type={hasSupervisor ? 'info' : 'danger'}
          dot
        />
      </div>

      {!hasSupervisor && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-hover)] text-sm text-[var(--color-text-muted)]">
            —
          </div>
          <SearchableSupervisorField
            supervisors={supervisors}
            selectedSupervisorId={selectedSupervisorId}
            onSelect={(id) => onPendingChange(line.id, id)}
            placeholder="اختر المشرف..."
          />
        </div>
      )}

      {hasSupervisor && (
        <div className="mb-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)/0.12)] text-xs font-bold text-[rgb(var(--color-primary))]">
              {getInitials(activeSupervisor?.name || '')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--color-text)]">{activeSupervisor?.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">المعرف: {activeSupervisor?.code ?? '—'}</p>
            </div>
            <GhostButton
              type="button"
              size="sm"
              tone="delete"
              onClick={() => onUnassign(line.id)}
              disabled={isSaving}
            >
              فك
            </GhostButton>
          </div>
          <SearchableSupervisorField
            supervisors={supervisors}
            selectedSupervisorId={selectedSupervisorId}
            onSelect={(id) => onPendingChange(line.id, id)}
            placeholder="غيّر المشرف..."
          />
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
        <GhostButton
          type="button"
          size="sm"
          tone="view"
          iconName="history"
          onClick={() => onShowHistory(line)}
          data-modal-key={MODAL_KEYS.PRODUCTION_SUPERVISOR_ASSIGNMENT_HISTORY}
          disabled={isSaving}
        >
          السجل
        </GhostButton>
        <GhostButton
          type="button"
          size="sm"
          tone="delete"
          onClick={() => onUnassign(line.id)}
          disabled={!hasSupervisor || isSaving}
        >
          فك التعيين
        </GhostButton>
        <PrimaryButton
          type="button"
          size="sm"
          tone="execute"
          className="mr-auto"
          onClick={() => onSave(line.id)}
          disabled={!pending || isSaving}
        >
          حفظ
        </PrimaryButton>
      </footer>
    </article>
  );
});

LineCard.displayName = 'LineCard';

export const SupervisorLineAssignment: React.FC<SupervisorLineAssignmentProps> = ({
  embedded = false,
}) => {
  const { openModal } = useGlobalModalManager();
  const lines = useSupervisorStore((state) => state.lines);
  const supervisors = useSupervisorStore((state) => state.supervisors);
  const pendingChanges = useSupervisorStore((state) => state.pendingChanges);
  const isLoading = useSupervisorStore((state) => state.isLoading);
  const isSaving = useSupervisorStore((state) => state.isSaving);
  const fetchLines = useSupervisorStore((state) => state.fetchLines);
  const fetchSupervisors = useSupervisorStore((state) => state.fetchSupervisors);
  const setPendingChange = useSupervisorStore((state) => state.setPendingChange);
  const saveChange = useSupervisorStore((state) => state.saveChange);
  const saveAll = useSupervisorStore((state) => state.saveAll);
  const unassign = useSupervisorStore((state) => state.unassign);

  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [referenceDate, setReferenceDate] = useState(todayYmd());
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [refreshing, setRefreshing] = useState(false);
  const [savingLineId, setSavingLineId] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void Promise.all([fetchLines(), fetchSupervisors()]);
  }, [fetchLines, fetchSupervisors]);

  const linesWithSelection = useMemo(() => {
    return lines.map((line) => {
      const hasPending = Object.prototype.hasOwnProperty.call(pendingChanges, line.id);
      const selectedSupervisorId = hasPending ? pendingChanges[line.id] : line.currentSupervisorId;
      return { ...line, selectedSupervisorId, hasPending };
    });
  }, [lines, pendingChanges]);

  const filteredLines = useMemo(() => {
    const search = normalize(debouncedSearch);
    if (!search) return linesWithSelection;
    return linesWithSelection.filter((line) => {
      const supervisorName = normalize(
        supervisors.find((item) => item.id === line.selectedSupervisorId)?.name || '',
      );
      return normalize(line.name).includes(search) || supervisorName.includes(search);
    });
  }, [debouncedSearch, linesWithSelection, supervisors]);

  const withoutSupervisor = useMemo(
    () => filteredLines.filter((line) => !line.selectedSupervisorId),
    [filteredLines],
  );
  const withSupervisor = useMemo(
    () => filteredLines.filter((line) => Boolean(line.selectedSupervisorId)),
    [filteredLines],
  );

  const totalLines = linesWithSelection.length;
  const assignedCount = linesWithSelection.filter((line) => Boolean(line.selectedSupervisorId)).length;
  const unassignedCount = Math.max(totalLines - assignedCount, 0);
  const pendingCount = Object.keys(pendingChanges).length;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLines(), fetchSupervisors()]);
    setRefreshing(false);
  };

  const handleSaveSingle = async (lineId: string) => {
    setSavingLineId(lineId);
    await saveChange(lineId);
    setSavingLineId('');
  };

  const handleUnassign = async (lineId: string) => {
    setSavingLineId(lineId);
    await unassign(lineId);
    setSavingLineId('');
  };

  const handleShowHistory = (line: SupervisorDistributionLine) => {
    openModal(MODAL_KEYS.PRODUCTION_SUPERVISOR_ASSIGNMENT_HISTORY, {
      lineId: line.id,
      lineName: line.name,
      period,
      referenceDate,
    });
  };

  const saveAllAction = (
    <PrimaryButton
      type="button"
      size="sm"
      tone="execute"
      iconName="save"
      onClick={() => void saveAll()}
      disabled={pendingCount === 0 || isSaving}
      loading={isSaving && pendingCount > 0}
    >
      {pendingCount > 0 ? `حفظ الكل (${toAr(pendingCount)})` : 'حفظ الكل'}
    </PrimaryButton>
  );

  const body = (
    <>
      <OpsDashPanel accent="production" bodyClassName="p-0 overflow-hidden">
        <SmartFilterBar
          pageId="supervisor-line-assignment"
          className="mb-0 border-0 rounded-none"
          searchPlaceholder="ابحث بالخط أو المشرف الحالي..."
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          periods={[
            { label: 'اليوم', value: 'today' },
            { label: 'أمس', value: 'yesterday' },
          ]}
          activePeriod={period}
          onPeriodChange={(value) => setPeriod(value as HistoryPeriod)}
          advancedFilters={[
            {
              key: 'referenceDate',
              label: 'تاريخ مرجعي',
              placeholder: 'اختر تاريخ',
              type: 'date',
              options: [],
            },
          ]}
          advancedFilterValues={{ referenceDate }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'referenceDate') setReferenceDate(value);
          }}
          extra={(
            <div className="ops-toolbar-seg" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={viewMode === 'grid' ? 'is-active' : undefined}
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                title="عرض شبكي"
              >
                <span className="material-icons-round">grid_view</span>
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'is-active' : undefined}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                title="عرض قائمة"
              >
                <span className="material-icons-round">view_list</span>
              </button>
            </div>
          )}
        />
      </OpsDashPanel>

      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="ops-dash-kpi-grid ops-dash-kpi-grid--dense">
            <div className="ops-dash-kpi-card">
              <p className="ops-dash-kpi-card__label">إجمالي الخطوط</p>
              <p className="ops-dash-kpi-card__value">{toAr(totalLines)}</p>
            </div>
            <div className="ops-dash-kpi-card ops-dash-kpi-card--accent">
              <p className="ops-dash-kpi-card__label">تم تعيين مشرف</p>
              <p className="ops-dash-kpi-card__value">{toAr(assignedCount)}</p>
            </div>
            <div className="ops-dash-kpi-card">
              <p className="ops-dash-kpi-card__label">بدون مشرف</p>
              <p className="ops-dash-kpi-card__value">{toAr(unassignedCount)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton
              type="button"
              size="sm"
              tone="view"
              iconName="refresh"
              onClick={() => void handleRefresh()}
              disabled={refreshing || isLoading}
            >
              تحديث
            </GhostButton>
            {saveAllAction}
          </div>
        </div>
      ) : null}

      {isLoading && lines.length === 0 ? (
        <OpsDashPanel title="جاري التحميل" accent="production">
          <PageContentSkeleton variant="list" bare showFilters={false} tableRows={4} />
        </OpsDashPanel>
      ) : (
        <>
          <OpsDashPanel
            title="خطوط بدون مشرف"
            accent="production"
            action={<StatusBadge label={toAr(withoutSupervisor.length)} type="warning" />}
          >
            <div className={`grid gap-3 ${viewMode === 'grid' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {withoutSupervisor.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  supervisors={supervisors}
                  selectedSupervisorId={line.selectedSupervisorId}
                  pending={line.hasPending}
                  onPendingChange={setPendingChange}
                  onSave={(lineId) => void handleSaveSingle(lineId)}
                  onUnassign={(lineId) => void handleUnassign(lineId)}
                  onShowHistory={handleShowHistory}
                  isSaving={isSaving || savingLineId === line.id}
                />
              ))}
              {withoutSupervisor.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                  لا توجد خطوط بدون مشرف حسب الفلاتر الحالية.
                </p>
              )}
            </div>
          </OpsDashPanel>

          <OpsDashPanel
            title="خطوط بها مشرف"
            accent="production"
            action={<StatusBadge label={toAr(withSupervisor.length)} type="info" />}
          >
            <div className={`grid gap-3 ${viewMode === 'grid' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {withSupervisor.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  supervisors={supervisors}
                  selectedSupervisorId={line.selectedSupervisorId}
                  pending={line.hasPending}
                  onPendingChange={setPendingChange}
                  onSave={(lineId) => void handleSaveSingle(lineId)}
                  onUnassign={(lineId) => void handleUnassign(lineId)}
                  onShowHistory={handleShowHistory}
                  isSaving={isSaving || savingLineId === line.id}
                />
              ))}
              {withSupervisor.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                  لا توجد خطوط عليها مشرف حسب الفلاتر الحالية.
                </p>
              )}
            </div>
          </OpsDashPanel>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="الإنتاج"
      rangeLabel="تكليف ثابت مع تاريخ سريان وسجل تغييرات محفوظ لكل خط"
      hero={[
        { key: 'total', label: 'إجمالي التعيينات', value: toAr(totalLines) },
        { key: 'assigned', label: 'تم تعيين مشرف', value: toAr(assignedCount), accent: true },
        { key: 'unassigned', label: 'بدون مشرف', value: toAr(unassignedCount) },
      ]}
      onRefresh={() => void handleRefresh()}
      refreshing={refreshing}
      actions={saveAllAction}
    >
      {body}
    </ModuleOpsPageShell>
  );
};
