import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import {
  filterWarehouseButNotPostSameDispatchDay,
  getDispatchDayBoundsForCalendarYmd,
  isTimestampInRange,
  onlineDispatchService,
  onlineDispatchTsToMs,
} from '../services/onlineDispatchService';
import type { OnlineDispatchShipment, OnlineDispatchStatus } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OnlineDispatchKpisSection } from '../components/OnlineDispatchKpisSection';
import { OnlineDataPaginationFooter } from '../components/OnlineDataPaginationFooter';
import { ONLINE_DISPATCH_STATUS_LABEL, OnlineDispatchStatusBadge } from '../components/OnlineDispatchStatusBadge';
import { OnlineShipmentsDataTable } from '../components/OnlineShipmentsDataTable';
import { parseYmdRangeToLocalBounds, todayYmd } from '../utils/dateRange';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '../../../components/Toast';
import { RotateCcw, Trash2 } from 'lucide-react';

function shipmentTouchesDateRange(
  r: OnlineDispatchShipment & { id: string },
  startMs: number,
  endMs: number,
): boolean {
  const cr = onlineDispatchTsToMs(r.createdAt);
  const hw = onlineDispatchTsToMs(r.handedToWarehouseAt);
  const hp = onlineDispatchTsToMs(r.handedToPostAt);
  return (
    isTimestampInRange(cr, startMs, endMs) ||
    isTimestampInRange(hw, startMs, endMs) ||
    isTimestampInRange(hp, startMs, endMs)
  );
}

