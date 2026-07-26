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

const PAGE_SIZE = 20;

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
  const [compensations, setCompensations] = useState<ComponentCompensationRequest[]>([]);
  const [disassemblies, setDisassemblies] = useState<DisassemblyOrder[]>([]);
  const [receipts, setReceipts] = useState<SuppliesReceiptOrder[]>([]);
  const [message, setMessage] = useState('');
  const [compPage, setCompPage] = useState(1);
  const [disPage, setDisPage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);
  const [printOrder, setPrintOrder] = useState<SuppliesReceiptOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'مستند استلام مستلزمات',
  });

  const load = async () => {
    const [compRows, disRows, receiptRows] = await Promise.all([
      componentCompensationService.getAll(),
      disassemblyService.getAll(),
      suppliesReceiptService.getAll(),
    ]);
    if (!scoped) {
      setCompensations(compRows);
      setDisassemblies(disRows);
      setReceipts(receiptRows);
      return;
    }
    if (allowedWarehouseIds.size === 0) {
      setCompensations([]);
      setDisassemblies([]);
      setReceipts([]);
      return;
    }
    setCompensations(compRows.filter((row) => allowedWarehouseIds.has(row.warehouseId)));
    setDisassemblies(disRows.filter(
      (row) =>
        allowedWarehouseIds.has(row.sourceWarehouseId)
        || allowedWarehouseIds.has(row.targetWarehouseId),
    ));
    setReceipts(receiptRows.filter((row) => allowedWarehouseIds.has(row.warehouseId)));
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
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر اعتماد التعويض.');
    }
  };

  const rejectCompensation = async (row: ComponentCompensationRequest) => {
    if (!row.id) return;
    await componentCompensationService.reject(row.id, actor);
    setMessage('تم رفض التعويض.');
    await load();
  };

  const actionDisassembly = async (row: DisassemblyOrder, action: 'approve' | 'reject' | 'execute') => {
    if (!row.id) return;
    setMessage('');
    try {
      if (action === 'approve') await disassemblyService.approve(row.id, actor, uid || undefined);
      if (action === 'reject') await disassemblyService.reject(row.id, actor, window.prompt('سبب الرفض:', '') || '', uid || undefined);
      if (action === 'execute') await disassemblyService.execute(row.id, actor, uid || undefined);
      setMessage('تم تحديث طلب التفكيك.');
      await load();
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
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحديث مستند الاستلام.');
    }
  };

  const printReceipt = async (order: SuppliesReceiptOrder) => {
    setPrintOrder(order);
    await new Promise((r) => window.setTimeout(r, 80));
    handlePrint();
  };

  if (!can('inventory.view')) return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;

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
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{row.reason}</td>
                    <td className="px-4 py-3 text-center">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-4 py-3 text-center space-x-1 space-x-reverse">
                      {row.status === 'pending' && <button className="text-xs font-bold text-emerald-700" disabled={!can('productionIssue.approve')} onClick={() => void approveCompensation(row)}>اعتماد</button>}
                      {row.status === 'pending' && <button className="text-xs font-bold text-rose-700" disabled={!can('productionIssue.approve')} onClick={() => void rejectCompensation(row)}>رفض</button>}
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
                <th className="erp-th">المستند</th>
                <th className="erp-th">المخزن</th>
                <th className="erp-th text-center">مجموعات</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">لا توجد مستندات استلام.</td>
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
                    <td className="px-4 py-3 text-center space-x-1 space-x-reverse">
                      {row.status === 'submitted' && <button className="text-xs font-bold text-emerald-700" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'approve')}>اعتماد</button>}
                      {row.status === 'submitted' && <button className="text-xs font-bold text-rose-700" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'reject')}>رفض</button>}
                      {row.status === 'approved' && <button className="text-xs font-bold text-primary" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'execute')}>تنفيذ</button>}
                      {(row.status === 'draft' || row.status === 'rejected' || row.status === 'cancelled') && (
                        <button className="text-xs font-bold text-rose-700" disabled={!can('inventory.transactions.create')} onClick={() => void actionReceipt(row, 'delete')}>حذف</button>
                      )}
                      {can('inventory.transactions.print') && (
                        <button className="text-xs font-bold text-slate-700" onClick={() => void printReceipt(row)}>طباعة</button>
                      )}
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
          itemLabel="مستند"
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
                    <td className="px-4 py-3 text-center space-x-1 space-x-reverse">
                      {row.status === 'submitted' && <button className="text-xs font-bold text-emerald-700" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'approve')}>اعتماد</button>}
                      {row.status === 'submitted' && <button className="text-xs font-bold text-rose-700" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'reject')}>رفض</button>}
                      {row.status === 'approved' && <button className="text-xs font-bold text-primary" disabled={!can('inventory.disassembly.manage')} onClick={() => void actionDisassembly(row, 'execute')}>تنفيذ</button>}
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
