import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { getCurrentTenantIdOrNull } from '@/lib/currentTenant';
import { useLocalFormDraft } from '@/modules/shared/hooks';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useAppStore } from '../../../store/useAppStore';
import { materialService } from '../../manufacturing/services/materialService';
import { isMaterialOptedInForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import type { Material } from '../../manufacturing/types';
import { sparePartsPurchaseInvoiceService } from '../services/sparePartsPurchaseInvoiceService';
import type { SparePartsPurchaseInvoice as SparePartsPurchaseInvoiceDoc } from '../types';

type DraftLine = {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
};

type PurchaseInvoiceFormDraft = {
  supplierName: string;
  supplierInvoiceNo: string;
  notes: string;
  lines: DraftLine[];
};

const money = (n: number) =>
  n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyLine = (): DraftLine => ({
  key: globalThis.crypto?.randomUUID?.() || `l-${Date.now()}-${Math.random()}`,
  materialId: '',
  quantity: '1',
  unitPrice: '0',
});

const isPurchaseInvoiceFormDraftEmpty = (draft: PurchaseInvoiceFormDraft): boolean => {
  const hasHeader = Boolean(draft.supplierName.trim() || draft.supplierInvoiceNo.trim() || draft.notes.trim());
  const hasLines = draft.lines.some((line) => (
    Boolean(line.materialId)
    || String(line.quantity || '1') !== '1'
    || String(line.unitPrice || '0') !== '0'
  ));
  return !hasHeader && !hasLines;
};

export const SparePartsPurchaseInvoicePage: React.FC = () => {
  const { dir } = useAppDirection();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile);
  const canPost = can('inventory.transactions.create')
    || can('sparePartsReplenishment.prepare')
    || can('repair.parts.manage');

  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<SparePartsPurchaseInvoiceDoc[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const purchaseDraftValue = useMemo<PurchaseInvoiceFormDraft>(() => ({
    supplierName,
    supplierInvoiceNo,
    notes,
    lines,
  }), [supplierName, supplierInvoiceNo, notes, lines]);

  const { hasDraft, clearDraft } = useLocalFormDraft<PurchaseInvoiceFormDraft>({
    formKey: 'inventory:sparePurchaseInvoice',
    tenantId: getCurrentTenantIdOrNull() || user?.tenantId,
    userId: user?.id,
    value: purchaseDraftValue,
    isEmpty: isPurchaseInvoiceFormDraftEmpty,
    onRestore: (draft) => {
      setSupplierName(String(draft.supplierName || ''));
      setSupplierInvoiceNo(String(draft.supplierInvoiceNo || ''));
      setNotes(String(draft.notes || ''));
      setLines(
        Array.isArray(draft.lines) && draft.lines.length > 0
          ? draft.lines.map((line) => ({
              key: String(line.key || emptyLine().key),
              materialId: String(line.materialId || ''),
              quantity: String(line.quantity || '1'),
              unitPrice: String(line.unitPrice || '0'),
            }))
          : [emptyLine()],
      );
    },
  });

  const resetPurchaseDraftForm = () => {
    clearDraft();
    setLines([emptyLine()]);
    setSupplierName('');
    setSupplierInvoiceNo('');
    setNotes('');
  };

  const spareMaterials = useMemo(
    () => materials.filter((m) => isMaterialOptedInForSpareParts(m) && m.isActive !== false),
    [materials],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [mats, invoices] = await Promise.all([
        materialService.getAll(),
        sparePartsPurchaseInvoiceService.list(30),
      ]);
      setMaterials(mats);
      setRows(invoices);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل فواتير الشراء.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const draftTotal = useMemo(
    () => lines.reduce((sum, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || 0);
      if (!(qty > 0) || !(price >= 0)) return sum;
      return sum + qty * price;
    }, 0),
    [lines],
  );

  const post = async () => {
    if (!canPost || busy) return;
    const payload = lines
      .map((line) => ({
        materialId: String(line.materialId || '').trim(),
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
      }))
      .filter((line) => line.materialId && line.quantity > 0);
    if (payload.length === 0) {
      toast.error('أضف بندًا واحدًا على الأقل بكمية صحيحة.');
      return;
    }
    setBusy(true);
    try {
      const result = await sparePartsPurchaseInvoiceService.post({
        supplierName: supplierName.trim() || undefined,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payload,
      });
      toast.success(`تم ترحيل فاتورة الشراء ${result.invoiceNo} وتحديث متوسط التكلفة.`);
      clearDraft();
      setLines([emptyLine()]);
      setSupplierName('');
      setSupplierInvoiceNo('');
      setNotes('');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر ترحيل فاتورة الشراء.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="شراء قطع الغيار"
      dir={dir}
      hero={[
        { key: 'draft', label: 'إجمالي المسودة', value: money(draftTotal) },
        { key: 'posted', label: 'فواتير مرحّلة', value: rows.length },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      <OpsDashPanel title="فاتورة شراء قطع / مستهلكات (مخزن مركزي)" accent="inventory">
        <p className="mb-3 text-xs text-muted-foreground">
          يُرحَّل الوارد لمخزن قطع الغيار المركزي ويُحدَّث المتوسط المتحرك للتكلفة على الرصيد والصنف.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>المورّد</Label>
            <Input className="mt-1.5" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} disabled={!canPost || busy} />
          </div>
          <div>
            <Label>رقم فاتورة المورّد</Label>
            <Input className="mt-1.5" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} disabled={!canPost || busy} />
          </div>
          <div className="sm:col-span-2">
            <Label>ملاحظات</Label>
            <Input className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canPost || busy} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {lines.map((line, index) => (
            <div key={line.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <Label>الصنف</Label>
                <select
                  className="mt-1.5 flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={line.materialId}
                  disabled={!canPost || busy}
                  onChange={(e) => {
                    const materialId = e.target.value;
                    const mat = spareMaterials.find((m) => m.id === materialId);
                    setLines((prev) => prev.map((row, i) => (
                      i === index
                        ? {
                          ...row,
                          materialId,
                          unitPrice: mat ? String(Number(mat.purchaseCost || 0)) : row.unitPrice,
                        }
                        : row
                    )));
                  }}
                >
                  <option value="">اختر صنفًا</option>
                  {spareMaterials.map((mat) => (
                    <option key={mat.id} value={String(mat.id || '')}>
                      {mat.name}{mat.code ? ` (${mat.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>الكمية</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={line.quantity}
                  disabled={!canPost || busy}
                  onChange={(e) => setLines((prev) => prev.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)))}
                />
              </div>
              <div className="sm:col-span-3">
                <Label>سعر الوحدة</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitPrice}
                  disabled={!canPost || busy}
                  onChange={(e) => setLines((prev) => prev.map((row, i) => (i === index ? { ...row, unitPrice: e.target.value } : row)))}
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!canPost || busy || lines.length <= 1}
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                >
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!canPost || busy} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            بند إضافي
          </Button>
          {hasDraft ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={resetPurchaseDraftForm}>
              مسح المسودة
            </Button>
          ) : null}
          <Button type="button" disabled={!canPost || busy} onClick={() => void post()}>
            {busy ? 'جارٍ الترحيل…' : `ترحيل الفاتورة · ${money(draftTotal)} ج.م`}
          </Button>
        </div>
        {!canPost ? (
          <p className="mt-2 text-xs text-[rgb(var(--color-danger))]">ليس لديك صلاحية ترحيل فواتير شراء القطع.</p>
        ) : null}
      </OpsDashPanel>

      <OpsDashPanel title="آخر الفواتير المرحّلة" accent="inventory">
        {loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فواتير بعد.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((invoice) => (
              <div key={invoice.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{invoice.invoiceNo}</span>
                  <span className="tabular-nums font-semibold">{money(Number(invoice.total || 0))} ج.م</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {invoice.supplierName || 'بدون مورّد'}
                  {invoice.supplierInvoiceNo ? ` · ${invoice.supplierInvoiceNo}` : ''}
                  {' · '}
                  {(invoice.lines || []).length} بند
                  {invoice.postedAt ? ` · ${new Date(invoice.postedAt).toLocaleString('ar-EG')}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};

/** @deprecated Prefer SparePartsPurchaseInvoicePage — kept for lazyNamed route imports. */
export const SparePartsPurchaseInvoice = SparePartsPurchaseInvoicePage;
export default SparePartsPurchaseInvoicePage;
