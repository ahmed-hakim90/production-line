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
import { normalizeCustomerPhoneDigits } from '../utils/customerPhone';
import { StatusBadge } from '../components/StatusBadge';

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

  const [phoneInput, setPhoneInput] = useState('');
  const [debouncedPhone, setDebouncedPhone] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedPhone(phoneInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [phoneInput]);

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

  const { jobs, rawJobs, loading, refetch, isFetching } = useRepairJobs({
    branchId: userBranchIds[0],
    branchIds: userBranchIds,
    canViewAllBranches: repairCtx.canViewAllBranches,
    technicianOnly: repairCtx.jobsTechnicianOnly,
    technicianIds,
    phoneDigitsFilter: debouncedPhone,
    minPhoneDigitsForQuery: 3,
  });

  const customerJobs = jobs;
  const phoneDigitsCount = normalizeCustomerPhoneDigits(debouncedPhone).length;
  const hasPhoneQuery = phoneDigitsCount >= 3;
  const latestCustomer = customerJobs[0];
  const devices = useMemo(() => collectDevicesFromJobs(customerJobs), [customerJobs]);

  const openNewTicket = (prefill: RepairCallCenterPrefill) => {
    navigate(withTenantPath(tenantSlug, '/repair/jobs/new'), {
      state: { callCenterPrefill: prefill },
    });
  };

  return (
    <div className="space-y-4" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">مركز الاتصال</h1>
              <p className="text-sm text-muted-foreground mt-1">
                بحث سريع برقم الموبايل، سجل الطلبات، وآخر الأجهزة التي تم صيانتها — ثم فتح بلاغ جديد بنفس البيانات.
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
          <CardTitle>بحث بالرقم</CardTitle>
          <CardDescription>أدخل رقم الهاتف (كامل أو آخر 7–11 رقم). يتم المطابقة مع الطلبات ضمن فروعك.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="مثال: 01001234567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="text-lg font-mono"
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void refetch()} disabled={loading || isFetching}>
            تحديث
          </Button>
          <Button
            type="button"
            onClick={() =>
              openNewTicket({
                customerPhone: phoneInput.trim() || latestCustomer?.customerPhone,
                customerName: latestCustomer?.customerName,
                customerAddress: latestCustomer?.customerAddress,
                branchId: latestCustomer?.branchId || userBranchIds[0],
              })
            }
            disabled={!can('repair.jobs.create')}
          >
            تسجيل بلاغ صيانة سريع
          </Button>
        </CardContent>
      </Card>

      {phoneDigitsCount > 0 && phoneDigitsCount < 3 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          أدخل 3 أرقام على الأقل لبدء البحث وتفادي الاستعلامات الواسعة.
        </div>
      )}

      {hasPhoneQuery && !loading && customerJobs.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          لا توجد طلبات مطابقة لهذا الرقم ضمن النطاق الحالي. يمكنك تسجيل بلاغ جديد للعميل.
        </div>
      )}

      {latestCustomer && hasPhoneQuery && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">بيانات العميل (من آخر طلب)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
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
            <div>
              <span className="text-muted-foreground">الفرع الأخير: </span>
              {branches.find((b) => b.id === latestCustomer.branchId)?.name || latestCustomer.branchId || '—'}
            </div>
          </CardContent>
        </Card>
      )}

      {hasPhoneQuery && devices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>آخر أجهزة اتصلحت له</CardTitle>
            <CardDescription>مجمّعة من الطلبات السابقة — اختر جهازًا لنسخه في البلاغ الجديد.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
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
                      <Link to={withTenantPath(tenantSlug, `/repair/jobs/${d.lastJobId}`)}>
                        <Button size="sm" variant="outline">
                          فتح الطلب
                        </Button>
                      </Link>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={!can('repair.jobs.create')}
                      onClick={() =>
                        openNewTicket({
                          customerName: latestCustomer?.customerName,
                          customerPhone: latestCustomer?.customerPhone || phoneInput.trim(),
                          customerAddress: latestCustomer?.customerAddress,
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
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>طلبات العميل</CardTitle>
            <CardDescription>
              {hasPhoneQuery
                ? `النتائج: ${customerJobs.length} — إجمالي محمّل للفروع: ${rawJobs.length}`
                : 'أدخل رقمًا لعرض طلبات ذلك العميل فقط.'}
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
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">الجهاز</th>
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {!hasPhoneQuery && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      أدخل 3 أرقامًا على الأقل في البحث لعرض طلبات العميل.
                    </td>
                  </tr>
                )}
                {hasPhoneQuery && customerJobs.slice(0, 80).map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2 font-mono">#{job.receiptNo}</td>
                    <td className="p-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="p-2">
                      {job.deviceBrand} {job.deviceModel}
                    </td>
                    <td className="p-2">{branches.find((b) => b.id === job.branchId)?.name || job.branchId}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                          <Button size="sm" variant="outline">
                            التفاصيل
                          </Button>
                        </Link>
                        <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}/workspace`)}>
                          <Button size="sm" variant="secondary">
                            الورشة
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {hasPhoneQuery && customerJobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      {loading ? 'جاري التحميل…' : 'لا توجد بيانات للعرض.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            لتحويل البلاغ لفني أو فرع آخر: افتح «التفاصيل» وعدّل الإسناد أو الفرع من شاشة الطلب (حسب صلاحياتك).
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairCallCenter;
