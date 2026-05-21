import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockCountSession, StockItemBalance, Warehouse } from '../types';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const StockCounts: React.FC = () => {
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();

  const [sessions, setSessions] = useState<StockCountSession[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const loadData = async () => {
    const [ses, whs, bals] = await Promise.all([
      stockService.getCountSessions(),
      warehouseService.getWarehousesForReportingFilters(),
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

  const startCountSession = async () => {
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

  const viewCountSession = (session: StockCountSession) => {
    openModal(MODAL_KEYS.INVENTORY_STOCK_COUNT_SESSION, {
      session,
      canManage: can('inventory.counts.manage'),
      createdBy: userDisplayName || 'Current User',
      onUpdated: () => {
        void loadData();
        setMsg('تم تحديث الجلسة.');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">جرد المخزون</h2>
        <p className="page-subtitle">إنشاء جلسات جرد واعتماد فروق الكميات كتسويات تلقائية.</p>
      </div>

      <Card title="فتح جلسة جرد جديدة">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={warehouseId || 'none'} onValueChange={(value) => setWarehouseId(value === 'none' ? '' : value)}>
            <SelectTrigger className="flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]">
              <SelectValue placeholder="اختر المخزن" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">اختر المخزن</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id!}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="primary" onClick={() => void startCountSession()} disabled={!warehouseId || creating || !can('inventory.counts.manage')}>
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
                    <Button variant="outline" onClick={() => viewCountSession(session)}>
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

    </div>
  );
};
