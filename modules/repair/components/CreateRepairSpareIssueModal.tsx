import React, { useEffect, useMemo, useState } from 'react';
import { Button, SearchableSelect } from '../../../components/UI';
import { toast } from '../../../components/Toast';
import { stockService } from '../../inventory/services/stockService';
import { warehouseLocationService } from '../../inventory/services/warehouseLocationService';
import { MATERIAL_UNIT_LABELS, type MaterialUnit } from '../../manufacturing/types';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { sparePartsService } from '../services/sparePartsService';
import type { RepairBranch, RepairSparePart } from '../types';
import { RepairModalShell } from './RepairModalShell';

type DraftLine = {
  key: string;
  /** Catalog spare part id (optional metadata). */
  partId: string;
  /** Manufacturing material id posted to inventory. */
  itemId: string;
  quantity: number;
  locationId: string;
};

const emptyDraftLine = (): DraftLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  partId: '',
  itemId: '',
  quantity: 0,
  locationId: '',
});

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type PartOption = {
  value: string;
  label: string;
  partId?: string;
  partName?: string;
  unit?: string;
  /** Sale/usage price only — never purchase cost. */
  salePrice?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  branches: RepairBranch[];
};

export const CreateRepairSpareIssueModal: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  branches,
}) => {
  const usableBranches = useMemo(
    () => branches.filter((b) => String(b.warehouseId || '').trim() && String(b.id || '').trim()),
    [branches],
  );

  const [branchId, setBranchId] = useState('');
  const [note, setNote] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobCode, setJobCode] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [locations, setLocations] = useState<Array<{ id: string; code: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const selectedBranch = usableBranches.find((b) => b.id === branchId);
  const warehouseId = String(selectedBranch?.warehouseId || '').trim();

  useEffect(() => {
    if (!open) return;
    setBranchId(usableBranches[0]?.id || '');
    setNote('');
    setJobId('');
    setJobCode('');
    setLines([emptyDraftLine()]);
  }, [open, usableBranches]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !branchId || !warehouseId) {
        setParts([]);
        setBalances(new Map());
        setLocations([]);
        return;
      }
      setLoadingMeta(true);
      try {
        const [partRows, stockRows, locationRows] = await Promise.all([
          sparePartsService.listParts(branchId),
          stockService.getBalances(warehouseId),
          warehouseLocationService.getActiveByWarehouse(warehouseId),
        ]);
        if (cancelled) return;
        setParts(partRows);
        const map = new Map<string, number>();
        stockRows.forEach((row) => {
          if (row.itemType === 'material') {
            map.set(row.itemId, Number(row.quantity || 0));
          }
        });
        setBalances(map);
        setLocations(
          locationRows
            .filter((loc) => loc.id)
            .map((loc) => ({ id: String(loc.id), code: String(loc.code || loc.id) })),
        );
      } catch (error: unknown) {
        if (!cancelled) {
          setParts([]);
          setBalances(new Map());
          setLocations([]);
          const message = String((error as { message?: unknown })?.message || '');
          if (/missing or insufficient permissions/i.test(message)) {
            toast.error('ليس لديك صلاحية كافية لتحميل قطع الغيار أو أرصدة المخزن.');
          } else {
            toast.error(message || 'تعذر تحميل قطع الغيار لهذا الفرع.');
          }
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, branchId, warehouseId]);

  const itemOptions = useMemo((): PartOption[] => {
    const linked: PartOption[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const materialId = String(part.materialId || part.rawMaterialId || '').trim();
      if (!materialId || seen.has(materialId)) continue;
      seen.add(materialId);
      linked.push({
        value: materialId,
        label: `${part.name}${part.code ? ` (${part.code})` : ''}`,
        partId: part.id,
        partName: part.name,
        unit: part.unit,
        salePrice: Number(part.defaultSalePrice || 0),
      });
    }
    return linked;
  }, [parts]);

  const locationsRequired = locations.length > 0;

  if (!open) return null;

  const handleCreate = async () => {
    if (!branchId || !warehouseId) {
      toast.error('حدد فرع صيانة له مخزن مرتبط.');
      return;
    }
    const payloadLines = lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => {
        const loc = locations.find((l) => l.id === line.locationId);
        return {
          itemId: line.itemId,
          quantity: Number(line.quantity),
          ...(line.locationId
            ? { locationId: line.locationId, locationCode: loc?.code || line.locationId }
            : {}),
        };
      });
    if (!payloadLines.length) {
      toast.error('أضف بند قطعة غيار واحداً على الأقل.');
      return;
    }
    if (locationsRequired && payloadLines.some((line) => !line.locationId)) {
      toast.error('حدد رف المصدر لكل بند.');
      return;
    }

    const singleLine = lines.filter((line) => line.itemId && Number(line.quantity) > 0);
    const firstLine = singleLine.length === 1 ? singleLine[0] : null;
    const firstOption = firstLine
      ? itemOptions.find((opt) => opt.value === firstLine.itemId)
      : null;

    setSaving(true);
    try {
      const created = await repairSpareIssueService.create({
        warehouseId,
        branchId,
        note: note.trim() || undefined,
        ...(String(jobId || '').trim()
          ? { jobId: String(jobId).trim(), jobCode: String(jobCode || jobId).trim() }
          : {}),
        lines: payloadLines,
        ...(firstOption?.partId
          ? {
              jobPartUsage: {
                partId: firstOption.partId,
                partName: firstOption.partName || firstOption.label,
                scope: 'job',
              },
            }
          : {}),
      });
      toast.success(`تم إنشاء السند ${created.referenceNo}`);
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء السند.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RepairModalShell
      title="سند صرف قطع غيار"
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={saving || loadingMeta}>
            {saving ? 'جاري الحفظ...' : 'حفظ السند'}
          </Button>
        </>
      )}
    >
      {usableBranches.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          لا توجد فروع صيانة بمخزن مرتبط. راجع شاشة الفروع أولًا.
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="font-bold">فرع الصيانة *</span>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setLines([emptyDraftLine()]);
            }}
          >
            <option value="">اختر فرع</option>
            {usableBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="font-bold">ملاحظة</span>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="font-bold">رقم طلب الصيانة (اختياري)</span>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="معرّف الطلب"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="font-bold">مرجع الطلب (اختياري)</span>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={jobCode}
            onChange={(e) => setJobCode(e.target.value)}
            placeholder="رقم الإيصال / المرجع"
          />
        </label>
      </div>

      {itemOptions.length === 0 && !loadingMeta && (
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-dashed p-3">
          لا توجد قطع مربوطة بماستر داتا لهذا الفرع. اربط القطع من شاشة قطع غيار فروع الصيانة أولًا.
        </p>
      )}

      {lines.map((line, index) => {
        const option = itemOptions.find((opt) => opt.value === line.itemId);
        const available = line.itemId ? Number(balances.get(line.itemId) || 0) : 0;
        const unitLabel = option?.unit
          ? (MATERIAL_UNIT_LABELS[option.unit as MaterialUnit] || option.unit)
          : '';
        const salePrice = Number(option?.salePrice || 0);
        return (
          <div
            key={line.key}
            className="flex flex-wrap md:flex-nowrap items-start gap-2 border border-[var(--color-border)] rounded-lg p-3"
          >
            <div className="flex-1 min-w-[160px] space-y-1">
              <p className="text-xs font-bold h-4">القطعة</p>
              <SearchableSelect
                options={itemOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                value={line.itemId}
                onChange={(value) => {
                  const selected = itemOptions.find((opt) => opt.value === value);
                  setLines((prev) => prev.map((row, i) => (
                    i === index
                      ? {
                          ...row,
                          itemId: value,
                          partId: selected?.partId || '',
                        }
                      : row
                  )));
                }}
                placeholder="اختر قطعة غيار"
              />
              <p className="text-[11px] text-[var(--color-text-muted)] h-4">
                {line.itemId
                  ? (salePrice > 0 ? `سعر الاستخدام: ${fmt(salePrice)}` : 'سعر الاستخدام: غير محدد')
                  : '\u00a0'}
              </p>
            </div>
            <div className="w-[7.5rem] shrink-0 space-y-1">
              <p className="text-xs font-bold h-4">الكمية {unitLabel ? `(${unitLabel})` : ''}</p>
              <input
                type="number"
                min={0}
                step="any"
                className="w-full h-10 border border-[var(--color-border)] rounded-lg px-3 py-2"
                value={line.quantity || ''}
                onChange={(e) => {
                  const quantity = Number(e.target.value);
                  setLines((prev) => prev.map((row, i) => (
                    i === index ? { ...row, quantity } : row
                  )));
                }}
              />
              <p className="text-[11px] text-[var(--color-text-muted)] h-4">
                {line.itemId ? `المتاح: ${fmt(available)}` : '\u00a0'}
              </p>
            </div>
            {locationsRequired && (
              <div className="w-[7.5rem] shrink-0 space-y-1">
                <p className="text-xs font-bold h-4">الرف</p>
                <select
                  className="w-full h-10 border border-[var(--color-border)] rounded-lg px-3 py-2"
                  value={line.locationId}
                  onChange={(e) => {
                    setLines((prev) => prev.map((row, i) => (
                      i === index ? { ...row, locationId: e.target.value } : row
                    )));
                  }}
                >
                  <option value="">اختر رف</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.code}</option>
                  ))}
                </select>
                <p className="text-[11px] h-4">{'\u00a0'}</p>
              </div>
            )}
            <div className="shrink-0 space-y-1">
              <p className="text-xs font-bold h-4">{'\u00a0'}</p>
              <Button
                type="button"
                variant="danger"
                className="h-10"
                onClick={() => setLines((prev) => (
                  prev.length <= 1 ? [emptyDraftLine()] : prev.filter((_, i) => i !== index)
                ))}
              >
                حذف
              </Button>
              <p className="text-[11px] h-4">{'\u00a0'}</p>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyDraftLine()])}>
        إضافة بند
      </Button>
    </RepairModalShell>
  );
};
