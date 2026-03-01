import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { warehouseService } from '../services/warehouseService';
import type { InventoryTransferRequest, StockTransaction, TransferRequestLine, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { exportHRData } from '../../../utils/exportExcel';
import { usePermission } from '../../../utils/permissions';
import { StockTransferPrint, type StockTransferPrintData } from '../components/StockTransferPrint';
import { useManagedPrint } from '../../../utils/printManager';
import { useAppStore } from '../../../store/useAppStore';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../utils/transferUnits';

const movementLabel: Record<string, string> = {
  IN: 'وارد',
  OUT: 'منصرف',
  TRANSFER: 'تحويل',
  ADJUSTMENT: 'تسوية',
};
export const StockTransactions: React.FC = () => {
  const { can } = usePermission();
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const transferDisplayUnit = useAppStore(
    (s) => (s.systemSettings.planSettings?.transferDisplayUnit || 'piece') as TransferDisplayUnitMode,
  );
  const rawProducts = useAppStore((s) => s._rawProducts);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<InventoryTransferRequest[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [movementFilter, setMovementFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'export' | 'delete' | ''>('');
  const [processing, setProcessing] = useState(false);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const [selectedPending, setSelectedPending] = useState<InventoryTransferRequest | null>(null);
  const [selectedApprovedTransfer, setSelectedApprovedTransfer] = useState<{
    referenceNo: string;
    createdAt: string;
    createdBy: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    lines: StockTransaction[];
  } | null>(null);
  const [editPending, setEditPending] = useState<InventoryTransferRequest | null>(null);
  const [editLines, setEditLines] = useState<TransferRequestLine[]>([]);
  const [editNote, setEditNote] = useState('');
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
    const pending = (await transferApprovalService.getAll()).filter((row) => row.status === 'pending');
    setTransactions(txs);
    setPendingTransfers(pending);
    setWarehouses(whs);
    setSelectedIds([]);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );
  const withResolvedUnitsPerCarton = <T extends { itemType: 'finished_good' | 'raw_material'; itemId: string; unitsPerCarton?: number }>(line: T): T => {
    if (line.itemType !== 'finished_good') return line;
    const resolved = Number(line.unitsPerCarton || unitsPerCartonByProductId.get(line.itemId) || 0);
    return { ...line, unitsPerCarton: resolved };
  };
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
  const pendingFiltered = useMemo(
    () =>
      pendingTransfers.filter((row) => {
        const q = search.trim().toLowerCase();
        const matchesWarehouse = !warehouseFilter || row.fromWarehouseId === warehouseFilter || row.toWarehouseId === warehouseFilter;
        const matchesMovement = !movementFilter || movementFilter === 'TRANSFER';
        const linesText = row.lines.map((line) => `${line.itemName} ${line.itemCode}`).join(' ').toLowerCase();
        const matchesSearch = !q || row.referenceNo.toLowerCase().includes(q) || linesText.includes(q);
        return matchesWarehouse && matchesMovement && matchesSearch;
      }),
    [pendingTransfers, search, warehouseFilter, movementFilter],
  );
  const combinedRows = useMemo(() => {
    const nonTransferRows = filtered.filter((tx) => tx.movementType !== 'TRANSFER');
    const transferRows = filtered.filter((tx) => tx.movementType === 'TRANSFER');
    const transferMap = new Map<string, StockTransaction[]>();
    for (const row of transferRows) {
      const ref = (row.referenceNo || '').trim() || `__NOREF__${row.id || Math.random().toString(36).slice(2)}`;
      const bucket = transferMap.get(ref) || [];
      bucket.push(row);
      transferMap.set(ref, bucket);
    }

    const txRows = nonTransferRows.map((tx) => ({
      kind: 'transaction' as const,
      sortAt: new Date(tx.createdAt).getTime(),
      tx,
    }));
    const approvedTransferRows = Array.from(transferMap.entries()).map(([referenceNo, rows]) => {
      const outRows = rows.filter((r) => r.transferDirection === 'OUT');
      const displayRows = outRows.length > 0 ? outRows : rows;
      const first = displayRows[0] || rows[0];
      return {
        kind: 'approved_transfer' as const,
        sortAt: new Date(first?.createdAt || 0).getTime(),
        group: {
          referenceNo: first?.referenceNo || referenceNo,
          createdAt: first?.createdAt || new Date().toISOString(),
          createdBy: first?.createdBy || '—',
          fromWarehouseId: first?.warehouseId || '',
          toWarehouseId: first?.toWarehouseId || '',
          lines: displayRows,
        },
      };
    });
    const pendingRows = pendingFiltered.map((row) => ({
      kind: 'pending' as const,
      sortAt: new Date(row.createdAt).getTime(),
      row,
    }));
    return [...txRows, ...approvedTransferRows, ...pendingRows].sort((a, b) => b.sortAt - a.sortAt);
  }, [filtered, pendingFiltered]);

  const toExportRows = (rows: StockTransaction[]) =>
    rows.map((tx) => ({
      'التاريخ': new Date(tx.createdAt).toLocaleString('ar-EG'),
      'الصنف': tx.itemName,
      'الكود': tx.itemCode,
      'نوع الصنف': tx.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام',
      'نوع الحركة': movementLabel[tx.movementType] ?? tx.movementType,
      'الكمية':
        tx.movementType === 'TRANSFER'
          ? `${formatNumber(getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit).quantity)} ${getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit).unitLabel}`
          : tx.quantity,
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
        items: rowsForPrint.map((row) => {
          const display = getTransferDisplay(withResolvedUnitsPerCarton(row), transferDisplayUnit);
          return {
            itemName: row.itemName,
            itemCode: row.itemCode,
            unitLabel: display.unitLabel,
            quantity: display.quantity,
            quantityPieces: Math.abs(Number(row.quantity || 0)),
            unitsPerCarton: Number(row.unitsPerCarton || 0) || undefined,
          };
        }),
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

  const buildPendingPrintData = (row: InventoryTransferRequest): StockTransferPrintData => ({
    transferNo: row.referenceNo,
    createdAt: row.createdAt,
    fromWarehouseName: warehouseMap.get(row.fromWarehouseId) ?? row.fromWarehouseId,
    toWarehouseName: warehouseMap.get(row.toWarehouseId) ?? row.toWarehouseId,
    createdBy: row.createdBy,
    items: row.lines.map((line) => {
      const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
      return {
        itemName: line.itemName,
        itemCode: line.itemCode,
        unitLabel: display.unitLabel,
        quantity: display.quantity,
        quantityPieces: Number(line.quantity || 0),
      };
    }),
  });

  const printPendingTransfer = async (row: InventoryTransferRequest) => {
    setPrintData(buildPendingPrintData(row));
    await new Promise((r) => setTimeout(r, 250));
    handleTransferPrint();
    setTimeout(() => setPrintData(null), 1000);
  };

  const openPendingForEdit = (row: InventoryTransferRequest) => {
    setEditPending(row);
    setEditLines(
      row.lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity || 0),
        requestQuantity: Number(line.requestQuantity ?? line.quantity ?? 0),
      })),
    );
    setEditNote(row.note || '');
  };

  const savePendingEdit = async () => {
    if (!editPending?.id) return;
    setProcessing(true);
    try {
      await transferApprovalService.updateRequest(editPending.id, {
        note: editNote,
        lines: editLines.map((line) => {
          const requested = Number(line.requestQuantity ?? line.quantity ?? 0);
          const unitsPerCarton = Number(line.unitsPerCarton || 0);
          const qtyInPieces =
            line.requestUnit === 'carton'
              ? requested * (unitsPerCarton > 0 ? unitsPerCarton : 1)
              : requested;
          return {
            ...line,
            requestQuantity: requested,
            quantity: qtyInPieces,
          };
        }),
      });
      setEditPending(null);
      setEditLines([]);
      setEditNote('');
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر حفظ تعديل التحويلة المعلقة.');
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
              {combinedRows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">لا توجد حركات مطابقة.</td></tr>}
              {combinedRows.map((entry) => {
                if (entry.kind === 'transaction') {
                  const tx = entry.tx;
                  return (
                    <tr key={`tx-${tx.id}`}>
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
                        {tx.movementType === 'TRANSFER' ? (
                          <span className="font-black tabular-nums text-emerald-600">
                            {(() => {
                              const display = getTransferDisplay(withResolvedUnitsPerCarton(tx), transferDisplayUnit);
                              return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                            })()}
                          </span>
                        ) : (
                          <span className={`font-black tabular-nums ${tx.quantity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {tx.quantity >= 0 ? '+' : ''}{formatNumber(tx.quantity)}
                          </span>
                        )}
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
                  );
                }

                if (entry.kind === 'approved_transfer') {
                  const group = entry.group;
                  const qtySummary = group.lines
                    .slice(0, 2)
                    .map((line) => {
                      const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                      return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                    })
                    .join('، ');
                  const fromName = warehouseMap.get(group.fromWarehouseId) ?? group.fromWarehouseId;
                  const toName = warehouseMap.get(group.toWarehouseId) ?? group.toWarehouseId;
                  return (
                    <tr key={`approved-transfer-${group.referenceNo}`} className="bg-emerald-50/30 dark:bg-emerald-900/10">
                      <td className="px-4 py-3 text-center text-slate-300">—</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(group.createdAt).toLocaleString('ar-EG')}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">تحويلة #{group.referenceNo}</p>
                        <p className="text-xs text-slate-500">{group.lines.length} صنف</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="info">تحويل</Badge>
                          <Badge variant="success">معتمدة</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                          {qtySummary}
                          {group.lines.length > 2 ? ' ...' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{fromName} ← {toName}</td>
                      <td className="px-4 py-3 text-sm">{group.createdBy}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setSelectedApprovedTransfer(group)}
                            disabled={processing}
                          >
                            <span className="material-icons-round text-sm">visibility</span>
                            فتح
                          </Button>
                          {can('inventory.transactions.print') && group.lines[0] && (
                            <Button
                              variant="outline"
                              onClick={() => void printTransferFromRow(group.lines[0])}
                              disabled={processing}
                            >
                              <span className="material-icons-round text-sm">print</span>
                              طباعة
                            </Button>
                          )}
                          {can('inventory.transactions.export') && (
                            <Button
                              variant="outline"
                              onClick={() => exportExcel(group.lines)}
                            >
                              <span className="material-icons-round text-sm">download</span>
                              Excel
                            </Button>
                          )}
                          {can('inventory.transactions.delete') && group.lines[0] && (
                            <Button
                              variant="outline"
                              onClick={() => void deleteRows([group.lines[0]])}
                              disabled={processing}
                            >
                              <span className="material-icons-round text-sm">delete</span>
                              حذف
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const row = entry.row;
                const qtySummary = row.lines
                  .slice(0, 2)
                  .map(
                    (line) => {
                      const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                      return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                    },
                  )
                  .join('، ');
                const fromName = warehouseMap.get(row.fromWarehouseId) ?? row.fromWarehouseId;
                const toName = warehouseMap.get(row.toWarehouseId) ?? row.toWarehouseId;
                return (
                  <tr key={`pending-${row.id}`} className="bg-amber-50/40 dark:bg-amber-900/10">
                    <td className="px-4 py-3 text-center text-slate-300">—</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString('ar-EG')}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">تحويلة معلقة #{row.referenceNo}</p>
                      <p className="text-xs text-slate-500">{row.lines.length} صنف</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">تحويل</Badge>
                        <Badge variant="warning">معلقة</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-black tabular-nums text-amber-700 dark:text-amber-300">
                        {qtySummary}
                        {row.lines.length > 2 ? ' ...' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{fromName} ← {toName}</td>
                    <td className="px-4 py-3 text-sm">{row.createdBy}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setSelectedPending(row)} disabled={processing}>
                          <span className="material-icons-round text-sm">visibility</span>
                          فتح
                        </Button>
                        <Button variant="outline" onClick={() => void printPendingTransfer(row)} disabled={processing}>
                          <span className="material-icons-round text-sm">print</span>
                          طباعة
                        </Button>
                        {can('inventory.transactions.edit') && (
                          <Button variant="outline" onClick={() => openPendingForEdit(row)} disabled={processing}>
                            <span className="material-icons-round text-sm">edit</span>
                            تعديل
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>
      {selectedPending && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedPending(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">طلب تحويلة معلقة #{selectedPending.referenceNo}</h3>
              <button onClick={() => setSelectedPending(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-500">من</p>
                  <p className="font-bold">{warehouseMap.get(selectedPending.fromWarehouseId) ?? selectedPending.fromWarehouseId}</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-500">إلى</p>
                  <p className="font-bold">{warehouseMap.get(selectedPending.toWarehouseId) ?? selectedPending.toWarehouseId}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-3 py-2 text-xs font-black text-slate-500">الصنف</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">النوع</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500 text-center">الكمية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedPending.lines.map((line) => (
                      <tr key={`${line.itemType}-${line.itemId}`}>
                        <td className="px-3 py-2 text-sm font-bold">{line.itemName} <span className="text-xs text-slate-400">({line.itemCode})</span></td>
                        <td className="px-3 py-2 text-sm">{line.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                        <td className="px-3 py-2 text-sm text-center font-black">
                          {(() => {
                            const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                            return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedPending(null)}>إغلاق</Button>
              <Button variant="primary" onClick={() => void printPendingTransfer(selectedPending)}>
                <span className="material-icons-round text-sm">print</span>
                طباعة
              </Button>
            </div>
          </div>
        </div>
      )}
      {selectedApprovedTransfer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedApprovedTransfer(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">تفاصيل التحويلة #{selectedApprovedTransfer.referenceNo}</h3>
              <button onClick={() => setSelectedApprovedTransfer(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-500">من</p>
                  <p className="font-bold">{warehouseMap.get(selectedApprovedTransfer.fromWarehouseId) ?? selectedApprovedTransfer.fromWarehouseId}</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-500">إلى</p>
                  <p className="font-bold">{warehouseMap.get(selectedApprovedTransfer.toWarehouseId) ?? selectedApprovedTransfer.toWarehouseId}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-3 py-2 text-xs font-black text-slate-500">الصنف</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">النوع</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500 text-center">الكمية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedApprovedTransfer.lines.map((line) => (
                      <tr key={`${line.id || ''}-${line.itemType}-${line.itemId}`}>
                        <td className="px-3 py-2 text-sm font-bold">{line.itemName} <span className="text-xs text-slate-400">({line.itemCode})</span></td>
                        <td className="px-3 py-2 text-sm">{line.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                        <td className="px-3 py-2 text-sm text-center font-black">
                          {(() => {
                            const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                            return `${formatNumber(display.quantity)} ${display.unitLabel}`;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedApprovedTransfer(null)}>إغلاق</Button>
              {can('inventory.transactions.print') && selectedApprovedTransfer.lines[0] && (
                <Button variant="primary" onClick={() => void printTransferFromRow(selectedApprovedTransfer.lines[0])}>
                  <span className="material-icons-round text-sm">print</span>
                  طباعة
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {editPending && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !processing && setEditPending(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">تعديل التحويلة المعلقة #{editPending.referenceNo}</h3>
              <button onClick={() => !processing && setEditPending(null)} className="text-slate-400 hover:text-slate-600" disabled={processing}>
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-600 dark:text-slate-300">ملاحظة</label>
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                {editLines.map((line, idx) => (
                  <div key={`${line.itemType}-${line.itemId}-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-7">
                      <p className="text-sm font-bold">{line.itemName}</p>
                      <p className="text-xs text-slate-400">{line.itemCode}</p>
                    </div>
                    <div className="md:col-span-5 space-y-1">
                      <label className="text-xs font-bold text-slate-500">
                        الكمية ({line.requestUnit === 'carton' ? 'كرتونة' : line.requestUnit === 'piece' ? 'قطعة' : 'وحدة'})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                        value={Number(line.requestQuantity ?? line.quantity ?? 0)}
                        onChange={(e) =>
                          setEditLines((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, requestQuantity: Number(e.target.value) } : x)),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setEditPending(null)} disabled={processing}>إلغاء</Button>
              <Button variant="primary" onClick={() => void savePendingEdit()} disabled={processing}>
                <span className="material-icons-round text-sm">{processing ? 'hourglass_top' : 'save'}</span>
                حفظ التعديلات
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
