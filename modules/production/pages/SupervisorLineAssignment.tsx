import React, { memo, useEffect, useMemo, useState } from 'react';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useSupervisorStore } from '../stores/useSupervisorStore';
import type {
  HistoryPeriod,
  SupervisorDistributionLine,
  SupervisorDistributionSupervisor,
} from '../services/supervisorDistributionService';

type ViewMode = 'grid' | 'list';

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
  return `${first}.${second || first}`;
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
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal outline-none focus:border-[rgb(var(--color-primary))]"
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
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs font-normal text-gray-500">لا توجد نتائج ??????</div>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-right text-sm font-normal text-gray-700 hover:bg-gray-50"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item.id);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <span>{item.name}</span>
              <span className="text-xs text-gray-400">{item.code ?? '—'}</span>
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
      className="rounded-xl border border-gray-200 bg-white p-3"
      style={{ borderRightWidth: 3, borderRightColor: hasSupervisor ? 'rgb(var(--color-primary))' : '#D85A30' }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-800">{line.name}</h3>
          {pending && <span className="h-2 w-2 rounded-full bg-amber-500" title="تغييرات غير ??????" />}
        </div>
        <div
          className={`rounded-full px-2 py-0.5 text-xs font-normal ${
            hasSupervisor ? 'text-[rgb(var(--color-primary))]' : 'text-[#791F1F]'
          }`}
          style={{ backgroundColor: hasSupervisor ? 'rgb(var(--color-primary) / 0.12)' : '#FCEBEB' }}
        >
          ● {hasSupervisor ? `الحالي: ${getShortName(activeSupervisor?.name || '')}` : 'بدون مشرف'}
        </div>
      </div>

      {!hasSupervisor && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-normal text-gray-500">
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
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgb(var(--color-primary) / 0.12)', color: 'rgb(var(--color-primary))' }}
            >
              {getInitials(activeSupervisor?.name || '')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{activeSupervisor?.name}</p>
              <p className="text-xs font-normal text-gray-400">المعرف: {activeSupervisor?.code ?? '—'}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-normal text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={() => onUnassign(line.id)}
              disabled={isSaving}
            >
              فك
            </button>
          </div>
          <SearchableSupervisorField
            supervisors={supervisors}
            selectedSupervisorId={selectedSupervisorId}
            onSelect={(id) => onPendingChange(line.id, id)}
            placeholder="غيّر المشرف..."
          />
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-normal text-gray-600"
          onClick={() => onShowHistory(line)}
          data-modal-key={MODAL_KEYS.PRODUCTION_SUPERVISOR_ASSIGNMENT_HISTORY}
          disabled={isSaving}
        >
          عرض السجل
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-normal text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onUnassign(line.id)}
          disabled={!hasSupervisor || isSaving}
        >
          فك التعيين
        </button>
        <button
          type="button"
          className="mr-auto rounded-lg px-3 py-1 text-xs font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'rgb(var(--color-primary))' }}
          onClick={() => onSave(line.id)}
          disabled={!pending || isSaving}
        >
          حفظ / تغيير
        </button>
      </footer>
    </article>
  );
});

LineCard.displayName = 'LineCard';

