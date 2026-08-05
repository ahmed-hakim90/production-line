import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '../components/UI';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { warehouseService } from '../services/warehouseService';
import { materialService } from '../../manufacturing/services/materialService';
import { sparePartsRecallService } from '../services/sparePartsRecallService';
import {
  SPARE_PARTS_RECALL_STATUS_LABELS,
  canCancelSparePartsRecall,
  canConfirmSparePartsRecall,
} from '../lib/sparePartsRecall';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';
import type { SparePartsRecallRequest, Warehouse } from '../types';
import type { Material } from '../../manufacturing/types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type DraftLine = { itemId: string; quantity: string };

export const SparePartsRecall: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();

  const canView = can('sparePartsRecall.view') || can('sparePartsReplenishment.view') || can('inventory.view');
  const canCreate = can('sparePartsRecall.create');
  const canConfirm = can('sparePartsRecall.confirm');
  const canCancel = can('sparePartsRecall.cancel');

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<SparePartsRecallRequest[]>([]);
  const [showCreate, setShowCreate] = useState(Boolean(searchParams.get('fromWarehouseId')));

  const [fromWarehouseId, setFromWarehouseId] = useState(searchParams.get('fromWarehouseId') || '');
  const [note, setNote] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ itemId: '', quantity: '1' }]);

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
      const [whs, mats, items] = await Promise.all([
        warehouseService.getActiveWarehouses().catch(() => [] as Warehouse[]),
        materialService.getAll().catch(() => [] as Material[]),
        sparePartsRecallService.listRecent(150).catch(() => [] as SparePartsRecallRequest[]),
      ]);
      setWarehouses(whs);
      setMaterials(mats);
      setRows(items);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر التحميل.');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const linesParam = searchParams.get('lines') || '';
    if (!linesParam) return;
    const parsed = linesParam.split(',').map((part) => {
      const [itemId, quantity] = part.split(':');
      return { itemId: String(itemId || '').trim(), quantity: String(quantity || '1') };
    }).filter((row) => row.itemId);
    if (parsed.length) {
      setDraftLines(parsed);
      setShowCreate(true);
    }
  }, [searchParams]);

  const submitCreate = async () => {
    if (!fromWarehouseId) {
      toast.error('حدد مخزن المركز.');
      return;
    }
    const lines = draftLines
      .map((line) => ({
        itemId: String(line.itemId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.itemId && line.quantity > 0);
    if (!lines.length) {
      toast.error('أضف بنداً واحداً على الأقل.');
      return;
    }
    setBusyId('create');
    try {
      const created = await sparePartsRecallService.create({
        fromWarehouseId,
        note,
        lines,
      });
      toast.success(`تم إنشاء طلب السحب ${created.referenceNo}`);
      setShowCreate(false);
      setNote('');
      setDraftLines([{ itemId: '', quantity: '1' }]);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (
    requestId: string,
    action: 'confirm' | 'cancel',
  ) => {
    setBusyId(`${action}:${requestId}`);
    try {
      if (action === 'confirm') await sparePartsRecallService.confirm(requestId);
      else await sparePartsRecallService.cancel(requestId);
      toast.success(action === 'confirm' ? 'تم تأكيد السحب وترحيل الرصيد.' : 'تم إلغاء الطلب.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="سحب من المراكز" />
        <p className="text-sm text-[var(--color-text-muted)]">ليس لديك صلاحية العرض.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="سحب قطع الغيار من المراكز"
        subtitle="المركزي يطلب سحب كمية من مركز → المركز يؤكد → الرصيد يرجع للمخزن الرئيسي."
        actions={(
          <div className="flex flex-wrap gap-2">
            {canCreate ? (
              <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-center-stock')}>
                <Button type="button" variant="secondary">أرصدة المراكز</Button>
              </Link>
            ) : null}
            {canCreate ? (
              <Button type="button" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? 'إخفاء النموذج' : 'طلب سحب جديد'}
              </Button>
            ) : null}
          </div>
        )}
      />

      {showCreate && canCreate ? (
        <Card title="طلب سحب إلى المخزن الرئيسي">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold space-y-1">
              <span>من مخزن المركز</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                <option value="">اختر…</option>
                {centerWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({WAREHOUSE_ROLE_LABELS.maintenance_center})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold space-y-1">
              <span>ملاحظة</span>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
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
                      {m.name} ({m.code || '—'})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="border rounded-lg px-3 py-2"
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
              variant="ghost"
              size="sm"
              onClick={() => setDraftLines((prev) => [...prev, { itemId: '', quantity: '1' }])}
            >
              إضافة بند
            </Button>
          </div>
          <div className="mt-4">
            <Button type="button" onClick={() => void submitCreate()} disabled={busyId === 'create'}>
              {busyId === 'create' ? 'جاري الإنشاء…' : 'إنشاء طلب السحب'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="طلبات السحب">
        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد طلبات بعد.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-bold">{row.referenceNo}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {row.fromWarehouseName} → {row.toWarehouseName}
                    </div>
                    <div className="text-xs font-semibold mt-1">
                      {SPARE_PARTS_RECALL_STATUS_LABELS[row.status]}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canConfirm && canConfirmSparePartsRecall(row) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === `confirm:${row.id}`}
                        onClick={() => void runAction(String(row.id), 'confirm')}
                      >
                        تأكيد السحب
                      </Button>
                    ) : null}
                    {canCancel && canCancelSparePartsRecall(row) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === `cancel:${row.id}`}
                        onClick={() => void runAction(String(row.id), 'cancel')}
                      >
                        إلغاء
                      </Button>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-2 text-xs space-y-1">
                  {(row.lines || []).map((line) => (
                    <li key={line.lineId}>
                      {line.itemName} ({line.itemCode || '—'}) — {fmt(line.requestedQty)}
                      {line.confirmedQty != null ? ` · مؤكد ${fmt(line.confirmedQty)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SparePartsRecall;
