import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '../../../components/UI';
import { toast } from '../../../components/Toast';
import { getCurrentTenantIdOrNull } from '@/lib/currentTenant';
import { useLocalFormDraft } from '@/modules/shared/hooks';
import { useAppStore } from '../../../store/useAppStore';
import { customerService } from '../../customers/services/customerService';
import type { CustomerType } from '../../customers/types';
import { stockService } from '../../inventory/services/stockService';
import { warehouseLocationService } from '../../inventory/services/warehouseLocationService';
import { materialService } from '../../manufacturing/services/materialService';
import { isMaterialAvailableForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import { MATERIAL_UNIT_LABELS, type Material, type MaterialUnit } from '../../manufacturing/types';
import { repairJobService } from '../services/repairJobService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { sparePartsService } from '../services/sparePartsService';
import type { RepairBranch, RepairSparePart } from '../types';
import { resolveRepairSalePrice } from '../utils/sparePartPricing';
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

type SpareIssueFormDraft = {
  branchId: string;
  note: string;
  jobId: string;
  jobCode: string;
  lines: DraftLine[];
};

const emptyDraftLine = (): DraftLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  partId: '',
  itemId: '',
  quantity: 0,
  locationId: '',
});

const isSpareIssueFormDraftEmpty = (draft: SpareIssueFormDraft): boolean => {
  const hasHeader = Boolean(draft.note.trim() || draft.jobId.trim() || draft.jobCode.trim());
  const hasLines = draft.lines.some((line) => Boolean(line.itemId) || Number(line.quantity) > 0 || Boolean(line.locationId));
  return !hasHeader && !hasLines;
};

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
  const user = useAppStore((s) => s.userProfile);
  const usableBranches = useMemo(
    () => branches.filter((b) => String(b.warehouseId || '').trim() && String(b.id || '').trim()),
    [branches],
  );

  const [branchId, setBranchId] = useState('');
  const [note, setNote] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobCode, setJobCode] = useState('');
  const [jobCustomerType, setJobCustomerType] = useState<CustomerType | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [locations, setLocations] = useState<Array<{ id: string; code: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const selectedBranch = usableBranches.find((b) => b.id === branchId);
  const warehouseId = String(selectedBranch?.warehouseId || '').trim();

  const spareIssueDraftValue = useMemo<SpareIssueFormDraft>(() => ({
    branchId,
    note,
    jobId,
    jobCode,
    lines,
  }), [branchId, note, jobId, jobCode, lines]);

  const { hasDraft, clearDraft } = useLocalFormDraft<SpareIssueFormDraft>({
    formKey: 'repair:spareIssueCreate',
    tenantId: getCurrentTenantIdOrNull() || user?.tenantId,
    userId: user?.id,
    value: spareIssueDraftValue,
    enabled: open,
    isEmpty: isSpareIssueFormDraftEmpty,
    onRestore: (draft) => {
      setBranchId(String(draft.branchId || usableBranches[0]?.id || ''));
      setNote(String(draft.note || ''));
      setJobId(String(draft.jobId || ''));
      setJobCode(String(draft.jobCode || ''));
      setLines(
        Array.isArray(draft.lines) && draft.lines.length > 0
          ? draft.lines.map((line) => ({
              key: String(line.key || emptyDraftLine().key),
              partId: String(line.partId || ''),
              itemId: String(line.itemId || ''),
              quantity: Number(line.quantity || 0),
              locationId: String(line.locationId || ''),
            }))
          : [emptyDraftLine()],
      );
    },
  });

  useEffect(() => {
    if (!open) return;
    // Seed default branch only when empty — do not wipe a restored draft.
    setBranchId((prev) => prev || usableBranches[0]?.id || '');
  }, [open, usableBranches]);

  useEffect(() => {
    if (!open) return;
    const id = String(jobId || '').trim();
    if (!id) {
      setJobCustomerType(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const job = await repairJobService.getById(id);
        const customerId = String(job?.customerId || '').trim();
        if (!customerId) {
          if (!cancelled) setJobCustomerType(null);
          return;
        }
        const customer = await customerService.getById(customerId);
        if (!cancelled) {
          setJobCustomerType(customer?.type === 'trader' ? 'trader' : customer?.type === 'consumer' ? 'consumer' : null);
        }
      } catch {
        if (!cancelled) setJobCustomerType(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  useEffect(() => {
    if (!open) return;
    void materialService.getAll()
      .then((rows) => setMaterials(rows.filter(
        (m) => m.isActive !== false && m.id && isMaterialAvailableForSpareParts(m),
      )))
      .catch(() => setMaterials([]));
  }, [open]);

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
    const saleByMaterialId = new Map<string, { consumer: number; trader: number }>();
    for (const material of materials) {
      const id = String(material.id || '').trim();
      if (!id) continue;
      saleByMaterialId.set(id, {
        consumer: Number(material.defaultSalePrice || 0),
        trader: Number(material.traderSalePrice || 0),
      });
    }

    const linked: PartOption[] = [];
    const seen = new Set<string>();
    const eligibleIds = new Set(materials.map((m) => String(m.id || '').trim()).filter(Boolean));
    for (const part of parts) {
      const materialId = String(part.materialId || part.rawMaterialId || '').trim();
      if (!materialId || seen.has(materialId)) continue;
      if (eligibleIds.size > 0 && !eligibleIds.has(materialId)) continue;
      seen.add(materialId);
      const prices = saleByMaterialId.get(materialId);
      linked.push({
        value: materialId,
        label: `${part.name}${part.code ? ` (${part.code})` : ''}`,
        partId: part.id,
        partName: part.name,
        unit: part.unit,
        salePrice: resolveRepairSalePrice({
          customerType: jobCustomerType,
          materialSalePrice: prices?.consumer,
          materialTraderSalePrice: prices?.trader,
          partSalePrice: part.defaultSalePrice,
        }),
      });
    }
    for (const material of materials) {
      const materialId = String(material.id || '').trim();
      if (!materialId || seen.has(materialId)) continue;
      seen.add(materialId);
      linked.push({
        value: materialId,
        label: `${material.name}${material.code ? ` (${material.code})` : ''}`,
        partName: material.name,
        unit: material.baseUnit,
        salePrice: resolveRepairSalePrice({
          customerType: jobCustomerType,
          materialSalePrice: material.defaultSalePrice,
          materialTraderSalePrice: material.traderSalePrice,
        }),
      });
    }
    return linked;
  }, [parts, materials, jobCustomerType]);

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
          // Optional preferred shelf — server auto-allocates across balances when omitted.
          ...(line.locationId
            ? { locationId: line.locationId, locationCode: loc?.code || line.locationId }
            : {}),
        };
      });
    if (!payloadLines.length) {
      toast.error('أضف بند قطعة غيار واحداً على الأقل.');
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
      clearDraft();
      setNote('');
      setJobId('');
      setJobCode('');
      setJobCustomerType(null);
      setLines([emptyDraftLine()]);
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
          {hasDraft ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                clearDraft();
                setNote('');
                setJobId('');
                setJobCode('');
                setJobCustomerType(null);
                setLines([emptyDraftLine()]);
                setBranchId(usableBranches[0]?.id || '');
              }}
            >
              مسح المسودة
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>إلغاء</Button>
          <Button type="button" className="w-full sm:w-auto" onClick={() => void handleCreate()} disabled={saving || loadingMeta}>
            {saving ? 'جاري الحفظ...' : 'حفظ السند'}
          </Button>
        </>
      )}
    >
      {usableBranches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد فروع صيانة بمخزن مرتبط. راجع شاشة الفروع أولًا.
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="font-bold">فرع الصيانة *</span>
          <SearchableSelect
            options={usableBranches.map((b) => ({ value: b.id, label: b.name }))}
            value={branchId}
            onChange={(value) => {
              setBranchId(value);
              setLines([emptyDraftLine()]);
            }}
            placeholder="ابحث واختر فرع"
          />
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
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
          لا توجد أصناف متاحة. تأكد من وجود مواد نشطة في ماستر المكونات.
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
            className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto] md:grid-cols-[minmax(0,1fr)_7.5rem_10rem_auto] md:items-start"
          >
            <div className="min-w-0 space-y-1">
              <p className="h-4 text-xs font-bold">القطعة</p>
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
                placeholder="ابحث واختر قطعة غيار"
              />
              <p className="h-4 text-[11px] text-muted-foreground">
                {line.itemId
                  ? (salePrice > 0
                    ? `سعر ${jobCustomerType === 'trader' ? 'التاجر' : 'المستهلك'}: ${fmt(salePrice)}`
                    : 'السعر: غير محدد')
                  : '\u00a0'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="h-4 text-xs font-bold">الكمية {unitLabel ? `(${unitLabel})` : ''}</p>
              <input
                type="number"
                min={0}
                step="any"
                className="h-10 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
                value={line.quantity || ''}
                onChange={(e) => {
                  const quantity = Number(e.target.value);
                  setLines((prev) => prev.map((row, i) => (
                    i === index ? { ...row, quantity } : row
                  )));
                }}
              />
              <p className="h-4 text-[11px] text-muted-foreground">
                {line.itemId ? `المتاح: ${fmt(available)}` : '\u00a0'}
              </p>
            </div>
            {locationsRequired ? (
              <div className="min-w-0 space-y-1 sm:col-span-2 md:col-span-1">
                <p className="h-4 text-xs font-bold">رف مفضّل</p>
                <SearchableSelect
                  options={[
                    { value: '', label: 'تلقائي من الأرصدة' },
                    ...locations.map((loc) => ({ value: loc.id, label: loc.code })),
                  ]}
                  value={line.locationId}
                  onChange={(value) => {
                    setLines((prev) => prev.map((row, i) => (
                      i === index ? { ...row, locationId: value } : row
                    )));
                  }}
                  placeholder="تلقائي من الأرصدة"
                />
                <p className="h-4 text-[11px] text-muted-foreground">يُحضَّر مثل صرف الإنتاج</p>
              </div>
            ) : null}
            <div className="space-y-1">
              <p className="hidden h-4 text-xs font-bold md:block">{'\u00a0'}</p>
              <Button
                type="button"
                variant="destructive"
                className="h-10 w-full md:w-auto"
                onClick={() => setLines((prev) => (
                  prev.length <= 1 ? [emptyDraftLine()] : prev.filter((_, i) => i !== index)
                ))}
              >
                حذف
              </Button>
              <p className="hidden h-4 text-[11px] md:block">{'\u00a0'}</p>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setLines((prev) => [...prev, emptyDraftLine()])}>
        إضافة بند
      </Button>
    </RepairModalShell>
  );
};
