import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader, type PageHeaderAction } from '../../../components/PageHeader';
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
import { Ban, CheckCircle2, ChevronDown, FileDown, Trash2 } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestoreUserLabels } from '../utils/firestoreUserLabels';
import {
  collectOnlineDispatchExportUids,
  exportOnlineDispatchShipmentsExcel,
} from '../utils/exportOnlineDispatchShipmentsExcel';

function shipmentTouchesDateRange(
  r: OnlineDispatchShipment & { id: string },
  startMs: number,
  endMs: number,
): boolean {
  const cr = onlineDispatchTsToMs(r.createdAt);
  const hw = onlineDispatchTsToMs(r.handedToWarehouseAt);
  const hp = onlineDispatchTsToMs(r.handedToPostAt);
  const cx = onlineDispatchTsToMs(r.cancelledAt);
  return (
    isTimestampInRange(cr, startMs, endMs) ||
    isTimestampInRange(hw, startMs, endMs) ||
    isTimestampInRange(hp, startMs, endMs) ||
    isTimestampInRange(cx, startMs, endMs)
  );
}

function playOnlineDispatchSuccessTone(): void {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.0001;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  const now = ctx.currentTime;
  gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  oscillator.start(now);
  oscillator.stop(now + 0.12);
  oscillator.onended = () => {
    void ctx.close().catch(() => {});
  };
}

/** نغمتان متتابعتان بعد الموافقة على تسوية باركود غير مسجّل (مخزن ثم بوسطة). */
function playDualSuccessToneAfterReconciliationApprove(): void {
  playOnlineDispatchSuccessTone();
  window.setTimeout(() => playOnlineDispatchSuccessTone(), 180);
}

