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
  type RepairJobProduct,
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
  const [jobProducts, setJobProducts] = useState<Array<{
    itemId: string;
    productId: string;
    diagnosis: string;
    estimatedCost: string;
    finalCost: string;
    inWarranty: boolean;
  }>>([{
    itemId: `item-${Date.now()}`,
    productId: '',
    diagnosis: '',
    estimatedCost: '',
    finalCost: '',
    inWarranty: false,
  }]);
  const [isServiceOnly, setIsServiceOnly] = useState(false);
  const [serviceOnlyCost, setServiceOnlyCost] = useState('');
  const [form, setForm] = useState({
    branchId: '',
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
    if (!form.customerName || !form.customerPhone) {
      toast.error('أكمل البيانات الأساسية.');
      return;
    }
    const validRows = jobProducts.filter((row) => row.productId);
    if (validRows.length === 0) {
      toast.error('اختر منتجًا واحدًا على الأقل.');
      return;
    }
    const normalizedProducts: RepairJobProduct[] = validRows.map((row, idx) => {
      const selected = products.find((p) => p.id === row.productId);
      return {
        itemId: row.itemId || `item-${idx + 1}`,
        productId: row.productId,
        productName: String(selected?.name || selected?.code || `منتج ${idx + 1}`),
        deviceType: 'منتج',
        deviceBrand: String(selected?.name || ''),
        deviceModel: String(selected?.model || selected?.code || ''),
        diagnosis: row.diagnosis || '',
        estimatedCost: Number(row.estimatedCost || 0),
        finalCost: row.inWarranty ? 0 : Number(row.finalCost || 0),
        inWarranty: row.inWarranty,
      };
    });
    const leadProduct = normalizedProducts[0];
    const productsEstimated = normalizedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0);
    const productsFinal = normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0);
    const finalCostOverride = isServiceOnly ? Number(serviceOnlyCost || 0) : undefined;
    setLoading(true);
    try {
      const result = await repairJobService.create({
        branchId: form.branchId,
        productId: leadProduct?.productId,
        productName: leadProduct?.productName || 'منتج',
        jobProducts: normalizedProducts,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerAddress: form.customerAddress || '',
        deviceType: leadProduct?.deviceType || form.deviceType || 'عام',
        deviceBrand: leadProduct?.deviceBrand || form.deviceBrand,
        deviceModel: leadProduct?.deviceModel || form.deviceModel,
        deviceColor: form.deviceColor || '',
        devicePassword: form.devicePassword || '',
        accessories: form.accessories || '',
        problemDescription: leadProduct?.diagnosis || form.problemDescription,
        status: 'received',
        warranty: 'none',
        partsUsed: [],
        estimatedCost: productsEstimated || Number(form.estimatedCost || 0),
        finalCost: isServiceOnly ? Number(serviceOnlyCost || 0) : productsFinal,
        finalCostOverride,
        isServiceOnly,
        serviceOnlyCost: isServiceOnly ? Number(serviceOnlyCost || 0) : 0,
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
              <Label>المنتجات / Products <span className="text-rose-600">*</span></Label>
              <div className="space-y-2">
                {jobProducts.map((row, idx) => (
                  <div key={row.itemId} className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">منتج {idx + 1}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setJobProducts((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.itemId !== row.itemId)));
                        }}
                        disabled={jobProducts.length <= 1}
                      >
                        حذف
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Select
                        value={row.productId}
                        onValueChange={(value) => {
                          setJobProducts((prev) => prev.map((item) => (
                            item.itemId === row.itemId ? { ...item, productId: value } : item
                          )));
                        }}
                      >
                        <SelectTrigger className={!row.productId ? 'border-rose-300' : ''}>
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
                      <Input
                        placeholder="تشخيص المنتج"
                        value={row.diagnosis}
                        onChange={(e) => {
                          const value = e.target.value;
                          setJobProducts((prev) => prev.map((item) => (
                            item.itemId === row.itemId ? { ...item, diagnosis: value } : item
                          )));
                        }}
                      />
                      <Input
                        type="number"
                        placeholder="تكلفة متوقعة"
                        value={row.estimatedCost}
                        onChange={(e) => {
                          const value = e.target.value;
                          setJobProducts((prev) => prev.map((item) => (
                            item.itemId === row.itemId ? { ...item, estimatedCost: value } : item
                          )));
                        }}
                      />
                      <Input
                        type="number"
                        placeholder="تكلفة نهائية"
                        value={row.finalCost}
                        disabled={row.inWarranty}
                        onChange={(e) => {
                          const value = e.target.value;
                          setJobProducts((prev) => prev.map((item) => (
                            item.itemId === row.itemId ? { ...item, finalCost: value } : item
                          )));
                        }}
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.inWarranty}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setJobProducts((prev) => prev.map((item) => (
                            item.itemId === row.itemId
                              ? { ...item, inWarranty: checked, finalCost: checked ? '0' : item.finalCost }
                              : item
                          )));
                        }}
                      />
                      داخل الضمان (إصلاح مجاني)
                    </label>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setJobProducts((prev) => [
                      ...prev,
                      {
                        itemId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        productId: '',
                        diagnosis: '',
                        estimatedCost: '',
                        finalCost: '',
                        inWarranty: false,
                      },
                    ]);
                  }}
                >
                  إضافة منتج
                </Button>
              </div>
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
            <div className="space-y-1.5 xl:max-w-[420px]">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isServiceOnly}
                  onChange={(e) => setIsServiceOnly(e.target.checked)}
                />
                خدمة فقط بدون قطع غيار
              </label>
              {isServiceOnly && (
                <Input
                  type="number"
                  value={serviceOnlyCost}
                  onChange={(e) => setServiceOnlyCost(e.target.value)}
                  placeholder="تكلفة خدمة الإصلاح"
                />
              )}
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
