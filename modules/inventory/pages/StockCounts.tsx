import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';

export const StockCounts: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryWarehouseId = searchParams.get('warehouseId') || '';
  const fromSupplies = searchParams.get('from') === 'supplies';
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    routingConfigured,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();

  const [sessions, setSessions] = useState<StockCountSession[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<StockItemBalance[]>([]);
  const [warehouseId, setWarehouseId] = useState(
    () => queryWarehouseId || scopedWarehouseId || '',
  );
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const loadData = async () => {
    const [ses, whs, bals] = await Promise.all([
      stockService.getCountSessions(),
      warehouseService.getWarehousesForReportingFilters(),
      stockService.getBalances(),
    ]);
    setSessions(ses);
    setWarehouses(filterWarehouses(whs));
    setBalances(bals);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]),
    );
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, queryWarehouseId, resolveScopedWarehouseId]);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );

  const selectedWarehouseName = warehouseNameById.get(warehouseId) || warehouseId;

  const visibleSessions = useMemo(() => {
    if (!warehouseId) return sessions;
    return sessions.filter((session) => session.warehouseId === warehouseId);
  }, [sessions, warehouseId]);

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
      setMsg('تم فتح جلسة الجرد. أدخل الكميات الفعلية ثم طابق واعتمد الفروقات.');
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
        <h2 className="page-title">جرد ومطابقة المخزون</h2>
        <p className="page-subtitle">
          فتح جرد → إدخال الكميات الفعلية → مطابقة واعتماد الفروقات كتسويات مخزنية.
        </p>
      </div>

      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {(fromSupplies || scoped) && warehouseId && (
        <p className="text-sm font-medium text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          جرد مخزن المستلزمات: <span className="font-bold">{selectedWarehouseName}</span>.
          المطابقة تعتمد فروق العد (الفعلي مقابل النظام) كتسويات مخزنية.
        </p>
      )}

      <Card title="مسار الجرد والمطابقة">
        <ol className="mb-4 space-y-1 text-sm text-slate-600 list-decimal list-inside">
          <li>افتح جلسة جرد للمخزن المحدد.</li>
          <li>أدخل الكميات الفعلية لكل صنف.</li>
          <li>طابق الفروقات واعتمدها لترحيل التسويات.</li>
        </ol>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select
            value={warehouseId || 'none'}
            disabled={warehouseSelectLocked}
            onValueChange={(value) => setWarehouseId(value === 'none' ? '' : value)}
          >
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

      <Card title="جلسات الجرد والمطابقة">
        {visibleSessions.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد جلسات جرد حتى الآن.</p>
        ) : (
          <div className="space-y-3">
            {visibleSessions.map((session) => (
              <div key={session.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                <div className="erp-page-head">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-text)]">{session.warehouseName}</p>
                    <p className="text-xs text-slate-400">{new Date(session.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={session.status === 'approved' ? 'success' : session.status === 'counted' ? 'warning' : 'info'}>
                      {session.status === 'approved'
                        ? 'مطابق ومعتمد'
                        : session.status === 'counted'
                          ? 'جاهز للمطابقة'
                          : 'مفتوح للعد'}
                    </Badge>
                    <Button variant="outline" onClick={() => viewCountSession(session)}>
                      <span className="material-icons-round text-sm">visibility</span>
                      {session.status === 'approved' ? 'عرض' : 'عدّ ومطابقة'}
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
