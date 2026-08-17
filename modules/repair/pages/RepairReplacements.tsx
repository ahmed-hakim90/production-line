import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
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
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { buildCodeVoucherPicker } from '@/modules/inventory/lib/materialVoucherPicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { ListViewToggle, useListViewMode } from '@/src/components/erp/ListViewToggle';
import { StatusKanbanBoard } from '@/src/components/erp/StatusKanbanBoard';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { productService } from '@/modules/production/services/productService';
import type { FirestoreProduct } from '@/types';
import {
  REPLACEMENT_STATUS_LABELS,
  formatRepairOpsDate,
  openWhatsApp,
  toRepairOpsUserError,
} from '../lib/repairCustomerOpsLabels';
import { repairReplacementStatusChipType, semanticStatusAccent } from '../lib/repairSemanticStatus';
import { repairBranchService } from '../services/repairBranchService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairReplacementRequest,
  type RepairReplacementStatus,
} from '../types';

const PAGE_SIZE = 20;

type NoteAction = 'rejectReplacement' | 'cancelReplacement' | 'deliverReplacement';

type LocationState = {
  focusReplacementId?: string;
  focusReceiptNo?: string;
};

export const RepairReplacements: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const canView =
    can('repair.replacements.view')
    || can('repair.replacements.create')
    || can('repair.replacements.approve')
    || can('repair.replacements.deliver');
  const canApprove = can('repair.replacements.approve');
  const canDeliver = can('repair.replacements.deliver');
  const allBranches = can('repair.callCenter.viewAll') || canApprove;
  const branchIds = useMemo(
    () => (allBranches ? [] : resolveUserRepairBranchIds(user)),
    [allBranches, user],
  );

  const [rows, setRows] = useState<RepairReplacementRequest[]>([]);
  const [products, setProducts] = useState<FirestoreProduct[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairReplacementStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [boardView, setBoardView] = useListViewMode('repair-replacements', 'kanban');

  const replacementKanbanColumns = useMemo(
    () =>
      (Object.keys(REPLACEMENT_STATUS_LABELS) as RepairReplacementStatus[]).map((status) => ({
        id: status,
        label: REPLACEMENT_STATUS_LABELS[status],
        accentColor: semanticStatusAccent(repairReplacementStatusChipType(status)),
      })),
    [],
  );

  const [selected, setSelected] = useState<RepairReplacementRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const [noteAction, setNoteAction] = useState<{ action: NoteAction; row: RepairReplacementRequest } | null>(null);
  const [actionNote, setActionNote] = useState('');

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [replacementRows, productRows, branchRows] = await Promise.all([
        repairCustomerOperationsService.listReplacements(branchIds),
        productService.getAll(),
        repairBranchService.list(),
      ]);
      setRows(replacementRows);
      setProducts(productRows);
      setBranches(branchRows);
    } catch (e: unknown) {
      setRows([]);
      toast.error(toRepairOpsUserError(e, 'تعذر تحميل طلبات الاستبدال.'));
    } finally {
      setLoading(false);
    }
  }, [branchIds, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const state = (location.state || {}) as LocationState;
    const focusId = String(state.focusReplacementId || '').trim();
    const focusReceipt = String(state.focusReceiptNo || '').trim();
    if (!focusId && !focusReceipt) return;
    if (focusReceipt) setSearch(focusReceipt);
    setBoardView('table');
    if (focusId && rows.length > 0) {
      const found = rows.find((row) => row.id === focusId);
      if (found?.receiptNo) setSearch(found.receiptNo);
    }
    window.history.replaceState({}, document.title);
  }, [location.state, rows, setBoardView]);

  const branchName = useCallback(
    (branchId?: string) => branches.find((b) => b.id === branchId)?.name || branchId || '—',
    [branches],
  );

  const counts = useMemo(
    () =>
      rows.reduce<Record<string, number>>(
        (acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }),
        {},
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (branchFilter && row.branchId !== branchFilter) return false;
      if (!q) return true;
      const hay = [
        row.receiptNo,
        row.customerName,
        row.customerPhone,
        row.originalProductName,
        row.replacementProductName,
        row.replacementProductCode,
        row.reason,
        row.createdByName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, branchFilter]);

  const productPicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        products
          .filter((product) => product.id)
          .map((product) => ({
            value: String(product.id),
            label: `${product.name} (${product.code})`,
            name: product.name,
            code: product.code,
            barcode: product.barcode,
            stockItemType: 'finished_good' as const,
          })),
      ),
    [products],
  );

  const openApprove = (row: RepairReplacementRequest) => {
    setSelected(row);
    setQuantity(Math.max(1, Number(row.requestedQuantity) || 1));
    setProductId('');
    setNote('');
    setApproveOpen(true);
  };

  const openNoteAction = (action: NoteAction, row: RepairReplacementRequest) => {
    setNoteAction({ action, row });
    setActionNote('');
  };

  const approve = async () => {
    if (!selected?.id || !productId) return;
    const maxQty = Math.max(1, Number(selected.requestedQuantity) || 1);
    if (quantity < 1 || quantity > maxQty) {
      toast.error(`الكمية يجب أن تكون بين 1 و ${maxQty}.`);
      return;
    }
    setBusy(true);
    try {
      await repairCustomerOperationsService.approveReplacement(selected.id, productId, quantity, note);
      toast.success('تم اعتماد طلب الاستبدال.');
      setApproveOpen(false);
      setSelected(null);
      void load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر اعتماد الاستبدال.'));
    } finally {
      setBusy(false);
    }
  };

  const runNoteAction = async () => {
    if (!noteAction?.row.id) return;
    setBusy(true);
    try {
      await repairCustomerOperationsService.updateReplacement(
        noteAction.action,
        noteAction.row.id,
        actionNote,
      );
      const messages: Record<NoteAction, string> = {
        rejectReplacement: 'تم رفض طلب الاستبدال.',
        cancelReplacement: 'تم إلغاء طلب الاستبدال.',
        deliverReplacement: 'تم تأكيد تسليم البديل.',
      };
      toast.success(messages[noteAction.action]);
      setNoteAction(null);
      void load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر تحديث الاستبدال.'));
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="طلبات الاستبدال" dir="rtl">
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض طلبات الاستبدال.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow="طلبات الاستبدال"
      dir="rtl"
      hero={[
        { key: 'pending_approval', label: 'بانتظار الاعتماد', value: counts.pending_approval || 0, onClick: () => setStatusFilter('pending_approval'), active: statusFilter === 'pending_approval' },
        { key: 'approved', label: 'معتمد', value: counts.approved || 0, onClick: () => setStatusFilter('approved'), active: statusFilter === 'approved' },
        { key: 'delivered', label: 'تم التسليم', value: counts.delivered || 0, onClick: () => setStatusFilter('delivered'), active: statusFilter === 'delivered' },
        { key: 'all', label: 'الإجمالي', value: rows.length, onClick: () => setStatusFilter(''), active: statusFilter === '' },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
      actions={<ListViewToggle value={boardView} onChange={setBoardView} />}
    >
      <OpsDashPanel title="قائمة الاستبدالات" accent="repair" bodyClassName="p-0">
        <SmartFilterBar
          pageId="repair-replacements-list"
          searchPlaceholder="بحث بالإيصال، العميل، المنتج، السبب..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'الحالة',
              defaultVisible: true,
              options: [
                { value: '', label: 'الكل' },
                ...(Object.keys(REPLACEMENT_STATUS_LABELS) as RepairReplacementStatus[]).map((s) => ({
                  value: s,
                  label: REPLACEMENT_STATUS_LABELS[s],
                })),
              ],
            },
            {
              key: 'branchId',
              label: 'المركز',
              defaultVisible: true,
              options: [
                { value: '', label: 'كل المراكز' },
                ...branches.map((b) => ({ value: b.id || '', label: b.name })),
              ],
            },
          ]}
          filterValues={{ status: statusFilter, branchId: branchFilter }}
          onFilterChange={(key, value) => {
            if (key === 'status') setStatusFilter(value as RepairReplacementStatus | '');
            if (key === 'branchId') setBranchFilter(value);
          }}
          className="mb-0 border-0 rounded-none"
        />

        <div className="p-3 md:p-4">
          {boardView === 'kanban' ? (
            <StatusKanbanBoard
              columns={replacementKanbanColumns}
              items={filtered
                .filter((row) => Boolean(row.id))
                .map((row) => ({ ...row, id: String(row.id) }))}
              loading={loading}
              emptyColumnLabel="لا طلبات"
              renderCard={(row) => (
                <>
                  <Link
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    to={withTenantPath(tenantSlug, `/repair/jobs/${row.jobId}`)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{row.receiptNo}
                  </Link>
                  <div className="mt-1.5 truncate text-sm font-medium">{row.customerName}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">
                    {row.originalProductName}
                    {row.replacementProductName ? ` → ${row.replacementProductName}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{branchName(row.branchId)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.status === 'pending_approval' && canApprove ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openApprove(row);
                        }}
                      >
                        اعتماد
                      </Button>
                    ) : null}
                    {row.status === 'approved' && canDeliver ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openNoteAction('deliverReplacement', row);
                        }}
                      >
                        تسليم
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            />
          ) : (
            <>
              <div className="erp-table-wrap -mx-1 overflow-x-auto rounded-lg border sm:mx-0">
                <table className="erp-table w-full min-w-[720px] text-right">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الإيصال</th>
                <th className="erp-th">العميل</th>
                <th className="erp-th">الجهاز القديم</th>
                <th className="erp-th">البديل</th>
                <th className="erp-th">المركز</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th">التاريخ</th>
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
                    لا توجد طلبات استبدال مطابقة.
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-sm">
                      <Link
                        className="font-mono font-medium text-primary hover:underline"
                        to={withTenantPath(tenantSlug, `/repair/jobs/${row.jobId}`)}
                      >
                        #{row.receiptNo}
                      </Link>
                      {row.reason ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.reason}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div>{row.customerName}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div>{row.originalProductName}</div>
                      <div className="tabular-nums text-xs text-muted-foreground">×{row.requestedQuantity}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {row.replacementProductName ? (
                        <>
                          <div>{row.replacementProductName}</div>
                          <div className="tabular-nums text-xs text-muted-foreground">
                            ×{row.approvedQuantity || 0}
                            {row.replacementProductCode ? ` · ${row.replacementProductCode}` : ''}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">{branchName(row.branchId)}</td>
                    <td className="px-3 py-2">
                      <ErpStatusBadge
                        label={REPLACEMENT_STATUS_LABELS[row.status] || row.status}
                        type={repairReplacementStatusChipType(row.status)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-muted-foreground">
                      {formatRepairOpsDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'pending_approval' && canApprove ? (
                          <>
                            <Button type="button" size="sm" onClick={() => openApprove(row)}>
                              اعتماد
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => openNoteAction('rejectReplacement', row)}
                            >
                              رفض
                            </Button>
                          </>
                        ) : null}
                        {row.status === 'approved' && canDeliver ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openNoteAction('deliverReplacement', row)}
                          >
                            تسليم البديل
                          </Button>
                        ) : null}
                        {(row.status === 'pending_approval' || row.status === 'approved') && canApprove ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openNoteAction('cancelReplacement', row)}
                          >
                            إلغاء
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openWhatsApp(
                              row.customerPhone,
                              `تحديث طلب الاستبدال المرتبط بطلب الصيانة ${row.receiptNo}: ${REPLACEMENT_STATUS_LABELS[row.status] || row.status}`,
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
          itemLabel="طلب"
          onPageChange={setPage}
        />
            </>
          )}
        </div>
      </OpsDashPanel>

      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          setApproveOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>اعتماد الاستبدال</DialogTitle>
            <DialogDescription>
              اختر المنتج البديل. لن يُحجز أو يُخصم من المخزون، ويبقى الجهاز القديم في مخزن غير القابل للإصلاح.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">#{selected?.receiptNo} · {selected?.customerName}</div>
              <div className="text-muted-foreground">
                القديم: {selected?.originalProductName} ×{selected?.requestedQuantity}
              </div>
            </div>
            <div className="space-y-1">
              <Label>المنتج الجديد البديل</Label>
              <VoucherItemCombobox
                options={productPicker.options}
                catalog={productPicker.catalog}
                value={productId}
                onChange={setProductId}
                placeholder="ابحث بالاسم أو امسح الباركود"
              />
            </div>
            <div className="space-y-1">
              <Label>الكمية</Label>
              <Input
                type="number"
                min={1}
                max={selected?.requestedQuantity || 1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.min(
                      Math.max(1, Number(e.target.value) || 1),
                      Math.max(1, Number(selected?.requestedQuantity) || 1),
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label>ملاحظة الاعتماد</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void approve()} disabled={!productId || busy}>
              {busy ? 'جاري الاعتماد...' : 'اعتماد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(noteAction)} onOpenChange={(open) => { if (!open) setNoteAction(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {noteAction?.action === 'rejectReplacement'
                ? 'رفض طلب الاستبدال'
                : noteAction?.action === 'cancelReplacement'
                  ? 'إلغاء طلب الاستبدال'
                  : 'تأكيد تسليم البديل'}
            </DialogTitle>
            <DialogDescription>
              {noteAction?.action === 'deliverReplacement'
                ? 'أكد تسليم البديل للعميل. هذه الخطوة لا تخصم من مخزون المنتج الجديد.'
                : 'أدخل ملاحظة اختيارية قبل المتابعة.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>ملاحظة</Label>
            <Input
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteAction(null)} disabled={busy}>
              رجوع
            </Button>
            <Button
              type="button"
              variant={noteAction?.action === 'rejectReplacement' ? 'destructive' : 'default'}
              onClick={() => void runNoteAction()}
              disabled={busy}
            >
              {busy ? 'جاري التنفيذ...' : 'تأكيد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RepairOpsPageShell>
  );
};

export default RepairReplacements;
