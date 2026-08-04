import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { createRepairJob } from '../usecases/createRepairJob';
import { unwrapOrThrow } from '@/shared/usecases';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import {
  REPAIR_JOB_STATUS_LABELS,
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJob,
  type RepairCallCenterPrefill,
  type RepairJobProduct,
} from '../types';
import { RepairJobQuickDrawer } from '../components/RepairJobQuickDrawer';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairSettings } from '../config/repairSettings';
import { CustomerPicker } from '@/modules/customers/components/CustomerPicker';
import { customerService } from '@/modules/customers/services/customerService';
import type { Customer } from '@/modules/customers/types';

export const NewRepairJob: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const products = useAppStore((s) => s._rawProducts);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobProducts, setJobProducts] = useState<Array<{
    itemId: string;
    productId: string;
    accessories: string;
    diagnosis: string;
    estimatedCost: string;
    finalCost: string;
    inWarranty: boolean;
  }>>([{
    itemId: `item-${Date.now()}`,
    productId: '',
    accessories: '',
    diagnosis: '',
    estimatedCost: '',
    finalCost: '',
    inWarranty: false,
  }]);
  const [isServiceOnly, setIsServiceOnly] = useState(false);
  const [serviceOnlyCost, setServiceOnlyCost] = useState('');
  const [openBranchJobs, setOpenBranchJobs] = useState<RepairJob[]>([]);
  const [selectedSidebarJob, setSelectedSidebarJob] = useState<RepairJob | null>(null);
  const [showTreasuryCloseModal, setShowTreasuryCloseModal] = useState(false);
  const [treasuryClosingBalance, setTreasuryClosingBalance] = useState('0');
  const [treasuryDifferenceReason, setTreasuryDifferenceReason] = useState('');
  const [form, setForm] = useState({
    branchId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    estimatedCost: '',
  });

  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
    });
  }, []);

  useEffect(() => {
    void customerService.listAll({ includeInactive: false }).then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const applyMasterCustomer = (customer: Customer | null) => {
    if (!customer) {
      setCustomerId('');
      return;
    }
    setCustomerId(String(customer.id || ''));
    setForm((prev) => ({
      ...prev,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address || prev.customerAddress,
    }));
  };

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
    if (allowedBranches.length === 0) return;
    const selectedBranchExists = allowedBranches.some((branch) => String(branch.id || '') === form.branchId);
    if (!selectedBranchExists) {
      setForm((prev) => ({ ...prev, branchId: String(allowedBranches[0].id || '') }));
    }
  }, [allowedBranches, form.branchId]);

  const callCenterAppliedRef = React.useRef(false);
  useEffect(() => {
    const prefill = (location.state as { callCenterPrefill?: RepairCallCenterPrefill } | null)?.callCenterPrefill;
    if (!prefill || callCenterAppliedRef.current || allowedBranches.length === 0) return;
    callCenterAppliedRef.current = true;
    setForm((prev) => ({
      ...prev,
      branchId: prefill.branchId && allowedBranches.some((b) => String(b.id) === prefill.branchId)
        ? prefill.branchId
        : prev.branchId,
      customerName: prefill.customerName ?? prev.customerName,
      customerPhone: prefill.customerPhone ?? prev.customerPhone,
      customerAddress: prefill.customerAddress ?? prev.customerAddress,
    }));
    if (prefill.customerId) {
      setCustomerId(prefill.customerId);
    } else if (prefill.customerPhone) {
      void customerService.findByPhoneDigits(prefill.customerPhone).then((matches) => {
        const hit = matches[0];
        if (hit?.id) applyMasterCustomer(hit);
      });
    }
    if (prefill.productId) {
      setJobProducts((prev) =>
        prev.map((row, idx) => (idx === 0 ? { ...row, productId: prefill.productId || '', diagnosis: prefill.diagnosis || row.diagnosis } : row)),
      );
    } else if (prefill.diagnosis) {
      setJobProducts((prev) => prev.map((row, idx) => (idx === 0 ? { ...row, diagnosis: prefill.diagnosis || row.diagnosis } : row)));
    }
  }, [location.state, allowedBranches]);

  useEffect(() => {
    if (!form.branchId) {
      setOpenBranchJobs([]);
      return;
    }
    const openStatuses = new Set(repairSettings.workflow.openStatusIds);
    const unsubscribe = repairJobService.subscribeByBranch(form.branchId, (rows) => {
      const filtered = rows.filter((job) => openStatuses.has(String(job.status || '')));
      setOpenBranchJobs(filtered);
    });
    return () => {
      unsubscribe();
    };
  }, [form.branchId, repairSettings.workflow.openStatusIds]);

  const submit = async () => {
    if (!form.branchId) {
      toast.error('لا يوجد فرع صيانة مرتبط بالمستخدم.');
      return;
    }
    if (!customerId) {
      toast.error('اختر عميلًا من الماستر أو أنشئ عميلًا جديدًا.');
      return;
    }
    if (!form.customerName || !form.customerPhone) {
      toast.error('أكمل بيانات العميل من الماستر.');
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
        accessories: row.accessories || '',
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
    try {
      const previousDayOpenSession = await repairTreasuryService.getPreviousDayOpenSession(form.branchId);
      if (previousDayOpenSession?.id) {
        setShowTreasuryCloseModal(true);
        return;
      }
    } catch {
      // Best-effort check; do not block create on read failure.
    }
    setLoading(true);
    try {
      const result = unwrapOrThrow(await createRepairJob({
        serviceEventActor: {
          uid: String(user?.id || ''),
          name: String(user?.displayName || user?.email || 'مستخدم'),
        },
        branchId: form.branchId,
        productId: leadProduct?.productId,
        productName: leadProduct?.productName || 'منتج',
        jobProducts: normalizedProducts,
        customerId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerAddress: form.customerAddress || '',
        deviceType: leadProduct?.deviceType || 'عام',
        deviceBrand: leadProduct?.deviceBrand || 'غير محدد',
        deviceModel: leadProduct?.deviceModel || 'غير محدد',
        deviceColor: '',
        devicePassword: '',
        accessories: leadProduct?.accessories || '',
        problemDescription: leadProduct?.diagnosis || '',
        status: repairSettings.workflow.initialStatusId,
        warranty: repairSettings.defaults.defaultWarranty,
        partsUsed: [],
        estimatedCost: productsEstimated || Number(form.estimatedCost || 0),
        finalCost: isServiceOnly ? Number(serviceOnlyCost || 0) : productsFinal,
        finalCostOverride,
        isServiceOnly,
        serviceOnlyCost: isServiceOnly ? Number(serviceOnlyCost || 0) : 0,
      }, {
        userId: String(user?.id || '') || undefined,
        userName: String(user?.displayName || user?.email || 'مستخدم'),
      }));
      if (!result.jobId) throw new Error('تعذر إنشاء الطلب.');
      toast.success('تم تسجيل جهاز الصيانة.');
      if (result.usedFallbackReceipt) {
        toast.info('تم استخدام رقم إيصال بديل تلقائيًا بسبب صلاحيات عداد الإيصالات.');
      }
      navigate(withTenantPath(tenantSlug, `/repair/jobs/${result.jobId}`));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إنشاء الطلب.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-none mx-auto px-3 md:px-5 xl:px-8" dir={dir}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="space-y-4 lg:order-1">
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
              <CardTitle>بيانات الاستلام الأساسية</CardTitle>
              <CardDescription>ابدأ ببيانات العميل، ثم المنتجات والتكلفة.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="md:col-span-2 xl:col-span-3 pt-1">
                  <div className="text-sm font-semibold">1) العميل (ماستر)</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ابحث بالكود أو الاسم أو الموبايل، أو أنشئ عميلًا جديدًا في الماستر.
                  </p>
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <CustomerPicker
                    customers={customers}
                    valueId={customerId}
                    disabled={loading}
                    canCreate={can('customers.create') || can('repair.jobs.create')}
                    actor={{
                      userId: String(user?.id || ''),
                      userName: String(user?.displayName || user?.email || 'مستخدم'),
                    }}
                    onSelect={applyMasterCustomer}
                    onCreated={(created) => {
                      setCustomers((prev) => {
                        if (prev.some((c) => c.id === created.id)) return prev;
                        return [...prev, created];
                      });
                    }}
                  />
                </div>
                {customerId ? (
                  <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                    <Label>العنوان (اختياري على الطلب)</Label>
                    <Input
                      value={form.customerAddress}
                      onChange={(e) => setForm((p) => ({ ...p, customerAddress: e.target.value }))}
                    />
                  </div>
                ) : null}
                <div className="md:col-span-2 xl:col-span-3 border-t pt-3 mt-1">
                  <div className="text-sm font-semibold">2) المنتجات والتشخيص</div>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">أضف منتجًا أو أكثر، وحدد التشخيص وتكلفة كل منتج.</p>
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
                            placeholder="الإكسسوارات (لهذا المنتج)"
                            value={row.accessories}
                            onChange={(e) => {
                              const value = e.target.value;
                              setJobProducts((prev) => prev.map((item) => (
                                item.itemId === row.itemId ? { ...item, accessories: value } : item
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
                            accessories: '',
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

                <div className="md:col-span-2 xl:col-span-3 border-t pt-3 mt-1">
                  <div className="text-sm font-semibold">3) التكلفة</div>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">حدد التكلفة التقديرية العامة أو اختر نمط خدمة فقط.</p>
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

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ الطلب'}
            </Button>
          </div>
        </div>
        <div className="hidden lg:block lg:order-2">
          <div className="sticky top-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">طلبات الصيانة المفتوحة</CardTitle>
                <CardDescription className="text-xs">
                  {form.branchId ? 'اضغط لفتح التفاصيل' : 'جار تحديد الفرع تلقائيًا'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
                {!form.branchId && (
                  <div className="text-xs text-muted-foreground">يتم تحديد فرع الصيانة تلقائيًا حسب المستخدم.</div>
                )}
                {form.branchId && openBranchJobs.length === 0 && (
                  <div className="text-xs text-muted-foreground">لا توجد طلبات مفتوحة لهذا الفرع.</div>
                )}
                {openBranchJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className="w-full rounded-md border px-2 py-2 text-right hover:bg-muted transition-colors"
                    onClick={() => {
                      setSelectedSidebarJob(job);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>#{job.receiptNo}</span>
                      <span>{repairSettings.statusMap[job.status]?.label || REPAIR_JOB_STATUS_LABELS[job.status] || job.status}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium truncate">{job.customerName || 'عميل غير محدد'}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{job.customerPhone || '-'}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <RepairJobQuickDrawer
        open={Boolean(selectedSidebarJob)}
        onOpenChange={(next) => { if (!next) setSelectedSidebarJob(null); }}
        job={selectedSidebarJob}
        tenantSlug={tenantSlug}
        branchName={branches.find((branch) => String(branch.id || '') === String(selectedSidebarJob?.branchId || ''))?.name}
      />
      <Dialog open={showTreasuryCloseModal} onOpenChange={setShowTreasuryCloseModal}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إغلاق خزينة يوم سابق</DialogTitle>
            <DialogDescription>
              لا يمكن إنشاء طلب جديد قبل إغلاق خزينة اليوم السابق لهذا الفرع.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>رصيد الإقفال الفعلي</Label>
              <Input className="mt-1" type="number" value={treasuryClosingBalance} onChange={(e) => setTreasuryClosingBalance(e.target.value)} />
            </div>
            <div>
              <Label>سبب الفرق (اختياري)</Label>
              <Input className="mt-1" value={treasuryDifferenceReason} onChange={(e) => setTreasuryDifferenceReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTreasuryCloseModal(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                try {
                  await repairTreasuryService.closeSession({
                    branchId: form.branchId,
                    closingBalance: Number(treasuryClosingBalance || 0),
                    differenceReason: treasuryDifferenceReason,
                    closedBy: user?.id || '',
                    closedByName: user?.displayName || user?.email || 'system',
                    note: 'إغلاق من شاشة إنشاء طلب صيانة',
                  });
                  toast.success('تم إغلاق الخزينة. يمكنك الآن إنشاء الطلب.');
                  setShowTreasuryCloseModal(false);
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر إغلاق الخزينة.');
                }
              }}
            >
              إغلاق الخزينة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewRepairJob;
