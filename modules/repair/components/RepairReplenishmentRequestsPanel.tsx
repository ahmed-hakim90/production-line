import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Input } from '@/components/ui/input';
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { Label } from '@/components/ui/label';
import { toast } from '../../../components/Toast';
import { materialScanKeys } from '../../manufacturing/lib/materialScanKeys';
import type { TransferItemOption } from '../../inventory/utils/transferFormShared';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import type { SparePartsReplenishmentRequest } from '../../inventory/types';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
  canReceiveSparePartsRequest,
} from '../../inventory/lib/sparePartsReplenishment';
import { usePermission } from '../../../utils/permissions';
import type { RepairSparePart } from '../types';
import { RepairReplenishmentRequestPreviewModal } from './RepairReplenishmentRequestPreviewModal';

const STATUS_LABEL = SPARE_PARTS_REPLENISHMENT_STATUS_LABELS;

type DraftLine = { key: string; itemId: string; quantity: string };

type Props = {
  toWarehouseId?: string;
  /** Branch spare catalog — used to pick linked materials for a new request. */
  parts?: RepairSparePart[];
};

export const RepairReplenishmentRequestsPanel: React.FC<Props> = ({
  toWarehouseId,
  parts = [],
}) => {
  const { can } = usePermission();
  const canView =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canCreate = can('sparePartsReplenishment.create');
  const canReceive = can('sparePartsReplenishment.receive');

  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<SparePartsReplenishmentRequest | null>(null);
  const [note, setNote] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { key: '1', itemId: '', quantity: '1' },
  ]);

  const linkedPicker = useMemo(() => {
    const seen = new Set<string>();
    const catalog: TransferItemOption[] = [];
    const options: Array<{ value: string; label: string; searchText?: string }> = [];
    for (const part of parts) {
      const itemId = String(part.materialId || part.rawMaterialId || '').trim();
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      const scanKeys = materialScanKeys({ code: part.code });
      catalog.push({
        id: itemId,
        name: part.name,
        code: part.code || '',
        minStock: 0,
        stockItemType: 'material',
      });
      options.push({
        value: itemId,
        label: `${part.name}${part.code ? ` (${part.code})` : ''}`,
        searchText: scanKeys.join(' '),
      });
    }
    return { catalog, options };
  }, [parts]);

  const load = async () => {
    if (!canView || !toWarehouseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await sparePartsReplenishmentService.listPaged({
        toWarehouseId,
        limit: 20,
      });
      setRows(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل طلبات التموين.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, toWarehouseId]);

  if (!canView) return null;

  const submitCreate = async () => {
    if (!toWarehouseId) {
      toast.error('اختر فرعًا مربوطًا بمخزن صيانة أولًا.');
      return;
    }
    const lines = draftLines
      .map((line) => ({
        itemId: String(line.itemId || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.itemId && line.quantity > 0);
    if (lines.length === 0) {
      toast.error('أضف بند قطعة واحد على الأقل.');
      return;
    }
    setBusyId('create');
    try {
      // Central warehouse is resolved server-side when omitted — center users stay in repair.
      const created = await sparePartsReplenishmentService.create({
        fromWarehouseId: '',
        toWarehouseId,
        note: note.trim() || undefined,
        lines,
      });
      toast.success(`تم إنشاء طلب التموين ${created.referenceNo}`);
      setShowCreate(false);
      setNote('');
      setDraftLines([{ key: '1', itemId: '', quantity: '1' }]);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنشاء طلب التموين.');
    } finally {
      setBusyId(null);
    }
  };

  const receiveRequest = async (requestId: string) => {
    setBusyId(requestId);
    try {
      await sparePartsReplenishmentService.receive(requestId);
      toast.success('تم تأكيد استلام التموين.');
      setPreviewRequest(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'تعذر تأكيد الاستلام.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <OpsDashPanel
      title="تموين قطع الغيار من المخزن الرئيسي"
      accent="repair"
      action={(
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            تحديث
          </Button>
          {canCreate && (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowCreate((v) => !v)}
              disabled={!toWarehouseId}
            >
              {showCreate ? 'إخفاء النموذج' : 'طلب تموين'}
            </Button>
          )}
        </div>
      )}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        أنشئ الطلب واستلم الرصيد من داخل الصيانة — بدون فتح موديول المخازن.
      </p>
      <div className="space-y-4">
        {!toWarehouseId ? (
          <p className="text-sm text-muted-foreground">اختر فرعًا مربوطًا بمخزن صيانة لعرض الطلبات.</p>
        ) : null}

        {showCreate && canCreate && toWarehouseId ? (
          <div className="rounded border p-3 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">طلب تموين جديد لهذا المركز</p>
            <div>
              <Label>ملاحظة</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اختياري"
              />
            </div>
            {linkedPicker.options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد قطع مربوطة بماستر داتا في كتالوج الفرع. اربط القطع أولًا ثم أنشئ الطلب.
              </p>
            ) : (
              draftLines.map((line, index) => (
                <div key={line.key} className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <Label>القطعة</Label>
                    <VoucherItemCombobox
                      options={linkedPicker.options}
                      catalog={linkedPicker.catalog}
                      value={line.itemId}
                      onChange={(itemId) => {
                        setDraftLines((prev) =>
                          prev.map((row, i) => (i === index ? { ...row, itemId } : row)),
                        );
                      }}
                      placeholder="ابحث بالاسم أو امسح الباركود"
                    />
                  </div>
                  <div className="w-28">
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity}
                      onChange={(e) => {
                        const quantity = e.target.value;
                        setDraftLines((prev) =>
                          prev.map((row, i) => (i === index ? { ...row, quantity } : row)),
                        );
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraftLines((prev) =>
                        prev.length <= 1
                          ? [{ key: String(Date.now()), itemId: '', quantity: '1' }]
                          : prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    حذف
                  </Button>
                </div>
              ))
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraftLines((prev) => [
                    ...prev,
                    { key: String(Date.now()), itemId: '', quantity: '1' },
                  ])
                }
                disabled={linkedPicker.options.length === 0}
              >
                إضافة بند
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void submitCreate()}
                disabled={busyId === 'create' || linkedPicker.options.length === 0}
              >
                {busyId === 'create' ? 'جاري الإرسال…' : 'إرسال الطلب'}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات تموين لهذا المخزن.</p>
        ) : (
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">المرجع</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">بنود</th>
                  <th className="p-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = String(row.id || '');
                  const canRecv = canReceive && canReceiveSparePartsRequest(row);
                  return (
                    <tr key={id} className="border-t">
                      <td className="p-2 font-medium">
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => setPreviewRequest(row)}
                        >
                          {row.referenceNo}
                        </button>
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">
                          {STATUS_LABEL[row.status] || row.status}
                        </Badge>
                      </td>
                      <td className="p-2 tabular-nums">{row.lines?.length || 0}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPreviewRequest(row)}
                          >
                            معاينة
                          </Button>
                          {canRecv ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === id}
                              onClick={() => void receiveRequest(id)}
                            >
                              {busyId === id ? '…' : 'تأكيد الاستلام'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RepairReplenishmentRequestPreviewModal
        request={previewRequest}
        open={Boolean(previewRequest)}
        onOpenChange={(open) => {
          if (!open) setPreviewRequest(null);
        }}
        canReceive={canReceive}
        receiving={Boolean(previewRequest?.id && busyId === String(previewRequest.id))}
        onConfirmReceive={(requestId) => void receiveRequest(requestId)}
      />
    </OpsDashPanel>
  );
};
