import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import { warehouseService } from '../services/warehouseService';
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
  formatDurationArabic,
  replenishmentDurationMs,
} from '@/modules/repair/lib/repairPartFulfillment';
import type {
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
  Warehouse,
} from '../types';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

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

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [stockoutOnly, setStockoutOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState(searchParams.get('toWarehouseId') || '');
  const [note, setNote] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ itemId: '', quantity: '1' }]);

  const centralWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouseRole === 'spare_parts_central'),
    [warehouses],
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
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (stockoutOnly) {
      list = list.filter((r) => (r.lines || []).some((line) => isStockoutDemandLine(line)));
    }
    return list;
  }, [rows, statusFilter, stockoutOnly]);

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
      <div className="p-6">
        <PageHeader title="تموين قطع الغيار للمراكز" />
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية عرض هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="تموين قطع الغيار للمراكز"
        subtitle="طلب من المركز → اعتماد → تجهيز → موافقة المسؤول → تأكيد الاستلام (دخول الرصيد عند الاستلام فقط). التسعير من ماستر المكونات مركزياً."
        actions={
          canCreate ? (
            <Button type="button" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'إخفاء النموذج' : 'طلب تموين جديد'}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="مطلوب ولم يُستلم">
          <p className="text-3xl font-bold text-amber-700">{kpis.pendingCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">طلبات قبل تأكيد الاستلام</p>
        </Card>
        <Card title="تم التموين + المدة">
          <p className="text-3xl font-bold">{kpis.receivedCount}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            متوسط زمن التنفيذ: {kpis.avgDurationLabel}
          </p>
        </Card>
        <Card title="قطع ناقصة (صفر هنا وهناك)">
          <p className="text-3xl font-bold text-rose-700">{kpis.stockoutLineCount}</p>
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
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
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

      <Card title="الطلبات">
        <div className="mb-3 flex flex-wrap gap-2 items-center">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
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
          <label className="inline-flex items-center gap-2 text-sm">
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
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)] p-2">جاري التحميل…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] p-2">لا توجد طلبات.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => {
              const id = String(row.id || '');
              const busy = busyId === id;
              return (
                <div
                  key={id}
                  className="rounded-xl border border-[var(--color-border)] p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm">{row.referenceNo}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        من {row.fromWarehouseName} → إلى {row.toWarehouseName}
                      </div>
                      <div className="text-xs mt-1">
                        {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status]}
                        {row.totalCostSnapshot != null
                          ? ` · تكلفة مركزية ${fmt(row.totalCostSnapshot)}`
                          : ''}
                        {row.status === 'received'
                          ? ` · المدة ${formatDurationArabic(replenishmentDurationMs(row.createdAt, row.receivedAt))}`
                          : ''}
                        {(row.lines || []).some((line) => isStockoutDemandLine(line))
                          ? ' · يحتوي قطعاً ناقصة'
                          : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {canApprove && canApproveSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction(id, () => sparePartsReplenishmentService.approve(id), 'تم الاعتماد')}
                        >
                          اعتماد
                        </Button>
                      ) : null}
                      {canPrepare && canPrepareSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction(id, () => sparePartsReplenishmentService.prepare(id), 'تم التجهيز')}
                        >
                          تجهيز
                        </Button>
                      ) : null}
                      {canResponsible && canResponsibleApproveSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction(
                            id,
                            () => sparePartsReplenishmentService.responsibleApprove(id),
                            'تمت موافقة المسؤول',
                          )}
                        >
                          موافقة المسؤول
                        </Button>
                      ) : null}
                      {canReceive && canReceiveSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void runAction(id, () => sparePartsReplenishmentService.receive(id), 'تم الاستلام ودخول الرصيد')}
                        >
                          تأكيد الاستلام
                        </Button>
                      ) : null}
                      {canApprove && canRejectSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void runAction(id, () => sparePartsReplenishmentService.reject(id), 'تم الرفض')}
                        >
                          رفض
                        </Button>
                      ) : null}
                      {canCreate && canCancelSparePartsRequest(row) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void runAction(id, () => sparePartsReplenishmentService.cancel(id), 'تم الإلغاء')}
                        >
                          إلغاء
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--color-text-muted)]">
                          <th className="text-start py-1">المكوّن</th>
                          <th className="text-start py-1">مطلوب</th>
                          <th className="text-start py-1">مجهّز</th>
                          <th className="text-start py-1">مستلم</th>
                          <th className="text-start py-1">تكلفة وحدة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(row.lines || []).map((line) => (
                          <tr key={line.lineId} className="border-t border-[var(--color-border)]/50">
                            <td className="py-1">{line.itemName}</td>
                            <td className="py-1">{fmt(line.requestedQty)}</td>
                            <td className="py-1">{fmt(line.preparedQty ?? line.requestedQty)}</td>
                            <td className="py-1">{line.receivedQty != null ? fmt(line.receivedQty) : '—'}</td>
                            <td className="py-1">{fmt(line.unitCostSnapshot)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
