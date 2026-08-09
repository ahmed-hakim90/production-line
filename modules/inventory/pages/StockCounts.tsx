import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { downloadStockCountErrors, downloadStockCountTemplate, parseStockCountSheet, type StockCountSheetResult } from '../lib/stockCountSheet';

const STOCK_COUNTS_CACHE_KEY = 'inventory:stock-counts';

type StockCountsPageData = {
  sessions: StockCountSession[];
  warehouses: Warehouse[];
  balances: StockItemBalance[];
};

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

  const {
    data,
    reload: reloadCached,
  } = useCachedPageLoad<StockCountsPageData>(
    STOCK_COUNTS_CACHE_KEY,
    async () => {
      const [ses, whs, bals] = await Promise.all([
        stockService.getCountSessions(),
        warehouseService.getWarehousesForReportingFilters(),
        stockService.getBalances(),
      ]);
      return {
        sessions: ses,
        warehouses: filterWarehouses(whs),
        balances: bals,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const sessions = data?.sessions ?? [];
  const warehouses = data?.warehouses ?? [];
  const balances = data?.balances ?? [];
  const awaitingApprovalCount = useMemo(
    () => sessions.filter((s) => s.status === 'counted').length,
    [sessions],
  );

  const [warehouseId, setWarehouseId] = useState(
    () => queryWarehouseId || scopedWarehouseId || '',
  );
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [countPreview, setCountPreview] = useState<{ fileName: string; data: ArrayBuffer; parsed: StockCountSheetResult } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    invalidatePageDataCache(STOCK_COUNTS_CACHE_KEY);
    await reloadCached(true);
  };

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

  const selectedBalances = useMemo(
    () => balances.filter((balance) => balance.warehouseId === warehouseId),
    [balances, warehouseId],
  );

  useEffect(() => {
    setCountPreview(null);
  }, [warehouseId]);

  const importCountSheet = async (file: File) => {
    if (!warehouseId || importing) return;
    setImporting(true);
    setMsg('');
    try {
      const data = await file.arrayBuffer();
      const parsed = parseStockCountSheet(data, selectedBalances);
      setCountPreview({ fileName: file.name, data, parsed });
      if (parsed.importedRows === 0) {
        setMsg('المعاينة غير قابلة للتأكيد: لم يتم العثور على كميات فعلية قابلة للاستيراد.');
        return;
      }
      setMsg(parsed.errors.length
        ? `تمت قراءة الملف وتوجد ${parsed.errors.length} أخطاء مانعة. راجع المعاينة قبل التأكيد.`
        : `المعاينة جاهزة: ${parsed.importedRows} صنف معدود و${parsed.changedRows} فرق. لم تُنشأ جلسة بعد.`);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'تعذر قراءة ملف الجرد.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmCountPreview = async () => {
    if (!countPreview || !warehouseId || countPreview.parsed.errors.length || countPreview.parsed.importedRows === 0) return;
    setImporting(true);
    try {
      await stockService.createCountSession({
        warehouseId,
        warehouseName: selectedWarehouseName,
        note: `جرد مرفوع من ${countPreview.fileName} — ${countPreview.parsed.importedRows} صنف`,
        createdBy: userDisplayName || 'Current User',
        lines: countPreview.parsed.lines,
      });
      setMsg(`تم إنشاء جلسة الجرد بعد إعادة تحقق الخادم؛ يوجد ${countPreview.parsed.changedRows} فرق للمراجعة والاعتماد.`);
      setCountPreview(null);
      await loadData();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'تعذر إنشاء جلسة الجرد. أعد رفع الملف.');
    } finally {
      setImporting(false);
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
          {awaitingApprovalCount > 0 ? `بانتظار الاعتماد: ${awaitingApprovalCount}. ` : ''}
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
        <div className="flex flex-col lg:flex-row gap-3">
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
          <Button
            variant="outline"
            onClick={() => downloadStockCountTemplate(selectedWarehouseName, selectedBalances)}
            disabled={!warehouseId || selectedBalances.length === 0}
          >
            <span className="material-icons-round text-sm">download</span>
            تنزيل قالب الجرد
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!warehouseId || importing || !can('inventory.counts.manage')}
          >
            <span className="material-icons-round text-sm">upload_file</span>
            {importing ? 'جارٍ قراءة الملف…' : 'رفع جرد Excel / CSV'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="رفع ملف جرد المخزن"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCountSheet(file);
            }}
          />
        </div>
        {msg && <p className="mt-3 text-sm font-bold text-slate-600">{msg}</p>}
      </Card>

      {countPreview && (
        <Card title={`معاينة الجرد — ${countPreview.fileName}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">صفوف المخزن</div><div className="text-xl font-bold">{countPreview.parsed.lines.length}</div></div>
            <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs text-emerald-700">معدود من الملف</div><div className="text-xl font-bold">{countPreview.parsed.importedRows}</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-700">فروقات</div><div className="text-xl font-bold">{countPreview.parsed.changedRows}</div></div>
            <div className="rounded-lg bg-rose-50 p-3"><div className="text-xs text-rose-700">أخطاء مانعة</div><div className="text-xl font-bold">{countPreview.parsed.errors.length}</div></div>
            <div className="rounded-lg bg-sky-50 p-3"><div className="text-xs text-sky-700">تحذيرات</div><div className="text-xl font-bold">{countPreview.parsed.warnings.length}</div></div>
          </div>
          {countPreview.parsed.errors.length > 0 && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {countPreview.parsed.errors.slice(0, 6).map((error) => <div key={error}>{error}</div>)}
            </div>
          )}
          {countPreview.parsed.warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {countPreview.parsed.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          )}
          <div className="max-h-80 overflow-auto rounded-lg border mb-4">
            <table className="w-full min-w-[680px] text-sm text-right">
              <thead className="bg-slate-100 sticky top-0"><tr><th className="p-2">الكود</th><th className="p-2">الصنف</th><th className="p-2">المتوقع</th><th className="p-2">الفعلي</th><th className="p-2">الفرق</th></tr></thead>
              <tbody>{countPreview.parsed.lines.filter((line) => Math.abs(line.countedQty - line.expectedQty) > 0.00001).slice(0, 100).map((line) => (
                <tr key={`${line.itemType}-${line.itemId}`} className="border-t"><td className="p-2">{line.itemCode || '—'}</td><td className="p-2 font-medium">{line.itemName}</td><td className="p-2 tabular-nums">{line.expectedQty}</td><td className="p-2 tabular-nums">{line.countedQty}</td><td className={`p-2 font-bold tabular-nums ${line.countedQty - line.expectedQty >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{(line.countedQty - line.expectedQty).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void confirmCountPreview()} disabled={importing || countPreview.parsed.errors.length > 0 || countPreview.parsed.importedRows === 0}>تأكيد إنشاء جلسة الجرد</Button>
            <Button variant="outline" onClick={() => { setCountPreview(null); setMsg('تم إلغاء المعاينة دون إنشاء جلسة.'); }}>إلغاء المعاينة</Button>
            {countPreview.parsed.errors.length > 0 && <Button variant="outline" onClick={() => downloadStockCountErrors(countPreview.parsed.errors)}>تنزيل تقرير الأخطاء</Button>}
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>إعادة رفع الملف</Button>
          </div>
        </Card>
      )}

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
