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
import { appendRepairServiceEvent, repairServiceEventService } from '../services/repairServiceEventService';
import { materialService } from '@/modules/manufacturing/services/materialService';
import { stockService } from '@/modules/inventory/services/stockService';
import { warehouseService } from '@/modules/inventory/services/warehouseService';
import type { Material } from '@/modules/manufacturing/types';
import { REPAIR_DOMAIN_EVENT_VERSION } from '../utils/repairDomainEvents';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
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
  isReadyToIssueUsage,
  resolvePartAvailabilityBadge,
} from '../lib/repairPartFulfillment';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { canManageRepairWorkshopWork } from '../lib/repairJobIntake';
import { resolveRepairSettings, accessoryLabelsFromIds } from '../config/repairSettings';
import { isWorkshopStatusWithinReadyCap, listAllowedWorkshopStatusTargets } from '../utils/repairStatusTransitions';
import { useRepairJobDoc } from '../hooks/useRepairJobDoc';
import { uploadRepairJobPhoto } from '../utils/repairPhotoStorage';
import {
  isCancelledStatus,
  isDeliveredStatus,
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
    inWarranty: (job.warranty || 'none') !== 'none',
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
  const [jobProducts, setJobProducts] = useState<RepairJobProduct[]>([]);
  const [serviceOnly, setServiceOnly] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [resQty, setResQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [applyingStatus, setApplyingStatus] = useState(false);
  const [requestingPart, setRequestingPart] = useState(false);
  const [issuingUsageId, setIssuingUsageId] = useState<string | null>(null);
  const [headerPanel, setHeaderPanel] = useState<'photo' | 'events' | null>(null);
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
      .then((rows) => setMaterials(rows.filter((m) => m.isActive !== false && m.id)))
      .catch(() => setMaterials([]));
  }, [jobId, technicianMode]);

  useEffect(() => {
    if (!jobId) return;
    void repairServiceEventService.listByJob(jobId).then(setEvents);
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
  const allowedStatusOptions = useMemo(() => {
    const current = String(job?.status || status || '');
    const allowed = new Set([
      current,
      ...listAllowedWorkshopStatusTargets({
        fromStatus: current,
        statuses: repairSettings.workflow.statuses,
      }),
    ]);
    return repairSettings.workflow.statuses.filter(
      (s) => s.isEnabled !== false
        && allowed.has(s.id)
        && (
          s.id === current
          || isWorkshopStatusWithinReadyCap(s.id, repairSettings.workflow.statuses)
        ),
    );
  }, [job?.status, status, repairSettings.workflow.statuses]);
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
      const badge =
        availability === 'center'
          ? `[مركز: ${centerQty}] ${REPAIR_PART_AVAILABILITY_LABELS.center}`
          : availability === 'central'
            ? `[مركزي: ${centralQty}] ${REPAIR_PART_AVAILABILITY_LABELS.central}`
            : `[غير متاح] ${REPAIR_PART_AVAILABILITY_LABELS.none}`;
      const code = material.code ? ` (${material.code})` : '';
      return {
        value: id,
        label: `${material.name}${code} — ${badge}`,
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
      warrantyScope: normalizedProducts.some((item) => item.inWarranty)
        ? 'manufacturer' as const
        : 'none' as const,
    };
    if (technicianMode) {
      await repairTechnicianService.save(job.id, normalizedProducts, serviceOnly);
    } else {
      await repairJobService.update(job.id, technicalPatch);
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

  const applyStatus = async () => {
    if (!job?.id || !canEditWorkshop) {
      toast.error('تغيير الحالة متاح للفني/مسؤول الورشة فقط.');
      return;
    }
    if (applyingStatus) return;
    if (isDeliveredStatus(status) || !isWorkshopStatusWithinReadyCap(status, repairSettings.workflow.statuses)) {
      toast.error('الورشة تغيّر الحالة حتى «جاهز للتسليم» فقط. التسليم من الاستقبال.');
      return;
    }
    if ((isUnrepairableStatus(status) || isCancelledStatus(status)) && !String(reason || '').trim()) {
      toast.error('اكتب سبب الحالة قبل الحفظ.');
      return;
    }
    const hasSelectedServices = jobProducts.some((item) => (item.serviceIds || []).length > 0);
    if (serviceOnly && !hasSelectedServices) {
      toast.error('خدمة فقط: اختر خدمةً على الأقل من القائمة المتاحة.');
      return;
    }
    const hasUsedParts = (job.partsUsed || []).some((item) => Number(item.quantity || 0) > 0);
    if (mapLegacyRepairStatus(status) === 'ready' && !hasSelectedServices && !hasUsedParts) {
      toast.error('اختر خدمة صيانة أو سجّل قطعة غيار قبل تحويل الطلب إلى جاهز للتسليم.');
      return;
    }
    const nextStatus = status;
    setApplyingStatus(true);
    try {
      await persistProductsAndPricing();
      if (technicianMode) {
        await repairTechnicianService.changeStatus(
          job.id,
          nextStatus,
          isUnrepairableStatus(nextStatus) ? reason : undefined,
        );
      } else {
        await repairJobService.changeStatus({
          jobId: job.id,
          status: nextStatus,
          technicianId: userProfile?.id,
          reason: isUnrepairableStatus(nextStatus) ? reason : undefined,
          actorUid: userProfile?.id || '',
          actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
        });
      }
      setStatus(nextStatus);
      refetchJob();
      toast.success('تم تحديث الحالة.');
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
      refetchJob();
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
      refetchJob();
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
      refetchJob();
      toast.success('تم رفع الصورة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر الرفع.');
    }
  };

  if (loading && !job) {
    return (
      <div className="p-6" dir={dir}>
        <p className="text-muted-foreground">جاري تحميل الطلب…</p>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="p-6" dir={dir}>
        <p>الطلب غير موجود.</p>
        <Button variant="outline" className="mt-2" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/jobs'))}>
          رجوع
        </Button>
      </div>
    );
  }

  const selectedStatusLabel = allowedStatusOptions.find((s) => s.id === status)?.label
    || status
    || '—';
  const deviceSummary = [
    job.deviceBrand,
    job.deviceModel,
    job.deviceType,
  ].filter(Boolean).join(' · ') || '—';
  const needsStatusReason = isUnrepairableStatus(status) || isCancelledStatus(status);

  return (
    <div
      className="erp-ds-clean mx-auto w-full max-w-6xl space-y-3 px-2 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-3 lg:pb-8"
      dir={dir}
    >
      <PageHeader
        title={`ورشة #${job.receiptNo}`}
        subtitle={deviceSummary}
        icon="fact_check"
        backAction={{ to: withTenantPath(tenantSlug, `/repair/jobs/${job.id}`) }}
        actions={<StatusBadge status={job.status} />}
      />

      {/* Header quick actions — always reachable on mobile */}
      <div className="sticky top-0 z-30 -mx-2 border-b bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:mx-0 sm:rounded-xl sm:border sm:px-2">
        <div className="grid grid-cols-2 gap-1">
          <Button
            type="button"
            variant={headerPanel === 'photo' ? 'secondary' : 'ghost'}
            className="h-auto min-h-12 flex-col gap-0.5 px-1 py-2"
            disabled={!canEditWorkshop}
            onClick={() => {
              toggleHeaderPanel('photo');
            }}
          >
            <Camera className="h-5 w-5" />
            <span className="text-[10px] leading-none">صورة</span>
          </Button>
          <Button
            type="button"
            variant={headerPanel === 'events' ? 'secondary' : 'ghost'}
            className="h-auto min-h-12 flex-col gap-0.5 px-1 py-2"
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

      <div className="rounded-xl border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">الجهاز</div>
            <div className="font-medium leading-snug break-words">{deviceSummary}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>استحقاق: <strong className="text-foreground">{job.dueAt ? new Date(job.dueAt).toLocaleDateString('ar-EG') : '—'}</strong></span>
          <span>فرع: <strong className="text-foreground">{branch?.name || '—'}</strong></span>
          {serviceOnly ? <Badge variant="outline" className="text-[10px]">خدمة فقط</Badge> : null}
          {actionState?.isClosed ? <Badge variant="secondary" className="text-[10px]">مغلق</Badge> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="order-1 space-y-3">
          <section className="rounded-xl border bg-card p-3 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</span>
              <div>
                <h2 className="text-base font-semibold leading-none">الحالة</h2>
                <p className="text-xs text-muted-foreground mt-1">حتى جاهز للتسليم</p>
              </div>
            </div>
            <Select value={status} onValueChange={setStatus} disabled={!canEditWorkshop || applyingStatus}>
              <SelectTrigger className="min-h-14 w-full text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedStatusOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-base py-3">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsStatusReason ? (
              <div className="space-y-1.5">
                <Label>سبب الحالة <span className="text-rose-600">*</span></Label>
                <textarea
                  className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-3 text-base"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={!canEditWorkshop || applyingStatus}
                  placeholder="اكتب السبب بالتفصيل"
                />
              </div>
            ) : null}
            <Button
              className="w-full min-h-14 text-base font-semibold"
              disabled={!canEditWorkshop || applyingStatus}
              onClick={() => void applyStatus()}
            >
              {applyingStatus ? 'جاري تطبيق الحالة…' : `تطبيق: ${selectedStatusLabel}`}
            </Button>
          </section>

          <section className="rounded-xl border bg-card p-3 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</span>
              <div>
                <h2 className="text-base font-semibold leading-none">قطع الغيار</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {serviceOnly ? 'مقفولة — خدمة فقط' : 'مركز / مركزي / غير متاح'}
                </p>
              </div>
            </div>

            {serviceOnly ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                ألغِ «خدمة فقط» لإضافة قطع.
              </p>
            ) : (
              <div className="space-y-3">
                {!hasBranchWarehouse ? (
                  <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                    اربط مخزناً بالفرع أولاً.
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  كل قطعة في سطر — للجهاز الواحد أضف القطعة الأولى ثم الثانية بنفس الطريقة.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto] sm:items-end">
                  <div className="space-y-1 min-w-0">
                    <Label>القطعة</Label>
                    <SearchableSelect
                      options={materialOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                      value={selectedMaterialId}
                      onChange={setSelectedMaterialId}
                      placeholder="ابحث واختر قطعة"
                      disabled={!canEditWorkshop || !actionState?.canUseParts || !hasBranchWarehouse}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>الكمية</Label>
                    <Input
                      className="min-h-10 text-base sm:min-h-10"
                      inputMode="numeric"
                      value={resQty}
                      onChange={(e) => setResQty(e.target.value)}
                      disabled={!canEditWorkshop}
                    />
                  </div>
                  <Button
                    className="min-h-10 w-full px-5 text-base sm:w-auto"
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
                      className="w-full rounded-lg border bg-muted/15 p-3 space-y-2 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 font-medium leading-snug">
                          <span className="text-muted-foreground tabular-nums">{idx + 1}. </span>
                          {row.partName}
                          {row.productName ? (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              للجهاز: {row.productName}
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 tabular-nums font-semibold">
                          × {Number(row.quantity || 0).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{REPAIR_PART_FULFILLMENT_LABELS[fulfillment]}</Badge>
                        {row.availabilityAtRequest ? (
                          <Badge variant="secondary">
                            {REPAIR_PART_AVAILABILITY_LABELS[row.availabilityAtRequest]}
                          </Badge>
                        ) : null}
                      </div>
                          {canIssueParts && isReadyToIssueUsage(row) && usageId ? (
                        <Button
                          className="w-full min-h-12"
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
          </section>

          <section className="rounded-xl border bg-card p-3 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">3</span>
              <div>
                <h2 className="text-base font-semibold leading-none">التشخيص والخدمات</h2>
                <p className="text-xs text-muted-foreground mt-1">وصف العميل ثابت</p>
              </div>
            </div>

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
                <span className="font-medium block">خدمة فقط بدون قطع</span>
                <span className="text-xs text-muted-foreground">الاستقبال يراجع التسعير بعد اكتمال التشخيص</span>
              </span>
            </label>

            {jobProducts.map((item, idx) => (
              <div key={item.itemId} className="rounded-lg border bg-muted/15 p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-semibold leading-snug break-words">
                    {idx + 1}. {item.productName || 'منتج'}
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">×{item.quantity || 1}</Badge>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">وصف العطل (عميل)</Label>
                  <div className="rounded-md border bg-background px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed">
                    {item.diagnosis || job.problemDescription || '—'}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>تشخيص الفني</Label>
                  <textarea
                    className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-3 text-base"
                    disabled={!canEditWorkshop}
                    value={item.technicianDiagnosis || ''}
                    onChange={(e) => updateProduct(item.itemId, { technicianDiagnosis: e.target.value })}
                    placeholder="اكتب التشخيص بعد الفحص…"
                  />
                </div>

                <div className="space-y-2">
                  <Label>الخدمات المنفذة</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {enabledServices.map((service) => {
                      const checked = (item.serviceIds || []).includes(service.id);
                      return (
                        <label
                          key={service.id}
                          className={`flex min-h-14 flex-col items-stretch gap-1 rounded-lg border px-2.5 py-2.5 text-sm active:scale-[0.99] sm:min-h-16 ${
                            checked ? 'border-primary bg-primary/5' : 'bg-background'
                          } ${!canEditWorkshop ? 'opacity-60' : ''}`}
                        >
                          <span className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-5 w-5 shrink-0"
                              disabled={!canEditWorkshop}
                              checked={checked}
                              onChange={() => updateProduct(item.itemId, {
                                serviceIds: toggleCatalogId(item.serviceIds, service.id),
                              })}
                            />
                            <span className="min-w-0 flex-1 font-medium leading-snug">{service.name}</span>
                          </span>
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
              className="w-full min-h-14 text-base"
              variant="secondary"
              disabled={!canEditWorkshop || saving}
              onClick={() => void persistFields()}
            >
              {saving ? 'جاري الحفظ…' : 'حفظ التشخيص والخدمات'}
            </Button>
          </section>
        </div>

      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 py-2">
          <Button
            className="min-h-12 flex-1 text-sm"
            variant="secondary"
            disabled={!canEditWorkshop || saving}
            onClick={() => void persistFields()}
          >
            حفظ
          </Button>
          <Button
            className="min-h-12 flex-[1.35] text-sm font-semibold"
            disabled={!canEditWorkshop || applyingStatus}
            onClick={() => void applyStatus()}
          >
            {applyingStatus ? 'جاري التطبيق…' : 'تطبيق الحالة'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RepairJobWorkspace;
