import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { onlineDispatchService } from '../services/onlineDispatchService';
import type { OnlineDispatchShipment, OnlineDispatchStatus } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '@/components/ui/button';
import { OnlineDispatchKpisSection } from '../components/OnlineDispatchKpisSection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '../../../components/Toast';
import { cn } from '@/lib/utils';

const STATUS_AR: Record<OnlineDispatchStatus, string> = {
  pending: 'في انتظار المخزن',
  at_warehouse: 'تم التسليم للمخزن',
  handed_to_post: 'تم التسليم للبوسطة',
};

export const OnlineDashboard: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const branding = useAppStore((s) => s.systemSettings.branding);

  const [rows, setRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [revertTarget, setRevertTarget] = useState<{ id: string; barcode: string } | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);

  const canRevertWarehouseScan =
    Boolean(uid) && (can('onlineDispatch.manage') || can('onlineDispatch.handoffToWarehouse'));

  React.useEffect(() => {
    const u = onlineDispatchService.subscribeAllForTenant((r) => setRows(r));
    return () => u();
  }, []);

  const recent = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return tb - ta;
      })
      .slice(0, 40);
  }, [rows]);

  const confirmRevert = async () => {
    if (!revertTarget || !uid) return;
    setRevertBusy(true);
    try {
      await onlineDispatchService.revertWarehouseHandoff(uid, revertTarget.id);
      toast.success('تم التراجع — الباركود عاد لانتظار أول مسح (تسليم للمخزن)');
      setRevertTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التراجع');
    } finally {
      setRevertBusy(false);
    }
  };

  return (
    <div className="erp-page space-y-6">
      <PageHeader
        title="لوحة الأونلاين — تسليم بوسطة"
        subtitle={branding?.factoryName ? `الشركة: ${branding.factoryName}` : 'متابعة الباركود والطابور'}
        icon="package"
      />

      <OnlineDispatchKpisSection />

      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] font-bold text-sm">
          آخر الشحنات
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="text-right py-2 px-3">الباركود</th>
                <th className="text-right py-2 px-3">الحالة</th>
                {canRevertWarehouseScan && (
                  <th className="text-right py-2 px-3 w-[1%] whitespace-nowrap">إجراء</th>
                )}
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 px-3 font-mono text-xs">{r.barcode}</td>
                  <td className="py-2 px-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        r.status === 'pending' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30',
                        r.status === 'at_warehouse' && 'bg-sky-100 text-sky-800 dark:bg-sky-900/30',
                        r.status === 'handed_to_post' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',
                      )}
                    >
                      {STATUS_AR[r.status]}
                    </span>
                  </td>
                  {canRevertWarehouseScan && (
                    <td className="py-2 px-3">
                      {r.status === 'at_warehouse' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setRevertTarget({ id: r.id, barcode: r.barcode })}
                        >
                          تراجع عن مسح المخزن
                        </Button>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td
                    colSpan={canRevertWarehouseScan ? 3 : 2}
                    className="py-8 text-center text-[var(--color-text-muted)]"
                  >
                    لا توجد شحنات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!revertTarget} onOpenChange={(open) => !open && !revertBusy && setRevertTarget(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تراجع عن مسح المخزن</DialogTitle>
            <DialogDescription className="text-right">
              سيعود الباركود{' '}
              <span className="font-mono font-semibold">{revertTarget?.barcode}</span> إلى حالة «في انتظار المخزن»
              (كأن أول مسح لم يحدث). استخدم ذلك لتصحيح مسح خاطئ قبل تسليم البوسطة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="destructive" disabled={revertBusy} onClick={() => void confirmRevert()}>
              {revertBusy ? 'جاري…' : 'تأكيد التراجع'}
            </Button>
            <Button type="button" variant="outline" disabled={revertBusy} onClick={() => setRevertTarget(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
