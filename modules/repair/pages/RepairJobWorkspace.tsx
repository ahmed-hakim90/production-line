import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/UI';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobSparePartRequestService } from '../services/repairJobSparePartRequestService';
import { repairTechnicianService } from '../services/repairTechnicianService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import { appendRepairServiceEvent, repairServiceEventService } from '../services/repairServiceEventService';
import { materialService } from '@/modules/manufacturing/services/materialService';
import { isMaterialAvailableForSpareParts } from '@/modules/manufacturing/utils/isMaterialAvailableForSpareParts';
import { stockService } from '@/modules/inventory/services/stockService';
import { warehouseService } from '@/modules/inventory/services/warehouseService';
import type { Material } from '@/modules/manufacturing/types';
import { REPAIR_DOMAIN_EVENT_VERSION } from '../utils/repairDomainEvents';
import { StatusBadge } from '../components/StatusBadge';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { RepairOpsPageShell } from '@/modules/repair/components/RepairOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import type {
  FirestoreUserWithRepair,
  RepairBranch,
  RepairJob,
  RepairJobProduct,
  RepairServiceEvent,
} from '../types';
import type { RepairServiceCatalogItem } from '../../../types';
import {
  REPAIR_PART_AVAILABILITY_LABELS,
  REPAIR_PART_FULFILLMENT_LABELS,
  effectiveFulfillmentStatus,
  formatPartAvailabilityPickerHint,
  isReadyToIssueUsage,
  resolvePartAvailabilityBadge,
} from '../lib/repairPartFulfillment';
import {
  repairPartAvailabilityChipType,
  repairPartFulfillmentChipType,
} from '../lib/repairSemanticStatus';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { canManageRepairWorkshopWork } from '../lib/repairJobIntake';
import { resolveManufacturerWarrantyScope } from '../lib/repairManufacturerWarranty';
import { resolveRepairSettings, accessoryLabelsFromIds } from '../config/repairSettings';
import {
  resolveNextStatusForAction,
  resolveStatusRole,
  statusIdForRole,
} from '../lib/repairStatusAdvance';
import { useRepairJobDoc } from '../hooks/useRepairJobDoc';
import { uploadRepairJobPhoto } from '../utils/repairPhotoStorage';
import {
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from '../utils/repairWorkflowNormalize';
import { resolveRepairJobActionState } from '../utils/repairBusinessLogic';

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
      diagnosis: String(item?.diagnosis || ''),
      technicianDiagnosis: String(item?.technicianDiagnosis || ''),
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
    inWarranty: false,
  }];
};

