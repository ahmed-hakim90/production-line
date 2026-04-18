import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isConfigured as firebaseConfigured } from '../../auth/services/firebase';
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
import { BostaApiShipmentsTable } from '../components/BostaApiShipmentsTable';
import { OnlineBostaFirestoreSyncButtons } from '../components/OnlineBostaFirestoreSyncButtons';
import { OnlineDashboardBostaApiSummaryBar } from '../components/OnlineDashboardBostaApiSummaryBar';
import { OnlineDashboardBostaCategoryKpiCards } from '../components/OnlineDashboardBostaCategoryKpiCards';
import { OnlineDashboardDateContextBar } from '../components/OnlineDashboardDateContextBar';
import { OnlineDashboardDialogs } from '../components/OnlineDashboardDialogs';
import { OnlineDispatchKpisSection } from '../components/OnlineDispatchKpisSection';
import { OnlineDataPaginationFooter } from '../components/OnlineDataPaginationFooter';
import { ONLINE_DISPATCH_STATUS_LABEL, OnlineDispatchStatusBadge } from '../components/OnlineDispatchStatusBadge';
import { OnlineShipmentsDataTable } from '../components/OnlineShipmentsDataTable';
import { parseYmdRangeToDispatchDayLocalBounds, todayYmd } from '../utils/dateRange';
import { toast } from '../../../components/Toast';
import { Ban, CheckCircle2, ChevronDown, FileDown, Trash2 } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestoreUserLabels } from '../utils/firestoreUserLabels';
import {
  collectOnlineDispatchExportUids,
  exportBostaApiMergedExcel,
  exportOnlineDispatchShipmentsExcel,
} from '../utils/exportOnlineDispatchShipmentsExcel';
import {
  ONLINE_DISPATCH_BOSTA_INVALIDATE_EVENT,
  useBostaDeliveriesForRange,
} from '../hooks/useBostaDeliveriesForRange';
import { useMergedBostaRows } from '../hooks/useMergedBostaRows';
import { summarizeMergedBostaRows } from '../utils/bostaMergedAnalytics';
import type { BostaStateCategory } from '../utils/bostaStatePresentation';
import { categorizeBostaStateLabel } from '../utils/bostaStatePresentation';

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

const LEGACY_WH_STORAGE_KEY = 'onlineDispatchLegacyWarehouse';

/** إعادة جلب قائمة بوسطة (API) دوريًا أثناء فتح اللوحة — يحدّث عمود «حالة بوسطة (API)». الحد الأدنى في الـ hook ١٥ ثانية. */
const BOSTA_API_LIST_POLL_MS = 60_000;

