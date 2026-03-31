import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, Trash2, Plus } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
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
import { exportToPDF } from '../../../utils/reportExport';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { sparePartsService } from '../services/sparePartsService';
import { productMaterialService } from '../../production/services/productMaterialService';
import { userService } from '../../../services/userService';
import { employeeService } from '../../hr/employeeService';
import { formatRepairWhatsAppMessage } from '../utils/whatsappRepairMessage';
import { DeliveryReceiptPDF } from '../components/DeliveryReceiptPDF';
import { StatusBadge } from '../components/StatusBadge';
import { WhatsAppShare } from '../components/WhatsAppShare';
import {
  REPAIR_JOB_STATUS_LABELS,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJob,
  type RepairJobProduct,
  type RepairPartUsage,
  type RepairSparePart,
} from '../types';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';

const toNumber = (value: string | number | undefined | null) => Number(value || 0);
const sumProductFinalCosts = (items: RepairJobProduct[]) => items.reduce((sum, item) => sum + toNumber(item.finalCost), 0);
const inferProducts = (job: RepairJob | null): RepairJobProduct[] => {
  if (!job) return [];
  if (Array.isArray(job.jobProducts) && job.jobProducts.length > 0) {
    return job.jobProducts.map((item, idx) => ({
      ...item,
      itemId: String(item?.itemId || `item-${idx + 1}`),
    }));
  }
  return [{
    itemId: 'item-1',
    productId: job.productId,
    productName: String(job.productName || job.deviceBrand || 'منتج'),
    deviceType: job.deviceType,
    deviceBrand: job.deviceBrand,
    deviceModel: job.deviceModel,
    diagnosis: job.problemDescription || '',
    estimatedCost: toNumber(job.estimatedCost),
    finalCost: toNumber(job.finalCost),
    inWarranty: (job.warranty || 'none') !== 'none',
  }];
};

