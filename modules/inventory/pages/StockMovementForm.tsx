import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, SearchableSelect } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { stockService } from '../services/stockService';
import { rawMaterialService } from '../services/rawMaterialService';
import { warehouseService } from '../services/warehouseService';
import type { RawMaterial, Warehouse } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import { StockTransferPrint, type StockTransferPrintData } from '../components';

type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
type ItemType = 'finished_good' | 'raw_material';
type TransferUnit = 'piece' | 'carton';

export const StockMovementForm: React.FC = () => {
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

  const [itemType, setItemType] = useState<ItemType>('finished_good');
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [movementType, setMovementType] = useState<MovementType>('IN');
  const [quantity, setQuantity] = useState<number>(0);
  const [transferUnit, setTransferUnit] = useState<TransferUnit>('piece');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);

  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseCode, setNewWarehouseCode] = useState('');
  const [newRawMaterialName, setNewRawMaterialName] = useState('');
  const [newRawMaterialCode, setNewRawMaterialCode] = useState('');
  const [newRawMaterialUnit, setNewRawMaterialUnit] = useState('kg');
  const [newRawMaterialMin, setNewRawMaterialMin] = useState(0);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showRawMaterialModal, setShowRawMaterialModal] = useState(false);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'stock-transfer',
  });

  const loadData = async () => {
    const [whs, rms] = await Promise.all([
      warehouseService.getAll(),
      rawMaterialService.getAll(),
    ]);
    setWarehouses(whs.filter((w) => w.isActive !== false));
    setRawMaterials(rms.filter((m) => m.isActive !== false));
  };

  useEffect(() => {
    void loadData();
  }, []);

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
  const effectiveWarehouseId = isFinishedTransferFlow
    ? (autoTransferSourceWarehouseId || warehouseId)
    : warehouseId;
  const selectedFromWarehouse = warehouses.find((w) => w.id === effectiveWarehouseId);
  const selectedToWarehouse = warehouses.find((w) => w.id === toWarehouseId);
  const itemSelectOptions = useMemo(
    () =>
      itemOptions.map((opt) => ({
        value: opt.id,
        label: `${opt.name} (${opt.code})`,
      })),
    [itemOptions],
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
        .filter((w) => w.id !== warehouseId)
        .map((w) => ({
          value: w.id || '',
          label: `${w.name} (${w.code})`,
        })),
    [warehouses, warehouseId],
  );

  const resetForm = () => {
    setItemId('');
    setWarehouseId('');
    setToWarehouseId('');
    setMovementType('IN');
    setQuantity(0);
    setTransferUnit('piece');
    setReferenceNo('');
    setNote('');
  };

  const handleSubmit = async (shouldPrintTransfer = false) => {
    if (!selectedItem || !warehouseId) {
      setMessage({ type: 'error', text: 'اختر الصنف والمخزن أولاً.' });
      return;
    }
    if (movementType === 'TRANSFER' && !toWarehouseId) {
      setMessage({ type: 'error', text: 'اختر مخزن الوجهة للتحويل.' });
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
    if (
      movementType === 'TRANSFER' &&
      itemType === 'finished_good' &&
      transferUnit === 'carton' &&
      Number(selectedItem.unitsPerCarton || 0) <= 0
    ) {
      setMessage({ type: 'error', text: 'هذا المنتج لا يحتوي وحدات/كرتونة. اختر التحويل بالقطعة أو حدّث بيانات المنتج.' });
      return;
    }

    const effectiveQuantity =
      movementType === 'TRANSFER' &&
      itemType === 'finished_good' &&
      transferUnit === 'carton'
        ? quantity * Number(selectedItem.unitsPerCarton || 0)
        : quantity;

    setSaving(true);
    setMessage(null);
    try {
      const txId = await stockService.createMovement({
        warehouseId,
        toWarehouseId: movementType === 'TRANSFER' ? toWarehouseId : undefined,
        itemType,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        itemCode: selectedItem.code,
        movementType,
        quantity: effectiveQuantity,
        minStock: selectedItem.minStock,
        referenceNo: referenceNo.trim() || undefined,
        note: note.trim() || undefined,
        createdBy: userDisplayName || 'Current User',
      });
      setMessage({ type: 'success', text: 'تم تسجيل الحركة بنجاح.' });

      if (shouldPrintTransfer && movementType === 'TRANSFER') {
        const now = new Date().toISOString();
        const transferNo = (referenceNo.trim() || (txId ? `TR-${txId.slice(0, 8)}` : `TR-${Date.now()}`));
        setPrintData({
          transferNo,
          createdAt: now,
          fromWarehouseName: selectedFromWarehouse?.name || warehouseId,
          toWarehouseName: selectedToWarehouse?.name || toWarehouseId,
          itemName: selectedItem.name,
          itemCode: selectedItem.code,
          quantityPieces: Number(effectiveQuantity || 0),
          quantityCartons: itemType === 'finished_good' && Number(selectedItem.unitsPerCarton || 0) > 0
            ? Number(effectiveQuantity || 0) / Number(selectedItem.unitsPerCarton || 1)
            : undefined,
          unitsPerCarton: itemType === 'finished_good' ? Number(selectedItem.unitsPerCarton || 0) : undefined,
          note: note.trim() || undefined,
          createdBy: userDisplayName || 'Current User',
        });
        await new Promise((r) => setTimeout(r, 250));
        handleTransferPrint();
        setTimeout(() => setPrintData(null), 1200);
      }

      resetForm();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'تعذر حفظ الحركة.' });
    } finally {
      setSaving(false);
    }
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
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدخال حركة مخزون</h2>
        <p className="text-sm text-slate-500 font-medium">وارد، منصرف، تحويل أو تسوية مباشرة على الأرصدة.</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowWarehouseModal(true)}
            disabled={!can('inventory.warehouses.manage')}
          >
            <span className="material-icons-round text-sm">warehouse</span>
            إضافة مخزن جديد
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowRawMaterialModal(true)}
            disabled={!can('inventory.items.manage')}
          >
            <span className="material-icons-round text-sm">inventory_2</span>
            إضافة مادة خام
          </Button>
        </div>
      </div>

      <Card title="تسجيل الحركة">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نوع الصنف</label>
            <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={itemType} onChange={(e) => { setItemType(e.target.value as ItemType); setItemId(''); }}>
              <option value="finished_good">منتج نهائي</option>
              <option value="raw_material">مادة خام</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">الصنف</label>
            <SearchableSelect
              options={itemSelectOptions}
              value={itemId}
              onChange={(value) => setItemId(value)}
              placeholder="ابحث واختر الصنف"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نوع الحركة</label>
            <select className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={movementType} onChange={(e) => setMovementType(e.target.value as MovementType)}>
              <option value="IN">وارد</option>
              <option value="OUT">منصرف</option>
              <option value="TRANSFER">تحويل</option>
              <option value="ADJUSTMENT">تسوية (+/-)</option>
            </select>
          </div>
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
          {movementType === 'TRANSFER' && itemType === 'finished_good' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">وحدة التحويل</label>
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTransferUnit('piece')}
                  className={`px-4 py-2 text-sm font-bold transition-all ${
                    transferUnit === 'piece'
                      ? 'bg-primary text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  قطعة
                </button>
                <button
                  type="button"
                  onClick={() => setTransferUnit('carton')}
                  className={`px-4 py-2 text-sm font-bold transition-all ${
                    transferUnit === 'carton'
                      ? 'bg-primary text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  كرتونة
                </button>
              </div>
              {transferUnit === 'carton' && (
                <p className="text-xs text-slate-500">
                  {Number(selectedItem?.unitsPerCarton || 0) > 0
                    ? `الوحدات/كرتونة: ${selectedItem?.unitsPerCarton}`
                    : 'لا توجد قيمة وحدات/كرتونة لهذا المنتج.'}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">المخزن</label>
            <SearchableSelect
              options={warehouseSelectOptions}
              value={warehouseId}
              onChange={(value) => setWarehouseId(value)}
              placeholder="ابحث واختر المخزن"
            />
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
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">رقم المرجع</label>
            <input className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="INV-001" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">ملاحظة</label>
            <textarea className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {message && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {message.text}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          {movementType === 'TRANSFER' && (
            <Button
              variant="outline"
              onClick={() => void handleSubmit(true)}
              disabled={!can('inventory.transactions.create') || saving}
            >
              <span className="material-icons-round text-sm">{saving ? 'hourglass_top' : 'print'}</span>
              حفظ وطباعة التحويلة
            </Button>
          )}
          <Button variant="primary" onClick={() => void handleSubmit(false)} disabled={!can('inventory.transactions.create') || saving}>
            <span className="material-icons-round text-sm">{saving ? 'hourglass_top' : 'save'}</span>
            حفظ الحركة
          </Button>
        </div>
      </Card>

      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

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
