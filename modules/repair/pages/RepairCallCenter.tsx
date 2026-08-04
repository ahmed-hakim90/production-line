import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { repairBranchService } from '../services/repairBranchService';
import type {
  FirestoreUserWithRepair,
  RepairBranch,
  RepairCallCenterPrefill,
  RepairJob,
  RepairJobProduct,
} from '../types';
import { resolveUserRepairBranchIds } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { resolveRepairAccessContext, resolveRepairTechnicianIds } from '../utils/repairAccessContext';
import { customerPhonesMatch, normalizeCustomerPhoneDigits } from '../utils/customerPhone';
import { StatusBadge } from '../components/StatusBadge';
import { RepairCallCenterJobPanel } from '../components/RepairCallCenterJobPanel';
import { customerService } from '@/modules/customers/services/customerService';
import { CUSTOMER_TYPE_LABELS, type Customer } from '@/modules/customers/types';

const MIN_SEARCH_LENGTH = 3;

function matchesCallCenterSearch(job: RepairJob, query: string): boolean {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return false;
  const qLower = q.toLowerCase();
  const digits = normalizeCustomerPhoneDigits(q);
  if (digits.length >= MIN_SEARCH_LENGTH && customerPhonesMatch(job.customerPhone, q)) return true;
  if (String(job.receiptNo || '').toLowerCase().includes(qLower)) return true;
  if (String(job.customerName || '').toLowerCase().includes(qLower)) return true;
  return false;
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

  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [crmCustomers, setCrmCustomers] = useState<Customer[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<RepairJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
  });

  const customerJobs = useMemo(
    () => (searchReady ? rawJobs.filter((job) => matchesCallCenterSearch(job, debouncedSearch)) : []),
    [rawJobs, debouncedSearch, searchReady],
  );

  const latestCustomer = customerJobs[0];
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

  const showCustomerCard = Boolean(masterCustomer || (latestCustomer && searchReady));
  const showDevicesCard = Boolean(searchReady && devices.length > 0);

  return (
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">مركز الاتصال</h1>
              <p className="text-sm text-muted-foreground mt-1">
                بحث برقم الهاتف أو الإيصال أو اسم العميل — سجل الطلبات، متابعة العملاء، وتسجيل بلاغ جديد.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                النطاق: {canViewAllCallCenter ? 'كل فروع الصيانة' : `فروعك (${userBranchIds.length || 0})`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={withTenantPath(tenantSlug, '/repair/jobs')}>
                <Button variant="outline">كل الطلبات</Button>
              </Link>
              <Link to={withTenantPath(tenantSlug, '/repair')}>
                <Button variant="outline">لوحة الصيانة</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>بحث</CardTitle>
          <CardDescription>
            أدخل رقم الهاتف، رقم الإيصال، أو اسم العميل (3 أحرف على الأقل). يُفلتر محليًا على الطلبات المحمّلة.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="مثال: 01001234567 أو REP-1024 أو أحمد"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-lg"
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void refetch()} disabled={loading || isFetching || !searchReady}>
            تحديث
          </Button>
          <Button
            type="button"
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
        </CardContent>
      </Card>

      {debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          أدخل {MIN_SEARCH_LENGTH} أحرف على الأقل لبدء البحث.
        </div>
      )}

      {searchReady && phoneDigitsForCrm.length >= 7 && !crmLoading && !masterCustomer && customerJobs.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          لا يوجد عميل في الماستر ولا طلبات مطابقة. يمكنك تسجيل بلاغ جديد وإنشاء العميل من شاشة الطلب.
        </div>
      )}

      {searchReady && !loading && customerJobs.length === 0 && masterCustomer && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          العميل موجود في الماستر ({masterCustomer.code}) لكن لا توجد طلبات صيانة مطابقة ضمن النطاق الحالي.
        </div>
      )}

      {searchReady && !loading && customerJobs.length === 0 && !masterCustomer && phoneDigitsForCrm.length < 7 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          لا توجد طلبات مطابقة ضمن النطاق الحالي. للبحث في ماستر العملاء أدخل 7 أرقام على الأقل من رقم الهاتف.
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
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">
                  {masterCustomer ? 'عميل الماستر' : 'بيانات العميل (من آخر طلب)'}
                </CardTitle>
                {crmLoading ? <CardDescription>جاري مطابقة الماستر…</CardDescription> : null}
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
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
              </CardContent>
            </Card>
          ) : null}

          {showDevicesCard ? (
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">آخر أجهزة اتصلحت له</CardTitle>
                <CardDescription>
                  مجمّعة من الطلبات السابقة — اختر جهازًا لنسخه في البلاغ الجديد.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-y-auto">
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
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>طلبات العميل</CardTitle>
            <CardDescription>
              {searchReady
                ? `النتائج: ${customerJobs.length} — إجمالي محمّل: ${rawJobs.length}`
                : 'أدخل نص البحث لعرض الطلبات المطابقة.'}
            </CardDescription>
          </div>
          {isFetching ? <Badge variant="secondary">جاري التحديث…</Badge> : null}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">الإيصال</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الجهاز</th>
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {!searchReady && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                      أدخل {MIN_SEARCH_LENGTH} أحرفًا على الأقل في البحث.
                    </td>
                  </tr>
                )}
                {searchReady && customerJobs.slice(0, 80).map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2 font-mono">#{job.receiptNo}</td>
                    <td className="p-2">{job.customerName}</td>
                    <td className="p-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="p-2">
                      {job.deviceBrand} {job.deviceModel}
                    </td>
                    <td className="p-2">{branchNameById[job.branchId || ''] || job.branchId}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => openJobDetail(job)}>
                        عرض التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))}
                {searchReady && customerJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                      {loading ? 'جاري التحميل…' : 'لا توجد بيانات للعرض.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <RepairCallCenterJobPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={selectedJob}
        branchName={selectedJob ? branchNameById[selectedJob.branchId || ''] : undefined}
        actorUid={actorUid}
        actorName={actorName}
      />
    </div>
  );
};

export default RepairCallCenter;
