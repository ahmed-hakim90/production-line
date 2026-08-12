import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '../components/UI';
import { warehouseService } from '../services/warehouseService';
import { warehouseRackService } from '../services/warehouseRackService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import { stockService } from '../services/stockService';
import type {
  DefaultItemLocation,
  StockLocationBalance,
  Warehouse,
  WarehouseLocation,
  WarehouseRack,
} from '../types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useJobsStore } from '@/components/background-jobs/useJobsStore';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import { ImportItemLocationsModal } from '../components/ImportItemLocationsModal';

type ShelfMode = 'single' | 'numeric_range' | 'alpha_range';
type LocationModal = null | 'rack' | 'editRack' | 'shelves' | 'import';
type ImportPreviewRow = {
  rowNo: number;
  warehouseId: string;
  warehouseName: string;
  rackName: string;
  rackCode: string;
  mode: ShelfMode;
  shelf?: string;
  from?: string;
  to?: string;
  /** Optional explicit location code (e.g. A1-1) instead of warehouse-rack-shelf. */
  locationCode?: string;
  status: 'ready' | 'error' | 'done';
  error?: string;
};

const normalizeHeader = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '-');
const getCell = (row: Record<string, unknown>, keys: string[]) => {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(key));
    if (found) return String(found[1] || '').trim();
  }
  return '';
};

