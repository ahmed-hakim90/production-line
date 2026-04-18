import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '../../../utils/permissions';
import {
  onlineDispatchService,
  summarizeOnlineDispatchByRange,
} from '../services/onlineDispatchService';
import type { OnlineDispatchShipment } from '../../../types';
import { parseYmdRangeToDispatchDayLocalBounds, todayYmd } from '../utils/dateRange';
import { isConfigured, syncBostaOnlineDispatchStatusesCallable } from '../../auth/services/firebase';
import { useBostaDeliveriesForRange } from '../hooks/useBostaDeliveriesForRange';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { toast } from '../../../components/Toast';

export type OnlineDispatchKpisSectionProps = {
  /** أصغر أرقامًا مناسبة للتضمين في لوحة تحكم أخرى */
  compact?: boolean;
  /** عند false: بطاقات المؤشرات فقط (بدون فلتر التاريخ وأزرار المسح) — مثلاً في لوحة الإدارة */
  showControls?: boolean;
  className?: string;
  /**
   * عند تمريرها: استخدام هذه البيانات بدل اشتراك `subscribeAllForTenant` (لوحة الأونلاين الرئيسية).
   * لا تُمرَّر في لوحة الإدارة — يبقى الاشتراك الداخلي.
   */
  tenantShipments?: Array<OnlineDispatchShipment & { id: string }>;
  /** فترة التاريخ الخاضعة للتحكم من الأب (اختياري) */
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  /** عنصر HTML id لبطاقة المؤشرات (للتمرير من شريط السياق). */
  kpiSectionCardId?: string;
  /**
   * عند تمريرها من لوحة الأونلاين: نفس جلب `listBostaDeliveriesForRange` (بدون استدعاء عدّ منفصل).
   * عند الغياب: يُستدعى الجلب داخليًا (مثلاً لوحة الإدارة).
   */
  bostaListStats?: {
    count: number;
    loading: boolean;
    error: string | null;
    truncated?: boolean;
  };
  kpiScrollTargetIds?: {
    /** طابور المخزن → جدول النظام */
    queue?: string;
    /** عدد بوسطة → جدول API */
    bostaApi?: string;
    /** إلغاء / تسليم بوسطة / تسجيلات جديدة → سجلات Firestore */
    firestore?: string;
  };
};

/**
 * مؤشرات الأونلاين: طابور، تسليمات ضمن فترة، تسجيلات جديدة، واختياريًا فلتر تاريخ وأزرار مسح.
 */
