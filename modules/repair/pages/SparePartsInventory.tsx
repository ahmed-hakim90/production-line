import React, { useEffect, useState } from 'react';
import { sparePartsService } from '../services/sparePartsService';
import { useLowStockAlert } from '../hooks/useLowStockAlert';
import { LowStockAlert } from '../components/LowStockAlert';
import type { RepairSparePart, RepairSparePartStock, RepairPartsTransactionType } from '../types';
import { useAppStore } from '../../../store/useAppStore';

interface StockRow {
  part: RepairSparePart;
  stock: RepairSparePartStock | undefined;
}

export const SparePartsInventory: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  // For demo: use first branch. In production, get from user's repairBranchId
  const [branchId] = useState<string>(''); // TODO: resolve from user profile
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // New part form
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPart, setNewPart] = useState({
    name: '', code: '', category: '', unit: 'قطعة', minStock: 5, sellingPrice: 0,
  });

  // Stock adjustment
  const [adjustPartId, setAdjustPartId] = useState('');
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustType, setAdjustType] = useState<RepairPartsTransactionType>('IN');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { lowStockItems, alertVisible, dismiss } = useLowStockAlert(branchId, parts);

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    const unsubParts = sparePartsService.subscribe(branchId, setParts);
    const unsubStock = sparePartsService.subscribeStock(branchId, setStock);
    setLoading(false);
    return () => { unsubParts(); unsubStock(); };
  }, [branchId]);

  const stockMap = new Map(stock.map((s) => [s.partId, s]));

  const rows: StockRow[] = parts
    .filter((p) => p.isActive)
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({ part: p, stock: stockMap.get(p.id!) }));

  const handleAddPart = async () => {
    if (!newPart.name || !newPart.code) { setError('الاسم والكود مطلوبان'); return; }
    setSaving(true);
    try {
      await sparePartsService.create({ ...newPart, branchId, isActive: true }, uid!);
      setNewPart({ name: '', code: '', category: '', unit: 'قطعة', minStock: 5, sellingPrice: 0 });
      setShowAddPart(false);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleAdjust = async () => {
    if (!adjustPartId) return;
    const part = parts.find((p) => p.id === adjustPartId);
    if (!part) return;
    setSaving(true);
    try {
      await sparePartsService.adjustStock({
        branchId,
        partId: adjustPartId,
        partName: part.name,
        type: adjustType,
        quantity: adjustQty,
        notes: adjustNote,
        createdBy: uid!,
      });
      setAdjustPartId('');
      setAdjustQty(1);
      setAdjustNote('');
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {alertVisible && <LowStockAlert items={lowStockItems} onDismiss={dismiss} />}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">مخزن قطع الغيار</h1>
        <button
          onClick={() => setShowAddPart(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add_circle</span>
          إضافة قطعة
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute right-3 top-2.5 text-gray-400 text-xl">search</span>
        <input
          type="text"
          placeholder="ابحث باسم القطعة أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Stock Adjustment Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-4">تعديل المخزون</h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">القطعة</label>
            <select
              value={adjustPartId}
              onChange={(e) => setAdjustPartId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-48"
            >
              <option value="">اختر...</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">النوع</label>
            <select
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as RepairPartsTransactionType)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="IN">إضافة (IN)</option>
              <option value="OUT">صرف (OUT)</option>
              <option value="ADJUSTMENT">تعديل</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الكمية</label>
            <input
              type="number"
              value={adjustQty}
              onChange={(e) => setAdjustQty(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
              min="1"
            />
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs text-gray-500 mb-1">ملاحظة</label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="اختياري"
            />
          </div>
          <button
            onClick={handleAdjust}
            disabled={saving || !adjustPartId}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : 'تأكيد'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Parts Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
          لا توجد قطع غيار. أضف قطعة جديدة.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-right">
              <tr>
                <th className="px-4 py-3 font-semibold">القطعة</th>
                <th className="px-4 py-3 font-semibold">الكود</th>
                <th className="px-4 py-3 font-semibold">الفئة</th>
                <th className="px-4 py-3 font-semibold text-center">الكمية</th>
                <th className="px-4 py-3 font-semibold text-center">الحد الأدنى</th>
                <th className="px-4 py-3 font-semibold text-center">سعر البيع</th>
                <th className="px-4 py-3 font-semibold text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(({ part, stock: s }) => {
                const qty = s?.quantity ?? 0;
                const isLow = qty <= part.minStock;
                return (
                  <tr key={part.id} className={`hover:bg-gray-50 ${isLow ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{part.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{part.code}</td>
                    <td className="px-4 py-3 text-gray-500">{part.category}</td>
                    <td className={`px-4 py-3 text-center font-bold text-lg ${isLow ? 'text-red-600' : 'text-gray-800'}`}>
                      {qty}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{part.minStock}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{part.sellingPrice} ج</td>
                    <td className="px-4 py-3 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                          <span className="material-symbols-outlined text-sm">warning</span>
                          منخفض
                        </span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">جيد</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Part Modal */}
      {showAddPart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">إضافة قطعة غيار جديدة</h3>
              <button onClick={() => setShowAddPart(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'الاسم *', field: 'name', placeholder: 'شاشة LCD ...' },
                { label: 'الكود *', field: 'code', placeholder: 'SCR-001' },
                { label: 'الفئة', field: 'category', placeholder: 'شاشات' },
                { label: 'الوحدة', field: 'unit', placeholder: 'قطعة' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(newPart as any)[field]}
                    onChange={(e) => setNewPart((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder={placeholder}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى</label>
                  <input
                    type="number"
                    value={newPart.minStock}
                    onChange={(e) => setNewPart((p) => ({ ...p, minStock: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (ج)</label>
                  <input
                    type="number"
                    value={newPart.sellingPrice}
                    onChange={(e) => setNewPart((p) => ({ ...p, sellingPrice: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    min="0"
                  />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setShowAddPart(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={handleAddPart} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