export const WarehouseLocations: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);
  const {
    scoped,
    warehouseId: scopedWarehouseId,
    warehouseIds,
    warehouseSelectLocked,
    filterWarehouses,
    resolveScopedWarehouseId,
    routingConfigured,
    settingsPath,
  } = useMaterialsWarehouseScope();
  const inventoryRouting = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const suppliesWarehouseId = useMemo(
    () => (inventoryRouting.decomposedWarehouseId || inventoryRouting.rawMaterialWarehouseId || '').trim(),
    [inventoryRouting],
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [racks, setRacks] = useState<WarehouseRack[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [defaults, setDefaults] = useState<DefaultItemLocation[]>([]);
  const [balances, setBalances] = useState<StockLocationBalance[]>([]);
  const [warehouseId, setWarehouseId] = useState(
    () => searchParams.get('warehouseId') || scopedWarehouseId || suppliesWarehouseId || '',
  );
  const [selectedRackId, setSelectedRackId] = useState('');
  const [rackName, setRackName] = useState('');
  const [rackCode, setRackCode] = useState('');
  const [editingRackId, setEditingRackId] = useState<string | null>(null);
  const [shelfMode, setShelfMode] = useState<ShelfMode>('single');
  const [shelf, setShelf] = useState('');
  const [shelfFrom, setShelfFrom] = useState('');
  const [shelfTo, setShelfTo] = useState('');
  const [defaultItemKey, setDefaultItemKey] = useState('');
  const [defaultLocationId, setDefaultLocationId] = useState('');
  const [modal, setModal] = useState<LocationModal>(null);
  const [itemLocationImportOpen, setItemLocationImportOpen] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const modalSavingRef = useRef(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');

  const beginModalSave = () => {
    if (modalSavingRef.current) return false;
    modalSavingRef.current = true;
    setModalSaving(true);
    return true;
  };

  const endModalSave = () => {
    modalSavingRef.current = false;
    setModalSaving(false);
  };

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const selectedRack = racks.find((rack) => rack.id === selectedRackId);
  const canManage = can('inventory.locations.manage');

  const load = async (nextWarehouseId = warehouseId) => {
    try {
      const [whs] = await Promise.all([warehouseService.getActiveWarehouses()]);
      const visibleWarehouses = filterWarehouses(whs);
      const fromQuery = searchParams.get('warehouseId') || '';
      const resolvedSuppliesId = resolveSuppliesWarehouseId(inventoryRouting, visibleWarehouses);
      const resolvedWarehouseId = resolveScopedWarehouseId(
        nextWarehouseId || warehouseId,
        [fromQuery, scopedWarehouseId, suppliesWarehouseId, resolvedSuppliesId, visibleWarehouses[0]?.id || ''],
      );
      await warehouseLocationService.migrateLegacyLocationsToRacks();
    const [rackRows, locRows, bals, defs] = await Promise.all([
      warehouseRackService.getAll(),
      warehouseLocationService.getAll(),
      stockService.getLocationBalances(),
      defaultItemLocationService.getAll(),
    ]);
      setWarehouses(visibleWarehouses);
      setRacks(rackRows);
      setLocations(locRows);
    setBalances(bals);
    setDefaults(defs);
    if ((!warehouseId || (scoped && !warehouseIds.includes(warehouseId))) && resolvedWarehouseId) {
      setWarehouseId(resolvedWarehouseId);
    }
      if (!selectedRackId) {
        const firstRack = rackRows.find((rack) => rack.warehouseId === resolvedWarehouseId && rack.isActive !== false);
        if (firstRack?.id) setSelectedRackId(firstRack.id);
      }
    } catch (error: any) {
      const raw = String(error?.message || '');
      toast.error(
        raw.toLowerCase().includes('permission') || raw.toLowerCase().includes('insufficient')
          ? 'تعذر تحميل اللوكيشنات بسبب صلاحيات Firestore. حدّث الصفحة بعد نشر القواعد.'
          : (raw || 'تعذر تحميل اللوكيشنات.'),
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const preferred = resolveScopedWarehouseId(warehouseId, [scopedWarehouseId, suppliesWarehouseId]);
    if (!preferred) return;
    if (warehouseSelectLocked || !warehouseId) setWarehouseId(preferred);
  }, [suppliesWarehouseId, scopedWarehouseId, warehouseId, warehouseSelectLocked, resolveScopedWarehouseId]);

  const filteredRacks = useMemo(
    () => racks.filter((rack) => !warehouseId || rack.warehouseId === warehouseId),
    [racks, warehouseId],
  );
  const inactiveRackIds = useMemo(
    () => new Set(racks.filter((rack) => rack.isActive === false).map((rack) => rack.id).filter(Boolean)),
    [racks],
  );
  const filteredLocations = useMemo(
    () => locations.filter((loc) => !warehouseId || loc.warehouseId === warehouseId),
    [locations, warehouseId],
  );
  const activeShelves = useMemo(
    () => filteredLocations.filter((loc) => loc.isActive !== false && (!loc.rackId || !inactiveRackIds.has(loc.rackId))),
    [filteredLocations, inactiveRackIds],
  );
  const balancesByLocation = useMemo(() => {
    const map = new Map<string, StockLocationBalance[]>();
    balances.forEach((bal) => {
      const arr = map.get(bal.locationId) || [];
      arr.push(bal);
      map.set(bal.locationId, arr);
    });
    return map;
  }, [balances]);
  const itemOptions = useMemo(() => {
    const map = new Map<string, StockLocationBalance>();
    balances
      .filter((bal) => !warehouseId || bal.warehouseId === warehouseId)
      .forEach((bal) => {
        const key = `${bal.itemType}__${bal.itemId}`;
        if (!map.has(key)) map.set(key, bal);
      });
    return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName, 'ar'));
  }, [balances, warehouseId]);
  const defaultsByItemKey = useMemo(() => {
    const map = new Map<string, DefaultItemLocation>();
    defaults
      .filter((row) => !warehouseId || row.warehouseId === warehouseId)
      .forEach((row) => map.set(`${row.itemType}__${row.itemId}`, row));
    return map;
  }, [defaults, warehouseId]);
  const defaultWarnings = useMemo(() => {
    const activeIds = new Set(activeShelves.map((loc) => loc.id));
    return defaults
      .filter((row) => row.warehouseId === warehouseId && !activeIds.has(row.locationId))
      .map((row) => `${row.itemName} (${row.itemCode}) -> ${row.locationCode}`);
  }, [activeShelves, defaults, warehouseId]);

  const changeWarehouse = async (id: string) => {
    setWarehouseId(id);
    setSelectedRackId('');
    setDefaultItemKey('');
    setDefaultLocationId('');
    await load(id);
  };

  const createRack = async () => {
    if (!selectedWarehouse?.id || !rackName.trim() || !beginModalSave()) return;
    try {
      await warehouseRackService.create({
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        warehouseCode: selectedWarehouse.code,
        name: rackName,
        code: rackCode || rackName,
        sortOrder: filteredRacks.length + 1,
      });
      setRackName('');
      setRackCode('');
      toast.success('تم إنشاء الراك.');
      setModal(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء الراك.');
    } finally {
      endModalSave();
    }
  };

  const openEditRack = (rack: WarehouseRack) => {
    setEditingRackId(rack.id || null);
    setRackName(rack.name || '');
    setRackCode(rack.code || '');
    setModal('editRack');
  };

  const saveEditRack = async () => {
    if (!editingRackId || !rackName.trim() || !beginModalSave()) return;
    try {
      const result = await warehouseRackService.updateDetails(editingRackId, {
        name: rackName,
        code: rackCode || rackName,
      });
      toast.success(
        result.codesChanged
          ? `تم تعديل الراك وتحديث أكواد ${result.locationsUpdated} رف.`
          : `تم تعديل اسم الراك وتحديث ${result.locationsUpdated} رف (الأكواد كما هي).`,
      );
      setEditingRackId(null);
      setRackName('');
      setRackCode('');
      setModal(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تعديل الراك.');
    } finally {
      endModalSave();
    }
  };

  const createShelves = async (): Promise<boolean> => {
    if (!selectedWarehouse?.id || !selectedRack?.id || !beginModalSave()) return false;
    try {
      const { createdIds, skipped } = await warehouseLocationService.createShelves({
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        warehouseCode: selectedWarehouse.code,
        rack: selectedRack,
        mode: shelfMode,
        shelf,
        from: shelfFrom,
        to: shelfTo,
      });
      setShelf('');
      setShelfFrom('');
      setShelfTo('');
      if (createdIds.length === 0 && skipped > 0) {
        toast.success(`كل الأرفف (${skipped}) موجودة مسبقاً — لم يُنشأ تكرار.`);
      } else if (skipped > 0) {
        toast.success(`تم إنشاء ${createdIds.length} رف، وتخطي ${skipped} موجود مسبقاً.`);
      } else {
        toast.success(`تم إنشاء ${createdIds.length} رف.`);
      }
      await load();
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء الأرفف.');
      return false;
    } finally {
      endModalSave();
    }
  };

  const toggleRack = async (rack: WarehouseRack) => {
    if (!rack.id) return;
    await warehouseRackService.update(rack.id, { isActive: rack.isActive === false });
    await load();
  };

  const toggleLocation = async (loc: WarehouseLocation) => {
    if (!loc.id) return;
    await warehouseLocationService.update(loc.id, { isActive: loc.isActive === false });
    await load();
  };

  const deleteLocation = async (loc: WarehouseLocation) => {
    if (!loc.id || deletingLocationId) return;
    const label = loc.code || loc.shelfName || loc.shelf || loc.id;
    const ok = window.confirm(
      `حذف الرف «${label}» نهائياً؟\nلا يمكن التراجع. الحذف مسموح فقط إذا لم يكن عليه أرصدة.`,
    );
    if (!ok) return;
    setDeletingLocationId(loc.id);
    try {
      await warehouseLocationService.remove(loc.id);
      toast.success(`تم حذف الرف ${label}.`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حذف الرف.');
    } finally {
      setDeletingLocationId(null);
    }
  };

  const saveDefaultLocation = async () => {
    const item = itemOptions.find((row) => `${row.itemType}__${row.itemId}` === defaultItemKey);
    const loc = activeShelves.find((row) => row.id === defaultLocationId);
    if (!selectedWarehouse?.id || !item || !loc?.id) return;
    await defaultItemLocationService.set({
      warehouseId: selectedWarehouse.id,
      warehouseName: selectedWarehouse.name,
      itemType: item.itemType,
      itemId: item.itemId,
      itemName: item.itemName,
      itemCode: item.itemCode,
      locationId: loc.id,
      locationCode: loc.code,
    });
    toast.success('تم حفظ الرف الافتراضي للصنف.');
    await load();
  };

  const closeModal = () => {
    if (modalSavingRef.current) return;
    setModal(null);
    setImportRows([]);
    setImportFileName('');
    setEditingRackId(null);
    setRackName('');
    setRackCode('');
  };

  const downloadImportTemplate = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['كود المخزن', 'اسم الراك', 'كود الراك', 'نوع الرفوف', 'رف واحد', 'من', 'إلى', 'كود اللوكيشن'],
      [selectedWarehouse?.code || 'WH-01', 'راك A', 'A', 'single', '01', '', '', ''],
      [selectedWarehouse?.code || 'WH-01', 'A1', 'A1', 'single', '1', '', '', 'A1-1'],
      [selectedWarehouse?.code || 'WH-01', 'راك B', 'B', 'numeric_range', '', '01', '10', ''],
      [selectedWarehouse?.code || 'WH-01', 'راك C', 'C', 'alpha_range', '', 'A', 'F', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, ws, 'لوكيشنات المخزن');
    XLSX.writeFile(wb, 'template_warehouse_locations.xlsx');
  };

  const parseImportFile = async (file: File) => {
    setImportFileName(file.name);
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const preferredSheetName = wb.SheetNames.find((name) =>
      /لوكيشن|location/i.test(String(name || '')),
    );
    const sheet = wb.Sheets[preferredSheetName || wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const whByCode = new Map(warehouses.map((w) => [normalizeCode(w.code || ''), w]));
    const whByName = new Map(warehouses.map((w) => [String(w.name || '').trim().toLowerCase(), w]));
    const parsed = rawRows.map((row, index): ImportPreviewRow => {
      const warehouseKey = getCell(row, ['كود المخزن', 'warehouseCode', 'warehouse', 'المخزن']);
      const wh = warehouseKey
        ? (whByCode.get(normalizeCode(warehouseKey)) || whByName.get(warehouseKey.trim().toLowerCase()))
        : selectedWarehouse;
      const rackNameValue = getCell(row, ['اسم الراك', 'rackName', 'rack', 'راك']);
      const rackCodeValue = getCell(row, ['كود الراك', 'rackCode']);
      const modeRaw = getCell(row, ['نوع الرفوف', 'mode', 'shelfMode']);
      const shelfValue = getCell(row, ['رف واحد', 'رف', 'كود الرف', 'shelf', 'shelfName', 'shelfCode', 'اسم الرف']);
      const fromValue = getCell(row, ['من', 'from', 'shelfFrom']);
      const toValue = getCell(row, ['إلى', 'الى', 'to', 'shelfTo']);
      const locationCodeValue = normalizeCode(
        getCell(row, ['كود اللوكيشن', 'locationCode', 'location code', 'كود الموقع']),
      );
      const inferredMode: ShelfMode = modeRaw === 'numeric_range' || modeRaw.includes('رقم')
        ? 'numeric_range'
        : modeRaw === 'alpha_range' || modeRaw.includes('حرف')
          ? 'alpha_range'
          : fromValue && toValue
            ? (/^\d+$/.test(fromValue) && /^\d+$/.test(toValue) ? 'numeric_range' : 'alpha_range')
            : 'single';
      const rackCodeFinal = normalizeCode(rackCodeValue || rackNameValue);
      let error = '';
      if (!wh?.id) error = 'المخزن غير موجود.';
      else if (!rackNameValue.trim()) error = 'اسم الراك مطلوب.';
      else if (inferredMode === 'single' && !shelfValue.trim()) error = 'اسم الرف مطلوب.';
      else if (inferredMode !== 'single' && (!fromValue.trim() || !toValue.trim())) error = 'مدى الأرفف مطلوب.';
      else if (locationCodeValue && inferredMode !== 'single') {
        error = 'كود اللوكيشن المخصص يُستخدم مع رف واحد فقط.';
      }
      return {
        rowNo: index + 2,
        warehouseId: wh?.id || '',
        warehouseName: wh?.name || warehouseKey || '',
        rackName: rackNameValue,
        rackCode: rackCodeFinal,
        mode: inferredMode,
        shelf: shelfValue,
        from: fromValue,
        to: toValue,
        locationCode: locationCodeValue || undefined,
        status: error ? 'error' : 'ready',
        error,
      };
    });
    setImportRows(parsed);
  };

  const applyImport = async () => {
    const ready = importRows.filter((row) => row.status === 'ready');
    if (!ready.length) return;

    const readySnapshot = [...ready];
    const warehousesSnapshot = [...warehouses];
    const fileLabel = importFileName || 'warehouse-locations.xlsx';
    const jobId = addJob({
      fileName: fileLabel,
      jobType: 'Locations Import',
      totalRows: readySnapshot.length,
      startedBy: userDisplayName || 'Current User',
    });

    setPanelHidden(false);
    setPanelMinimized(false);
    startJob(jobId, 'Saving to database...');
    setModal(null);
    setImportRows([]);
    setImportFileName('');

    let added = 0;
    let skipped = 0;
    let failed = 0;
    let done = 0;

    try {
      const rackRows = await warehouseRackService.getAll();
      const locationRows = await warehouseLocationService.getAll();
      const rackByKey = new Map(rackRows.map((rack) => [`${rack.warehouseId}__${rack.code}`, rack]));
      const locationKeys = new Set(
        locationRows.map(
          (loc) =>
            `${loc.warehouseId}__${loc.rackCode || normalizeCode(loc.rack)}__${loc.shelfCode || normalizeCode(loc.shelf)}`,
        ),
      );

      for (const row of readySnapshot) {
        try {
          const wh = warehousesSnapshot.find((w) => w.id === row.warehouseId);
          if (!wh?.id) throw new Error('المخزن غير موجود.');
          const rackKey = `${row.warehouseId}__${row.rackCode}`;
          let rack = rackByKey.get(rackKey);
          let createdSomething = false;
          if (!rack?.id) {
            const id = await warehouseRackService.create({
              warehouseId: wh.id,
              warehouseName: wh.name,
              warehouseCode: wh.code,
              name: row.rackName,
              code: row.rackCode,
            });
            rack = {
              id: id || '',
              warehouseId: wh.id,
              warehouseName: wh.name,
              warehouseCode: wh.code,
              name: row.rackName,
              code: row.rackCode,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            rackByKey.set(rackKey, rack);
            createdSomething = true;
          }
          const shelfCodes = warehouseLocationService.buildShelfCodes({
            mode: row.mode,
            shelf: row.shelf,
            from: row.from,
            to: row.to,
          });
          const missingShelves = shelfCodes.filter(
            (shelfCode) =>
              !locationKeys.has(`${row.warehouseId}__${row.rackCode}__${normalizeCode(shelfCode)}`),
          );
          for (const shelfCode of missingShelves) {
            await warehouseLocationService.create({
              warehouseId: wh.id,
              warehouseName: wh.name,
              warehouseCode: wh.code,
              rackId: rack.id,
              rackName: rack.name,
              rackCode: rack.code,
              rack: rack.name,
              shelf: shelfCode,
              // Keep Maghrabi-style codes (A1-1) when provided so stock import matches.
              code: row.mode === 'single' ? row.locationCode : undefined,
              skipIfExists: true,
            });
            locationKeys.add(`${row.warehouseId}__${row.rackCode}__${normalizeCode(shelfCode)}`);
            createdSomething = true;
          }
          if (createdSomething) added += 1;
          else skipped += 1;
        } catch {
          failed += 1;
        }
        done += 1;
        setJobProgress(jobId, {
          processedRows: done,
          totalRows: readySnapshot.length,
          statusText: 'Saving to database...',
          status: 'processing',
        });
      }

      if (added === 0 && failed > 0 && skipped === 0) {
        failJob(jobId, 'All rows failed during save', 'Failed');
        toast.error('فشل استيراد اللوكيشنات.');
      } else {
        completeJob(jobId, {
          addedRows: added,
          failedRows: failed,
          skippedRows: skipped,
          statusText: `اكتمل: ${added} مضاف، ${skipped} تخطي${failed ? `، ${failed} فشل` : ''}`,
        });
        toast.success(
          `تم استيراد اللوكيشنات: ${added} مضاف، ${skipped} تخطي${failed ? `، ${failed} فشل` : ''}.`,
        );
      }
      await load();
    } catch (error: any) {
      failJob(jobId, error?.message || 'تعذر استيراد اللوكيشنات', 'Failed');
      toast.error('تعذر استيراد اللوكيشنات.');
    }
  };

  if (!can('inventory.view')) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="لوكيشنات المخازن"
      rangeLabel="إنشاء راكات وأرفف داخل كل مخزن وتحديد الرف الافتراضي لكل مكون"
    >
      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      <OpsDashPanel title="اختيار المخزن" accent="inventory">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
          <select
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-70"
            value={warehouseId}
            disabled={warehouseSelectLocked}
            onChange={(e) => void changeWarehouse(e.target.value)}
          >
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] md:col-span-2">
            {scoped
              ? warehouseSelectLocked
                ? 'هذا الحساب مقيّد بمخزن المستلزمات فقط.'
                : 'يمكنك التبديل بين مخزن المفكك ومخزن المواد الخام المعيّنين في التوجيه.'
              : 'إعدادات إلزام اللوكيشن موجودة الآن في إعدادات النظام، وقائمة هذه الصفحة مخصصة لإدارة الراكات والأرفف.'}
          </div>
        </div>
        {defaultWarnings.length > 0 && (
          <div className="mx-4 mb-4 rounded-lg border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] p-3 text-xs font-bold text-[rgb(var(--color-warning))]">
            أصناف لها رف افتراضي موقوف: {defaultWarnings.slice(0, 6).join('، ')}
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="إجراءات سريعة" accent="inventory">
        <div className="flex flex-wrap gap-3 p-4">
          <Button
            variant="primary"
            disabled={!canManage}
            onClick={() => {
              setEditingRackId(null);
              setRackName('');
              setRackCode('');
              setModal('rack');
            }}
          >
            إضافة راك
          </Button>
          <Button variant="secondary" disabled={!canManage || filteredRacks.length === 0} onClick={() => setModal('shelves')}>إضافة أرفف</Button>
          <Button variant="secondary" disabled={!canManage} onClick={() => setModal('import')}>رفع Excel</Button>
          <Button variant="secondary" onClick={downloadImportTemplate}>تحميل نموذج Excel</Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="الرف الافتراضي للصنف" accent="inventory">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4">
          <select
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
            value={defaultItemKey}
            onChange={(e) => {
              setDefaultItemKey(e.target.value);
              const existing = defaultsByItemKey.get(e.target.value);
              setDefaultLocationId(existing?.locationId || '');
            }}
          >
            <option value="">اختر صنف من أرصدة المخزن</option>
            {itemOptions.map((item) => {
              const key = `${item.itemType}__${item.itemId}`;
              return (
                <option key={key} value={key}>
                  {item.itemName} ({item.itemCode})
                  {defaultsByItemKey.get(key)?.locationCode ? ` - الافتراضي ${defaultsByItemKey.get(key)?.locationCode}` : ''}
                </option>
              );
            })}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={defaultLocationId} onChange={(e) => setDefaultLocationId(e.target.value)}>
            <option value="">اختر الرف الافتراضي</option>
            {activeShelves.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
          </select>
          <Button variant="primary" disabled={!canManage || !defaultItemKey || !defaultLocationId} onClick={() => void saveDefaultLocation()}>
            حفظ الافتراضي
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <Button
            variant="secondary"
            disabled={!canManage || !warehouseId}
            onClick={() => setItemLocationImportOpen(true)}
          >
            رفع كود المادة واللوكيشن
          </Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="المخزن ← الراك ← الأرفف" accent="inventory" bodyClassName="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-bg)]">
                <th className="p-3 text-start">الراك</th>
                <th className="p-3 text-start">الرف / اللوكيشن</th>
                <th className="p-3 text-start">الأصناف داخل الرف</th>
                <th className="p-3 text-center">الحالة</th>
                {canManage && <th className="p-3 text-center">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRacks.map((rack) => {
                const shelves = filteredLocations.filter((loc) => loc.rackId === rack.id || (!loc.rackId && loc.rack === rack.name));
                return (
                  <React.Fragment key={rack.id}>
                    <tr className="border-b bg-[var(--color-surface-hover)]">
                      <td className="p-3 font-bold">{rack.name} <span className="font-mono text-xs text-[var(--color-text-muted)]">({rack.code})</span></td>
                      <td className="p-3 text-[var(--color-text-muted)]">{shelves.length} رف</td>
                      <td className="p-3" />
                      <td className="p-3 text-center">{rack.isActive === false ? 'موقوف' : 'نشط'}</td>
                      {canManage && (
                        <td className="p-3 text-center">
                          <div className="inline-flex flex-wrap items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditRack(rack)}>
                              تعديل
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void toggleRack(rack)}>
                              {rack.isActive === false ? 'تفعيل الراك' : 'تعطيل الراك'}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {shelves.map((loc) => {
                      const locBalances = balancesByLocation.get(loc.id || '') || [];
                      const isEffectivelyInactive = loc.isActive === false || inactiveRackIds.has(loc.rackId);
                      return (
                        <tr key={loc.id} className="border-b">
                          <td className="p-3 text-[var(--color-text-muted)]">{loc.rackName || loc.rack}</td>
                          <td className="p-3 font-mono">{loc.code}</td>
                          <td className="p-3 text-xs text-[var(--color-text-muted)]">
                            {locBalances.length === 0
                              ? 'لا توجد أرصدة'
                              : locBalances.slice(0, 4).map((b) => `${b.itemName}: ${b.quantity}`).join('، ')}
                          </td>
                          <td className="p-3 text-center">{isEffectivelyInactive ? 'موقوف' : 'نشط'}</td>
                          {canManage && (
                            <td className="p-3 text-center">
                              <div className="inline-flex flex-wrap items-center justify-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => void toggleLocation(loc)}>
                                  {loc.isActive === false ? 'تفعيل الرف' : 'تعطيل الرف'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={deletingLocationId === loc.id}
                                  onClick={() => void deleteLocation(loc)}
                                >
                                  {deletingLocationId === loc.id ? 'جاري الحذف...' : 'حذف'}
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      {modal && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={closeModal}>
          <div className="w-full max-w-3xl rounded-lg bg-[var(--color-card)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-black">
                {modal === 'rack'
                  ? 'إضافة راك'
                  : modal === 'editRack'
                    ? 'تعديل الراك'
                    : modal === 'shelves'
                      ? 'إضافة أرفف داخل راك'
                      : 'رفع لوكيشنات من Excel'}
              </h3>
              <button className="text-xl leading-none text-[var(--color-text-muted)]" onClick={closeModal}>x</button>
            </div>

            {modal === 'rack' && (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="اسم الراك" value={rackName} onChange={(e) => setRackName(e.target.value)} />
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="كود الراك اختياري" value={rackCode} onChange={(e) => setRackCode(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={modalSaving} onClick={closeModal}>إلغاء</Button>
                  <Button
                    variant="primary"
                    disabled={!canManage || !rackName.trim() || modalSaving}
                    onClick={() => void createRack()}
                  >
                    {modalSaving ? 'جاري الحفظ...' : 'حفظ الراك'}
                  </Button>
                </div>
              </div>
            )}

            {modal === 'editRack' && (
              <div className="space-y-4 p-5">
                <p className="text-xs text-[var(--color-text-muted)]">
                  تعديل الاسم فقط لا يغيّر أكواد اللوكيشن (مثل 20-01-0). تغيير الكود يعيد بناء أكواد الأرفف التابعة.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="اسم الراك" value={rackName} onChange={(e) => setRackName(e.target.value)} />
                  <input className="rounded-lg border px-3 py-2 text-sm" placeholder="كود الراك" value={rackCode} onChange={(e) => setRackCode(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={modalSaving} onClick={closeModal}>إلغاء</Button>
                  <Button
                    variant="primary"
                    disabled={!canManage || !rackName.trim() || modalSaving}
                    onClick={() => void saveEditRack()}
                  >
                    {modalSaving ? 'جاري الحفظ...' : 'حفظ التعديل'}
                  </Button>
                </div>
              </div>
            )}

            {modal === 'shelves' && (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select className="rounded-lg border px-3 py-2 text-sm" value={selectedRackId} onChange={(e) => setSelectedRackId(e.target.value)}>
                    <option value="">اختر الراك</option>
                    {filteredRacks.filter((rack) => rack.isActive !== false).map((rack) => (
                      <option key={rack.id} value={rack.id}>{rack.name} ({rack.code})</option>
                    ))}
                  </select>
                  <select className="rounded-lg border px-3 py-2 text-sm" value={shelfMode} onChange={(e) => setShelfMode(e.target.value as ShelfMode)}>
                    <option value="single">رف واحد</option>
                    <option value="numeric_range">مدى أرقام</option>
                    <option value="alpha_range">مدى حروف</option>
                  </select>
                </div>
                {shelfMode === 'single' ? (
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="اسم الرف" value={shelf} onChange={(e) => setShelf(e.target.value)} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className="rounded-lg border px-3 py-2 text-sm" placeholder="من" value={shelfFrom} onChange={(e) => setShelfFrom(e.target.value)} />
                    <input className="rounded-lg border px-3 py-2 text-sm" placeholder="إلى" value={shelfTo} onChange={(e) => setShelfTo(e.target.value)} />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={modalSaving} onClick={closeModal}>إلغاء</Button>
                  <Button
                    variant="primary"
                    disabled={!canManage || !selectedRackId || modalSaving}
                    onClick={async () => {
                      const ok = await createShelves();
                      if (ok) setModal(null);
                    }}
                  >
                    {modalSaving ? 'جاري الحفظ...' : 'حفظ الأرفف'}
                  </Button>
                </div>
              </div>
            )}

            {modal === 'import' && (
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={downloadImportTemplate}>تحميل النموذج</Button>
                  <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-bold">
                    اختيار ملف Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && void parseImportFile(e.target.files[0])}
                    />
                  </label>
                  {importFileName && <span className="text-xs font-bold text-[var(--color-text-muted)]">{importFileName}</span>}
                </div>
                {importRows.length > 0 && (
                  <div className="max-h-[420px] overflow-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-[var(--color-bg)]">
                          <th className="p-2 text-start">صف</th>
                          <th className="p-2 text-start">المخزن</th>
                          <th className="p-2 text-start">الراك</th>
                          <th className="p-2 text-start">الأرفف</th>
                          <th className="p-2 text-start">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row) => (
                          <tr key={row.rowNo} className="border-b">
                            <td className="p-2">{row.rowNo}</td>
                            <td className="p-2">{row.warehouseName}</td>
                            <td className="p-2">{row.rackName} ({row.rackCode})</td>
                            <td className="p-2">{row.mode === 'single' ? row.shelf : `${row.from} -> ${row.to}`}</td>
                            <td className={`p-2 font-bold ${row.status === 'error' ? 'text-[rgb(var(--color-danger))]' : row.status === 'done' ? 'text-[rgb(var(--color-success))]' : 'text-[var(--color-text)]'}`}>
                              {row.status === 'done' ? 'تم' : row.status === 'ready' ? 'جاهز' : row.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={modalSaving} onClick={closeModal}>إغلاق</Button>
                  <Button
                    variant="primary"
                    disabled={modalSaving || !importRows.some((row) => row.status === 'ready')}
                    onClick={() => void applyImport()}
                  >
                    {modalSaving ? 'جاري الاستيراد...' : 'تنفيذ الاستيراد'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        </ManagedModalPortal>
      )}
      <ImportItemLocationsModal
        open={itemLocationImportOpen}
        onClose={() => setItemLocationImportOpen(false)}
        warehouses={warehouses}
        balances={[]}
        initialWarehouseId={warehouseId}
        warehouseSelectLocked={warehouseSelectLocked}
        canMoveStock={can('inventory.transactions.create')}
        onApplied={() => void load()}
      />
    </ModuleOpsPageShell>
  );
};
