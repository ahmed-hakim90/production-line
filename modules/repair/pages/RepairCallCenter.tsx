import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { repairBranchService } from '../services/repairBranchService';
import { repairComplaintService } from '../services/repairComplaintService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import type {
  FirestoreUserWithRepair,
  RepairBranch,
  RepairCallCenterPrefill,
  RepairComplaint,
  RepairJob,
  RepairJobProduct,
  RepairReplacementRequest,
} from '../types';
import {
  REPAIR_COMPLAINT_STATUS_LABELS,
  resolveUserRepairBranchIds,
} from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { useRepairTechnicianIds } from '../hooks/useRepairTechnicianIds';
import { customerPhonesMatch, normalizeCustomerPhoneDigits } from '../utils/customerPhone';
import { StatusBadge } from '../components/StatusBadge';
import { RepairCallCenterJobPanel } from '../components/RepairCallCenterJobPanel';
import { customerService } from '@/modules/customers/services/customerService';
import { CUSTOMER_TYPE_LABELS, type Customer } from '@/modules/customers/types';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { REPLACEMENT_STATUS_LABELS } from '../lib/repairCustomerOpsLabels';
import {
  repairComplaintStatusChipType,
  repairReplacementStatusChipType,
} from '../lib/repairSemanticStatus';

const MIN_SEARCH_LENGTH = 3;
const CUSTOMER_HISTORY_PAGE_SIZE = 20;

type CustomerHistoryKind = 'job' | 'complaint' | 'replacement';

const HISTORY_KIND_LABELS: Record<CustomerHistoryKind, string> = {
  job: 'صيانة',
  complaint: 'شكوى',
  replacement: 'استبدال',
};

type CustomerHistoryRow = {
  kind: CustomerHistoryKind;
  id: string;
  sortAt: string;
  customerName: string;
  branchId?: string;
  reference: string;
  detail: string;
  job?: RepairJob;
  complaint?: RepairComplaint;
  replacement?: RepairReplacementRequest;
};

function matchesCallCenterFields(
  query: string,
  fields: { phone?: string; name?: string; receipt?: string; extra?: string },
): boolean {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return false;
  const qLower = q.toLowerCase();
  const digits = normalizeCustomerPhoneDigits(q);
  if (digits.length >= MIN_SEARCH_LENGTH && fields.phone && customerPhonesMatch(fields.phone, q)) return true;
  if (String(fields.receipt || '').toLowerCase().includes(qLower)) return true;
  if (String(fields.name || '').toLowerCase().includes(qLower)) return true;
  if (fields.extra && fields.extra.toLowerCase().includes(qLower)) return true;
  return false;
}

function matchesCallCenterSearch(job: RepairJob, query: string): boolean {
  return matchesCallCenterFields(query, {
    phone: job.customerPhone,
    name: job.customerName,
    receipt: job.receiptNo,
  });
}

