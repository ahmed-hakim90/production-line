import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, ExternalLink, Loader2, Pencil, Plus, Power, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '@/utils/permissions';
import { stockService } from '../../inventory/services/stockService';
import type { StockItemBalance, StockTransaction } from '../../inventory/types';
import { MATERIAL_UPDATE_PATHS } from '../../system/lib/operationPathSettings';
import { useMaterial, useMaterialMutations, useMaterials } from '../hooks/useMaterials';
import { useBomItemMutations, useMaterialBom } from '../hooks/useProductBom';
import { MATERIAL_HEALTH_LABELS, materialDataHealth } from '../lib/materialCatalog';
import { MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS, materialPurchaseCostPerBaseUnit, type BomItem } from '../types';

type TabKey = 'overview' | 'procurement' | 'bom' | 'inventory' | 'spare' | 'history';
const TABS: Array<[TabKey, string]> = [['overview', 'نظرة عامة'], ['procurement', 'الشراء والتكلفة'], ['bom', 'قائمة المواد BOM'], ['inventory', 'المخزون والحركة'], ['spare', 'قطع الغيار'], ['history', 'السجل']];
const fmt = (value: number) => value.toLocaleString('ar-EG', { maximumFractionDigits: 2 });

export const MaterialDetails: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManageMaterial = can('materials.manage');
  const canManageBom = can('bom.manage') || canManageMaterial;
  const canViewInventory = can('inventory.view');
  const canManagePricing = can('repair.pricing.manage');
  const { data: material, isLoading, refetch } = useMaterial(id);
  const { data: materials = [] } = useMaterials();
  const { data: bomData, isLoading: bomLoading } = useMaterialBom(id);
  const { update } = useMaterialMutations();
  const { addItem, updateItem, deleteItem } = useBomItemMutations('material', id);
  const [tab, setTab] = useState<TabKey>('overview');
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [movements, setMovements] = useState<StockTransaction[]>([]);
  const [inventoryState, setInventoryState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [form, setForm] = useState({ materialId: '', qtyPerUnit: 0, wastePercent: 0, sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => materials.filter((row) => row.id && row.id !== id && row.isActive !== false), [materials, id]);
  const health = useMemo(() => material ? materialDataHealth(material, { bomItemCount: bomData?.rows.length }) : [], [material, bomData?.rows.length]);
  const totalOnHand = balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalAvailable = balances.reduce((sum, row) => sum + Number(row.availableQty ?? row.quantity ?? 0), 0);

  useEffect(() => {
    if (tab !== 'inventory' || !canViewInventory || !id) return;
    let active = true;
    setInventoryState('loading');
    void Promise.all([
      stockService.getBalancesForItems([id]),
      stockService.getTransactionsPaged({ itemId: id, itemType: 'material', limit: 12 }),
    ]).then(([nextBalances, page]) => {
      if (!active) return;
      setBalances(nextBalances);
      setMovements(page.items);
      setInventoryState('idle');
    }).catch(() => { if (active) setInventoryState('error'); });
    return () => { active = false; };
  }, [tab, canViewInventory, id]);

  const resetBomForm = () => { setEditingRow(null); setForm({ materialId: '', qtyPerUnit: 0, wastePercent: 0, sortOrder: 0 }); };
  const saveBomRow = async () => {
    if (!canManageBom || !form.materialId || form.qtyPerUnit <= 0) return;
    setSaving(true);
    try {
      const selected = options.find((row) => row.id === form.materialId);
      const data = { itemId: form.materialId, itemType: 'material' as const, itemName: selected?.name, qtyPerUnit: form.qtyPerUnit, unit: selected?.baseUnit || 'piece', wastePercent: Math.max(0, form.wastePercent), sortOrder: form.sortOrder };
      if (editingRow) await updateItem.mutateAsync({ itemId: editingRow, data });
      else await addItem.mutateAsync(data);
      toast.success(editingRow ? 'تم تحديث سطر BOM.' : 'تمت إضافة المكوّن.');
      resetBomForm();
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'تعذر حفظ سطر BOM.'); }
    finally { setSaving(false); }
  };
  const toggleActive = async () => {
    if (!material || !canManageMaterial) return;
    await update.mutateAsync({ id, data: { isActive: material.isActive === false }, path: MATERIAL_UPDATE_PATHS.materialsPage });
    await refetch();
    toast.success(material.isActive === false ? 'تم تفعيل المادة.' : 'تم إيقاف المادة بأمان.');
  };
  const back = <Button variant="ghost" onClick={() => navigate('/manufacturing/materials')}><ArrowRight className="h-4 w-4" />رجوع للمواد</Button>;

  if (isLoading) return <ModuleOpsPageShell eyebrow="ملف المادة" actions={back}><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></ModuleOpsPageShell>;
  if (!material) return <ModuleOpsPageShell eyebrow="ملف المادة" actions={back}><OpsDashPanel title="المادة غير موجودة" accent="production"><p className="py-8 text-center text-muted-foreground">تعذر العثور على المادة أو لا تملك صلاحية عرضها.</p></OpsDashPanel></ModuleOpsPageShell>;

  return <ModuleOpsPageShell eyebrow="ملف المادة" rangeLabel={`${material.code} · ${MATERIAL_TYPE_LABELS[material.type]}`} actions={<div className="flex gap-2">{back}{canManageMaterial ? <Button variant="outline" onClick={() => void toggleActive()}><Power className="h-4 w-4" />{material.isActive === false ? 'تفعيل' : 'إيقاف'}</Button> : null}</div>}>
    <OpsDashPanel title={material.name} accent="production"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><StatusBadge label={material.isActive === false ? 'موقوفة' : 'نشطة'} type={material.isActive === false ? 'danger' : 'success'} /><StatusBadge label={material.isManufacturedInternally ? 'تصنيع داخلي' : 'شراء خارجي'} type={material.isManufacturedInternally ? 'warning' : 'muted'} />{health.slice(0, 3).map((item) => <StatusBadge key={item} label={MATERIAL_HEALTH_LABELS[item]} type={item === 'complete' ? 'success' : 'warning'} />)}</div><p className="mt-2 text-sm text-muted-foreground">{material.categoryName || 'بلا فئة'} · {MATERIAL_UNIT_LABELS[material.baseUnit]}</p></div><div className="flex flex-wrap gap-2">{canManageMaterial ? <Button onClick={() => navigate(`/manufacturing/materials?action=edit&id=${id}`)}><Pencil className="h-4 w-4" />تعديل البيانات</Button> : null}{canViewInventory ? <Button variant="outline" onClick={() => navigate(`/inventory/item-card?itemType=material&itemId=${encodeURIComponent(id)}`)}><ExternalLink className="h-4 w-4" />بطاقة الصنف</Button> : null}</div></div></OpsDashPanel>
    <div className="overflow-x-auto rounded-xl border bg-card p-1" role="tablist" aria-label="أقسام ملف المادة"><div className="flex min-w-max gap-1">{TABS.map(([key, label]) => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'default' : 'ghost'} onClick={() => setTab(key)}>{label}</Button>)}</div></div>
    {tab === 'overview' ? <Overview material={material} /> : null}
    {tab === 'procurement' ? <Procurement material={material} /> : null}
    {tab === 'bom' ? <OpsDashPanel title="قائمة المواد اللازمة لوحدة واحدة" accent="production">{bomLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="space-y-4"><BomTable rows={bomData?.rows || []} canManage={canManageBom} onEdit={(row) => { setEditingRow(row.id || null); setForm({ materialId: row.itemId, qtyPerUnit: row.qtyPerUnit, wastePercent: Number(row.wastePercent || 0), sortOrder: Number(row.sortOrder || 0) }); }} onDelete={(row) => { if (row.id && window.confirm(`حذف ${row.itemName} من BOM؟`)) void deleteItem.mutateAsync(row.id); }} />{canManageBom ? <BomEditor options={options} form={form} setForm={setForm} editing={Boolean(editingRow)} saving={saving} onSave={() => void saveBomRow()} onCancel={resetBomForm} /> : null}</div>}</OpsDashPanel> : null}
    {tab === 'inventory' ? <InventoryPanel allowed={canViewInventory} state={inventoryState} balances={balances} movements={movements} totalOnHand={totalOnHand} totalAvailable={totalAvailable} onOpen={() => navigate(`/inventory/item-card?itemType=material&itemId=${encodeURIComponent(id)}`)} /> : null}
    {tab === 'spare' ? <OpsDashPanel title="استخدام المادة كقطعة غيار" accent="plans"><InfoGrid rows={[["الظهور في الصيانة", material.availableForSpareParts === true ? 'مفعّل' : 'غير مفعّل'], ['سعر المستهلك', canManagePricing ? fmt(Number(material.defaultSalePrice || 0)) : 'محجوب حسب الصلاحية'], ['سعر الجملة', canManagePricing ? fmt(Number(material.traderSalePrice || 0)) : 'محجوب حسب الصلاحية']]} /></OpsDashPanel> : null}
    {tab === 'history' ? <OpsDashPanel title="السجل المتاح" accent="production"><InfoGrid rows={[["تاريخ الإنشاء", material.createdAt ? new Date(material.createdAt).toLocaleString('ar-EG') : 'غير متاح']]} /><p className="mt-3 text-xs text-muted-foreground">سجل التغييرات التفصيلي يحتاج مصدر تدقيق خادمي؛ لا يتم استنتاجه من بيانات المتصفح.</p></OpsDashPanel> : null}
  </ModuleOpsPageShell>;
};

