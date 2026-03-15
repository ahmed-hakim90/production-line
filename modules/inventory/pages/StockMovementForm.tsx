import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { exportToPDF, shareToWhatsApp, type ShareResult } from '../../../utils/reportExport';
import { StockTransferPrint, type StockTransferPrintData } from '../components';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../utils/transferUnits';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const { openModal } = useGlobalModalManager();
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const uid = useAppStore((s) => s.uid);
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const defaultProductionWarehouseId = useAppStore(
    (s) => s.systemSettings.planSettings?.defaultProductionWarehouseId ?? '',
  );
  const transferDisplayUnit = useAppStore(
    (s) => (s.systemSettings.planSettings?.transferDisplayUnit || 'piece') as TransferDisplayUnitMode,
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
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const [previewData, setPreviewData] = useState<StockTransferPrintData | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer',
  });

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openImportInByCodeModal = useCallback((nextItemType: 'finished_good' | 'raw_material' = 'finished_good') => {
    openModal(MODAL_KEYS.INVENTORY_IMPORT_IN_BY_CODE, {
      warehouseId: warehouseId || '',
      itemType: nextItemType,
      onSaved: () => {
        void loadData();
      },
    });
  }, [openModal, warehouseId, loadData]);

  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if (action === 'create-warehouse' && can('inventory.warehouses.manage')) {
      openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE);
    }
    if (action === 'create-raw-material' && can('inventory.items.manage')) {
      openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE);
    }
    if (action === 'import-in-by-code' && can('inventory.transactions.create')) {
      const itemTypeParam = new URLSearchParams(location.search).get('itemType');
      const importItemType = itemTypeParam === 'raw_material' ? 'raw_material' : 'finished_good';
      openImportInByCodeModal(importItemType);
    }
  }, [location.search, can, openModal, openImportInByCodeModal]);

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

  const resetForm = (nextMovementType: MovementType = 'IN') => {
    setItemId('');
    setWarehouseId('');
    setToWarehouseId('');
    setMovementType(nextMovementType);
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
        const display = getTransferDisplay(
          {
            itemType,
            quantity: quantityPieces,
            requestQuantity: Number(line.quantity || 0),
            requestUnit: itemType === 'finished_good' ? line.unit : 'unit',
            unitsPerCarton: itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
          },
          transferDisplayUnit,
        );
        return {
          itemName: item.name,
          itemCode: item.code,
          unitLabel: display.unitLabel,
          quantity: display.quantity,
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
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  };

  const printTransfer = async (fileName: string) => {
    if (!transferPrintRef.current) return;
    if (isMobilePrint) {
      await exportToPDF(transferPrintRef.current, fileName, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: 1,
      });
      return;
    }
    handleTransferPrint();
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
    setShareToast(null);
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
              requestQuantity: Number(line.quantity || 0),
              requestUnit: itemType === 'finished_good' ? line.unit : 'unit',
              unitsPerCarton: itemType === 'finished_good' ? Number(item.unitsPerCarton || 0) : undefined,
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
          createdBy: userDisplayName || userEmail || 'Current User',
          createdByUserId: uid || undefined,
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
            const result = await shareToWhatsApp(transferPrintRef.current, `stock-transfer-${payload.transferNo}`);
            showShareFeedback(result);
          }
          setTimeout(() => setPrintData(null), 1200);
        } else {
          setPrintData(payload);
          await new Promise((r) => setTimeout(r, 250));
          await printTransfer(`اذن-تحويل-${payload.transferNo}`);
          setTimeout(() => setPrintData(null), 1200);
        }
      }

      setNextReferenceSeq((prev) => {
        const match = resolvedReferenceNo.match(INV_REF_REGEX);
        const fromUsedRef = match ? Number(match[1] || 0) + 1 : prev + 1;
        return Math.max(prev + 1, fromUsedRef);
      });
      resetForm(movementType === 'TRANSFER' ? 'TRANSFER' : 'IN');
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
    await printTransfer(`اذن-تحويل-${previewData.transferNo}`);
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

  /* ── ERPNext field helpers ── */
  const fieldClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f8f9fa] text-[var(--color-text)] outline-none focus:border-[rgb(var(--color-primary))] focus:bg-white focus:ring-2 focus:ring-[rgb(var(--color-primary)/0.12)] transition-all font-medium';
  const fieldDisabledClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-[13px] bg-[#f0f2f5] text-[var(--color-text)] font-medium select-none cursor-default';
  const labelClass = 'block text-[11.5px] font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide';

  return (
    <div className="space-y-5">

      {/* ── Page Header ── */}
      <div className="erp-page-head">
        <div className="erp-page-title-block">
          <h2 className="page-title">إدخال حركة مخزون</h2>
          <p className="page-subtitle">وارد، منصرف، تحويل أو تسوية مباشرة على الأرصدة</p>
        </div>
      </div>

      {/* ── Main Form Card ── */}
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {/* Card header */}
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--color-text)]">تسجيل الحركة</span>
          {/* Reference badge */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">رقم المرجع</span>
            <span
              className="text-[12.5px] font-bold px-2.5 py-0.5 rounded-full"
              style={{
                background: 'rgb(var(--color-primary)/0.1)',
                color: 'rgb(var(--color-primary))',
                border: '1px solid rgb(var(--color-primary)/0.2)',
              }}
            >
              {referenceNo}
            </span>
          </div>
        </div>

        {/* Form body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

          {/* Movement type segmented */}
          <div>
            <label className={labelClass}>نوع الحركة</label>
            <div className="erp-date-seg" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              {([
                { value: 'TRANSFER' as MovementType, label: 'تحويل', icon: 'swap_horiz' },
                { value: 'IN'       as MovementType, label: 'وارد',  icon: 'south_west' },
                { value: 'OUT'      as MovementType, label: 'منصرف', icon: 'north_east' },
                { value: 'ADJUSTMENT' as MovementType, label: 'تسوية', icon: 'tune' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMovementType(opt.value)}
                  className={`erp-date-seg-btn${movementType === opt.value ? ' active' : ''}`}
                  style={{ justifyContent: 'center' }}
                >
                  <span className="material-icons-round" style={{ fontSize: 14 }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item type */}
          <div>
            <label className={labelClass}>نوع الصنف</label>
            <Select
              value={itemType}
              onValueChange={(value) => {
                const nextType = value as ItemType;
                setItemType(nextType);
                setItemId('');
                setTransferItems((prev) =>
                  prev.map((line) => ({ ...line, itemId: '', unit: nextType === 'finished_good' ? line.unit : 'piece' })),
                );
              }}
            >
              <SelectTrigger className={fieldClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finished_good">منتج نهائي</SelectItem>
                <SelectItem value="raw_material">مادة خام</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source warehouse */}
          <div>
            <label className={labelClass}>المخزن</label>
            {isFinishedTransferFlow && hasAutoTransferSource ? (
              <div className={fieldDisabledClass}>
                {selectedFromWarehouse?.name || 'غير محدد'}
                <span className="text-[11px] text-[var(--color-text-muted)] mr-2">(من تم الصنع)</span>
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

          {/* Destination warehouse (TRANSFER only) */}
          {movementType === 'TRANSFER' && (
            <div>
              <label className={labelClass}>مخزن الوجهة</label>
              <SearchableSelect
                options={toWarehouseSelectOptions}
                value={toWarehouseId}
                onChange={(value) => setToWarehouseId(value)}
                placeholder="ابحث واختر مخزن الوجهة"
              />
            </div>
          )}

          {/* Item (non-TRANSFER) */}
          {movementType !== 'TRANSFER' && (
            <div>
              <label className={labelClass}>الصنف</label>
              <SearchableSelect
                options={itemSelectOptions}
                value={itemId}
                onChange={(value) => setItemId(value)}
                placeholder="ابحث واختر الصنف"
              />
            </div>
          )}

          {/* Quantity (non-TRANSFER) */}
          {movementType !== 'TRANSFER' && (
            <div>
              <label className={labelClass}>الكمية</label>
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
          )}

          {/* Transfer lines (TRANSFER only) */}
          {movementType === 'TRANSFER' && (
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className={labelClass} style={{ marginBottom: 0 }}>أصناف التحويلة</label>
                <button
                  type="button"
                  className="btn btn-secondary hidden sm:inline-flex"
                  onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
                  disabled={saving}
                >
                  <span className="material-icons-round" style={{ fontSize: 15 }}>add</span>
                  إضافة منتج
                </button>
              </div>

              {/* Lines table */}
              <div
                className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden"
                style={{ background: 'var(--color-card)' }}
              >
                {/* Table header — desktop only */}
                <div
                  className="hidden sm:grid gap-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] px-3 py-2"
                  style={{
                    gridTemplateColumns: '1fr 160px 140px 40px',
                    borderBottom: '1px solid var(--color-border)',
                    background: '#f8f9fa',
                  }}
                >
                  <span>الصنف</span>
                  <span className="text-center">الوحدة</span>
                  <span className="text-center">الكمية</span>
                  <span />
                </div>

                {/* Rows */}
                {transferItems.map((line, idx) => {
                  const lineItem = getItemById(line.itemId);
                  const available = getAvailableForItem(line.itemId);
                  const requestedForItem = transferItems
                    .filter((x) => x.itemId === line.itemId)
                    .reduce((sum, x) => sum + lineQuantityInPieces(x), 0);
                  const remaining = available - requestedForItem;
                  return (
                    <div
                      key={line.id}
                      className="px-3 py-2.5"
                      style={{ borderBottom: idx < transferItems.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                    >
                      {/* ── Desktop: 4-column grid ── */}
                      <div
                        className="hidden sm:grid gap-0 items-start"
                        style={{ gridTemplateColumns: '1fr 160px 140px 40px' }}
                      >
                        {/* Item search */}
                        <div className="pl-3">
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
                            <p className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}>
                              متاح: {available} · متبقي: {remaining}
                            </p>
                          )}
                        </div>

                        {/* Unit toggle */}
                        <div className="px-2">
                          {itemType === 'finished_good' ? (
                            <div className="erp-date-seg" style={{ width: '100%', display: 'flex' }}>
                              <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                                onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)))}>قطعة</button>
                              <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                                onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)))}>كرتونة</button>
                            </div>
                          ) : (
                            <div className={fieldDisabledClass} style={{ textAlign: 'center' }}>وحدة</div>
                          )}
                          {itemType === 'finished_good' && line.unit === 'carton' && (
                            <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1 text-center">
                              {Number(lineItem?.unitsPerCarton || 0) > 0 ? `${lineItem?.unitsPerCarton} وحدة/كرتونة` : 'لا توجد قيمة'}
                            </p>
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="px-2">
                          <input type="number" step="any" className={fieldClass} placeholder="0" value={line.quantity || ''}
                            onChange={(e) => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x)))} />
                        </div>

                        {/* Delete */}
                        <div className="flex items-center justify-center pt-0.5">
                          <button type="button" onClick={() => setTransferItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev))}
                            className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                            disabled={transferItems.length <= 1} title="حذف الصف">
                            <span className="material-icons-round" style={{ fontSize: 16 }}>delete_outline</span>
                          </button>
                        </div>
                      </div>

                      {/* ── Mobile: stacked layout ── */}
                      <div className="sm:hidden space-y-2">
                        {/* Row 1: item label + delete */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[var(--color-text-muted)]">الصنف #{idx + 1}</span>
                          <button type="button"
                            onClick={() => setTransferItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev))}
                            className="w-7 h-7 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-all"
                            disabled={transferItems.length <= 1} title="حذف الصف">
                            <span className="material-icons-round" style={{ fontSize: 15 }}>delete_outline</span>
                          </button>
                        </div>

                        {/* Row 2: item searchable select */}
                        <div>
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
                            <p className={`text-[11px] font-semibold mt-1 ${remaining < 0 ? 'text-rose-600' : 'text-[var(--color-text-muted)]'}`}>
                              متاح: {available} · متبقي: {remaining}
                            </p>
                          )}
                        </div>

                        {/* Row 3: unit + quantity side by side */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">الوحدة</span>
                            {itemType === 'finished_good' ? (
                              <div className="erp-date-seg" style={{ width: '100%', display: 'flex' }}>
                                <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'piece' ? ' active' : ''}`}
                                  onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'piece' } : x)))}>قطعة</button>
                                <button type="button" className={`erp-date-seg-btn flex-1${line.unit === 'carton' ? ' active' : ''}`}
                                  onClick={() => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, unit: 'carton' } : x)))}>كرتونة</button>
                              </div>
                            ) : (
                              <div className={fieldDisabledClass} style={{ textAlign: 'center' }}>وحدة</div>
                            )}
                            {itemType === 'finished_good' && line.unit === 'carton' && (
                              <p className="text-[10.5px] text-[var(--color-text-muted)] mt-1">
                                {Number(lineItem?.unitsPerCarton || 0) > 0 ? `${lineItem?.unitsPerCarton} وحدة/كرتونة` : 'لا توجد قيمة'}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">الكمية</span>
                            <input type="number" step="any" className={fieldClass} placeholder="0" value={line.quantity || ''}
                              onChange={(e) => setTransferItems((prev) => prev.map((x) => (x.id === line.id ? { ...x, quantity: Number(e.target.value) } : x)))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add row button (mobile) */}
              <button
                type="button"
                className="btn btn-secondary w-full sm:hidden"
                onClick={() => setTransferItems((prev) => [...prev, createTransferLine()])}
                disabled={saving}
              >
                <span className="material-icons-round" style={{ fontSize: 15 }}>add</span>
                إضافة منتج
              </button>
            </div>
          )}
        </div>

        {/* Status message */}
        {message && (
          <div className={`mx-5 mb-4 erp-alert${message.type === 'success' ? ' erp-alert-success' : ' erp-alert-error'}`}>
            <span className="material-icons-round text-[16px] shrink-0">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Form actions */}
        <div
          className="px-5 py-3.5 border-t border-[var(--color-border)] flex flex-col-reverse gap-2 sm:flex-row sm:justify-end items-center"
          style={{ background: '#f8f9fa', borderRadius: '0 0 var(--border-radius-lg) var(--border-radius-lg)' }}
        >
          {movementType === 'TRANSFER' && (
            <button
              type="button"
              className="btn btn-secondary w-full sm:w-auto"
              onClick={() => void handleSubmit('share')}
              disabled={!can('inventory.transactions.create') || saving}
            >
              <span className="material-icons-round" style={{ fontSize: 15 }}>
                {saving ? 'hourglass_top' : 'share'}
              </span>
              حفظ ومشاركة واتساب
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary w-full sm:w-auto"
            onClick={() => void handleSubmit('none')}
            disabled={!can('inventory.transactions.create') || saving}
          >
            <span className="material-icons-round" style={{ fontSize: 15 }}>
              {saving ? 'hourglass_top' : 'save'}
            </span>
            {saving ? 'جاري الحفظ...' : 'حفظ الحركة'}
          </button>
        </div>
      </div>

      {/* Hidden print component */}
      <div style={{ position: 'fixed', right: 0, top: 0, zIndex: -1, pointerEvents: 'none' }}>
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

      {/* Share toast */}
      {shareToast && (
        <div
          className="fixed bottom-5 left-1/2 z-50 erp-alert erp-alert-success"
          style={{ transform: 'translateX(-50%)', maxWidth: 420, boxShadow: 'var(--shadow-modal)' }}
        >
          <span className="material-icons-round text-[16px] shrink-0">share</span>
          <p className="flex-1 text-[13px]">{shareToast}</p>
          <button
            onClick={() => setShareToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
          >
            <span className="material-icons-round" style={{ fontSize: 15 }}>close</span>
          </button>
        </div>
      )}

      {/* Print preview modal */}
      {showPrintPreview && previewData && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowPrintPreview(false)}
        >
          <div
            className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-5xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 18 }}>preview</span>
                <span className="text-[14px] font-semibold">معاينة طباعة التحويلة</span>
              </div>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors"
              >
                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
            {/* Modal body */}
            <div className="p-3 sm:p-5 overflow-auto flex-1" style={{ background: '#f8f9fa' }}>
              <div className="mx-auto w-fit">
                <StockTransferPrint data={previewData} printSettings={printTemplate} />
              </div>
            </div>
            {/* Modal footer */}
            <div
              className="px-5 py-3.5 border-t border-[var(--color-border)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2"
              style={{ background: '#f8f9fa' }}
            >
              <button className="btn btn-secondary w-full sm:w-auto" onClick={() => setShowPrintPreview(false)}>
                إغلاق
              </button>
              <button className="btn btn-primary w-full sm:w-auto" onClick={() => void handlePrintFromPreview()}>
                <span className="material-icons-round" style={{ fontSize: 15 }}>print</span>
                طباعة الآن
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
