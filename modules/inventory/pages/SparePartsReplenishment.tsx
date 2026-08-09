import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import { warehouseService } from '../services/warehouseService';
import { stockService } from '../services/stockService';
import { sparePartsReplenishmentService } from '../services/sparePartsReplenishmentService';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
  canApproveSparePartsRequest,
  canCancelSparePartsRequest,
  canPrepareSparePartsRequest,
  canReceiveSparePartsRequest,
  canRejectSparePartsRequest,
  canResponsibleApproveSparePartsRequest,
  isPendingReplenishmentStatus,
  isStockoutDemandLine,
} from '../lib/sparePartsReplenishment';
import {
  allocateSparePartsReplenishmentFromLocations,
  normalizeSparePartsReplenishmentAllocations,
} from '../lib/sparePartsReplenishmentAllocation';
import {
  formatDurationArabic,
  replenishmentDurationMs,
} from '@/modules/repair/lib/repairPartFulfillment';
import type {
  SparePartsReplenishmentAllocation,
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
  Warehouse,
} from '../types';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const LIST_PAGE_SIZE = 20;

type DraftLine = { itemId: string; quantity: string };

export const SparePartsReplenishment: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();

  const canView = can('sparePartsReplenishment.view') || can('inventory.view');
  const canCreate = can('sparePartsReplenishment.create');
  const canApprove = can('sparePartsReplenishment.approve');
  const canPrepare = can('sparePartsReplenishment.prepare');
  const canResponsible = can('sparePartsReplenishment.responsibleApprove');
  const canReceive = can('sparePartsReplenishment.receive');
  const canCancelPerm = can('sparePartsReplenishment.cancel');
  const canRejectPerm = can('sparePartsReplenishment.reject');
  const canManageCounts = can('inventory.counts.manage');

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [stockoutOnly, setStockoutOnly] = useState(false);
  const [listTab, setListTab] = useState<'pending' | 'all'>('pending');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [listPage, setListPage] = useState(1);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  /** Suggested pick locations when the request doc has no persisted allocations yet. */
  const [suggestedAllocByLineId, setSuggestedAllocByLineId] = useState<
    Record<string, SparePartsReplenishmentAllocation[]>
  >({});

  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState(searchParams.get('toWarehouseId') || '');
  const [note, setNote] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ itemId: '', quantity: '1' }]);

  const centralWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouseRole === 'spare_parts_central'),
    [warehouses],
  );
  const primaryCentralWarehouseId = useMemo(
    () => String(fromWarehouseId || centralWarehouses[0]?.id || '').trim(),
    [fromWarehouseId, centralWarehouses],
  );
  const centerWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouseRole === 'maintenance_center'),
    [warehouses],
  );
  const activeMaterials = useMemo(
    () => materials.filter((m) => m.isActive !== false),
    [materials],
  );

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [whsResult, matsResult, itemsResult] = await Promise.allSettled([
        warehouseService.getActiveWarehouses(),
        materialService.getAll(),
        sparePartsReplenishmentService.listRecent(200),
      ]);

      if (whsResult.status === 'fulfilled') {
        const whs = whsResult.value;
        setWarehouses(whs);
        if (!fromWarehouseId) {
          const central = whs.find((w) => w.warehouseRole === 'spare_parts_central');
          if (central?.id) setFromWarehouseId(central.id);
        }
      } else {
        setWarehouses([]);
        toast.error(
          whsResult.reason?.message
          || 'تعذر تحميل المخازن. تحقق من صلاحيات المخزون أو ربط المخزن بالحساب.',
        );
      }

      setMaterials(matsResult.status === 'fulfilled' ? matsResult.value : []);

      if (itemsResult.status === 'fulfilled') {
        setRows(itemsResult.value);
      } else {
        setRows([]);
        toast.error(
          itemsResult.reason?.message
          || 'تعذر تحميل طلبات تموين قطع الغيار.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [canView, fromWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (listTab === 'pending') {
      list = list.filter((r) => isPendingReplenishmentStatus(r.status));
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (stockoutOnly) {
      list = list.filter((r) => (r.lines || []).some((line) => isStockoutDemandLine(line)));
    }
    return list;
  }, [rows, listTab, statusFilter, stockoutOnly]);

  const listTotalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, listTotalPages);
  const pagedRequests = useMemo(
    () => filtered.slice((safeListPage - 1) * LIST_PAGE_SIZE, safeListPage * LIST_PAGE_SIZE),
    [filtered, safeListPage],
  );

  const selectedRequest = useMemo(
    () => filtered.find((row) => String(row.id || '') === selectedId)
      || rows.find((row) => String(row.id || '') === selectedId)
      || null,
    [filtered, rows, selectedId],
  );

  useEffect(() => {
    setListPage(1);
  }, [statusFilter, stockoutOnly, listTab]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (selectedId && filtered.some((row) => String(row.id || '') === selectedId)) return;
    setSelectedId(String(filtered[0]?.id || ''));
  }, [filtered, selectedId]);

  const selectRequest = (id: string) => {
    setSelectedId(id);
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedRequest) {
        setSuggestedAllocByLineId({});
        return;
      }
      const needsSuggest = (selectedRequest.lines || []).some(
        (line) => normalizeSparePartsReplenishmentAllocations(line).length === 0,
      );
      if (!needsSuggest || !selectedRequest.fromWarehouseId) {
        setSuggestedAllocByLineId({});
        return;
      }
      if (
        selectedRequest.status === 'received'
        || selectedRequest.status === 'rejected'
        || selectedRequest.status === 'cancelled'
      ) {
        setSuggestedAllocByLineId({});
        return;
      }
      try {
        const balances = await stockService.getLocationBalances({
          warehouseId: selectedRequest.fromWarehouseId,
          itemType: 'material',
        });
        if (cancelled) return;
        const next: Record<string, SparePartsReplenishmentAllocation[]> = {};
        for (const line of selectedRequest.lines || []) {
          if (normalizeSparePartsReplenishmentAllocations(line).length > 0) continue;
          const qty = Number(line.preparedQty || line.requestedQty || 0);
          if (!(qty > 0)) continue;
          const itemBalances = balances.filter((b) => String(b.itemId) === String(line.itemId));
          const { allocations } = allocateSparePartsReplenishmentFromLocations(itemBalances, qty);
          if (allocations.length > 0) next[line.lineId] = allocations;
        }
        setSuggestedAllocByLineId(next);
      } catch {
        if (!cancelled) setSuggestedAllocByLineId({});
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedRequest]);

  const kpis = useMemo(() => {
    const pending = rows.filter((r) => isPendingReplenishmentStatus(r.status));
    const received = rows.filter((r) => r.status === 'received');
    const durations = received
      .map((r) => replenishmentDurationMs(r.createdAt, r.receivedAt))
      .filter((ms): ms is number => ms != null);
    const avgMs = durations.length
      ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length
      : null;
    const stockoutLineCount = rows.reduce(
      (sum, r) => sum + (r.lines || []).filter((line) => isStockoutDemandLine(line)).length,
      0,
    );
    const stockoutRequestCount = rows.filter((r) =>
      (r.lines || []).some((line) => isStockoutDemandLine(line)),
    ).length;
    return {
      pendingCount: pending.length,
      receivedCount: received.length,
      avgDurationLabel: formatDurationArabic(avgMs),
      stockoutLineCount,
      stockoutRequestCount,
    };
  }, [rows]);

  const runAction = async (
    id: string,
    action: () => Promise<void>,
    success: string,
  ) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنفيذ الإجراء.');
    } finally {
      setBusyId(null);
    }
  };

  const selectedBusy = Boolean(selectedRequest?.id && busyId === selectedRequest.id);

  const submitCreate = async () => {
    if (!fromWarehouseId || !toWarehouseId) {
      toast.error('حدد مخزن قطع الغيار المركزي ومخزن المركز.');
      return;
    }
    const lines = draftLines
      .map((line) => ({
        itemId: String(line.itemId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.itemId && line.quantity > 0);
    if (lines.length === 0) {
      toast.error('أضف بند مكوّن واحد على الأقل.');
      return;
    }
    setBusyId('create');
    try {
      const created = await sparePartsReplenishmentService.create({
        fromWarehouseId,
        toWarehouseId,
        note: note.trim() || undefined,
        lines,
      });
      toast.success(`تم إنشاء الطلب ${created.referenceNo}`);
      setShowCreate(false);
      setNote('');
      setDraftLines([{ itemId: '', quantity: '1' }]);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-5">
        <PageHeader title="تموين قطع الغيار للمراكز" icon="construction" />
        <p className="text-sm text-slate-500">ليس لديك صلاحية عرض هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 sm:space-y-5 px-1 sm:px-0">
      <PageHeader
        title="تموين قطع الغيار للمراكز"
        subtitle="طلب من المركز → اعتماد → تجهيز → موافقة المسؤول → تأكيد الاستلام (دخول الرصيد عند الاستلام فقط). التسعير من ماستر المكونات مركزياً."
        icon="construction"
        actions={
          (canManageCounts && primaryCentralWarehouseId) || canCreate
            ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {canManageCounts && primaryCentralWarehouseId ? (
                  <Link
                    className="min-w-0 flex-1 sm:flex-none"
                    to={withTenantPath(
                      tenantSlug,
                      `/inventory/warehouses/${encodeURIComponent(primaryCentralWarehouseId)}`,
                    )}
                  >
                    <Button type="button" variant="secondary" className="w-full sm:w-auto">
                      رفع أرصدة أول المدة
                    </Button>
                  </Link>
                ) : null}
                {canCreate ? (
                  <Button
                    type="button"
                    className="min-w-0 flex-1 sm:flex-none"
                    onClick={() => setShowCreate((v) => !v)}
                  >
                    {showCreate ? 'إخفاء النموذج' : 'طلب تموين جديد'}
                  </Button>
                ) : null}
              </div>
            )
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card title="مطلوب ولم يُستلم">
          <p className="text-2xl font-bold text-amber-700 sm:text-3xl">{kpis.pendingCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">طلبات قبل تأكيد الاستلام</p>
        </Card>
        <Card title="تم التموين + المدة">
          <p className="text-2xl font-bold sm:text-3xl">{kpis.receivedCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            متوسط زمن التنفيذ: {kpis.avgDurationLabel}
          </p>
        </Card>
        <Card title="قطع ناقصة (صفر هنا وهناك)">
          <p className="text-2xl font-bold text-rose-700 sm:text-3xl">{kpis.stockoutLineCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            في {kpis.stockoutRequestCount} طلب — أصناف معرفة بدون رصيد عند الطلب
          </p>
        </Card>
      </div>

      {centralWarehouses.length === 0 || centerWarehouses.length === 0 ? (
        <Card title="تهيئة المخازن">
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            أنشئ مخزناً بدور «{WAREHOUSE_ROLE_LABELS.spare_parts_central}» ومخزناً بدور «
            {WAREHOUSE_ROLE_LABELS.maintenance_center}» من إدارة المخازن.
          </p>
          <Link
            className="text-sm font-bold text-primary underline"
            to={withTenantPath(tenantSlug, '/inventory/warehouses')}
          >
            فتح إدارة المخازن
          </Link>
        </Card>
      ) : null}

      {showCreate && canCreate ? (
        <Card title="طلب تموين من المركز">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold space-y-1">
              <span>مخزن قطع الغيار المركزي</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                <option value="">اختر…</option>
                {centralWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold space-y-1">
              <span>مخزن المركز</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
              >
                <option value="">اختر…</option>
                {centerWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            المكوّنات غير مربوطة بمنتج طلب صيانة. التكلفة تُلتقط من سعر شراء المادة مركزياً — المركز لا يسعّر.
          </p>
          <div className="mt-3 space-y-2">
            {draftLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={line.itemId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftLines((prev) => prev.map((row, i) => (
                      i === idx ? { ...row, itemId: value } : row
                    )));
                  }}
                >
                  <option value="">اختر مكوّناً…</option>
                  {activeMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code || '—'}) — تكلفة {fmt(Number(m.purchaseCost || 0))}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={line.quantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftLines((prev) => prev.map((row, i) => (
                      i === idx ? { ...row, quantity: value } : row
                    )));
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={draftLines.length <= 1}
                >
                  حذف
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraftLines((prev) => [...prev, { itemId: '', quantity: '1' }])}
            >
              إضافة بند
            </Button>
          </div>
          <textarea
            className="mt-3 w-full border rounded-lg px-3 py-2 text-sm"
            rows={2}
            placeholder="ملاحظة (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={() => void submitCreate()}
              disabled={busyId === 'create'}
            >
              {busyId === 'create' ? 'جاري الإرسال…' : 'إرسال الطلب'}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm sm:w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">كل الحالات</option>
          {(Object.keys(SPARE_PARTS_REPLENISHMENT_STATUS_LABELS) as SparePartsReplenishmentStatus[]).map(
            (status) => (
              <option key={status} value={status}>
                {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[status]}
              </option>
            ),
          )}
        </select>
        <label className="inline-flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stockoutOnly}
            onChange={(e) => setStockoutOnly(e.target.checked)}
          />
          ناقص فقط
        </label>
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
          تحديث
        </Button>
        <span className="text-xs text-[var(--color-text-muted)] sm:ms-auto">
          الطلبات: {filtered.length}
        </span>
      </div>

      {/* Physical LTR row: details LEFT, requests RIGHT — content stays RTL. */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch" dir="ltr">
        <div ref={detailPanelRef} className="order-2 xl:order-1 min-w-0 flex-1 w-full" dir="rtl">
        <Card
          className="!p-0 overflow-hidden h-full"
          title={selectedRequest ? `تفاصيل ${selectedRequest.referenceNo}` : 'التفاصيل'}
        >
          {!selectedRequest ? (
            <p className="px-4 py-16 text-center text-sm text-[var(--color-text-muted)]">
              اختر طلباً من القائمة لعرض التفاصيل والإجراءات.
            </p>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-[var(--color-card)]/95 p-3 backdrop-blur sm:p-4">
                {canApprove && canApproveSparePartsRequest(selectedRequest) ? (
                  <ToneActionButton
                    action="approve"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.approve(String(selectedRequest.id)),
                      'تم الاعتماد',
                    )}
                  >
                    اعتماد
                  </ToneActionButton>
                ) : null}
                {canPrepare && canPrepareSparePartsRequest(selectedRequest) ? (
                  <Button
                    size="sm"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.prepare(String(selectedRequest.id)),
                      'تم التجهيز',
                    )}
                  >
                    تجهيز
                  </Button>
                ) : null}
                {canResponsible && canResponsibleApproveSparePartsRequest(selectedRequest) ? (
                  <Button
                    size="sm"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.responsibleApprove(String(selectedRequest.id)),
                      'تمت موافقة المسؤول',
                    )}
                  >
                    موافقة المسؤول
                  </Button>
                ) : null}
                {canReceive && canReceiveSparePartsRequest(selectedRequest) ? (
                  <ToneActionButton
                    action="approve"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.receive(String(selectedRequest.id)),
                      'تم الاستلام ودخول الرصيد',
                    )}
                  >
                    تأكيد الاستلام
                  </ToneActionButton>
                ) : null}
                {canRejectPerm && canRejectSparePartsRequest(selectedRequest) ? (
                  <ToneActionButton
                    action="reject"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.reject(String(selectedRequest.id)),
                      'تم الرفض',
                    )}
                  >
                    رفض
                  </ToneActionButton>
                ) : null}
                {canCancelPerm && canCancelSparePartsRequest(selectedRequest) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={selectedBusy}
                    onClick={() => void runAction(
                      String(selectedRequest.id),
                      () => sparePartsReplenishmentService.cancel(String(selectedRequest.id)),
                      'تم الإلغاء',
                    )}
                  >
                    إلغاء
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b bg-slate-50/60">
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">من مخزن</p>
                  <p className="mt-1 text-sm font-black">{selectedRequest.fromWarehouseName}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">إلى مخزن</p>
                  <p className="mt-1 text-sm font-black">{selectedRequest.toWarehouseName}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">الحالة</p>
                  <p className="mt-1 text-sm font-black">
                    {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[selectedRequest.status]}
                  </p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">التكلفة المركزية</p>
                  <p className="mt-1 text-sm font-black tabular-nums">
                    {selectedRequest.totalCostSnapshot != null
                      ? fmt(selectedRequest.totalCostSnapshot)
                      : '—'}
                  </p>
                </div>
                {selectedRequest.status === 'received' ? (
                  <div className="rounded-lg border bg-white p-3 md:col-span-2">
                    <p className="text-xs font-bold text-slate-500">مدة التنفيذ</p>
                    <p className="mt-1 text-sm font-black">
                      {formatDurationArabic(
                        replenishmentDurationMs(selectedRequest.createdAt, selectedRequest.receivedAt),
                      )}
                    </p>
                  </div>
                ) : null}
                {(selectedRequest.lines || []).some((line) => isStockoutDemandLine(line)) ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 md:col-span-2">
                    <p className="text-xs font-bold text-rose-700">تنبيه</p>
                    <p className="mt-1 text-sm font-semibold text-rose-800">يحتوي قطعاً ناقصة عند الطلب</p>
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="p-3 text-start">المكوّن</th>
                      <th className="p-3 text-center">مطلوب</th>
                      <th className="p-3 text-center">مجهّز</th>
                      <th className="p-3 text-center">مستلم</th>
                      <th className="p-3 text-start">اللوكيشن</th>
                      <th className="hidden p-3 text-center sm:table-cell">تكلفة وحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRequest.lines || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-sm text-slate-400">
                          لا توجد بنود في هذا الطلب.
                        </td>
                      </tr>
                    ) : (
                      (selectedRequest.lines || []).map((line) => {
                        const persisted = normalizeSparePartsReplenishmentAllocations(line);
                        const suggested = suggestedAllocByLineId[line.lineId] || [];
                        const allocations = persisted.length > 0 ? persisted : suggested;
                        const isSuggested = persisted.length === 0 && suggested.length > 0;
                        return (
                          <tr key={line.lineId} className="border-b align-top">
                            <td className="p-3">
                              <p className="font-medium">{line.itemName}</p>
                              {line.itemCode ? (
                                <p className="mt-0.5 text-xs font-mono text-slate-500">{line.itemCode}</p>
                              ) : null}
                              {line.unit ? (
                                <p className="mt-0.5 text-[11px] text-slate-400">الوحدة: {line.unit}</p>
                              ) : null}
                            </td>
                            <td className="p-3 text-center tabular-nums font-semibold">
                              {fmt(line.requestedQty)}
                            </td>
                            <td className="p-3 text-center tabular-nums">
                              {fmt(line.preparedQty ?? line.requestedQty)}
                            </td>
                            <td className="p-3 text-center tabular-nums">
                              {line.receivedQty != null ? fmt(line.receivedQty) : '—'}
                            </td>
                            <td className="p-3 text-xs">
                              {allocations.length > 0 ? (
                                <div className="space-y-1">
                                  {allocations.map((a) => {
                                    const rackShelf = [a.rack, a.shelf].filter(Boolean).join(' / ');
                                    return (
                                      <p key={`${a.locationId}-${a.quantity}`}>
                                        <span className="font-semibold text-slate-700">{a.locationCode}</span>
                                        {rackShelf ? (
                                          <span className="text-slate-500"> ({rackShelf})</span>
                                        ) : null}
                                        <span className="tabular-nums text-slate-600">
                                          {' '}· {fmt(a.quantity)}
                                        </span>
                                      </p>
                                    );
                                  })}
                                  {isSuggested ? (
                                    <p className="text-[11px] text-amber-700">مقترح — يُثبَّت عند التجهيز</p>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">
                                  {selectedRequest.status === 'submitted'
                                    ? 'يُحدد عند التجهيز'
                                    : 'بدون رفوف'}
                                </span>
                              )}
                              {line.shortageQty && line.shortageQty > 0 ? (
                                <p className="mt-1 font-semibold text-rose-600">
                                  نقص: {fmt(line.shortageQty)}
                                </p>
                              ) : null}
                            </td>
                            <td className="hidden p-3 text-center tabular-nums sm:table-cell">
                              {fmtMoney(line.unitCostSnapshot)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
        </div>

        <div className="order-1 w-full xl:order-2 xl:w-[360px] xl:shrink-0" dir="rtl">
        <Card
          className="!p-0 overflow-hidden h-full"
          title="الطلبات"
        >
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {([
              ['pending', `معلّق (${kpis.pendingCount})`],
              ['all', 'كل الطلبات'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setListTab(key);
                  setListPage(1);
                }}
                className={`min-h-9 flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold sm:flex-none sm:px-3 ${
                  listTab === key
                    ? 'border-primary bg-primary text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[min(52vh,420px)] overflow-y-auto xl:max-h-[min(70vh,720px)]">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد طلبات.</p>
          ) : (
            pagedRequests.map((row) => {
              const id = String(row.id || '');
              const selected = selectedId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`block w-full text-start border-b px-4 py-3 ${
                    selected ? 'bg-primary/10' : 'hover:bg-[var(--color-surface-hover)]'
                  }`}
                  onClick={() => selectRequest(id)}
                >
                  <p className="font-bold text-sm">{row.referenceNo}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                    من {row.fromWarehouseName} → إلى {row.toWarehouseName}
                  </p>
                  <p className="text-xs mt-1">
                    {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status]}
                    {(row.lines || []).some((line) => isStockoutDemandLine(line))
                      ? ' · ناقص'
                      : ''}
                  </p>
                </button>
              );
            })
          )}
          </div>
          {filtered.length > 0 ? (
            <DataPaginationFooter
              page={safeListPage}
              totalPages={listTotalPages}
              totalItems={filtered.length}
              onPageChange={setListPage}
              itemLabel="طلب"
            />
          ) : null}
        </Card>
        </div>
      </div>
    </div>
  );
};
