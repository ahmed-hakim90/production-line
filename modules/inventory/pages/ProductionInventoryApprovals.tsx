import React, { useEffect, useMemo, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { TableIconAction } from '@/src/components/erp';
import { SuppliesReceiptPrint } from '../components/SuppliesReceiptPrint';
import { componentCompensationService } from '../services/componentCompensationService';
import { disassemblyService } from '../services/disassemblyService';
import { suppliesReceiptService } from '../services/suppliesReceiptService';
import type { ComponentCompensationRequest, DisassemblyOrder, SuppliesReceiptOrder } from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { usePrintEngine } from '../../../utils/printManager';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '../../../components/Toast';
import { INVENTORY_DOCUMENT_PATHS } from '../../system/lib/operationPathSettings';

const PAGE_SIZE = 20;
const APPROVALS_CACHE_KEY = 'inventory:production-inventory-approvals';

type ApprovalsPageData = {
  compensations: ComponentCompensationRequest[];
  disassemblies: DisassemblyOrder[];
  receipts: SuppliesReceiptOrder[];
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  executed: 'منفّذ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
  pending: 'معلّق',
};

export const ProductionInventoryApprovals: React.FC = () => {
  const { can } = usePermission();
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const uid = useAppStore((s) => s.uid);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const actor = userDisplayName || userEmail || 'Current User';
  const canPrint = can('inventory.transactions.print');
  const applyScoped = (data: ApprovalsPageData) => {
    if (!scoped) {
      setCompensations(data.compensations);
      setDisassemblies(data.disassemblies);
      setReceipts(data.receipts);
      return;
    }
    if (allowedWarehouseIds.size === 0) {
      setCompensations([]);
      setDisassemblies([]);
      setReceipts([]);
      return;
    }
    setCompensations(data.compensations.filter((row) => allowedWarehouseIds.has(row.warehouseId)));
    setDisassemblies(data.disassemblies.filter(
      (row) =>
        allowedWarehouseIds.has(row.sourceWarehouseId)
        || allowedWarehouseIds.has(row.targetWarehouseId),
    ));
    setReceipts(data.receipts.filter((row) => allowedWarehouseIds.has(row.warehouseId)));
  };
  const initialCache = peekPageDataCache<ApprovalsPageData>(APPROVALS_CACHE_KEY);
  const [compensations, setCompensations] = useState<ComponentCompensationRequest[]>(() => {
    if (!initialCache) return [];
    if (!scoped) return initialCache.compensations;
    if (allowedWarehouseIds.size === 0) return [];
    return initialCache.compensations.filter((row) => allowedWarehouseIds.has(row.warehouseId));
  });
  const [disassemblies, setDisassemblies] = useState<DisassemblyOrder[]>(() => {
    if (!initialCache) return [];
    if (!scoped) return initialCache.disassemblies;
    if (allowedWarehouseIds.size === 0) return [];
    return initialCache.disassemblies.filter(
      (row) =>
        allowedWarehouseIds.has(row.sourceWarehouseId)
        || allowedWarehouseIds.has(row.targetWarehouseId),
    );
  });
  const [receipts, setReceipts] = useState<SuppliesReceiptOrder[]>(() => {
    if (!initialCache) return [];
    if (!scoped) return initialCache.receipts;
    if (allowedWarehouseIds.size === 0) return [];
    return initialCache.receipts.filter((row) => allowedWarehouseIds.has(row.warehouseId));
  });
  const [loading, setLoading] = useState(() => initialCache == null);
  const [compPage, setCompPage] = useState(1);
  const [disPage, setDisPage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);
  const { printDocument } = usePrintEngine();

  const load = async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<ApprovalsPageData>(APPROVALS_CACHE_KEY);
    if (cached) {
      applyScoped(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        APPROVALS_CACHE_KEY,
        async () => {
          const [compRows, disRows, receiptRows] = await Promise.all([
            componentCompensationService.getAll(),
            disassemblyService.getAll(),
            suppliesReceiptService.getAll(),
          ]);
          return {
            compensations: compRows,
            disassemblies: disRows,
            receipts: receiptRows,
          };
        },
        { force: opts?.force === true, maxAgeMs: 45_000 },
      );
      applyScoped(data);
    } finally {
      setLoading(false);
    }
  };

  const reload = async () => {
    invalidatePageDataCache(APPROVALS_CACHE_KEY);
    await load({ force: true });
  };

  useEffect(() => {
    void load();
  }, [scoped, allowedWarehouseIds]);

  useEffect(() => { setCompPage(1); }, [compensations.length]);
  useEffect(() => { setDisPage(1); }, [disassemblies.length]);
  useEffect(() => { setReceiptPage(1); }, [receipts.length]);

  const compTotalPages = Math.max(1, Math.ceil(compensations.length / PAGE_SIZE));
  const disTotalPages = Math.max(1, Math.ceil(disassemblies.length / PAGE_SIZE));
  const receiptTotalPages = Math.max(1, Math.ceil(receipts.length / PAGE_SIZE));
  const safeCompPage = Math.min(compPage, compTotalPages);
  const safeDisPage = Math.min(disPage, disTotalPages);
  const safeReceiptPage = Math.min(receiptPage, receiptTotalPages);
  const pagedCompensations = useMemo(
    () => compensations.slice((safeCompPage - 1) * PAGE_SIZE, safeCompPage * PAGE_SIZE),
    [compensations, safeCompPage],
  );
  const pagedDisassemblies = useMemo(
    () => disassemblies.slice((safeDisPage - 1) * PAGE_SIZE, safeDisPage * PAGE_SIZE),
    [disassemblies, safeDisPage],
  );
  const pagedReceipts = useMemo(
    () => receipts.slice((safeReceiptPage - 1) * PAGE_SIZE, safeReceiptPage * PAGE_SIZE),
    [receipts, safeReceiptPage],
  );

  const pendingApprovalCount = useMemo(
    () =>
      compensations.filter((row) => row.status === 'pending').length
      + receipts.filter((row) => row.status === 'submitted').length
      + disassemblies.filter((row) => row.status === 'submitted').length,
    [compensations, receipts, disassemblies],
  );

  const approveCompensation = async (row: ComponentCompensationRequest) => {
    if (!row.id) return;
        try {
      await componentCompensationService.approve(row.id, actor);
      toast.success('تم اعتماد التعويض وخصم المخزون.');
      await reload();
    } catch (error: any) {
      toast.error('تعذر اعتماد التعويض.');
    }
  };

  const rejectCompensation = async (row: ComponentCompensationRequest) => {
    if (!row.id) return;
    await componentCompensationService.reject(row.id, actor);
    toast.success('تم رفض التعويض.');
    await reload();
  };

  const actionDisassembly = async (row: DisassemblyOrder, action: 'approve' | 'reject' | 'execute') => {
    if (!row.id) return;
        try {
      if (action === 'approve') await disassemblyService.approve(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        uid || undefined,
      );
      if (action === 'reject') await disassemblyService.reject(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        window.prompt('سبب الرفض:', '') || '',
        uid || undefined,
      );
      if (action === 'execute') await disassemblyService.execute(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        uid || undefined,
      );
      toast.success('تم تحديث طلب التفكيك.');
      await reload();
    } catch (error: any) {
      toast.error('تعذر تحديث طلب التفكيك.');
    }
  };

  const actionReceipt = async (row: SuppliesReceiptOrder, action: 'approve' | 'reject' | 'execute' | 'delete') => {
    if (!row.id) return;
        try {
      if (action === 'approve') await suppliesReceiptService.approve(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        uid || undefined,
      );
      if (action === 'reject') await suppliesReceiptService.reject(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        window.prompt('سبب الرفض:', '') || '',
        uid || undefined,
      );
      if (action === 'execute') await suppliesReceiptService.execute(
        row.id,
        actor,
        { path: INVENTORY_DOCUMENT_PATHS.approvalsHub },
        uid || undefined,
      );
      if (action === 'delete') {
        const ok = window.confirm(`حذف مستند الاستلام ${row.referenceNo}؟ لا يمكن التراجع.`);
        if (!ok) return;
        await suppliesReceiptService.remove(row.id);
        toast.success('تم حذف مستند استلام المستلزمات.');
      } else {
        toast.success('تم تحديث مستند استلام المستلزمات.');
      }
      await reload();
    } catch (error: any) {
      toast.error('تعذر تحديث مستند الاستلام.');
    }
  };

  const printReceipt = (order: SuppliesReceiptOrder) => {
    printDocument({
      documentTitle: `اذن-استلام-${order.referenceNo || order.id}`,
      printSettings: printTemplate,
      render: (ref) => (
        <SuppliesReceiptPrint ref={ref} order={order} printSettings={printTemplate} />
      ),
    });
  };

  if (!can('inventory.view')) return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>;

  const pageSubtitle =
    pendingApprovalCount > 0
      ? `بانتظار الاعتماد: ${pendingApprovalCount}. اعتماد تعويضات المكونات وطلبات التفكيك واستلام المستلزمات قبل تأثيرها على المخزون.`
      : 'اعتماد تعويضات المكونات وطلبات التفكيك واستلام المستلزمات قبل تأثيرها على المخزون.';

  if (loading && compensations.length === 0 && disassemblies.length === 0 && receipts.length === 0) {
    return (
      <ModuleOpsPageShell eyebrow="اعتمادات الإنتاج المخزنية" rangeLabel={pageSubtitle}>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell eyebrow="اعتمادات الإنتاج المخزنية" rangeLabel={pageSubtitle}>
      <OpsDashPanel title="تعويضات المكونات" accent="inventory" bodyClassName="p-0">
                <div className="erp-mobile-card-list p-2">
          {compensations.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد تعويضات.</p>
          ) : (
            pagedCompensations.map((row) => (
              <div key={`m-c-${row.id}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{row.referenceNo}</p>
                    <p className="mt-0.5 text-sm font-semibold">{row.line.itemName}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{row.locationCode}</p>
                  </div>
                  <span className="text-xs font-bold">{STATUS_LABELS[row.status] || row.status}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">الكمية</dt>
                    <dd className="tabular-nums">{row.quantity}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--color-text-muted)]">السبب</dt>
                    <dd>{row.reason}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.status === 'pending' && (
                    <TableIconAction action="approve" disabled={!can('productionIssue.approve')} onClick={() => void approveCompensation(row)} aria-label="اعتماد التعويض" />
                  )}
                  {row.status === 'pending' && (
                    <TableIconAction action="reject" disabled={!can('productionIssue.approve')} onClick={() => void rejectCompensation(row)} aria-label="رفض التعويض" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="erp-desktop-table overflow-x-auto">
          <table className="erp-table w-full min-w-[720px] text-sm text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الطلب</th>
                <th className="erp-th">المكون</th>
                <th className="erp-th text-center">الكمية</th>
                <th className="erp-th text-center">السبب</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {compensations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-text-muted)]">لا توجد تعويضات.</td>
                </tr>
              ) : (
                pagedCompensations.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--color-bg)]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.line.itemName}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{row.locationCode}</p>
                      {row.origin === 'production_request' && (
                        <p className="text-[11px] font-bold text-[rgb(var(--color-warning))]">طلب من الإنتاج</p>
                      )}
                      {row.issueReferenceNo && (
                        <p className="text-[11px] text-[var(--color-text-muted)] font-mono">{row.issueReferenceNo}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{row.reason}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'pending' && (
                          <TableIconAction
                            action="approve"
                            disabled={!can('productionIssue.approve')}
                            onClick={() => void approveCompensation(row)}
                            aria-label="اعتماد التعويض"
                          />
                        )}
                        {row.status === 'pending' && (
                          <TableIconAction
                            action="reject"
                            disabled={!can('productionIssue.approve')}
                            onClick={() => void rejectCompensation(row)}
                            aria-label="رفض التعويض"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeCompPage}
          totalPages={compTotalPages}
          totalItems={compensations.length}
          onPageChange={setCompPage}
          itemLabel="طلب"
        />
      </OpsDashPanel>

      <OpsDashPanel title="استلام مستلزمات" accent="inventory" bodyClassName="p-0">
                <div className="erp-mobile-card-list p-2">
          {receipts.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد إذونات استلام.</p>
          ) : (
            pagedReceipts.map((row) => (
              <div key={`m-r-${row.id}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{row.referenceNo}</p>
                    <p className="mt-0.5 text-sm font-semibold">{row.warehouseName || row.warehouseId}</p>
                  </div>
                  <span className="text-xs font-bold">{STATUS_LABELS[row.status] || row.status}</span>
                </div>
                <p className="mt-2 text-sm tabular-nums">مجموعات: {(row.groups?.length || 0) + (row.standaloneLines?.length || 0)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.status === 'submitted' && (
                    <TableIconAction action="approve" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'approve')} aria-label={`اعتماد إذن الاستلام ${row.referenceNo}`} />
                  )}
                  {row.status === 'submitted' && (
                    <TableIconAction action="reject" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'reject')} aria-label={`رفض إذن الاستلام ${row.referenceNo}`} />
                  )}
                  {row.status === 'approved' && (
                    <TableIconAction action="execute" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'execute')} aria-label={`تنفيذ إذن الاستلام ${row.referenceNo}`} />
                  )}
                  {(row.status === 'draft' || row.status === 'rejected' || row.status === 'cancelled') && (
                    <TableIconAction action="delete" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'delete')} aria-label={`حذف إذن الاستلام ${row.referenceNo}`} />
                  )}
                  {canPrint && (
                    <TableIconAction action="print" onClick={() => void printReceipt(row)} title="طباعة إذن الاستلام" aria-label={`طباعة إذن الاستلام ${row.referenceNo}`} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="erp-desktop-table overflow-x-auto">
          <table className="erp-table w-full min-w-[720px] text-sm text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">رقم الإذن</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th text-center">مجموعات</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-text-muted)]">لا توجد إذونات استلام.</td>
                </tr>
              ) : (
                pagedReceipts.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--color-bg)]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.warehouseName || row.warehouseId}</p>
                      {row.containerRef && <p className="text-xs text-[var(--color-text-muted)]">{row.containerRef}</p>}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{(row.groups?.length || 0) + (row.standaloneLines?.length || 0)}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'submitted' && (
                          <TableIconAction
                            action="approve"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'approve')}
                            aria-label={`اعتماد إذن الاستلام ${row.referenceNo}`}
                          />
                        )}
                        {row.status === 'submitted' && (
                          <TableIconAction
                            action="reject"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'reject')}
                            aria-label={`رفض إذن الاستلام ${row.referenceNo}`}
                          />
                        )}
                        {row.status === 'approved' && (
                          <TableIconAction
                            action="execute"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'execute')}
                            aria-label={`تنفيذ إذن الاستلام ${row.referenceNo}`}
                          />
                        )}
                        {(row.status === 'draft' || row.status === 'rejected' || row.status === 'cancelled') && (
                          <TableIconAction
                            action="delete"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'delete')}
                            aria-label={`حذف إذن الاستلام ${row.referenceNo}`}
                          />
                        )}
                        {canPrint && (
                          <TableIconAction
                            action="print"
                            onClick={() => void printReceipt(row)}
                            title="طباعة إذن الاستلام"
                            aria-label={`طباعة إذن الاستلام ${row.referenceNo}`}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeReceiptPage}
          totalPages={receiptTotalPages}
          totalItems={receipts.length}
          onPageChange={setReceiptPage}
          itemLabel="إذن"
        />
      </OpsDashPanel>

      <OpsDashPanel title="طلبات التفكيك" accent="inventory" bodyClassName="p-0">
                <div className="erp-mobile-card-list p-2">
          {disassemblies.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد طلبات تفكيك.</p>
          ) : (
            pagedDisassemblies.map((row) => (
              <div key={`m-d-${row.id}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{row.referenceNo}</p>
                    <p className="mt-0.5 text-sm font-semibold">{row.productName}</p>
                  </div>
                  <span className="text-xs font-bold">{STATUS_LABELS[row.status] || row.status}</span>
                </div>
                <p className="mt-2 text-sm tabular-nums">الكمية: {row.quantity}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.status === 'submitted' && (
                    <TableIconAction action="approve" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'approve')} aria-label={`اعتماد طلب التفكيك ${row.referenceNo}`} />
                  )}
                  {row.status === 'submitted' && (
                    <TableIconAction action="reject" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'reject')} aria-label={`رفض طلب التفكيك ${row.referenceNo}`} />
                  )}
                  {row.status === 'approved' && (
                    <TableIconAction action="execute" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'execute')} aria-label={`تنفيذ طلب التفكيك ${row.referenceNo}`} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="erp-desktop-table overflow-x-auto">
          <table className="erp-table w-full min-w-[720px] text-sm text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الطلب</th>
                <th className="erp-th">المنتج</th>
                <th className="erp-th text-center">الكمية</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {disassemblies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-text-muted)]">لا توجد طلبات تفكيك.</td>
                </tr>
              ) : (
                pagedDisassemblies.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--color-bg)]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3 font-semibold">{row.productName}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'submitted' && (
                          <TableIconAction
                            action="approve"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'approve')}
                            aria-label={`اعتماد طلب التفكيك ${row.referenceNo}`}
                          />
                        )}
                        {row.status === 'submitted' && (
                          <TableIconAction
                            action="reject"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'reject')}
                            aria-label={`رفض طلب التفكيك ${row.referenceNo}`}
                          />
                        )}
                        {row.status === 'approved' && (
                          <TableIconAction
                            action="execute"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'execute')}
                            aria-label={`تنفيذ طلب التفكيك ${row.referenceNo}`}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeDisPage}
          totalPages={disTotalPages}
          totalItems={disassemblies.length}
          onPageChange={setDisPage}
          itemLabel="طلب"
        />
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