export const OnlineDashboard: React.FC = () => {
  const { t } = useTranslation();
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

  const [legacyWarehouse, setLegacyWarehouse] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(LEGACY_WH_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [analysisView, setAnalysisView] = useState<'bosta' | 'local'>('bosta');
  const [bostaCategoryFilter, setBostaCategoryFilter] = useState<'all' | BostaStateCategory>('all');
  const [bostaOnlyNoLocal, setBostaOnlyNoLocal] = useState(false);
  const [bostaTrackingQuery, setBostaTrackingQuery] = useState('');
  const [bostaApiPage, setBostaApiPage] = useState(1);
  const [bostaListRefetchNonce, setBostaListRefetchNonce] = useState(0);

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

    const postAction = {
      label: 'مسح — للبوسطة',
      icon: 'search',
      onClick: () => tenantNav('/online/scan/post'),
    };
    const whAction = {
      label: legacyWarehouse ? 'مسح — للمخزن' : 'مسح — للمخزن (وضع قديم)',
      icon: 'search',
      onClick: () => tenantNav('/online/scan/warehouse'),
    };

    if (canPost) {
      primaryAction = postAction;
    }
    if (canWh) {
      if (legacyWarehouse) {
        if (primaryAction) secondaryAction = whAction;
        else primaryAction = whAction;
      } else {
        moreActions.push({ ...whAction, group: 'مسح' });
      }
    }
    if (canCancelFromWarehouseQueue) {
      moreActions.push({
        label: 'مسح إلغاء من التسليم',
        onClick: () => tenantNav('/online/cancel-dispatch-scan'),
        group: 'مسح',
      });
    }
    return { primaryAction, secondaryAction, moreActions };
  }, [uid, can, tenantNav, canCancelFromWarehouseQueue, legacyWarehouse]);

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

  useEffect(() => {
    const handler = () => setBostaListRefetchNonce((n) => n + 1);
    window.addEventListener(ONLINE_DISPATCH_BOSTA_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(ONLINE_DISPATCH_BOSTA_INVALIDATE_EVENT, handler);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEGACY_WH_STORAGE_KEY, legacyWarehouse ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [legacyWarehouse]);

  const { startMs: rangeStartMs, endMs: rangeEndMs } = useMemo(
    () => parseYmdRangeToDispatchDayLocalBounds(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );

  /** نفس منطق صف «سجلات النظام» بدون فلتر الباركود/الحالة — لمزامنة بوسطة للنطاق. */
  const shipmentsInDashboardDateRange = useMemo(
    () => rows.filter((r) => shipmentTouchesDateRange(r, rangeStartMs, rangeEndMs)),
    [rows, rangeStartMs, rangeEndMs],
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

  const { items: bostaListItems, truncated: bostaListTruncated, loading: bostaListLoading, error: bostaListError } =
    useBostaDeliveriesForRange(rangeFrom, rangeTo, bostaListRefetchNonce, {
      pollIntervalMs: BOSTA_API_LIST_POLL_MS,
    });
  const mergedBostaRows = useMergedBostaRows(bostaListItems, rows);

  const filteredMergedBosta = useMemo(() => {
    let list = mergedBostaRows;
    if (bostaCategoryFilter !== 'all') {
      list = list.filter((r) => categorizeBostaStateLabel(r.api.stateLabel) === bostaCategoryFilter);
    }
    if (bostaOnlyNoLocal) {
      list = list.filter((r) => !r.local);
    }
    const q = bostaTrackingQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.api.trackingNumber.toLowerCase().includes(q));
    }
    return list;
  }, [mergedBostaRows, bostaCategoryFilter, bostaOnlyNoLocal, bostaTrackingQuery]);

  const bostaTableAnalytics = useMemo(
    () => summarizeMergedBostaRows(filteredMergedBosta),
    [filteredMergedBosta],
  );

  const fullBostaRangeAnalytics = useMemo(
    () => summarizeMergedBostaRows(mergedBostaRows),
    [mergedBostaRows],
  );

  useEffect(() => {
    setBostaApiPage(1);
  }, [rangeFrom, rangeTo, bostaListItems.length, bostaCategoryFilter, bostaOnlyNoLocal, bostaTrackingQuery]);

  const bostaApiTotalPages = Math.max(1, Math.ceil(filteredMergedBosta.length / SHIPMENTS_PAGE_SIZE));

  useEffect(() => {
    setBostaApiPage((p) => Math.min(p, bostaApiTotalPages));
  }, [bostaApiTotalPages]);

  const paginatedMergedBosta = useMemo(
    () =>
      filteredMergedBosta.slice(
        (bostaApiPage - 1) * SHIPMENTS_PAGE_SIZE,
        bostaApiPage * SHIPMENTS_PAGE_SIZE,
      ),
    [filteredMergedBosta, bostaApiPage],
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

  const handleExportBostaMergedAll = () => {
    if (mergedBostaRows.length === 0) {
      toast.error(t('shared.noResults'));
      return;
    }
    exportBostaApiMergedExcel(mergedBostaRows);
    toast.success(`${t('onlineDispatchDashboard.exportBostaMergedAll')} (${mergedBostaRows.length})`);
  };

  const handleExportBostaMergedFiltered = () => {
    if (filteredMergedBosta.length === 0) {
      toast.error(t('shared.noResults'));
      return;
    }
    exportBostaApiMergedExcel(filteredMergedBosta);
    toast.success(`${t('onlineDispatchDashboard.exportBostaMergedFiltered')} (${filteredMergedBosta.length})`);
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

      <OnlineDashboardDateContextBar
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        onRangeFromChange={setRangeFrom}
        onRangeToChange={setRangeTo}
        endActions={
          can('onlineDispatch.view') || can('onlineDispatch.manage') ? (
            <OnlineBostaFirestoreSyncButtons
              rangeSyncDocIds={shipmentsInDashboardDateRange.map((r) => r.id)}
            />
          ) : undefined
        }
        sectionIds={{
          bostaApi: 'online-dashboard-bosta-api',
          firestore: 'online-dashboard-firestore',
          reconciliation: 'online-dashboard-reconciliation',
        }}
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="order-1 min-w-0 flex-1 space-y-6 xl:order-1">
      <OnlineDispatchKpisSection
        tenantShipments={rows}
        dateFrom={rangeFrom}
        dateTo={rangeTo}
        onDateFromChange={setRangeFrom}
        onDateToChange={setRangeTo}
        bostaListStats={{
          count: bostaListItems.length,
          loading: bostaListLoading,
          error: bostaListError,
          truncated: bostaListTruncated,
        }}
        showControls={false}
        kpiSectionCardId="online-dashboard-kpi"
        kpiScrollTargetIds={{
          queue: 'online-dashboard-firestore',
          bostaApi: 'online-dashboard-bosta-api',
          firestore: 'online-dashboard-firestore',
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={analysisView === 'bosta' ? 'default' : 'outline'}
          onClick={() => setAnalysisView('bosta')}
        >
          {t('onlineDispatchDashboard.analysisTabBosta')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={analysisView === 'local' ? 'default' : 'outline'}
          onClick={() => setAnalysisView('local')}
        >
          {t('onlineDispatchDashboard.analysisTabLocal')}
        </Button>
        {legacyWarehouse ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ms-auto sm:ms-0"
            aria-expanded={lagPanelVisible}
            onClick={() => {
              setLagPanelVisible((v) => {
                const next = !v;
                if (!next) setLagTableVisible(false);
                return next;
              });
            }}
          >
            {lagPanelVisible
              ? t('onlineDispatchDashboard.lagPanelToggleHide')
              : t('onlineDispatchDashboard.lagPanelToggleShow')}
          </Button>
        ) : null}
      </div>

      {firebaseConfigured && analysisView === 'bosta' ? (
        <Card className="shadow-sm border-emerald-500/15" id="online-dashboard-bosta-api">
          <CardHeader className="space-y-3 border-b bg-emerald-500/[0.06] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold">
                  {t('onlineDispatchDashboard.bostaApiCardTitle')}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {t('onlineDispatchDashboard.bostaApiCardDescription')}
                </CardDescription>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:items-end">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="online-legacy-wh"
                    checked={legacyWarehouse}
                    onCheckedChange={(v) => setLegacyWarehouse(v === true)}
                  />
                  <Label htmlFor="online-legacy-wh" className="cursor-pointer text-xs font-normal">
                    {t('onlineDispatchDashboard.legacyWarehouseMode')}
                  </Label>
                </div>
                {canExportOnlineShipments && mergedBostaRows.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5">
                        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                        {t('onlineDispatchDashboard.exportBostaMerged')}
                        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[14rem]">
                      <DropdownMenuItem onClick={handleExportBostaMergedAll}>
                        {t('onlineDispatchDashboard.exportBostaMergedAll')}
                        <span className="ms-auto tabular-nums text-muted-foreground">({mergedBostaRows.length})</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleExportBostaMergedFiltered}
                        disabled={filteredMergedBosta.length === 0}
                      >
                        {t('onlineDispatchDashboard.exportBostaMergedFiltered')}
                        <span className="ms-auto tabular-nums text-muted-foreground">
                          ({filteredMergedBosta.length})
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          </CardHeader>
          {!bostaListLoading && !bostaListError ? (
            <>
              <div className="border-b border-border bg-muted/5 px-4 py-4 sm:px-6">
                <OnlineDashboardBostaCategoryKpiCards
                  analytics={fullBostaRangeAnalytics}
                  selectedFilter={bostaCategoryFilter}
                  onSelectCategory={setBostaCategoryFilter}
                  bostaApiSectionId="online-dashboard-bosta-api"
                />
              </div>
              <OnlineDashboardBostaApiSummaryBar
                analytics={bostaTableAnalytics}
                truncated={bostaListTruncated}
              />
              <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:px-6">
                <div className="w-full space-y-1.5 sm:w-[200px]">
                  <Label className="text-[11px] text-muted-foreground">
                    {t('onlineDispatchDashboard.bostaFiltersCategory')}
                  </Label>
                  <Select
                    value={bostaCategoryFilter}
                    onValueChange={(v) => setBostaCategoryFilter(v as 'all' | BostaStateCategory)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('onlineDispatchDashboard.bostaFiltersCategoryAll')}</SelectItem>
                      <SelectItem value="delivered">{t('onlineDispatchDashboard.bostaCategoryShort.delivered')}</SelectItem>
                      <SelectItem value="in_transit">{t('onlineDispatchDashboard.bostaCategoryShort.in_transit')}</SelectItem>
                      <SelectItem value="exception">{t('onlineDispatchDashboard.bostaCategoryShort.exception')}</SelectItem>
                      <SelectItem value="cancelled">{t('onlineDispatchDashboard.bostaCategoryShort.cancelled')}</SelectItem>
                      <SelectItem value="unknown">{t('onlineDispatchDashboard.bostaCategoryShort.unknown')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-0.5 sm:pb-2">
                  <Checkbox
                    id="bosta-filter-no-local"
                    checked={bostaOnlyNoLocal}
                    onCheckedChange={(v) => setBostaOnlyNoLocal(v === true)}
                  />
                  <Label htmlFor="bosta-filter-no-local" className="cursor-pointer text-xs font-normal">
                    {t('onlineDispatchDashboard.bostaFiltersNoLocalOnly')}
                  </Label>
                </div>
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label htmlFor="bosta-filter-tracking" className="text-[11px] text-muted-foreground">
                    {t('onlineDispatchDashboard.bostaTableColTracking')}
                  </Label>
                  <Input
                    id="bosta-filter-tracking"
                    value={bostaTrackingQuery}
                    onChange={(e) => setBostaTrackingQuery(e.target.value)}
                    placeholder={t('onlineDispatchDashboard.bostaFiltersTrackingPlaceholder')}
                    dir="ltr"
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            </>
          ) : null}
          <CardContent className="p-0">
            {bostaListLoading ? (
              <div className="space-y-3 px-4 py-6 sm:px-6" aria-busy="true">
                <Skeleton className="h-8 w-full max-w-md" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : bostaListError ? (
              <p className="px-4 py-6 text-sm text-rose-600 sm:px-6">{bostaListError}</p>
            ) : (
              <>
                <BostaApiShipmentsTable
                  rows={paginatedMergedBosta}
                  truncated={false}
                  emptyMessage={t('onlineDispatchDashboard.bostaTableEmpty')}
                />
                <OnlineDataPaginationFooter
                  page={bostaApiPage}
                  totalPages={bostaApiTotalPages}
                  totalItems={filteredMergedBosta.length}
                  onPageChange={setBostaApiPage}
                  itemLabel="بوليصة"
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {analysisView === 'bosta' ? (
      <Card className="shadow-sm border-violet-500/20" id="online-dashboard-reconciliation">
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
            showWarehouseColumn={legacyWarehouse}
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
      ) : null}

      {analysisView === 'local' ? (
        <Card className="shadow-sm" id="online-dashboard-firestore">
          <CardHeader className="space-y-3 border-b bg-muted/30 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <CardTitle className="text-base font-semibold leading-snug">
                  {t('onlineDispatchDashboard.classicFirestoreTrigger')}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {t('onlineDispatchDashboard.classicFirestoreDescription')}
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-baseline gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 shadow-sm sm:flex-col sm:items-end sm:py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">بعد الفلتر</span>
                <span className="text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                  {filteredShipments.length}
                </span>
              </div>
            </div>
          </CardHeader>
            <CardContent className="border-b bg-muted/30 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-end gap-4">
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
            </CardContent>
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
              <div className="flex flex-wrap gap-2 ">
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
            showWarehouseColumn={legacyWarehouse}
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
      ) : null}
        </div>

        {legacyWarehouse && lagPanelVisible ? (
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

      <OnlineDashboardDialogs
        cancelTarget={cancelTarget}
        cancelBusy={cancelBusy}
        onCancelClose={() => setCancelTarget(null)}
        onCancelConfirm={() => void confirmCancelFromDispatch()}
        bulkCancelIds={bulkCancelIds}
        bulkBusy={bulkBusy}
        onBulkClose={() => setBulkCancelIds(null)}
        onBulkConfirm={() => void confirmBulkCancelFromDispatch()}
        deleteTarget={deleteTarget}
        deleteBusy={deleteBusy}
        onDeleteClose={() => setDeleteTarget(null)}
        onDeleteConfirm={() => void confirmPermanentDelete()}
      />
    </div>
  );
};
