import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
  canReceiveSparePartsRequest,
} from '../../inventory/lib/sparePartsReplenishment';
import type {
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
} from '../../inventory/types';
import { CreateRepairReplenishmentModal } from '../components/CreateRepairReplenishmentModal';
import { RepairReplenishmentRequestPreviewModal } from '../components/RepairReplenishmentRequestPreviewModal';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairSparePart,
} from '../types';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

const PAGE_SIZE = 20;

export const RepairPartsReplenishment: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canView =
    can('sparePartsReplenishment.view')
    || can('sparePartsReplenishment.create')
    || can('sparePartsReplenishment.receive');
  const canCreate = can('sparePartsReplenishment.create');
  const canReceive = can('sparePartsReplenishment.receive');

  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );

  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SparePartsReplenishmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<SparePartsReplenishmentRequest | null>(null);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || null,
    [branches, selectedBranchId],
  );
  const toWarehouseId = String(activeBranch?.warehouseId || '').trim();

  const loadBranches = useCallback(async () => {
    const branchRows = await repairBranchService.list();
    const scoped = repairCtx.canViewAllBranches
      ? branchRows
      : branchRows.filter((b) => resolveUserRepairBranchIds(user).includes(String(b.id || '')));
    setBranches(scoped);
    setSelectedBranchId((prev) => {
      if (prev && scoped.some((b) => b.id === prev)) return prev;
      return String(scoped[0]?.id || '');
    });
  }, [repairCtx.canViewAllBranches, user]);

  const load = useCallback(async () => {
    if (!canView || !toWarehouseId) {
      setRows([]);
      setParts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [reqRes, partRows] = await Promise.all([
        sparePartsReplenishmentService.listPaged({
          toWarehouseId,
          limit: 100,
        }),
        selectedBranchId ? sparePartsService.listParts(selectedBranchId) : Promise.resolve([]),
      ]);
      setRows(reqRes.items);
      setParts(partRows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل طلبات التموين.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, toWarehouseId, selectedBranchId]);

  useEffect(() => {
    if (!canView) return;
    void loadBranches().catch(() => {
      toast.error('تعذر تحميل فروع الصيانة.');
      setBranches([]);
    });
  }, [canView, loadBranches]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);
  const awaitingReceiptCount = useMemo(
    () => rows.filter((row) => canReceiveSparePartsRequest(row)).length,
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedBranchId]);

  const receiveRequest = async (requestId: string) => {
    setBusyId(requestId);
    try {
      await sparePartsReplenishmentService.receive(requestId);
      toast.success('تم تأكيد استلام التموين.');
      setPreviewRequest(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تأكيد الاستلام.');
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية متابعة تموين قطع الغيار.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6">
      <PageHeader
        title="متابعة تموين قطع الغيار"
        subtitle="طلبات التموين من المخزن الرئيسي لهذا المركز — أنشئ الطلب واستلم الرصيد من هنا."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to={withTenantPath(tenantSlug, '/repair/parts')}>
              <Button variant="outline">مخزون الفرع</Button>
            </Link>
            {canCreate && (
              <Button type="button" onClick={() => setCreateOpen(true)} disabled={!toWarehouseId}>
                طلب تموين
              </Button>
            )}
          </div>
        )}
      />

      <section aria-label="خطوات تموين قطع الغيار" className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">مسار الطلب واضح من البداية للنهاية</h2>
            <p className="text-xs text-muted-foreground">الرصيد لا يزيد في مخزن المركز إلا بعد تأكيد الاستلام.</p>
          </div>
          <Badge variant={awaitingReceiptCount > 0 ? 'default' : 'secondary'}>
            {awaitingReceiptCount > 0 ? `${awaitingReceiptCount} بانتظار استلامك` : 'لا يوجد استلام معلّق'}
          </Badge>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['1', 'إرسال الطلب', 'مسؤول المركز يحدد القطع والكميات'],
            ['2', 'اعتماد الإدارة', 'مراجعة الاحتياج قبل التجهيز'],
            ['3', 'تجهيز المخزن', 'المخزن المركزي يثبت الكميات الجاهزة'],
            ['4', 'موافقة المسؤول', 'اعتماد نهائي قبل الشحن'],
            ['5', 'تأكيد الاستلام', 'إضافة الرصيد وصرف الطلبات المعلقة'],
          ].map(([number, title, description]) => (
            <li key={number} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {number}
              </div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <Card className="!p-4 flex flex-wrap items-center gap-3">
        {(repairCtx.canViewAllBranches || branches.length > 1) && (
          <div className="w-[220px]">
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id || ''}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Select
          value={statusFilter || '__all__'}
          onValueChange={(v) =>
            setStatusFilter(v === '__all__' ? '' : (v as SparePartsReplenishmentStatus))
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الحالات</SelectItem>
            {(Object.keys(SPARE_PARTS_REPLENISHMENT_STATUS_LABELS) as SparePartsReplenishmentStatus[]).map(
              (status) => (
                <SelectItem key={status} value={status}>
                  {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[status]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          تحديث
        </Button>
        <span className="text-xs text-muted-foreground ms-auto">
          الطلبات: {filtered.length}
        </span>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <CardContent className="p-0">
          {!toWarehouseId ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              اختر فرعًا مربوطًا بمخزن صيانة لعرض الطلبات.
            </p>
          ) : loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">جاري التحميل…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th p-2 text-right">المرجع</th>
                    <th className="erp-th p-2 text-right">الحالة</th>
                    <th className="erp-th p-2 text-right">بنود</th>
                    <th className="erp-th p-2 text-right">ملاحظة</th>
                    <th className="erp-th p-2 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const id = String(row.id || '');
                    const canRecv = canReceive && canReceiveSparePartsRequest(row);
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-2 font-medium">
                          <button
                            type="button"
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={() => setPreviewRequest(row)}
                          >
                            {row.referenceNo}
                          </button>
                        </td>
                        <td className="p-2">
                          <Badge variant="secondary">
                            {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[row.status] || row.status}
                          </Badge>
                        </td>
                        <td className="p-2 tabular-nums">{row.lines?.length || 0}</td>
                        <td className="p-2 text-muted-foreground">{row.note || '—'}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setPreviewRequest(row)}
                            >
                              معاينة
                            </Button>
                            {canRecv ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === id}
                                onClick={() => void receiveRequest(id)}
                              >
                                {busyId === id ? '…' : 'تأكيد الاستلام'}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        لا توجد طلبات تموين لهذا المخزن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPaginationFooter
                page={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                onPageChange={setPage}
                itemLabel="طلب"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <CreateRepairReplenishmentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        toWarehouseId={toWarehouseId}
        parts={parts}
        onCreated={() => void load()}
      />

      <RepairReplenishmentRequestPreviewModal
        request={previewRequest}
        open={Boolean(previewRequest)}
        onOpenChange={(open) => {
          if (!open) setPreviewRequest(null);
        }}
        canReceive={canReceive}
        receiving={Boolean(previewRequest?.id && busyId === String(previewRequest.id))}
        onConfirmReceive={(requestId) => void receiveRequest(requestId)}
      />
    </div>
  );
};

export default RepairPartsReplenishment;