function InfoGrid({ rows }: { rows: string[][] }) { return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>; }
function Overview({ material }: { material: NonNullable<ReturnType<typeof useMaterial>['data']> }) { return <OpsDashPanel title="بيانات الماستر" accent="production"><InfoGrid rows={[["الكود", material.code], ['الفئة', material.categoryName || 'غير محددة'], ['النوع', MATERIAL_TYPE_LABELS[material.type]], ['الوحدة الأساسية', MATERIAL_UNIT_LABELS[material.baseUnit]], ['الباركود', material.barcode || 'غير مسجل'], ['الحد الأدنى', fmt(Number(material.minStock || 0))], ['مصدر المادة', material.isManufacturedInternally ? 'تصنيع داخلي' : 'شراء خارجي'], ['الحالة', material.isActive === false ? 'موقوفة' : 'نشطة']]} /></OpsDashPanel>; }
function Procurement({ material }: { material: NonNullable<ReturnType<typeof useMaterial>['data']> }) { return <OpsDashPanel title="الشراء والتكلفة" accent="plans"><InfoGrid rows={[["وحدة الشراء", material.purchaseUnit || MATERIAL_UNIT_LABELS[material.baseUnit]], ['تكلفة وحدة الشراء', fmt(Number(material.purchaseCost || 0))], ['تكلفة الوحدة الأساسية', fmt(materialPurchaseCostPerBaseUnit(material))], ['معامل التحويل', fmt(Number(material.conversionRate || 1))], ['نسبة الهالك', `${fmt(Number(material.wastePercent || 0))}%`]]} /></OpsDashPanel>; }
function BomTable({ rows, canManage, onEdit, onDelete }: { rows: Array<BomItem & { totalCost?: number }>; canManage: boolean; onEdit: (row: BomItem) => void; onDelete: (row: BomItem) => void }) { if (rows.length === 0) return <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-semibold">لا توجد مكونات معرفة</p><p className="text-sm text-muted-foreground">أضف المواد والكميات اللازمة لتصنيع وحدة واحدة.</p></div>; return <div className="overflow-x-auto"><table className="erp-table w-full min-w-[680px]"><thead><tr><th className="erp-th">المكوّن</th><th className="erp-th">الكمية</th><th className="erp-th">الهالك %</th><th className="erp-th">الترتيب</th>{canManage ? <th className="erp-th">الإجراءات</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.id || row.itemId}><td className="px-3 py-2 font-semibold">{row.itemName}</td><td className="px-3 py-2">{fmt(row.qtyPerUnit)} {row.unit}</td><td className="px-3 py-2">{fmt(Number(row.wastePercent || 0))}</td><td className="px-3 py-2">{row.sortOrder ?? 0}</td>{canManage ? <td><Button size="icon" variant="ghost" aria-label={`تعديل ${row.itemName}`} onClick={() => onEdit(row)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`حذف ${row.itemName}`} onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td> : null}</tr>)}</tbody></table></div>; }
function BomEditor({ options, form, setForm, editing, saving, onSave, onCancel }: { options: Array<{ id?: string; code: string; name: string }>; form: { materialId: string; qtyPerUnit: number; wastePercent: number; sortOrder: number }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; editing: boolean; saving: boolean; onSave: () => void; onCancel: () => void }) { return <div className="grid items-end gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"><div><Label>المكوّن</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.materialId} onChange={(event) => setForm((current) => ({ ...current, materialId: event.target.value }))}><option value="">اختر مادة</option>{options.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></div>{([['qtyPerUnit', 'الكمية'], ['wastePercent', 'الهالك %'], ['sortOrder', 'الترتيب']] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input type="number" min="0" value={form[key] || ''} onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))} /></div>)}<div className="flex gap-1"><Button disabled={saving || !form.materialId || form.qtyPerUnit <= 0} onClick={onSave}>{editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editing ? 'حفظ' : 'إضافة'}</Button>{editing ? <Button variant="ghost" onClick={onCancel}>إلغاء</Button> : null}</div></div>; }
function InventoryPanel({ allowed, state, balances, movements, totalOnHand, totalAvailable, onOpen }: { allowed: boolean; state: 'idle' | 'loading' | 'error'; balances: StockItemBalance[]; movements: StockTransaction[]; totalOnHand: number; totalAvailable: number; onOpen: () => void }) { return <OpsDashPanel title="ملخص المخزون والحركة" accent="inventory">{!allowed ? <p className="py-8 text-center text-muted-foreground">لا تملك صلاحية عرض المخزون.</p> : state === 'loading' ? <Loader2 className="h-6 w-6 animate-spin" /> : state === 'error' ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">تعذر تحميل بيانات المخزون.</p> : <div className="space-y-4"><InfoGrid rows={[["إجمالي الرصيد", fmt(totalOnHand)], ['المتاح', fmt(totalAvailable)], ['عدد المخازن', String(new Set(balances.map((row) => row.warehouseId)).size)]]} /><div><h3 className="mb-2 text-sm font-semibold">آخر الحركات</h3>{movements.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة.</p> : <div className="divide-y rounded-lg border">{movements.map((row) => <div key={row.id} className="flex justify-between p-3 text-sm"><span>{row.referenceNo || row.sourceModule}</span><span>{row.movementType === 'OUT' ? '−' : '+'}{fmt(Math.abs(Number(row.quantity || 0)))}</span></div>)}</div>}</div><Button variant="outline" onClick={onOpen}><ExternalLink className="h-4 w-4" />فتح بطاقة الصنف الكاملة</Button></div>}</OpsDashPanel>; }