export const OnlineDashboard: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const branding = useAppStore((s) => s.systemSettings.branding);
  const tenantNav = useTenantNavigate();

  const [rows, setRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [shipmentsDataReady, setShipmentsDataReady] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; barcode: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; barcode: string } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCancelIds, setBulkCancelIds] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reconcileBusyId, setReconcileBusyId] = useState<string | null>(null);
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
  const [lagPanelVisible, setLagPanelVisible] = useState(true);

  const canPermanentDelete =
    Boolean(uid) && can('onlineDispatch.deletePermanent');

  const canCancelFromWarehouseQueue =
    Boolean(uid) && can('onlineDispatch.cancelFromWarehouseQueue');

  const canReconcile = Boolean(uid) && can('onlineDispatch.manage');

  const showShipmentsActionCol = canPermanentDelete || canCancelFromWarehouseQueue || canReconcile;

  const canExportOnlineShipments = can('onlineDispatch.view') || can('onlineDispatch.manage');
  const showShipmentRowSelection =
    Boolean(uid) && (canExportOnlineShipments || canCancelFromWarehouseQueue);

  const pageHeaderScanProps = useMemo(() => {
    const canWh = Boolean(uid) && (can('onlineDispatch.handoffToWarehouse') || can('onlineDispatch.manage'));
    const canPost = Boolean(uid) && (can('onlineDispatch.handoffToPost') || can('onlineDispatch.manage'));
    let primaryAction: { label: string; icon?: string; onClick: () => void } | undefined;
    let secondaryAction: { label: string; icon?: string; onClick: () => void } | undefined;
    const moreActions: PageHeaderAction[] = [];

    if (canWh) {
      primaryAction = {
        label: 'مسح — للمخزن',
        icon: 'search',
        onClick: () => tenantNav('/online/scan/warehouse'),
      };
    }
    if (canPost) {
      const post = {
        label: 'مسح — للبوسطة',
        icon: 'search',
        onClick: () => tenantNav('/online/scan/post'),
      };
      if (primaryAction) secondaryAction = post;
      else primaryAction = post;
    }
    if (canCancelFromWarehouseQueue) {
      moreActions.push({
        label: 'مسح إلغاء من التسليم',
        onClick: () => tenantNav('/online/cancel-dispatch-scan'),
        group: 'مسح',
      });
    }
    return { primaryAction, secondaryAction, moreActions };
  }, [uid, can, tenantNav, canCancelFromWarehouseQueue]);

  React.useEffect(() => {
    setShipmentsDataReady(false);
    const u = onlineDispatchService.subscribeAllForTenant((r) => {
      setRows(r);
      setShipmentsDataReady(true);
    });
    return () => {
      setShipmentsDataReady(false);
      u();
    };
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

  const reconciliationRows = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'pending_reconciliation')
        .sort((a, b) => {
          const ta = onlineDispatchTsToMs(a.firstCaptureAt) || onlineDispatchTsToMs(a.createdAt);
          const tb = onlineDispatchTsToMs(b.firstCaptureAt) || onlineDispatchTsToMs(b.createdAt);
          return tb - ta;
        }),
    [rows],
  );

  const reconciliationExportUids = useMemo(
    () => collectOnlineDispatchExportUids(reconciliationRows),
    [reconciliationRows],
  );
  const reconciliationUserLabels = useFirestoreUserLabels(reconciliationExportUids);

  const exportLabelUids = useMemo(
    () => collectOnlineDispatchExportUids(filteredShipments),
    [filteredShipments],
  );
  const exportUserLabels = useFirestoreUserLabels(exportLabelUids);

  const selectedIdsKey = [...selectedIds].sort().join('\u001e');
  const selectedRows = useMemo(
    () => filteredShipments.filter((r) => selectedIds.has(r.id)),
    [filteredShipments, selectedIdsKey],
  );

  const allSelectedAtWarehouse =
    selectedRows.length > 0 && selectedRows.every((r) => r.status === 'at_warehouse');

  useEffect(() => {
    setSelectedIds(new Set());
  }, [shipmentsPage, rangeFrom, rangeTo, barcodeQuery, statusFilter]);

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

  const confirmCancelFromDispatch = async () => {
    if (!cancelTarget || !uid) return;
    setCancelBusy(true);
    try {
      await onlineDispatchService.cancelWarehouseShipment(uid, cancelTarget.id);
      toast.success('تم تسجيل الإلغاء من التسليم — لن تُحسب الشحنة في انتظار البوسطة');
      setCancelTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإلغاء');
    } finally {
      setCancelBusy(false);
    }
  };

  const handleToggleShipmentSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleToggleShipmentPageSelection = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      for (const id of ids) {
        if (checked) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  };

  const handleExportFiltered = () => {
    if (filteredShipments.length === 0) {
      toast.error('لا توجد نتائج للتصدير');
      return;
    }
    exportOnlineDispatchShipmentsExcel(filteredShipments, exportUserLabels);
    toast.success(`تم تنزيل Excel (${filteredShipments.length} شحنة)`);
  };

  const handleExportSelected = () => {
    const list = filteredShipments.filter((r) => selectedIds.has(r.id));
    if (list.length === 0) {
      toast.error('لم يُحدد أي صف للتصدير');
      return;
    }
    exportOnlineDispatchShipmentsExcel(list, exportUserLabels);
    toast.success(`تم تنزيل Excel (${list.length} شحنة)`);
  };

  const handleExportReconciliationQueue = () => {
    if (reconciliationRows.length === 0) {
      toast.error('لا توجد عناصر قيد المراجعة للتصدير');
      return;
    }
    exportOnlineDispatchShipmentsExcel(reconciliationRows, reconciliationUserLabels);
    toast.success(`تم تنزيل Excel (${reconciliationRows.length} عنصر قيد المراجعة)`);
  };

  const runApproveReconciliation = async (docId: string) => {
    if (!uid) return;
    setReconcileBusyId(docId);
    try {
      await onlineDispatchService.approveReconciliation(uid, docId);
      toast.success('تم تسجيل التسليم للمخزن وللبوسطة بعد المراجعة');
      playDualSuccessToneAfterReconciliationApprove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الموافقة');
    } finally {
      setReconcileBusyId(null);
    }
  };

  const confirmBulkCancelFromDispatch = async () => {
    if (!bulkCancelIds || !uid) return;
    setBulkBusy(true);
    try {
      let ok = 0;
      let fail = 0;
      for (const id of bulkCancelIds) {
        try {
          await onlineDispatchService.cancelWarehouseShipment(uid, id);
          ok++;
        } catch {
          fail++;
        }
      }
      if (fail === 0) {
        toast.success(`تم إلغاء ${ok} شحنة من التسليم`);
      } else {
        toast.error(`نجح ${ok} — فشل ${fail}`);
      }
      setBulkCancelIds(null);
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  /** Toolbar: تصدير للمصرّح لهم، أو أزرار جماعية/مسح عند وجود تحديد. */
  const showShipmentsToolbar = canExportOnlineShipments || selectedIds.size > 0;

  return (
    <div className="erp-page space-y-6">
      <PageHeader
        title="لوحة الأونلاين — تسليم بوسطة"
        subtitle={branding?.factoryName ? `الشركة: ${branding.factoryName}` : 'متابعة الباركود والطابور'}
        icon="package"
        primaryAction={pageHeaderScanProps.primaryAction}
        secondaryAction={pageHeaderScanProps.secondaryAction}
        moreActions={pageHeaderScanProps.moreActions.length ? pageHeaderScanProps.moreActions : undefined}
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="order-1 min-w-0 flex-1 space-y-6 xl:order-1">
      <OnlineDispatchKpisSection
        tenantShipments={rows}
        dateFrom={rangeFrom}
        dateTo={rangeTo}
        onDateFromChange={setRangeFrom}
        onDateToChange={setRangeTo}
      />

      <Card className="shadow-sm border-violet-500/20">
        <CardHeader className="space-y-2 border-b bg-violet-500/5 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base font-semibold">قائمة المراجعة — مسح بوسطة بدون سجل سابق</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                باركود وُجد عند مسح التسليم للبوسطة دون أن يكون مسجّلًا مسبقًا. يمكن لمن لديه صلاحية الإدارة الموافقة
                لتسجيل التسليم للمخزن وللبوسطة دفعة واحدة للمراجعة والتقارير.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-md border border-violet-500/30 bg-background px-3 py-1.5 text-sm font-bold tabular-nums text-violet-900 dark:text-violet-100">
                {reconciliationRows.length}
              </span>
              {canExportOnlineShipments && reconciliationRows.length > 0 ? (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExportReconciliationQueue}>
                  <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                  تصدير Excel
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <OnlineShipmentsDataTable
            rows={reconciliationRows}
            emptyMessage="لا توجد باركودات قيد المراجعة حاليًا"
            userLabels={reconciliationUserLabels}
            showActionColumn={canReconcile}
            renderActionCell={
              canReconcile
                ? (r) => (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="gap-1 bg-violet-700 hover:bg-violet-800 dark:bg-violet-600"
                      disabled={reconcileBusyId === r.id}
                      onClick={() => void runApproveReconciliation(r.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                      {reconcileBusyId === r.id ? 'جاري…' : 'موافقة'}
                    </Button>
                  )
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base font-semibold">الشحنات</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  aria-expanded={lagPanelVisible}
                  onClick={() => {
                    setLagPanelVisible((v) => {
                      const next = !v;
                      if (!next) setLagTableVisible(false);
                      return next;
                    });
                  }}
                >
                  {lagPanelVisible ? 'إخفاء بطاقة التأخر' : 'إظهار بطاقة التأخر'}
                </Button>
              </div>
              <CardDescription className="text-xs leading-relaxed">
                السجلات التي لها نشاط (إنشاء، تسليم مخزن، تسليم بوسطة، أو إلغاء من التسليم) ضمن نطاق التاريخ نفسه
                المستخدم في المؤشرات أعلاه؛ يمكن تصفية النتائج بالباركود والحالة.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-baseline gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 shadow-sm sm:flex-col sm:items-end sm:py-2.5">
              <span className="text-[11px] font-medium text-muted-foreground">بعد الفلتر</span>
              <span className="text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                {filteredShipments.length}
              </span>
            </div>
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
                  <SelectItem value="cancelled">{ONLINE_DISPATCH_STATUS_LABEL.cancelled}</SelectItem>
                  <SelectItem value="pending_reconciliation">
                    {ONLINE_DISPATCH_STATUS_LABEL.pending_reconciliation}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        {showShipmentRowSelection ? (
          <CardContent className="border-b bg-muted/15 px-4 py-2 sm:px-6">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              يُمسح تحديد الصفوف تلقائيًا عند تغيير نطاق التاريخ أو البحث أو الحالة أو رقم الصفحة.
            </p>
          </CardContent>
        ) : null}
        {showShipmentsToolbar ? (
          <CardContent className="flex flex-col gap-3 border-b bg-muted/10 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              {canExportOnlineShipments ? (
                <>
                  <div className="hidden flex-wrap gap-2 md:flex">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleExportFiltered}
                      disabled={filteredShipments.length === 0}
                    >
                      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                      تصدير Excel — كل النتائج المفلترة
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleExportSelected}
                      disabled={selectedIds.size === 0}
                    >
                      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                      تصدير Excel — المحدد فقط
                    </Button>
                  </div>
                  <div className="md:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={filteredShipments.length === 0 && selectedIds.size === 0}
                        >
                          <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                          تصدير Excel
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[14rem]">
                        <DropdownMenuItem
                          disabled={filteredShipments.length === 0}
                          onClick={() => handleExportFiltered()}
                        >
                          كل النتائج المفلترة
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={selectedIds.size === 0} onClick={() => handleExportSelected()}>
                          المحدد فقط ({selectedIds.size})
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              ) : null}
              {selectedIds.size > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                  مسح التحديد ({selectedIds.size})
                </Button>
              ) : null}
            </div>
            {selectedIds.size > 0 ? (
              <div className="flex flex-wrap gap-2 sm:ms-auto">
                {canCancelFromWarehouseQueue ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-amber-800 border-amber-500/40 hover:bg-amber-500/10 dark:text-amber-200"
                    disabled={!allSelectedAtWarehouse}
                    title={
                      allSelectedAtWarehouse
                        ? undefined
                        : 'يُتاح الإلغاء الجماعي فقط عندما تكون كل الشحنات المحددة «عند المخزن»'
                    }
                    onClick={() => setBulkCancelIds([...selectedIds])}
                  >
                    <Ban className="h-4 w-4 shrink-0" aria-hidden />
                    إلغاء من التسليم (المحدد)
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          <TooltipProvider delayDuration={400}>
          {!shipmentsDataReady ? (
            <div className="space-y-3 px-4 py-6 sm:px-6" aria-busy="true" aria-label="جاري تحميل الشحنات">
              <Skeleton className="h-8 w-full max-w-md" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-4/5" />
            </div>
          ) : (
          <OnlineShipmentsDataTable
            rows={paginatedShipments}
            emptyMessage="لا توجد شحنات مطابقة للفلتر"
            userLabels={showShipmentRowSelection ? exportUserLabels : undefined}
            selection={
              showShipmentRowSelection
                ? {
                    selectedIds,
                    onToggle: handleToggleShipmentSelection,
                    onTogglePage: handleToggleShipmentPageSelection,
                  }
                : undefined
            }
            showActionColumn={showShipmentsActionCol}
            renderActionCell={
              showShipmentsActionCol
                ? (r) => (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {canReconcile && r.status === 'pending_reconciliation' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="default"
                                size="icon"
                                className="h-8 w-8 shrink-0 bg-violet-700 hover:bg-violet-800 dark:bg-violet-600"
                                title="موافقة — تسجيل المخزن والبوسطة"
                                aria-label="موافقة على المراجعة"
                                disabled={reconcileBusyId === r.id}
                                onClick={() => void runApproveReconciliation(r.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">موافقة — تسجيل المخزن والبوسطة</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {canCancelFromWarehouseQueue && r.status === 'at_warehouse' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-amber-800 border-amber-500/40 hover:bg-amber-500/10 dark:text-amber-200"
                                title="إلغاء من التسليم"
                                aria-label="إلغاء من التسليم"
                                onClick={() => setCancelTarget({ id: r.id, barcode: r.barcode })}
                              >
                                <Ban className="h-4 w-4" aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">إلغاء من التسليم</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {canPermanentDelete ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
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
                            </TooltipTrigger>
                            <TooltipContent side="top">حذف نهائي من قاعدة البيانات</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {!(
                          (canReconcile && r.status === 'pending_reconciliation') ||
                          (canCancelFromWarehouseQueue && r.status === 'at_warehouse') ||
                          canPermanentDelete
                        ) ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </div>
                  )
                : undefined
            }
          />
          )}
          </TooltipProvider>
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

        {lagPanelVisible ? (
        <aside
          className="order-2 w-full shrink-0 xl:order-2 xl:sticky xl:top-4 xl:w-[min(22rem,100%)] xl:max-w-sm xl:self-start"
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
                      <span className="min-w-0 flex-1 font-mono text-[11px] leading-none text-foreground">
                        {row.barcode}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <OnlineDispatchStatusBadge status={row.status} className="text-[10px] px-1.5 py-0" />
                        {canCancelFromWarehouseQueue ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
                            title="إلغاء من التسليم"
                            aria-label="إلغاء من التسليم"
                            onClick={() => setCancelTarget({ id: row.id, barcode: row.barcode })}
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
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
        ) : null}
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && !cancelBusy && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء من التسليم</DialogTitle>
            <DialogDescription className="text-right">
              تُسجَّل الشحنة بحالة «تم الإلغاء من التسليم» ولن تُحسب في انتظار تسليم البوسطة (مناسب مثلًا بعد إلغاء
              الطلب في بوسطة). الباركود:{' '}
              <span className="font-mono font-semibold">{cancelTarget?.barcode}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button
              type="button"
              variant="destructive"
              disabled={cancelBusy}
              onClick={() => void confirmCancelFromDispatch()}
            >
              {cancelBusy ? 'جاري…' : 'تأكيد الإلغاء من التسليم'}
            </Button>
            <Button type="button" variant="outline" disabled={cancelBusy} onClick={() => setCancelTarget(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkCancelIds} onOpenChange={(open) => !open && !bulkBusy && setBulkCancelIds(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء من التسليم — دفعة</DialogTitle>
            <DialogDescription className="text-right space-y-2">
              <span>
                سيتم تطبيق الإجراء على{' '}
                <strong className="tabular-nums">{bulkCancelIds?.length ?? 0}</strong> شحنة محددة.
              </span>
              <span className="block text-xs leading-relaxed">
                تُسجَّل الشحنات بحالة «تم الإلغاء من التسليم» ولن تُحسب في انتظار تسليم البوسطة.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button
              type="button"
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => void confirmBulkCancelFromDispatch()}
            >
              {bulkBusy ? 'جاري…' : 'تأكيد'}
            </Button>
            <Button type="button" variant="outline" disabled={bulkBusy} onClick={() => setBulkCancelIds(null)}>
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
