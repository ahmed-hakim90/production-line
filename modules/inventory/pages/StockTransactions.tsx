import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockTransaction, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { exportHRData } from '../../../utils/exportExcel';
import { usePermission } from '../../../utils/permissions';
import { StockTransferPrint, type StockTransferPrintData } from '../components/StockTransferPrint';
import { useManagedPrint } from '../../../utils/printManager';
import { useAppStore } from '../../../store/useAppStore';

const movementLabel: Record<string, string> = {
  IN: 'وارد',
  OUT: 'منصرف',
  TRANSFER: 'تحويل',
  ADJUSTMENT: 'تسوية',
};

export const StockTransactions: React.FC = () => {
  const { can } = usePermission();
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [movementFilter, setMovementFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'export' | 'delete' | ''>('');
  const [processing, setProcessing] = useState(false);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer-from-transactions',
  });

  const loadData = async () => {
    const [txs, whs] = await Promise.all([
      stockService.getTransactions(),
      warehouseService.getAll(),
    ]);
    setTransactions(txs);
    setWarehouses(whs);
    setSelectedIds([]);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const filtered = useMemo(() => transactions.filter((tx) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || tx.itemName.toLowerCase().includes(q) || tx.itemCode.toLowerCase().includes(q);
    const matchesWarehouse = !warehouseFilter || tx.warehouseId === warehouseFilter;
    const matchesMovement = !movementFilter || tx.movementType === movementFilter;
    return matchesSearch && matchesWarehouse && matchesMovement;
  }), [transactions, search, warehouseFilter, movementFilter]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(
    () => filtered.filter((row) => row.id && selectedSet.has(row.id)),
    [filtered, selectedSet],
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => row.id && selectedSet.has(row.id));
  const effectiveExportRows = selectedRows.length > 0 ? selectedRows : filtered;

  const toExportRows = (rows: StockTransaction[]) =>
    rows.map((tx) => ({
      'التاريخ': new Date(tx.createdAt).toLocaleString('ar-EG'),
      'الصنف': tx.itemName,
      'الكود': tx.itemCode,
      'نوع الصنف': tx.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام',
      'نوع الحركة': movementLabel[tx.movementType] ?? tx.movementType,
      'الكمية': tx.quantity,
      'المخزن': warehouseMap.get(tx.warehouseId) ?? tx.warehouseId,
      'رقم المرجع': tx.referenceNo ?? '—',
      'المنفذ': tx.createdBy,
    }));

  const exportExcel = (rows: StockTransaction[]) => {
    if (rows.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    const movementLabelPart = movementFilter || 'ALL';
    exportHRData(
      toExportRows(rows),
      'حركات المخزون',
      `حركات-المخزون-${movementLabelPart}-${date}`,
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((row) => row.id === id)));
      return;
    }
    const merged = new Set(selectedIds);
    filtered.forEach((row) => row.id && merged.add(row.id));
    setSelectedIds(Array.from(merged));
  };

  const toggleSelectRow = (rowId?: string) => {
    if (!rowId) return;
    setSelectedIds((prev) => (prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]));
  };

  const deleteRows = async (rows: StockTransaction[]) => {
    if (rows.length === 0) return;
    const transferCount = rows.filter((row) => row.movementType === 'TRANSFER').length;
    const ok = window.confirm(
      transferCount > 0
        ? 'سيتم حذف الحركات المحددة. عند حذف التحويلة سيتم عكس الكميات وإرجاعها للمخزن المصدر. هل تريد المتابعة؟'
        : 'هل تريد حذف الحركات المحددة؟',
    );
    if (!ok) return;
    setProcessing(true);
    try {
      await stockService.deleteMovements(rows);
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر حذف الحركات المحددة.');
    } finally {
      setProcessing(false);
    }
  };

  const printTransferFromRow = async (tx: StockTransaction) => {
    if (tx.movementType !== 'TRANSFER') return;
    const transferNo = tx.referenceNo?.trim();
    if (!transferNo) {
      window.alert('لا يمكن طباعة التحويلة بدون رقم مرجع.');
      return;
    }

    setProcessing(true);
    try {
      const sameReference = await stockService.getTransactionsByReferenceNo(transferNo);
      const transferRows = sameReference.filter((row) => row.movementType === 'TRANSFER');
      const outRows = transferRows.filter((row) => row.transferDirection === 'OUT');
      const rowsForPrint = outRows.length > 0 ? outRows : transferRows;
      if (rowsForPrint.length === 0) {
        window.alert('لا توجد بيانات كافية لطباعة هذه التحويلة.');
        return;
      }

      const first = rowsForPrint[0];
      setPrintData({
        transferNo,
        createdAt: first.createdAt || tx.createdAt,
        fromWarehouseName: warehouseMap.get(first.warehouseId) ?? first.warehouseId,
        toWarehouseName: (warehouseMap.get(first.toWarehouseId || '') ?? first.toWarehouseId) || '—',
        createdBy: first.createdBy || tx.createdBy,
        items: rowsForPrint.map((row) => ({
          itemName: row.itemName,
          itemCode: row.itemCode,
          unitLabel: 'قطعة',
          quantity: Math.abs(Number(row.quantity || 0)),
          quantityPieces: Math.abs(Number(row.quantity || 0)),
        })),
      });
      await new Promise((r) => setTimeout(r, 250));
      handleTransferPrint();
      setTimeout(() => setPrintData(null), 1000);
    } catch (error: any) {
      window.alert(error?.message || 'تعذر طباعة التحويلة.');
    } finally {
      setProcessing(false);
    }
  };

  const editRow = async (tx: StockTransaction) => {
    if (!tx.id) return;
    if (tx.movementType === 'TRANSFER') {
      window.alert('تعديل التحويلة غير مدعوم مباشرة. احذف التحويلة ثم أنشئها من جديد.');
      return;
    }

    const currentDisplayQty = tx.movementType === 'OUT'
      ? Math.abs(Number(tx.quantity || 0))
      : Number(tx.quantity || 0);
    const qtyLabel = tx.movementType === 'ADJUSTMENT'
      ? 'أدخل قيمة التسوية الجديدة (+/-):'
      : 'أدخل الكمية الجديدة:';
    const quantityRaw = window.prompt(qtyLabel, String(currentDisplayQty));
    if (quantityRaw == null) return;
    const nextQty = Number(quantityRaw);
    if (Number.isNaN(nextQty)) {
      window.alert('أدخل رقمًا صحيحًا للكمية.');
      return;
    }

    const refRaw = window.prompt('رقم المرجع (اختياري):', tx.referenceNo ?? '');
    if (refRaw == null) return;

    setProcessing(true);
    try {
      await stockService.updateMovement(tx, {
        quantity: nextQty,
        referenceNo: refRaw.trim() || undefined,
      });
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر تعديل الحركة.');
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedRows.length === 0) return;
    if (bulkAction === 'export') {
      exportExcel(selectedRows);
      return;
    }
    if (bulkAction === 'delete') {
      await deleteRows(selectedRows);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">سجل حركات المخزون</h2>
          <p className="text-sm text-slate-500 font-medium">تتبع كامل لكل حركة على المنتجات والخامات.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportExcel(effectiveExportRows)}
          disabled={!can('inventory.transactions.export') || effectiveExportRows.length === 0}
        >
          <span className="material-icons-round text-sm">download</span>
          تصدير Excel
        </Button>
      </div>

      <Card className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
            placeholder="بحث بالاسم أو الكود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="">كل المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)}>
            <option value="">كل أنواع الحركة</option>
            <option value="IN">وارد</option>
            <option value="OUT">منصرف</option>
            <option value="TRANSFER">تحويل</option>
            <option value="ADJUSTMENT">تسوية</option>
          </select>
          <div className="flex gap-2">
            <select
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as 'export' | 'delete' | '')}
              disabled={selectedRows.length === 0}
            >
              <option value="">إجراء على المحدد</option>
              {can('inventory.transactions.export') && <option value="export">تصدير المحدد Excel</option>}
              {can('inventory.transactions.delete') && <option value="delete">حذف المحدد</option>}
            </select>
            <Button
              variant="outline"
              onClick={() => void handleBulkAction()}
              disabled={!bulkAction || selectedRows.length === 0 || processing}
            >
              تنفيذ
            </Button>
          </div>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="select all"
                  />
                </th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">التاريخ</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الصنف</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الحركة</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الكمية</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">المخزن</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">المنفذ</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">لا توجد حركات مطابقة.</td></tr>}
              {filtered.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!tx.id && selectedSet.has(tx.id)}
                      onChange={() => toggleSelectRow(tx.id)}
                      aria-label="select row"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{tx.itemName}</p>
                    <p className="text-xs text-slate-400 font-mono">{tx.itemCode}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant="info">{movementLabel[tx.movementType] ?? tx.movementType}</Badge></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {tx.quantity >= 0 ? '+' : ''}{formatNumber(tx.quantity)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{warehouseMap.get(tx.warehouseId) ?? tx.warehouseId}</td>
                  <td className="px-4 py-3 text-sm">{tx.createdBy}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {can('inventory.transactions.export') && (
                        <Button
                          variant="outline"
                          onClick={() => exportExcel([tx])}
                        >
                          <span className="material-icons-round text-sm">download</span>
                          Excel
                        </Button>
                      )}
                      {can('inventory.transactions.print') && tx.movementType === 'TRANSFER' && (
                        <Button
                          variant="outline"
                          onClick={() => void printTransferFromRow(tx)}
                          disabled={processing}
                        >
                          <span className="material-icons-round text-sm">print</span>
                          طباعة
                        </Button>
                      )}
                      {can('inventory.transactions.edit') && (
                        <Button
                          variant="outline"
                          onClick={() => void editRow(tx)}
                          disabled={processing}
                        >
                          <span className="material-icons-round text-sm">edit</span>
                          تعديل
                        </Button>
                      )}
                      {can('inventory.transactions.delete') && (
                        <Button
                          variant="outline"
                          onClick={() => void deleteRows([tx])}
                          disabled={processing}
                        >
                          <span className="material-icons-round text-sm">delete</span>
                          حذف
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>
    </div>
  );
};
