import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Card, Button } from '../components/UI';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { warehouseService } from '../services/warehouseService';
import type { InventoryTransferRequest, StockTransaction, TransferRequestLine, Warehouse } from '../types';
import { formatNumber } from '../../../utils/calculations';
import { exportHRData } from '../../../utils/exportExcel';
import { usePermission } from '../../../utils/permissions';
import { StockTransferPrint, StockTransferShareCard, type StockTransferPrintData } from '../components/StockTransferPrint';
import { useManagedPrint } from '../../../utils/printManager';
import { useAppStore } from '../../../store/useAppStore';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../utils/transferUnits';
import { shareToWhatsApp, type ShareResult } from '../../../utils/reportExport';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { toast } from '../../../components/Toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';
import { StockTransactionsTable } from './stockTransactions/StockTransactionsTable';
import { StockTransactionsDialogs } from './stockTransactions/StockTransactionsDialogs';
import { movementLabel } from './stockTransactions/types';
const APP_VERSION = __APP_VERSION__;
export const StockTransactions: React.FC = () => {
  const transferShareExportRootId = `stock-transfer-share-${useId().replace(/:/g, '')}`;
  const { can } = usePermission();
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const companyName = useAppStore((s) => s.systemSettings.branding?.factoryName ?? 'الشركة');
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
  const [loading, setLoading] = useState(true);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const [shareTransferData, setShareTransferData] = useState<StockTransferPrintData | null>(null);
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
  const [shareToast, setShareToast] = useState<string | null>(null);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const transferShareCardRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer-from-transactions',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [txs, whs] = await Promise.all([
        stockService.getTransactions(),
        warehouseService.getAll(),
      ]);
      const pending = (await transferApprovalService.getAll()).filter((row) => row.status === 'pending');
      setTransactions(txs);
      setPendingTransfers(pending);
      setWarehouses(whs);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
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
      toast.error(error?.message || 'تعذر حذف الحركات المحددة.');
    } finally {
      setProcessing(false);
    }
  };

  const printTransferFromRow = async (tx: StockTransaction) => {
    if (tx.movementType !== 'TRANSFER') return;
    const transferNo = tx.referenceNo?.trim();
    if (!transferNo) {
      toast.warning('لا يمكن طباعة التحويلة بدون رقم مرجع.');
      return;
    }

    setProcessing(true);
    try {
      const sameReference = await stockService.getTransactionsByReferenceNo(transferNo);
      const transferRows = sameReference.filter((row) => row.movementType === 'TRANSFER');
      const outRows = transferRows.filter((row) => row.transferDirection === 'OUT');
      const rowsForPrint = outRows.length > 0 ? outRows : transferRows;
      if (rowsForPrint.length === 0) {
        toast.warning('لا توجد بيانات كافية لطباعة هذه التحويلة.');
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
      toast.error(error?.message || 'تعذر طباعة التحويلة.');
    } finally {
      setProcessing(false);
    }
  };

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التحويلة — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  }, []);

  const waitForSharePaint = () =>
    new Promise<void>((r) => {
      requestAnimationFrame(() => setTimeout(r, 150));
    });

  const buildSharePayloadFromTransferLine = (row: StockTransaction): StockTransferPrintData | null => {
    const transferNo = row.referenceNo?.trim();
    if (!transferNo) return null;
    const display = getTransferDisplay(withResolvedUnitsPerCarton(row), transferDisplayUnit);
    return {
      transferNo,
      createdAt: row.createdAt,
      fromWarehouseName: warehouseMap.get(row.warehouseId) ?? row.warehouseId,
      toWarehouseName: (warehouseMap.get(row.toWarehouseId || '') ?? row.toWarehouseId) || '—',
      createdBy: row.createdBy,
      items: [
        {
          itemName: row.itemName,
          itemCode: row.itemCode,
          unitLabel: display.unitLabel,
          quantity: display.quantity,
          quantityPieces: Math.abs(Number(row.quantity || 0)),
          unitsPerCarton: Number(row.unitsPerCarton || 0) || undefined,
        },
      ],
    };
  };

  const shareTransferFromRow = async (tx: StockTransaction, scope: 'line' | 'transfer' = 'line') => {
    if (tx.movementType !== 'TRANSFER') return;

    setProcessing(true);
    try {
      let payload: StockTransferPrintData | null = null;
      let transferNo = '';

      if (scope === 'line') {
        payload = buildSharePayloadFromTransferLine(tx);
        if (!payload) {
          toast.warning('لا يمكن مشاركة التحويلة بدون رقم مرجع.');
          return;
        }
        transferNo = payload.transferNo;
      } else {
        transferNo = tx.referenceNo?.trim() || '';
        if (!transferNo) {
          toast.warning('لا يمكن مشاركة التحويلة بدون رقم مرجع.');
          return;
        }
        const sameReference = await stockService.getTransactionsByReferenceNo(transferNo);
        const transferRows = sameReference.filter((row) => row.movementType === 'TRANSFER');
        const outRows = transferRows.filter((row) => row.transferDirection === 'OUT');
        const rowsForPrint = outRows.length > 0 ? outRows : transferRows;
        if (rowsForPrint.length === 0) {
          toast.warning('لا توجد بيانات كافية لمشاركة هذه التحويلة.');
          return;
        }

        const first = rowsForPrint[0];
        payload = {
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
        };
      }

      setShareTransferData(payload);
      await waitForSharePaint();
      if (!transferShareCardRef.current) {
        setShareTransferData(null);
        return;
      }
      try {
        const result = await shareToWhatsApp(transferShareCardRef.current, `stock-transfer-${transferNo}`, {
          windowWidth: 720,
        });
        showShareFeedback(result);
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string };
        if (err?.name !== 'AbortError') {
          toast.error(err?.message || 'تعذر مشاركة التحويلة الآن. حاول مرة أخرى.');
        }
      } finally {
        setShareTransferData(null);
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر مشاركة التحويلة.');
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

  const sharePendingTransfer = async (row: InventoryTransferRequest) => {
    const payload = buildPendingPrintData(row);
    setShareTransferData(payload);
    await waitForSharePaint();
    if (!transferShareCardRef.current) {
      setShareTransferData(null);
      return;
    }
    setProcessing(true);
    try {
      const result = await shareToWhatsApp(
        transferShareCardRef.current,
        `stock-transfer-${row.referenceNo}`,
        { windowWidth: 720 },
      );
      showShareFeedback(result);
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'تعذر مشاركة التحويلة الآن. حاول مرة أخرى.');
      }
    } finally {
      setShareTransferData(null);
      setProcessing(false);
    }
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
      toast.error(error?.message || 'تعذر حفظ تعديل التحويلة المعلقة.');
    } finally {
      setProcessing(false);
    }
  };

  const editRow = async (tx: StockTransaction) => {
    if (!tx.id) return;
    if (tx.movementType === 'TRANSFER') {
      toast.warning('تعديل التحويلة غير مدعوم مباشرة. احذف التحويلة ثم أنشئها من جديد.');
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
      toast.warning('أدخل رقمًا صحيحًا للكمية.');
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
      toast.error(error?.message || 'تعذر تعديل الحركة.');
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
    <div className="erp-ds-clean space-y-5">
      <PageHeader
        title="سجل حركات المخزون"
        subtitle="تتبع كامل لكل حركة على المنتجات والخامات"
        icon="swap_horiz"
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: !can('inventory.transactions.export') || effectiveExportRows.length === 0,
            onClick: () => exportExcel(effectiveExportRows),
          },
        ]}
      />

      <Card className="!p-4">
        <SmartFilterBar
          searchPlaceholder="ابحث بالاسم أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'movement',
              placeholder: 'كل أنواع الحركة',
              options: [
                { value: 'IN', label: 'وارد' },
                { value: 'OUT', label: 'منصرف' },
                { value: 'TRANSFER', label: 'تحويل' },
                { value: 'ADJUSTMENT', label: 'تسوية' },
              ],
              width: 'w-[150px]',
            },
          ]}
          quickFilterValues={{ movement: movementFilter || 'all' }}
          onQuickFilterChange={(_, value) => setMovementFilter(value === 'all' ? '' : value)}
          advancedFilters={[
            {
              key: 'warehouse',
              label: 'المخزن',
              placeholder: 'كل المخازن',
              options: warehouses.map((warehouse) => ({ value: warehouse.id || '', label: warehouse.name })),
              width: 'w-[170px]',
            },
          ]}
          advancedFilterValues={{ warehouse: warehouseFilter || 'all' }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'warehouse') setWarehouseFilter(value === 'all' ? '' : value);
          }}
          onApply={() => undefined}
          applyLabel="عرض"
          extra={(
            <div className="inline-flex h-[34px] items-center gap-2">
              <Select
                value={bulkAction || 'none'}
                onValueChange={(value) => setBulkAction(value === 'none' ? '' : (value as 'export' | 'delete'))}
                disabled={selectedRows.length === 0}
              >
                <SelectTrigger className="h-[34px] min-w-[150px] rounded-lg border-slate-200 bg-white">
                  <SelectValue placeholder="إجراء على المحدد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">إجراء على المحدد</SelectItem>
                  {can('inventory.transactions.export') && <SelectItem value="export">تصدير المحدد Excel</SelectItem>}
                  {can('inventory.transactions.delete') && <SelectItem value="delete">حذف المحدد</SelectItem>}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="h-[34px]"
                onClick={() => void handleBulkAction()}
                disabled={!bulkAction || selectedRows.length === 0 || processing}
              >
                <Filter className="h-3.5 w-3.5" />
                تنفيذ
              </Button>
            </div>
          )}
          className="mb-0 border-0"
        />
      </Card>

      <Card className="!p-0 overflow-hidden">
        <StockTransactionsTable
          loading={loading}
          combinedRows={combinedRows}
          selectedSet={selectedSet}
          allFilteredSelected={allFilteredSelected}
          toggleSelectAllFiltered={toggleSelectAllFiltered}
          toggleSelectRow={toggleSelectRow}
          warehouseMap={warehouseMap}
          transferDisplayUnit={transferDisplayUnit}
          withResolvedUnitsPerCarton={withResolvedUnitsPerCarton}
          perm={{
            export: can('inventory.transactions.export'),
            print: can('inventory.transactions.print'),
            edit: can('inventory.transactions.edit'),
            delete: can('inventory.transactions.delete'),
          }}
          processing={processing}
          onExportExcel={exportExcel}
          onPrintTransfer={(tx) => void printTransferFromRow(tx)}
          onShareTransfer={(tx, scope) => void shareTransferFromRow(tx, scope ?? 'line')}
          onEditRow={(tx) => void editRow(tx)}
          onDeleteRows={(rows) => void deleteRows(rows)}
          onOpenApproved={setSelectedApprovedTransfer}
          onOpenPending={setSelectedPending}
          onPrintPending={(row) => void printPendingTransfer(row)}
          onSharePending={(row) => void sharePendingTransfer(row)}
          onOpenPendingEdit={openPendingForEdit}
        />
      </Card>
      <div style={{ position: 'fixed', right: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: 0 }}>
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>
      <div
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          zIndex: 2147483000,
          width: 720,
          overflow: 'hidden',
          pointerEvents: 'none',
          direction: 'rtl',
          isolation: 'isolate',
        }}
        aria-hidden
      >
        <StockTransferShareCard
          ref={transferShareCardRef}
          data={shareTransferData}
          companyName={companyName}
          version={APP_VERSION ?? ''}
          exportRootId={transferShareExportRootId}
        />
      </div>
      <StockTransactionsDialogs
        shareToast={shareToast}
        onDismissShareToast={() => setShareToast(null)}
        selectedPending={selectedPending}
        onClosePending={() => setSelectedPending(null)}
        selectedApprovedTransfer={selectedApprovedTransfer}
        onCloseApproved={() => setSelectedApprovedTransfer(null)}
        editPending={editPending}
        editLines={editLines}
        editNote={editNote}
        onEditNoteChange={setEditNote}
        onEditLineQuantity={(idx, value) =>
          setEditLines((prev) => prev.map((x, i) => (i === idx ? { ...x, requestQuantity: value } : x)))
        }
        onCloseEdit={() => setEditPending(null)}
        onSaveEdit={savePendingEdit}
        warehouseMap={warehouseMap}
        transferDisplayUnit={transferDisplayUnit}
        withResolvedUnitsPerCarton={withResolvedUnitsPerCarton}
        processing={processing}
        canPrint={can('inventory.transactions.print')}
        onPrintPendingFromModal={(row) => void printPendingTransfer(row)}
        onPrintApprovedFromModal={(line) => void printTransferFromRow(line)}
        onShareTransfer={(tx, scope) => void shareTransferFromRow(tx, scope ?? 'line')}
      />
    </div>
  );
};
