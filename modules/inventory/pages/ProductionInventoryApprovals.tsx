import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '../components/UI';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SuppliesReceiptPrint } from '../components/SuppliesReceiptPrint';
import { componentCompensationService } from '../services/componentCompensationService';
import { disassemblyService } from '../services/disassemblyService';
import { suppliesReceiptService } from '../services/suppliesReceiptService';
import type { ComponentCompensationRequest, DisassemblyOrder, SuppliesReceiptOrder } from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { useManagedPrint } from '../../../utils/printManager';
import { exportToPDF, waitForExportPaint } from '../../../utils/reportExport';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { Skeleton } from '@/components/ui/skeleton';

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
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
  const [message, setMessage] = useState('');
  const [compPage, setCompPage] = useState(1);
  const [disPage, setDisPage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);
  const [printOrder, setPrintOrder] = useState<SuppliesReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'اذن-استلام-مستلزمات',
  });

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

  const approveCompensation = async (row: ComponentCompensationRequest) => {
    if (!row.id) return;
    setMessage('');
    try {
      await componentCompensationService.approve(row.id, actor);
      setMessage('تم اعتماد التعويض وخصم المخزون.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر اعتماد التعويض.');
    }
  };

  const rejectCompensation = async (row: ComponentCompensationRequest) => {
    if (!row.id) return;
    await componentCompensationService.reject(row.id, actor);
    setMessage('تم رفض التعويض.');
    await reload();
  };

  const actionDisassembly = async (row: DisassemblyOrder, action: 'approve' | 'reject' | 'execute') => {
    if (!row.id) return;
    setMessage('');
    try {
      if (action === 'approve') await disassemblyService.approve(row.id, actor, uid || undefined);
      if (action === 'reject') await disassemblyService.reject(row.id, actor, window.prompt('سبب الرفض:', '') || '', uid || undefined);
      if (action === 'execute') await disassemblyService.execute(row.id, actor, uid || undefined);
      setMessage('تم تحديث طلب التفكيك.');
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحديث طلب التفكيك.');
    }
  };

  const actionReceipt = async (row: SuppliesReceiptOrder, action: 'approve' | 'reject' | 'execute' | 'delete') => {
    if (!row.id) return;
    setMessage('');
    try {
      if (action === 'approve') await suppliesReceiptService.approve(row.id, actor, uid || undefined);
      if (action === 'reject') await suppliesReceiptService.reject(row.id, actor, window.prompt('سبب الرفض:', '') || '', uid || undefined);
      if (action === 'execute') await suppliesReceiptService.execute(row.id, actor, uid || undefined);
      if (action === 'delete') {
        const ok = window.confirm(`حذف مستند الاستلام ${row.referenceNo}؟ لا يمكن التراجع.`);
        if (!ok) return;
        await suppliesReceiptService.remove(row.id);
        setMessage('تم حذف مستند استلام المستلزمات.');
      } else {
        setMessage('تم تحديث مستند استلام المستلزمات.');
      }
      await reload();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحديث مستند الاستلام.');
    }
  };

  const printReceipt = async (order: SuppliesReceiptOrder) => {
    setPrintOrder(order);
    await waitForExportPaint(80);
    if (isMobilePrint && printRef.current) {
      await exportToPDF(printRef.current, `اذن-استلام-${order.referenceNo}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: 1,
      });
      return;
    }
    handlePrint();
  };

  if (!can('inventory.view')) return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;

  if (loading && compensations.length === 0 && disassemblies.length === 0 && receipts.length === 0) {
    return (
      <div className="erp-ds-clean space-y-5">
        <PageHeader title="اعتمادات الإنتاج المخزنية" subtitle="اعتماد تعويضات المكونات وطلبات التفكيك واستلام المستلزمات قبل تأثيرها على المخزون." icon="fact_check" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader title="اعتمادات الإنتاج المخزنية" subtitle="اعتماد تعويضات المكونات وطلبات التفكيك واستلام المستلزمات قبل تأثيرها على المخزون." icon="fact_check" />
      {message && <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</p>}

      <Card className="!p-0 overflow-hidden" title="تعويضات المكونات">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm text-right border-collapse">
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
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا توجد تعويضات.</td>
                </tr>
              ) : (
                pagedCompensations.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.line.itemName}</p>
                      <p className="text-xs text-slate-500">{row.locationCode}</p>
                      {row.origin === 'production_request' && (
                        <p className="text-[11px] font-bold text-amber-700">طلب من الإنتاج</p>
                      )}
                      {row.issueReferenceNo && (
                        <p className="text-[11px] text-slate-400 font-mono">{row.issueReferenceNo}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{row.reason}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'pending' && (
                          <button
                            type="button"
                            disabled={!can('productionIssue.approve')}
                            onClick={() => void approveCompensation(row)}
                            title="اعتماد"
                            aria-label="اعتماد التعويض"
                            className="p-2 rounded-[var(--border-radius-base)] border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">check_circle</span>
                          </button>
                        )}
                        {row.status === 'pending' && (
                          <button
                            type="button"
                            disabled={!can('productionIssue.approve')}
                            onClick={() => void rejectCompensation(row)}
                            title="رفض"
                            aria-label="رفض التعويض"
                            className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">cancel</span>
                          </button>
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
      </Card>

      <Card className="!p-0 overflow-hidden" title="استلام مستلزمات">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm text-right border-collapse">
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
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">لا توجد إذونات استلام.</td>
                </tr>
              ) : (
                pagedReceipts.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.warehouseName || row.warehouseId}</p>
                      {row.containerRef && <p className="text-xs text-slate-500">{row.containerRef}</p>}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{(row.groups?.length || 0) + (row.standaloneLines?.length || 0)}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'submitted' && (
                          <button
                            type="button"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'approve')}
                            title="اعتماد"
                            aria-label={`اعتماد إذن الاستلام ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">check_circle</span>
                          </button>
                        )}
                        {row.status === 'submitted' && (
                          <button
                            type="button"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'reject')}
                            title="رفض"
                            aria-label={`رفض إذن الاستلام ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">cancel</span>
                          </button>
                        )}
                        {row.status === 'approved' && (
                          <button
                            type="button"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'execute')}
                            title="تنفيذ"
                            aria-label={`تنفيذ إذن الاستلام ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-primary hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">play_circle</span>
                          </button>
                        )}
                        {(row.status === 'draft' || row.status === 'rejected' || row.status === 'cancelled') && (
                          <button
                            type="button"
                            disabled={!can('inventory.transactions.create')}
                            onClick={() => void actionReceipt(row, 'delete')}
                            title="حذف"
                            aria-label={`حذف إذن الاستلام ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">delete</span>
                          </button>
                        )}
                        {canPrint && (
                          <button
                            type="button"
                            onClick={() => void printReceipt(row)}
                            title="طباعة إذن الاستلام"
                            aria-label={`طباعة إذن الاستلام ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa] transition-colors"
                          >
                            <span className="material-icons-round text-sm">print</span>
                          </button>
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
      </Card>

      <Card className="!p-0 overflow-hidden" title="طلبات التفكيك">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm text-right border-collapse">
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
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">لا توجد طلبات تفكيك.</td>
                </tr>
              ) : (
                pagedDisassemblies.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3 font-semibold">{row.productName}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {row.status === 'submitted' && (
                          <button
                            type="button"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'approve')}
                            title="اعتماد"
                            aria-label={`اعتماد طلب التفكيك ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">check_circle</span>
                          </button>
                        )}
                        {row.status === 'submitted' && (
                          <button
                            type="button"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'reject')}
                            title="رفض"
                            aria-label={`رفض طلب التفكيك ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">cancel</span>
                          </button>
                        )}
                        {row.status === 'approved' && (
                          <button
                            type="button"
                            disabled={!can('inventory.disassembly.manage')}
                            onClick={() => void actionDisassembly(row, 'execute')}
                            title="تنفيذ"
                            aria-label={`تنفيذ طلب التفكيك ${row.referenceNo}`}
                            className="p-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-primary hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-icons-round text-sm">play_circle</span>
                          </button>
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
      </Card>

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: -1,
          pointerEvents: 'none',
          direction: 'rtl',
          width: '210mm',
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        <SuppliesReceiptPrint ref={printRef} order={printOrder} printSettings={printTemplate} />
      </div>
    </div>
  );
};