function collectDevicesFromJobs(jobs: RepairJob[]): Array<{
  key: string;
  productName: string;
  productId?: string;
  deviceBrand?: string;
  deviceModel?: string;
  serialNo?: string;
  lastJobId?: string;
  lastReceipt?: string;
  lastAt: string;
}> {
  const map = new Map<
    string,
    {
      key: string;
      productName: string;
      productId?: string;
      deviceBrand?: string;
      deviceModel?: string;
      serialNo?: string;
      lastJobId?: string;
      lastReceipt?: string;
      lastAt: string;
    }
  >();
  const sorted = [...jobs].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  for (const job of sorted) {
    const rows: RepairJobProduct[] = Array.isArray(job.jobProducts) && job.jobProducts.length > 0
      ? job.jobProducts
      : [
          {
            itemId: 'legacy',
            productName: job.productName || `${job.deviceBrand || ''} ${job.deviceModel || ''}`.trim() || 'جهاز',
            deviceBrand: job.deviceBrand,
            deviceModel: job.deviceModel,
            serialNo: job.deviceSerial,
          },
        ];
    for (const row of rows) {
      const brand = String(row.deviceBrand || job.deviceBrand || '').trim();
      const model = String(row.deviceModel || job.deviceModel || '').trim();
      const serial = String(row.serialNo || job.deviceSerial || '').trim();
      const name = String(row.productName || '').trim() || 'جهاز';
      const pid = row.productId ? String(row.productId) : undefined;
      const key = [brand, model, serial, pid || ''].filter(Boolean).join('|') || `${job.id}-${row.itemId}`;
      const at = String(job.createdAt || '');
      const prev = map.get(key);
      if (!prev || at.localeCompare(prev.lastAt) > 0) {
        map.set(key, {
          key,
          productName: name,
          productId: pid,
          deviceBrand: brand || undefined,
          deviceModel: model || undefined,
          serialNo: serial || undefined,
          lastJobId: job.id,
          lastReceipt: job.receiptNo,
          lastAt: at,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export const RepairCallCenter: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);

  const canViewAllCallCenter = can('repair.callCenter.viewAll') || can('repair.branches.manage');
  const canViewComplaints = can('repair.complaints.view');
  const canViewReplacements =
    can('repair.replacements.view')
    || can('repair.replacements.create')
    || can('repair.replacements.approve')
    || can('repair.replacements.deliver');

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

  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [crmCustomers, setCrmCustomers] = useState<Customer[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [complaints, setComplaints] = useState<RepairComplaint[]>([]);
  const [replacements, setReplacements] = useState<RepairReplacementRequest[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsTick, setOpsTick] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const searchReady = debouncedSearch.length >= MIN_SEARCH_LENGTH;
  const phoneDigitsForCrm = normalizeCustomerPhoneDigits(debouncedSearch);

  useEffect(() => {
    if (phoneDigitsForCrm.length < 7) {
      setCrmCustomers([]);
      setCrmLoading(false);
      return;
    }
    let cancelled = false;
    setCrmLoading(true);
    void customerService
      .findByPhoneDigits(phoneDigitsForCrm)
      .then((rows) => {
        if (!cancelled) setCrmCustomers(rows);
      })
      .catch(() => {
        if (!cancelled) setCrmCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setCrmLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phoneDigitsForCrm]);

  useEffect(() => {
    if (can('repair.branches.manage') || !userProfile?.id) {
      setAssignedBranchIds([]);
      return;
    }
    void repairBranchService.list().then((branchRows) => {
      const uid = String(userProfile.id || '').trim();
      const eid = String(currentEmployee?.id || '').trim();
      const ids = branchRows
        .filter((branch) => {
          const tech = branch.technicianIds || [];
          return (uid && tech.includes(uid)) || (eid && tech.includes(eid));
        })
        .map((branch) => branch.id || '')
        .filter(Boolean);
      setAssignedBranchIds(ids);
    });
  }, [can, userProfile?.id, currentEmployee?.id]);

  useEffect(() => {
    void repairBranchService.list().then(setBranches);
  }, []);

  const { rawJobs, loading, refetch, isFetching } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: canViewAllCallCenter,
    technicianOnly: repairCtx.jobsTechnicianOnly,
    technicianIds,
    fetchEnabled: searchReady,
    searchText: debouncedSearch,
    callCenterGlobal: canViewAllCallCenter,
  });

  const customerJobs = useMemo(
    () => (searchReady ? rawJobs.filter((job) => matchesCallCenterSearch(job, debouncedSearch)) : []),
    [rawJobs, debouncedSearch, searchReady],
  );

  const opsBranchIds = useMemo(() => {
    if (canViewAllCallCenter) return undefined;
    return userBranchIds;
  }, [canViewAllCallCenter, userBranchIds]);

  const loadCustomerOps = useCallback(async () => {
    if (!searchReady) {
      setComplaints([]);
      setReplacements([]);
      setOpsLoading(false);
      return;
    }
    if (!canViewComplaints && !canViewReplacements) {
      setComplaints([]);
      setReplacements([]);
      setOpsLoading(false);
      return;
    }
    if (!canViewAllCallCenter && userBranchIds.length === 0) {
      setComplaints([]);
      setReplacements([]);
      setOpsLoading(false);
      return;
    }

    setOpsLoading(true);
    try {
      const [complaintRows, replacementRows] = await Promise.all([
        canViewComplaints
          ? repairComplaintService.list(opsBranchIds)
          : Promise.resolve([] as RepairComplaint[]),
        canViewReplacements
          ? repairCustomerOperationsService.listReplacements(opsBranchIds)
          : Promise.resolve([] as RepairReplacementRequest[]),
      ]);
      setComplaints(complaintRows);
      setReplacements(replacementRows);
    } catch {
      setComplaints([]);
      setReplacements([]);
    } finally {
      setOpsLoading(false);
    }
  }, [
    searchReady,
    canViewComplaints,
    canViewReplacements,
    canViewAllCallCenter,
    userBranchIds.length,
    opsBranchIds,
  ]);

  useEffect(() => {
    void loadCustomerOps();
  }, [loadCustomerOps, opsTick]);

  const matchedComplaints = useMemo(
    () =>
      searchReady
        ? complaints.filter((row) =>
            matchesCallCenterFields(debouncedSearch, {
              phone: row.customerPhone,
              name: row.customerName,
              receipt: row.receiptNo,
              extra: row.subject,
            }))
        : [],
    [complaints, debouncedSearch, searchReady],
  );

  const matchedReplacements = useMemo(
    () =>
      searchReady
        ? replacements.filter((row) =>
            matchesCallCenterFields(debouncedSearch, {
              phone: row.customerPhone,
              name: row.customerName,
              receipt: row.receiptNo,
              extra: `${row.originalProductName || ''} ${row.replacementProductName || ''}`,
            }))
        : [],
    [replacements, debouncedSearch, searchReady],
  );

  const customerHistory = useMemo(() => {
    const rows: CustomerHistoryRow[] = [
      ...customerJobs.map((job) => ({
        kind: 'job' as const,
        id: `job:${job.id}`,
        sortAt: String(job.createdAt || ''),
        customerName: job.customerName || '—',
        branchId: job.branchId,
        reference: job.receiptNo ? `#${job.receiptNo}` : job.id || '—',
        detail: [job.deviceBrand, job.deviceModel].filter(Boolean).join(' ')
          || job.productName
          || '—',
        job,
      })),
      ...matchedComplaints.map((complaint) => ({
        kind: 'complaint' as const,
        id: `complaint:${complaint.id}`,
        sortAt: String(complaint.createdAt || ''),
        customerName: complaint.customerName || '—',
        branchId: complaint.branchId,
        reference: complaint.receiptNo ? `#${complaint.receiptNo}` : (complaint.id ? `شكوى ${complaint.id.slice(0, 8)}` : 'شكوى'),
        detail: complaint.subject || '—',
        complaint,
      })),
      ...matchedReplacements.map((replacement) => ({
        kind: 'replacement' as const,
        id: `replacement:${replacement.id}`,
        sortAt: String(replacement.createdAt || ''),
        customerName: replacement.customerName || '—',
        branchId: replacement.branchId,
        reference: replacement.receiptNo ? `#${replacement.receiptNo}` : (replacement.id || '—'),
        detail: replacement.originalProductName || '—',
        replacement,
      })),
    ];
    return rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [customerJobs, matchedComplaints, matchedReplacements]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedSearch]);

  const historyTotalPages = Math.max(1, Math.ceil(customerHistory.length / CUSTOMER_HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const pagedHistory = useMemo(
    () =>
      customerHistory.slice(
        (safeHistoryPage - 1) * CUSTOMER_HISTORY_PAGE_SIZE,
        safeHistoryPage * CUSTOMER_HISTORY_PAGE_SIZE,
      ),
    [customerHistory, safeHistoryPage],
  );

  const latestCustomer = customerJobs[0]
    || (matchedComplaints[0]
      ? {
          customerId: matchedComplaints[0].customerId,
          customerName: matchedComplaints[0].customerName,
          customerPhone: matchedComplaints[0].customerPhone,
          customerAddress: undefined as string | undefined,
          branchId: matchedComplaints[0].branchId,
        }
      : null)
    || (matchedReplacements[0]
      ? {
          customerId: matchedReplacements[0].customerId,
          customerName: matchedReplacements[0].customerName,
          customerPhone: matchedReplacements[0].customerPhone,
          customerAddress: undefined as string | undefined,
          branchId: matchedReplacements[0].branchId,
        }
      : null);
  const masterCustomer = useMemo(() => {
    if (crmCustomers[0]) return crmCustomers[0];
    return null;
  }, [crmCustomers]);

  const resolvedPrefillCustomer = useMemo(() => {
    if (masterCustomer?.id) {
      return {
        customerId: String(masterCustomer.id),
        customerName: masterCustomer.name,
        customerPhone: masterCustomer.phone,
        customerAddress: masterCustomer.address || latestCustomer?.customerAddress,
      };
    }
    if (latestCustomer?.customerId) {
      return {
        customerId: latestCustomer.customerId,
        customerName: latestCustomer.customerName,
        customerPhone: latestCustomer.customerPhone,
        customerAddress: latestCustomer.customerAddress,
      };
    }
    return {
      customerId: undefined as string | undefined,
      customerName: latestCustomer?.customerName,
      customerPhone: searchInput.trim() || latestCustomer?.customerPhone,
      customerAddress: latestCustomer?.customerAddress,
    };
  }, [masterCustomer, latestCustomer, searchInput]);

  const devices = useMemo(() => collectDevicesFromJobs(customerJobs), [customerJobs]);
  const branchNameById = useMemo(
    () => Object.fromEntries(branches.map((b) => [String(b.id || ''), b.name])),
    [branches],
  );

  const actorUid = String(userProfile?.id || '').trim();
  const actorName = String(userProfile?.displayName || userProfile?.email || 'مستخدم').trim();

  const openNewTicket = (prefill: RepairCallCenterPrefill) => {
    navigate(withTenantPath(tenantSlug, '/repair/jobs/new'), {
      state: { callCenterPrefill: prefill },
    });
  };

  const openJobDetail = (job: RepairJob) => {
    setSelectedJob(job);
    setDetailOpen(true);
  };

  const openHistoryRow = (row: CustomerHistoryRow) => {
    if (row.kind === 'job' && row.job) {
      openJobDetail(row.job);
      return;
    }
    if (row.kind === 'complaint' && row.complaint?.id) {
      navigate(withTenantPath(tenantSlug, '/repair/complaints'), {
        state: { openComplaintId: row.complaint.id },
      });
      return;
    }
    if (row.kind === 'replacement' && row.replacement?.id) {
      navigate(withTenantPath(tenantSlug, '/repair/replacements'), {
        state: {
          focusReplacementId: row.replacement.id,
          focusReceiptNo: row.replacement.receiptNo,
        },
      });
    }
  };

  const renderHistoryStatus = (row: CustomerHistoryRow) => {
    if (row.kind === 'job' && row.job) {
      return <StatusBadge status={row.job.status} />;
    }
    if (row.kind === 'complaint' && row.complaint) {
      return (
        <ErpStatusBadge
          label={REPAIR_COMPLAINT_STATUS_LABELS[row.complaint.status] || row.complaint.status}
          type={repairComplaintStatusChipType(row.complaint.status)}
        />
      );
    }
    if (row.kind === 'replacement' && row.replacement) {
      return (
        <ErpStatusBadge
          label={REPLACEMENT_STATUS_LABELS[row.replacement.status] || row.replacement.status}
          type={repairReplacementStatusChipType(row.replacement.status)}
        />
      );
    }
    return '—';
  };

  const showCustomerCard = Boolean(masterCustomer || (latestCustomer && searchReady));
  const showDevicesCard = Boolean(searchReady && devices.length > 0);
  const historyLoading = loading || opsLoading;
  const hasHistory = customerHistory.length > 0;

  return (
    <RepairOpsPageShell
      eyebrow="مركز الاتصال"
      dir={dir}
      rangeLabel={canViewAllCallCenter ? 'النطاق: كل فروع الصيانة' : `النطاق: فروعك (${userBranchIds.length || 0})`}
      onRefresh={() => {
        void refetch();
        setOpsTick((tick) => tick + 1);
      }}
      refreshing={historyLoading || isFetching}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
            <Button variant="outline" size="sm">كل الطلبات</Button>
          </Link>
          <Link to={withTenantPath(tenantSlug, '/repair')}>
            <Button variant="outline" size="sm">لوحة الصيانة</Button>
          </Link>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              openNewTicket({
                ...resolvedPrefillCustomer,
                branchId: latestCustomer?.branchId || userBranchIds[0],
              })
            }
            disabled={!can('repair.jobs.create')}
          >
            تسجيل بلاغ صيانة سريع
          </Button>
        </div>
      )}
    >
      <OpsDashPanel title="بحث" accent="repair">
        <p className="mb-3 text-xs text-muted-foreground">
          أدخل رقم الهاتف، رقم الإيصال، أو اسم العميل (3 أحرف على الأقل). يُفلتر محليًا على سجلات الصيانة والشكاوى والاستبدال المحمّلة.
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="مثال: 01001234567 أو REP-1024 أو أحمد"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-lg"
            />
          </div>
        </div>
      </OpsDashPanel>

      {debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          أدخل {MIN_SEARCH_LENGTH} أحرف على الأقل لبدء البحث.
        </div>
      )}

      {searchReady && phoneDigitsForCrm.length >= 7 && !crmLoading && !masterCustomer && !hasHistory && (
        <div className="rounded-md border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] p-4 text-sm text-[rgb(var(--color-warning))]">
          لا يوجد عميل في الماستر ولا سجلات مطابقة. يمكنك تسجيل بلاغ جديد وإنشاء العميل من شاشة الطلب.
        </div>
      )}

      {searchReady && !historyLoading && !hasHistory && masterCustomer && (
        <div className="rounded-md border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)] p-4 text-sm text-[rgb(var(--color-primary))]">
          العميل موجود في الماستر ({masterCustomer.code}) لكن لا توجد سجلات مطابقة ضمن النطاق الحالي.
        </div>
      )}

      {searchReady && !historyLoading && !hasHistory && !masterCustomer && phoneDigitsForCrm.length < 7 && (
        <div className="rounded-md border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] p-4 text-sm text-[rgb(var(--color-warning))]">
          لا توجد سجلات مطابقة ضمن النطاق الحالي. للبحث في ماستر العملاء أدخل 7 أرقام على الأقل من رقم الهاتف.
        </div>
      )}

      {(showCustomerCard || showDevicesCard) && (
        <div
          className={
            showCustomerCard && showDevicesCard
              ? 'grid gap-4 md:grid-cols-2 md:items-start'
              : 'grid gap-4'
          }
        >
          {showCustomerCard ? (
            <OpsDashPanel
              title={masterCustomer ? 'عميل الماستر' : 'بيانات العميل (من آخر طلب)'}
              accent="repair"
              className="h-full"
            >
              {crmLoading ? <p className="mb-2 text-xs text-muted-foreground">جاري مطابقة الماستر…</p> : null}
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                {masterCustomer ? (
                  <>
                    <div>
                      <span className="text-muted-foreground">الكود: </span>
                      <Link
                        className="font-medium text-primary hover:underline"
                        to={withTenantPath(tenantSlug, `/customers/${masterCustomer.id}`)}
                      >
                        {masterCustomer.code}
                      </Link>
                    </div>
                    <div>
                      <span className="text-muted-foreground">النوع: </span>
                      <span className="font-medium">{CUSTOMER_TYPE_LABELS[masterCustomer.type]}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الاسم: </span>
                      <span className="font-medium">{masterCustomer.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الهاتف: </span>
                      <span className="font-mono">{masterCustomer.phone}</span>
                    </div>
                    {masterCustomer.address ? (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">العنوان: </span>
                        {masterCustomer.address}
                      </div>
                    ) : null}
                  </>
                ) : latestCustomer ? (
                  <>
                    <div>
                      <span className="text-muted-foreground">الاسم: </span>
                      <span className="font-medium">{latestCustomer.customerName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الهاتف: </span>
                      <span className="font-mono">{latestCustomer.customerPhone}</span>
                    </div>
                    {latestCustomer.customerAddress ? (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">العنوان: </span>
                        {latestCustomer.customerAddress}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {latestCustomer ? (
                  <div>
                    <span className="text-muted-foreground">الفرع الأخير: </span>
                    {branchNameById[latestCustomer.branchId || ''] || latestCustomer.branchId || '—'}
                  </div>
                ) : null}
              </div>
            </OpsDashPanel>
          ) : null}

          {showDevicesCard ? (
            <OpsDashPanel title="آخر أجهزة اتصلحت له" accent="repair" className="h-full">
              <p className="mb-2 text-xs text-muted-foreground">
                مجمّعة من الطلبات السابقة — اختر جهازًا لنسخه في البلاغ الجديد.
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {devices.slice(0, 12).map((d) => {
                  const productId = d.productId;
                  return (
                    <div
                      key={d.key}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">{d.productName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {[d.deviceBrand, d.deviceModel].filter(Boolean).join(' · ') || '—'}
                          {d.serialNo ? ` · S/N ${d.serialNo}` : ''}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          آخر طلب: {d.lastReceipt ? `#${d.lastReceipt}` : d.lastJobId || '—'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {d.lastJobId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const job = customerJobs.find((j) => j.id === d.lastJobId);
                              if (job) openJobDetail(job);
                            }}
                          >
                            عرض الطلب
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={!can('repair.jobs.create')}
                          onClick={() =>
                            openNewTicket({
                              ...resolvedPrefillCustomer,
                              branchId: latestCustomer?.branchId || userBranchIds[0],
                              productId: productId || undefined,
                            })
                          }
                        >
                          بلاغ بنفس الجهاز
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </OpsDashPanel>
          ) : null}
        </div>
      )}

      <OpsDashPanel
        title="سجل العميل"
        accent="repair"
        bodyClassName="p-0"
        action={isFetching || opsLoading ? <Badge variant="secondary">جاري التحديث…</Badge> : undefined}
      >
        <p className="border-b px-3 py-2 text-xs text-muted-foreground md:px-4">
          {searchReady
            ? `النتائج: ${customerHistory.length} (صيانة ${customerJobs.length} · شكاوى ${matchedComplaints.length} · استبدال ${matchedReplacements.length})`
            : 'أدخل نص البحث لعرض السجلات المطابقة.'}
        </p>
          <div className="erp-mobile-card-list p-2">
            {!searchReady && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                أدخل {MIN_SEARCH_LENGTH} أحرفًا على الأقل في البحث.
              </p>
            )}
            {searchReady && pagedHistory.map((row) => (
              <div
                key={`m-${row.id}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{HISTORY_KIND_LABELS[row.kind]}</Badge>
                      <p className="font-mono text-sm font-semibold">{row.reference}</p>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{row.customerName}</p>
                    <p className="text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  {renderHistoryStatus(row)}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="text-[10px]">الفرع</dt>
                    <dd className="text-[var(--color-text)]">{branchNameById[row.branchId || ''] || row.branchId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px]">التاريخ</dt>
                    <dd className="tabular-nums text-[var(--color-text)]">
                      {row.sortAt ? new Date(row.sortAt).toLocaleString('ar-EG') : '—'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => openHistoryRow(row)}>
                    عرض التفاصيل
                  </Button>
                </div>
              </div>
            ))}
            {searchReady && !hasHistory && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {historyLoading ? 'جاري التحميل…' : 'لا توجد بيانات للعرض.'}
              </p>
            )}
          </div>
          <div className="erp-desktop-table overflow-x-auto rounded border">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">النوع</th>
                  <th className="p-2 text-right">المرجع</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">التفاصيل</th>
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {!searchReady && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                      أدخل {MIN_SEARCH_LENGTH} أحرفًا على الأقل في البحث.
                    </td>
                  </tr>
                )}
                {searchReady && pagedHistory.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">
                      <Badge variant="outline">{HISTORY_KIND_LABELS[row.kind]}</Badge>
                    </td>
                    <td className="p-2 font-mono">{row.reference}</td>
                    <td className="p-2">{row.customerName}</td>
                    <td className="p-2">{renderHistoryStatus(row)}</td>
                    <td className="p-2">{row.detail}</td>
                    <td className="p-2">{branchNameById[row.branchId || ''] || row.branchId || '—'}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {row.sortAt ? new Date(row.sortAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => openHistoryRow(row)}>
                        عرض التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))}
                {searchReady && !hasHistory && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                      {historyLoading ? 'جاري التحميل…' : 'لا توجد بيانات للعرض.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {searchReady && hasHistory ? (
            <DataPaginationFooter
              page={safeHistoryPage}
              totalPages={historyTotalPages}
              totalItems={customerHistory.length}
              onPageChange={setHistoryPage}
              itemLabel="سجل"
            />
          ) : null}
      </OpsDashPanel>

      <RepairCallCenterJobPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={selectedJob}
        branchName={selectedJob ? branchNameById[selectedJob.branchId || ''] : undefined}
        actorUid={actorUid}
        actorName={actorName}
      />
    </RepairOpsPageShell>
  );
};

export default RepairCallCenter;