export const OnlineDashboard: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const branding = useAppStore((s) => s.systemSettings.branding);

  const [rows, setRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [revertTarget, setRevertTarget] = useState<{ id: string; barcode: string } | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; barcode: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [shipmentsPage, setShipmentsPage] = useState(1);
  const SHIPMENTS_PAGE_SIZE = 20;

  const dayT = todayYmd();
  const [rangeFrom, setRangeFrom] = useState(dayT);
  const [rangeTo, setRangeTo] = useState(dayT);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OnlineDispatchStatus>('all');
  const [lagDayYmd, setLagDayYmd] = useState(dayT);
  const [lagPage, setLagPage] = useState(1);
  const LAG_PAGE_SIZE = 20;
  const [lagTableVisible, setLagTableVisible] = useState(false);

  const canRevertWarehouseScan =
    Boolean(uid) && (can('onlineDispatch.manage') || can('onlineDispatch.handoffToWarehouse'));

  const canPermanentDelete =
    Boolean(uid) && can('onlineDispatch.deletePermanent');

  const showShipmentsActionCol = canRevertWarehouseScan || canPermanentDelete;

  React.useEffect(() => {
    const u = onlineDispatchService.subscribeAllForTenant((r) => setRows(r));
    return () => u();
  }, []);

  const { startMs: rangeStartMs, endMs: rangeEndMs } = useMemo(
    () => parseYmdRangeToLocalBounds(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );

  const filteredShipments = useMemo(() => {
    let list = rows.filter((r) => shipmentTouchesDateRange(r, rangeStartMs, rangeEndMs));
    const q = barcodeQuery.trim().toLowerCase();
    if (q) list = list.filter((r) => r.barcode.toLowerCase().includes(q));
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    return list.sort((a, b) => {
      const ta = onlineDispatchTsToMs(a.createdAt);
      const tb = onlineDispatchTsToMs(b.createdAt);
      return tb - ta;
    });
  }, [rows, rangeStartMs, rangeEndMs, barcodeQuery, statusFilter]);

  useEffect(() => {
    setShipmentsPage(1);
  }, [rangeFrom, rangeTo, barcodeQuery, statusFilter]);

  const shipmentsTotalPages = Math.max(1, Math.ceil(filteredShipments.length / SHIPMENTS_PAGE_SIZE));

  useEffect(() => {
    setShipmentsPage((p) => Math.min(p, shipmentsTotalPages));
  }, [shipmentsTotalPages]);

  const paginatedShipments = useMemo(
    () => filteredShipments.slice((shipmentsPage - 1) * SHIPMENTS_PAGE_SIZE, shipmentsPage * SHIPMENTS_PAGE_SIZE),
    [filteredShipments, shipmentsPage],
  );

  const notPostSameDispatchDayRows = useMemo(() => {
    const list = filterWarehouseButNotPostSameDispatchDay(rows, lagDayYmd);
    return list.sort((a, b) => {
      const hwA = onlineDispatchTsToMs(a.handedToWarehouseAt);
      const hwB = onlineDispatchTsToMs(b.handedToWarehouseAt);
      return hwB - hwA;
    });
  }, [rows, lagDayYmd]);

  const lagTotalPages = Math.max(1, Math.ceil(notPostSameDispatchDayRows.length / LAG_PAGE_SIZE));

  useEffect(() => {
    setLagPage((p) => Math.min(p, lagTotalPages));
  }, [lagTotalPages]);

  const paginatedLagRows = useMemo(
    () =>
      notPostSameDispatchDayRows.slice((lagPage - 1) * LAG_PAGE_SIZE, lagPage * LAG_PAGE_SIZE),
    [notPostSameDispatchDayRows, lagPage],
  );

  const lagDayBoundsLabel = useMemo(() => {
    const { startMs, endExclusiveMs } = getDispatchDayBoundsForCalendarYmd(lagDayYmd);
    const endLastMs = endExclusiveMs - 1;
    const a = new Date(startMs).toLocaleString('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const b = new Date(endLastMs).toLocaleString('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${a} → ${b}`;
  }, [lagDayYmd]);

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

  const confirmPermanentDelete = async () => {
    if (!deleteTarget || !uid) return;
    setDeleteBusy(true);
    try {
      await onlineDispatchService.deleteShipmentDocument(uid, deleteTarget.id);
      toast.success('تم حذف سجل الشحنة نهائيًا من قاعدة البيانات');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="erp-page space-y-6">
      <PageHeader
        title="لوحة الأونلاين — تسليم بوسطة"
        subtitle={branding?.factoryName ? `الشركة: ${branding.factoryName}` : 'متابعة الباركود والطابور'}
        icon="package"
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="order-2 min-w-0 flex-1 space-y-6 xl:order-2">
      <OnlineDispatchKpisSection
        tenantShipments={rows}
        dateFrom={rangeFrom}
        dateTo={rangeTo}
        onDateFromChange={setRangeFrom}
        onDateToChange={setRangeTo}
      />

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div>
            <CardTitle className="text-base font-semibold">الشحنات</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              يظهر أي سجل له نشاط (إنشاء، تسليم مخزن، أو تسليم بوسطة) ضمن الفترة من «من تاريخ» إلى «إلى تاريخ» أعلاه.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-4 pt-1">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="online-shipments-search" className="text-xs text-muted-foreground">
                بحث بالباركود
              </Label>
              <Input
                id="online-shipments-search"
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                placeholder="جزء من الباركود…"
                dir="ltr"
                className="font-mono"
              />
            </div>
            <div className="w-full space-y-2 sm:w-[220px]">
              <Label htmlFor="online-shipments-status" className="text-xs text-muted-foreground">
                الحالة
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as 'all' | OnlineDispatchStatus)}
              >
                <SelectTrigger id="online-shipments-status">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="pending">{ONLINE_DISPATCH_STATUS_LABEL.pending}</SelectItem>
                  <SelectItem value="at_warehouse">{ONLINE_DISPATCH_STATUS_LABEL.at_warehouse}</SelectItem>
                  <SelectItem value="handed_to_post">{ONLINE_DISPATCH_STATUS_LABEL.handed_to_post}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="border-b bg-muted/20 px-4 py-4 sm:px-6">
          <p className="text-xs text-muted-foreground">عدد النتائج بعد الفلتر</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{filteredShipments.length}</p>
        </CardContent>
        <CardContent className="p-0">
          <OnlineShipmentsDataTable
            rows={paginatedShipments}
            emptyMessage="لا توجد شحنات مطابقة للفلتر"
            showActionColumn={showShipmentsActionCol}
            renderActionCell={
              showShipmentsActionCol
                ? (r) => (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {canRevertWarehouseScan && r.status === 'at_warehouse' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title="تراجع عن مسح المخزن"
                          aria-label="تراجع عن مسح المخزن"
                          onClick={() => setRevertTarget({ id: r.id, barcode: r.barcode })}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                      {canPermanentDelete ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10"
                          title="حذف نهائي"
                          aria-label="حذف نهائي"
                          onClick={() => setDeleteTarget({ id: r.id, barcode: r.barcode })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                      {!((canRevertWarehouseScan && r.status === 'at_warehouse') || canPermanentDelete) ? (
                        <span className="text-muted-foreground">—</span>
                      ) : null}
                    </div>
                  )
                : undefined
            }
          />
        </CardContent>
        <OnlineDataPaginationFooter
          page={shipmentsPage}
          totalPages={shipmentsTotalPages}
          totalItems={filteredShipments.length}
          onPageChange={setShipmentsPage}
          itemLabel="شحنة"
        />
      </Card>
        </div>

        <aside
          className="order-1 w-full shrink-0 xl:order-1 xl:sticky xl:top-4 xl:w-[min(22rem,100%)] xl:max-w-sm xl:self-start"
          aria-label="شحنات لم يُسجَّل لها تسليم بوسطة في نفس يوم المخزن"
        >
      <Card className="shadow-sm">
        <CardHeader className="space-y-3 border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div>
            <CardTitle className="text-base font-semibold leading-snug">
              لم يُسجَّل تسليم البوسطة في نفس يوم عمل المخزن
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              يوم العمل يبدأ الساعة 08:00 محليًا. تُحسب الشحنات التي سُلِّمَت للمخزن ضمن نافذة اليوم المحدد، ولم يُسجَّل لها
              تسليم البوسطة ضمن نفس النافذة (ما زالت عند المخزن أو سُجِّل للبوسطة لاحقًا).
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <Label htmlFor="online-lag-day" className="text-xs text-muted-foreground">
                يوم العمل (المرجع)
              </Label>
              <Input
                id="online-lag-day"
                type="date"
                value={lagDayYmd}
                onChange={(e) => setLagDayYmd(e.target.value)}
                className="w-full max-w-full"
              />
            </div>
            <p className="text-xs tabular-nums leading-snug text-muted-foreground">{lagDayBoundsLabel}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 border-b bg-muted/20 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs text-muted-foreground leading-snug">
              عدد الشحنات المتأخرة (نفس يوم المخزن دون بوسطة)
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {notPostSameDispatchDayRows.length}
            </p>
          </div>
          <Button
            type="button"
            variant={lagTableVisible ? 'secondary' : 'default'}
            className="w-full shrink-0"
            onClick={() => setLagTableVisible((v) => !v)}
          >
            {lagTableVisible ? 'إخفاء الجدول' : 'عرض الجدول'}
          </Button>
        </CardContent>
        {lagTableVisible ? (
          <>
            <CardContent className="p-0">
              {paginatedLagRows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد شحنات مطابقة لهذا اليوم</p>
              ) : (
                <ul className="divide-y divide-border">
                  {paginatedLagRows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/20"
                    >
                      <span className="font-mono text-[11px] leading-none text-foreground">{row.barcode}</span>
                      <OnlineDispatchStatusBadge status={row.status} className="text-[10px] px-1.5 py-0" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <OnlineDataPaginationFooter
              page={lagPage}
              totalPages={lagTotalPages}
              totalItems={notPostSameDispatchDayRows.length}
              onPageChange={setLagPage}
              itemLabel="شحنة"
            />
          </>
        ) : null}
      </Card>
        </aside>
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف نهائي من قاعدة البيانات</DialogTitle>
            <DialogDescription className="text-right space-y-2">
              <span>
                سيتم <strong className="text-destructive">حذف المستند بالكامل</strong> لهذا الباركود بلا استرجاع،
                بغض النظر عن الحالة (انتظار مخزن، عند المخزن، أو تم للبوسطة).
              </span>
              <span className="block font-mono font-semibold">{deleteTarget?.barcode}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void confirmPermanentDelete()}>
              {deleteBusy ? 'جاري…' : 'تأكيد الحذف النهائي'}
            </Button>
            <Button type="button" variant="outline" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