export const SupervisorLineAssignment: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const lines = useSupervisorStore((state) => state.lines);
  const supervisors = useSupervisorStore((state) => state.supervisors);
  const pendingChanges = useSupervisorStore((state) => state.pendingChanges);
  const isLoading = useSupervisorStore((state) => state.isLoading);
  const isSaving = useSupervisorStore((state) => state.isSaving);
  const toast = useSupervisorStore((state) => state.toast);
  const fetchLines = useSupervisorStore((state) => state.fetchLines);
  const fetchSupervisors = useSupervisorStore((state) => state.fetchSupervisors);
  const setPendingChange = useSupervisorStore((state) => state.setPendingChange);
  const saveChange = useSupervisorStore((state) => state.saveChange);
  const saveAll = useSupervisorStore((state) => state.saveAll);
  const unassign = useSupervisorStore((state) => state.unassign);
  const clearToast = useSupervisorStore((state) => state.clearToast);

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
    const timer = window.setTimeout(() => clearToast(), 2600);
    return () => window.clearTimeout(timer);
  }, [toast?.message, clearToast]);

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

  return (
    <div dir="rtl" className="erp-ds-clean min-h-full space-y-4 bg-gray-50 p-4 font-sans">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M16 7a3 3 0 1 1 0 6a3 3 0 0 1 0-6Z" />
                <path d="M8 8a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5Z" />
                <path d="M13 17.2c.7-1.3 2.1-2.2 3.8-2.2c2.4 0 4.2 1.6 4.2 3.5V20h-8" />
                <path d="M2 19c0-1.9 1.8-3.5 4.2-3.5S10.5 17.1 10.5 19V20H2v-1Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-medium text-gray-800">توزيع المشرفين على ??????</h1>
              <p className="text-xs font-normal text-gray-500">
                تكليف ثابت مع تاريخ سريان وسجل تغييرات محفوظ لكل خط
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-normal text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void saveAll()}
              disabled={pendingCount === 0 || isSaving}
            >
              حفظ الكل {pendingCount > 0 ? `(${toAr(pendingCount)})` : ''}
            </button>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--color-primary))' }}
              onClick={() => void handleRefresh()}
              disabled={refreshing || isSaving}
            >
              {refreshing ? 'جاري التحديث...' : 'تحديث'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <span className="text-sm">#</span>
            </div>
            <div>
              <p className="text-xs font-normal text-gray-500">إجمالي ??????</p>
              <p className="text-xl font-medium text-gray-800">{toAr(totalLines)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-[rgb(var(--color-primary))]" style={{ backgroundColor: 'rgb(var(--color-primary) / 0.12)' }}>
              <span className="text-sm">✓</span>
            </div>
            <div>
              <p className="text-xs font-normal text-gray-500">تم تعيين مشرف</p>
              <p className="text-xl font-medium" style={{ color: 'rgb(var(--color-primary))' }}>{toAr(assignedCount)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-[#BA7517]" style={{ backgroundColor: '#FAEEDA' }}>
              <span className="text-sm">!</span>
            </div>
            <div>
              <p className="text-xs font-normal text-gray-500">بدون مشرف</p>
              <p className="text-xl font-medium" style={{ color: '#BA7517' }}>{toAr(unassignedCount)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border border-gray-200 p-1">
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm font-normal"
              style={period === 'today' ? { backgroundColor: 'rgb(var(--color-primary))', color: '#fff' } : undefined}
              onClick={() => setPeriod('today')}
            >
              اليوم
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm font-normal"
              style={period === 'yesterday' ? { backgroundColor: 'rgb(var(--color-primary))', color: '#fff' } : undefined}
              onClick={() => setPeriod('yesterday')}
            >
              أمس
            </button>
          </div>

          <input
            type="date"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            value={referenceDate}
            onChange={(event) => setReferenceDate(event.target.value)}
          />

          <div className="relative w-full min-w-[220px] flex-1">
            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-gray-400">⌕</span>
            <input
              type="search"
              className="w-full rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm font-normal outline-none focus:border-[rgb(var(--color-primary))]"
              placeholder="ابحث بالخط أو المشرف الحالي..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div className="flex items-center rounded-lg border border-gray-200 p-1">
            <button
              type="button"
              className={`rounded-lg px-2 py-1 text-xs font-normal ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}
              onClick={() => setViewMode('grid')}
              title="عرض شبكي"
            >
              ⊞
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-1 text-xs font-normal ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
              onClick={() => setViewMode('list')}
              title="عرض قائمة"
            >
              ☰
            </button>
          </div>
        </div>
      </section>

      {toast && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-normal ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {isLoading && lines.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm font-normal text-gray-500">
          جاري تحميل البيانات...
        </section>
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">???? بدون مشرف</p>
              <span className="rounded-full px-2 py-0.5 text-xs font-normal" style={{ backgroundColor: '#FAEEDA', color: '#BA7517' }}>
                {toAr(withoutSupervisor.length)}
              </span>
            </div>
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
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm font-normal text-gray-500">
                  لا توجد ???? في هذا القسم حسب الفلاتر الحالية.
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">???? بها مشرف</p>
              <span className="rounded-full px-2 py-0.5 text-xs font-normal" style={{ backgroundColor: 'rgb(var(--color-primary) / 0.12)', color: 'rgb(var(--color-primary))' }}>
                {toAr(withSupervisor.length)}
              </span>
            </div>
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
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm font-normal text-gray-500">
                  لا توجد ???? في هذا القسم حسب الفلاتر الحالية.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
