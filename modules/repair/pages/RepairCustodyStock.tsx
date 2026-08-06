import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { withTenantPath } from '@/lib/tenantPaths';
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
import { repairBranchService } from '../services/repairBranchService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairCustodyRecord,
} from '../types';

const PAGE_SIZE = 20;

type CustodyRow = RepairCustodyRecord & { remaining: number; ageDays: number };

export const RepairCustodyStock: React.FC = () => {
  const location = useLocation();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const unrepairableMode = location.pathname.includes('unrepairable-stock');
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const canView =
    can('repair.custody.view')
    || can('repair.custody.record')
    || can('repair.custody.handover');
  const canHandover = can('repair.custody.handover');
  const allBranches = can('repair.callCenter.viewAll') || can('repair.adminDashboard.view');
  const branchIds = useMemo(
    () => (allBranches ? [] : resolveUserRepairBranchIds(user)),
    [allBranches, user],
  );

  const [rows, setRows] = useState<RepairCustodyRecord[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState<'all' | '7' | '14'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustodyRow | null>(null);
  const [quantity, setQuantity] = useState(1);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [custodyRows, branchRows] = await Promise.all([
        repairCustomerOperationsService.listCustody(branchIds),
        repairBranchService.list(),
      ]);
      setRows(custodyRows);
      setBranches(branchRows);
    } catch (e: unknown) {
      setRows([]);
      toast.error(toRepairOpsUserError(e, 'تعذر تحميل أرصدة العهدة.'));
    } finally {
      setLoading(false);
    }
  }, [branchIds, canView]);

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

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir="rtl">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {unrepairableMode
                ? 'ليس لديك صلاحية عرض مخزن غير القابل للإصلاح.'
                : 'ليس لديك صلاحية عرض عهدة أجهزة العملاء.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir="rtl">
      <PageHeader
        title={unrepairableMode ? 'مخزن غير القابل للإصلاح' : 'عهدة أجهزة العملاء'}
        subtitle={
          unrepairableMode
            ? 'الأجهزة المنقولة من العهدة بعد قرار عدم قابلية الإصلاح — التسليم يخرج الكمية من المخزن'
            : 'الأجهزة المستلمة فعليًا وما زالت داخل مراكز الصيانة — التسليم يخرج الكمية من العهدة'
        }
        icon="warehouse"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              asChild
            >
              <Link
                to={withTenantPath(
                  tenantSlug,
                  unrepairableMode ? '/repair/custody-stock' : '/repair/unrepairable-stock',
                )}
              >
                {unrepairableMode ? 'عرض العهدة' : 'عرض غير القابل للإصلاح'}
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="ms-1 size-4" />
              تحديث
            </Button>
          </div>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 text-right transition-colors ${
            ageFilter === 'all' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'
          }`}
          onClick={() => setAgeFilter('all')}
        >
          <div className="text-xs text-muted-foreground">إجمالي الوحدات</div>
          <div className="text-lg font-semibold tabular-nums">{totalUnits}</div>
        </button>
        <button
          type="button"
          className="rounded-lg border bg-card px-3 py-2 text-right"
          onClick={() => setAgeFilter('all')}
        >
          <div className="text-xs text-muted-foreground">السجلات الظاهرة</div>
          <div className="text-lg font-semibold tabular-nums">{filtered.length}</div>
        </button>
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 text-right transition-colors ${
            ageFilter === '7' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'
          }`}
          onClick={() => setAgeFilter('7')}
        >
          <div className="text-xs text-muted-foreground">أقدم من 7 أيام</div>
          <div className="text-lg font-semibold tabular-nums">{aging7}</div>
        </button>
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 text-right transition-colors ${
            ageFilter === '14' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'
          }`}
          onClick={() => setAgeFilter('14')}
        >
          <div className="text-xs text-muted-foreground">أقدم من 14 يومًا</div>
          <div className="text-lg font-semibold tabular-nums">{aging14}</div>
        </button>
      </div>

      <Card className="!p-4">
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
        />

        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="erp-table w-full text-right">
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
                      {row.productCode ? (
                        <div className="font-mono text-xs text-muted-foreground">{row.productCode}</div>
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
                        {canHandover ? (
                          <Button type="button" size="sm" onClick={() => openHandover(row)}>
                            تسليم فعلي
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openWhatsApp(
                              undefined,
                              `المنتج ${row.productName} الخاص بطلب ${row.receiptNo} جاهز للمتابعة.`,
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
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد التسليم الفعلي</DialogTitle>
            <DialogDescription>
              سيتم إخراج الكمية من {unrepairableMode ? 'مخزن غير القابل للإصلاح' : 'عهدة المركز'} فقط بعد هذا التأكيد.
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
              {busy ? 'جاري التأكيد...' : 'تأكيد التسليم والخروج'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairCustodyStock;
