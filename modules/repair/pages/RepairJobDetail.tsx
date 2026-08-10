import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { OpsMoreActionsMenu } from '@/modules/dashboards/components/OpsMoreActionsMenu';
import { RepairOpsPageShell } from '@/modules/repair/components/RepairOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DetailPageStickyHeader,
  NESTED_TILE,
  SURFACE_CARD,
} from '@/src/components/erp/DetailPageChrome';
import { cn } from '@/lib/utils';
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
import { repairPaymentService } from '../services/repairPaymentService';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSpareIssueService } from '../services/repairSpareIssueService';
import { repairJobSparePartRequestService } from '../services/repairJobSparePartRequestService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import { userService } from '../../../services/userService';
import { employeeService } from '../../hr/employeeService';
import { buildRepairApprovalPublicUrl, buildRepairTrackPublicUrl } from '../lib/repairPublicLinks';
import { resolveRepairJobPaymentCloseState } from '../lib/repairJobPaymentClose';
import {
  isFullManufacturerWarrantyJob,
  isManufacturerWarrantyJob,
  isPartialManufacturerWarrantyJob,
  isWarrantySettlementAuth,
  manufacturerWarrantyLineLabel,
  manufacturerWarrantyScopeLabel,
  resolveManufacturerWarrantyScope,
} from '../lib/repairManufacturerWarranty';
import { formatRepairApprovalRequestMessage } from '../utils/whatsappRepairMessage';
import { RepairJobPrint } from '../components/RepairJobPrint';
import { RepairJobIntakePrintBundle } from '../components/RepairJobIntakePrintBundle';
import { DeliveryReceiptPDF } from '../components/DeliveryReceiptPDF';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { isReadyToIssueUsage } from '../lib/repairPartFulfillment';
import { StatusBadge } from '../components/StatusBadge';
import { WhatsAppShare } from '../components/WhatsAppShare';
import {
  REPAIR_JOB_STATUS_LABELS,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairJob,
  type RepairJobFinancial,
  type RepairJobProduct,
  type RepairPaymentAuthorization,
  type RepairPaymentMethod,
  type RepairPartUsage,
  type RepairSparePart,
} from '../types';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { canManageRepairWorkshopWork, isSingleBranchTechnician } from '../lib/repairJobIntake';
import {
  isActorBranchTechnician,
  resolveTechnicianIdForJobAssignment,
} from '../lib/repairTechnicianAssignment';
import { repairSparePartSalePrice } from '../utils/sparePartPricing';
import { resolveRepairSettings, sumServiceCatalogPrices, accessoryLabelsFromIds } from '../config/repairSettings';
import { isStatusRole } from '../lib/repairStatusAdvance';
import { computeRepairJobCost, resolveRepairJobActionState } from '../utils/repairBusinessLogic';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
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
    technicianDiagnosis: '',
    estimatedCost: toNumber(job.estimatedCost),
    finalCost: toNumber(job.finalCost),
    inWarranty: false,
  }];
};

