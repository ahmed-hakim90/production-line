import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button, Badge, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getTodayDateString } from '@/utils/calculations';
import type {
  ProductionWorkerManagementReview,
  ProductionWorkerRatingRecord,
  ProductionWorkerRatingReviewStatus,
} from '@/types';
import { productionWorkerRatingService } from '../services/productionWorkerRatingService';

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

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-row-reverse items-center gap-0.5" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={`material-icons-round text-lg leading-none transition-colors ${
            star <= value ? 'text-amber-400' : 'text-slate-300'
          } ${disabled ? 'cursor-default opacity-70' : 'hover:text-amber-500'}`}
          aria-label={`تقييم ${star} من 5`}
        >
          star
        </button>
      ))}
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

export const ProductionWorkerRatingsReview: React.FC = () => {
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
      <PageHeader
        title="مراجعة تقييمات العمال"
        subtitle="اعتماد أو رفض تقييمات المشرفين مع تقييم وملاحظة إدارية مستقلة"
        secondaryAction={{ label: 'تحديث', onClick: () => void load() }}
      />

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
          <div className="overflow-x-auto p-4">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">العامل</th>
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
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{row.workerName || row.workerId}</td>
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