export const OnlineDispatchKpisSection: React.FC<OnlineDispatchKpisSectionProps> = ({
  compact = false,
  showControls = true,
  className,
  tenantShipments,
  dateFrom: dateFromProp,
  dateTo: dateToProp,
  onDateFromChange,
  onDateToChange,
  kpiSectionCardId,
  bostaListStats,
  kpiScrollTargetIds,
}) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();

  const t = todayYmd();
  const [localFrom, setLocalFrom] = useState(t);
  const [localTo, setLocalTo] = useState(t);
  const [internalRows, setInternalRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [bostaSyncBusy, setBostaSyncBusy] = useState(false);

  const rangeFrom = dateFromProp ?? localFrom;
  const rangeTo = dateToProp ?? localTo;
  const setRangeFrom = onDateFromChange ?? setLocalFrom;
  const setRangeTo = onDateToChange ?? setLocalTo;

  const internalBosta = useBostaDeliveriesForRange(rangeFrom, rangeTo, 0, { skip: Boolean(bostaListStats) });
  const bostaLoading = bostaListStats?.loading ?? internalBosta.loading;
  const bostaError = bostaListStats?.error ?? internalBosta.error;
  const bostaTruncated = bostaListStats?.truncated ?? internalBosta.truncated;
  const bostaCount = bostaError ? null : (bostaListStats?.count ?? internalBosta.items.length);

  const rows = tenantShipments ?? internalRows;

  useEffect(() => {
    const u1 = onlineDispatchService.subscribeWarehouseQueue((n) => setQueueCount(n));
    return () => u1();
  }, []);

  useEffect(() => {
    if (tenantShipments !== undefined) return;
    const u2 = onlineDispatchService.subscribeAllForTenant((r) => setInternalRows(r));
    return () => u2();
  }, [tenantShipments]);

  const { startMs, endMs } = useMemo(
    () => parseYmdRangeToDispatchDayLocalBounds(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );
  const summary = useMemo(
    () => summarizeOnlineDispatchByRange(rows, startMs, endMs),
    [rows, startMs, endMs],
  );

  const numClass = compact ? 'text-2xl font-bold' : 'text-3xl font-bold';

  const tileClass =
    'flex min-h-[5.75rem] flex-col rounded-lg border border-border bg-card p-3 sm:min-h-[6rem] sm:p-4 shadow-sm';

  const scrollTo = (id: string | undefined) => {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const TileWrap: React.FC<{
    scrollId?: string;
    className?: string;
    children: React.ReactNode;
  }> = ({ scrollId, className: tileClassName, children }) => {
    if (scrollId) {
      return (
        <button
          type="button"
          className={cn(
            tileClass,
            tileClassName,
            'w-full cursor-pointer text-right transition-colors hover:bg-muted/50',
          )}
          onClick={() => scrollTo(scrollId)}
        >
          {children}
        </button>
      );
    }
    return <div className={cn(tileClass, tileClassName)}>{children}</div>;
  };

  return (
    <div className={cn('space-y-4', className)} id={kpiSectionCardId}>
      <Card className="shadow-sm">
        <CardContent className={cn(compact ? 'p-3' : 'p-4 sm:p-6')}>
          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
              compact ? 'gap-2' : 'gap-3 sm:gap-4',
            )}
          >
            <TileWrap scrollId={kpiScrollTargetIds?.queue}>
              <p className="text-xs text-muted-foreground">اوردر لم يتم تسليمه</p>
              <p className={cn(numClass, 'mt-1 text-primary')}>{queueCount}</p>
            </TileWrap>
            <TileWrap scrollId={kpiScrollTargetIds?.bostaApi}>
              <p className="text-xs text-muted-foreground">بوالص منشأة في بوسطة (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1 flex items-center gap-2')}>
                {bostaLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  (bostaError ? '—' : bostaCount) ?? '—'
                )}
              </p>
              {!compact && bostaTruncated && !bostaError ? (
                <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                  القائمة مقصورة على السيرفر — العدد المعروض أقصى ما يُجلب في طلب واحد.
                </p>
              ) : null}
              {!compact && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  من API بوسطة بحسب تاريخ إنشاء البوالص (تقويم محلي)
                </p>
              )}
              {bostaError && !compact && (
                <p className="mt-1 text-[10px] leading-snug text-rose-600 dark:text-rose-400">{bostaError}</p>
              )}
            </TileWrap>
            <TileWrap
              scrollId={kpiScrollTargetIds?.firestore}
              className="border-rose-500/25 bg-rose-50/40 dark:bg-rose-950/20"
            >
              <p className="text-xs text-muted-foreground">إلغاء من التسليم (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1 text-rose-800 dark:text-rose-200')}>
                {summary.cancelledInPeriod}
              </p>
              {!compact && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  بحسب وقت تسجيل الإلغاء
                </p>
              )}
            </TileWrap>
            <TileWrap scrollId={kpiScrollTargetIds?.firestore}>
              <p className="text-xs text-muted-foreground">تسليم للبوسطة (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1')}>{summary.toPost}</p>
            </TileWrap>
            <TileWrap scrollId={kpiScrollTargetIds?.firestore}>
              <p className="text-xs text-muted-foreground">تسجيلات جديدة (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1')}>
                {summary.createdInPeriod - summary.cancelledInPeriod}
              </p>
              {!compact && (
                <p className="mt-1 text-xs text-muted-foreground">
                  أول ظهور للباركود في النظام بحسب تاريخ الإنشاء
                </p>
              )}
            </TileWrap>
          </div>
        </CardContent>
      </Card>

      {showControls && (
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
            <CardTitle className="text-base font-semibold">الفترة والمسح السريع</CardTitle>
            <CardDescription className="text-xs">
              اختر نطاق التواريخ لمؤشرات الفترة أعلاه، ثم انتقل لشاشة المسح.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4 p-4 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="online-kpi-from" className="text-xs text-muted-foreground">
                من تاريخ
              </Label>
              <Input
                id="online-kpi-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-[180px] sm:w-[200px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="online-kpi-to" className="text-xs text-muted-foreground">
                إلى تاريخ
              </Label>
              <Input
                id="online-kpi-to"
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="w-[180px] sm:w-[200px]"
              />
            </div>
            {(can('onlineDispatch.handoffToWarehouse') || can('onlineDispatch.manage')) && (
              <Button type="button" variant="default" onClick={() => navigate('/online/scan/warehouse')}>
                مسح — للمخزن
              </Button>
            )}
            {(can('onlineDispatch.handoffToPost') || can('onlineDispatch.manage')) && (
              <Button type="button" variant="default" onClick={() => navigate('/online/scan/post')}>
                مسح — للبوسطة
              </Button>
            )}
            {(can('onlineDispatch.view') || can('onlineDispatch.manage')) && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={bostaSyncBusy || !isConfigured}
                  onClick={() => {
                    setBostaSyncBusy(true);
                    void (async () => {
                      try {
                        const r = await syncBostaOnlineDispatchStatusesCallable({ limit: 150 });
                        toast.success(
                          `تم مزامنة ${r.processed} شحنة (أحدث الطلبات). المزامنة المجدولة تتقدم على باقي الشحنات تدريجيًا.`,
                        );
                      } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('[Bosta sync] syncBostaOnlineDispatchStatuses failed', e);
                        toast.error(e instanceof Error ? e.message : 'تعذر مزامنة بوسطة');
                      } finally {
                        setBostaSyncBusy(false);
                      }
                    })();
                  }}
                >
                  {bostaSyncBusy ? (
                    <Loader2 className="ml-1 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  تحديث حالة بوسطة
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={bostaSyncBusy || !isConfigured}
                  title="يتبع نفس ترتيب المزامنة المجدولة — كرر الضغط حتى تغطي كل الشحنات"
                  onClick={() => {
                    setBostaSyncBusy(true);
                    void (async () => {
                      try {
                        const r = await syncBostaOnlineDispatchStatusesCallable({
                          limit: 150,
                          advancePaginationCursor: true,
                        });
                        toast.success(
                          r.processed === 0
                            ? 'لا توجد دفعة جديدة (انتهت الدورة أو لا توجد شحنات). جرّب «تحديث حالة بوسطة» لأحدث الطلبات.'
                            : `تم مزامنة الدفعة التالية: ${r.processed} شحنة. كرر الضغط لاحقًا لدفعة أخرى.`,
                        );
                      } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('[Bosta sync] next batch failed', e);
                        toast.error(e instanceof Error ? e.message : 'تعذر مزامنة بوسطة');
                      } finally {
                        setBostaSyncBusy(false);
                      }
                    })();
                  }}
                >
                  {bostaSyncBusy ? (
                    <Loader2 className="ml-1 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  مزامنة الدفعة التالية
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
