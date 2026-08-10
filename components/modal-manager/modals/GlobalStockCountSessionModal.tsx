import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { ToneActionButton } from '@/src/components/erp/TableIconAction';
import { stockService } from '../../../modules/inventory/services/stockService';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
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
      setMsg('تم حفظ الكميات الفعلية. راجع فروق المطابقة ثم اعتمد.');
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
    <ManagedModalPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => close()}>
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border bg-[var(--color-card)] shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold sm:text-lg">جرد ومطابقة: {session.warehouseName}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {session.status === 'approved'
                ? 'مطابق ومعتمد'
                : session.status === 'counted'
                  ? 'جاهز للمطابقة'
                  : 'مفتوح للعد'}
              {' · '}
              {new Date(session.createdAt).toLocaleString('ar-EG')}
            </p>
            {session.status !== 'approved' && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                أدخل الكميات الفعلية ثم طابق الفروقات واعتمدها كتسويات مخزنية.
              </p>
            )}
          </div>
          <button type="button" onClick={() => close()} className="shrink-0" aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4">
          <div className="overflow-x-auto">
          <table className="erp-table w-full min-w-[520px] text-right text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-bg)]">
                <th className="px-2 py-2">الصنف</th>
                <th className="px-2 py-2 text-center">رصيد النظام</th>
                <th className="px-2 py-2 text-center">الفعلي</th>
                <th className="px-2 py-2 text-center">فرق المطابقة</th>
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
                    <td className={`px-2 py-2 text-center font-bold ${diff < 0 ? 'text-[rgb(var(--color-danger))]' : diff > 0 ? 'text-[rgb(var(--color-success))]' : ''}`}>
                      {diff > 0 ? '+' : ''}{formatNumber(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {session.status !== 'approved' && data.canManage && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="text-sm font-bold">سبب التسوية:</label>
              <select
                className="rounded-lg border px-2 py-1 text-sm"
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
          {msg && <p className="mt-2 text-sm font-bold text-[rgb(var(--color-success))]">{msg}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-5">
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
          {session.status !== 'approved' && data.canManage && (
            <>
              <ToneActionButton action="save" onClick={() => void saveLines()} disabled={saving} loading={saving}>
                حفظ الكميات
              </ToneActionButton>
              <ToneActionButton action="approve" icon="playlist_add_check" onClick={() => void approve()} disabled={saving} loading={saving}>
                مطابقة واعتماد الفروقات
              </ToneActionButton>
            </>
          )}
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
