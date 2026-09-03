import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Badge } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { stockService } from '../services/stockService';
import { warehouseService } from '../services/warehouseService';
import type { StockCountSession, StockItemBalance, StockLocationBalance, Warehouse, WarehouseLocation, WarehouseRack } from '../types';
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
import { useWarehouseCountSheetPrint } from '../hooks/useWarehouseCountSheetPrint';
import { WarehouseCountSheetPrintModal } from '../components/WarehouseCountSheetPrintModal';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import { locationBelongsToRack } from '../lib/warehouseCountSheet';

const STOCK_COUNTS_CACHE_KEY = 'inventory:stock-counts';
const STOCK_COUNTS_BALANCES_CACHE = 'inventory:stock-counts-balances';

type StockCountsListData = {
  sessions: StockCountSession[];
  warehouses: Warehouse[];
};

/** Open sheet imports already have diffs but may still be status=open (pre-fix sessions). */
function sessionHasMatchDiffs(session: StockCountSession): boolean {
  return (session.lines || []).some(
    (line) => Math.abs(Number(line.countedQty || 0) - Number(line.expectedQty || 0)) > 0.00001,
  );
}

function isReadyForMatching(session: StockCountSession): boolean {
  return session.status === 'counted'
    || (session.status === 'open' && sessionHasMatchDiffs(session));
}

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
  const { printWarehouseCount, printing } = useWarehouseCountSheetPrint();

  const {
    data: listData,
    loading: listLoading,
    refreshing: listRefreshing,
    reload: reloadList,
  } = useCachedPageLoad<StockCountsListData>(
    STOCK_COUNTS_CACHE_KEY,
    async () => {
      const [ses, whs] = await Promise.all([
        stockService.getCountSessions(),
        warehouseService.getWarehousesForReportingFilters(),
      ]);
      return {
        sessions: ses,
        warehouses: filterWarehouses(whs),
      };
    },
    { maxAgeMs: 45_000 },
  );

  const {
    data: balanceRows,
    loading: balancesLoading,
    reload: reloadBalances,
  } = useCachedPageLoad<StockItemBalance[]>(
    STOCK_COUNTS_BALANCES_CACHE,
    () => stockService.getBalances(),
    { maxAgeMs: 45_000 },
  );

  const sessions = listData?.sessions ?? [];
  const warehouses = listData?.warehouses ?? [];
  const balances = balanceRows ?? [];

  const loadData = async () => {
    invalidatePageDataCache(STOCK_COUNTS_CACHE_KEY);
    invalidatePageDataCache(STOCK_COUNTS_BALANCES_CACHE);
    invalidatePageDataCache('inventory:warehouse-workspace');
    invalidatePageDataCache('inventory:stock-balances');
    await Promise.all([reloadList(true), reloadBalances(true)]);
  };

  const awaitingApprovalCount = useMemo(
    () => sessions.filter((s) => isReadyForMatching(s)).length,
    [sessions],
  );

  const [warehouseId, setWarehouseId] = useState(
    () => queryWarehouseId || scopedWarehouseId || '',
  );
  const [countScope, setCountScope] = useState<'warehouse' | 'rack' | 'location'>('location');
  const [rackId, setRackId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [racks, setRacks] = useState<WarehouseRack[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationBalances, setLocationBalances] = useState<StockLocationBalance[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [countPreview, setCountPreview] = useState<{ fileName: string; data: ArrayBuffer; parsed: StockCountSheetResult } | null>(null);
  const [printPickerOpen, setPrintPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWarehouseId((prev) =>
      resolveScopedWarehouseId(prev, [queryWarehouseId, scopedWarehouseId]),
    );
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, queryWarehouseId, resolveScopedWarehouseId]);

  useEffect(() => {
    setRackId('');
    setLocationId('');
    setRacks([]);
    setLocations([]);
    setLocationBalances([]);
    if (!warehouseId) return;
    let cancelled = false;
    setScopeLoading(true);
    Promise.all([
      warehouseRackService.getAll(warehouseId),
      warehouseLocationService.getAll(warehouseId),
      stockService.getLocationBalances({ warehouseId }),
    ]).then(([nextRacks, nextLocations, nextBalances]) => {
      if (cancelled) return;
      setRacks(nextRacks.filter((row) => row.isActive !== false && row.id));
      setLocations(nextLocations.filter((row) => row.isActive !== false && row.id));
      setLocationBalances(nextBalances);
    }).catch((error) => {
      if (!cancelled) setMsg(error instanceof Error ? error.message : 'تعذر تحميل لوكيشنات المخزن.');
    }).finally(() => {
      if (!cancelled) setScopeLoading(false);
    });
    return () => { cancelled = true; };
  }, [warehouseId]);

  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );

  const selectedWarehouseName = warehouseNameById.get(warehouseId) || warehouseId;
  const selectedRack = racks.find((row) => row.id === rackId);
  const locationsForRack = useMemo(
    () => selectedRack ? locations.filter((row) => locationBelongsToRack(row, selectedRack)) : [],
    [locations, selectedRack],
  );
  const selectedLocation = locations.find((row) => row.id === locationId);
  const selectedLocationBalances = useMemo(
    () => locationBalances.filter((row) => row.locationId === locationId),
    [locationBalances, locationId],
  );
  const locationById = useMemo(() => new Map(locations.map((row) => [row.id, row])), [locations]);
  const rackLocationIds = useMemo(
    () => new Set(locationsForRack.map((row) => row.id).filter(Boolean)),
    [locationsForRack],
  );
  const scopedLocationBalances = useMemo(
    () => countScope === 'location'
      ? selectedLocationBalances
      : countScope === 'rack'
        ? locationBalances.filter((row) => rackLocationIds.has(row.locationId))
        : [],
    [countScope, locationBalances, rackLocationIds, selectedLocationBalances],
  );
  const countRows: Array<StockItemBalance & { locationId?: string; locationCode?: string }> = useMemo(() => (
    countScope === 'location' || countScope === 'rack'
      ? scopedLocationBalances.map((row) => ({
        id: row.id,
        warehouseId: row.warehouseId,
        itemType: row.itemType,
        itemId: row.itemId,
        itemName: row.itemName,
        itemCode: row.itemCode,
        quantity: row.quantity,
        minStock: row.minStock,
        updatedAt: row.updatedAt,
        locationId: row.locationId,
        locationCode: row.locationCode || locationById.get(row.locationId)?.code,
      }))
      : balances.filter((row) => row.warehouseId === warehouseId)
  ), [balances, countScope, locationById, scopedLocationBalances, warehouseId]);

  const visibleSessions = useMemo(() => {
    if (!warehouseId) return sessions;
    return sessions.filter((session) => session.warehouseId === warehouseId);
  }, [sessions, warehouseId]);

  const startCountSession = async () => {
    if (!warehouseId || (countScope === 'location' && !locationId) || (countScope === 'rack' && !rackId)) return;
    setCreating(true);
    setMsg('');
    try {
      if (countRows.length === 0) {
        setMsg(countScope === 'location'
          ? 'لا توجد أرصدة أصناف في اللوكيشن المحدد لبدء الجرد.'
          : countScope === 'rack'
            ? 'لا توجد أرصدة أصناف في الراك المحدد لبدء الجرد.'
            : 'لا توجد أصناف في هذا المخزن لبدء الجرد.');
        return;
      }
      await stockService.createCountSession({
        warehouseId,
        warehouseName: warehouseNameById.get(warehouseId) || warehouseId,
        countScope,
        locationId: countScope === 'location' ? locationId : undefined,
        rackId: countScope === 'rack' ? rackId : undefined,
        note: countScope === 'location'
          ? `جلسة جرد لوكيشن ${selectedLocation?.code || locationId}`
          : countScope === 'rack'
            ? `جلسة جرد راك ${selectedRack?.code || rackId}`
            : 'جلسة جرد جديدة',
        createdBy: userDisplayName || 'Current User',
        lines: countRows.map((row) => ({
          itemType: row.itemType,
          itemId: row.itemId,
          itemName: row.itemName,
          itemCode: row.itemCode,
          expectedQty: Number(row.quantity || 0),
          countedQty: Number(row.quantity || 0),
          locationId: row.locationId,
          locationCode: row.locationCode,
        })),
      });
      await loadData();
      setMsg(countScope === 'location'
        ? `تم فتح جلسة جرد اللوكيشن ${selectedLocation?.code || locationId}. أدخل الكميات الفعلية ثم طابق واعتمد الفروقات.`
        : countScope === 'rack'
          ? `تم فتح جلسة جرد الراك ${selectedRack?.code || rackId}. أدخل كميات كل رف ثم طابق واعتمد الفروقات.`
          : 'تم فتح جلسة الجرد. أدخل الكميات الفعلية ثم طابق واعتمد الفروقات.');
    } finally {
      setCreating(false);
    }
  };

  const selectedBalances = useMemo(
    () => countRows,
    [countRows],
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
        countScope,
        locationId: countScope === 'location' ? locationId : undefined,
        rackId: countScope === 'rack' ? rackId : undefined,
        note: `${countScope === 'location' ? `جرد لوكيشن ${selectedLocation?.code || locationId}` : 'جرد'} مرفوع من ${countPreview.fileName} — ${countPreview.parsed.importedRows} صنف`,
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
      onUpdated: async () => {
        await loadData();
        if (warehouseId) {
          const nextLocationBalances = await stockService.getLocationBalances({ warehouseId });
          setLocationBalances(nextLocationBalances);
        }
        setMsg('تم تحديث الجلسة.');
      },
    });
  };

  return (
    <ModuleOpsPageShell
      eyebrow="جرد ومطابقة المخزون"
      rangeLabel={
        awaitingApprovalCount > 0
          ? `بانتظار الاعتماد: ${awaitingApprovalCount}. فتح جرد → إدخال الكميات الفعلية → مطابقة واعتماد الفروقات كتسويات مخزنية.`
          : 'فتح جرد → إدخال الكميات الفعلية → مطابقة واعتماد الفروقات كتسويات مخزنية.'
      }
    >
      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      {(fromSupplies || scoped) && warehouseId && (
        <p className="text-sm font-medium text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.1)] border border-[rgb(var(--color-primary)/0.25)] rounded-lg px-4 py-3">
          جرد مخزن : <span className="font-bold">{selectedWarehouseName}</span>.
          المطابقة تعتمد فروق العد (الفعلي مقابل النظام) كتسويات مخزنية.
        </p>
      )}

      <OpsDashPanel
        title="مسار الجرد والمطابقة"
        accent="inventory"
        loading={balancesLoading}
        loadingLabel="جاري تحميل أرصدة المخازن…"
      >
        <ol className="mb-4 space-y-1 text-sm text-[var(--color-text-muted)] list-decimal list-inside">
          <li>افتح جلسة جرد للمخزن المحدد.</li>
          <li>أدخل الكميات الفعلية لكل صنف.</li>
          <li>طابق الفروقات واعتمدها لترحيل التسويات.</li>
        </ol>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <Select
            value={warehouseId || 'none'}
            disabled={warehouseSelectLocked}
            onValueChange={(value) => setWarehouseId(value === 'none' ? '' : value)}
          >
            <SelectTrigger className="flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]">
              <SelectValue placeholder="اختر المخزن" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">اختر المخزن</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id!}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={countScope}
            onValueChange={(value) => {
              setCountScope(value as 'warehouse' | 'rack' | 'location');
              setRackId('');
              setLocationId('');
            }}
          >
            <SelectTrigger className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]">
              <SelectValue placeholder="اختر نطاق الجرد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="location">لوكيشن محدد</SelectItem>
              <SelectItem value="rack">راك كامل</SelectItem>
              <SelectItem value="warehouse">المخزن كله</SelectItem>
            </SelectContent>
          </Select>
          {countScope === 'location' || countScope === 'rack' ? (
              <Select
                value={rackId || 'none'}
                disabled={!warehouseId || scopeLoading}
                onValueChange={(value) => {
                  setRackId(value === 'none' ? '' : value);
                  setLocationId('');
                }}
              >
                <SelectTrigger className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]">
                  <SelectValue placeholder={scopeLoading ? 'جاري تحميل الركات…' : 'اختر الراك'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{racks.length ? 'اختر الراك' : 'لا توجد راكات'}</SelectItem>
                  {racks.map((rack) => (
                    <SelectItem key={rack.id} value={String(rack.id)}>
                      {rack.name}{rack.code && rack.name !== rack.code ? ` (${rack.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          ) : null}
          {countScope === 'location' ? (
              <Select
                value={locationId || 'none'}
                disabled={!rackId || scopeLoading}
                onValueChange={(value) => setLocationId(value === 'none' ? '' : value)}
              >
                <SelectTrigger className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg)]">
                  <SelectValue placeholder="اختر اللوكيشن / الرف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{rackId && !locationsForRack.length ? 'لا توجد لوكيشنات في الراك' : 'اختر اللوكيشن / الرف'}</SelectItem>
                  {locationsForRack.map((location) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.shelfName || location.shelf || location.code}{location.code ? ` — ${location.code}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          ) : null}
        </div>
        {countScope === 'location' && selectedLocation ? (
          <p className="mt-3 rounded-lg border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.08)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
            سيتم جرد <strong className="text-[var(--color-text)]">{selectedLocation.code}</strong> فقط، ويشمل {selectedLocationBalances.length} صنفًا. اعتماد الفروق يحدّث رصيد اللوكيشن وإجمالي المخزن معًا.
          </p>
        ) : null}
        {countScope === 'rack' && selectedRack ? (
          <p className="mt-3 rounded-lg border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.08)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
            سيتم جرد الراك <strong className="text-[var(--color-text)]">{selectedRack.code}</strong> كاملًا: {locationsForRack.length} لوكيشن و{scopedLocationBalances.length} سطر صنف. كل فرق سيُرحّل إلى اللوكيشن الخاص بسطره.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void startCountSession()} disabled={!warehouseId || (countScope === 'location' && !locationId) || (countScope === 'rack' && !rackId) || creating || balancesLoading || scopeLoading || !can('inventory.counts.manage')}>
            <span className="material-icons-round text-sm">playlist_add_check</span>
            {balancesLoading || scopeLoading ? 'جاري تحميل الأرصدة…' : countScope === 'location' ? 'بدء جرد اللوكيشن' : countScope === 'rack' ? 'بدء جرد الراك' : 'بدء جرد المخزن'}
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadStockCountTemplate(selectedWarehouseName, selectedBalances)}
            disabled={!warehouseId || countScope === 'rack' || (countScope === 'location' && !locationId) || selectedBalances.length === 0 || balancesLoading || scopeLoading}
          >
            <span className="material-icons-round text-sm">download</span>
            تنزيل قالب الجرد
          </Button>
          <Button
            variant="outline"
            onClick={() => setPrintPickerOpen(true)}
            disabled={!warehouseId || printing}
          >
            <span className="material-icons-round text-sm">print</span>
            {printing ? 'جاري تجهيز الجرد…' : 'طباعة الجرد'}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!warehouseId || countScope === 'rack' || (countScope === 'location' && !locationId) || importing || !can('inventory.counts.manage')}
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
        {msg && <p className="mt-3 text-sm font-bold text-[var(--color-text-muted)]">{msg}</p>}
      </OpsDashPanel>

      {countPreview && (
        <OpsDashPanel title={`معاينة الجرد — ${countPreview.fileName}`} accent="inventory">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
            <div className="rounded-lg bg-[var(--color-bg)] p-3"><div className="text-xs text-[var(--color-text-muted)]">صفوف المخزن</div><div className="text-xl font-bold">{countPreview.parsed.lines.length}</div></div>
            <div className="rounded-lg bg-[rgb(var(--color-success)/0.1)] p-3"><div className="text-xs text-[rgb(var(--color-success))]">معدود من الملف</div><div className="text-xl font-bold">{countPreview.parsed.importedRows}</div></div>
            <div className="rounded-lg bg-[rgb(var(--color-warning)/0.1)] p-3"><div className="text-xs text-[rgb(var(--color-warning))]">فروقات</div><div className="text-xl font-bold">{countPreview.parsed.changedRows}</div></div>
            <div className="rounded-lg bg-[rgb(var(--color-danger)/0.1)] p-3"><div className="text-xs text-[rgb(var(--color-danger))]">أخطاء مانعة</div><div className="text-xl font-bold">{countPreview.parsed.errors.length}</div></div>
            <div className="rounded-lg bg-[rgb(var(--color-primary)/0.1)] p-3"><div className="text-xs text-[rgb(var(--color-primary))]">تحذيرات</div><div className="text-xl font-bold">{countPreview.parsed.warnings.length}</div></div>
          </div>
          {countPreview.parsed.errors.length > 0 && (
            <div className="mb-3 rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] p-3 text-sm text-[rgb(var(--color-danger))]">
              {countPreview.parsed.errors.slice(0, 6).map((error) => <div key={error}>{error}</div>)}
            </div>
          )}
          {countPreview.parsed.warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] p-3 text-sm text-[rgb(var(--color-warning))]">
              {countPreview.parsed.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          )}
          <div className="max-h-80 overflow-auto rounded-lg border mb-4">
            <table className="w-full min-w-[680px] text-sm text-right">
              <thead className="bg-[var(--color-surface-hover)] sticky top-0"><tr><th className="p-2">الكود</th><th className="p-2">الصنف</th><th className="p-2">المتوقع</th><th className="p-2">الفعلي</th><th className="p-2">الفرق</th></tr></thead>
              <tbody>{countPreview.parsed.lines.filter((line) => Math.abs(line.countedQty - line.expectedQty) > 0.00001).slice(0, 100).map((line) => (
                <tr key={`${line.itemType}-${line.itemId}`} className="border-t"><td className="p-2">{line.itemCode || '—'}</td><td className="p-2 font-medium">{line.itemName}</td><td className="p-2 tabular-nums">{line.expectedQty}</td><td className="p-2 tabular-nums">{line.countedQty}</td><td className={`p-2 font-bold tabular-nums ${line.countedQty - line.expectedQty >= 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>{(line.countedQty - line.expectedQty).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void confirmCountPreview()} disabled={importing || countPreview.parsed.errors.length > 0 || countPreview.parsed.importedRows === 0}>تأكيد إنشاء جلسة الجرد</Button>
            <Button variant="outline" onClick={() => { setCountPreview(null); setMsg('تم إلغاء المعاينة دون إنشاء جلسة.'); }}>إلغاء المعاينة</Button>
            {countPreview.parsed.errors.length > 0 && <Button variant="outline" onClick={() => downloadStockCountErrors(countPreview.parsed.errors)}>تنزيل تقرير الأخطاء</Button>}
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>إعادة رفع الملف</Button>
          </div>
        </OpsDashPanel>
      )}

      <OpsDashPanel
        title="جلسات الجرد والمطابقة"
        accent="inventory"
        loading={listLoading || listRefreshing}
        loadingLabel={listLoading ? 'جاري تحميل الجلسات…' : 'جاري التحديث…'}
      >
        {warehouseId ? (
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            القائمة مفلترة على المخزن المحدد. لو مش لاقي جلسة العاشر: اختر «اختر المخزن» لعرض كل الجلسات، أو اختر مخزن العاشر صراحة.
          </p>
        ) : null}
        {listLoading && sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" role="status">جاري تحميل الجلسات…</p>
        ) : visibleSessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {warehouseId
              ? 'لا توجد جلسات لهذا المخزن. تأكد أن الرفع اكتمل بتأكيد الجلسة، أو اختر مخزنًا آخر / امسح الفلتر.'
              : 'لا توجد جلسات جرد حتى الآن.'}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleSessions.map((session) => (
              <div key={session.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-text)]">
                      {session.warehouseName}
                      {session.countScope === 'location' ? ` — لوكيشن ${session.locationCode || session.locationId}` : ''}
                      {session.countScope === 'rack' ? ` — راك ${session.rackName || session.rackId}` : ''}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">{new Date(session.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={session.status === 'approved' ? 'success' : isReadyForMatching(session) ? 'warning' : 'info'}>
                      {session.status === 'approved'
                        ? 'مطابق ومعتمد'
                        : isReadyForMatching(session)
                          ? 'جاهز للمطابقة'
                          : 'مفتوح للعد'}
                    </Badge>
                    <Button variant="outline" onClick={() => viewCountSession(session)}>
                      <span className="material-icons-round text-sm">visibility</span>
                      {session.status === 'approved' ? 'عرض' : isReadyForMatching(session) ? 'مطابقة واعتماد' : 'عدّ ومطابقة'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </OpsDashPanel>
      <WarehouseCountSheetPrintModal
        open={printPickerOpen}
        onClose={() => setPrintPickerOpen(false)}
        warehouses={warehouses}
        balances={balances}
        initialWarehouseId={warehouseId}
        warehouseSelectLocked={warehouseSelectLocked}
        printing={printing}
        resolveWarehouseRole={(id) => warehouses.find((row) => row.id === id)?.warehouseRole}
        onPrint={(input) => {
          setWarehouseId(input.warehouseId);
          void printWarehouseCount(input);
        }}
      />
    </ModuleOpsPageShell>
  );
};