export const RepairJobWorkspace: React.FC = () => {
  const { dir } = useAppDirection();
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const technicianMode = can('repair.jobs.technician') && !can('repair.view');
  const [technicianServices, setTechnicianServices] = useState<RepairServiceCatalogItem[]>([]);
  const enabledServices = useMemo(
    () => (technicianMode ? technicianServices : repairSettings.serviceCatalog)
      .filter((item) => item.enabled !== false),
    [repairSettings.serviceCatalog, technicianMode, technicianServices],
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
  const { job, loading, refetch: refetchJob } = useRepairJobDoc(jobId, technicianMode);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [centerBalances, setCenterBalances] = useState<Map<string, number>>(new Map());
  const [centralBalances, setCentralBalances] = useState<Map<string, number>>(new Map());
  const [events, setEvents] = useState<RepairServiceEvent[]>([]);
  const [status, setStatus] = useState<string>('');
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [jobProducts, setJobProducts] = useState<RepairJobProduct[]>([]);
  const [serviceOnly, setServiceOnly] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [resQty, setResQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [applyingStatus, setApplyingStatus] = useState(false);
  const [requestingPart, setRequestingPart] = useState(false);
  const [issuingUsageId, setIssuingUsageId] = useState<string | null>(null);
  const [headerPanel, setHeaderPanel] = useState<'photo' | 'events' | null>(null);
  /** Mobile workshop flow: diagnose → parts → finish (desktop shows all). */
  const [workshopStep, setWorkshopStep] = useState<'diagnose' | 'parts' | 'finish'>('diagnose');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const toggleHeaderPanel = (panel: 'photo' | 'events') => {
    setHeaderPanel((prev) => (prev === panel ? null : panel));
  };

  useEffect(() => {
    if (technicianMode) {
      if (job?.branchId) {
        setBranches([{
          id: job.branchId,
          tenantId: job.tenantId,
          name: String((job as RepairJob & { branchName?: string }).branchName || 'مركز الصيانة'),
          address: '',
          phone: '',
          isMain: false,
          createdAt: job.createdAt,
        }]);
      }
      return;
    }
    void repairBranchService.list().then(setBranches);
  }, [job?.branchId, job?.createdAt, job?.tenantId, technicianMode]);

  useEffect(() => {
    if (technicianMode) {
      if (!jobId) return;
      void repairTechnicianService.getCatalog(jobId)
        .then(({ materials: rows, services }) => {
          setMaterials(rows.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            type: 'raw_material',
            baseUnit: 'piece',
            isActive: true,
            createdAt: '',
          })));
          setCenterBalances(new Map(rows.map((row) => [row.id, row.centerQty])));
          setCentralBalances(new Map(rows.map((row) => [row.id, row.centralQty])));
          setTechnicianServices(services.map((row) => ({ ...row, price: 0 })));
        })
        .catch(() => {
          setMaterials([]);
          setCenterBalances(new Map());
          setCentralBalances(new Map());
          setTechnicianServices([]);
        });
      return;
    }
    void materialService.getAll()
      .then((rows) => setMaterials(rows.filter(
        (m) => m.isActive !== false && m.id && isMaterialAvailableForSpareParts(m),
      )))
      .catch(() => setMaterials([]));
  }, [jobId, technicianMode]);

  useEffect(() => {
    if (!jobId) return;
    void repairServiceEventService.listByJob(jobId)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [jobId, job?.updatedAt]);

  // Status only — do not reset on updatedAt. Saving products first updates the doc while
  // status is still the old server value; syncing here made the select flash back to «وارد».
  useEffect(() => {
    if (!job) return;
    setStatus(job.status);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job) return;
    setJobProducts(inferProducts(job));
    setServiceOnly(Boolean(job.isServiceOnly));
  }, [job?.id, job?.updatedAt, job?.isServiceOnly]);

  const branch = useMemo(
    () => branches.find((b) => String(b.id) === String(job?.branchId)),
    [branches, job?.branchId],
  );
  const currentStatusLabel = useMemo(() => {
    const id = mapLegacyRepairStatus(job?.status || status || '');
    return repairSettings.statusMap[id]?.label
      || repairSettings.workflow.statuses.find((s) => mapLegacyRepairStatus(s.id) === id)?.label
      || id
      || '—';
  }, [job?.status, status, repairSettings]);
  const currentRole = useMemo(
    () => resolveStatusRole(job?.status || status, repairSettings.workflow.statuses),
    [job?.status, status, repairSettings.workflow.statuses],
  );
  const canMarkRepaired = currentRole === 'in_repair'
    || (currentRole === 'awaiting_parts' && !(job?.partsUsed || []).some((row) =>
      ['pending_supply', 'ready_to_issue'].includes(String(row.fulfillmentStatus || '')),
    ))
    || currentRole === 'none';
  const readyStatusId = statusIdForRole('ready_delivery', repairSettings.workflow.statuses) || 'ready';
  const unrepairableStatusId = statusIdForRole('unrepairable', repairSettings.workflow.statuses) || 'unrepairable';
  const branchWarehouseId = String(branch?.warehouseId || '').trim();
  const hasBranchWarehouse = technicianMode || Boolean(branchWarehouseId);

  useEffect(() => {
    if (technicianMode) return;
    let cancelled = false;
    const loadBalances = async () => {
      try {
        const warehouses = await warehouseService.getAll();
        const central = warehouses.find(
          (w) => w.warehouseRole === 'spare_parts_central' && w.isActive !== false,
        );
        const [centerRows, centralRows] = await Promise.all([
          branchWarehouseId ? stockService.getBalances(branchWarehouseId) : Promise.resolve([]),
          central?.id ? stockService.getBalances(central.id) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        const centerMap = new Map<string, number>();
        for (const row of centerRows) {
          if (row.itemType === 'material') {
            centerMap.set(row.itemId, Number(row.quantity || 0));
          }
        }
        const centralMap = new Map<string, number>();
        for (const row of centralRows) {
          if (row.itemType === 'material') {
            centralMap.set(row.itemId, Number(row.quantity || 0));
          }
        }
        setCenterBalances(centerMap);
        setCentralBalances(centralMap);
      } catch {
        if (!cancelled) {
          setCenterBalances(new Map());
          setCentralBalances(new Map());
        }
      }
    };
    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [branchWarehouseId, job?.updatedAt, technicianMode]);

  const actionState = useMemo(
    () =>
      job
        ? resolveRepairJobActionState({
            job,
            access: repairCtx,
            technicianIds,
            canEditByPermission: can('repair.jobs.edit'),
            canCreatePartsUsage: can('repair.parts.request'),
          })
        : null,
    [job, repairCtx, technicianIds, can],
  );
  const canEditThisJob = Boolean(actionState?.canEdit);
  const isAssignedToCurrentTechnician = useMemo(() => {
    const assigned = String(job?.technicianId || '').trim();
    return assigned.length > 0 && technicianIds.includes(assigned);
  }, [job?.technicianId, technicianIds]);
  const canManageWorkshopWork = canManageRepairWorkshopWork({
    canEditJob: canEditThisJob,
    isRepairTechnician: repairCtx.isRepairTechnician,
    isAssignedTechnician: isAssignedToCurrentTechnician,
    canManageBranches: can('repair.branches.manage'),
    canViewAllCallCenter: can('repair.callCenter.viewAll'),
    canCreateJobs: can('repair.jobs.create'),
    canEditJobs: can('repair.jobs.edit'),
  });
  const canEditWorkshop = canEditThisJob && canManageWorkshopWork;
  const canIssueParts = can('repair.parts.manage') || can('repairSpareIssues.issue');
  const materialOptions = useMemo(() => {
    return materials.map((material) => {
      const id = String(material.id || '');
      const centerQty = Number(centerBalances.get(id) || 0);
      const centralQty = Number(centralBalances.get(id) || 0);
      const availability = resolvePartAvailabilityBadge(centerQty, centralQty);
      const code = material.code ? ` (${material.code})` : '';
      return {
        value: id,
        label: `${material.name}${code}`,
        hint: formatPartAvailabilityPickerHint(availability, centerQty, centralQty),
        hintType: repairPartAvailabilityChipType(availability),
        availability,
      };
    });
  }, [materials, centerBalances, centralBalances]);

  const updateProduct = (itemId: string, patch: Partial<RepairJobProduct>) => {
    setJobProducts((prev) => prev.map((item) => {
      if (item.itemId !== itemId) return item;
      const next = { ...item, ...patch };
      const qty = Math.max(1, Math.round(Number(next.quantity || 1)));
      next.quantity = qty;
      // The workshop stores service identifiers only. Pricing is resolved later by
      // the protected server-side payment authorization workflow.
      delete next.estimatedCost;
      delete next.finalCost;
      return next;
    }));
  };

  const persistProductsAndPricing = async () => {
    if (!job?.id || !canEditWorkshop) return;
    const lead = jobProducts[0];
    const normalizedProducts = jobProducts.map((item) => {
      const existing = (job.jobProducts || []).find((row) => String(row.itemId) === String(item.itemId));
      const labels = accessoryLabelsFromIds(item.accessoryIds, repairSettings.accessoriesCatalog);
      const notesText = String(item.accessories || '').trim();
      const notesWithoutLabels = labels && notesText.startsWith(labels)
        ? notesText.slice(labels.length).replace(/^[\s،,]+/, '').trim()
        : notesText;
      return {
        ...item,
        // Customer complaint from intake stays immutable in workshop saves.
        diagnosis: String(existing?.diagnosis ?? item.diagnosis ?? ''),
        technicianDiagnosis: String(item.technicianDiagnosis || '').trim(),
        quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        accessoryIds: Array.isArray(item.accessoryIds) ? item.accessoryIds : [],
        serviceIds: Array.isArray(item.serviceIds) ? item.serviceIds : [],
        accessories: [labels, notesWithoutLabels].filter(Boolean).join('، '),
      };
    });
    const technicalPatch = {
      jobProducts: normalizedProducts,
      isServiceOnly: serviceOnly,
      productId: lead?.productId || job.productId || '',
      productName: lead?.productName || job.productName || '',
      deviceType: lead?.deviceType || job.deviceType || '',
      deviceBrand: lead?.deviceBrand || job.deviceBrand || '',
      deviceModel: lead?.deviceModel || job.deviceModel || '',
      deviceSerial: String(lead?.serialNo || job.deviceSerial || '').trim(),
      // Keep intake customer complaint; never overwrite from technician diagnosis.
      problemDescription: job.problemDescription || '',
      accessories: normalizedProducts[0]?.accessories || job.accessories || '',
      warranty: normalizedProducts.some((item) => item.inWarranty)
        ? 'none'
        : (job.warranty || repairSettings.defaults.defaultWarranty),
      warrantyScope: resolveManufacturerWarrantyScope(normalizedProducts),
    };
    const hasDiagnosis = normalizedProducts.some((item) => String(item.technicianDiagnosis || '').trim());
    const hasService = normalizedProducts.some((item) => (item.serviceIds || []).some((id) => String(id || '').trim()));
    const hasPart = (job.partsUsed || []).some((item) => Number(item.quantity || 0) > 0);
    const nextStatus = resolveNextStatusForAction({
      action: 'diagnosis_saved',
      currentStatus: String(job.status || ''),
      statuses: repairSettings.workflow.statuses,
      hasDiagnosis,
      hasServiceOrPartSignal: hasService || hasPart,
    });
    if (technicianMode) {
      await repairTechnicianService.save(job.id, normalizedProducts, serviceOnly);
    } else {
      await repairJobService.update(job.id, technicalPatch);
      if (nextStatus && nextStatus !== mapLegacyRepairStatus(job.status)) {
        await repairJobService.changeStatus({
          jobId: job.id,
          status: nextStatus,
          technicianId: userProfile?.id,
          actorUid: userProfile?.id || '',
          actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
        });
      }
    }
  };

  const persistFields = async () => {
    if (!job?.id || !canEditWorkshop) {
      toast.error('تعديل الورشة غير متاح لهذا الحساب.');
      return;
    }
    const hasSelectedServices = jobProducts.some((item) => (item.serviceIds || []).length > 0);
    if (serviceOnly && !hasSelectedServices) {
      toast.error('خدمة فقط: اختر خدمة واحدةً على الأقل من القائمة المتاحة.');
      return;
    }
    setSaving(true);
    try {
      await persistProductsAndPricing();
      toast.success('تم حفظ الخدمات والتشخيص.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  const applyWorkshopAction = async (action: 'repair_done' | 'unrepairable') => {
    if (!job?.id || !canEditWorkshop) {
      toast.error('تغيير الحالة متاح للفني/مسؤول الورشة فقط.');
      return;
    }
    if (applyingStatus) return;
    const nextStatus = action === 'unrepairable' ? unrepairableStatusId : readyStatusId;
    if (action === 'unrepairable') {
      if (!reasonCode) {
        toast.error('اختر سبب عدم قابلية الإصلاح.');
        return;
      }
      if (reasonCode === 'other' && !String(reason || '').trim()) {
        toast.error('اكتب تفاصيل السبب الآخر.');
        return;
      }
    }
    const hasSelectedServices = jobProducts.some((item) => (item.serviceIds || []).length > 0);
    if (serviceOnly && !hasSelectedServices) {
      toast.error('خدمة فقط: اختر خدمةً على الأقل من القائمة المتاحة.');
      return;
    }
    const hasUsedParts = (job.partsUsed || []).some((item) => Number(item.quantity || 0) > 0);
    if (action === 'repair_done' && !hasSelectedServices && !hasUsedParts) {
      toast.error('اختر خدمة صيانة أو سجّل قطعة غيار قبل تحويل الطلب إلى جاهز للتسليم.');
      return;
    }
    if (action === 'repair_done' && !canMarkRepaired) {
      toast.error('علّم «تم الإصلاح» بعد موافقة العميل ومرحلة الإصلاح.');
      return;
    }
    setApplyingStatus(true);
    try {
      await persistProductsAndPricing();
      if (technicianMode) {
        await repairTechnicianService.changeStatus(
          job.id,
          nextStatus,
          action === 'unrepairable' ? reason : undefined,
          action === 'unrepairable' ? reasonCode : undefined,
        );
      } else if (action === 'unrepairable') {
        for (const item of jobProducts) {
          const quantity = Math.max(1, Number(item.receivedQuantity || item.quantity || 1));
          await repairCustomerOperationsService.recordUnrepairable(
            job.id,
            item.itemId,
            quantity,
            reasonCode,
            reason || undefined,
          );
        }
      } else {
        await repairJobService.changeStatus({
          jobId: job.id,
          status: nextStatus,
          technicianId: userProfile?.id,
          actorUid: userProfile?.id || '',
          actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
        });
      }
      setStatus(nextStatus);
      if (technicianMode) refetchJob();
      toast.success(action === 'unrepairable' ? 'تم تسجيل غير قابل للإصلاح.' : 'تم تعليم الطلب كجاهز للتسليم.');
    } catch (e: any) {
      if (job.status) setStatus(job.status);
      toast.error(e?.message || 'تعذر تحديث الحالة.');
    } finally {
      setApplyingStatus(false);
    }
  };

  const requestSparePart = async () => {
    if (!job?.id || !canEditWorkshop || !hasBranchWarehouse) {
      toast.error('أكمل إعداد مخزن الفرع أو صلاحيات الورشة.');
      return;
    }
    const qty = Number(resQty || 0);
    if (!selectedMaterialId || qty <= 0) {
      toast.error('اختر قطعة وكمية صحيحة.');
      return;
    }
    setRequestingPart(true);
    try {
      const result = await repairJobSparePartRequestService.request({
        jobId: job.id,
        materialId: selectedMaterialId,
        quantity: qty,
      });
      if (result.path === 'center') {
        toast.success(
          result.approvalMode === 'direct'
            ? `تم صرف القطعة من مخزن المركز (${result.referenceNo}).`
            : `تم إنشاء سند ${result.referenceNo} بانتظار الاعتماد.`,
        );
      } else {
        toast.success(
          result.availability === 'none'
            ? `سُجّلت القطعة بانتظار التوريد (ناقصة) — طلب ${result.replenishmentReferenceNo}.`
            : `سُجّلت القطعة بانتظار التوريد — طلب ${result.replenishmentReferenceNo}.`,
        );
      }
      setSelectedMaterialId('');
      setResQty('1');
      if (technicianMode) refetchJob();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طلب القطعة.');
    } finally {
      setRequestingPart(false);
    }
  };

  const issuePendingUsage = async (usageId: string) => {
    if (!job?.id || !canEditWorkshop) return;
    setIssuingUsageId(usageId);
    try {
      const result = await repairJobSparePartRequestService.issuePending({
        jobId: job.id,
        usageId,
      });
      toast.success(`تم صرف القطعة (${result.referenceNo}).`);
      if (technicianMode) refetchJob();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر صرف القطعة.');
    } finally {
      setIssuingUsageId(null);
    }
  };

  const uploadPhoto = async (fileList: FileList | null, field: 'intake' | 'repair') => {
    const f = fileList?.[0];
    if (!f || !job?.id || !canEditWorkshop) return;
    if ((job.intakePhotoUrls?.length || 0) + (job.repairPhotoUrls?.length || 0) >= 16) {
      toast.error('الحد الأقصى للصور لهذا الطلب 16.');
      return;
    }
    try {
      const url = await uploadRepairJobPhoto(job.id, f);
      if (technicianMode) {
        await repairTechnicianService.addPhoto(job.id, url);
      } else {
        const patch =
          field === 'intake'
            ? { intakePhotoUrls: [...(job.intakePhotoUrls || []), url].slice(0, 12) }
            : { repairPhotoUrls: [...(job.repairPhotoUrls || []), url].slice(0, 12) };
        await repairJobService.update(job.id, patch);
        await appendRepairServiceEvent(job.id, {
          tenantId: job.tenantId,
          branchId: job.branchId,
          at: new Date().toISOString(),
          actorUid: userProfile?.id || 'unknown',
          actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
          action: 'photo_added',
          domainEvent: 'job.photo_added',
          eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
          payload: { field, url },
        });
      }
      if (technicianMode) refetchJob();
      toast.success('تم رفع الصورة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الرفع.');
    }
  };

  const workshopBackPath = withTenantPath(
    tenantSlug,
    technicianMode ? '/repair/my-jobs' : job?.id ? `/repair/jobs/${job.id}` : '/repair/jobs',
  );
  const shellBackAction = (
    <Button type="button" variant="ghost" onClick={() => navigate(workshopBackPath)}>
      رجوع
    </Button>
  );

  if (loading && !job) {
    return (
      <RepairOpsPageShell
        className="mx-auto max-w-3xl lg:max-w-6xl"
        dir={dir}
        eyebrow="ورشة الصيانة"
        actions={shellBackAction}
      >
        <OpsDashPanel title="جاري التحميل" accent="repair">
          <p className="text-sm text-muted-foreground">جاري تحميل الطلب…</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }
  if (!job) {
    return (
      <RepairOpsPageShell
        className="mx-auto max-w-3xl lg:max-w-6xl"
        dir={dir}
        eyebrow="ورشة الصيانة"
        actions={shellBackAction}
      >
        <OpsDashPanel title="الطلب غير موجود" accent="repair">
          <p className="text-sm">الطلب غير موجود.</p>
          <Button variant="outline" className="mt-2" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
            رجوع
          </Button>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  const deviceSummary = [
    job.deviceBrand,
    job.deviceModel,
    job.deviceType,
  ].filter(Boolean).join(' · ') || '—';
  const showUnrepairableForm = isUnrepairableStatus(status) || Boolean(reasonCode);
  const customerComplaint = String(
    jobProducts[0]?.diagnosis || job.problemDescription || '',
  ).trim() || '—';
  const closedJob = Boolean(actionState?.isClosed);

  const showDiagnose = workshopStep === 'diagnose';
  const showParts = workshopStep === 'parts';
  const showFinish = workshopStep === 'finish';

  const stepBtnClass = (active: boolean) =>
    `flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-bold transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <RepairOpsPageShell
      className="mx-auto max-w-3xl space-y-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:pb-8"
      dir={dir}
      eyebrow="ورشة الصيانة"
      rangeLabel={`#${job.receiptNo} · ${deviceSummary}`}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          {shellBackAction}
        </div>
      )}
    >
      {/* Sticky: steps + photo/history — below fixed topbar */}
      <div className="sticky top-[52px] z-30 -mx-1 border-b bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:mx-0 sm:rounded-xl sm:border sm:px-2">
        <div className="mb-2 flex gap-1 lg:hidden" role="tablist" aria-label="خطوات الورشة">
          <button type="button" role="tab" aria-selected={showDiagnose} className={stepBtnClass(showDiagnose)} onClick={() => setWorkshopStep('diagnose')}>
            <span className="text-sm leading-none">1</span>
            تشخيص
          </button>
          <button type="button" role="tab" aria-selected={showParts} className={stepBtnClass(showParts)} onClick={() => setWorkshopStep('parts')}>
            <span className="text-sm leading-none">2</span>
            قطع
          </button>
          <button type="button" role="tab" aria-selected={showFinish} className={stepBtnClass(showFinish)} onClick={() => setWorkshopStep('finish')}>
            <span className="text-sm leading-none">3</span>
            إنهاء
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <Button
            type="button"
            variant={headerPanel === 'photo' ? 'secondary' : 'ghost'}
            className="h-auto min-h-11 flex-col gap-0.5 px-1 py-2"
            disabled={!canEditWorkshop}
            onClick={() => toggleHeaderPanel('photo')}
          >
            <Camera className="h-5 w-5" />
            <span className="text-[10px] leading-none">صورة</span>
          </Button>
          <Button
            type="button"
            variant={headerPanel === 'events' ? 'secondary' : 'ghost'}
            className="h-auto min-h-11 flex-col gap-0.5 px-1 py-2"
            onClick={() => toggleHeaderPanel('events')}
          >
            <History className="h-5 w-5" />
            <span className="text-[10px] leading-none">سجل</span>
          </Button>
        </div>

        {headerPanel === 'photo' ? (
          <div className="mt-2 space-y-2 rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">التقاط أو رفع صورة ورشة</p>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={!canEditWorkshop}
              onChange={(e) => {
                void uploadPhoto(e.target.files, 'repair');
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              className="min-h-12 w-full"
              disabled={!canEditWorkshop}
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera className="ms-1 h-4 w-4" />
              التقاط / اختيار صورة
            </Button>
            <div className="flex flex-wrap gap-2">
              {(job.repairPhotoUrls || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">لا صور بعد.</span>
              ) : (
                (job.repairPhotoUrls || []).map((u, index) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center rounded border px-3 py-2 text-sm text-primary underline"
                  >
                    صورة {index + 1}
                  </a>
                ))
              )}
            </div>
          </div>
        ) : null}

        {headerPanel === 'events' ? (
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">سجل الأحداث</p>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا أحداث بعد.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="rounded border px-2 py-2 text-sm">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{ev.actorName}</span>
                    <span className="tabular-nums">{new Date(ev.at).toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="font-medium">{ev.action}</div>
                  {ev.statusBefore && ev.statusAfter ? (
                    <div className="text-xs">{ev.statusBefore} → {ev.statusAfter}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {actionState?.blockedReason ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionState.blockedReason}
        </div>
      ) : null}
      {!canManageWorkshopWork && canEditThisJob ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          حساب الاستقبال: عرض فقط. الإسناد والطباعة من صفحة التفاصيل.
        </div>
      ) : null}

      {/* Always-visible job context */}
      <OpsDashPanel title="بيانات الطلب" accent="repair">
        <div className="text-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <span className="text-xs text-muted-foreground">{currentStatusLabel}</span>
          {serviceOnly ? <Badge variant="outline" className="text-[10px]">خدمة فقط</Badge> : null}
          {closedJob ? <Badge variant="secondary" className="text-[10px]">مغلق</Badge> : null}
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">الجهاز</div>
          <div className="font-semibold leading-snug break-words">{deviceSummary}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">شكوى العميل</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{customerComplaint}</div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>استحقاق: <strong className="text-foreground">{job.dueAt ? new Date(job.dueAt).toLocaleDateString('ar-EG') : '—'}</strong></span>
          <span>فرع: <strong className="text-foreground">{branch?.name || '—'}</strong></span>
        </div>
        </div>
      </OpsDashPanel>

      <div className="flex flex-col gap-3">
        {/* 1 — Diagnosis (first for technicians) */}
        <OpsDashPanel
          title="التشخيص والخدمات"
          accent="repair"
          className={showDiagnose ? '' : 'hidden lg:block'}
          bodyClassName="space-y-3"
        >
          {!canEditWorkshop ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              عرض فقط — لا صلاحية تعديل ورشة.
            </p>
          ) : null}

          <label className="flex min-h-14 items-center gap-3 rounded-lg border px-3 py-3 text-sm active:bg-muted/50">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={serviceOnly}
              disabled={!canEditWorkshop}
              onChange={(e) => setServiceOnly(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block font-medium">خدمة فقط بدون قطع</span>
              <span className="text-xs text-muted-foreground">يقفل طلب قطع الغيار لهذا الطلب</span>
            </span>
          </label>

          {jobProducts.map((item, idx) => (
            <div key={item.itemId} className="space-y-3 rounded-lg border bg-muted/15 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 break-words text-sm font-semibold leading-snug">
                  {idx + 1}. {item.productName || 'منتج'}
                </div>
                <Badge variant="outline" className="shrink-0 tabular-nums">×{item.quantity || 1}</Badge>
              </div>

              <div className="space-y-1">
                <Label>تشخيص الفني</Label>
                <textarea
                  className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-3 text-base"
                  disabled={!canEditWorkshop}
                  value={item.technicianDiagnosis || ''}
                  onChange={(e) => updateProduct(item.itemId, { technicianDiagnosis: e.target.value })}
                  placeholder="اكتب التشخيص بعد الفحص…"
                />
              </div>

              <div className="space-y-2">
                <Label>الخدمات المنفذة</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {enabledServices.map((service) => {
                    const checked = (item.serviceIds || []).includes(service.id);
                    return (
                      <label
                        key={service.id}
                        className={`flex min-h-12 items-center gap-2.5 rounded-lg border px-3 py-3 text-sm active:scale-[0.99] ${
                          checked ? 'border-primary bg-primary/5' : 'bg-background'
                        } ${!canEditWorkshop ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0"
                          disabled={!canEditWorkshop}
                          checked={checked}
                          onChange={() => updateProduct(item.itemId, {
                            serviceIds: toggleCatalogId(item.serviceIds, service.id),
                          })}
                        />
                        <span className="min-w-0 flex-1 font-medium leading-snug">{service.name}</span>
                      </label>
                    );
                  })}
                </div>
                {enabledServices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">عرّف الخدمات من إعدادات الصيانة.</p>
                ) : null}
              </div>
            </div>
          ))}

          <Button
            className="min-h-14 w-full text-base"
            variant="secondary"
            disabled={!canEditWorkshop || saving}
            onClick={() => void persistFields()}
          >
            {saving ? 'جاري الحفظ…' : 'حفظ التشخيص والخدمات'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full lg:hidden"
            onClick={() => setWorkshopStep(serviceOnly ? 'finish' : 'parts')}
          >
            التالي: {serviceOnly ? 'إنهاء الطلب' : 'قطع الغيار'}
          </Button>
        </OpsDashPanel>

        {/* 2 — Parts */}
        <OpsDashPanel
          title="قطع الغيار"
          accent="repair"
          className={showParts ? '' : 'hidden lg:block'}
          bodyClassName="space-y-3"
        >

          {serviceOnly ? (
            <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
              ألغِ «خدمة فقط» من خطوة التشخيص لإضافة قطع.
            </p>
          ) : (
            <div className="space-y-3">
              {!hasBranchWarehouse ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                  اربط مخزناً بالفرع أولاً.
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto] sm:items-end">
                <div className="min-w-0 space-y-1">
                  <Label>القطعة</Label>
                  <SearchableSelect
                    options={materialOptions.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                      hint: opt.hint,
                      hintType: opt.hintType,
                    }))}
                    value={selectedMaterialId}
                    onChange={setSelectedMaterialId}
                    placeholder="ابحث واختر قطعة"
                    disabled={!canEditWorkshop || !actionState?.canUseParts || !hasBranchWarehouse}
                  />
                </div>
                <div className="space-y-1">
                  <Label>الكمية</Label>
                  <Input
                    className="min-h-11 text-base"
                    inputMode="numeric"
                    value={resQty}
                    onChange={(e) => setResQty(e.target.value)}
                    disabled={!canEditWorkshop}
                  />
                </div>
                <Button
                  className="min-h-11 w-full px-5 text-base sm:w-auto"
                  disabled={!canEditWorkshop || !actionState?.canUseParts || requestingPart || !hasBranchWarehouse}
                  onClick={() => void requestSparePart()}
                >
                  {requestingPart ? '…' : 'طلب'}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(job.partsUsed || []).length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                لا توجد قطع على الطلب بعد.
              </p>
            ) : (
              (job.partsUsed || []).map((row, idx) => {
                const fulfillment = effectiveFulfillmentStatus(row);
                const usageId = String(row.usageId || '');
                return (
                  <div
                    key={usageId || `${row.partId}-${idx}`}
                    className="w-full space-y-2 rounded-lg border bg-muted/15 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 font-medium leading-snug">
                        <span className="tabular-nums text-muted-foreground">{idx + 1}. </span>
                        {row.partName}
                        {row.productName ? (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            للجهاز: {row.productName}
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        × {Number(row.quantity || 0).toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <ErpStatusBadge
                        label={REPAIR_PART_FULFILLMENT_LABELS[fulfillment]}
                        type={repairPartFulfillmentChipType(fulfillment)}
                      />
                      {row.availabilityAtRequest ? (
                        <ErpStatusBadge
                          label={REPAIR_PART_AVAILABILITY_LABELS[row.availabilityAtRequest]}
                          type={repairPartAvailabilityChipType(row.availabilityAtRequest)}
                        />
                      ) : null}
                    </div>
                    {canIssueParts && isReadyToIssueUsage(row) && usageId ? (
                      <Button
                        className="min-h-12 w-full"
                        variant="secondary"
                        disabled={!canEditWorkshop || issuingUsageId === usageId}
                        onClick={() => void issuePendingUsage(usageId)}
                      >
                        {issuingUsageId === usageId ? 'جاري الصرف…' : 'صرف الآن'}
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:hidden">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setWorkshopStep('diagnose')}>
              السابق
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setWorkshopStep('finish')}>
              التالي: إنهاء
            </Button>
          </div>
        </OpsDashPanel>

        {/* 3 — Finish */}
        <OpsDashPanel
          title="إنهاء الطلب"
          accent="repair"
          className={showFinish ? '' : 'hidden lg:block'}
          bodyClassName="space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm text-muted-foreground">{currentStatusLabel}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="min-h-14 text-base font-semibold"
              disabled={!canEditWorkshop || applyingStatus || !canMarkRepaired}
              onClick={() => void applyWorkshopAction('repair_done')}
            >
              {applyingStatus ? 'جاري التطبيق…' : 'تم الإصلاح — جاهز للتسليم'}
            </Button>
            <Button
              className="min-h-14 text-base"
              variant="outline"
              disabled={!canEditWorkshop || applyingStatus}
              onClick={() => {
                setStatus(unrepairableStatusId);
                if (!reasonCode) setReasonCode('');
              }}
            >
              غير قابل للإصلاح
            </Button>
          </div>
          {showUnrepairableForm ? (
            <div className="space-y-1.5 rounded-md border border-rose-200 bg-rose-50/40 p-3">
              <Label>سبب عدم قابلية الإصلاح <span className="text-rose-600">*</span></Label>
              <Select value={reasonCode} onValueChange={setReasonCode} disabled={!canEditWorkshop || applyingStatus}>
                <SelectTrigger className="min-h-12 bg-background"><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                <SelectContent>
                  {repairSettings.unrepairableReasons.filter((item) => item.enabled !== false).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label>تفاصيل إضافية (مطلوبة عند «سبب آخر»)</Label>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-3 text-base"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!canEditWorkshop || applyingStatus}
                placeholder="ملاحظة اختيارية عن الفحص"
              />
              <Button
                className="min-h-12 w-full"
                variant="destructive"
                disabled={!canEditWorkshop || applyingStatus || !reasonCode}
                onClick={() => void applyWorkshopAction('unrepairable')}
              >
                تأكيد غير قابل للإصلاح
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full lg:hidden"
            onClick={() => setWorkshopStep(serviceOnly ? 'diagnose' : 'parts')}
          >
            رجوع للخطوة السابقة
          </Button>
        </OpsDashPanel>
      </div>

      {/* Mobile sticky CTA — contextual to step */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2">
          {workshopStep === 'diagnose' ? (
            <>
              <Button
                className="min-h-12 flex-1 text-sm"
                variant="secondary"
                disabled={!canEditWorkshop || saving}
                onClick={() => void persistFields()}
              >
                {saving ? '…' : 'حفظ'}
              </Button>
              <Button
                className="min-h-12 flex-[1.4] text-sm font-semibold"
                onClick={() => setWorkshopStep(serviceOnly ? 'finish' : 'parts')}
              >
                التالي
              </Button>
            </>
          ) : null}
          {workshopStep === 'parts' ? (
            <>
              <Button
                className="min-h-12 flex-1 text-sm"
                variant="outline"
                onClick={() => setWorkshopStep('diagnose')}
              >
                السابق
              </Button>
              <Button
                className="min-h-12 flex-1 text-sm"
                disabled={!canEditWorkshop || !actionState?.canUseParts || requestingPart || !hasBranchWarehouse || serviceOnly}
                onClick={() => void requestSparePart()}
              >
                {requestingPart ? '…' : 'طلب قطعة'}
              </Button>
              <Button
                className="min-h-12 flex-1 text-sm font-semibold"
                onClick={() => setWorkshopStep('finish')}
              >
                إنهاء
              </Button>
            </>
          ) : null}
          {workshopStep === 'finish' ? (
            <>
              <Button
                className="min-h-12 flex-1 text-sm"
                variant="secondary"
                disabled={!canEditWorkshop || saving}
                onClick={() => void persistFields()}
              >
                حفظ
              </Button>
              <Button
                className="min-h-12 flex-[1.5] text-sm font-semibold"
                disabled={!canEditWorkshop || applyingStatus || !canMarkRepaired}
                onClick={() => void applyWorkshopAction('repair_done')}
              >
                {applyingStatus ? '…' : 'تم الإصلاح'}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </RepairOpsPageShell>
  );
};

export default RepairJobWorkspace;
