import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
} from '../types';

const isRequiredMissing = (value: string) => !value.trim();

export const NewRepairJob: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const products = useAppStore((s) => s._rawProducts);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    branchId: '',
    productId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    deviceType: '',
    deviceBrand: '',
    deviceModel: '',
    deviceColor: '',
    devicePassword: '',
    accessories: '',
    problemDescription: '',
    estimatedCost: '',
  });

  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
    });
  }, []);

  const allowedBranches = useMemo(() => {
    if (can('repair.branches.manage')) return branches;

    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    const visible = branches.filter((branch) => {
      const branchId = String(branch.id || '');
      if (!branchId) return false;
      if (baseUserBranchIds.includes(branchId)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
    return visible;
  }, [branches, can, user, currentEmployee?.id]);

  useEffect(() => {
    if (form.branchId) return;
    if (allowedBranches.length === 1) {
      setForm((prev) => ({ ...prev, branchId: String(allowedBranches[0].id || '') }));
    }
  }, [allowedBranches, form.branchId]);

  const submit = async () => {
    if (!form.branchId) {
      toast.error('لا يوجد فرع صيانة مرتبط بالمستخدم.');
      return;
    }
    if (!form.productId) {
      toast.error('اختر المنتج أولًا.');
      return;
    }
    if (!form.customerName || !form.customerPhone || !form.deviceBrand || !form.deviceModel) {
      toast.error('أكمل البيانات الأساسية.');
      return;
    }
    const selectedProduct = products.find((p) => p.id === form.productId);
    if (!selectedProduct?.id) {
      toast.error('المنتج المختار غير صالح.');
      return;
    }
    setLoading(true);
    try {
      const result = await repairJobService.create({
        branchId: form.branchId,
        productId: selectedProduct.id,
        productName: selectedProduct.name || selectedProduct.code || 'منتج',
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerAddress: form.customerAddress || '',
        deviceType: form.deviceType || 'عام',
        deviceBrand: form.deviceBrand,
        deviceModel: form.deviceModel,
        deviceColor: form.deviceColor || '',
        devicePassword: form.devicePassword || '',
        accessories: form.accessories || '',
        problemDescription: form.problemDescription,
        status: 'received',
        warranty: 'none',
        partsUsed: [],
        estimatedCost: Number(form.estimatedCost || 0),
      });
      if (!result.id) throw new Error('تعذر إنشاء الطلب.');
      toast.success('تم تسجيل جهاز الصيانة.');
      if (result.usedFallbackReceipt) {
        toast.info('تم استخدام رقم إيصال بديل تلقائيًا بسبب صلاحيات عداد الإيصالات.');
      }
      navigate(withTenantPath(tenantSlug, `/repair/jobs/${result.id}`));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء الطلب.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto px-2 md:px-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تسجيل جهاز صيانة</h1>
          <p className="text-sm text-muted-foreground mt-1">أدخل بيانات العميل والجهاز قبل إنشاء طلب الصيانة.</p>
        </div>
        <Button variant="outline" type="button" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
          رجوع للطلبات
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>بيانات العميل والجهاز</CardTitle>
          <CardDescription>الحقول المميزة بعلامة * إلزامية.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
              <Label>فرع الصيانة <span className="text-rose-600">*</span></Label>
              <Select
                value={form.branchId}
                onValueChange={(value) => setForm((p) => ({ ...p, branchId: value }))}
              >
                <SelectTrigger className={!form.branchId ? 'border-rose-300' : ''}>
                  <SelectValue placeholder="اختر فرع الصيانة" />
                </SelectTrigger>
                <SelectContent>
                  {allowedBranches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id || '')}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
              <Label>المنتج <span className="text-rose-600">*</span></Label>
              <Select
                value={form.productId}
                onValueChange={(value) => {
                  const product = products.find((p) => p.id === value);
                  setForm((p) => ({
                    ...p,
                    productId: value,
                    deviceType: 'منتج',
                    deviceBrand: String(product?.name || ''),
                    deviceModel: String(product?.model || product?.code || ''),
                  }));
                }}
              >
                <SelectTrigger className={!form.productId ? 'border-rose-300' : ''}>
                  <SelectValue placeholder="اختر المنتج من الأصناف المعرفة" />
                </SelectTrigger>
                <SelectContent>
                  {products.filter((p) => p.id).map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name} {product.model ? `- ${product.model}` : ''} {product.code ? `(${product.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>اسم العميل <span className="text-rose-600">*</span></Label>
              <Input
                value={form.customerName}
                onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                className={isRequiredMissing(form.customerName) ? 'border-rose-300' : ''}
                placeholder="مثال: أحمد محمد"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف <span className="text-rose-600">*</span></Label>
              <Input
                value={form.customerPhone}
                onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))}
                className={isRequiredMissing(form.customerPhone) ? 'border-rose-300' : ''}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label>العنوان</Label>
              <Input value={form.customerAddress} onChange={(e) => setForm((p) => ({ ...p, customerAddress: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>نوع الجهاز</Label>
              <Input value={form.deviceType} onChange={(e) => setForm((p) => ({ ...p, deviceType: e.target.value }))} placeholder="مثال: موبايل" />
            </div>
            <div className="space-y-1.5">
              <Label>الماركة <span className="text-rose-600">*</span></Label>
              <Input
                value={form.deviceBrand}
                onChange={(e) => setForm((p) => ({ ...p, deviceBrand: e.target.value }))}
                className={isRequiredMissing(form.deviceBrand) ? 'border-rose-300' : ''}
                placeholder="مثال: Samsung"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الموديل <span className="text-rose-600">*</span></Label>
              <Input
                value={form.deviceModel}
                onChange={(e) => setForm((p) => ({ ...p, deviceModel: e.target.value }))}
                className={isRequiredMissing(form.deviceModel) ? 'border-rose-300' : ''}
                placeholder="مثال: A54"
              />
            </div>
            <div className="space-y-1.5">
              <Label>اللون</Label>
              <Input value={form.deviceColor} onChange={(e) => setForm((p) => ({ ...p, deviceColor: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>باسورد الجهاز (اختياري)</Label>
              <Input value={form.devicePassword} onChange={(e) => setForm((p) => ({ ...p, devicePassword: e.target.value }))} />
            </div>
            <div className="md:col-span-2 xl:col-span-3 space-y-1.5">
              <Label>الإكسسوارات</Label>
              <Input value={form.accessories} onChange={(e) => setForm((p) => ({ ...p, accessories: e.target.value }))} placeholder="شاحن، جراب، سماعة..." />
            </div>
            <div className="space-y-1.5 xl:max-w-[320px]">
              <Label>التكلفة المتوقعة</Label>
              <Input type="number" value={form.estimatedCost} onChange={(e) => setForm((p) => ({ ...p, estimatedCost: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>وصف العطل</CardTitle>
          <CardDescription>اكتب وصفًا واضحًا للمشكلة والأعراض.</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.problemDescription}
            placeholder="مثال: الجهاز لا يشحن - تم تجربة أكثر من شاحن..."
            onChange={(e) => setForm((p) => ({ ...p, problemDescription: e.target.value }))}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
          إلغاء
        </Button>
        <Button onClick={submit} disabled={loading}>
          {loading ? 'جاري الحفظ...' : 'حفظ الطلب'}
        </Button>
      </div>
    </div>
  );
};

export default NewRepairJob;
