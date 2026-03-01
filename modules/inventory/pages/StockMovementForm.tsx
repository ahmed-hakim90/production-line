import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Button, SearchableSelect } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { stockService } from '../services/stockService';
import { transferApprovalService } from '../services/transferApprovalService';
import { rawMaterialService } from '../services/rawMaterialService';
import { warehouseService } from '../services/warehouseService';
import type { RawMaterial, Warehouse, StockItemBalance, TransferRequestLine } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import { shareToWhatsApp, type ShareResult } from '../../../utils/reportExport';
import { parseInventoryInByCodeExcel, type InventoryInImportResult } from '../../../utils/importInventoryInByCode';
import { downloadInventoryInByCodeTemplate } from '../../../utils/downloadTemplates';
import { StockTransferPrint, type StockTransferPrintData } from '../components';

type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
type ItemType = 'finished_good' | 'raw_material';
type TransferUnit = 'piece' | 'carton';
type TransferLine = {
  id: string;
  itemId: string;
  quantity: number;
  unit: TransferUnit;
};
const INV_REF_REGEX = /^INV-(\d+)$/i;
const formatInvReference = (seq: number) => `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;
const createTransferLine = (): TransferLine => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemId: '',
  quantity: 0,
  unit: 'piece',
});

export const StockMovementForm: React.FC = () => {
  const location = useLocation();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const defaultProductionWarehouseId = useAppStore(
    (s) => s.systemSettings.planSettings?.defaultProductionWarehouseId ?? '',
  );
  const { can } = usePermission();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);

  const [itemType, setItemType] = useState<ItemType>('finished_good');
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [movementType, setMovementType] = useState<MovementType>('IN');
  const [quantity, setQuantity] = useState<number>(0);
  const [transferItems, setTransferItems] = useState<TransferLine[]>([createTransferLine()]);
  const [nextReferenceSeq, setNextReferenceSeq] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const [previewData, setPreviewData] = useState<StockTransferPrintData | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<InventoryInImportResult | null>(null);

  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseCode, setNewWarehouseCode] = useState('');
  const [newRawMaterialName, setNewRawMaterialName] = useState('');
  const [newRawMaterialCode, setNewRawMaterialCode] = useState('');
  const [newRawMaterialUnit, setNewRawMaterialUnit] = useState('kg');
  const [newRawMaterialMin, setNewRawMaterialMin] = useState(0);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showRawMaterialModal, setShowRawMaterialModal] = useState(false);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer',
  });

  const loadData = async () => {
    const [whs, rms, txs, bals] = await Promise.all([
      warehouseService.getAll(),
      rawMaterialService.getAll(),
      stockService.getTransactions(),
      stockService.getBalances(),
    ]);
    setWarehouses(whs.filter((w) => w.isActive !== false));
    setRawMaterials(rms.filter((m) => m.isActive !== false));
    setBalances(bals);
    const maxExisting = txs.reduce((max, tx) => {
      const ref = (tx.referenceNo || '').trim();
      const match = ref.match(INV_REF_REGEX);
      if (!match) return max;
      return Math.max(max, Number(match[1] || 0));
    }, 0);
    setNextReferenceSeq(maxExisting + 1);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'create-warehouse' && can('inventory.warehouses.manage')) {
      setShowWarehouseModal(true);
    }
    if (action === 'create-raw-material' && can('inventory.items.manage')) {
      setShowRawMaterialModal(true);
    }
  }, [location.search, can]);

  const referenceNo = useMemo(() => formatInvReference(nextReferenceSeq), [nextReferenceSeq]);

  const rawProductMetaById = useMemo(
    () => new Map(_rawProducts.map((p) => [p.id, p])),
    [_rawProducts],
  );

  const finishedGoodOptions = useMemo(() => products.map((p) => {
    const raw = rawProductMetaById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      minStock: 0,
      unitsPerCarton: Number(raw?.unitsPerCarton || 0),
    };
  }), [products, rawProductMetaById]);

  const rawMaterialOptions = useMemo(() => rawMaterials.map((m) => ({
    id: m.id || '',
    name: m.name,
    code: m.code,
    minStock: Number(m.minStock || 0),
  })), [rawMaterials]);

  const itemOptions = itemType === 'finished_good' ? finishedGoodOptions : rawMaterialOptions;
  const selectedItem = itemOptions.find((item) => item.id === itemId);
  const tamAlsnaaWarehouse = useMemo(
    () =>
      warehouses.find((w) => {
        const n = (w.name || '').trim().toLowerCase();
        return n === 'تم الصنع' || n.includes('تم الصنع');
      }) ?? null,
    [warehouses],
  );
  const autoTransferSourceWarehouseId = defaultProductionWarehouseId || tamAlsnaaWarehouse?.id || '';
  const isFinishedTransferFlow = movementType === 'TRANSFER' && itemType === 'finished_good';
  const hasAutoTransferSource = !!autoTransferSourceWarehouseId;
  const effectiveWarehouseId = isFinishedTransferFlow
    ? (autoTransferSourceWarehouseId || warehouseId)
    : warehouseId;
  const selectedFromWarehouse = warehouses.find((w) => w.id === effectiveWarehouseId);
  const selectedToWarehouse = warehouses.find((w) => w.id === toWarehouseId);
  const itemSelectOptions = useMemo(
    () =>
      itemOptions.map((opt) => {
        const row = balances.find(
          (b) =>
            b.warehouseId === effectiveWarehouseId &&
            b.itemType === itemType &&
            b.itemId === opt.id,
        );
        const available = Number(row?.quantity || 0);
        return {
          value: opt.id,
          label: `${opt.name} (${opt.code}) — المتاح: ${available}`,
        };
      }),
    [itemOptions, balances, effectiveWarehouseId, itemType],
  );
  const warehouseSelectOptions = useMemo(
    () =>
      warehouses.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [warehouses],
  );
  const toWarehouseSelectOptions = useMemo(
    () =>
      warehouses
        .filter((w) => w.id !== effectiveWarehouseId)
        .map((w) => ({
          value: w.id || '',
          label: `${w.name} (${w.code})`,
        })),
    [warehouses, effectiveWarehouseId],
  );

  const getItemById = (id: string) => itemOptions.find((item) => item.id === id);

  const getAvailableForItem = (lineItemId: string) => {
    if (!lineItemId || !effectiveWarehouseId) return 0;
    const row = balances.find(
      (b) =>
        b.warehouseId === effectiveWarehouseId &&
        b.itemType === itemType &&
        b.itemId === lineItemId,
    );
    return Number(row?.quantity || 0);
  };

  const lineQuantityInPieces = (line: TransferLine) => {
    const item = getItemById(line.itemId);
    if (!item) return Number(line.quantity || 0);
    if (itemType === 'finished_good' && line.unit === 'carton') {
      return Number(line.quantity || 0) * Number(item.unitsPerCarton || 0);
    }
    return Number(line.quantity || 0);
  };

  useEffect(() => {
    if (!isFinishedTransferFlow || !hasAutoTransferSource) return;
    if (warehouseId !== autoTransferSourceWarehouseId) {
      setWarehouseId(autoTransferSourceWarehouseId);
    }
  }, [isFinishedTransferFlow, hasAutoTransferSource, warehouseId, autoTransferSourceWarehouseId]);

  const resetForm = () => {
    setItemId('');
    setWarehouseId('');
    setToWarehouseId('');
    setMovementType('IN');
    setQuantity(0);
    setTransferItems([createTransferLine()]);
  };

  const buildTransferPrintData = (resolvedReferenceNo: string, txId: string | null): StockTransferPrintData => {
    const now = new Date().toISOString();
    const transferNo = (resolvedReferenceNo || (txId ? `TR-${txId.slice(0, 8)}` : `TR-${Date.now()}`));
    const printableItems = transferItems
      .map((line) => {
        const item = getItemById(line.itemId);
        if (!item) return null;
        const quantityPieces = lineQuantityInPieces(line);
        return {
          itemName: item.name,
          itemCode: item.code,
          unitLabel: itemType === 'finished_good'
            ? (line.unit === 'carton' ? 'كرتونة' : 'قطعة')
            : 'وحدة',
          quantity: Number(line.quantity || 0),
          quantityPieces,
          unitsPerCarton: itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
        };
      })
      .filter(Boolean) as NonNullable<StockTransferPrintData['items']>;
    return {
      transferNo,
      createdAt: now,
      fromWarehouseName: selectedFromWarehouse?.name || effectiveWarehouseId,
      toWarehouseName: selectedToWarehouse?.name || toWarehouseId,
      items: printableItems,
      createdBy: userDisplayName || 'Current User',
    };
  };

  const showShareFeedback = (result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل صورة التحويلة ونسخها — افتح واتساب والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التحويلة — أرفقها في محادثة واتساب';
    setMessage({ type: 'success', text: msg });
  };

  const openImportPicker = () => {
    if (!can('inventory.transactions.create')) return;
    importFileRef.current?.click();
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportParsing(true);
    setImportResult(null);
    setShowImportModal(true);
    try {
      const result = await parseInventoryInByCodeExcel(file, _rawProducts);
      setImportResult(result);
    } catch (error: any) {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
      setMessage({ type: 'error', text: error?.message || 'تعذر قراءة ملف الاستيراد.' });
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    if (!effectiveWarehouseId) {
      setMessage({ type: 'error', text: 'اختر المخزن أولاً قبل حفظ الاستيراد.' });
      return;
    }
    const validRows = importResult.rows.filter((row) => row.errors.length === 0);
    if (validRows.length === 0) {
      setMessage({ type: 'error', text: 'لا توجد صفوف صالحة للحفظ.' });
      return;
    }
    setImportSaving(true);
    try {
      const actor = userDisplayName || 'Current User';
      const baseRef = `IM-${Date.now()}`;
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        await stockService.createMovement({
          warehouseId: effectiveWarehouseId,
          itemType: 'finished_good',
          itemId: row.productId,
          itemName: row.productName,
          itemCode: row.productCode,
          movementType: 'IN',
          quantity: Number(row.quantity || 0),
          referenceNo: `${baseRef}-${i + 1}`,
          note: `Imported from file: ${importFileName}`,
          createdBy: actor,
        });
      }
      await loadData();
      setShowImportModal(false);
      setImportResult(null);
      setImportFileName('');
      setMessage({ type: 'success', text: `تم استيراد ${validRows.length} صف بنجاح.` });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'تعذر حفظ بيانات الاستيراد.' });
    } finally {
      setImportSaving(false);
    }
  };

  const handleSubmit = async (afterSaveAction: 'none' | 'print' | 'preview' | 'share' = 'none') => {
    if (!effectiveWarehouseId) {
      setMessage({ type: 'error', text: 'اختر المخزن أولاً.' });
      return;
    }
    if (movementType === 'TRANSFER' && !toWarehouseId) {
      setMessage({ type: 'error', text: 'اختر مخزن الوجهة للتحويل.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const resolvedReferenceNo = referenceNo;
      let txId: string | null = null;

      if (movementType === 'TRANSFER') {
        if (transferItems.length === 0) {
          setMessage({ type: 'error', text: 'أضف صنفًا واحدًا على الأقل في التحويلة.' });
          return;
        }

        const duplicate = new Set<string>();
        for (const line of transferItems) {
          const item = getItemById(line.itemId);
          if (!item) {
            setMessage({ type: 'error', text: 'كل صف يجب أن يحتوي على صنف.' });
            return;
          }
          if (Number(line.quantity || 0) <= 0) {
            setMessage({ type: 'error', text: `كمية الصنف "${item.name}" يجب أن تكون أكبر من صفر.` });
            return;
          }
          const key = `${line.itemId}__${line.unit}`;
          if (duplicate.has(key)) {
            setMessage({ type: 'error', text: `لا يمكن تكرار نفس الصنف بنفس الوحدة أكثر من مرة: ${item.name}` });
            return;
          }
          duplicate.add(key);

          if (itemType === 'finished_good' && line.unit === 'carton' && Number(item.unitsPerCarton || 0) <= 0) {
            setMessage({ type: 'error', text: `الصنف "${item.name}" لا يحتوي وحدات/كرتونة.` });
            return;
          }
        }

        const requestLines = transferItems
          .map((line) => {
            const item = getItemById(line.itemId);
            if (!item) return null;
            return {
              itemType,
              itemId: item.id,
              itemName: item.name,
              itemCode: item.code,
              quantity: lineQuantityInPieces(line),
              minStock: item.minStock,
            };
          })
          .filter((line): line is TransferRequestLine => Boolean(line));
        if (!requestLines.length) {
          setMessage({ type: 'error', text: 'تعذر تجهيز أصناف طلب التحويل.' });
          return;
        }

        txId = await transferApprovalService.createRequest({
          fromWarehouseId: effectiveWarehouseId,
          fromWarehouseName: selectedFromWarehouse?.name || '',
          toWarehouseId,
          toWarehouseName: selectedToWarehouse?.name || '',
          referenceNo: resolvedReferenceNo,
          lines: requestLines,
          note: '',
          createdBy: userDisplayName || 'Current User',
        });
      } else {
        if (!selectedItem) {
          setMessage({ type: 'error', text: 'اختر الصنف أولًا.' });
          return;
        }
        if (movementType !== 'ADJUSTMENT' && quantity <= 0) {
          setMessage({ type: 'error', text: 'الكمية يجب أن تكون أكبر من صفر.' });
          return;
        }
        if (movementType === 'ADJUSTMENT' && quantity === 0) {
          setMessage({ type: 'error', text: 'كمية التسوية لا يمكن أن تساوي صفر.' });
          return;
        }
        const effectiveQuantity = Number(quantity || 0);

        txId = await stockService.createMovement({
          warehouseId: effectiveWarehouseId,
          toWarehouseId: movementType === 'TRANSFER' ? toWarehouseId : undefined,
          itemType,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          itemCode: selectedItem.code,
          movementType,
          quantity: effectiveQuantity,
          minStock: selectedItem.minStock,
          referenceNo: resolvedReferenceNo,
          createdBy: userDisplayName || 'Current User',
        });
      }
      setMessage({
        type: 'success',
        text: movementType === 'TRANSFER'
          ? 'تم إرسال التحويلة للاعتماد. سيتم ترحيل المخزون بعد الموافقة.'
          : 'تم تسجيل الحركة بنجاح.',
      });

      if (movementType === 'TRANSFER' && afterSaveAction !== 'none') {
        const payload = buildTransferPrintData(resolvedReferenceNo, txId);
        if (afterSaveAction === 'preview') {
          setPreviewData(payload);
          setShowPrintPreview(true);
        } else if (afterSaveAction === 'share') {
          setPrintData(payload);
          await new Promise((r) => setTimeout(r, 250));
          if (transferPrintRef.current) {
            const result = await shareToWhatsApp(transferPrintRef.current, `تحويلة مخزن ${payload.transferNo}`);
            showShareFeedback(result);
          }
          setTimeout(() => setPrintData(null), 1200);
        } else {
          setPrintData(payload);
          await new Promise((r) => setTimeout(r, 250));
          handleTransferPrint();
          setTimeout(() => setPrintData(null), 1200);
        }
      }

      setNextReferenceSeq((prev) => {
        const match = resolvedReferenceNo.match(INV_REF_REGEX);
        const fromUsedRef = match ? Number(match[1] || 0) + 1 : prev + 1;
        return Math.max(prev + 1, fromUsedRef);
      });
      resetForm();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'تعذر حفظ الحركة.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePrintFromPreview = async () => {
    if (!previewData) return;
    setPrintData(previewData);
    await new Promise((r) => setTimeout(r, 250));
    handleTransferPrint();
    setTimeout(() => setPrintData(null), 1200);
  };

  const handlePreviewWithoutSave = () => {
    if (!effectiveWarehouseId) {
      setMessage({ type: 'error', text: 'اختر المخزن أولاً.' });
      return;
    }
    if (movementType === 'TRANSFER' && !toWarehouseId) {
      setMessage({ type: 'error', text: 'اختر مخزن الوجهة للتحويل.' });
      return;
    }

    if (movementType === 'TRANSFER') {
      if (transferItems.length === 0) {
        setMessage({ type: 'error', text: 'أضف صنفًا واحدًا على الأقل في التحويلة.' });
        return;
      }
      for (const line of transferItems) {
        const item = getItemById(line.itemId);
        if (!item) {
          setMessage({ type: 'error', text: 'كل صف يجب أن يحتوي على صنف.' });
          return;
        }
        if (Number(line.quantity || 0) <= 0) {
          setMessage({ type: 'error', text: `كمية الصنف "${item.name}" يجب أن تكون أكبر من صفر.` });
          return;
        }
        if (itemType === 'finished_good' && line.unit === 'carton' && Number(item.unitsPerCarton || 0) <= 0) {
          setMessage({ type: 'error', text: `الصنف "${item.name}" لا يحتوي وحدات/كرتونة.` });
          return;
        }
      }
      setMessage(null);
      setPreviewData(buildTransferPrintData(referenceNo, null));
      setShowPrintPreview(true);
      return;
    }

    if (!selectedItem) {
      setMessage({ type: 'error', text: 'اختر الصنف أولًا.' });
      return;
    }
    if (movementType !== 'ADJUSTMENT' && quantity <= 0) {
      setMessage({ type: 'error', text: 'الكمية يجب أن تكون أكبر من صفر.' });
      return;
    }
    if (movementType === 'ADJUSTMENT' && quantity === 0) {
      setMessage({ type: 'error', text: 'كمية التسوية لا يمكن أن تساوي صفر.' });
      return;
    }

    const isCarton = itemType === 'finished_good' && Number(selectedItem.unitsPerCarton || 0) > 0;
    const qtyPieces = Number(quantity || 0);
    setMessage(null);
    setPreviewData({
      transferNo: referenceNo,
      createdAt: new Date().toISOString(),
      fromWarehouseName: selectedFromWarehouse?.name || effectiveWarehouseId,
      toWarehouseName: movementType === 'IN' ? 'وارد للمخزن' : movementType === 'OUT' ? 'منصرف من المخزن' : 'تسوية',
      items: [{
        itemName: selectedItem.name,
        itemCode: selectedItem.code,
        unitLabel: isCarton ? 'كرتونة' : 'قطعة',
        quantity: qtyPieces,
        quantityPieces: qtyPieces,
        unitsPerCarton: isCarton ? Number(selectedItem.unitsPerCarton || 0) : undefined,
      }],
      createdBy: userDisplayName || 'Current User',
    });
    setShowPrintPreview(true);
  };

  const createWarehouse = async () => {
    if (!newWarehouseName.trim() || !newWarehouseCode.trim()) return;
    await warehouseService.create({
      name: newWarehouseName.trim(),
      code: newWarehouseCode.trim(),
      isActive: true,
    });
    setNewWarehouseName('');
    setNewWarehouseCode('');
    await loadData();
  };

  const createRawMaterial = async () => {
    if (!newRawMaterialName.trim() || !newRawMaterialCode.trim()) return;
    await rawMaterialService.create({
      name: newRawMaterialName.trim(),
      code: newRawMaterialCode.trim(),
      unit: newRawMaterialUnit.trim() || 'unit',
      minStock: Number(newRawMaterialMin || 0),
      isActive: true,
    });
    setNewRawMaterialName('');
    setNewRawMaterialCode('');
    setNewRawMaterialUnit('kg');
    setNewRawMaterialMin(0);
    await loadData();
  };

  return (
    <div className="space-y-6">
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportFileSelected}
      />
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدخال حركة مخزون</h2>
        <p className="text-sm text-slate-500 font-medium">وارد، منصرف، تحويل أو تسوية مباشرة على الأرصدة.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={downloadInventoryInByCodeTemplate}>
            <span className="material-icons-round text-sm">download</span>
            تحميل قالب الاستيراد
          </Button>
          <Button variant="outline" onClick={openImportPicker} disabled={!can('inventory.transactions.create')}>
            <span className="material-icons-round text-sm">upload_file</span>
            استيراد بالكود والكمية
          </Button>
        </div>
      </div>

      <Card>
        <div className="mb-4 sm:mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-white">تسجيل الحركة</h3>
          <Button
            variant="outline"
            onClick={handlePreviewWithoutSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <span className="material-icons-round text-sm">preview</span>
            معاينة بدون حفظ
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">رقم المرجع</label>
            <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-100 dark:bg-slate-800/70 text-sm font-bold text-slate-700 dark:text-slate-200">
              {referenceNo}
            </div>
          </div>
          {movementType === 'TRANSFER' && (
            <div className="md:col-span-2 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3 text-center">
              <p className="text-xs font-bold text-primary/80">عنوان التحويلة</p>
              <p className="text-sm font-black text-primary sm:text-base">تحويلة مخزنية رقم {referenceNo}</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نوع الحركة</label>
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {[
                { value: 'IN' as MovementType, label: 'وارد' },
                { value: 'OUT' as MovementType, label: 'منصرف' },
                { value: 'TRANSFER' as MovementType, label: 'تحويل' },
                { value: 'ADJUSTMENT' as MovementType, label: 'تسوية (+/-)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMovementType(opt.value)}
                  className={`px-3 py-2.5 text-sm font-bold transition-all border-slate-200 dark:border-slate-700 ${
                    movementType === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  } ${opt.value === 'IN' || opt.value === 'OUT' ? 'border-b' : ''} ${opt.value === 'IN' || opt.value === 'TRANSFER' ? 'border-l' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {movementType === 'TRANSFER' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">مخزن الوجهة</label>
              <SearchableSelect
                options={toWarehouseSelectOptions}
                value={toWarehouseId}
                onChange={(value) => setToWarehouseId(value)}
                placeholder="ابحث واختر مخزن الوجهة"
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نوع الصنف</label>
            <select
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
              value={itemType}
              onChange={(e) => {
                const nextType = e.target.value as ItemType;
                setItemType(nextType);
                setItemId('');
                setTransferItems((prev) =>
                  prev.map((line) => ({ ...line, itemId: '', unit: nextType === 'finished_good' ? line.unit : 'piece' })),
                );
              }}
            >
              <option value="finished_good">منتج نهائي</option>
              <option value="raw_material">مادة خام</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">المخزن</label>
            {isFinishedTransferFlow && hasAutoTransferSource ? (
              <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-100 dark:bg-slate-800/70 text-sm font-bold text-slate-700 dark:text-slate-200">
                {selectedFromWarehouse?.name || 'غير محدد'}
                <span className="text-xs text-slate-500 mr-2">(من تم الصنع)</span>
              </div>
            ) : (
              <SearchableSelect
                options={warehouseSelectOptions}
                value={warehouseId}
                onChange={(value) => setWarehouseId(value)}
                placeholder="ابحث واختر المخزن"
              />
            )}
          </div>
         
          {movementType !== 'TRANSFER' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">الصنف</label>
              <SearchableSelect
                options={itemSelectOptions}
                value={itemId}
                onChange={(value) => setItemId(value)}
                placeholder="ابحث واختر الصنف"
              />
            </div>
          )}
          {movementType !== 'TRANSFER' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">الكمية</label>
              <input
                type="number"
                step="any"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
          )}
          {movementType === 'TRANSFER' && (
            <div className="space-y-3 md:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-bold text-slate-600 dark:text-slate-300">أصناف التحويلة</label>
                <Button
                  variant="outline"
                  onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  <span className="material-icons-round text-sm">add</span>
                  إضافة منتج
                </Button>
              </div>
              <div className="space-y-3">
                {transferItems.map((line, idx) => {
                  const lineItem = getItemById(line.itemId);
                  const available = getAvailableForItem(line.itemId);
                  const requestedForItem = transferItems
                    .filter((x) => x.itemId === line.itemId)
                    .reduce((sum, x) => sum + lineQuantityInPieces(x), 0);
                  const remaining = available - requestedForItem;
                  return (
                    <div key={line.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 sm:p-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-500">الصنف #{idx + 1}</label>
                        <SearchableSelect
                          options={itemSelectOptions}
                          value={line.itemId}
                          onChange={(value) =>
                            setTransferItems((prev) =>
                              prev.map((x) => (x.id === line.id ? { ...x, itemId: value } : x)),
                            )
                          }
                          placeholder="ابحث واختر الصنف"
                        />
                        {line.itemId && (
                          <p className={`text-xs font-bold ${remaining < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                            المتاح: {available} | المتبقي بعد الإجمالي: {remaining}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-500">الوحدة</label>
                        {itemType === 'finished_good' ? (
                          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
                            <button
                              type="button"
                              onClick={() =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)),
                                )
                              }
                              className={`flex-1 px-2.5 py-2 text-xs sm:text-sm font-bold transition-all ${
                                line.unit === 'piece'
                                  ? 'bg-primary text-white'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              قطعة
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setTransferItems((prev) =>
                                  prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)),
                                )
                              }
                              className={`flex-1 px-2.5 py-2 text-xs sm:text-sm font-bold transition-all ${
                                line.unit === 'carton'
                                  ? 'bg-primary text-white'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              كرتونة
                            </button>
                          </div>
                        ) : (
                          <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-100 dark:bg-slate-800/70 text-sm font-bold text-slate-700 dark:text-slate-200">
                            وحدة
                          </div>
                        )}
                        {itemType === 'finished_good' && line.unit === 'carton' && (
                          <p className="text-xs text-slate-500">
                            {Number(lineItem?.unitsPerCarton || 0) > 0
                              ? `الوحدات/كرتونة: ${lineItem?.unitsPerCarton}`
                              : 'لا توجد قيمة وحدات/كرتونة لهذا المنتج.'}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-500">الكمية</label>
                        <input
                          type="number"
                          step="any"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                          value={line.quantity}
                          onChange={(e) =>
                            setTransferItems((prev) =>
                              prev.map((x) => (x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x)),
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-1 flex items-end">
                        <button
                          type="button"
                          onClick={() =>
                            setTransferItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev))
                          }
                          className="w-full rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 px-2 py-2 font-bold disabled:opacity-40"
                          disabled={transferItems.length <= 1}
                          title="حذف الصف"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {message && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* {movementType === 'TRANSFER' && (
            <Button
              variant="outline"
              onClick={() => void handleSubmit('preview')}
              disabled={!can('inventory.transactions.create') || saving}
              className="w-full sm:w-auto"
            >
              <span className="material-icons-round text-sm">{saving ? 'hourglass_top' : 'preview'}</span>
              حفظ ومعاينة الطباعة
            </Button>
          )} */}
          {movementType === 'TRANSFER' && (
            <Button
              variant="outline"
              onClick={() => void handleSubmit('share')}
              disabled={!can('inventory.transactions.create') || saving}
              className="w-full sm:w-auto"
            >
              <span className="material-icons-round text-sm">{saving ? 'hourglass_top' : 'share'}</span>
              حفظ ومشاركة واتساب
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void handleSubmit('none')}
            disabled={!can('inventory.transactions.create') || saving}
            className="w-full sm:w-auto"
          >
            <span className="material-icons-round text-sm">{saving ? 'hourglass_top' : 'save'}</span>
            حفظ الحركة
          </Button>
        </div>
      </Card>

      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

      {showPrintPreview && previewData && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowPrintPreview(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold">معاينة طباعة التحويلة</h3>
              <button onClick={() => setShowPrintPreview(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-2 sm:p-4 overflow-auto flex-1 bg-slate-50 dark:bg-slate-950/40">
              <div className="mx-auto w-fit">
                <StockTransferPrint data={previewData} printSettings={printTemplate} />
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPrintPreview(false)} className="w-full sm:w-auto">
                إغلاق
              </Button>
              <Button variant="primary" onClick={() => void handlePrintFromPreview()} className="w-full sm:w-auto">
                <span className="material-icons-round text-sm">print</span>
                طباعة الآن
              </Button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !importSaving && setShowImportModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">استيراد منتج نهائي بالكود</h3>
                <p className="text-xs text-slate-500 mt-1">{importFileName || '—'}</p>
              </div>
              <button
                onClick={() => !importSaving && setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600"
                disabled={importSaving}
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              {importParsing ? (
                <p className="text-sm text-slate-500">جاري تحليل الملف...</p>
              ) : !importResult ? (
                <p className="text-sm text-slate-500">لا توجد بيانات.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <p className="text-xs text-slate-500">إجمالي الصفوف</p>
                      <p className="text-lg font-black">{importResult.totalRows}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3">
                      <p className="text-xs text-emerald-700">صفوف صالحة</p>
                      <p className="text-lg font-black text-emerald-700">{importResult.validCount}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-900/10 p-3">
                      <p className="text-xs text-rose-700">صفوف بها أخطاء</p>
                      <p className="text-lg font-black text-rose-700">{importResult.errorCount}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2 text-xs font-black text-slate-500">#</th>
                          <th className="px-3 py-2 text-xs font-black text-slate-500">كود المنتج</th>
                          <th className="px-3 py-2 text-xs font-black text-slate-500">اسم المنتج</th>
                          <th className="px-3 py-2 text-xs font-black text-slate-500">الكمية</th>
                          <th className="px-3 py-2 text-xs font-black text-slate-500">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importResult.rows.map((row) => (
                          <tr key={`${row.rowIndex}-${row.productCode}`}>
                            <td className="px-3 py-2 text-sm">{row.rowIndex}</td>
                            <td className="px-3 py-2 text-sm font-bold">{row.productCode || '—'}</td>
                            <td className="px-3 py-2 text-sm">{row.productName || '—'}</td>
                            <td className="px-3 py-2 text-sm">{row.quantity || 0}</td>
                            <td className="px-3 py-2 text-sm">
                              {row.errors.length === 0 ? (
                                <span className="text-emerald-600 font-bold">صالح</span>
                              ) : (
                                <span className="text-rose-600 font-bold">{row.errors.join(' | ')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImportModal(false)} disabled={importSaving}>
                إغلاق
              </Button>
              <Button variant="primary" onClick={() => void handleImportSave()} disabled={importSaving || importParsing || !importResult}>
                <span className="material-icons-round text-sm">{importSaving ? 'hourglass_top' : 'save'}</span>
                حفظ الصفوف الصالحة
              </Button>
            </div>
          </div>
        </div>
      )}

      {showWarehouseModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowWarehouseModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">إضافة مخزن جديد</h3>
              <button onClick={() => setShowWarehouseModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                placeholder="اسم المخزن"
                value={newWarehouseName}
                onChange={(e) => setNewWarehouseName(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                placeholder="كود المخزن"
                value={newWarehouseCode}
                onChange={(e) => setNewWarehouseCode(e.target.value)}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWarehouseModal(false)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await createWarehouse();
                  setShowWarehouseModal(false);
                }}
                disabled={!can('inventory.warehouses.manage') || !newWarehouseName.trim() || !newWarehouseCode.trim()}
              >
                <span className="material-icons-round text-sm">warehouse</span>
                إضافة مخزن
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRawMaterialModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowRawMaterialModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">إضافة مادة خام</h3>
              <button onClick={() => setShowRawMaterialModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                placeholder="اسم المادة الخام"
                value={newRawMaterialName}
                onChange={(e) => setNewRawMaterialName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                  placeholder="الكود"
                  value={newRawMaterialCode}
                  onChange={(e) => setNewRawMaterialCode(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                  placeholder="الوحدة"
                  value={newRawMaterialUnit}
                  onChange={(e) => setNewRawMaterialUnit(e.target.value)}
                />
              </div>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
                placeholder="الحد الأدنى"
                value={newRawMaterialMin}
                onChange={(e) => setNewRawMaterialMin(Number(e.target.value))}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRawMaterialModal(false)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await createRawMaterial();
                  setShowRawMaterialModal(false);
                }}
                disabled={!can('inventory.items.manage') || !newRawMaterialName.trim() || !newRawMaterialCode.trim()}
              >
                <span className="material-icons-round text-sm">inventory_2</span>
                إضافة مادة خام
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
