import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { CustomerPicker } from '@/modules/customers/components/CustomerPicker';
import { customerService } from '@/modules/customers/services/customerService';
import type { Customer } from '@/modules/customers/types';
import { repairBranchService } from '../services/repairBranchService';
import { repairComplaintService } from '../services/repairComplaintService';
import { repairComplaintStatusChipType } from '../lib/repairSemanticStatus';
import {
  REPAIR_COMPLAINT_STATUS_LABELS,
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairComplaint,
  type RepairComplaintPrefill,
  type RepairComplaintStatus,
} from '../types';
import {
  resolveRepairAccessContext,
  resolveVisibleRepairBranchIdsForUser,
} from '../utils/repairAccessContext';

const PAGE_SIZE = 20;

type LocationState = {
  complaintPrefill?: RepairComplaintPrefill;
  openCreate?: boolean;
};

export const RepairComplaints: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const { can } = usePermission();
  const canView = can('repair.complaints.view');
  const canManage = can('repair.complaints.manage');

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

  const canViewAllBranches = repairCtx.canViewAllBranches || can('repair.callCenter.viewAll');

  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const userBranchIds = useMemo(() => {
    const base = resolveUserRepairBranchIds(userProfile);
    return Array.from(new Set([...base, ...assignedBranchIds]));
  }, [userProfile, assignedBranchIds]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [rows, setRows] = useState<RepairComplaint[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairComplaintStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<RepairComplaint | null>(null);

  const [createForm, setCreateForm] = useState({
    branchId: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    jobId: '',
    receiptNo: '',
    subject: '',
    notes: '',
  });

  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [detailStatus, setDetailStatus] = useState<RepairComplaintStatus>('open');

  const visibleBranches = useMemo(() => {
    if (canViewAllBranches) return branches;
    const allowed = new Set(resolveVisibleRepairBranchIdsForUser(repairCtx, branches.map((b) => b.id || '').filter(Boolean)));
    return branches.filter((b) => b.id && allowed.has(b.id));
  }, [branches, canViewAllBranches, repairCtx]);

  const queryBranchIds = useMemo(() => {
    if (canViewAllBranches) {
      if (branchFilter) return [branchFilter];
      return undefined;
    }
    const allowed = resolveVisibleRepairBranchIdsForUser(
      repairCtx,
      branches.map((b) => b.id || '').filter(Boolean),
    );
    if (branchFilter) {
      return allowed.includes(branchFilter) ? [branchFilter] : [];
    }
    return allowed;
  }, [canViewAllBranches, branchFilter, branches, repairCtx]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [branchRows, complaintRows] = await Promise.all([
        repairBranchService.list(),
        queryBranchIds && queryBranchIds.length === 0
          ? Promise.resolve([])
          : repairComplaintService.list(queryBranchIds),
      ]);
      setBranches(branchRows);
      setRows(complaintRows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'تعذر تحميل الشكاوى.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [canView, queryBranchIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    void customerService.listAll({ includeInactive: false }).then(setCustomers).catch(() => setCustomers([]));
  }, [canManage]);

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

  const applyPrefill = useCallback(
    (prefill: RepairComplaintPrefill) => {
      setCreateForm((prev) => ({
        ...prev,
        branchId: prefill.branchId || prev.branchId || userBranchIds[0] || visibleBranches[0]?.id || '',
        customerId: prefill.customerId || '',
        customerName: prefill.customerName || '',
        customerPhone: prefill.customerPhone || '',
        jobId: prefill.jobId || '',
        receiptNo: prefill.receiptNo || '',
      }));
      setCreateOpen(true);
    },
    [userBranchIds, visibleBranches],
  );

  useEffect(() => {
    const state = (location.state || {}) as LocationState;
    if (state.complaintPrefill) {
      applyPrefill(state.complaintPrefill);
    } else if (state.openCreate) {
      setCreateOpen(true);
    }
    if (state.complaintPrefill || state.openCreate) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state, applyPrefill]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.subject,
        row.customerName,
        row.customerPhone,
        row.receiptNo,
        row.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, branchFilter]);

  const branchName = (branchId?: string) =>
    branches.find((b) => b.id === branchId)?.name || branchId || '—';

  const openDetail = (row: RepairComplaint) => {
    setSelected(row);
    setDetailStatus(row.status);
    setFollowUpNote('');
    setFollowUpAt('');
    setDetailOpen(true);
  };

  const refreshSelected = async (id: string) => {
    const fresh = await repairComplaintService.getById(id);
    if (fresh) {
      setSelected(fresh);
      setDetailStatus(fresh.status);
      setRows((prev) => prev.map((r) => (r.id === id ? fresh : r)));
    }
  };

  const submitCreate = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      const id = await repairComplaintService.create({
        branchId: createForm.branchId,
        customerId: createForm.customerId || undefined,
        customerName: createForm.customerName,
        customerPhone: createForm.customerPhone,
        jobId: createForm.jobId || undefined,
        receiptNo: createForm.receiptNo || undefined,
        subject: createForm.subject,
        notes: createForm.notes || undefined,
        createdByUid: userProfile?.id,
        createdByName: userProfile?.displayName || userProfile?.email,
      });
      toast.success('تم تسجيل الشكوى.');
      setCreateOpen(false);
      setCreateForm({
        branchId: userBranchIds[0] || visibleBranches[0]?.id || '',
        customerId: '',
        customerName: '',
        customerPhone: '',
        jobId: '',
        receiptNo: '',
        subject: '',
        notes: '',
      });
      await load();
      const created = await repairComplaintService.getById(id);
      if (created) openDetail(created);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'تعذر تسجيل الشكوى.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const submitFollowUp = async () => {
    if (!canManage || !selected?.id) return;
    setBusy(true);
    try {
      await repairComplaintService.addFollowUp(selected.id, {
        note: followUpNote,
        followUpAt: followUpAt || undefined,
        actorUid: userProfile?.id || '',
        actorName: userProfile?.displayName || userProfile?.email || 'مستخدم',
      });
      toast.success('تمت إضافة المتابعة.');
      setFollowUpNote('');
      setFollowUpAt('');
      await refreshSelected(selected.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'تعذر إضافة المتابعة.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const submitStatus = async () => {
    if (!canManage || !selected?.id) return;
    setBusy(true);
    try {
      await repairComplaintService.updateStatus(selected.id, detailStatus);
      toast.success('تم تحديث الحالة.');
      await refreshSelected(selected.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'تعذر تحديث الحالة.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض شكاوى الصيانة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6">
      <PageHeader
        title="شكاوى الصيانة"
        subtitle="تسجيل ومتابعة شكاوى العملاء المرتبطة بطلبات الصيانة"
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={() => {
                setCreateForm((prev) => ({
                  ...prev,
                  branchId: prev.branchId || userBranchIds[0] || visibleBranches[0]?.id || '',
                }));
                setCreateOpen(true);
              }}
            >
              تسجيل شكوى
            </Button>
          ) : undefined
        }
      />

      <Card className="!p-4">
        <SmartFilterBar
          pageId="repair-complaints-list"
          searchPlaceholder="بحث بالموضوع، العميل، الهاتف، الإيصال..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'الحالة',
              defaultVisible: true,
              options: [
                { value: '', label: 'الكل' },
                ...(Object.keys(REPAIR_COMPLAINT_STATUS_LABELS) as RepairComplaintStatus[]).map((s) => ({
                  value: s,
                  label: REPAIR_COMPLAINT_STATUS_LABELS[s],
                })),
              ],
            },
            {
              key: 'branchId',
              label: 'الفرع',
              defaultVisible: true,
              options: [
                { value: '', label: 'كل الفروع' },
                ...visibleBranches.map((b) => ({ value: b.id || '', label: b.name })),
              ],
            },
          ]}
          filterValues={{ status: statusFilter, branchId: branchFilter }}
          onFilterChange={(key, value) => {
            if (key === 'status') setStatusFilter(value as RepairComplaintStatus | '');
            if (key === 'branchId') setBranchFilter(value);
          }}
          extra={
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              تحديث
            </Button>
          }
        />

        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="erp-table w-full text-right">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الموضوع</th>
                <th className="erp-th">العميل</th>
                <th className="erp-th">الفرع</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th">الطلب</th>
                <th className="erp-th">التاريخ</th>
                <th className="erp-th">متابعات</th>
                <th className="erp-th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    جاري التحميل...
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    لا توجد شكاوى مطابقة.
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-sm font-medium">{row.subject}</td>
                    <td className="px-3 py-2 text-sm">
                      <div>{row.customerName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">{branchName(row.branchId)}</td>
                    <td className="px-3 py-2">
                      <ErpStatusBadge
                        label={REPAIR_COMPLAINT_STATUS_LABELS[row.status]}
                        type={repairComplaintStatusChipType(row.status)}
                      />
                    </td>
                    <td className="px-3 py-2 text-sm font-mono">
                      {row.receiptNo ? `#${row.receiptNo}` : row.jobId ? 'مرتبط' : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap text-muted-foreground">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString('ar-EG') : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm tabular-nums">{row.followUps?.length || 0}</td>
                    <td className="px-3 py-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => openDetail(row)}>
                        التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          itemLabel="شكوى"
          onPageChange={setPage}
        />
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل شكوى</DialogTitle>
            <DialogDescription>سجّل شكوى عميل مع ربط اختياري بطلب صيانة.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <Select
                value={createForm.branchId}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, branchId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {visibleBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id || ''}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>العميل</Label>
              <CustomerPicker
                customers={customers}
                valueId={createForm.customerId || undefined}
                onSelect={(customer) => {
                  setCreateForm((p) => ({
                    ...p,
                    customerId: customer?.id || '',
                    customerName: customer?.name || p.customerName,
                    customerPhone: customer?.phone || p.customerPhone,
                  }));
                }}
                onCreated={(customer) => {
                  setCustomers((prev) => [customer, ...prev]);
                  setCreateForm((p) => ({
                    ...p,
                    customerId: customer.id || '',
                    customerName: customer.name,
                    customerPhone: customer.phone,
                  }));
                }}
                canCreate={canManage}
                actor={{ userId: userProfile?.id, userName: userProfile?.displayName || userProfile?.email }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>اسم العميل</Label>
                <Input
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm((p) => ({ ...p, customerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>الهاتف</Label>
                <Input
                  value={createForm.customerPhone}
                  onChange={(e) => setCreateForm((p) => ({ ...p, customerPhone: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>موضوع الشكوى</Label>
              <Input
                value={createForm.subject}
                onChange={(e) => setCreateForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>رقم الإيصال (اختياري)</Label>
                <Input
                  value={createForm.receiptNo}
                  onChange={(e) => setCreateForm((p) => ({ ...p, receiptNo: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>معرّف الطلب (اختياري)</Label>
                <Input
                  value={createForm.jobId}
                  onChange={(e) => setCreateForm((p) => ({ ...p, jobId: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.notes}
                onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void submitCreate()} disabled={busy}>
              {busy ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.subject || 'تفاصيل الشكوى'}</DialogTitle>
            <DialogDescription>
              {selected?.customerName} — {selected?.customerPhone}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">الفرع: </span>
                  {branchName(selected.branchId)}
                </div>
                <div>
                  <span className="text-muted-foreground">الحالة: </span>
                  <ErpStatusBadge
                    label={REPAIR_COMPLAINT_STATUS_LABELS[selected.status]}
                    type={repairComplaintStatusChipType(selected.status)}
                  />
                </div>
                {selected.receiptNo || selected.jobId ? (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                    {selected.receiptNo ? (
                      <span className="font-mono text-sm">إيصال #{selected.receiptNo}</span>
                    ) : null}
                    {selected.jobId ? (
                      <Link
                        className="text-primary text-sm underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${selected.jobId}`)}
                      >
                        فتح طلب الصيانة
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {selected.notes ? (
                  <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
                    {selected.notes}
                  </div>
                ) : null}
              </div>

              {canManage ? (
                <div className="rounded-lg border p-3 space-y-2">
                  <Label>تحديث الحالة</Label>
                  <div className="flex flex-wrap gap-2">
                    <Select value={detailStatus} onValueChange={(v) => setDetailStatus(v as RepairComplaintStatus)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(REPAIR_COMPLAINT_STATUS_LABELS) as RepairComplaintStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {REPAIR_COMPLAINT_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy || detailStatus === selected.status}
                      onClick={() => void submitStatus()}
                    >
                      حفظ الحالة
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">سجل المتابعات</h3>
                {(selected.followUps || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد متابعات بعد.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {[...(selected.followUps || [])]
                      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
                      .map((fu) => (
                        <div key={fu.id} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{fu.actorName}</span>
                            <span>{fu.at ? new Date(fu.at).toLocaleString('ar-EG') : '—'}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{fu.note}</p>
                          {fu.followUpAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              موعد متابعة: {new Date(fu.followUpAt).toLocaleString('ar-EG')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {canManage ? (
                <div className="rounded-lg border p-3 space-y-2">
                  <Label>إضافة متابعة</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    rows={3}
                    placeholder="ملاحظة المتابعة..."
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">موعد متابعة (اختياري)</Label>
                    <Input
                      type="datetime-local"
                      value={followUpAt}
                      onChange={(e) => setFollowUpAt(e.target.value)}
                    />
                  </div>
                  <Button type="button" size="sm" disabled={busy || !followUpNote.trim()} onClick={() => void submitFollowUp()}>
                    {busy ? 'جاري الحفظ...' : 'إضافة متابعة'}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairComplaints;
