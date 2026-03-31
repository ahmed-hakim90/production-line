import React, { useEffect, useState } from 'react';
import { sparePartsService } from '../services/sparePartsService';
import { repairCashService } from '../services/repairCashService';
import { repairReceiptService } from '../services/repairReceiptService';
import type { RepairSparePart, RepairSaleInvoiceLine } from '../types';
import { useAppStore } from '../../../store/useAppStore';

export const RepairSaleInvoice: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  const [branchId] = useState<string>(''); // TODO: resolve from user profile
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<RepairSaleInvoiceLine[]>([]);

  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState(0);

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    sparePartsService.getAll(branchId).then((p) => {
      setParts(p.filter((x) => x.isActive));
      setLoading(false);
    });
  }, [branchId]);

  const addLine = () => {
    if (!selectedPartId) return;
    const part = parts.find((p) => p.id === selectedPartId);
    if (!part) return;
    const price = selectedPrice || part.sellingPrice;
    setLines((prev) => {
      const existing = prev.find((l) => l.partId === selectedPartId);
      if (existing) {
        return prev.map((l) =>
          l.partId === selectedPartId
            ? { ...l, quantity: l.quantity + selectedQty, total: (l.quantity + selectedQty) * l.unitPrice }
            : l,
        );
      }
      return [...prev, {
        partId: part.id!,
        partName: part.name,
        quantity: selectedQty,
        unitPrice: price,
        total: selectedQty * price,
      }];
    });
    setSelectedPartId('');
    setSelectedQty(1);
    setSelectedPrice(0);
  };

  const removeLine = (partId: string) => setLines((prev) => prev.filter((l) => l.partId !== partId));

  const totalAmount = lines.reduce((s, l) => s + l.total, 0);

  const handleSubmit = async () => {
    if (!customerName || lines.length === 0) {
      setError('يرجى إدخال اسم العميل وإضافة منتج على الأقل');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const invoiceNo = await repairReceiptService.nextInvoiceNo();
      const session = await repairCashService.getOpenSession(branchId);
      await repairCashService.createSaleInvoice({
        branchId,
        invoiceNo,
        customerName,
        customerPhone: customerPhone || undefined,
        lines,
        totalAmount,
        notes: notes || undefined,
        sessionId: session?.id,
        createdBy: uid!,
      });
      setSuccess(`تم إنشاء الفاتورة ${invoiceNo} بنجاح`);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setLines([]);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">فاتورة بيع قطع غيار</h1>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Customer */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-gray-700 border-b border-gray-100 pb-3">بيانات العميل</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">الاسم *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="محمد أحمد"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">الهاتف</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="01xxxxxxxxx"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* Add Parts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-gray-700 border-b border-gray-100 pb-3">إضافة قطع</h2>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-gray-500 mb-1">القطعة</label>
            <select
              value={selectedPartId}
              onChange={(e) => {
                setSelectedPartId(e.target.value);
                const p = parts.find((x) => x.id === e.target.value);
                if (p) setSelectedPrice(p.sellingPrice);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">اختر...</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الكمية</label>
            <input
              type="number"
              value={selectedQty}
              onChange={(e) => setSelectedQty(Number(e.target.value))}
              className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min="1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">السعر (ج)</label>
            <input
              type="number"
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min="0"
            />
          </div>
          <button onClick={addLine} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            إضافة
          </button>
        </div>

        {/* Lines Table */}
        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-right pb-2">القطعة</th>
                <th className="text-center pb-2">الكمية</th>
                <th className="text-center pb-2">السعر</th>
                <th className="text-center pb-2">الإجمالي</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2">{l.partName}</td>
                  <td className="py-2 text-center">{l.quantity}</td>
                  <td className="py-2 text-center">{l.unitPrice} ج</td>
                  <td className="py-2 text-center font-semibold">{l.total} ج</td>
                  <td className="py-2 text-center">
                    <button onClick={() => removeLine(l.partId)} className="text-red-400 hover:text-red-600">
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Notes & Total */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
            placeholder="اختياري"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-gray-700">الإجمالي:</p>
          <p className="text-2xl font-bold text-blue-600">{totalAmount.toLocaleString('ar-EG')} ج</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving || lines.length === 0}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
          إصدار الفاتورة
        </button>
      </div>
    </div>
  );
};
