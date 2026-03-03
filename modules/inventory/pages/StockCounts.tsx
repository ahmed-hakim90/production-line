import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockCountSession, StockItemBalance, Warehouse } from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';

export const StockCounts: React.FC = () => {
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const { can } = usePermission();

  const [sessions, setSessions] = useState<StockCountSession[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeSession, setActiveSession] = useState<StockCountSession | null>(null);
  const [msg, setMsg] = useState<string>('');

  const loadData = async () => {
    const [ses, whs, bals] = await Promise.all([
      stockService.getCountSessions(),
      warehouseService.getAll(),
      stockService.getBalances(),
    ]);
    setSessions(ses);
    setWarehouses(whs);
    setBalances(bals);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );

  const openSession = async () => {
    if (!warehouseId) return;
    setCreating(true);
    setMsg('');
    try {
      const warehouseRows = balances.filter((b) => b.warehouseId === warehouseId);
      if (warehouseRows.length === 0) {
        setMsg('لا توجد أصناف في هذا المخزن لبدء الجرد.');
        return;
      }
      await stockService.createCountSession({
        warehouseId,
        warehouseName: warehouseNameById.get(warehouseId) || warehouseId,
        note: 'جلسة جرد جديدة',
        createdBy: userDisplayName || 'Current User',
        lines: warehouseRows.map((row) => ({
          itemType: row.itemType,
          itemId: row.itemId,
          itemName: row.itemName,
          itemCode: row.itemCode,
          expectedQty: Number(row.quantity || 0),
          countedQty: Number(row.quantity || 0),
        })),
      });
      await loadData();
      setMsg('تم فتح جلسة الجرد بنجاح.');
    } finally {
      setCreating(false);
    }
  };

  const saveLines = async () => {
    if (!activeSession?.id) return;
    await stockService.saveCountLines(activeSession.id, activeSession.lines);
    await loadData();
    setMsg('تم حفظ كميات الجرد.');
  };

  const approveSession = async () => {
    if (!activeSession) return;
    await stockService.approveCountSession(activeSession, userDisplayName || 'Current User');
    setActiveSession(null);
    await loadData();
    setMsg('تم اعتماد الجرد وترحيل الفروقات.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">جرد المخزون</h2>
        <p className="page-subtitle">إنشاء جلسات جرد واعتماد فروق الكميات كتسويات تلقائية.</p>
      </div>

      <Card title="فتح جلسة جرد جديدة">
        <div className="flex flex-col sm:flex-row gap-3">
          <select className="flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">اختر المخزن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Button variant="primary" onClick={() => void openSession()} disabled={!warehouseId || creating || !can('inventory.counts.manage')}>
            <span className="material-icons-round text-sm">playlist_add_check</span>
            بدء الجرد
          </Button>
        </div>
        {msg && <p className="mt-3 text-sm font-bold text-slate-600">{msg}</p>}
      </Card>

      <Card title="جلسات الجرد">
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد جلسات جرد حتى الآن.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                <div className="erp-page-head">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-text)]">{session.warehouseName}</p>
                    <p className="text-xs text-slate-400">{new Date(session.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={session.status === 'approved' ? 'success' : session.status === 'counted' ? 'warning' : 'info'}>
                      {session.status === 'approved' ? 'معتمد' : session.status === 'counted' ? 'معد للجرد' : 'مفتوح'}
                    </Badge>
                    <Button variant="outline" onClick={() => setActiveSession(session)}>
                      <span className="material-icons-round text-sm">visibility</span>
                      فتح
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {activeSession && (
        <Card title={`جلسة جرد: ${activeSession.warehouseName}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الصنف</th>
                  <th className="erp-th text-center">المتوقع</th>
                  <th className="erp-th text-center">المعدود</th>
                  <th className="erp-th text-center">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {activeSession.lines.map((line, idx) => {
                  const diff = Number(line.countedQty || 0) - Number(line.expectedQty || 0);
                  return (
                    <tr key={`${line.itemType}_${line.itemId}`}>
                      <td className="px-3 py-2">
                        <p className="text-sm font-bold">{line.itemName}</p>
                        <p className="text-xs text-[var(--color-text-muted)] font-mono">{line.itemCode}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{formatNumber(line.expectedQty)}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          className="w-28 rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-2 py-1.5 bg-[#f8f9fa] text-center"
                          value={line.countedQty}
                          onChange={(e) => {
                            const countedQty = Number(e.target.value);
                            setActiveSession((prev) => {
                              if (!prev) return prev;
                              const lines = [...prev.lines];
                              lines[idx] = { ...lines[idx], countedQty };
                              return { ...prev, lines };
                            });
                          }}
                          disabled={activeSession.status === 'approved'}
                        />
                      </td>
                      <td className={`px-3 py-2 text-center font-bold tabular-nums ${diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {diff > 0 ? '+' : ''}{formatNumber(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setActiveSession(null)}>إغلاق</Button>
            {activeSession.status !== 'approved' && (
              <>
                <Button variant="outline" onClick={() => void saveLines()} disabled={!can('inventory.counts.manage')}>
                  <span className="material-icons-round text-sm">save</span>
                  حفظ الجرد
                </Button>
                <Button variant="primary" onClick={() => void approveSession()} disabled={!can('inventory.counts.manage')}>
                  <span className="material-icons-round text-sm">verified</span>
                  اعتماد وترحيل الفروق
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
