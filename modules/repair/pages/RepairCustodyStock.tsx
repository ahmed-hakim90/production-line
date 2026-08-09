import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { defaultTenantSlug, withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import {
  custodyAgeDays,
  formatRepairOpsDateShort,
  openWhatsApp,
  toRepairOpsUserError,
} from '../lib/repairCustomerOpsLabels';
import { repairCustodyAgeChipType } from '../lib/repairSemanticStatus';
import { computeCustomerDeviceBalances } from '../lib/repairCustomerCustody';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { repairBranchService } from '../services/repairBranchService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairCustodyRecord,
} from '../types';

const PAGE_SIZE = 20;

type CustodyRow = RepairCustodyRecord & { remaining: number; ageDays: number };

type CustodyStockType = 'custody' | 'unrepairable';

export const RepairCustodyStock: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const stockTypeParam = String(searchParams.get('stockType') || '').trim();
  const unrepairableMode = stockTypeParam === 'unrepairable';
  const stockType: CustodyStockType = unrepairableMode ? 'unrepairable' : 'custody';
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const canView = can('repair.custody.view') || can('repair.custody.handover');
  const canHandover = can('repair.custody.handover');
  const canReopen = can('repair.custody.correct') || can('repair.jobs.edit');
  const canCreateReplacement = can('repair.replacements.create');
  const canSyncCustody = can('repair.branches.manage');
  const allBranches = can('repair.callCenter.viewAll') || can('repair.adminDashboard.view');

  const [rows, setRows] = useState<RepairCustodyRecord[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState<'all' | '7' | '14'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustodyRow | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [replacementSelected, setReplacementSelected] = useState<CustodyRow | null>(null);
  const [replacementQuantity, setReplacementQuantity] = useState(1);
  const [replacementReason, setReplacementReason] = useState('');
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [reopenSelected, setReopenSelected] = useState<CustodyRow | null>(null);
  const [reopenQuantity, setReopenQuantity] = useState(1);
  const [reopenNote, setReopenNote] = useState('أصبحت قطع الغيار متوفرة');
  const [reopenBusy, setReopenBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      // Branches first: warehouse-bound operators (inventoryWarehouseId without
      // repairBranchIds) must resolve to their center before the custody query.
      const branchRows = await repairBranchService.list();
      setBranches(branchRows);
      const accessibleBranchIds = resolveAccessibleRepairBranchIds({
        user,
        branches: branchRows,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: allBranches,
      });
      if (!allBranches && accessibleBranchIds.length === 0) {
        setRows([]);
        toast.error('الحساب غير مربوط بمركز صيانة أو مخزن مركز. اربط المخزن/المركز من إدارة المستخدم.');
        return;
      }
      const custodyRows = await repairCustomerOperationsService.listCustody(
        allBranches ? [] : accessibleBranchIds,
      );
      setRows(custodyRows);
    } catch (e: unknown) {
      setRows([]);
      toast.error(toRepairOpsUserError(e, 'تعذر تحميل أرصدة العهدة.'));
    } finally {
      setLoading(false);
    }
  }, [allBranches, canView, currentEmployee?.id, user]);

  const syncExistingJobs = async () => {
    setSyncing(true);
    try {
      let cursor = '';
      let custodyJobs = 0;
      let unrepairableJobs = 0;
      for (let batch = 0; batch < 50; batch += 1) {
        const result = await repairCustomerOperationsService.backfillCustomerCustody(cursor);
        custodyJobs += result.custodyJobs;
        unrepairableJobs += result.unrepairableJobs;
        if (!result.truncated || !result.nextCursor || result.nextCursor === cursor) break;
        cursor = result.nextCursor;
      }
      await load();
      toast.success(`تمت مزامنة ${custodyJobs} طلب، منها ${unrepairableJobs} طلب غير قابل للإصلاح.`);
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر مزامنة أرصدة أجهزة العملاء.'));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load, unrepairableMode]);

  useEffect(() => {
    setSearch('');
    setBranchFilter('');
    setAgeFilter('all');
    setPage(1);
    setSelected(null);
  }, [unrepairableMode]);

  const branchName = useCallback(
    (branchId?: string) => branches.find((b) => b.id === branchId)?.name || branchId || '—',
    [branches],
  );

  const visible = useMemo(() => {
    return rows
      .map((row): CustodyRow => {
        const balances = computeCustomerDeviceBalances(row);
        const remaining = unrepairableMode ? balances.unrepairableStock : balances.custody;
        return {
          ...row,
          remaining,
          ageDays: custodyAgeDays(row.createdAt, row.updatedAt),
        };
      })
      .filter((row) => row.remaining > 0);
  }, [rows, unrepairableMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter((row) => {
      if (branchFilter && row.branchId !== branchFilter) return false;
      if (ageFilter === '7' && row.ageDays < 7) return false;
      if (ageFilter === '14' && row.ageDays < 14) return false;
      if (!q) return true;
      const hay = [
        row.productName,
        row.productCode,
        row.productBarcode,
        row.customerName,
        row.receiptNo,
        branchName(row.branchId),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [visible, search, branchFilter, ageFilter, branchName]);

  const totalUnits = filtered.reduce((sum, row) => sum + row.remaining, 0);
  const aging7 = visible.filter((row) => row.ageDays >= 7).length;
  const aging14 = visible.filter((row) => row.ageDays >= 14).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, branchFilter, ageFilter]);

  const openHandover = (row: CustodyRow) => {
    setSelected(row);
    setQuantity(Math.min(Math.max(1, row.remaining), row.remaining));
  };

  const canHandoverRow = (row: CustodyRow) =>
    unrepairableMode || row.jobStatus === 'delivered' || row.jobStatus === 'cancelled';

  const handoverLabel = (row?: CustodyRow | null) => {
    if (unrepairableMode) return 'إرجاع الجهاز للعميل';
    if (row?.jobStatus === 'cancelled') return 'إرجاع الجهاز الملغى';
    return 'تأكيد خروج الجهاز';
  };

  const whatsappMessage = (row: CustodyRow) => {
    const receipt = `\u200E${row.receiptNo}\u200E`;
    const portalUrl = `${window.location.origin}/portal/${tenantSlug || defaultTenantSlug()}`;
    const statusMessage = unrepairableMode
      ? 'بعد الفحص تم تصنيف الجهاز كغير قابل للإصلاح. يرجى التواصل معنا لتحديد الإرجاع أو متابعة طلب الاستبدال.'
      : row.jobStatus === 'cancelled'
        ? 'تم إلغاء طلب الصيانة، والجهاز متاح للاستلام من المركز.'
        : row.jobStatus === 'delivered'
          ? 'تم إنهاء إجراءات الطلب والجهاز جاهز للخروج من المركز.'
          : 'الجهاز ما زال بعهدة مركز الصيانة وجارٍ العمل على الطلب.';
    return [
      `مرحبًا ${row.customerName || ''}`.trim(),
      'تحديث طلب الصيانة',
      `رقم الطلب: ${receipt}`,
      `المنتج: ${row.productName}`,
      `الحالة: ${statusMessage}`,
      `متابعة الطلب: ${portalUrl}`,
    ].join('\n');
  };

  const handover = async () => {
    if (!selected) return;
    if (quantity < 1 || quantity > selected.remaining) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${selected.remaining}.`);
      return;
    }
    setBusy(true);
    try {
      await repairCustomerOperationsService.handover(
        selected.jobId,
        selected.jobProductItemId,
        quantity,
        unrepairableMode ? 'unrepairable' : 'custody',
      );
      toast.success('تم تسجيل التسليم الفعلي وخروج الكمية من المخزن.');
      setSelected(null);
      await load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر تسجيل التسليم.'));
    } finally {
      setBusy(false);
    }
  };

  const openReplacement = (row: CustodyRow) => {
    setReplacementSelected(row);
    setReplacementQuantity(1);
    setReplacementReason('');
  };

  const createReplacement = async () => {
    if (!replacementSelected) return;
    if (replacementQuantity < 1 || replacementQuantity > replacementSelected.remaining) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${replacementSelected.remaining}.`);
      return;
    }
    setReplacementBusy(true);
    try {
      await repairCustomerOperationsService.createReplacement(
        replacementSelected.jobId,
        replacementSelected.jobProductItemId,
        replacementQuantity,
        replacementReason.trim() || undefined,
      );
      toast.success('تم إنشاء طلب الاستبدال وإرساله للاعتماد. الجهاز القديم ما زال في مخزن غير القابل للإصلاح.');
      setReplacementSelected(null);
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر إنشاء طلب الاستبدال.'));
    } finally {
      setReplacementBusy(false);
    }
  };

  const openReopen = (row: CustodyRow) => {
    setReopenSelected(row);
    setReopenQuantity(1);
    setReopenNote('أصبحت قطع الغيار متوفرة');
  };

  const reopenForRepair = async () => {
    if (!reopenSelected) return;
    if (reopenQuantity < 1 || reopenQuantity > reopenSelected.remaining) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${reopenSelected.remaining}.`);
      return;
    }
    if (!reopenNote.trim()) {
      toast.error('اكتب سبب إعادة فتح الطلب.');
      return;
    }
    setReopenBusy(true);
    try {
      await repairCustomerOperationsService.reopenUnrepairable(
        reopenSelected.jobId,
        reopenSelected.jobProductItemId,
        reopenQuantity,
        reopenNote.trim(),
      );
      toast.success('تمت إعادة المنتج إلى عهدة الصيانة وفتح الطلب للعمل عليه من جديد.');
      setReopenSelected(null);
      await load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر إعادة فتح طلب الصيانة.'));
    } finally {
      setReopenBusy(false);
    }
  };

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="عهدة أجهزة العملاء" dir="rtl">
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">
            {unrepairableMode
              ? 'ليس لديك صلاحية عرض مخزن غير القابل للإصلاح.'
              : 'ليس لديك صلاحية عرض عهدة أجهزة العملاء.'}
          </p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow={unrepairableMode ? 'غير القابل للإصلاح' : 'عهدة أجهزة العملاء'}
      dir="rtl"
      hero={[
        { key: 'units', label: 'إجمالي الوحدات', value: totalUnits, onClick: () => setAgeFilter('all'), active: ageFilter === 'all' },
        { key: 'rows', label: 'السجلات الظاهرة', value: filtered.length },
        { key: 'age7', label: 'أقدم من 7 أيام', value: aging7, onClick: () => setAgeFilter('7'), active: ageFilter === '7' },
        { key: 'age14', label: 'أقدم من 14 يومًا', value: aging14, onClick: () => setAgeFilter('14'), active: ageFilter === '14', toneClassName: aging14 > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
      actions={
        canSyncCustody ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void syncExistingJobs()}
            disabled={syncing || loading}
          >
            <RefreshCw className={`ms-1 size-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'جاري المزامنة…' : 'مزامنة الطلبات القديمة'}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="tablist" aria-label="نوع الرصيد">
        <Button
          type="button"
          role="tab"
          className="w-full sm:w-auto"
          aria-selected={stockType === 'custody'}
          variant={stockType === 'custody' ? 'default' : 'outline'}
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('stockType');
            setSearchParams(next, { replace: true });
          }}
        >
          عهدة أجهزة العملاء
        </Button>
        <Button
          type="button"
          role="tab"
          className="w-full sm:w-auto"
          aria-selected={stockType === 'unrepairable'}
          variant={stockType === 'unrepairable' ? 'default' : 'outline'}
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set('stockType', 'unrepairable');
            setSearchParams(next, { replace: true });
          }}
        >
          غير القابل للإصلاح
        </Button>
      </div>

      <OpsDashPanel
        title={unrepairableMode ? 'مخزن غير القابل للإصلاح' : 'أرصدة العهدة'}
        accent="repair"
        bodyClassName="p-0"
      >
        <SmartFilterBar
          pageId={unrepairableMode ? 'repair-unrepairable-stock-list' : 'repair-custody-stock-list'}
          searchPlaceholder="بحث بالمنتج، العميل، رقم الإيصال، المركز..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'branchId',
              label: 'المركز',
              defaultVisible: true,
              options: [
                { value: '', label: 'كل المراكز' },
                ...branches.map((b) => ({ value: b.id || '', label: b.name })),
              ],
            },
            {
              key: 'age',
              label: 'مدة البقاء',
              defaultVisible: true,
              options: [
                { value: 'all', label: 'الكل' },
                { value: '7', label: '7 أيام فأكثر' },
                { value: '14', label: '14 يومًا فأكثر' },
              ],
            },
          ]}
          filterValues={{ branchId: branchFilter, age: ageFilter }}
          onFilterChange={(key, value) => {
            if (key === 'branchId') setBranchFilter(value);
            if (key === 'age') setAgeFilter((value as 'all' | '7' | '14') || 'all');
          }}
          className="mb-0 border-0 rounded-none"
        />

        <div className="erp-table-wrap overflow-x-auto border-t">
          <table className="erp-table w-full min-w-[720px] text-right">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">المنتج</th>
                <th className="erp-th">العميل / الإيصال</th>
                <th className="erp-th">المركز</th>
                <th className="erp-th">الرصيد</th>
                <th className="erp-th">مدة البقاء</th>
                <th className="erp-th">الدخول</th>
                <th className="erp-th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    جاري التحميل...
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    {unrepairableMode ? 'لا توجد أرصدة في مخزن غير القابل للإصلاح.' : 'لا توجد أرصدة عهدة حالية.'}
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-sm">
                      <div className="font-medium">{row.productName}</div>
                      {row.productBarcode || (row.productCode && row.productCode !== row.productId) ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.productBarcode || row.productCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div>{row.customerName || '—'}</div>
                      <Link
                        className="font-mono text-xs text-primary hover:underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${row.jobId}`)}
                      >
                        #{row.receiptNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sm">{branchName(row.branchId)}</td>
                    <td className="px-3 py-2 text-sm tabular-nums font-medium">{row.remaining}</td>
                    <td className="px-3 py-2">
                      <ErpStatusBadge
                        label={`${row.ageDays} يوم`}
                        type={repairCustodyAgeChipType(row.ageDays)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-muted-foreground">
                      {formatRepairOpsDateShort(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {unrepairableMode && canCreateReplacement ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => openReplacement(row)}>
                            طلب استبدال
                          </Button>
                        ) : null}
                        {unrepairableMode && canReopen ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => openReopen(row)}>
                            <RotateCcw className="ms-1 size-3.5" />
                            إعادة فتح للصيانة
                          </Button>
                        ) : null}
                        {canHandover && canHandoverRow(row) ? (
                          <Button type="button" size="sm" onClick={() => openHandover(row)}>
                            {handoverLabel(row)}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openWhatsApp(
                              row.customerPhone,
                              whatsappMessage(row),
                            )
                          }
                        >
                          <MessageCircle className="ms-1 size-3.5" />
                          واتساب
                        </Button>
                      </div>
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
          itemLabel="سجل"
          onPageChange={setPage}
        />
      </OpsDashPanel>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{handoverLabel(selected)}</DialogTitle>
            <DialogDescription>
              سيتم إخراج الكمية فعليًا من {unrepairableMode ? 'مخزن غير القابل للإصلاح' : 'عهدة المركز'} وتسجيل استلام العميل.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{selected?.productName}</div>
              <div className="text-muted-foreground">
                #{selected?.receiptNo} · {selected?.customerName} · المتاح: {selected?.remaining}
              </div>
            </div>
            <div className="space-y-1">
              <Label>الكمية المسلّمة</Label>
              <Input
                type="number"
                min={1}
                max={selected?.remaining || 1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.min(
                      Math.max(1, Number(e.target.value) || 1),
                      Math.max(1, Number(selected?.remaining) || 1),
                    ),
                  )
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={busy}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void handover()} disabled={busy || !canHandover}>
              {busy ? 'جاري التأكيد...' : handoverLabel(selected)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reopenSelected)}
        onOpenChange={(open) => { if (!open && !reopenBusy) setReopenSelected(null); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة فتح طلب الصيانة</DialogTitle>
            <DialogDescription>
              ستعود الكمية من مخزن غير القابل للإصلاح إلى عهدة الصيانة، ويُفتح الطلب للورشة مرة أخرى.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{reopenSelected?.productName}</div>
              <div className="text-muted-foreground">
                #{reopenSelected?.receiptNo} · {reopenSelected?.customerName} · المتاح: {reopenSelected?.remaining}
              </div>
            </div>
            <div className="space-y-1">
              <Label>الكمية العائدة للصيانة</Label>
              <Input
                type="number"
                min={1}
                max={reopenSelected?.remaining || 1}
                value={reopenQuantity}
                onChange={(e) => setReopenQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1">
              <Label>سبب إعادة الفتح</Label>
              <Input
                value={reopenNote}
                onChange={(e) => setReopenNote(e.target.value)}
                placeholder="مثال: أصبحت قطعة الغيار متوفرة"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={reopenBusy} onClick={() => setReopenSelected(null)}>
              إلغاء
            </Button>
            <Button type="button" disabled={reopenBusy || !canReopen} onClick={() => void reopenForRepair()}>
              {reopenBusy ? 'جاري إعادة الفتح…' : 'إعادة إلى العهدة وفتح الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(replacementSelected)}
        onOpenChange={(open) => { if (!open && !replacementBusy) setReplacementSelected(null); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء طلب استبدال</DialogTitle>
            <DialogDescription>
              سيُرسل الطلب للاعتماد، ولن يخرج الجهاز القديم من مخزن غير القابل للإصلاح.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{replacementSelected?.productName}</div>
              <div className="text-muted-foreground">
                #{replacementSelected?.receiptNo} · {replacementSelected?.customerName} · المتاح: {replacementSelected?.remaining}
              </div>
            </div>
            <div className="space-y-1">
              <Label>كمية الاستبدال</Label>
              <Input
                type="number"
                min={1}
                max={replacementSelected?.remaining || 1}
                value={replacementQuantity}
                onChange={(e) => setReplacementQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1">
              <Label>سبب أو ملاحظة الاستبدال (اختياري)</Label>
              <Input
                value={replacementReason}
                onChange={(e) => setReplacementReason(e.target.value)}
                placeholder="مثال: اعتماد استبدال كامل للعميل"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={replacementBusy} onClick={() => setReplacementSelected(null)}>
              إلغاء
            </Button>
            <Button type="button" disabled={replacementBusy || !canCreateReplacement} onClick={() => void createReplacement()}>
              {replacementBusy ? 'جاري الإنشاء…' : 'إنشاء وإرسال للاعتماد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RepairOpsPageShell>
  );
};

export default RepairCustodyStock;
