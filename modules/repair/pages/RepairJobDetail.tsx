import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, Printer, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportToPDF } from '../../../utils/reportExport';
import { useManagedPrint } from '../../../utils/printManager';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { userService } from '../../../services/userService';
import { employeeService } from '../../hr/employeeService';
import { formatRepairWhatsAppMessage } from '../utils/whatsappRepairMessage';
import { RepairJobPrint } from '../components/RepairJobPrint';
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
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext, resolveRepairTechnicianIds } from '../utils/repairAccessContext';
import { effectiveSparePartUnitCost } from '../utils/sparePartPricing';
import { resolveRepairSettings, sumServiceCatalogPrices, accessoryLabelsFromIds } from '../config/repairSettings';
import { listAllowedRepairStatusTargets } from '../utils/repairStatusTransitions';
import { computeRepairJobCost } from '../utils/repairBusinessLogic';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
} from '../utils/repairWorkflowNormalize';
import { CustomerPicker } from '@/modules/customers/components/CustomerPicker';
import { customerService } from '@/modules/customers/services/customerService';
import { customerActivityService } from '@/modules/customers/services/customerActivityService';
import { CUSTOMER_TYPE_LABELS, type Customer } from '@/modules/customers/types';

const toNumber = (value: string | number | undefined | null) => Number(value || 0);
const sumProductFinalCosts = (items: RepairJobProduct[]) => items.reduce((sum, item) => sum + toNumber(item.finalCost), 0);
const toggleCatalogId = (ids: string[] | undefined, id: string): string[] => {
  const current = Array.isArray(ids) ? ids : [];
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
};
const inferProducts = (job: RepairJob | null): RepairJobProduct[] => {
  if (!job) return [];
  if (Array.isArray(job.jobProducts) && job.jobProducts.length > 0) {
    return job.jobProducts.map((item, idx) => ({
      ...item,
      itemId: String(item?.itemId || `item-${idx + 1}`),
      quantity: Math.max(1, Math.round(Number(item?.quantity || 1))),
      accessoryIds: Array.isArray(item?.accessoryIds) ? item.accessoryIds.map(String) : [],
      serviceIds: Array.isArray(item?.serviceIds) ? item.serviceIds.map(String) : [],
    }));
  }
  return [{
    itemId: 'item-1',
    productId: job.productId,
    productName: String(job.productName || job.deviceBrand || 'منتج'),
    quantity: 1,
    accessoryIds: [],
    serviceIds: [],
    deviceType: job.deviceType,
    deviceBrand: job.deviceBrand,
    deviceModel: job.deviceModel,
    accessories: String(job.accessories || ''),
    diagnosis: job.problemDescription || '',
    estimatedCost: toNumber(job.estimatedCost),
    finalCost: toNumber(job.finalCost),
    inWarranty: (job.warranty || 'none') !== 'none',
  }];
};