export const RepairJobDetail: React.FC = () => {
  const { dir } = useAppDirection();
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const shellBackAction = (
    <Button type="button" variant="ghost" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
      رجوع
    </Button>
  );
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const catalogProducts = useAppStore((s) => s._rawProducts);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
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
  const technicianIds = useRepairTechnicianIds(userProfile, currentEmployee?.id);
  const [job, setJob] = useState<RepairJob | null>(null);
  const [financial, setFinancial] = useState<RepairJobFinancial | null>(null);
  const [paymentAuthorization, setPaymentAuthorization] = useState<RepairPaymentAuthorization | null>(null);
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
  const [branchTechnicians, setBranchTechnicians] = useState<Array<{ id: string; userId?: string; name: string }>>([]);
  const [technicianNameById, setTechnicianNameById] = useState<Record<string, string>>({});
  const [assignBusy, setAssignBusy] = useState(false);
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
  const [exportingDeliveryPdf, setExportingDeliveryPdf] = useState(false);
  const [issuingUsageId, setIssuingUsageId] = useState<string | null>(null);
  const [intakePrintOpen, setIntakePrintOpen] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState('');
  const [creatingApprovalLink, setCreatingApprovalLink] = useState(false);
  const [preparingPaymentAuth, setPreparingPaymentAuth] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<RepairPaymentMethod>('cash');
  const [collectAndDeliver, setCollectAndDeliver] = useState(false);
  const [collectReceivable, setCollectReceivable] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [opsDialog, setOpsDialog] = useState<{
    mode: 'unrepairable' | 'replacement';
    item: RepairJobProduct;
  } | null>(null);
  const [opsQty, setOpsQty] = useState(1);
  const [opsReason, setOpsReason] = useState('');
  const [opsReasonCode, setOpsReasonCode] = useState('');
  const [opsBusy, setOpsBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const intakeBundlePrintRef = useRef<HTMLDivElement>(null);
  const deliveryAuthorizationPrintRef = useRef<HTMLDivElement>(null);
  const printTemplate = systemSettings?.printTemplate;
  const intakeBundlePrintSettings = useMemo(
    () => ({ ...DEFAULT_PRINT_TEMPLATE, ...printTemplate, paperSize: 'a5' as const }),
    [printTemplate],
  );
  /** إيصال × نسختين (مركز + عميل) ثم كارت داخلي — كلها A5. */
  const handlePrintIntakeBundle = useManagedPrint({
    contentRef: intakeBundlePrintRef,
    printSettings: intakeBundlePrintSettings,
    documentTitle: job ? `ايصال-نسختين-وكارت-${job.receiptNo}` : 'ايصال-نسختين-وكارت',
  });
  const handlePrintDeliveryAuthorization = useManagedPrint({
    contentRef: deliveryAuthorizationPrintRef,
    printSettings: printTemplate,
    documentTitle: job ? `اذن-تسليم-${job.deliveryAuthorizationNo || job.receiptNo}` : 'اذن-تسليم',
  });
  const printDeliveryAuthorizationRef = useRef(handlePrintDeliveryAuthorization);
  printDeliveryAuthorizationRef.current = handlePrintDeliveryAuthorization;

  const queueDeliveryAuthorizationPrint = () => {
    // Print after the delivered document (authorization no.) has painted.
    // Do not use an effect keyed on the print handler — its identity changes and cancels the timer.
    window.setTimeout(() => {
      try {
        printDeliveryAuthorizationRef.current();
      } catch {
        toast.error('تعذر فتح الطباعة تلقائيًا. استخدم زر طباعة إذن التسليم.');
      }
    }, 450);
  };

  useEffect(() => {
    if (searchParams.get('print') !== 'intake') return;
    setIntakePrintOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('print');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
    const canLoadPaymentDocs =
      can('repair.finance.view')
      || can('repair.payments.view')
      || can('repair.payments.collect')
      || can('repair.discounts.request');
    if (!jobId || !canLoadPaymentDocs) {
      setFinancial(null);
      setPaymentAuthorization(null);
      return;
    }
    void repairPaymentService.getFinancial(jobId).then(async (row) => {
      setFinancial(row);
      setPaymentAuthorization(row?.currentAuthorizationId
        ? await repairPaymentService.getAuthorization(row.currentAuthorizationId)
        : null);
    }).catch(() => {
      setFinancial(null);
      setPaymentAuthorization(null);
    });
  }, [jobId, can]);

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

  const partOptions = useMemo(
    () => parts
      .filter((p) => p.id)
      .map((p) => ({
        value: String(p.id),
        label: `${p.name}${p.code ? ` (${p.code})` : ''}`.trim(),
      })),
    [parts],
  );
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
      paidAmount: job?.paidAmount,
      paymentStatus: job?.paymentStatus,
    });
  }, [finalCost, job?.laborCost, job?.paidAmount, job?.partsUsed, job?.paymentStatus, jobProducts, manualFinalOverride, serviceOnly, serviceOnlyCost]);
  const effectiveFinalCost = computedJobCost.finalCost;
  const hasInWarrantyProduct = useMemo(() => jobProducts.some((item) => item.inWarranty), [jobProducts]);

  const branch = useMemo(
    () => branches.find((b) => b.id === job?.branchId) || null,
    [branches, job?.branchId],
  );
  const branchWarehouseId = String(branch?.warehouseId || '').trim();
  const branchWarehouseCode = String(branch?.warehouseCode || '').trim();

  useEffect(() => {
    const branchTechIds = (branch?.technicianIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    const assignedId = String(job?.technicianId || '').trim();
    if (branchTechIds.length === 0 && !assignedId) {
      setBranchTechnicians([]);
      setTechnicianNameById({});
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

      const resolveName = (id: string): { name: string; userId?: string } => {
        const employee = employeesById.get(id) || employeesByUserId.get(id);
        const employeeUserId = String(employee?.userId || '').trim();
        const user = usersById.get(id) || (employeeUserId ? usersById.get(employeeUserId) : undefined);
        const name = String(
          employee?.name
          || user?.displayName
          || user?.email
          || '',
        ).trim() || 'فني غير معرف';
        return {
          name,
          userId: employeeUserId || (usersById.has(id) ? id : undefined),
        };
      };

      const nameMap: Record<string, string> = {};
      const options = branchTechIds.map((id) => {
        const resolved = resolveName(id);
        nameMap[id] = resolved.name;
        if (resolved.userId) nameMap[resolved.userId] = resolved.name;
        return { id, userId: resolved.userId, name: resolved.name };
      });

      // Job may be assigned by auth UID even when branch stores employee ids (or vice versa).
      if (assignedId && !nameMap[assignedId]) {
        const resolved = resolveName(assignedId);
        nameMap[assignedId] = resolved.name;
        if (resolved.userId) nameMap[resolved.userId] = resolved.name;
      }

      // Cross-link: if assigned UID matches a branch option's userId, prefer that name.
      options.forEach((opt) => {
        if (opt.userId) nameMap[opt.userId] = opt.name;
        nameMap[opt.id] = opt.name;
      });

      setBranchTechnicians(options);
      setTechnicianNameById(nameMap);
      setSelectedTechnicianId((prev) => {
        if (prev && (branchTechIds.includes(prev) || options.some((o) => o.userId === prev))) return prev;
        if (assignedId) {
          const byId = options.find((o) => o.id === assignedId || o.userId === assignedId);
          if (byId) return byId.id;
        }
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
      deviceSerial: String(lead?.serialNo || '').trim(),
      problemDescription: lead?.diagnosis || job.problemDescription || '',
      accessories: normalizedProducts[0]?.accessories || job.accessories || '',
      estimatedCost: costForSave.estimatedCost || costForSave.finalCost,
      finalCost: costForSave.finalCost,
      finalCostOverride: manualFinalOverride
        ? toNumber(finalCost)
        : (nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : undefined),
      serviceOnlyCost: nextServiceOnly ? toNumber(serviceOnlyCost || finalCost) : 0,
      warranty: normalizedProducts.some((item) => item.inWarranty) ? 'none' : warranty,
      warrantyScope: resolveManufacturerWarrantyScope(normalizedProducts),
    };
    await repairJobService.update(jobId, payload);
    const refreshed = await repairJobService.getById(jobId);
    if (refreshed) {
      setJob(refreshed);
      setJobProducts(inferProducts(refreshed));
    }
  };

  const assignActor = () => ({
    uid: userProfile?.id || '',
    name: userProfile?.displayName || userProfile?.email || 'مستخدم',
  });

  const assignToMe = async () => {
    if (!canManageTechnicianAssignment) {
      toast.error('ليس لديك صلاحية تغيير إسناد الفني.');
      return;
    }
    if (!userProfile?.id) return;
    if (!isActorBranchTechnician({
      actorUserId: userProfile.id,
      actorEmployeeId: currentEmployee?.id,
      branchTechnicians,
    })) {
      toast.error('إسناد لي متاح للفني المربوط بالفرع فقط، وليس لموظف الاستقبال.');
      return;
    }
    setAssignBusy(true);
    try {
      const hadAssignee = Boolean(String(job?.technicianId || '').trim());
      const beforeStatus = mapLegacyRepairStatus(job?.status || '');
      await repairJobService.assignTechnician(jobId, userProfile.id, assignActor());
      const refreshed = await repairJobService.getById(jobId);
      if (refreshed) setJob(refreshed);
      const afterStatus = mapLegacyRepairStatus(refreshed?.status || '');
      if (beforeStatus === 'received' && afterStatus === 'diagnosing') {
        toast.success(hadAssignee ? 'تم تغيير الإسناد لك — الحالة صارت جاري الفحص.' : 'تم إسناد الطلب لك — الحالة صارت جاري الفحص.');
      } else {
        toast.success(hadAssignee ? 'تم تغيير الإسناد لك.' : 'تم إسناد الطلب لك.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب.');
    } finally {
      setAssignBusy(false);
    }
  };

  const assignToBranchTechnician = async () => {
    if (!canManageTechnicianAssignment) {
      toast.error('ليس لديك صلاحية تغيير إسناد الفني.');
      return;
    }
    const selectedId = String(selectedTechnicianId || '').trim();
    const branchTechnicianIds = (branch?.technicianIds || []).map((id) => String(id || '').trim());
    if (!selectedId) {
      toast.error('اختر فنيًا أولًا.');
      return;
    }
    if (!branchTechnicianIds.includes(selectedId)) {
      toast.error('الفني المختار غير مربوط بهذا الفرع.');
      return;
    }
    const { assignId, hasLinkedUser } = resolveTechnicianIdForJobAssignment({
      selectedBranchTechnicianId: selectedId,
      branchTechnicians,
    });
    if (!hasLinkedUser) {
      toast.error(
        'هذا الموظف غير مربوط بحساب مستخدم. اربط الموظف بالمستخدم من إدارة المستخدمين ثم أعد الإسناد، وإلا لن يظهر الطلب في «طلباتي».',
      );
      return;
    }
    const currentId = String(job?.technicianId || '').trim();
    if (currentId && (currentId === assignId || currentId === selectedId)) {
      toast.error('هذا الفني مسند بالفعل على الطلب.');
      return;
    }
    setAssignBusy(true);
    try {
      const beforeStatus = mapLegacyRepairStatus(job?.status || '');
      await repairJobService.assignTechnician(jobId, assignId, assignActor());
      const refreshed = await repairJobService.getById(jobId);
      if (refreshed) setJob(refreshed);
      const afterStatus = mapLegacyRepairStatus(refreshed?.status || '');
      if (!currentId && beforeStatus === 'received' && afterStatus === 'diagnosing') {
        toast.success('تم إسناد الطلب للفني — الحالة صارت جاري الفحص.');
      } else {
        toast.success(currentId ? 'تم تغيير الفني المسند.' : 'تم إسناد الطلب للفني المختار.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إسناد الطلب للفني.');
    } finally {
      setAssignBusy(false);
    }
  };

  const clearTechnicianAssignment = async () => {
    if (!canManageTechnicianAssignment) {
      toast.error('ليس لديك صلاحية فك إسناد الفني.');
      return;
    }
    if (!String(job?.technicianId || '').trim()) {
      toast.error('الطلب غير مسند أصلًا.');
      return;
    }
    const ok = window.confirm(
      'فك إسناد الفني عن هذا الطلب؟\n'
      + 'لو الحالة «جاري الفحص» ومافيش تشخيص متسجل، هترجع «وارد».\n'
      + 'بعدها تقدر تسند فني تاني من هنا أو يمسح QR.',
    );
    if (!ok) return;
    setAssignBusy(true);
    try {
      await repairJobService.assignTechnician(jobId, '', assignActor());
      const refreshed = await repairJobService.getById(jobId);
      if (refreshed) setJob(refreshed);
      const backToReceived = refreshed && mapLegacyRepairStatus(refreshed.status || '') === 'received';
      toast.success(
        backToReceived
          ? 'تم فك الإسناد — الحالة رجعت وارد.'
          : 'تم فك إسناد الفني.',
      );
    } catch (e: any) {
      toast.error(e?.message || 'تعذر فك الإسناد.');
    } finally {
      setAssignBusy(false);
    }
  };

  const addPartUsage = async () => {
    if (!canEditThisJob || !canManageWorkshopWork) {
      toast.error('صرف القطع يتم من صفحة الورشة فقط.');
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
        const result = await repairJobSparePartRequestService.request({
          jobId,
          materialId,
          quantity: qty,
        });
        if (result.path === 'center') {
          toast.success(
            result.approvalMode === 'direct'
              ? `تم صرف القطعة على المخازن (${result.referenceNo}).`
              : `تم إنشاء سند ${result.referenceNo} بانتظار الاعتماد من شاشة سندات صرف قطع الغيار.`,
          );
        } else {
          toast.success(
            result.availability === 'none'
              ? `سُجّلت القطعة بانتظار التوريد (ناقصة) — ${result.replenishmentReferenceNo}.`
              : `سُجّلت القطعة بانتظار التوريد — ${result.replenishmentReferenceNo}.`,
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
        unitCost: repairSparePartSalePrice(part),
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

  const issuePendingUsage = async (usageId: string) => {
    if (!jobId || !canEditThisJob || !canManageWorkshopWork) {
      toast.error('صرف القطع يتم من صفحة الورشة فقط.');
      return;
    }
    setIssuingUsageId(usageId);
    try {
      const result = await repairJobSparePartRequestService.issuePending({ jobId, usageId });
      toast.success(`تم صرف القطعة (${result.referenceNo}).`);
      setJob(await repairJobService.getById(jobId));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر صرف القطعة.');
    } finally {
      setIssuingUsageId(null);
    }
  };

  const removePartUsage = async (idx: number) => {
    if (!canEditThisJob || !canManageWorkshopWork) {
      toast.error('تعديل القطع يتم من صفحة الورشة فقط.');
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
    if (!canManageWorkshopWork) {
      toast.error('الخدمات والتشخيص النهائي تُحدَّث من صفحة الورشة.');
      return;
    }
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
      const productsToSave = canManageWorkshopWork
        ? jobProducts
        : jobProducts.map((row) => {
            const existing = (job?.jobProducts || []).find((p) => String(p.itemId) === String(row.itemId));
            return {
              ...row,
              serviceIds: Array.isArray(existing?.serviceIds) ? existing!.serviceIds : [],
              estimatedCost: Number(existing?.estimatedCost || 0),
              finalCost: Number(existing?.finalCost || 0),
            };
          });
      await persistProducts(
        productsToSave,
        canManageWorkshopWork ? serviceOnly : Boolean(job?.isServiceOnly),
      );
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
  const exportDeliveryAuthorization = async () => {
    if (!deliveryAuthorizationPrintRef.current || !job || !isDeliveredStatus(job.status)) {
      toast.error('إذن التسليم متاح بعد إتمام التسليم فقط.');
      return;
    }
    setExportingDeliveryPdf(true);
    try {
      await exportToPDF(
        deliveryAuthorizationPrintRef.current,
        `delivery-authorization-${job.deliveryAuthorizationNo || job.receiptNo}`,
      );
      toast.success('تم تنزيل إذن التسليم PDF.');
    } catch {
      toast.error('تعذر تصدير إذن التسليم.');
    } finally {
      setExportingDeliveryPdf(false);
    }
  };
  const reloadPaymentDocs = async (id: string) => {
    try {
      const row = await repairPaymentService.getFinancial(id);
      setFinancial(row);
      setPaymentAuthorization(row?.currentAuthorizationId
        ? await repairPaymentService.getAuthorization(row.currentAuthorizationId)
        : null);
    } catch {
      // Keep previous UI if the actor can prepare but cannot read finance docs.
    }
  };

  const refreshJobAndPayment = async (id: string) => {
    const [nextJob] = await Promise.all([
      repairJobService.getById(id),
      reloadPaymentDocs(id),
    ]);
    if (nextJob) {
      setJob(nextJob);
      setStatus(nextJob.status);
      setWarranty(nextJob.warranty || repairSettings.defaults.defaultWarranty || 'none');
    }
    return nextJob;
  };

  const preparePaymentAuthorizationFromJob = async () => {
    if (!job?.id) return;
    if (!(can('repair.payments.collect') || can('repair.discounts.request'))) {
      toast.error('ليس لديك صلاحية تجهيز إذن الدفع.');
      return;
    }
    if (
      !isStatusRole(job.status, 'ready_delivery', repairSettings.workflow.statuses)
      && job.status !== 'ready'
    ) {
      toast.error('تجهيز إذن الدفع متاح بعد وصول الطلب لحالة جاهز للتسليم.');
      return;
    }
    setPreparingPaymentAuth(true);
    try {
      await repairPaymentService.prepare({
        jobId: job.id,
        discountType: 'none',
        discountValue: 0,
      });
      await refreshJobAndPayment(job.id);
      toast.success(
        isManufacturerWarrantyJob(job)
          ? 'تم تجهيز إقفال الضمان — جاهز للتسليم بدون تحصيل.'
          : 'تم تجهيز إذن الدفع وأصبح جاهزًا للتحصيل.',
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تجهيز إذن الدفع.');
    } finally {
      setPreparingPaymentAuth(false);
    }
  };

  const openCollectDialog = (opts?: { deliverAfter?: boolean; receivable?: boolean }) => {
    if (!paymentAuthorization?.id) {
      toast.error('جهّز إذن الدفع أولًا.');
      return;
    }
    if (isWarrantySettlementAuth(paymentAuthorization)) {
      toast.error('إذن ضمان المصنّع لا يُحصَّل. استخدم التسليم مباشرة.');
      return;
    }
    if (!can('repair.payments.collect')) {
      toast.error('ليس لديك صلاحية تحصيل دفعة.');
      return;
    }
    const due = Number(paymentAuthorization.balanceDue || 0);
    setCollectAmount(String(due > 0 ? due : 0));
    setCollectMethod('cash');
    setCollectAndDeliver(Boolean(opts?.deliverAfter) && !opts?.receivable);
    setCollectReceivable(Boolean(opts?.receivable));
    setCollectDialogOpen(true);
  };

  const confirmReceptionDelivery = async (opts?: { autoPrint?: boolean; skipConfirm?: boolean }) => {
    if (!job?.id || !can('repair.jobs.reception')) {
      toast.error('التسليم متاح لموظف الاستقبال فقط.');
      return false;
    }
    if (!opts?.skipConfirm) {
      const warrantyClose = isManufacturerWarrantyJob(job) || isWarrantySettlementAuth(paymentAuthorization);
      const confirmed = window.confirm(
        warrantyClose
          ? `تأكيد تسليم ضمان مصنّع #${job.receiptNo}؟\nبدون تحصيل ولا قيد إيراد (تكلفة القطع عند الصرف فقط).`
          : `تأكيد تسليم الطلب #${job.receiptNo}؟\nالصافي: ${Number(financial?.netAmount || paymentAuthorization?.netAmount || 0).toLocaleString('ar-EG')} ج.م\nالمتبقي: ${Number(financial?.balanceDue || paymentAuthorization?.balanceDue || 0).toLocaleString('ar-EG')} ج.م`,
      );
      if (!confirmed) return false;
    }
    try {
      await repairPaymentService.deliver({ jobId: job.id, warranty });
      const custodyFailures: string[] = [];
      for (const item of jobProducts) {
        const total = Math.max(1, Number(item.receivedQuantity || item.quantity || 1));
        const unrepairable = Math.max(0, Number(item.unrepairableQuantity || 0));
        const handed = Math.max(0, Number(item.handedOverQuantity || 0));
        const quantity = Math.max(0, total - unrepairable - handed);
        if (!quantity) continue;
        try {
          await repairCustomerOperationsService.handover(job.id, item.itemId, quantity, 'custody');
        } catch {
          custodyFailures.push(item.productName || item.itemId);
        }
      }
      await refreshJobAndPayment(job.id);
      if (custodyFailures.length) {
        toast.error(`تم إقفال الطلب، لكن تعذر إخراج عهدة: ${custodyFailures.join('، ')}. أعد المحاولة من صفحة العهدة.`);
      }
      toast.success(
        isManufacturerWarrantyJob(job) || isWarrantySettlementAuth(paymentAuthorization)
          ? 'تم تسليم ضمان المصنّع وإثبات قيمة الإعفاء بدون تحصيل من العميل.'
          : 'تم تسليم المنتج وإقفال الطلب وإثبات القيد المحاسبي.',
      );
      if (opts?.autoPrint) queueDeliveryAuthorizationPrint();
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسليم المنتج.');
      return false;
    }
  };

  const submitCollectFromJob = async () => {
    if (!job?.id || !paymentAuthorization?.id) return;
    const amount = Number(collectAmount || 0);
    if (!(amount > 0)) {
      toast.error('أدخل مبلغًا صحيحًا.');
      return;
    }
    if (collectAndDeliver) {
      const ok = window.confirm(
        `تأكيد تحصيل ${amount.toLocaleString('ar-EG')} ج.م وتسليم الطلب #${job.receiptNo} ثم طباعة إذن التسليم؟`,
      );
      if (!ok) return;
    }
    setPaymentBusy(true);
    try {
      const requestId = globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}`;
      const payload = {
        authorizationId: paymentAuthorization.id,
        amount,
        method: collectMethod,
        requestId,
      };
      if (collectReceivable) {
        await repairPaymentService.collectReceivable(payload);
        toast.success('تم تحصيل الذمة وخصمها من ذمم العملاء.');
      } else {
        await repairPaymentService.collect(payload);
        toast.success('تم تسجيل الدفعة وترحيلها للخزينة والحسابات.');
      }
      setCollectDialogOpen(false);
      setCollectReceivable(false);
      const authId = paymentAuthorization.id;
      await refreshJobAndPayment(job.id);
      if (collectAndDeliver) {
        const refreshed = await repairPaymentService.getAuthorization(authId);
        const remaining = Number(refreshed?.balanceDue || 0);
        if (remaining > 0.001) {
          toast.error('ما زال هناك رصيد متبقٍ — أكمل التحصيل قبل التسليم.');
          return;
        }
        await confirmReceptionDelivery({ autoPrint: true, skipConfirm: true });
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الدفعة.');
    } finally {
      setPaymentBusy(false);
    }
  };
  const trackUrl = useMemo(() => {
    if (!job) return '';
    return buildRepairTrackPublicUrl({
      tenantSlug,
      receiptNo: job.receiptNo,
      customerPhone: job.customerPhone,
    });
  }, [job, tenantSlug]);
  const internalWorkUrl = useMemo(() => {
    if (!job?.id || typeof window === 'undefined') return '';
    return `${window.location.origin}${withTenantPath(tenantSlug, `/repair/jobs/${job.id}/claim`)}`;
  }, [job?.id, tenantSlug]);
  const waApproval = useMemo(() => {
    if (!job || !approvalUrl) return '';
    return formatRepairApprovalRequestMessage(job, approvalUrl);
  }, [job, approvalUrl]);
  const isAssignedToCurrentTechnician = useMemo(() => {
    const assigned = String(job?.technicianId || '').trim();
    return assigned.length > 0 && technicianIds.includes(assigned);
  }, [job?.technicianId, technicianIds]);
  const canEditThisJob = can('repair.jobs.edit') || (repairCtx.isRepairTechnician && isAssignedToCurrentTechnician);
  const actionState = useMemo(() => {
    if (!job) return null;
    return resolveRepairJobActionState({
      job,
      access: repairCtx,
      technicianIds,
      canEditByPermission: can('repair.jobs.edit'),
    });
  }, [job, repairCtx, technicianIds, can]);
  const canManageWorkshopWork = canManageRepairWorkshopWork({
    canEditJob: canEditThisJob,
    isRepairTechnician: repairCtx.isRepairTechnician,
    isAssignedTechnician: isAssignedToCurrentTechnician,
    canManageBranches: can('repair.branches.manage'),
    canViewAllCallCenter: can('repair.callCenter.viewAll'),
    canCreateJobs: can('repair.jobs.create'),
    canEditJobs: can('repair.jobs.edit'),
  });

  const openReplacementDialog = (item: RepairJobProduct) => {
    const available = Math.max(0, Number(item.unrepairableQuantity || 0));
    if (!available) {
      toast.error('سجل كمية غير قابلة للإصلاح أولًا.');
      return;
    }
    setOpsDialog({ mode: 'replacement', item });
    setOpsQty(Math.min(1, available));
    setOpsReason('');
    setOpsReasonCode('');
  };

  const submitOpsDialog = async () => {
    if (!job?.id || !opsDialog) return;
    const item = opsDialog.item;
    const total = Math.max(1, Number(item.receivedQuantity || item.quantity || 1));
    const availableUnrepairable = Math.max(0, Number(item.unrepairableQuantity || 0));

    if (opsDialog.mode === 'unrepairable') {
      const quantity = Math.max(0, Math.min(total, Math.round(Number(opsQty) || 0)));
      if (quantity > 0 && !opsReasonCode) {
        toast.error('اختر سبب عدم قابلية الإصلاح.');
        return;
      }
      if (quantity > 0 && opsReasonCode === 'other' && !opsReason.trim()) {
        toast.error('اكتب تفاصيل السبب الآخر.');
        return;
      }
      setOpsBusy(true);
      try {
        await repairCustomerOperationsService.recordUnrepairable(
          job.id,
          item.itemId,
          quantity,
          opsReasonCode,
          opsReason.trim() || undefined,
        );
        toast.success('تم تحديث القرار ونقل الكمية مخزنيًا.');
        setOpsDialog(null);
        await refreshJobAndPayment(job.id);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'تعذر تسجيل غير القابل للإصلاح.');
      } finally {
        setOpsBusy(false);
      }
      return;
    }

    const quantity = Math.max(1, Math.min(availableUnrepairable, Math.round(Number(opsQty) || 1)));
    setOpsBusy(true);
    try {
      await repairCustomerOperationsService.createReplacement(job.id, item.itemId, quantity, opsReason.trim() || undefined);
      toast.success('تم إنشاء طلب الاستبدال وبانتظار اعتماد الإدارة.');
      setOpsDialog(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر إنشاء طلب الاستبدال.');
    } finally {
      setOpsBusy(false);
    }
  };
  const canRequestApprovalLink = Boolean(
    actionState?.canRequestApproval
    && can('repair.jobs.reception')
    && (
      isStatusRole(job?.status, 'estimate_review', repairSettings.workflow.statuses)
      || isStatusRole(job?.status, 'awaiting_customer', repairSettings.workflow.statuses)
      || job?.status === 'estimate_ready'
      || job?.status === 'waiting_approval'
    ),
  );
  const canPreparePaymentAuth = can('repair.payments.collect') || can('repair.discounts.request');
  const paymentClose = useMemo(
    () => resolveRepairJobPaymentCloseState({
      jobStatus: job?.status || '',
      authorization: paymentAuthorization,
      canPrepare: canPreparePaymentAuth,
      canCollect: can('repair.payments.collect'),
      allowPartialCollection: repairSettings.payments.allowPartialCollection !== false,
      canDeliver: can('repair.jobs.reception'),
      isManufacturerWarrantyJob: job ? isManufacturerWarrantyJob(job) : false,
      workflowStatuses: repairSettings.workflow.statuses,
    }),
    [job, paymentAuthorization, canPreparePaymentAuth, can, repairSettings.payments.allowPartialCollection, repairSettings.workflow.statuses],
  );

  const generateApprovalLink = async () => {
    if (!job?.id || !canRequestApprovalLink) {
      toast.error('لا تملك صلاحية إنشاء رابط موافقة لهذا الطلب.');
      return;
    }
    setCreatingApprovalLink(true);
    try {
      if (!financial?.currentAuthorizationId) {
        await repairPaymentService.prepare({
          jobId: job.id,
          discountType: 'none',
          discountValue: 0,
          reason: 'تقدير فني لموافقة العميل',
        });
      }
      const r = await repairPaymentService.requestCustomerApproval(job.id);
      if (!r?.token) {
        toast.error('تعذر إنشاء رابط الموافقة.');
        return;
      }
      const url = buildRepairApprovalPublicUrl({
        tenantSlug,
        jobId: job.id,
        token: r.token,
      });
      if (!url) {
        toast.error('تعذر بناء رابط الموافقة. تحقق من إعدادات الرابط العام.');
        return;
      }
      setApprovalUrl(url);
      const [nextJob, nextFinancial] = await Promise.all([
        repairJobService.getById(job.id),
        repairPaymentService.getFinancial(job.id),
      ]);
      if (nextJob) setJob(nextJob);
      if (nextFinancial) {
        setFinancial(nextFinancial);
        if (nextFinancial.currentAuthorizationId) {
          setPaymentAuthorization(await repairPaymentService.getAuthorization(nextFinancial.currentAuthorizationId));
        }
      }
      toast.success('تم إنشاء رابط موافقة جديد.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر إنشاء الرابط.');
    } finally {
      setCreatingApprovalLink(false);
    }
  };

  const canAssignTechnician =
    can('repair.jobs.edit')
    || can('repair.jobs.reception');
  const canManageTechnicianAssignment = Boolean(
    job
    && canAssignTechnician
    && !isDeliveredStatus(job.status)
    && !Boolean(job.isClosed),
  );
  const assignedTechnicianId = String(job?.technicianId || '').trim();
  const assignedTechnicianLabel = assignedTechnicianId
    ? (technicianNameById[assignedTechnicianId] || `فني (${assignedTechnicianId.slice(0, 8)}…)`)
    : 'غير مسند';
  const selectedAssignMatchesCurrent = Boolean(
    assignedTechnicianId
    && selectedTechnicianId
    && (
      assignedTechnicianId === selectedTechnicianId
      || branchTechnicians.some(
        (tech) => tech.id === selectedTechnicianId
          && (tech.id === assignedTechnicianId || String(tech.userId || '').trim() === assignedTechnicianId),
      )
    ),
  );
  const isFixedTechnicianAssignment = isSingleBranchTechnician(branch?.technicianIds)
    || branchTechnicians.length === 1;
  const canAssignToMyselfAsTechnician = isActorBranchTechnician({
    actorUserId: userProfile?.id,
    actorEmployeeId: currentEmployee?.id,
    branchTechnicians,
  });

  useEffect(() => {
    if (!job?.id || !canManageTechnicianAssignment || branchTechnicians.length === 0) return;
    const assignedId = String(job.technicianId || '').trim();
    if (!assignedId) return;
    const match = branchTechnicians.find(
      (tech) => tech.id === assignedId || String(tech.userId || '').trim() === assignedId,
    );
    const linkedUserId = String(match?.userId || '').trim();
    // Legacy rows stored employee id — rewrite to Auth uid once so «طلباتي» finds the job.
    if (!linkedUserId || linkedUserId === assignedId) return;
    let cancelled = false;
    void repairJobService
      .assignTechnician(job.id, linkedUserId, {
        uid: userProfile?.id || '',
        name: userProfile?.displayName || userProfile?.email || 'مستخدم',
      })
      .then(async () => {
        if (cancelled) return;
        const refreshed = await repairJobService.getById(String(job.id));
        if (!cancelled && refreshed) setJob(refreshed);
      })
      .catch(() => {
        // Best-effort heal; assignment UI still works manually.
      });
    return () => {
      cancelled = true;
    };
  }, [branchTechnicians, canManageTechnicianAssignment, job?.id, job?.technicianId, userProfile?.displayName, userProfile?.email, userProfile?.id]);

  const canViewThisJob = !repairCtx.jobsTechnicianOnly;
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

  const canOpenWorkshop = Boolean(
    job
    && !isDeliveredStatus(job.status)
    && (
      can('repair.adminDashboard.view')
      || can('repair.branches.manage')
      || canManageWorkshopWork
    ),
  );

  const headerPrimaryAction = useMemo(() => {
    if (!job || !canOpenWorkshop) return undefined;
    // إقفال الدفع/التسليم يبقى في لوحة الإقفال فقط — الهيدر للورشة
    return {
      label: 'فتح الورشة',
      icon: 'handyman',
      onClick: () => navigate(withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)),
    };
  }, [job, canOpenWorkshop, navigate, tenantSlug]);

  const headerMoreActions = useMemo(() => {
    if (!job) return [];
    const items: Array<{
      label: string;
      icon?: string;
      onClick: () => void;
      disabled?: boolean;
      group?: string;
      danger?: boolean;
    }> = [];

    items.push({
      label: exportingPdf ? 'جاري التصدير…' : 'تنزيل PDF',
      icon: 'picture_as_pdf',
      group: 'طباعة وتصدير',
      disabled: exportingPdf,
      onClick: () => { void exportReceipt(); },
    });

    if (can('repair.complaints.manage')) {
      items.push({
        label: 'إنشاء شكوى',
        icon: 'report',
        group: 'عمليات',
        onClick: () => {
          navigate(withTenantPath(tenantSlug, '/repair/complaints'), {
            state: {
              openCreate: true,
              complaintPrefill: {
                customerId: job.customerId,
                customerName: job.customerName,
                customerPhone: job.customerPhone,
                jobId: job.id,
                receiptNo: job.receiptNo,
                branchId: job.branchId,
              },
            },
          });
        },
      });
    }

    if (isDeliveredStatus(job.status) && canEditThisJob) {
      items.push({
        label: showReopenOptions ? 'إخفاء إعادة الإصلاح' : 'إعادة إصلاح',
        icon: 'restart_alt',
        group: 'عمليات',
        onClick: () => setShowReopenOptions((v) => !v),
      });
    }

    if (canDeleteJob) {
      items.push({
        label: 'حذف الطلب',
        icon: 'delete',
        group: 'عمليات',
        danger: true,
        onClick: () => { void deleteJob(); },
      });
    }

    return items;
  }, [
    job,
    exportingPdf,
    can,
    navigate,
    tenantSlug,
    canEditThisJob,
    showReopenOptions,
    canDeleteJob,
  ]);

  if (!job) {
    return (
      <RepairOpsPageShell className="w-full min-w-0 erp-ds-clean" dir={dir} eyebrow="تفاصيل طلب الصيانة" actions={shellBackAction}>
        <OpsDashPanel title="جاري تحميل الطلب" accent="repair">
          <p className="text-sm text-muted-foreground">جاري تحميل الطلب…</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }
  if (!canViewThisJob) {
    return (
      <RepairOpsPageShell className="w-full min-w-0 erp-ds-clean" dir={dir} eyebrow="تفاصيل طلب الصيانة" actions={shellBackAction}>
        <OpsDashPanel title="غير مسموح" accent="repair">
          <p className="text-sm text-[rgb(var(--color-warning))]">
            هذا الطلب غير مسند لك، ولا تملك صلاحية عرضه.
          </p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  /** ضمان الورشة بعد الإصلاح (مدة) — غير ضمان الجهاز عند الاستلام (inWarranty على المنتج). */
  const workshopWarrantyLabel =
    job.warranty === '3months' ? '3 شهور' : job.warranty === '6months' ? '6 شهور' : 'بدون';
  const accessoriesSummary =
    jobProducts.map((item) => String(item.accessories || '').trim()).filter(Boolean).join(' | ')
    || job.accessories
    || '—';
  const financialJob: RepairJob = financial
    ? {
        ...job,
        finalCost: financial.netAmount,
        paidAmount: financial.paidAmount,
        balanceDue: financial.balanceDue,
        paymentStatus: financial.paymentStatus,
      }
    : job;

  const jobSubtitle = isDeliveredStatus(job.status)
    ? 'الطلب مقفل بعد التسليم — اطبع إذن التسليم من صندوق الإقفال أو أعد فتح الإصلاح من المزيد.'
    : 'استقبال: منتجات · موافقة عميل · طباعة. غيّر الفني أو فك الإسناد من الملخص — أو امسح QR.';

  const repairJobShellActions = (
    <div className="flex flex-wrap items-center gap-2">
      {shellBackAction}
      <StatusBadge status={job.status} size="md" />
      <Button
        type="button"
        iconName="print"
        tone="print"
        solid
        className="font-bold shadow-sm"
        title="طباعة إيصال بنسختين (مركز + عميل) والكارت الداخلي على A5"
        onClick={() => handlePrintIntakeBundle()}
      >
        <span className="hidden sm:inline">طباعة A5 — نسختين + كارت</span>
        <span className="sm:hidden">طباعة A5</span>
      </Button>
      {headerPrimaryAction ? (
        <Button type="button" iconName={headerPrimaryAction.icon} onClick={headerPrimaryAction.onClick}>
          {headerPrimaryAction.label}
        </Button>
      ) : null}
      <OpsMoreActionsMenu items={headerMoreActions} />
    </div>
  );

  return (
    <RepairOpsPageShell
      className="w-full min-w-0 erp-ds-clean"
      dir={dir}
      eyebrow={`طلب صيانة #${job.receiptNo}`}
      rangeLabel={jobSubtitle}
      actions={repairJobShellActions}
    >
      <DetailPageStickyHeader>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'الفرع', value: branch?.name || '—' },
            { label: 'العميل', value: job.customerName || masterCustomer?.name || '—' },
            { label: 'الهاتف', value: job.customerPhone || '—', ltr: true },
            { label: 'الفني', value: assignedTechnicianLabel },
            {
              label: 'صافي المطلوب',
              value: financial
                ? `${Number(financial.netAmount || 0).toLocaleString('ar-EG')} ج.م`
                : 'لم يُجهز',
            },
          ].map((tile) => (
            <div key={tile.label} className={cn(NESTED_TILE, 'px-3 py-2.5')}>
              <div className="text-[11px] text-muted-foreground">{tile.label}</div>
              <div
                className="mt-0.5 truncate text-sm font-semibold text-foreground"
                dir={tile.ltr ? 'ltr' : undefined}
                title={tile.value}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {paymentClose.showPanel ? (
          <section
            className={
              paymentClose.step === 'print'
                ? 'rounded-xl border border-[rgb(var(--color-success)/0.25)]/90 bg-gradient-to-l from-[rgb(var(--color-success))] via-white to-white p-4 shadow-sm ring-1 ring-[rgb(var(--color-success)/0.1)]'
                : paymentClose.step === 'blocked'
                  ? 'rounded-xl border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/60 p-4 shadow-sm'
                  : 'rounded-xl border border-[rgb(var(--color-primary)/0.25)] bg-gradient-to-l from-[rgb(var(--color-primary))] via-white to-white p-4 shadow-sm ring-1 ring-[rgb(var(--color-primary)/0.1)]'
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {paymentClose.step === 'print' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[rgb(var(--color-success))]" aria-hidden />
                  ) : null}
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {paymentClose.step === 'print'
                      ? (paymentClose.isWarrantySettlement ? 'تسليم ضمان جاهز' : 'إذن التسليم جاهز')
                      : paymentClose.step === 'collect'
                        ? 'التحصيل والتسليم'
                        : paymentClose.step === 'deliver'
                          ? (paymentClose.isWarrantySettlement ? 'تسليم ضمان مصنّع' : 'جاهز للتسليم')
                          : paymentClose.step === 'prepare'
                            ? (paymentClose.isWarrantySettlement ? 'تجهيز إقفال الضمان' : 'تجهيز إذن الدفع')
                            : 'إقفال الدفع والتسليم'}
                  </h2>
                  {paymentClose.step !== 'print' ? (
                    <span
                      className={
                        paymentClose.step === 'blocked'
                          ? 'inline-flex items-center rounded-md border border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.1)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-danger))]'
                          : paymentClose.step === 'collect' || paymentClose.step === 'deliver'
                            ? 'inline-flex items-center rounded-md border border-[rgb(var(--color-success)/0.35)]/70 bg-[rgb(var(--color-success)/0.1)]/80 px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-success))]'
                            : 'inline-flex items-center rounded-md border border-[rgb(var(--color-primary)/0.35)]/70 bg-[rgb(var(--color-primary)/0.1)]/80 px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-primary))]'
                      }
                    >
                      {paymentClose.step === 'blocked' ? 'موقوف' : paymentClose.stepLabel}
                    </span>
                  ) : (
                    <span className={
                      paymentClose.canCollectReceivableAction
                        ? 'inline-flex items-center rounded-md border border-[rgb(var(--color-warning)/0.35)]/80 bg-[rgb(var(--color-warning)/0.1)]/90 px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-warning))]'
                        : 'inline-flex items-center rounded-md border border-[rgb(var(--color-success)/0.35)]/80 bg-[rgb(var(--color-success)/0.1)]/90 px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-success))]'
                    }>
                      {paymentClose.isWarrantySettlement
                        ? 'ضمان — بدون تحصيل'
                        : (paymentClose.balanceDue <= 0 ? 'مسدد بالكامل' : 'مُسلَّم برصيد')}
                    </span>
                  )}
                </div>
                {paymentClose.step === 'print' ? (
                  <p className="text-sm text-[rgb(var(--color-success))]">
                    رقم الإذن{' '}
                    <span className="font-mono font-semibold tracking-wide" dir="ltr">
                      {job.deliveryAuthorizationNo || `DEL-${job.receiptNo}`}
                    </span>
                    {paymentClose.canCollectReceivableAction ? (
                      <span className="mt-1 block text-[rgb(var(--color-warning))]">
                        ذمة مفتوحة {paymentClose.balanceDue.toLocaleString('ar-EG')} ج.م — يمكن التحصيل الآن.
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {paymentClose.step === 'blocked'
                      ? paymentClose.stepLabel
                      : paymentClose.isWarrantySettlement
                        ? 'تجهيز إقفال الضمان ← التسليم ← طباعة (بدون تحصيل أو إيراد)'
                        : 'تجهيز الإذن ← التحصيل ← التسليم ← طباعة إذن التسليم'}
                  </p>
                )}
              </div>
              {paymentClose.canPrintAction || paymentClose.canCollectReceivableAction ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {paymentClose.canCollectReceivableAction ? (
                    <Button
                      type="button"
                      disabled={paymentBusy}
                      onClick={() => openCollectDialog({ receivable: true })}
                    >
                      تحصيل ذمة
                    </Button>
                  ) : null}
                  {paymentClose.canPrintAction ? (
                    <>
                      <Button type="button" variant={paymentClose.canCollectReceivableAction ? 'outline' : 'default'} onClick={() => handlePrintDeliveryAuthorization()}>
                        طباعة إذن التسليم
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={exportingDeliveryPdf}
                        onClick={() => void exportDeliveryAuthorization()}
                      >
                        {exportingDeliveryPdf ? 'جاري التصدير…' : 'تصدير PDF'}
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { key: 'net', label: 'الصافي', value: paymentClose.netAmount },
                { key: 'paid', label: 'المدفوع', value: paymentClose.paidAmount },
                { key: 'due', label: 'المتبقي', value: paymentClose.balanceDue },
              ].map((row) => {
                const settledDue = row.key === 'due' && row.value <= 0 && paymentClose.step === 'print';
                return (
                  <div
                    key={row.key}
                    className={
                      settledDue
                        ? 'rounded-lg border border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)]/80 px-3 py-2.5'
                        : 'rounded-lg border border-border/70 bg-background/95 px-3 py-2.5'
                    }
                  >
                    <div className="text-[11px] text-muted-foreground">{row.label}</div>
                    <div
                      className={
                        settledDue
                          ? 'mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[rgb(var(--color-success))]'
                          : 'mt-0.5 text-base font-semibold tabular-nums tracking-tight'
                      }
                    >
                      {row.value.toLocaleString('ar-EG')}
                      <span className="ms-1 text-xs font-medium text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {!paymentClose.canPrintAction ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {paymentClose.canPrepareAction ? (
                  <Button
                    type="button"
                    disabled={preparingPaymentAuth || paymentBusy}
                    onClick={() => void preparePaymentAuthorizationFromJob()}
                  >
                    {preparingPaymentAuth
                      ? 'جاري التجهيز…'
                      : (paymentClose.isWarrantySettlement ? 'تجهيز إقفال الضمان' : 'تجهيز إذن الدفع')}
                  </Button>
                ) : null}
                {paymentClose.canCollectAndDeliverAction ? (
                  <Button
                    type="button"
                    disabled={paymentBusy}
                    onClick={() => openCollectDialog({ deliverAfter: true })}
                  >
                    تحصيل كامل وتسليم
                  </Button>
                ) : null}
                {paymentClose.canCollectAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={paymentBusy}
                    onClick={() => openCollectDialog({ deliverAfter: false })}
                  >
                    تحصيل جزئي / مبلغ مخصص
                  </Button>
                ) : null}
                {paymentClose.canDeliverOnlyAction ? (
                  <Button
                    type="button"
                    disabled={paymentBusy}
                    onClick={() => void confirmReceptionDelivery({ autoPrint: true })}
                  >
                    {paymentClose.isWarrantySettlement
                      ? 'تسليم ضمان وطباعة الإذن'
                      : 'تأكيد التسليم وطباعة الإذن'}
                  </Button>
                ) : null}
                {paymentClose.step === 'blocked' ? (
                  <Button type="button" variant="outline" asChild>
                    <Link to={withTenantPath(tenantSlug, '/repair/payments')}>
                      فتح شاشة التحصيل
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </DetailPageStickyHeader>

      {isDeliveredStatus(job.status) && showReopenOptions ? (
        <OpsDashPanel title="إعادة إصلاح" accent="repair">
          <p className="mb-3 text-sm text-muted-foreground">إنشاء طلب جديد مرتبط بالطلب الحالي.</p>
          <div className="space-y-3">
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
                    <label key={itemId || idx} className="inline-flex w-full items-center gap-2 text-sm">
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
          </div>
        </OpsDashPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Main first for mobile readability */}
        <div className="order-1 space-y-4 lg:col-span-2">
          <OpsDashPanel
            title="المنتجات المستلمة"
            accent="repair"
            action={(
              <span className="text-xs text-muted-foreground">
                ضمان الطلب: {manufacturerWarrantyScopeLabel(job.warrantyScope, jobProducts)}
              </span>
            )}
          >
            <p className="mb-3 text-sm text-muted-foreground">
              عرض الاستلام — التشخيص والخدمات من الورشة.
            </p>
            <div className="space-y-3">
              {jobProducts.map((item, idx) => {
                const serviceNames = (item.serviceIds || [])
                  .map((id) => enabledServices.find((service) => service.id === id)?.name || id)
                  .filter(Boolean);
                return (
                  <div key={item.itemId} className={cn(NESTED_TILE, 'space-y-2 p-3 text-sm')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 font-semibold text-foreground">
                        <span className="text-muted-foreground font-medium">#{idx + 1}</span>{' '}
                        {item.productName || '—'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="tabular-nums">×{item.quantity || 1}</Badge>
                        <Badge
                          variant="outline"
                          className={item.inWarranty
                            ? 'border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]'}
                        >
                          {manufacturerWarrantyLineLabel(item.inWarranty)}
                        </Badge>
                        {Number(item.unrepairableQuantity || 0) > 0 ? (
                          <Badge variant="outline" className="border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]">
                            غير قابل {item.unrepairableQuantity}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-1 text-[13px] sm:grid-cols-2">
                      <div><span className="text-muted-foreground">سيريال:</span> {item.serialNo || '—'}</div>
                      <div><span className="text-muted-foreground">إكسسوارات:</span> {item.accessories || '—'}</div>
                      <div className="sm:col-span-2"><span className="text-muted-foreground">عطل العميل:</span> {item.diagnosis || '—'}</div>
                      <div className="sm:col-span-2"><span className="text-muted-foreground">تشخيص الفني:</span> {item.technicianDiagnosis || 'لم يُسجَّل بعد'}</div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">خدمات:</span>{' '}
                        {serviceNames.length > 0 ? serviceNames.join('، ') : 'لم تُحدد بعد'}
                      </div>
                    </div>
                    {(can('repair.replacements.create') || can('repair.jobs.reception'))
                      && Number(item.unrepairableQuantity || 0) > 0 ? (
                      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openReplacementDialog(item)}>
                          طلب استبدال
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {job.isServiceOnly ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  وضع «خدمة فقط» — التكلفة من خدمات الكتالوج.
                </p>
              ) : null}
            </div>
          </OpsDashPanel>

          <OpsDashPanel title="سجل الحالة" accent="repair">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                <span className="text-sm text-muted-foreground">الحالة الحالية</span>
                <StatusBadge status={job.status} />
              </div>
              {Array.isArray(job.statusHistory) && job.statusHistory.length > 0 ? (
                <div className="space-y-2">
                  {[...job.statusHistory].reverse().map((entry, idx) => (
                    <div key={`${entry.at}-${idx}`} className="rounded border px-2 py-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge status={entry.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {new Date(entry.at).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      {entry.reason ? (
                        <div className="mt-1 text-xs text-muted-foreground">السبب: {entry.reason}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا يوجد سجل حالات بعد.</p>
              )}
            </div>
          </OpsDashPanel>
        </div>

        <aside className="order-2 space-y-4 lg:col-span-1 lg:sticky lg:top-[4.5rem]">
          {canManageTechnicianAssignment || assignedTechnicianId ? (
            <OpsDashPanel title="إسناد الفني" accent="repair">
              <p className="mb-3 text-sm text-muted-foreground">
                {canManageTechnicianAssignment
                  ? (canAssignToMyselfAsTechnician
                    ? 'غيّر الفني لو مش موجود النهاردة، أو فك الإسناد عشان فني تاني يمسحه من الكارت.'
                    : 'اختر فنيًا من قائمة الفرع ثم احفظ الإسناد. «إسناد لي» للفني المربوط بالفرع فقط.')
                  : 'الفني الحالي على الطلب.'}
              </p>
              <div className="mb-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <div className="text-[11px] text-muted-foreground">المسند حاليًا</div>
                <div className="mt-0.5 font-semibold">{assignedTechnicianLabel}</div>
              </div>
              {canManageTechnicianAssignment ? (
                <div className="space-y-2">
                  {branchTechnicians.length > 0 ? (
                    <>
                      <div className="space-y-1">
                        <Label>فني الفرع</Label>
                        <Select
                          value={selectedTechnicianId || undefined}
                          onValueChange={setSelectedTechnicianId}
                          disabled={assignBusy || isFixedTechnicianAssignment}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر فنيًا" />
                          </SelectTrigger>
                          <SelectContent>
                            {branchTechnicians.map((tech) => (
                              <SelectItem key={tech.id} value={tech.id}>
                                {tech.name}
                                {!tech.userId ? ' (غير مربوط بحساب)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={assignBusy || !selectedTechnicianId || selectedAssignMatchesCurrent}
                        onClick={() => void assignToBranchTechnician()}
                      >
                        {assignBusy
                          ? 'جاري الحفظ…'
                          : assignedTechnicianId
                            ? 'تغيير الفني'
                            : 'إسناد للفني المختار'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-[rgb(var(--color-warning))]">
                      لا يوجد فنيون مربوطون بهذا الفرع. أضفهم من شاشة الفروع أولًا.
                    </p>
                  )}
                  <div className={`grid grid-cols-1 gap-2 ${canAssignToMyselfAsTechnician ? 'sm:grid-cols-2' : ''}`}>
                    {canAssignToMyselfAsTechnician && userProfile?.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={assignBusy || assignedTechnicianId === userProfile.id}
                        onClick={() => void assignToMe()}
                      >
                        إسناد لي
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={assignBusy || !assignedTechnicianId}
                      onClick={() => void clearTechnicianAssignment()}
                    >
                      فك الإسناد
                    </Button>
                  </div>
                </div>
              ) : null}
            </OpsDashPanel>
          ) : null}

          {!isDeliveredStatus(job.status) ? (
            <OpsDashPanel title="موافقة العميل" accent="repair">
              <p className="mb-3 text-sm text-muted-foreground">
                أنشئ الرابط ثم أرسله واتساب بعد الجاهزية.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full"
                    disabled={!canRequestApprovalLink || creatingApprovalLink}
                    onClick={() => void generateApprovalLink()}
                  >
                    {creatingApprovalLink ? 'جاري الإنشاء…' : 'إنشاء رابط موافقة'}
                  </Button>
                  <WhatsAppShare
                    phone={job.customerPhone}
                    text={waApproval}
                    label="إرسال رابط الموافقة"
                    disabled={!approvalUrl}
                    className="min-h-11 w-full"
                    size="default"
                  />
                </div>
                {approvalUrl ? (
                  <Input
                    readOnly
                    className="min-h-10 font-mono text-xs"
                    value={approvalUrl}
                    onFocus={(e) => e.target.select()}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    زر واتساب يتفعّل بعد إنشاء الرابط.
                  </p>
                )}
              </div>
            </OpsDashPanel>
          ) : null}

          <OpsDashPanel
            title="ملخص الطلب"
            accent="repair"
          >
            <p className="mb-3 text-sm text-muted-foreground">
              {jobProducts.length} سطر · {productsQtyTotal} قطعة
              {' · '}
              {manufacturerWarrantyScopeLabel(job.warrantyScope, jobProducts)}
              {' · '}
              ضمان ورشة {workshopWarrantyLabel}
            </p>
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-1 gap-2">
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">التاريخ</dt>
                  <dd className="font-medium tabular-nums">{new Date(job.createdAt).toLocaleString('ar-EG')}</dd>
                </div>
                {masterCustomer ? (
                  <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                    <dt className="text-muted-foreground">كود العميل</dt>
                    <dd className="font-medium text-end">
                      <Link className="text-primary hover:underline" to={withTenantPath(tenantSlug, `/customers/${masterCustomer.id}`)}>
                        {masterCustomer.code}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {masterCustomer ? (
                  <div className="flex justify-between gap-2 border-b border-border/60 pb-1.5">
                    <dt className="text-muted-foreground">نوع العميل</dt>
                    <dd className="font-medium">{CUSTOMER_TYPE_LABELS[masterCustomer.type]}</dd>
                  </div>
                ) : null}
              </dl>

              {paymentAuthorization
                && Number(paymentAuthorization.grossAmount || 0) <= 0
                && Number(paymentAuthorization.warrantyGrossAmount || 0) <= 0
                && !isWarrantySettlementAuth(paymentAuthorization) ? (
                <div className="rounded-md border border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.1)] p-3 text-sm text-[rgb(var(--color-danger))]">
                  إذن الدفع قيمته صفر — اختر خدمة مسعّرة أو قطعة ثم جهّز إصدارًا جديدًا.
                </div>
              ) : null}
              {paymentAuthorization && isWarrantySettlementAuth(paymentAuthorization) ? (
                <div className="rounded-md border border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] p-3 text-sm text-[rgb(var(--color-primary))]">
                  داخل الضمان بالكامل — إعفاء كامل بدون تحصيل.
                </div>
              ) : null}
              {paymentAuthorization
                && !isWarrantySettlementAuth(paymentAuthorization)
                && (isPartialManufacturerWarrantyJob(job) || Number(paymentAuthorization.warrantyGrossAmount || 0) > 0) ? (
                <div className="rounded-md border border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] p-3 text-sm text-[rgb(var(--color-primary))]">
                  ضمان مختلط — يُحصَّل غير الضمان فقط، ومنتجات الضمان مجانية.
                  {Number(paymentAuthorization.warrantyGrossAmount || 0) > 0 ? (
                    <span className="mt-1 block tabular-nums text-xs">
                      قيمة الضمان (مجاني): {Number(paymentAuthorization.warrantyGrossAmount || 0).toLocaleString('ar-EG')} ج.م
                    </span>
                  ) : null}
                </div>
              ) : null}
              {hasInWarrantyProduct && !paymentAuthorization ? (
                <div className="rounded-md border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)]/70 p-2 text-xs text-[rgb(var(--color-primary))]">
                  {isFullManufacturerWarrantyJob(job)
                    ? 'كل المنتجات داخل الضمان: عند الجاهزية جهّز إقفال الضمان ثم سلّم بدون تحصيل.'
                    : 'طلب مختلط: عند الجاهزية جهّز إذن الدفع — يُحصَّل غير الضمان فقط.'}
                </div>
              ) : null}

              {!job.customerId && can('repair.jobs.edit') ? (
                <div className="space-y-2 rounded-md border border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] p-2">
                  <Badge variant="outline" className="border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]">
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

              <details className="rounded-md border bg-muted/10 open:bg-background">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">الجهاز والعطل</summary>
                <div className="space-y-1.5 border-t px-3 py-2 text-sm">
                  <div><span className="text-muted-foreground">الجهاز:</span> {job.deviceType || '—'} · {job.deviceBrand} {job.deviceModel}</div>
                  <div><span className="text-muted-foreground">اللون:</span> {job.deviceColor || '—'}</div>
                  <div><span className="text-muted-foreground">الإكسسوارات:</span> {accessoriesSummary}</div>
                  <div><span className="text-muted-foreground">العنوان:</span> {job.customerAddress || '—'}</div>
                  <div><span className="text-muted-foreground">وصف العطل:</span> {job.problemDescription || '—'}</div>
                </div>
              </details>

              {trackUrl ? (
                <div className="flex items-center gap-3 rounded-md border p-2">
                  <div className="rounded border bg-[var(--color-card)] p-1">
                    <QRCodeSVG value={trackUrl} size={72} includeMargin />
                  </div>
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    امسح الرمز لمتابعة الطلب من صفحة التتبع العامة.
                  </div>
                </div>
              ) : null}
            </div>
          </OpsDashPanel>
        </aside>
      </div>

      <Dialog
        open={collectDialogOpen}
        onOpenChange={(open) => {
          if (!open && !paymentBusy) {
            setCollectDialogOpen(false);
            setCollectAndDeliver(false);
            setCollectReceivable(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {collectReceivable
                ? 'تحصيل ذمة بعد التسليم'
                : collectAndDeliver
                  ? 'تحصيل كامل وتسليم'
                  : 'تسجيل دفعة'}
            </DialogTitle>
            <DialogDescription>
              الرصيد الحالي {Number(paymentAuthorization?.balanceDue || 0).toLocaleString('ar-EG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ج.م.
              {collectReceivable
                ? ' يُخصم من ذمم العملاء ويُرحَّل للخزينة.'
                : ` ستُرحل الدفعة للخزينة والقيد المحاسبي${collectAndDeliver ? ' ثم يُسلَّم الطلب ويُطبع إذن التسليم.' : '.'}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={collectAmount}
                disabled={paymentBusy || collectAndDeliver}
                onChange={(e) => setCollectAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>وسيلة الدفع</Label>
              <Select
                value={collectMethod}
                onValueChange={(value) => setCollectMethod(value as RepairPaymentMethod)}
                disabled={paymentBusy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={paymentBusy}
              onClick={() => {
                setCollectDialogOpen(false);
                setCollectAndDeliver(false);
                setCollectReceivable(false);
              }}
            >
              إلغاء
            </Button>
            <Button type="button" disabled={paymentBusy} onClick={() => void submitCollectFromJob()}>
              <CheckCircle2 className="ms-1 h-4 w-4" />
              {paymentBusy
                ? 'جاري التنفيذ…'
                : collectReceivable
                  ? 'تأكيد تحصيل الذمة'
                  : collectAndDeliver
                    ? 'تأكيد التحصيل والتسليم'
                    : 'تأكيد التحصيل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={intakePrintOpen} onOpenChange={setIntakePrintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>طباعة بعد الاستلام</DialogTitle>
            <DialogDescription>
              طباعة واحدة على ورق A5: نسخة المركز، ثم نسخة العميل، ثم الكارت الداخلي (كل واحد في صفحة).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              iconName="print"
              onClick={() => {
                setIntakePrintOpen(false);
                handlePrintIntakeBundle();
              }}
            >
              طباعة نسختي الإيصال + الكارت الداخلي
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIntakePrintOpen(false)}>
              لاحقاً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(opsDialog)} onOpenChange={(open) => { if (!open && !opsBusy) setOpsDialog(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {opsDialog?.mode === 'replacement' ? 'إنشاء طلب استبدال' : 'تسجيل غير قابل للإصلاح'}
            </DialogTitle>
            <DialogDescription>
              {opsDialog?.mode === 'replacement'
                ? 'يُنشأ طلب استبدال بانتظار اعتماد الإدارة، دون خصم المنتج البديل من المخزون.'
                : 'يُنقل الرصيد من عهدة المركز إلى مخزن غير القابل للإصلاح.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{opsDialog?.item.productName || '—'}</div>
              <div className="text-muted-foreground">
                {opsDialog?.mode === 'replacement'
                  ? `المتاح للاستبدال: ${Math.max(0, Number(opsDialog?.item.unrepairableQuantity || 0))}`
                  : `إجمالي المستلم: ${Math.max(1, Number(opsDialog?.item.receivedQuantity || opsDialog?.item.quantity || 1))}`}
              </div>
            </div>
            <div className="space-y-1">
              <Label>الكمية</Label>
              <Input
                type="number"
                min={opsDialog?.mode === 'unrepairable' ? 0 : 1}
                max={
                  opsDialog?.mode === 'replacement'
                    ? Math.max(0, Number(opsDialog?.item.unrepairableQuantity || 0))
                    : Math.max(1, Number(opsDialog?.item.receivedQuantity || opsDialog?.item.quantity || 1))
                }
                value={opsQty}
                onChange={(e) => setOpsQty(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <Label>
                {opsDialog?.mode === 'replacement' ? 'سبب الطلب (اختياري)' : 'سبب عدم قابلية الإصلاح'}
              </Label>
              {opsDialog?.mode === 'unrepairable' ? (
                <Select value={opsReasonCode} onValueChange={setOpsReasonCode}>
                  <SelectTrigger><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                  <SelectContent>
                    {repairSettings.unrepairableReasons.filter((item) => item.enabled !== false).map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                value={opsReason}
                onChange={(e) => setOpsReason(e.target.value)}
                placeholder={opsDialog?.mode === 'replacement' ? 'اختياري' : 'تفاصيل إضافية (مطلوبة عند سبب آخر)'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={opsBusy} onClick={() => setOpsDialog(null)}>
              إلغاء
            </Button>
            <Button type="button" disabled={opsBusy} onClick={() => void submitOpsDialog()}>
              {opsBusy ? 'جاري الحفظ...' : opsDialog?.mode === 'replacement' ? 'إنشاء الطلب' : 'حفظ القرار'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen system print documents — same DOM for print + PDF.
          Park with fixed left + max-content (never viewport-width sheets).
          Do not use height:0/overflow:hidden — exportToPDF/html2canvas needs live layout. */}
      <div
        aria-hidden
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: 'max-content',
          maxWidth: '148mm',
        }}
      >
        <RepairJobIntakePrintBundle
          ref={intakeBundlePrintRef}
          job={financialJob}
          branch={branch}
          products={jobProducts}
          trackUrl={trackUrl}
          workUrl={internalWorkUrl}
          printSettings={intakeBundlePrintSettings}
          statusMap={repairSettings.statusMap}
        />
        {/* PDF export: single customer-copy receipt on A5 */}
        <RepairJobPrint
          ref={printRef}
          job={financialJob}
          branch={branch}
          products={jobProducts}
          trackUrl={trackUrl}
          printSettings={intakeBundlePrintSettings}
          statusMap={repairSettings.statusMap}
          copyKind="customer"
        />
        <DeliveryReceiptPDF
          ref={deliveryAuthorizationPrintRef}
          job={financialJob}
          branch={branch}
          products={jobProducts}
          printSettings={printTemplate}
        />
      </div>
    </RepairOpsPageShell>
  );
}
