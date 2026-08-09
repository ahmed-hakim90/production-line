import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import {
  CUSTOMER_REQUEST_STATUS_LABELS,
  formatRepairOpsDate,
  openWhatsApp,
  toRepairOpsUserError,
} from '../lib/repairCustomerOpsLabels';
import { repairCustomerRequestStatusChipType } from '../lib/repairSemanticStatus';
import { repairBranchService } from '../services/repairBranchService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';
import type {
  CustomerServiceRequest,
  CustomerServiceRequestStatus,
  FirestoreUserWithRepair,
  RepairBranch,
} from '../types';
import { resolveUserRepairBranchIds } from '../types';

const PAGE_SIZE = 20;

type ReceiveLine = { lineId: string; receivedQuantity: number; differenceNote: string };

export const RepairCustomerRequests: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const canView =
    can('repair.customerRequests.view')
    || can('repair.customerRequests.assign')
    || can('repair.customerRequests.receive');
  const canAssign = can('repair.customerRequests.assign') || can('repair.callCenter.viewAll');
  const canReceive = can('repair.customerRequests.receive');
  const branchIds = useMemo(
    () => (canAssign ? [] : resolveUserRepairBranchIds(user)),
    [canAssign, user],
  );

  const [rows, setRows] = useState<CustomerServiceRequest[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerServiceRequestStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<CustomerServiceRequest | null>(null);
  const [assignBranchId, setAssignBranchId] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [requests, branchRows] = await Promise.all([
        repairCustomerOperationsService.listCustomerRequests(branchIds),
        repairBranchService.list(),
      ]);
      setRows(requests);
      setBranches(branchRows);
    } catch (e: unknown) {
      setRows([]);
      toast.error(toRepairOpsUserError(e, 'تعذر تحميل طلبات العملاء.'));
    } finally {
      setLoading(false);
    }
  }, [branchIds, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      submitted: rows.filter((r) => r.status === 'submitted').length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      converted: rows.filter((r) => r.status === 'converted').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (branchFilter && row.branchId !== branchFilter) return false;
      if (!q) return true;
      const hay = [
        row.requestNo,
        row.customerName,
        row.customerPhone,
        row.customerCode,
        row.branchName,
        row.convertedReceiptNo,
        ...(row.lines || []).map((line) => `${line.productName} ${line.productCode} ${line.barcode}`),
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

  const openAssign = (request: CustomerServiceRequest) => {
    setSelected(request);
    setAssignBranchId(request.branchId || '');
    setAssignOpen(true);
  };

  const openReceive = (request: CustomerServiceRequest) => {
    setSelected(request);
    setReceiveLines(
      request.lines.map((line) => ({
        lineId: line.lineId,
        receivedQuantity: line.requestedQuantity,
        differenceNote: '',
      })),
    );
    setReceiveOpen(true);
  };

  const assign = async () => {
    if (!selected?.id || !assignBranchId) return;
    setBusy(true);
    try {
      await repairCustomerOperationsService.assignRequest(selected.id, assignBranchId);
      toast.success('تم توزيع الطلب على المركز.');
      setAssignOpen(false);
      setSelected(null);
      setAssignBranchId('');
      await load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر توزيع الطلب.'));
    } finally {
      setBusy(false);
    }
  };

  const receive = async () => {
    if (!selected?.id) return;
    const hasQty = receiveLines.some((line) => line.receivedQuantity > 0);
    if (!hasQty) {
      toast.error('أدخل كمية مستلمة واحدةحدة على الأقل.');
      return;
    }
    const needsNote = receiveLines.some((line) => {
      const original = selected.lines.find((l) => l.lineId === line.lineId);
      return original && line.receivedQuantity !== original.requestedQuantity && !line.differenceNote.trim();
    });
    if (needsNote) {
      toast.error('أدخل سبب الاختلاف عند تغيير الكمية.');
      return;
    }
    setBusy(true);
    try {
      const result = await repairCustomerOperationsService.receiveRequest(selected.id, receiveLines);
      toast.success(`تم الاستلام وإنشاء طلب الصيانة ${result.receiptNo}.`);
      setReceiveOpen(false);
      setSelected(null);
      await load();
    } catch (e: unknown) {
      toast.error(toRepairOpsUserError(e, 'تعذر تأكيد الاستلام.'));
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-5" dir="rtl">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض طلبات العملاء.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 px-1 sm:space-y-5 sm:px-0" dir="rtl">
      <PageHeader
        title="طلبات العملاء"
        subtitle="طلبات بوابة العميل قبل توزيعها واستلامها في مراكز الصيانة"
        icon="assignment"
        actions={
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="ms-1 size-4" />
            تحديث
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {(
          [
            { key: 'submitted' as const, label: 'غير موزع', value: counts.submitted },
            { key: 'assigned' as const, label: 'بانتظار الاستلام', value: counts.assigned },
            { key: 'converted' as const, label: 'تم التحويل', value: counts.converted },
            { key: '' as const, label: 'الإجمالي', value: rows.length },
          ]
        ).map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={`rounded-lg border px-3 py-2 text-right transition-colors ${
              statusFilter === chip.key
                ? 'border-primary bg-primary/5'
                : 'bg-card hover:bg-muted/40'
            }`}
            onClick={() => setStatusFilter(chip.key === '' ? '' : chip.key)}
          >
            <div className="text-xs text-muted-foreground">{chip.label}</div>
            <div className="text-lg font-semibold tabular-nums">{chip.value}</div>
          </button>
        ))}
      </div>

      <Card className="!p-3 sm:!p-4">
        <SmartFilterBar
          pageId="repair-customer-requests-list"
          searchPlaceholder="بحث برقم الطلب، العميل، الهاتف، المنتج..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'الحالة',
              defaultVisible: true,
              options: [
                { value: '', label: 'الكل' },
                ...(Object.keys(CUSTOMER_REQUEST_STATUS_LABELS) as CustomerServiceRequestStatus[]).map((s) => ({
                  value: s,
                  label: CUSTOMER_REQUEST_STATUS_LABELS[s],
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
            if (key === 'status') setStatusFilter(value as CustomerServiceRequestStatus | '');
            if (key === 'branchId') setBranchFilter(value);
          }}
        />

        <div className="mt-4 -mx-1 overflow-x-auto rounded-lg border sm:mx-0">
          <table className="erp-table w-full min-w-[720px] text-right">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">رقم الطلب</th>
                <th className="erp-th">العميل</th>
                <th className="erp-th">الأصناف</th>
                <th className="erp-th">المركز</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th">التاريخ</th>
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
                    لا توجد طلبات مطابقة.
                  </td>
                </tr>
              ) : (
                paged.map((request) => {
                  const lineCount = request.lines?.length || 0;
                  const qtySum = (request.lines || []).reduce(
                    (sum, line) => sum + Number(line.receivedQuantity ?? line.requestedQuantity ?? 0),
                    0,
                  );
                  return (
                    <tr key={request.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 text-sm font-mono font-medium">{request.requestNo}</td>
                      <td className="px-3 py-2 text-sm">
                        <div>{request.customerName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{request.customerPhone}</div>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <div className="tabular-nums">{lineCount} صنف · {qtySum} وحدة</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {(request.lines || []).map((l) => l.productName).join('، ') || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm">{request.branchName || '—'}</td>
                      <td className="px-3 py-2">
                        <ErpStatusBadge
                          label={CUSTOMER_REQUEST_STATUS_LABELS[request.status] || request.status}
                          type={repairCustomerRequestStatusChipType(request.status)}
                        />
                        {request.convertedReceiptNo && request.convertedJobId ? (
                          <div className="mt-1">
                            <Link
                              className="text-xs text-primary hover:underline"
                              to={withTenantPath(tenantSlug, `/repair/jobs/${request.convertedJobId}`)}
                            >
                              #{request.convertedReceiptNo}
                            </Link>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-muted-foreground">
                        {formatRepairOpsDate(request.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {canAssign && request.status !== 'converted' && request.status !== 'cancelled' ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => openAssign(request)}>
                              توزيع
                            </Button>
                          ) : null}
                          {canReceive && request.status === 'assigned' ? (
                            <Button type="button" size="sm" onClick={() => openReceive(request)}>
                              استلام
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              openWhatsApp(
                                request.customerPhone,
                                `تحديث طلب الصيانة ${request.requestNo}. يمكنك متابعة طلبك من بوابة العميل.`,
                              )
                            }
                          >
                            <MessageCircle className="ms-1 size-3.5" />
                            واتساب
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
      </Card>

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>توزيع الطلب {selected?.requestNo}</DialogTitle>
            <DialogDescription>اختر مركز الصيانة الذي سيستلم أجهزة العميل.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>مركز الصيانة</Label>
            <Select value={assignBranchId} onValueChange={setAssignBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المركز" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void assign()} disabled={!assignBranchId || busy}>
              {busy ? 'جاري الحفظ...' : 'حفظ التوزيع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setSelected(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تأكيد الاستلام الفعلي</DialogTitle>
            <DialogDescription>
              راجع الكميات المستلمة ثم أنشئ طلب صيانة مرتبطًا بعهدة المركز.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {selected?.lines.map((line) => {
              const current = receiveLines.find((r) => r.lineId === line.lineId) || {
                lineId: line.lineId,
                receivedQuantity: line.requestedQuantity,
                differenceNote: '',
              };
              const differs = current.receivedQuantity !== line.requestedQuantity;
              return (
                <div key={line.lineId} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{line.productName}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {line.productCode || line.barcode || '—'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      المطلوب: {line.requestedQuantity}
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[140px_1fr]">
                    <div className="space-y-1">
                      <Label>المستلم</Label>
                      <Input
                        type="number"
                        min={0}
                        value={current.receivedQuantity}
                        onChange={(e) =>
                          setReceiveLines((prev) =>
                            prev.map((r) =>
                              r.lineId === line.lineId
                                ? { ...r, receivedQuantity: Math.max(0, Number(e.target.value) || 0) }
                                : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>سبب الاختلاف {differs ? '(مطلوب)' : '(اختياري)'}</Label>
                      <Input
                        value={current.differenceNote}
                        onChange={(e) =>
                          setReceiveLines((prev) =>
                            prev.map((r) =>
                              r.lineId === line.lineId ? { ...r, differenceNote: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="أدخل السبب عند اختلاف الكمية"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void receive()} disabled={busy}>
              {busy ? 'جاري التأكيد...' : 'تأكيد وإنشاء طلب صيانة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairCustomerRequests;
