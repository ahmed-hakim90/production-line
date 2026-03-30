import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { tenantService } from '../../../services/tenantService';
import {
  platformTenantStatsService,
  type TenantFirestoreFootprint,
} from '../../../services/platformTenantStatsService';
import type { FirestoreTenant } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type FootprintState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: TenantFirestoreFootprint }
  | { kind: 'error'; message: string };

const formatMb = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  return (bytes / (1024 * 1024)).toFixed(2);
};

const statusStyle = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'active') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (s === 'suspended') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-amber-800 bg-amber-50 border-amber-200';
};

export const TenantInsightsPage: React.FC = () => {
  const [tenants, setTenants] = useState<(FirestoreTenant & { id: string })[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [footprints, setFootprints] = useState<Record<string, FootprintState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
  const usageConsoleUrl = projectId
    ? `https://console.firebase.google.com/project/${projectId}/usage`
    : 'https://console.firebase.google.com/';

  const loadTenants = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const list = await tenantService.listAllTenants();
      setTenants(list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : 'تعذر تحميل قائمة الشركات');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const loadFootprint = async (tenantId: string) => {
    setFootprints((prev) => ({ ...prev, [tenantId]: { kind: 'loading' } }));
    try {
      const data = await platformTenantStatsService.getTenantFootprint(tenantId);
      setFootprints((prev) => ({ ...prev, [tenantId]: { kind: 'ok', data } }));
    } catch (e: unknown) {
      setFootprints((prev) => ({
        ...prev,
        [tenantId]: {
          kind: 'error',
          message: e instanceof Error ? e.message : 'فشل التحميل',
        },
      }));
    }
  };

  const sortedCollectionEntries = useMemo(() => {
    return (data: TenantFirestoreFootprint) =>
      Object.entries(data.perCollection).sort((a, b) => b[1] - a[1]);
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">إحصائيات الشركات</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl leading-relaxed">
          بطاقة لكل شركة: عدد المستخدمين، عدد مجموعات Firestore التي تحتوي بيانات لهذه الشركة، وإجمالي
          المستندات المرتبطة بـ <code className="text-xs bg-[var(--color-muted)] px-1 rounded">tenantId</code>.
          حجم التخزين <strong>تقدير تقريبي</strong> فقط — الفوترة الفعلية لـ Firebase على مستوى المشروع
          بالكامل ويُراجعها من Google Cloud / Firebase Console.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadTenants()}>
            تحديث قائمة الشركات
          </Button>
          <a
            href={usageConsoleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[rgb(var(--color-primary))] hover:underline"
          >
            <span className="material-icons-round text-base">open_in_new</span>
            استهلاك المشروع في Firebase
          </a>
        </div>
      </div>

      {listError ? (
        <p className="text-sm text-rose-600">{listError}</p>
      ) : null}

      {listLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">جاري تحميل الشركات...</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">لا توجد شركات مسجّلة بعد.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {tenants.map((t) => {
            const fp = footprints[t.id] ?? { kind: 'idle' as const };
            const isOpen = expanded[t.id] ?? false;

            return (
              <Card key={t.id} className="overflow-hidden border-[var(--color-border)]">
                <CardHeader className="pb-2 space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-lg font-bold leading-tight">{t.name || 'بدون اسم'}</CardTitle>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${statusStyle(
                        t.status || 'pending',
                      )}`}
                    >
                      {t.status || '—'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
                    @{t.slug || '—'} · <span className="opacity-70">{t.id}</span>
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {fp.kind === 'idle' || fp.kind === 'error' ? (
                    <Button type="button" className="w-full" onClick={() => void loadFootprint(t.id)}>
                      تحميل الإحصائيات من Firestore
                    </Button>
                  ) : null}

                  {fp.kind === 'loading' ? (
                    <p className="text-sm text-[var(--color-text-muted)] flex items-center gap-2">
                      <span className="material-icons-round animate-spin text-lg">progress_activity</span>
                      جاري عدّ المستندات (قد يستغرق حتى دقيقة)...
                    </p>
                  ) : null}

                  {fp.kind === 'error' ? (
                    <p className="text-sm text-rose-600">{fp.message}</p>
                  ) : null}

                  {fp.kind === 'ok' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <div className="rounded-lg bg-[var(--color-muted)]/30 p-2 border border-[var(--color-border)]">
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">
                            مستخدمون
                          </p>
                          <p className="text-lg font-bold text-[var(--color-text)]">{fp.data.userCount}</p>
                        </div>
                        <div className="rounded-lg bg-[var(--color-muted)]/30 p-2 border border-[var(--color-border)]">
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">
                            مجموعات ببيانات
                          </p>
                          <p className="text-lg font-bold text-[var(--color-text)]">
                            {fp.data.collectionsWithData}
                          </p>
                        </div>
                        <div className="rounded-lg bg-[var(--color-muted)]/30 p-2 border border-[var(--color-border)]">
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">
                            إجمالي مستندات
                          </p>
                          <p className="text-lg font-bold text-[var(--color-text)]">
                            {fp.data.totalDocuments.toLocaleString('ar-EG')}
                          </p>
                        </div>
                        <div className="rounded-lg bg-[var(--color-muted)]/30 p-2 border border-[var(--color-border)]">
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">
                            تقدير تخزين
                          </p>
                          <p className="text-lg font-bold text-[var(--color-text)]">
                            {formatMb(fp.data.estimatedStorageBytes)} ميجابايت
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed border border-dashed border-[var(--color-border)] rounded-md p-2 bg-[var(--color-card)]">
                        {fp.data.usageNoteAr} افتراض حجم المستند الواحد ≈{' '}
                        {fp.data.avgDocBytesAssumption} بايت للتقدير فقط.
                      </p>

                      {fp.data.failedCollections.length > 0 ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                          تعذر عدّ بعض المجموعات: {fp.data.failedCollections.join(', ')}
                        </p>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setExpanded((prev) => ({ ...prev, [t.id]: !isOpen }))}
                      >
                        <span className="material-icons-round text-base ml-1">
                          {isOpen ? 'expand_less' : 'expand_more'}
                        </span>
                        {isOpen ? 'إخفاء تفاصيل المجموعات' : 'عرض تفاصيل المجموعات'}
                      </Button>

                      {isOpen ? (
                        <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--color-border)] text-xs">
                          <table className="w-full text-right">
                            <thead className="sticky top-0 bg-[var(--color-muted)]/50">
                              <tr>
                                <th className="p-2 font-semibold">المجموعة</th>
                                <th className="p-2 font-semibold w-24">العدد</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedCollectionEntries(fp.data).map(([name, count]) => (
                                <tr key={name} className="border-t border-[var(--color-border)]">
                                  <td className="p-2 font-mono text-[11px]" dir="ltr">
                                    {name}
                                  </td>
                                  <td className="p-2 font-bold">{count.toLocaleString('ar-EG')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      <Button type="button" variant="outline" size="sm" onClick={() => void loadFootprint(t.id)}>
                        إعادة حساب الإحصائيات
                      </Button>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
