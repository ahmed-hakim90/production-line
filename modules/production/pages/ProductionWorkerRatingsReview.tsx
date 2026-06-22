import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button, Badge, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getTodayDateString } from '@/utils/calculations';
import { Star } from 'lucide-react';
import type {
  ProductionWorkerManagementReview,
  ProductionWorkerRatingRecord,
  ProductionWorkerRatingReviewStatus,
} from '@/types';
import { productionWorkerRatingService } from '../services/productionWorkerRatingService';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  resolveLineWorkerLaborRole,
} from '../utils/lineWorkerLaborRoles';

const REVIEW_STATUS_LABELS: Record<ProductionWorkerRatingReviewStatus | 'all', string> = {
  all: 'كل الحالات',
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

const RATING_FIELDS: { key: 'behavioralRating' | 'ethicalRating' | 'practicalRating'; label: string }[] = [
  { key: 'behavioralRating', label: 'سلوكياً' },
  { key: 'ethicalRating', label: 'أخلاقياً' },
  { key: 'practicalRating', label: 'عملياً' },
];

type ProductionWorkerRatingsReviewProps = {
  embedded?: boolean;
};

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const normalizedValue = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));
  const label = `التقييم ${normalizedValue} من 5`;

  return (
    <div className="inline-flex flex-row-reverse items-center gap-1 sm:gap-0.5" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fillPercent = Math.max(0, Math.min(100, (normalizedValue - (star - 1)) * 100));

        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors sm:h-5 sm:w-5 sm:rounded-none ${
              disabled ? 'cursor-default opacity-80' : 'hover:text-amber-500'
            }`}
            aria-label={`تقييم ${star} من 5`}
            title={`تقييم ${star} من 5`}
          >
            <Star aria-hidden="true" className="h-5 w-5 text-slate-300 sm:h-4 sm:w-4" strokeWidth={2.2} />
            <span
              aria-hidden="true"
              className="absolute inset-0 inline-flex items-center justify-center overflow-hidden text-amber-400"
              style={{ clipPath: `inset(0 0 0 ${100 - fillPercent}%)` }}
            >
              <Star className="h-5 w-5 fill-current sm:h-4 sm:w-4" strokeWidth={2.2} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

const emptyReview = (): ProductionWorkerManagementReview => ({
  status: 'pending',
  behavioralRating: 0,
  ethicalRating: 0,
  practicalRating: 0,
  notes: '',
});

export const ProductionWorkerRatingsReview: React.FC<ProductionWorkerRatingsReviewProps> = ({ embedded = false }) => {
  const { can } = usePermission();
  const canReview = can('production.workerRatings.manage') || can('hr.evaluation.approve');
  const canView = canReview || can('production.workerRatings.view') || can('production.workers.manage');
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);

  const [rows, setRows] = useState<ProductionWorkerRatingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayDateString());
  const [status, setStatus] = useState<ProductionWorkerRatingReviewStatus | 'all'>('all');
  const [drafts, setDrafts] = useState<Record<string, ProductionWorkerManagementReview>>({});

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const latest = await productionWorkerRatingService.getRecent(300);
      setRows(latest);
      setDrafts(Object.fromEntries(latest.map((row) => [row.id || '', {
        ...emptyReview(),
        ...(row.managementReview ?? {}),
      }])));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => (
    rows.filter((row) => {
      const statusMatches = status === 'all' || (row.managementReview?.status ?? 'pending') === status;
      const dateMatches = !date || row.date === date;
      return statusMatches && dateMatches;
    })
  ), [date, rows, status]);

  const updateDraft = (id: string, patch: Partial<ProductionWorkerManagementReview>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...emptyReview(),
        ...(prev[id] ?? {}),
        ...patch,
      },
    }));
  };

  const saveReview = async (row: ProductionWorkerRatingRecord, nextStatus?: ProductionWorkerRatingReviewStatus) => {
    if (!row.id || !canReview) return;
    const draft = {
      ...emptyReview(),
      ...(drafts[row.id] ?? row.managementReview ?? {}),
      status: nextStatus ?? drafts[row.id]?.status ?? row.managementReview?.status ?? 'pending',
      reviewedById: uid ?? undefined,
      reviewedByName: userDisplayName || userEmail || undefined,
    };
    setSavingId(row.id);
    try {
      await productionWorkerRatingService.reviewByManagement(row.id, draft);
      setRows((prev) => prev.map((item) => (
        item.id === row.id
          ? {
              ...item,
              managementReview: {
                ...draft,
                reviewedAt: new Date().toISOString(),
              },
            }
          : item
      )));
      setDrafts((prev) => ({ ...prev, [row.id!]: draft }));
    } finally {
      setSavingId(null);
    }
  };

  if (!canView) {
    return <Card><p className="p-4 text-sm">غير مصرح بعرض مراجعة تقييمات العمال</p></Card>;
  }

  return (
    <div className="space-y-4">
      {embedded ? (
        <Card>
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-[var(--color-text)]">مراجعة تقييمات العمال</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                اعتماد أو رفض تقييمات المشرفين مع تقييم وملاحظة إدارية مستقلة.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void load()}>تحديث</Button>
          </div>
        </Card>
      ) : (
        <PageHeader
          title="مراجعة تقييمات العمال"
          subtitle="اعتماد أو رفض تقييمات المشرفين مع تقييم وملاحظة إدارية مستقلة"
          secondaryAction={{ label: 'تحديث', onClick: () => void load() }}
        />
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--color-border)] p-4">
          <label className="text-sm font-bold text-[var(--color-text-muted)]">
            التاريخ
            <input
              type="date"
              className="mt-1 block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="text-sm font-bold text-[var(--color-text-muted)]">
            الحالة
            <select
              className="mt-1 block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as ProductionWorkerRatingReviewStatus | 'all')}
            >
              {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => setDate('')}>
            عرض كل التواريخ
          </Button>
        </div>

        {loading ? <LoadingSkeleton rows={6} /> : (
          <div className="space-y-4 p-4">
            <div className="space-y-3 md:hidden">
              {filteredRows.map((row) => {
                const rowId = row.id || '';
                const draft = drafts[rowId] ?? row.managementReview ?? emptyReview();
                const reviewStatus = row.managementReview?.status ?? 'pending';
                const disabled = !canReview || savingId === row.id;
                return (
                  <div key={row.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-bold text-[var(--color-text)]">{row.workerName || row.workerId}</h4>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
                          {row.workerCode && <span className="rounded-full bg-slate-100 px-2 py-1">{row.workerCode}</span>}
                          {row.laborRole && (
                            <Badge variant="neutral">
                              {LINE_WORKER_LABOR_ROLE_LABELS[resolveLineWorkerLaborRole(row.laborRole)]}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'rejected' ? 'danger' : 'warning'}>
                        {REVIEW_STATUS_LABELS[reviewStatus]}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">المشرف</div>
                        <div className="mt-1 font-bold text-[var(--color-text)]">{row.supervisorName || row.supervisorId}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">التاريخ</div>
                        <div className="mt-1 font-bold text-[var(--color-text)]">{row.date}</div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] p-3">
                      <div className="text-sm font-bold text-[var(--color-text)]">تقييم المشرف</div>
                      {RATING_FIELDS.map((field) => (
                        <div key={field.key} className="flex flex-col gap-2">
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
                          <StarRating value={Number(row[field.key] || 0)} disabled onChange={() => undefined} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-medium text-[var(--color-text-muted)]">
                      <div className="mb-1 font-bold text-[var(--color-text)]">ملاحظات المشرف</div>
                      {row.notes || '—'}
                    </div>
                    <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] p-3">
                      <div className="text-sm font-bold text-[var(--color-text)]">تقييم الإدارة</div>
                      {RATING_FIELDS.map((field) => (
                        <div key={field.key} className="flex flex-col gap-2">
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
                          <StarRating
                            value={Number(draft[field.key] || 0)}
                            disabled={disabled}
                            onChange={(value) => updateDraft(rowId, { [field.key]: value })}
                          />
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 block text-xs font-bold text-[var(--color-text-muted)]">
                      ملاحظة الإدارة
                      <textarea
                        rows={3}
                        disabled={disabled}
                        className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
                        placeholder="ملاحظة الإدارة"
                        value={draft.notes ?? ''}
                        onChange={(event) => updateDraft(rowId, { notes: event.target.value })}
                      />
                    </label>
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      <Button type="button" size="sm" className="h-10 w-full" disabled={disabled} onClick={() => void saveReview(row, 'approved')}>
                        اعتماد
                      </Button>
                      <Button type="button" size="sm" className="h-10 w-full" variant="outline" disabled={disabled} onClick={() => void saveReview(row, 'rejected')}>
                        رفض
                      </Button>
                      <Button type="button" size="sm" className="h-10 w-full" variant="outline" disabled={disabled} onClick={() => void saveReview(row)}>
                        حفظ فقط
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">العامل</th>
                  <th className="erp-th text-center">الدور</th>
                  <th className="erp-th">المشرف</th>
                  <th className="erp-th text-center">التاريخ</th>
                  {RATING_FIELDS.map((field) => (
                    <th key={field.key} className="erp-th text-center">{field.label}</th>
                  ))}
                  <th className="erp-th">ملاحظات المشرف</th>
                  <th className="erp-th text-center">الحالة</th>
                  <th className="erp-th">تقييم الإدارة</th>
                  <th className="erp-th">ملاحظة الإدارة</th>
                  <th className="erp-th text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const rowId = row.id || '';
                  const draft = drafts[rowId] ?? row.managementReview ?? emptyReview();
                  const reviewStatus = row.managementReview?.status ?? 'pending';
                  const disabled = !canReview || savingId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-[var(--color-border)] align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold text-[var(--color-text)]">{row.workerName || row.workerId}</div>
                        {row.workerCode && <div className="text-xs text-[var(--color-text-muted)]">{row.workerCode}</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.laborRole ? (
                          <Badge variant="neutral">
                            {LINE_WORKER_LABOR_ROLE_LABELS[resolveLineWorkerLaborRole(row.laborRole)]}
                          </Badge>
                        ) : (
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.supervisorName || row.supervisorId}</td>
                      <td className="px-4 py-3 text-center font-bold">{row.date}</td>
                      {RATING_FIELDS.map((field) => (
                        <td key={field.key} className="px-4 py-3 text-center">
                          <StarRating value={Number(row[field.key] || 0)} disabled onChange={() => undefined} />
                        </td>
                      ))}
                      <td className="max-w-[220px] px-4 py-3 text-xs text-[var(--color-text-muted)]">{row.notes || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'rejected' ? 'danger' : 'warning'}>
                          {REVIEW_STATUS_LABELS[reviewStatus]}
                        </Badge>
                      </td>
                      <td className="min-w-[220px] px-4 py-3">
                        <div className="space-y-2">
                          {RATING_FIELDS.map((field) => (
                            <div key={field.key} className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
                              <StarRating
                                value={Number(draft[field.key] || 0)}
                                disabled={disabled}
                                onChange={(value) => updateDraft(rowId, { [field.key]: value })}
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="min-w-[220px] px-4 py-3">
                        <textarea
                          rows={3}
                          disabled={disabled}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs"
                          placeholder="ملاحظة الإدارة"
                          value={draft.notes ?? ''}
                          onChange={(event) => updateDraft(rowId, { notes: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <Button type="button" size="sm" disabled={disabled} onClick={() => void saveReview(row, 'approved')}>
                            اعتماد
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void saveReview(row, 'rejected')}>
                            رفض
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void saveReview(row)}>
                            حفظ فقط
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm font-medium text-[var(--color-text-muted)]">
                لا توجد تقييمات مطابقة للفلاتر الحالية.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
