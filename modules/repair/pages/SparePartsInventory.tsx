import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairSparePart, type RepairSparePartStock } from '../types';
import { sparePartsService } from '../services/sparePartsService';
import { repairBranchService } from '../services/repairBranchService';
import { useLowStockAlert } from '../hooks/useLowStockAlert';
import { LowStockAlert } from '../components/LowStockAlert';
import { productMaterialService } from '../../production/services/productMaterialService';
import type { ProductMaterial } from '../../../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export const SparePartsInventory: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const canManageAllBranches = can('repair.branches.manage');
  const canManageParts = can('repair.parts.manage');
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const userBranchIds = useMemo(() => resolveUserRepairBranchIds(user), [user]);
  const branchId = selectedBranchId;
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const products = useAppStore((s) => s._rawProducts);
  const [materials, setMaterials] = useState<ProductMaterial[]>([]);
  const [form, setForm] = useState({
    productId: '',
    materialKey: '',
    unit: 'قطعة',
    minStock: '1',
  });
  const [isCreatePartModalOpen, setIsCreatePartModalOpen] = useState(false);
  const [partPendingDelete, setPartPendingDelete] = useState<RepairSparePart | null>(null);
  const [search, setSearch] = useState('');
  const [increaseQty, setIncreaseQty] = useState('1');
  const [viewMode, setViewMode] = useState<'simple' | 'dense'>('dense');
  const lowStock = useLowStockAlert(branchId);
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branchId, branches],
  );
  const activeWarehouseId = String(activeBranch?.warehouseId || '').trim();
  const activeWarehouseCode = String(activeBranch?.warehouseCode || '').trim();

  const load = async () => {
    if (!branchId || !activeWarehouseId) {
      setParts([]);
      setStock([]);
      return;
    }
    const [p, s] = await Promise.all([
      sparePartsService.listParts(branchId),
      sparePartsService.listStock(branchId, activeWarehouseId),
    ]);
    setParts(p);
    setStock(s);
  };

  useEffect(() => {
    void load();
  }, [branchId, activeWarehouseId]);
  useEffect(() => {
    void productMaterialService.getAll().then(setMaterials).catch(() => setMaterials([]));
  }, []);
  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
      if (!selectedBranchId && rows.length > 0) {
        const firstAllowed = canManageAllBranches
          ? rows[0]
          : rows.find((row) => row.id && userBranchIds.includes(String(row.id)));
        if (firstAllowed?.id) {
          setSelectedBranchId(String(firstAllowed.id));
        }
      }
    });
  }, [canManageAllBranches, selectedBranchId, userBranchIds]);
  useEffect(() => {
    if (canManageAllBranches) return;
    const currentAllowed = userBranchIds.includes(selectedBranchId);
    if (currentAllowed) return;
    setSelectedBranchId(userBranchIds[0] || '');
  }, [canManageAllBranches, selectedBranchId, userBranchIds]);
  const branchOptions = useMemo(
    () => (canManageAllBranches ? branches : branches.filter((row) => row.id && userBranchIds.includes(String(row.id)))),
    [branches, canManageAllBranches, userBranchIds],
  );

  const stockMap = useMemo(
    () => new Map(stock.map((s) => [s.partId, Number(s.quantity || 0)])),
    [stock],
  );
  const visibleParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((part) => `${part.name} ${part.code} ${part.category}`.toLowerCase().includes(q));
  }, [parts, search]);
  const stats = useMemo(() => {
    const totalItems = parts.length;
    const totalStock = parts.reduce((sum, part) => sum + Number(stockMap.get(part.id || '') || 0), 0);
    const lowStockCount = parts.filter((part) => Number(stockMap.get(part.id || '') || 0) <= Number(part.minStock || 0)).length;
    return { totalItems, totalStock, lowStockCount };
  }, [parts, stockMap]);

  const getNextSparePartCode = () => {
    const maxSerial = parts.reduce((max, part) => {
      const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
      if (!match) return max;
      const current = Number(match[1] || 0);
      return Number.isFinite(current) ? Math.max(max, current) : max;
    }, 0);
    return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
  };

  const createPart = async () => {
    if (!branchId) return;
    const selectedMaterial = materials.find((material) => {
      const materialId = String(material.materialId || '').trim();
      const materialName = String(material.materialName || '').trim();
      const key = materialId || materialName;
      return key === form.materialKey;
    });
    if (!selectedMaterial) {
      toast.error('اختر مكونًا أولًا.');
      return;
    }
    const partName = String(selectedMaterial.materialName || '').trim();
    const partCode = getNextSparePartCode();
    const existing = parts.find((part) => String(part.name || '').trim().toLowerCase() === partName.toLowerCase());
    if (existing) {
      toast.error('هذا المكون مضاف بالفعل كقطعة غيار.');
      return;
    }
    try {
      await sparePartsService.createPart({
        branchId,
        name: partName,
        code: partCode,
        category: 'مكونات منتج',
        unit: form.unit || 'قطعة',
        minStock: Number(form.minStock || 0),
      });
      toast.success('تمت إضافة القطعة.');
      setForm((prev) => ({ ...prev, materialKey: '', unit: 'قطعة', minStock: '1' }));
      setIsCreatePartModalOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إضافة القطعة.');
    }
  };

  const productMaterials = useMemo(() => {
    if (!form.productId) return [];
    return materials.filter((material) => material.productId === form.productId);
  }, [form.productId, materials]);

  const increaseStock = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
    try {
      await sparePartsService.adjustStock({
        branchId,
        warehouseId: activeWarehouseId,
        warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
        partId: part.id,
        partName: part.name,
        quantity: qty,
        type: 'IN',
        createdBy: user?.displayName || user?.email || 'system',
        notes: 'إضافة يدوية',
      });
      await load();
      toast.success('تمت إضافة الكمية بنجاح.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إضافة الكمية.');
    }
  };
  const decreaseStock = async (part: RepairSparePart) => {
    if (!canManageParts) {
      toast.error('ليس لديك صلاحية تعديل المخزون.');
      return;
    }
    if (!part.id || !branchId || !activeWarehouseId) return;
    const qty = Math.max(1, Number(increaseQty || 1));
    try {
      await sparePartsService.adjustStock({
        branchId,
        warehouseId: activeWarehouseId,
        warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeWarehouseCode,
        partId: part.id,
        partName: part.name,
        quantity: qty,
        type: 'OUT',
        createdBy: user?.displayName || user?.email || 'system',
        notes: 'سحب يدوي',
      });
      await load();
      toast.success('تم سحب الكمية بنجاح.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر سحب الكمية.');
    }
  };
  const removePart = async () => {
    if (!partPendingDelete?.id || !branchId) return;
    try {
      await sparePartsService.removePart(partPendingDelete.id, branchId);
      toast.success('تم حذف قطعة الغيار.');
      await load();
      setPartPendingDelete(null);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف قطعة الغيار.');
    }
  };

  return (
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">مخزون قطع الغيار</h1>
                <p className="text-sm text-muted-foreground mt-1">إدارة الأصناف، متابعة الحد الأدنى، والإضافة السريعة للمخزون.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(canManageAllBranches || branchOptions.length > 1) && (
                  <div className="w-[220px]">
                    <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الفرع" />
                      </SelectTrigger>
                      <SelectContent>
                        {branchOptions.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id || ''}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Link to={withTenantPath(tenantSlug, '/repair')}>
                  <Button variant="outline">لوحة الصيانة</Button>
                </Link>
                <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
                  <Button variant="outline">طلبات الصيانة</Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">عدد الأصناف</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stats.totalItems}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">إجمالي الكمية بالمخزون</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stats.totalStock}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">أصناف منخفضة المخزون</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${stats.lowStockCount > 0 ? 'text-amber-600' : ''}`}>{stats.lowStockCount}</p>
          </CardContent>
        </Card>
      </div>

      {!branchId && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          {canManageAllBranches
            ? 'اختر فرعًا أولًا لإدارة المخزون.'
            : 'لا يوجد فرع صيانة مرتبط بالمستخدم الحالي.'}
        </div>
      )}
      {branchId && !activeWarehouseId && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          هذا الفرع لا يملك مخزنًا مرتبطًا بعد. أنشئ فرعًا جديدًا أو اربط مخزنًا يدويًا للفرع الحالي.
        </div>
      )}
      {canManageParts && (
        <div className="flex justify-end">
          <Dialog open={isCreatePartModalOpen} onOpenChange={setIsCreatePartModalOpen}>
            <DialogTrigger asChild>
              <Button>إضافة صنف جديد</Button>
            </DialogTrigger>
            <DialogContent dir={dir} className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>إضافة صنف جديد</DialogTitle>
                <DialogDescription>اختيار القطعة يكون من مكونات الأصناف المعرفة على النظام.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                <div className="xl:col-span-2">
                  <Label>المنتج</Label>
                  <Select value={form.productId} onValueChange={(value) => setForm((p) => ({ ...p, productId: value, materialKey: '' }))}>
                    <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                    <SelectContent>
                      {products.filter((p) => p.id).map((product) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name} {product.model ? `- ${product.model}` : ''} {product.code ? `(${product.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="xl:col-span-2">
                  <Label>المكون</Label>
                  <Select value={form.materialKey} onValueChange={(value) => setForm((p) => ({ ...p, materialKey: value }))}>
                    <SelectTrigger><SelectValue placeholder={form.productId ? 'اختر مكونًا' : 'اختر المنتج أولًا'} /></SelectTrigger>
                    <SelectContent>
                      {productMaterials.map((material) => {
                        const materialId = String(material.materialId || '').trim();
                        const materialName = String(material.materialName || '').trim();
                        const key = materialId || materialName;
                        return (
                          <SelectItem key={`${material.productId}-${key}`} value={key}>
                            {materialName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>الوحدة</Label><Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} /></div>
                <div><Label>الحد الأدنى</Label><Input type="number" value={form.minStock} onChange={(e) => setForm((p) => ({ ...p, minStock: e.target.value }))} /></div>
                <div className="xl:col-span-6 flex justify-end">
                  <Button onClick={createPart}>إضافة الصنف</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود أو التصنيف..." />
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">الزيادة السريعة</Label>
              <Input type="number" min={1} value={increaseQty} onChange={(e) => setIncreaseQty(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant={viewMode === 'simple' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('simple')}>مبسط</Button>
              <Button variant={viewMode === 'dense' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('dense')}>كثيف البيانات</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>جدول المخزون</CardTitle>
          <CardDescription>يمكنك تحديث الرصيد بسرعة باستخدام زر الزيادة.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">القطعة</th>
                  <th className="p-2 text-right">الكود</th>
                  {viewMode === 'dense' && <th className="p-2 text-right">التصنيف</th>}
                  {viewMode === 'dense' && <th className="p-2 text-right">الوحدة</th>}
                  <th className="p-2 text-right">الرصيد</th>
                  <th className="p-2 text-right">الحد الأدنى</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visibleParts.map((part) => {
                  const qty = stockMap.get(part.id || '') || 0;
                  const isLow = qty <= Number(part.minStock || 0);
                  return (
                    <tr key={part.id} className="border-t">
                      <td className="p-2">{part.name}</td>
                      <td className="p-2">{part.code}</td>
                      {viewMode === 'dense' && <td className="p-2">{part.category || '—'}</td>}
                      {viewMode === 'dense' && <td className="p-2">{part.unit || '—'}</td>}
                      <td className="p-2 font-mono">{qty}</td>
                      <td className="p-2 font-mono">{part.minStock}</td>
                      <td className="p-2">
                        <Badge variant={isLow ? 'destructive' : 'secondary'}>{isLow ? 'منخفض' : 'جيد'}</Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => increaseStock(part)} disabled={!canManageParts}>
                            +{Math.max(1, Number(increaseQty || 1))}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => decreaseStock(part)} disabled={!canManageParts}>
                            -{Math.max(1, Number(increaseQty || 1))}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => setPartPendingDelete(part)} disabled={!canManageParts}>
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleParts.length === 0 && (
                  <tr>
                    <td className="p-3 text-center text-muted-foreground" colSpan={viewMode === 'dense' ? 8 : 6}>
                      لا توجد قطع مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(partPendingDelete)} onOpenChange={(open) => !open && setPartPendingDelete(null)}>
        <DialogContent dir={dir} className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف قطعة الغيار</DialogTitle>
            <DialogDescription>
              هل تريد حذف قطعة الغيار "{partPendingDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartPendingDelete(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={removePart}>حذف نهائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LowStockAlert open={lowStock.isOpen} onOpenChange={(open) => { if (!open) lowStock.dismiss(); }} entries={lowStock.lowStockEntries} />
    </div>
  );
};

export default SparePartsInventory;