export const RepairJobDetail: React.FC = () => {
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const [job, setJob] = useState<RepairJob | null>(null);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [allowedPartIds, setAllowedPartIds] = useState<Set<string>>(new Set());
  const [hasProductComponents, setHasProductComponents] = useState(false);
  const [status, setStatus] = useState<RepairJob['status']>('received');
  const [finalCost, setFinalCost] = useState('');
  const [manualFinalOverride, setManualFinalOverride] = useState(false);
  const [warranty, setWarranty] = useState<RepairJob['warranty']>('none');
  const [reason, setReason] = useState('');
  const [jobProducts, setJobProducts] = useState<RepairJobProduct[]>([]);
  const [serviceOnly, setServiceOnly] = useState(false);
  const [serviceOnlyCost, setServiceOnlyCost] = useState('');
  const [partScope, setPartScope] = useState<'job' | 'product'>('job');
  const [partProductItemId, setPartProductItemId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [branchTechnicians, setBranchTechnicians] = useState<Array<{ id: string; name: string }>>([]);
  const [showReopenOptions, setShowReopenOptions] = useState(false);
  const [reopenTreasuryHandling, setReopenTreasuryHandling] = useState<'reverse' | 'keep'>('keep');
  const [selectedReopenProductIds, setSelectedReopenProductIds] = useState<string[]>([]);
  const [isReopening, setIsReopening] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void repairJobService.getById(jobId).then((row) => {
      if (!row) return;
      setJob(row);
      setStatus(row?.status || 'received');
      const inferredProducts = inferProducts(row);
      setJobProducts(inferredProducts);
      setFinalCost(String(row?.finalCostOverride ?? row?.finalCost ?? sumProductFinalCosts(inferredProducts)));
      setManualFinalOverride(typeof row?.finalCostOverride === 'number');
      setWarranty(row?.warranty || 'none');
      setServiceOnly(Boolean(row?.isServiceOnly));
      setServiceOnlyCost(String(row?.serviceOnlyCost ?? ''));
      setSelectedReopenProductIds(inferredProducts.map((item) => String(item.itemId || '')).filter(Boolean));
    });
    void repairBranchService.list().then(setBranches);
  }, [jobId]);

  useEffect(() => {
    if (!job?.branchId) return;
    void Promise.all([
      sparePartsService.listParts(job.branchId),
      job.productId ? productMaterialService.getByProduct(job.productId) : Promise.resolve([]),
    ]).then(([partsRows, materials]) => {
      const normalizedMaterials = materials
        .map((m) => ({
          materialId: String(m.materialId || '').trim(),
          materialName: String(m.materialName || '').trim().toLowerCase(),
        }))
        .filter((m) => m.materialId || m.materialName);
      const allowedIds = new Set<string>();
      if (normalizedMaterials.length > 0) {
        partsRows.forEach((part) => {
          const partId = String(part.id || '').trim();
          const partName = String(part.name || '').trim().toLowerCase();
          const isAllowed = normalizedMaterials.some(
            (m) => (m.materialId && m.materialId === partId) || (m.materialName && m.materialName === partName),
          );
          if (isAllowed && partId) allowedIds.add(partId);
        });
      }
      setAllowedPartIds(allowedIds);
      setHasProductComponents(normalizedMaterials.length > 0);
      setParts(partsRows);
    });
  }, [job?.branchId, job?.productId]);

  const filteredParts = useMemo(
    () => parts.filter((part) => part.id && allowedPartIds.has(part.id)),
    [allowedPartIds, parts],
  );
  const productsTotal = useMemo(() => sumProductFinalCosts(jobProducts), [jobProducts]);
  const computedServiceOnlyCost = useMemo(
    () => toNumber(serviceOnlyCost || finalCost || productsTotal),
    [finalCost, productsTotal, serviceOnlyCost],
  );
  const effectiveFinalCost = useMemo(
    () => (manualFinalOverride ? toNumber(finalCost) : (serviceOnly ? computedServiceOnlyCost : productsTotal)),
    [computedServiceOnlyCost, finalCost, manualFinalOverride, productsTotal, serviceOnly],
  );
  const hasInWarrantyProduct = useMemo(() => jobProducts.some((item) => item.inWarranty), [jobProducts]);

  const branch = useMemo(
    () => branches.find((b) => b.id === job?.branchId) || null,
    [branches, job?.branchId],
  );
  const branchWarehouseId = String(branch?.warehouseId || '').trim();
  const branchWarehouseCode = String(branch?.warehouseCode || '').trim();

  useEffect(() => {
    const technicianIds = (branch?.technicianIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    if (technicianIds.length === 0) {
      setBranchTechnicians([]);
      setSelectedTechnicianId('');
      return;
    }
    let isMounted = true;
    void Promise.allSettled([employeeService.getAll(), userService.getAll()]).then((results) => {
      if (!isMounted) return;
      const employees = results[0].status === 'fulfilled' ? results[0].value : [];
      const users = results[1].status === 'fulfilled' ? results[1].value : [];
      const employeesById = new Map<string, FirestoreEmployee>();
      const employeesByUserId = new Map<string, FirestoreEmployee>();
      employees.forEach((employee) => {
        const id = String(employee.id || '').trim();
        const userId = String(employee.userId || '').trim();
        if (id) employeesById.set(id, employee);
        if (userId) employeesByUserId.set(userId, employee);
      });
      const usersById = new Map<string, FirestoreUser>();
      users.forEach((user) => {
        const id = String(user.id || '').trim();
        if (id) usersById.set(id, user);
      });
      const options = technicianIds.map((id) => {
        const employee = employeesById.get(id) || employeesByUserId.get(id);
        const employeeUserId = String(employee?.userId || '').trim();
        const user = usersById.get(employeeUserId) || usersById.get(id);
        const userName = String(user?.displayName || '').trim();
        const employeeName = String(employee?.name || '').trim();
        const userEmail = String(user?.email || '').trim();
        const name = String(
          employeeName
          || userName
          || userEmail
          || 'فني غير معرف',
        ).trim();
        return { id, name };
      });
      setBranchTechnicians(options);
      setSelectedTechnicianId((prev) => {
        if (prev && technicianIds.includes(prev)) return prev;
        const currentJobTechnicianId = String(job?.technicianId || '').trim();
        if (currentJobTechnicianId && technicianIds.includes(currentJobTechnicianId)) return currentJobTechnicianId;
        return options[0]?.id || '';
      });
    });
    return () => {
      isMounted = false;
    };
  }, [branch?.technicianIds, job?.technicianId]);

  useEffect(() => {
    if (!manualFinalOverride) {
      setFinalCost(String(productsTotal));
    }
  }, [manualFinalOverride, productsTotal]);

  useEffect(() => {
    if (!jobProducts.length) return;
    if (partScope === 'product' && !partProductItemId) {
      setPartProductItemId(String(jobProducts[0]?.itemId || ''));
    }
  }, [jobProducts, partProductItemId, partScope]);

  const persistProducts = async (nextProducts: RepairJobProduct[], nextServiceOnly: boolean) => {
    if (!job) return;
    const lead = nextProducts[0];
    const payload: Partial<RepairJob> = {
      jobProducts: nextProducts,
      isServiceOnly: nextServiceOnly,
      productId: lead?.productId || '',
      productName: lead?.productName || '',
      deviceType: lead?.deviceType || job.deviceType || '',
      deviceBrand: lead?.deviceBrand || job.deviceBrand || '',
      deviceModel: lead?.deviceModel || job.deviceModel || '',
      problemDescription: lead?.diagnosis || job.problemDescription || '',
      estimatedCost: nextProducts.reduce((sum, item) => sum + toNumber(item.estimatedCost), 0),
      finalCost: manualFinalOverride
        ? toNumber(finalCost)
        : (nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : sumProductFinalCosts(nextProducts)),
      finalCostOverride: manualFinalOverride ? toNumber(finalCost) : (nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : undefined),
      serviceOnlyCost: nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : 0,
      warranty: nextProducts.some((item) => item.inWarranty) ? 'none' : warranty,
    };
    await repairJobService.update(jobId, payload);
    const refreshed = await repairJobService.getById(jobId);
    if (refreshed) {
      setJob(refreshed);
      setJobProducts(inferProducts(refreshed));
    }
  };

  const applyStatus = async () => {
    try {
      await persistProducts(jobProducts, serviceOnly);
      const finalCostNumber = effectiveFinalCost;
      const needsTreasuryPosting = status === 'delivered'
        && finalCostNumber > 0
        && job?.status !== 'delivered';
      if (needsTreasuryPosting) {
        await repairTreasuryService.ensureOpenSession(job?.branchId || '');
      }
      await repairJobService.changeStatus({
        jobId,
        status,
        technicianId: userProfile?.id,
        reason: status === 'unrepairable' ? reason : undefined,
        finalCost: status === 'delivered' ? finalCostNumber : undefined,
        warranty: status === 'delivered' ? warranty : undefined,
      });
      if (needsTreasuryPosting) {
        await repairTreasuryService.addEntry({
          branchId: job.branchId,
          entryType: 'INCOME',
          amount: finalCostNumber,
          note: `تحصيل تسليم طلب صيانة #${job.receiptNo}`,
          referenceId: jobId,
          createdBy: userProfile?.id || '',
          createdByName: userProfile?.displayName || userProfile?.email || 'system',
        });
      }
      const next = await repairJobService.getById(jobId);
      setJob(next);
      toast.success(needsTreasuryPosting ? 'تم تحديث الحالة وتسجيل التحصيل بالخزينة.' : 'تم تحديث الحالة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث الحالة.');
    }
  };

  const assignToMe = async () => {
    if (!userProfile?.id) return;
    try {
      await repairJobService.assignTechnician(jobId, userProfile.id);
      setJob(await repairJobService.getById(jobId));
      toast.success('تم إسناد الطلب لك.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب.');
    }
  };

  const assignToBranchTechnician = async () => {
    const technicianId = String(selectedTechnicianId || '').trim();
    const branchTechnicianIds = (branch?.technicianIds || []).map((id) => String(id || '').trim());
    if (!technicianId) {
      toast.error('اختر فنيًا أولًا.');
      return;
    }
    if (!branchTechnicianIds.includes(technicianId)) {
      toast.error('الفني المختار غير مربوط بهذا الفرع.');
      return;
    }
    try {
      await repairJobService.assignTechnician(jobId, technicianId);
      setJob(await repairJobService.getById(jobId));
      toast.success('تم إسناد الطلب للفني المختار.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب للفني.');
    }
  };

  const addPartUsage = async () => {
    if (serviceOnly) {
      toast.error('تم تفعيل خدمة فقط. أوقف الخيار لإضافة قطع غيار.');
      return;
    }
    if (!hasProductComponents) {
      toast.error('لا يمكن صرف قطع غيار لأن المنتج لا يحتوي مكونات معرفة.');
      return;
    }
    if (!branchWarehouseId) {
      toast.error('هذا الفرع لا يملك مخزنًا مرتبطًا. لا يمكن صرف قطع الغيار.');
      return;
    }
    const part = parts.find((p) => p.id === selectedPartId);
    if (!part || !job.branchId) return;
    if (!part.id || !allowedPartIds.has(part.id)) {
      toast.error('هذه القطعة ليست ضمن مكونات المنتج.');
      return;
    }
    const qty = Number(partQty || 0);
    if (qty <= 0) return;
    const nextParts = [...(job.partsUsed || []), {
      partId: part.id || '',
      partName: part.name,
      quantity: qty,
      unitCost: 0,
      scope: partScope,
      productItemId: partScope === 'product' ? partProductItemId : undefined,
      productName: partScope === 'product'
        ? (jobProducts.find((item) => item.itemId === partProductItemId)?.productName || '')
        : undefined,
    }];
    try {
      await sparePartsService.adjustStock({
        branchId: job.branchId,
        warehouseId: branchWarehouseId,
        warehouseName: branch?.name ? `مخزن ${branch.name}` : branchWarehouseCode,
        partId: part.id || '',
        partName: part.name,
        quantity: qty,
        type: 'OUT',
        createdBy: userProfile?.displayName || userProfile?.email || 'system',
        jobId,
        notes: 'استهلاك قطع غيار في طلب صيانة',
      });
      await repairJobService.update(jobId, { partsUsed: nextParts });
      setJob(await repairJobService.getById(jobId));
      toast.success('تم خصم القطعة من المخزون.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر خصم القطعة من المخزون.');
    }
  };

  const removePartUsage = async (idx: number) => {
    if (!job?.branchId || !branchWarehouseId) {
      toast.error('لا يمكن إرجاع القطعة بدون إعداد مخزن الفرع.');
      return;
    }
    const current = Array.isArray(job.partsUsed) ? [...job.partsUsed] : [];
    const target = current[idx];
    if (!target) return;
    try {
      await sparePartsService.adjustStock({
        branchId: job.branchId,
        warehouseId: branchWarehouseId,
        warehouseName: branch?.name ? `مخزن ${branch.name}` : branchWarehouseCode,
        partId: target.partId,
        partName: target.partName,
        quantity: Number(target.quantity || 0),
        type: 'IN',
        createdBy: userProfile?.displayName || userProfile?.email || 'system',
        jobId,
        notes: 'إلغاء صرف قطعة غيار من طلب صيانة',
      });
      current.splice(idx, 1);
      await repairJobService.update(jobId, { partsUsed: current });
      setJob(await repairJobService.getById(jobId));
      toast.success('تم حذف القطعة وإرجاعها للمخزون.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف القطعة.');
    }
  };

  const updateProduct = (itemId: string, patch: Partial<RepairJobProduct>) => {
    setJobProducts((prev) => prev.map((item) => (item.itemId === itemId ? { ...item, ...patch } : item)));
  };

  const addProductRow = () => {
    setJobProducts((prev) => [
      ...prev,
      {
        itemId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productName: `منتج ${prev.length + 1}`,
        diagnosis: '',
        estimatedCost: 0,
        finalCost: 0,
        inWarranty: false,
      },
    ]);
  };

  const removeProductRow = (itemId: string) => {
    setJobProducts((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => item.itemId !== itemId);
      return next.length > 0 ? next : prev;
    });
  };

  const saveMultiProductDetails = async () => {
    try {
      await persistProducts(jobProducts, serviceOnly);
      toast.success('تم حفظ بيانات المنتجات والتشخيص.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ بيانات المنتجات.');
    }
  };

  const createReopenRepair = async () => {
    if (!job?.id) return;
    if (job.status !== 'delivered') {
      toast.error('يمكن إعادة الفتح فقط بعد التسليم.');
      return;
    }
    const selectedIds = selectedReopenProductIds.filter(Boolean);
    if (selectedIds.length === 0) {
      toast.error('اختر منتجًا واحدًا على الأقل لإعادة الإصلاح.');
      return;
    }
    try {
      setIsReopening(true);
      const result = await repairJobService.createLinkedReopenJob({
        sourceJobId: job.id,
        selectedProductItemIds: selectedIds,
        createdById: userProfile?.id,
      });
      if (!result.id) throw new Error('تعذر إنشاء طلب إعادة الإصلاح.');
      if (reopenTreasuryHandling === 'reverse' && Number(job.finalCost || 0) > 0) {
        await repairTreasuryService.addEntry({
          branchId: job.branchId,
          entryType: 'EXPENSE',
          amount: Number(job.finalCost || 0),
          note: `عكس تحصيل طلب صيانة #${job.receiptNo} بسبب إعادة إصلاح`,
          referenceId: `reopen-${job.id}-${result.id}`,
          createdBy: userProfile?.id || '',
          createdByName: userProfile?.displayName || userProfile?.email || 'system',
        });
      }
      toast.success('تم إنشاء طلب إعادة إصلاح جديد.');
      navigate(withTenantPath(tenantSlug, `/repair/jobs/${result.id}`));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تنفيذ إعادة الإصلاح.');
    } finally {
      setIsReopening(false);
    }
  };

  const exportReceipt = async () => {
    if (!receiptRef.current) return;
    await exportToPDF(receiptRef.current, `repair-receipt-${job.receiptNo}`);
  };
  const handlePrintRepairRequest = () => {
    window.print();
  };
  const appBaseUrl = useMemo(() => {
    const envUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_SITE_URL || '').trim();
    if (envUrl) return envUrl.replace(/\/+$/, '');
    if (typeof window === 'undefined') return '';
    return String(window.location.origin || '').replace(/\/+$/, '');
  }, []);
  const trackUrl = useMemo(() => {
    if (!job) return '';
    if (!appBaseUrl) return '';
    const slugFromPath = typeof window === 'undefined'
      ? ''
      : window.location.pathname.split('/').filter(Boolean)[1] || '';
    const effectiveSlug = String(tenantSlug || slugFromPath || '').trim();
    const params = new URLSearchParams();
    if (effectiveSlug) params.set('slug', effectiveSlug);
    if (job.receiptNo) params.set('receipt', String(job.receiptNo));
    if (job.customerPhone) params.set('phone', String(job.customerPhone));
    const query = params.toString();
    return `${appBaseUrl}/track${query ? `?${query}` : ''}`;
  }, [appBaseUrl, job, tenantSlug]);
  const whatsappText = useMemo(() => {
    if (!job) return '';
    const baseMessage = formatRepairWhatsAppMessage(job);
    if (!trackUrl) return `${baseMessage}\nرابط متابعة الطلب: /track`;
    return [
      baseMessage,
      `رقم الإيصال: ${String(job.receiptNo || '-')}`,
      `رابط متابعة الطلب (لينك كامل): ${trackUrl}`,
    ].join('\n');
  }, [job, trackUrl]);

  if (!job) return <div dir="rtl" role="status" aria-live="polite">جاري تحميل الطلب...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white no-print">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">تفاصيل الطلب #{job.receiptNo}</h1>
              <p className="text-sm text-muted-foreground mt-1">مراجعة الحالة، القطع المستخدمة، وإصدار إيصال التسليم.</p>
            </div>
            <StatusBadge status={job.status} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 no-print lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-1 lg:order-2">
          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <Card className="repair-job-print-sheet">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">طلب صيانة</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">نسخة مهيأة للطباعة</p>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid md:grid-cols-3 gap-2 text-sm">
              <div><span className="font-semibold">رقم الطلب:</span> {job.receiptNo}</div>
              <div><span className="font-semibold">تاريخ الإنشاء:</span> {new Date(job.createdAt).toLocaleString('ar-EG')}</div>
              <div><span className="font-semibold">الفرع:</span> {branch?.name || '-'}</div>
              <div><span className="font-semibold">العميل:</span> {job.customerName || '-'}</div>
              <div><span className="font-semibold">الهاتف:</span> {job.customerPhone || '-'}</div>
              <div><span className="font-semibold">الحالة:</span> {REPAIR_JOB_STATUS_LABELS[job.status] || job.status}</div>
              <div><span className="font-semibold">عدد المنتجات:</span> {jobProducts.length}</div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm repair-job-print-table">
                <tbody>
                  <tr>
                    <th className="w-1/3 text-right p-2 font-semibold bg-muted/40">نوع الجهاز</th>
                    <td className="p-2">{job.deviceType || '-'}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">الماركة / الموديل</th>
                    <td className="p-2">{job.deviceBrand} {job.deviceModel}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">اللون</th>
                    <td className="p-2">{job.deviceColor || '-'}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">الإكسسوارات</th>
                    <td className="p-2">{job.accessories || '-'}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">العنوان</th>
                    <td className="p-2">{job.customerAddress || '-'}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">التكلفة النهائية</th>
                    <td className="p-2">{Number(job.finalCost || 0) > 0 ? Number(job.finalCost || 0).toLocaleString('ar-EG') : '-'}</td>
                  </tr>
                  <tr>
                    <th className="text-right p-2 font-semibold bg-muted/40">الضمان</th>
                    <td className="p-2">{job.warranty || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

          <div className="rounded border p-3 text-sm">
            <span className="font-semibold">وصف العطل:</span> {job.problemDescription || '-'}
          </div>

          {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm repair-job-print-table">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-right p-2">#</th>
                    <th className="text-right p-2">القطعة</th>
                    <th className="text-right p-2">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {job.partsUsed.map((part, idx) => (
                    <tr key={`${part.partId}-${idx}`}>
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">{part.partName}</td>
                      <td className="p-2">{part.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-6 text-sm">
            <div className="border-t pt-2 text-center">توقيع الموظف</div>
            <div className="border-t pt-2 text-center">توقيع العميل</div>
          </div>
          {trackUrl && (
            <div className="pt-4 border-t">
              <div className="text-sm font-semibold mb-2">متابعة الطلب (QR )افتح الكاميرا و انتظر النتيجة</div>
              <div className="flex items-center justify-between gap-4">
                {/* <div className="text-xs break-all">{trackUrl}</div> */}
                <div className="rounded border p-2 bg-white">
                  <QRCodeSVG value={trackUrl} size={96} includeMargin />
                </div>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
            {/* <Card className="h-full">
              <CardHeader><CardTitle>بيانات العميل والجهاز</CardTitle></CardHeader>
              <CardContent className="text-sm lg:h-[calc(100%-5rem)] lg:overflow-y-auto">
                <div className="grid gap-4 md:grid-cols-12 lg:grid-cols-1">
                  <div className="space-y-1 md:col-span-8 lg:col-span-1">
                    <div>{job.customerName} - {job.customerPhone}</div>
                    {job.customerAddress && <div>{job.customerAddress}</div>}
                    <div>{job.deviceBrand} {job.deviceModel}</div>
                    <div>نوع الجهاز: {job.deviceType || '—'}</div>
                    {job.deviceColor && <div>اللون: {job.deviceColor}</div>}
                    {job.accessories && <div>الإكسسوارات: {job.accessories}</div>}
                    <div className="pt-1">وصف العطل: {job.problemDescription}</div>
                  </div>
                  <div className="md:col-span-4 md:border-r md:pe-3 md:text-left lg:col-span-1 lg:border-r-0 lg:pe-0">
                    {trackUrl && (
                      <div className="pt-2 flex items-start gap-3 justify-start">
                        <div className="rounded border p-2 bg-white">
                          <div className="text-xs text-muted-foreground text-right">
                            امسح QR لفتح صفحة تتبع الطلب مباشرة.
                          </div>
                          <QRCodeSVG value={trackUrl} size={88} includeMargin />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card> */}
          </div>
        </div>

        <div className="lg:col-span-2 lg:order-1">
          <Card className="lg:h-[calc(100vh-2rem)]">
            <CardHeader>
              <CardTitle>المنتجات والتشخيص / Products & Diagnostics</CardTitle>
              <CardDescription>أضف أكثر من منتج لنفس الطلب، مع تشخيص وتكلفة لكل منتج.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 lg:h-[calc(100%-6.25rem)] lg:overflow-y-auto">
              {jobProducts.map((item, idx) => (
                <div key={item.itemId} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">منتج {idx + 1} / Product {idx + 1}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProductRow(item.itemId)}
                      disabled={jobProducts.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={item.productName}
                      onChange={(e) => updateProduct(item.itemId, { productName: e.target.value })}
                      placeholder="اسم المنتج / Product Name"
                    />
                    <Input
                      value={item.serialNo || ''}
                      onChange={(e) => updateProduct(item.itemId, { serialNo: e.target.value })}
                      placeholder="السيريال / Serial No."
                    />
                    <Input
                      type="number"
                      value={String(item.estimatedCost || 0)}
                      onChange={(e) => updateProduct(item.itemId, { estimatedCost: toNumber(e.target.value) })}
                      placeholder="تكلفة متوقعة / Estimated Cost"
                    />
                    <Input
                      type="number"
                      value={String(item.finalCost || 0)}
                      onChange={(e) => updateProduct(item.itemId, { finalCost: toNumber(e.target.value) })}
                      placeholder="تكلفة نهائية / Final Cost"
                      disabled={Boolean(item.inWarranty)}
                    />
                  </div>
                  <textarea
                    className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={item.diagnosis || ''}
                    onChange={(e) => updateProduct(item.itemId, { diagnosis: e.target.value })}
                    placeholder="التشخيص / Diagnosis"
                  />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(item.inWarranty)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateProduct(item.itemId, {
                          inWarranty: checked,
                          finalCost: checked ? 0 : item.finalCost,
                        });
                      }}
                    />
                    داخل الضمان (إصلاح مجاني) / In Warranty (Free Repair)
                  </label>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={addProductRow}>
                  <Plus className="h-4 w-4 ms-1" />
                  إضافة منتج / Add Product
                </Button>
                <Button type="button" onClick={saveMultiProductDetails}>
                  حفظ المنتجات والتشخيص / Save
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3 pt-2">
                <Card>
                  <CardHeader><CardTitle>تحديث الحالة / Status Update</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Label>تغيير الحالة</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as RepairJob['status'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="received">{REPAIR_JOB_STATUS_LABELS.received}</SelectItem>
                        <SelectItem value="inspection">{REPAIR_JOB_STATUS_LABELS.inspection}</SelectItem>
                        <SelectItem value="repair">{REPAIR_JOB_STATUS_LABELS.repair}</SelectItem>
                        <SelectItem value="ready">{REPAIR_JOB_STATUS_LABELS.ready}</SelectItem>
                        <SelectItem value="delivered">{REPAIR_JOB_STATUS_LABELS.delivered}</SelectItem>
                        <SelectItem value="unrepairable">{REPAIR_JOB_STATUS_LABELS.unrepairable}</SelectItem>
                      </SelectContent>
                    </Select>
                    {status === 'unrepairable' && (
                      <div className="space-y-1">
                        <Label htmlFor="unrepairable-reason">سبب عدم إمكانية الإصلاح</Label>
                        <textarea
                          id="unrepairable-reason"
                          placeholder="اكتب السبب بالتفصيل"
                          className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </div>
                    )}
                    {status === 'delivered' && (
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={manualFinalOverride}
                            onChange={(e) => setManualFinalOverride(e.target.checked)}
                          />
                          تعديل يدوي للإجمالي النهائي / Manual Final Override
                        </label>
                        <Input
                          type="number"
                          placeholder="التكلفة النهائية"
                          value={finalCost}
                          onChange={(e) => setFinalCost(e.target.value)}
                          disabled={!manualFinalOverride}
                        />
                        {!manualFinalOverride && (
                          <div className="text-xs text-muted-foreground">
                            الإجمالي محسوب تلقائيًا من المنتجات: {productsTotal.toLocaleString('ar-EG')}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          حالة الضمان لكل منتج: {hasInWarrantyProduct ? 'يوجد منتج داخل الضمان' : 'لا يوجد منتج داخل الضمان'}
                        </div>
                        <Select value={warranty} onValueChange={(v) => setWarranty(v as RepairJob['warranty'])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون</SelectItem>
                            <SelectItem value="3months">3 شهور</SelectItem>
                            <SelectItem value="6months">6 شهور</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button onClick={applyStatus} disabled={!can('repair.jobs.edit')}>حفظ الحالة</Button>
                    {Array.isArray(job.statusHistory) && job.statusHistory.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="text-sm font-medium">سجل الحالة</p>
                        {[...job.statusHistory].reverse().map((entry, idx) => (
                          <div key={`${entry.at}-${idx}`} className="rounded border px-2 py-1 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <StatusBadge status={entry.status} />
                              <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString('ar-EG')}</span>
                            </div>
                            {entry.reason && <div className="mt-1 text-xs text-muted-foreground">السبب: {entry.reason}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>استهلاك قطع غيار / Spare Parts</CardTitle>
                    <CardDescription>سجل الصرف على مستوى الطلب أو منتج محدد، أو فعّل خدمة فقط بدون قطع.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={serviceOnly}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setServiceOnly(checked);
                          if (checked && !serviceOnlyCost) {
                            setServiceOnlyCost(String(effectiveFinalCost || 0));
                          }
                        }}
                      />
                      خدمة فقط بدون قطع غيار / Service Only (No Parts)
                    </label>
                    {serviceOnly && (
                      <div className="space-y-1">
                        <Label>تكلفة خدمة الإصلاح / Service Cost</Label>
                        <Input
                          type="number"
                          value={serviceOnlyCost}
                          onChange={(e) => setServiceOnlyCost(e.target.value)}
                          placeholder="أدخل تكلفة خدمة الإصلاح"
                        />
                      </div>
                    )}
                    <Label>نطاق الصرف / Scope</Label>
                    <Select value={partScope} onValueChange={(v) => setPartScope(v as 'job' | 'product')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="job">على مستوى الطلب / Job-level</SelectItem>
                        <SelectItem value="product">مرتبط بمنتج / Product-linked</SelectItem>
                      </SelectContent>
                    </Select>
                    {partScope === 'product' && (
                      <Select value={partProductItemId} onValueChange={setPartProductItemId}>
                        <SelectTrigger><SelectValue placeholder="اختر منتجًا" /></SelectTrigger>
                        <SelectContent>
                          {jobProducts.map((item, idx) => (
                            <SelectItem key={item.itemId} value={item.itemId}>
                              {item.productName || `منتج ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!branchWarehouseId && (
                      <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        هذا الفرع لا يملك مخزنًا مرتبطًا، لذلك لا يمكن صرف قطع الغيار من الطلب.
                      </div>
                    )}
                    {!hasProductComponents && (
                      <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        المنتج المختار في الطلب لا يحتوي مكونات معرفة. يجب إضافة المكونات أولًا قبل صرف قطع الغيار.
                      </div>
                    )}
                    <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                      <SelectTrigger><SelectValue placeholder="اختر قطعة" /></SelectTrigger>
                      <SelectContent>{filteredParts.map((p) => <SelectItem key={p.id} value={p.id || ''}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={1} value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                    <Button
                      variant="outline"
                      onClick={addPartUsage}
                      disabled={serviceOnly || !hasProductComponents || !branchWarehouseId || (partScope === 'product' && !partProductItemId)}
                    >
                      إضافة/خصم
                    </Button>
                    <p>إسناد لفني من الفرع</p>
                    <Select
                      value={selectedTechnicianId}
                      onValueChange={setSelectedTechnicianId}
                      disabled={branchTechnicians.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="لا يوجد فنيون مربوطون بالفرع" />
                      </SelectTrigger>
                      <SelectContent>
                        {branchTechnicians.map((technician) => (
                          <SelectItem key={technician.id} value={technician.id}>
                            {technician.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="default"
                      onClick={assignToBranchTechnician}
                      disabled={!selectedTechnicianId || branchTechnicians.length === 0}
                    >
                      إسناد الطلب للفني المختار
                    </Button>
                    <p></p>
                    <Button variant="secondary" onClick={assignToMe}>إسناد الطلب لي</Button>
                    <Button variant="ghost" onClick={() => void saveMultiProductDetails()}>
                      حفظ وضع الخدمة/الربط
                    </Button>
                    {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <p className="text-sm font-medium">قطع الغيار المستخدمة / Used Parts</p>
                        {job.partsUsed.map((part: RepairPartUsage, idx) => (
                          <div key={`${part.partId}-${idx}`} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span>{part.partName}</span>
                              {part.scope === 'product' && (
                                <span className="text-xs text-muted-foreground">
                                  ({part.productName || 'منتج محدد'})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">x {part.quantity}</Badge>
                              <Button variant="ghost" size="icon" onClick={() => void removePartUsage(idx)}>
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="no-print lg:sticky lg:top-4 lg:self-start space-y-3">
          
          {job.status === 'delivered' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">إعادة إصلاح</CardTitle>
                <CardDescription>إنشاء طلب جديد مرتبط بالطلب الحالي.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="secondary" className="w-full" onClick={() => setShowReopenOptions((v) => !v)}>
                  {showReopenOptions ? 'إخفاء خيارات إعادة الإصلاح' : 'فتح إعادة الإصلاح'}
                </Button>
                {showReopenOptions && (
                  <div className="space-y-2 text-sm">
                    <Label>معالجة القيد المالي السابق</Label>
                    <Select value={reopenTreasuryHandling} onValueChange={(v) => setReopenTreasuryHandling(v as 'reverse' | 'keep')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep">الإبقاء على القيد السابق</SelectItem>
                        <SelectItem value="reverse">عكس القيد السابق</SelectItem>
                      </SelectContent>
                    </Select>
                    <Label>المنتجات التي ستُنقل للطلب الجديد</Label>
                    <div className="space-y-1 rounded border p-2">
                      {jobProducts.map((item, idx) => {
                        const itemId = String(item.itemId || '');
                        const checked = selectedReopenProductIds.includes(itemId);
                        return (
                          <label key={itemId || idx} className="inline-flex items-center gap-2 text-xs w-full">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked;
                                setSelectedReopenProductIds((prev) => (
                                  nextChecked
                                    ? Array.from(new Set([...prev, itemId]))
                                    : prev.filter((id) => id !== itemId)
                                ));
                              }}
                            />
                            {item.productName || `منتج ${idx + 1}`}
                          </label>
                        );
                      })}
                    </div>
                    <Button className="w-full" onClick={() => void createReopenRepair()} disabled={isReopening}>
                      {isReopening ? 'جاري الإنشاء...' : 'إنشاء طلب إعادة إصلاح'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        
      </div>

      <div className="hidden">
        <DeliveryReceiptPDF ref={receiptRef} job={job} branch={branch} />
      </div>
    </div>
  );
};

export default RepairJobDetail;