export const RepairJobDetail: React.FC = () => {
  const { dir } = useAppDirection();
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const catalogProducts = useAppStore((s) => s._rawProducts);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const enabledAccessories = useMemo(
    () => repairSettings.accessoriesCatalog.filter((item) => item.enabled !== false),
    [repairSettings.accessoriesCatalog],
  );
  const enabledServices = useMemo(
    () => repairSettings.serviceCatalog.filter((item) => item.enabled !== false),
    [repairSettings.serviceCatalog],
  );
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [userProfile, userRoleName, systemSettings, userPermissions],
  );
  const technicianIds = useMemo(
    () => resolveRepairTechnicianIds(userProfile, currentEmployee?.id),
    [userProfile, currentEmployee?.id],
  );
  const [job, setJob] = useState<RepairJob | null>(null);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [status, setStatus] = useState<RepairJob['status']>(repairSettings.workflow.initialStatusId);
  const [finalCost, setFinalCost] = useState('');
  const [manualFinalOverride, setManualFinalOverride] = useState(false);
  const [warranty, setWarranty] = useState<RepairJob['warranty']>(repairSettings.defaults.defaultWarranty);
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [masterCustomer, setMasterCustomer] = useState<Customer | null>(null);
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [linkCustomerId, setLinkCustomerId] = useState('');
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const printTemplate = systemSettings?.printTemplate;
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: job ? `طلب-صيانة-${job.receiptNo}` : 'طلب-صيانة',
  });

  useEffect(() => {
    void repairJobService.getById(jobId).then((row) => {
      if (!row) return;
      setJob(row);
      setStatus(row?.status || repairSettings.workflow.initialStatusId);
      const inferredProducts = inferProducts(row);
      setJobProducts(inferredProducts);
      setFinalCost(String(row?.finalCostOverride ?? row?.finalCost ?? 0));
      setManualFinalOverride(typeof row?.finalCostOverride === 'number');
      setWarranty(row?.warranty || repairSettings.defaults.defaultWarranty);
      setServiceOnly(Boolean(row?.isServiceOnly));
      setServiceOnlyCost(String(row?.serviceOnlyCost ?? ''));
      setSelectedReopenProductIds(inferredProducts.map((item) => String(item.itemId || '')).filter(Boolean));
    });
    void repairBranchService.list().then(setBranches);
    void customerService.listAll({ includeInactive: false }).then(setCustomers).catch(() => setCustomers([]));
  }, [jobId, repairSettings.workflow.initialStatusId, repairSettings.defaults.defaultWarranty]);

  useEffect(() => {
    const id = String(job?.customerId || '').trim();
    if (!id) {
      setMasterCustomer(null);
      return;
    }
    let cancelled = false;
    void customerService.getById(id).then((row) => {
      if (!cancelled) setMasterCustomer(row);
    });
    return () => {
      cancelled = true;
    };
  }, [job?.customerId]);

  useEffect(() => {
    if (!job?.branchId) return;
    // Technician may select any branch part — not restricted to job product BOM.
    void sparePartsService.listParts(job.branchId).then(setParts);
  }, [job?.branchId]);

  const [partCatalogSearch, setPartCatalogSearch] = useState('');
  const filteredParts = useMemo(() => {
    const q = partCatalogSearch.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) => {
      const hay = `${p.name || ''} ${p.code || ''} ${p.category || ''} ${p.materialId || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [parts, partCatalogSearch]);
  const allowedStatusOptions = useMemo(() => {
    const current = String(job?.status || status || '');
    const allowed = new Set([
      current,
      ...listAllowedRepairStatusTargets({
        fromStatus: current,
        statuses: repairSettings.workflow.statuses,
      }),
    ]);
    return repairSettings.workflow.statuses.filter((s) => s.isEnabled !== false && allowed.has(s.id));
  }, [job?.status, status, repairSettings.workflow.statuses]);
  const productsServiceTotal = useMemo(() => sumProductFinalCosts(jobProducts), [jobProducts]);
  const productsQtyTotal = useMemo(
    () => jobProducts.reduce((sum, item) => sum + Math.max(1, Math.round(Number(item.quantity || 1))), 0),
    [jobProducts],
  );
  const computedJobCost = useMemo(() => {
    return computeRepairJobCost({
      partsUsed: job?.partsUsed || [],
      laborCost: job?.laborCost,
      serviceOnlyCost: serviceOnly ? toNumber(serviceOnlyCost) : 0,
      jobProducts: serviceOnly
        ? []
        : jobProducts,
      estimatedCost: 0,
      finalCost: 0,
      finalCostOverride: manualFinalOverride ? toNumber(finalCost) : undefined,
      paymentStatus: job?.paymentStatus,
    });
  }, [finalCost, job?.laborCost, job?.partsUsed, job?.paymentStatus, jobProducts, manualFinalOverride, serviceOnly, serviceOnlyCost]);
  const effectiveFinalCost = computedJobCost.finalCost;
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
      setFinalCost(String(effectiveFinalCost));
    }
  }, [manualFinalOverride, effectiveFinalCost]);

  useEffect(() => {
    if (!jobProducts.length) return;
    if (partScope === 'product' && !partProductItemId) {
      setPartProductItemId(String(jobProducts[0]?.itemId || ''));
    }
  }, [jobProducts, partProductItemId, partScope]);

  const persistProducts = async (nextProducts: RepairJobProduct[], nextServiceOnly: boolean) => {
    if (!job) return;
    const lead = nextProducts[0];
    const normalizedProducts = nextProducts.map((item) => {
      const labels = accessoryLabelsFromIds(item.accessoryIds, repairSettings.accessoriesCatalog);
      const notes = String(item.accessories || '').trim();
      // Avoid duplicating catalog labels into the free-text notes field on reload.
      const notesWithoutLabels = labels && notes.startsWith(labels)
        ? notes.slice(labels.length).replace(/^[\s،,]+/, '').trim()
        : notes;
      return {
        ...item,
        quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        accessoryIds: Array.isArray(item.accessoryIds) ? item.accessoryIds : [],
        serviceIds: Array.isArray(item.serviceIds) ? item.serviceIds : [],
        accessories: [labels, notesWithoutLabels].filter(Boolean).join('، '),
      };
    });
    const costForSave = computeRepairJobCost({
      partsUsed: job.partsUsed || [],
      laborCost: job.laborCost,
      serviceOnlyCost: nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : 0,
      jobProducts: nextServiceOnly ? [] : normalizedProducts,
      estimatedCost: 0,
      finalCost: 0,
      finalCostOverride: manualFinalOverride ? toNumber(finalCost) : undefined,
    });
    const payload: Partial<RepairJob> = {
      jobProducts: normalizedProducts,
      isServiceOnly: nextServiceOnly,
      productId: lead?.productId || '',
      productName: lead?.productName || '',
      deviceType: lead?.deviceType || job.deviceType || '',
      deviceBrand: lead?.deviceBrand || job.deviceBrand || '',
      deviceModel: lead?.deviceModel || job.deviceModel || '',
      problemDescription: lead?.diagnosis || job.problemDescription || '',
      accessories: normalizedProducts[0]?.accessories || job.accessories || '',
      estimatedCost: costForSave.estimatedCost || costForSave.finalCost,
      finalCost: costForSave.finalCost,
      finalCostOverride: manualFinalOverride
        ? toNumber(finalCost)
        : (nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : undefined),
      serviceOnlyCost: nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : 0,
      warranty: normalizedProducts.some((item) => item.inWarranty) ? 'none' : warranty,
    };
    await repairJobService.update(jobId, payload);
    const refreshed = await repairJobService.getById(jobId);
    if (refreshed) {
      setJob(refreshed);
      setJobProducts(inferProducts(refreshed));
    }
  };

  const applyStatus = async () => {
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
    try {
      await persistProducts(jobProducts, serviceOnly);
      const finalCostNumber = effectiveFinalCost;
      const needsTreasuryPosting = isDeliveredStatus(status)
        && finalCostNumber > 0
        && !isDeliveredStatus(job?.status || '');
      if (needsTreasuryPosting) {
        await repairTreasuryService.ensureOpenSession(job?.branchId || '');
      }
      await repairJobService.changeStatus({
        jobId,
        status,
        technicianId: userProfile?.id,
        reason: isUnrepairableStatus(status) || isCancelledStatus(status) ? reason : undefined,
        finalCost: isDeliveredStatus(status) ? finalCostNumber : undefined,
        warranty: isDeliveredStatus(status) ? warranty : undefined,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
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
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
    if (!userProfile?.id) return;
    try {
      await repairJobService.assignTechnician(jobId, userProfile.id, {
        uid: userProfile.id,
        name: userProfile.displayName || userProfile.email || 'مستخدم',
      });
      setJob(await repairJobService.getById(jobId));
      toast.success('تم إسناد الطلب لك.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب.');
    }
  };

  const assignToBranchTechnician = async () => {
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
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
      await repairJobService.assignTechnician(jobId, technicianId, {
        uid: userProfile?.id || '',
        name: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      setJob(await repairJobService.getById(jobId));
      toast.success('تم إسناد الطلب للفني المختار.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب للفني.');
    }
  };

  const addPartUsage = async () => {
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
    if (serviceOnly) {
      toast.error('تم تفعيل خدمة فقط. أوقف الخيار لإضافة قطع غيار.');
      return;
    }
    if (!branchWarehouseId) {
      toast.error('هذا الفرع لا يملك مخزنًا مرتبطًا. لا يمكن صرف قطع الغيار.');
      return;
    }
    const part = parts.find((p) => p.id === selectedPartId);
    if (!part || !job.branchId) return;
    const qty = Number(partQty || 0);
    if (qty <= 0) return;
    const materialId = String(part.materialId || part.rawMaterialId || '').trim();
    const actor = userProfile?.displayName || userProfile?.email || 'system';

    try {
      await sparePartsService.consumeActiveReservationForJob({
        jobId,
        partId: part.id || '',
        quantity: qty,
        updatedBy: actor,
      });

      if (materialId) {
        const created = await repairSpareIssueService.create({
          warehouseId: branchWarehouseId,
          branchId: job.branchId,
          jobId,
          jobCode: String(job.receiptNo || job.id || ''),
          note: 'صرف من طلب صيانة',
          lines: [{ itemId: materialId, quantity: qty }],
          jobPartUsage: {
            partId: part.id || '',
            partName: part.name,
            scope: partScope,
            ...(partScope === 'product'
              ? {
                  productItemId: partProductItemId,
                  productName:
                    jobProducts.find((item) => item.itemId === partProductItemId)?.productName || '',
                }
              : {}),
          },
        });
        if (created.approvalMode === 'direct') {
          await repairSpareIssueService.issue(created.id);
          toast.success(`تم صرف القطعة على المخازن (${created.referenceNo}).`);
        } else {
          toast.success(
            `تم إنشاء سند ${created.referenceNo} بانتظار الاعتماد من شاشة سندات صرف قطع الغيار.`,
          );
        }
        setJob(await repairJobService.getById(jobId));
        return;
      }

      // Legacy repair ledger when part has no linked manufacturing material.
      const nextParts = [...(job.partsUsed || []), {
        partId: part.id || '',
        partName: part.name,
        quantity: qty,
        unitCost: effectiveSparePartUnitCost(part),
        scope: partScope,
        productItemId: partScope === 'product' ? partProductItemId : undefined,
        productName: partScope === 'product'
          ? (jobProducts.find((item) => item.itemId === partProductItemId)?.productName || '')
          : undefined,
      }];
      await sparePartsService.adjustStock({
        branchId: job.branchId,
        warehouseId: branchWarehouseId,
        warehouseName: branch?.name ? `مخزن ${branch.name}` : branchWarehouseCode,
        partId: part.id || '',
        partName: part.name,
        quantity: qty,
        type: 'OUT',
        createdBy: actor,
        jobId,
        notes: 'استهلاك قطع غيار في طلب صيانة',
      });
      await repairJobService.update(jobId, { partsUsed: nextParts });
      setJob(await repairJobService.getById(jobId));
      toast.success('تم خصم القطعة من مخزون الصيانة (دفتر قديم — اربط القطعة بمكوّن).');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر خصم القطعة من المخزون.');
    }
  };

  const removePartUsage = async (idx: number) => {
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
    if (!job?.branchId || !branchWarehouseId) {
      toast.error('لا يمكن إرجاع القطعة بدون إعداد مخزن الفرع.');
      return;
    }
    const current = Array.isArray(job.partsUsed) ? [...job.partsUsed] : [];
    const target = current[idx];
    if (!target) return;
    try {
      const issueId = String(target.issueId || '').trim();
      if (issueId) {
        await repairSpareIssueService.returnLines(issueId, [{
          itemId: String(
            target.materialId
              || parts.find((p) => p.id === target.partId)?.materialId
              || parts.find((p) => p.id === target.partId)?.rawMaterialId
              || target.partId,
          ),
          quantity: Number(target.quantity || 0),
        }]);
        current.splice(idx, 1);
        await repairJobService.update(jobId, { partsUsed: current });
        setJob(await repairJobService.getById(jobId));
        toast.success('تم إرجاع القطعة عبر سند المخازن.');
        return;
      }

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
    setJobProducts((prev) => prev.map((item) => {
      if (item.itemId !== itemId) return item;
      const next = { ...item, ...patch };
      const qty = Math.max(1, Math.round(Number(next.quantity || 1)));
      next.quantity = qty;
      if (patch.serviceIds !== undefined || patch.quantity !== undefined || patch.inWarranty !== undefined) {
        const unit = sumServiceCatalogPrices(next.serviceIds, repairSettings.serviceCatalog);
        const line = unit * qty;
        next.estimatedCost = line;
        next.finalCost = next.inWarranty ? 0 : line;
      }
      return next;
    }));
  };

  const applyMasterProduct = (itemId: string, productId: string) => {
    const selected = catalogProducts.find((p) => String(p.id) === String(productId));
    updateProduct(itemId, {
      productId,
      productName: String(selected?.name || selected?.code || ''),
      deviceType: String(selected?.category || selected?.categoryName || 'منتج'),
      deviceBrand: String(selected?.name || ''),
      deviceModel: String(selected?.model || selected?.code || ''),
    });
  };

  const addProductRow = () => {
    setJobProducts((prev) => [
      ...prev,
      {
        itemId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: '',
        productName: '',
        quantity: 1,
        accessoryIds: [],
        serviceIds: [],
        accessories: '',
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
    if (!canEditThisJob) {
      toast.error('ليس لديك صلاحية تعديل هذا الطلب.');
      return;
    }
    const missingMaster = jobProducts.some((item) => !String(item.productId || '').trim());
    if (missingMaster) {
      toast.error('اختر المنتج من الماستر لكل سطر قبل الحفظ.');
      return;
    }
    try {
      await persistProducts(jobProducts, serviceOnly);
      toast.success('تم حفظ بيانات المنتجات والتشخيص.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ بيانات المنتجات.');
    }
  };

  const createReopenRepair = async () => {
    if (!job?.id) return;
    if (!isDeliveredStatus(job.status)) {
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

  const linkMasterCustomer = async () => {
    if (!job?.id || !linkCustomerId) {
      toast.error('اختر عميلًا من الماستر.');
      return;
    }
    const selected = customers.find((c) => c.id === linkCustomerId) || (await customerService.getById(linkCustomerId));
    if (!selected) {
      toast.error('العميل غير موجود.');
      return;
    }
    setLinkingCustomer(true);
    try {
      await repairJobService.update(job.id, {
        customerId: selected.id,
        customerName: selected.name,
        customerPhone: selected.phone,
        customerAddress: selected.address || job.customerAddress || '',
      });
      await customerActivityService.record({
        customerId: String(selected.id),
        module: 'repair',
        action: 'repair.job_linked',
        title: 'ربط طلب صيانة بالماستر',
        summary: `#${job.receiptNo}`,
        referenceType: 'repair_job',
        referenceId: job.id,
        referenceLabel: job.receiptNo,
        actorUid: userProfile?.id,
        actorName: userProfile?.displayName || userProfile?.email || '',
      });
      setJob((prev) =>
        prev
          ? {
              ...prev,
              customerId: selected.id,
              customerName: selected.name,
              customerPhone: selected.phone,
              customerAddress: selected.address || prev.customerAddress || '',
            }
          : prev,
      );
      setMasterCustomer(selected);
      setLinkCustomerOpen(false);
      toast.success('تم ربط الطلب بعميل الماستر.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر ربط العميل.');
    } finally {
      setLinkingCustomer(false);
    }
  };

  const autoLinkByPhone = async () => {
    if (!job?.id || !job.customerPhone) {
      toast.error('لا يوجد هاتف على الطلب للمطابقة.');
      return;
    }
    try {
      const matches = await customerService.findByPhoneDigits(job.customerPhone);
      const hit = matches[0];
      if (!hit?.id) {
        toast.error('لا يوجد عميل ماستر مطابق لهذا الهاتف. اختر أو أنشئ من الربط اليدوي.');
        setLinkCustomerOpen(true);
        return;
      }
      setLinkCustomerId(String(hit.id));
      setCustomers((prev) => (prev.some((c) => c.id === hit.id) ? prev : [...prev, hit]));
      setLinkCustomerOpen(true);
      toast.info(`تم العثور على ${hit.code} — ${hit.name}. أكّد الربط.`);
    } catch {
      toast.error('تعذر البحث في الماستر.');
    }
  };

  const exportReceipt = async () => {
    if (!printRef.current || !job) {
      toast.error('تعذر تجهيز نسخة PDF.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportToPDF(printRef.current, `repair-receipt-${job.receiptNo}`);
      toast.success('تم تنزيل PDF.');
    } catch {
      toast.error('تعذر تصدير PDF.');
    } finally {
      setExportingPdf(false);
    }
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
    if (!effectiveSlug) return `${appBaseUrl}/track`;
    const params = new URLSearchParams();
    if (job.receiptNo) params.set('receipt', String(job.receiptNo));
    if (job.customerPhone) params.set('phone', String(job.customerPhone));
    const query = params.toString();
    return `${appBaseUrl}/track/${encodeURIComponent(effectiveSlug)}${query ? `?${query}` : ''}`;
  }, [appBaseUrl, job, tenantSlug]);
  const whatsappText = useMemo(() => {
    if (!job) return '';
    const baseMessage = formatRepairWhatsAppMessage(job);
    if (!trackUrl) return `${baseMessage}\nرابط متابعة الطلب: /track`;
    return [
      baseMessage,
      `رابط متابعة الطلب (  اضغط هنا): ${trackUrl}`,
    ].join('\n');
  }, [job, trackUrl]);
  const isAssignedToCurrentTechnician = useMemo(() => {
    const assigned = String(job?.technicianId || '').trim();
    return assigned.length > 0 && technicianIds.includes(assigned);
  }, [job?.technicianId, technicianIds]);
  const canEditThisJob = can('repair.jobs.edit') || (repairCtx.isRepairTechnician && isAssignedToCurrentTechnician);
  const canViewThisJob = !repairCtx.jobsTechnicianOnly || isAssignedToCurrentTechnician;
  const canDeleteJob = Boolean(job) && !isDeliveredStatus(job?.status || '') && !Boolean(job?.isClosed) && canEditThisJob;

  const deleteJob = async () => {
    if (!job?.id) return;
    if (!canDeleteJob) {
      toast.error('لا يمكن حذف طلب مُسلَّم أو مُقفل.');
      return;
    }
    const ok = window.confirm(`سيتم حذف طلب الصيانة #${job.receiptNo} نهائيًا. هل أنت متأكد؟`);
    if (!ok) return;
    try {
      await repairJobService.remove(job.id);
      toast.success('تم حذف طلب الصيانة.');
      navigate(withTenantPath(tenantSlug, '/repair/admin-orders'));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف طلب الصيانة.');
    }
  };

  if (!job) {
    return (
      <div dir={dir} className="erp-ds-clean space-y-4" role="status" aria-live="polite">
        <PageHeader title="تفاصيل طلب الصيانة" subtitle="جاري تحميل الطلب…" />
      </div>
    );
  }
  if (!canViewThisJob) {
    return (
      <div dir={dir} className="erp-ds-clean space-y-4">
        <PageHeader title="تفاصيل طلب الصيانة" />
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          هذا الطلب غير مسند لك، ولا تملك صلاحية عرضه.
        </div>
      </div>
    );
  }

  const warrantyLabel =
    job.warranty === '3months' ? '3 شهور' : job.warranty === '6months' ? '6 شهور' : 'بدون';
  const accessoriesSummary =
    jobProducts.map((item) => String(item.accessories || '').trim()).filter(Boolean).join(' | ')
    || job.accessories
    || '—';

  return (
    <div className="erp-ds-clean space-y-4" dir={dir}>
      <PageHeader
        title={`طلب صيانة #${job.receiptNo}`}
        subtitle="مراجعة الحالة والمنتجات وقطع الغيار، مع طباعة وفق قالب النظام."
        icon="fact_check"
        backAction={{ to: withTenantPath(tenantSlug, '/repair/admin-orders') }}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <Button type="button" variant="outline" size="sm" onClick={() => handlePrint()}>
              <Printer className="h-4 w-4 ms-1" />
              طباعة
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportReceipt()} disabled={exportingPdf}>
              <Download className="h-4 w-4 ms-1" />
              {exportingPdf ? 'جاري التصدير…' : 'تنزيل PDF'}
            </Button>
            <WhatsAppShare text={whatsappText} phone={job.customerPhone} />
            {isDeliveredStatus(job.status) ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowReopenOptions((v) => !v)}>
                {showReopenOptions ? 'إخفاء إعادة الإصلاح' : 'إعادة إصلاح'}
              </Button>
            ) : null}
          </div>
        )}
      />

      {isDeliveredStatus(job.status) && showReopenOptions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">إعادة إصلاح</CardTitle>
            <CardDescription>إنشاء طلب جديد مرتبط بالطلب الحالي.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>معالجة القيد المالي السابق</Label>
              <Select value={reopenTreasuryHandling} onValueChange={(v) => setReopenTreasuryHandling(v as 'reverse' | 'keep')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">الإبقاء على القيد السابق</SelectItem>
                  <SelectItem value="reverse">عكس القيد السابق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المنتجات المنقولة للطلب الجديد</Label>
              <div className="space-y-1 rounded border p-2">
                {jobProducts.map((item, idx) => {
                  const itemId = String(item.itemId || '');
                  const checked = selectedReopenProductIds.includes(itemId);
                  return (
                    <label key={itemId || idx} className="inline-flex items-center gap-2 text-sm w-full">
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
            </div>
            <Button onClick={() => void createReopenRepair()} disabled={isReopening}>
              {isReopening ? 'جاري الإنشاء…' : 'إنشاء طلب إعادة إصلاح'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <aside className="space-y-4 lg:col-span-1 lg:order-2 lg:sticky lg:top-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ملخص الطلب</CardTitle>
              <CardDescription>بيانات التشغيل — الطباعة من زر الصفحة تستخدم قالب النظام.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-1 gap-2">
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">التاريخ</dt>
                  <dd className="font-medium tabular-nums">{new Date(job.createdAt).toLocaleString('ar-EG')}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">الفرع</dt>
                  <dd className="font-medium text-end">{branch?.name || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">العميل</dt>
                  <dd className="font-medium text-end">
                    {masterCustomer ? (
                      <Link className="text-primary hover:underline" to={withTenantPath(tenantSlug, `/customers/${masterCustomer.id}`)}>
                        {masterCustomer.code} — {job.customerName || masterCustomer.name}
                      </Link>
                    ) : (job.customerName || '—')}
                  </dd>
                </div>
                {masterCustomer ? (
                  <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                    <dt className="text-muted-foreground">نوع العميل</dt>
                    <dd className="font-medium">{CUSTOMER_TYPE_LABELS[masterCustomer.type]}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">الهاتف</dt>
                  <dd className="font-medium tabular-nums" dir="ltr">{job.customerPhone || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">المنتجات</dt>
                  <dd className="font-medium tabular-nums">{jobProducts.length} سطر / {productsQtyTotal} قطعة</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">التكلفة</dt>
                  <dd className="font-medium tabular-nums">
                    {Number(job.finalCost || 0) > 0 ? `${Number(job.finalCost || 0).toLocaleString('ar-EG')} ج.م` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">الضمان</dt>
                  <dd className="font-medium">{warrantyLabel}</dd>
                </div>
              </dl>

              {!job.customerId && can('repair.jobs.edit') ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                  <Badge variant="outline" className="text-amber-900 border-amber-300 bg-amber-50">
                    غير مربوط بماستر العملاء
                  </Badge>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void autoLinkByPhone()}>
                      مطابقة بالهاتف
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setLinkCustomerId('');
                        setLinkCustomerOpen(true);
                      }}
                    >
                      ربط بعميل ماستر
                    </Button>
                  </div>
                </div>
              ) : null}
              {job.customerId && can('repair.jobs.edit') ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="px-0"
                  onClick={() => {
                    setLinkCustomerId(String(job.customerId || ''));
                    setLinkCustomerOpen(true);
                  }}
                >
                  تغيير ربط العميل
                </Button>
              ) : null}

              <div className="rounded-md border bg-muted/20 p-2.5 space-y-1.5">
                <div><span className="text-muted-foreground">الجهاز:</span> {job.deviceType || '—'} · {job.deviceBrand} {job.deviceModel}</div>
                <div><span className="text-muted-foreground">اللون:</span> {job.deviceColor || '—'}</div>
                <div><span className="text-muted-foreground">الإكسسوارات:</span> {accessoriesSummary}</div>
                <div><span className="text-muted-foreground">العنوان:</span> {job.customerAddress || '—'}</div>
                <div><span className="text-muted-foreground">وصف العطل:</span> {job.problemDescription || '—'}</div>
              </div>

              {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">قطع مستخدمة</p>
                  {job.partsUsed.map((part, idx) => (
                    <div key={`${part.partId}-${idx}`} className="flex justify-between gap-2 rounded border px-2 py-1">
                      <span>{part.partName}</span>
                      <span className="tabular-nums text-muted-foreground">×{part.quantity}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {trackUrl ? (
                <div className="flex items-center gap-3 rounded-md border p-2">
                  <div className="rounded border bg-white p-1">
                    <QRCodeSVG value={trackUrl} size={72} includeMargin />
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    امسح الرمز لمتابعة الطلب من صفحة التتبع العامة.
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4 lg:col-span-2 lg:order-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">المنتجات والتشخيص</CardTitle>
              <CardDescription>
                اختر المنتج من الماستر وحدد الكمية. التكلفة تُحسب من خدمات الإصلاح و/أو قطع الغيار المستخدمة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobProducts.map((item, idx) => (
                <div key={item.itemId} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">منتج {idx + 1}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProductRow(item.itemId)}
                      disabled={jobProducts.length <= 1}
                      aria-label={`حذف منتج ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>المنتج (ماستر) <span className="text-rose-600">*</span></Label>
                      <Select
                        value={String(item.productId || '')}
                        onValueChange={(value) => applyMasterProduct(item.itemId, value)}
                      >
                        <SelectTrigger className={!item.productId ? 'border-rose-300' : undefined}>
                          <SelectValue placeholder="اختر من المنتجات المعرفة" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogProducts.filter((p) => p.id).map((product) => (
                            <SelectItem key={product.id} value={String(product.id)}>
                              {product.name}
                              {product.model ? ` — ${product.model}` : ''}
                              {product.code ? ` (${product.code})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>الكمية</Label>
                      <Input
                        type="number"
                        min={1}
                        value={String(item.quantity || 1)}
                        onChange={(e) => updateProduct(item.itemId, {
                          quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                        })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>السيريال</Label>
                      <Input
                        value={item.serialNo || ''}
                        onChange={(e) => updateProduct(item.itemId, { serialNo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>الإكسسوارات (من الإعدادات)</Label>
                      <div className="flex flex-wrap gap-3 rounded-md border p-2">
                        {enabledAccessories.map((accessory) => (
                          <label key={accessory.id} className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={(item.accessoryIds || []).includes(accessory.id)}
                              onChange={() => updateProduct(item.itemId, {
                                accessoryIds: toggleCatalogId(item.accessoryIds, accessory.id),
                              })}
                            />
                            {accessory.label}
                          </label>
                        ))}
                        {enabledAccessories.length === 0 ? (
                          <span className="text-xs text-muted-foreground">لا توجد إكسسوارات في الإعدادات.</span>
                        ) : null}
                      </div>
                      <Input
                        className="mt-2"
                        placeholder="أخرى (ملاحظات إضافية)"
                        value={item.accessories || ''}
                        onChange={(e) => updateProduct(item.itemId, { accessories: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>خدمات الإصلاح (من الإعدادات)</Label>
                      <div className="flex flex-wrap gap-3 rounded-md border p-2">
                        {enabledServices.map((service) => (
                          <label key={service.id} className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={(item.serviceIds || []).includes(service.id)}
                              onChange={() => updateProduct(item.itemId, {
                                serviceIds: toggleCatalogId(item.serviceIds, service.id),
                              })}
                            />
                            {service.name} ({Number(service.price || 0).toLocaleString('ar-EG')} ج.م)
                          </label>
                        ))}
                        {enabledServices.length === 0 ? (
                          <span className="text-xs text-muted-foreground">عرّف الخدمات من إعدادات الصيانة.</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        تكلفة خدمات هذا السطر: {Number(item.finalCost || 0).toLocaleString('ar-EG')} ج.م
                        {' '}(سعر الخدمة × الكمية{item.inWarranty ? ' — ضمان مجاني' : ''})
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>التشخيص</Label>
                    <textarea
                      className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={item.diagnosis || ''}
                      onChange={(e) => updateProduct(item.itemId, { diagnosis: e.target.value })}
                    />
                  </div>
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
                    داخل الضمان (إصلاح مجاني)
                  </label>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={addProductRow}>إضافة منتج</Button>
                <Button type="button" onClick={saveMultiProductDetails} disabled={!canEditThisJob}>
                  حفظ المنتجات والتشخيص
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">تحديث الحالة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as RepairJob['status'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedStatusOptions.map((statusOption) => (
                        <SelectItem key={statusOption.id} value={statusOption.id}>
                          {statusOption.label || REPAIR_JOB_STATUS_LABELS[statusOption.id] || statusOption.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">تظهر الحالات المسموح الانتقال إليها فقط.</p>
                </div>
                {isUnrepairableStatus(status) ? (
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
                ) : null}
                {isCancelledStatus(status) ? (
                  <div className="space-y-1">
                    <Label htmlFor="cancel-reason">سبب الإلغاء</Label>
                    <textarea
                      id="cancel-reason"
                      placeholder="مثال: رفض العميل التكلفة، سحب الجهاز…"
                      className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                ) : null}
                {isDeliveredStatus(status) ? (
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={manualFinalOverride}
                        onChange={(e) => setManualFinalOverride(e.target.checked)}
                      />
                      تعديل يدوي للإجمالي النهائي
                    </label>
                    <div className="space-y-1">
                      <Label>التكلفة النهائية</Label>
                      <Input
                        type="number"
                        value={finalCost}
                        onChange={(e) => setFinalCost(e.target.value)}
                        disabled={!manualFinalOverride}
                      />
                    </div>
                    {!manualFinalOverride ? (
                      <p className="text-xs text-muted-foreground">
                        الإجمالي المحسوب: {effectiveFinalCost.toLocaleString('ar-EG')} ج.م
                        {' '}(خدمات {productsServiceTotal.toLocaleString('ar-EG')}
                        {' · '}قطع {computedJobCost.partsCost.toLocaleString('ar-EG')}
                        {serviceOnly ? ` · خدمة فقط ${toNumber(serviceOnlyCost).toLocaleString('ar-EG')}` : ''})
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {hasInWarrantyProduct ? 'يوجد منتج داخل الضمان' : 'لا يوجد منتج داخل الضمان'}
                    </p>
                    <div className="space-y-1">
                      <Label>ضمان الورشة</Label>
                      <Select value={warranty} onValueChange={(v) => setWarranty(v as RepairJob['warranty'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون</SelectItem>
                          <SelectItem value="3months">3 شهور</SelectItem>
                          <SelectItem value="6months">6 شهور</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
                <Button onClick={applyStatus} disabled={!canEditThisJob}>حفظ الحالة</Button>
                {Array.isArray(job.statusHistory) && job.statusHistory.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">سجل الحالة</p>
                    {[...job.statusHistory].reverse().map((entry, idx) => (
                      <div key={`${entry.at}-${idx}`} className="rounded border px-2 py-1.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={entry.status} />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {new Date(entry.at).toLocaleString('ar-EG')}
                          </span>
                        </div>
                        {entry.reason ? (
                          <div className="mt-1 text-xs text-muted-foreground">السبب: {entry.reason}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">قطع الغيار والإسناد</CardTitle>
                <CardDescription>صرف قطع، خدمة فقط، أو إسناد فني.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                  خدمة فقط بدون قطع غيار
                </label>
                {serviceOnly ? (
                  <div className="space-y-1">
                    <Label>تكلفة خدمة الإصلاح</Label>
                    <Input
                      type="number"
                      value={serviceOnlyCost}
                      onChange={(e) => setServiceOnlyCost(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>نطاق الصرف</Label>
                  <Select value={partScope} onValueChange={(v) => setPartScope(v as 'job' | 'product')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="job">على مستوى الطلب</SelectItem>
                      <SelectItem value="product">مرتبط بمنتج</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {partScope === 'product' ? (
                  <div className="space-y-1">
                    <Label>المنتج</Label>
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
                  </div>
                ) : null}
                {!branchWarehouseId ? (
                  <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    هذا الفرع لا يملك مخزنًا مرتبطًا، لذلك لا يمكن صرف قطع الغيار من الطلب.
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>القطعة (بحث في كل قطع الفرع — غير مقيد بـ BOM المنتج)</Label>
                  <Input
                    value={partCatalogSearch}
                    onChange={(e) => setPartCatalogSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود أو المادة…"
                  />
                  <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                    <SelectTrigger><SelectValue placeholder="اختر قطعة" /></SelectTrigger>
                    <SelectContent>
                      {filteredParts.map((p) => (
                        <SelectItem key={p.id} value={p.id || ''}>{p.name}{p.code ? ` (${p.code})` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>الكمية</Label>
                  <Input type="number" min={1} value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                </div>
                <Button
                  variant="outline"
                  onClick={addPartUsage}
                  disabled={!canEditThisJob || serviceOnly || !branchWarehouseId || (partScope === 'product' && !partProductItemId)}
                >
                  إضافة / خصم
                </Button>

                <div className="space-y-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label>إسناد لفني من الفرع</Label>
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
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={assignToBranchTechnician}
                      disabled={!canEditThisJob || !selectedTechnicianId || branchTechnicians.length === 0}
                    >
                      إسناد للفني
                    </Button>
                    <Button variant="secondary" onClick={assignToMe} disabled={!canEditThisJob}>
                      إسناد لي
                    </Button>
                    <Button variant="ghost" onClick={() => void saveMultiProductDetails()} disabled={!canEditThisJob}>
                      حفظ وضع الخدمة
                    </Button>
                  </div>
                </div>

                {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 ? (
                  <div className="space-y-1 border-t pt-3">
                    <p className="text-sm font-medium">قطع الغيار المستخدمة</p>
                    {job.partsUsed.map((part: RepairPartUsage, idx) => (
                      <div key={`${part.partId}-${idx}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                        <div className="min-w-0">
                          <span>{part.partName}</span>
                          {part.scope === 'product' ? (
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({part.productName || 'منتج محدد'})
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary">× {part.quantity}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removePartUsage(idx)}
                            aria-label={`حذف ${part.partName}`}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={linkCustomerOpen} onOpenChange={setLinkCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ربط الطلب بعميل الماستر</DialogTitle>
            <DialogDescription>
              يحدّث العميل على الطلب وينسخ الاسم/الهاتف من الماستر، ويُسجَّل في تايملاين العميل.
            </DialogDescription>
          </DialogHeader>
          <CustomerPicker
            customers={customers}
            valueId={linkCustomerId}
            canCreate={can('customers.create') || can('repair.jobs.edit')}
            actor={{
              userId: String(userProfile?.id || ''),
              userName: String(userProfile?.displayName || userProfile?.email || 'مستخدم'),
            }}
            onSelect={(customer) => setLinkCustomerId(customer?.id || '')}
            onCreated={(created) => {
              setCustomers((prev) => {
                if (prev.some((c) => c.id === created.id)) return prev;
                return [...prev, created];
              });
              setLinkCustomerId(String(created.id || ''));
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkCustomerOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" disabled={linkingCustomer || !linkCustomerId} onClick={() => void linkMasterCustomer()}>
              {linkingCustomer ? 'جاري الربط…' : 'تأكيد الربط'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen system print document — same DOM for print + PDF */}
      <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
        <RepairJobPrint
          ref={printRef}
          job={job}
          branch={branch}
          products={jobProducts}
          trackUrl={trackUrl}
          printSettings={printTemplate}
        />
      </div>
    </div>
  );
};

export default RepairJobDetail;
