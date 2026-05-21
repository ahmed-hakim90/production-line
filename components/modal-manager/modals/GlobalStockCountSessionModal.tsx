import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { stockService } from '../../../modules/inventory/services/stockService';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { StockAdjustmentReason, StockCountSession } from '../../../modules/inventory/types';
import { formatNumber } from '../../../utils/calculations';

type Payload = GlobalModalPayload & {
  session: StockCountSession;
  canManage?: boolean;
  createdBy?: string;
  onUpdated?: () => void | Promise<void>;
};

export const GlobalStockCountSessionModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_STOCK_COUNT_SESSION);
  const data = (payload || {}) as Payload;
  const [session, setSession] = useState<StockCountSession | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState<StockAdjustmentReason>('count_correction');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  React.useEffect(() => {
    if (isOpen && data.session) {
      setSession({ ...data.session, lines: [...data.session.lines] });
      setAdjustmentReason(data.session.adjustmentReason || 'count_correction');
      setMsg('');
    }
  }, [isOpen, data.session]);

  if (!isOpen || !session) return null;

  const saveLines = async () => {
    if (!session.id) return;
    setSaving(true);
    try {
      await stockService.saveCountLines(session.id, session.lines);
      await data.onUpdated?.();
      setMsg('تم حفظ كميات الجرد.');
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    setSaving(true);
    try {
      await stockService.approveCountSession(
        { ...session, adjustmentReason },
        data.createdBy || 'Current User',
      );
      await data.onUpdated?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => close()}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">جلسة جرد: {session.warehouseName}</h3>
            <p className="text-xs text-slate-500">{session.status} · {new Date(session.createdAt).toLocaleString('ar-EG')}</p>
          </div>
          <button type="button" onClick={() => close()}><X size={18} /></button>
        </div>
        <div className="p-4 overflow-auto flex-1">
          <table className="erp-table w-full text-right text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-2 py-2">الصنف</th>
                <th className="px-2 py-2 text-center">متوقع</th>
                <th className="px-2 py-2 text-center">معدود</th>
                <th className="px-2 py-2 text-center">فرق</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map((line, idx) => {
                const diff = Number(line.countedQty || 0) - Number(line.expectedQty || 0);
                return (
                  <tr key={`${line.itemType}_${line.itemId}`} className="border-b">
                    <td className="px-2 py-2 font-medium">{line.itemName}</td>
                    <td className="px-2 py-2 text-center">{formatNumber(line.expectedQty)}</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        className="w-24 border rounded px-2 py-1 text-center"
                        value={line.countedQty}
                        disabled={session.status === 'approved' || !data.canManage}
                        onChange={(e) => {
                          const countedQty = Number(e.target.value);
                          setSession((prev) => {
                            if (!prev) return prev;
                            const lines = [...prev.lines];
                            lines[idx] = { ...lines[idx], countedQty };
                            return { ...prev, lines };
                          });
                        }}
                      />
                    </td>
                    <td className={`px-2 py-2 text-center font-bold ${diff < 0 ? 'text-rose-600' : diff > 0 ? 'text-emerald-600' : ''}`}>
                      {diff > 0 ? '+' : ''}{formatNumber(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {session.status !== 'approved' && data.canManage && (
            <div className="mt-4 flex items-center gap-2">
              <label className="text-sm font-bold">سبب التسوية:</label>
              <select
                className="border rounded-lg px-2 py-1 text-sm"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value as StockAdjustmentReason)}
              >
                <option value="count_correction">تصحيح جرد</option>
                <option value="damage">تلف</option>
                <option value="missing">نقص</option>
                <option value="extra">زيادة</option>
                <option value="manual_correction">تصحيح يدوي</option>
              </select>
            </div>
          )}
          {msg && <p className="mt-2 text-sm text-emerald-700 font-bold">{msg}</p>}
        </div>
        <div className="px-5 py-3 border-t flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
          {session.status !== 'approved' && data.canManage && (
            <>
              <Button variant="outline" onClick={() => void saveLines()} disabled={saving}>حفظ</Button>
              <Button variant="primary" onClick={() => void approve()} disabled={saving}>اعتماد وترحيل</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
