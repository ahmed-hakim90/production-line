import React, { useState } from 'react';
import { usePermission } from '../../../utils/permissions';
import {
  isConfigured,
  syncBostaOnlineDispatchByDocIdsCallable,
  syncBostaOnlineDispatchStatusesCallable,
} from '../../auth/services/firebase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { toast } from '../../../components/Toast';

const RANGE_SYNC_CHUNK = 250;

/**
 * «تحديث حالة بوسطة» و«مزامنة الدفعة التالية» — نفس منطق لوحة KPI، لإظهاره في الشريط أو غيره عند إخفاء showControls.
 * `rangeSyncDocIds`: معرفات الشحنات التي يطابقها نطاق التاريخ في اللوحة (نفس `shipmentTouchesDateRange`).
 */
export const OnlineBostaFirestoreSyncButtons: React.FC<{
  className?: string;
  /** عند التمرير: زر «تحديث الكل في النطاق» يزامن هذه المستندات على دفعات. */
  rangeSyncDocIds?: string[];
}> = ({ className, rangeSyncDocIds }) => {
  const { can } = usePermission();
  const [busy, setBusy] = useState(false);

  if (!can('onlineDispatch.view') && !can('onlineDispatch.manage')) return null;

  const rangeCount = rangeSyncDocIds?.length ?? 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {rangeCount > 0 ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-8 text-xs"
          disabled={busy || !isConfigured}
          title="يستخدم نفس تواريخ «من / إلى» في أعلى اللوحة — كل شحنة يظهر سجلها في الجدول ضمن هذا النطاق"
          onClick={() => {
            if (!rangeSyncDocIds?.length) return;
            setBusy(true);
            void (async () => {
              const ids = [...rangeSyncDocIds];
              let processed = 0;
              let skipped = 0;
              try {
                for (let i = 0; i < ids.length; i += RANGE_SYNC_CHUNK) {
                  const chunk = ids.slice(i, i + RANGE_SYNC_CHUNK);
                  const r = await syncBostaOnlineDispatchByDocIdsCallable({ docIds: chunk });
                  processed += r.processed;
                  skipped += r.skipped;
                }
                toast.success(
                  `تم مزامنة بوسطة لنطاق التاريخ: ${processed} شحنة${skipped > 0 ? ` (تخطّي ${skipped})` : ''}.`,
                );
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[Bosta sync] range by doc ids failed', e);
                toast.error(e instanceof Error ? e.message : 'تعذر مزامنة النطاق');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          تحديث الكل في النطاق ({rangeCount})
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={busy || !isConfigured}
        onClick={() => {
          setBusy(true);
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
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        تحديث حالة بوسطة
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 text-xs"
        disabled={busy || !isConfigured}
        title="يتبع نفس ترتيب المزامنة المجدولة — كرر الضغط حتى تغطي كل الشحنات"
        onClick={() => {
          setBusy(true);
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
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        مزامنة الدفعة التالية
      </Button>
    </div>
  );
};
