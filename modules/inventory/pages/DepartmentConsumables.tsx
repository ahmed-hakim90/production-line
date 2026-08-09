import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { Button } from '../components/UI';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { exportGenericRows } from '../../../utils/exportExcel';
import { useAppStore } from '../../../store/useAppStore';
import { departmentsRef } from '../../hr/collections';
import type { FirestoreDepartment } from '../../hr/types';
import { materialService } from '../../manufacturing/services/materialService';
import { MATERIAL_UNIT_LABELS, type MaterialUnit } from '../../manufacturing/types';
import { warehouseService } from '../services/warehouseService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { departmentConsumableIssueService } from '../services/departmentConsumableIssueService';
import {
  DEPARTMENT_CONSUMABLE_STATUS_LABELS,
  canApprove,
  canCancel,
  canIssue,
  canReject,
  canReturn,
  canSubmit,
  departmentConsumableLineKey,
} from '../lib/departmentConsumableIssue';
import type { ConsumableOption } from '../lib/itemMovementTrace';
import { filterConsumableCatalog } from '../lib/itemMovementTrace';
import type {
  DepartmentConsumableIssue,
  DepartmentConsumableIssueLine,
  DepartmentConsumableMonthlyReport,
  Warehouse,
  WarehouseLocation,
} from '../types';
import { DefineConsumableModal } from '../components/departmentConsumables/DefineConsumableModal';
import { AddConsumableStockModal } from '../components/departmentConsumables/AddConsumableStockModal';
import { CreateDepartmentIssueModal } from '../components/departmentConsumables/CreateDepartmentIssueModal';
import { ReturnConsumableModal } from '../components/departmentConsumables/ReturnConsumableModal';
import { ItemMovementTraceModal } from '../components/departmentConsumables/ItemMovementTraceModal';
import { ImportConsumablesSheetModal } from '../components/departmentConsumables/ImportConsumablesSheetModal';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { stockService } from '../services/stockService';
import { runConsumableSheetImportJob } from '../lib/applyConsumableSheetImport';
import {
  exportDepartmentConsumablesBalancesSheet,
  type ParsedConsumableSheetRow,
} from '../../../utils/importDepartmentConsumablesSheet';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

const PAGE_SIZE = 20;
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));
const moneyFmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n || 0));

function consumableUnitLabel(unit: string): string {
  return MATERIAL_UNIT_LABELS[unit as MaterialUnit] || unit || '—';
}

type TabKey = 'issues' | 'catalog' | 'report';
type ModalKey = 'addStock' | 'createIssue' | 'importSheet' | 'none';

export const DepartmentConsumables: React.FC = () => {
  const { can } = usePermission();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const actor = userDisplayName || userEmail || 'Current User';

  const canView = can('departmentConsumables.view') || can('inventory.view');
  const canCreate = can('departmentConsumables.create');
  const canApproveIssue = can('departmentConsumables.approve');
  const canExecute = can('departmentConsumables.issue');
  const canExport = can('departmentConsumables.export');
  const canDefine = can('materials.manage') || canCreate;
  const canAddStock = (can('inventory.transactions.create') || canCreate) && isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.stockMove,
    INVENTORY_STOCK_MOVE_PATHS.consumableAddStock,
  );
  const canImportSheet = (
    can('inventory.transactions.create') || canCreate || can('materials.manage')
  ) && isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.stockMove,
    INVENTORY_STOCK_MOVE_PATHS.consumableSheetImport,
  );
  const {
    scoped,
    warehouseIds,
    filterWarehouses,
    resolveScopedWarehouseId,
    warehouseSelectLocked,
  } = useMaterialsWarehouseScope();

  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);

  const [tab, setTab] = useState<TabKey>('issues');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalKey>('none');
  const [showDefine, setShowDefine] = useState(false);
  const [exportingBalances, setExportingBalances] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [consumables, setConsumables] = useState<ConsumableOption[]>([]);
  const [orders, setOrders] = useState<DepartmentConsumableIssue[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [page, setPage] = useState(1);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);

  const [returnIssue, setReturnIssue] = useState<DepartmentConsumableIssue | null>(null);
  const [returnQtyByLine, setReturnQtyByLine] = useState<Record<string, number>>({});
  const [traceItem, setTraceItem] = useState<ConsumableOption | null>(null);

  const [reportMonth, setReportMonth] = useState(THIS_MONTH);
  const [reportDepartmentId, setReportDepartmentId] = useState('');
  const [reportWarehouseId, setReportWarehouseId] = useState('');
  const [report, setReport] = useState<DepartmentConsumableMonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [whs, locs, deptSnap, materials, issueRows] = await Promise.all([
        warehouseService.getActiveWarehouses(),
        warehouseLocationService.getAll(),
        getDocs(departmentsRef()),
        materialService.getAll().catch(() => []),
        departmentConsumableIssueService.listRecent(300, scoped ? warehouseIds : undefined),
      ]);
      setWarehouses(whs);
      setLocations(locs);
      setDepartments(
        deptSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment))
          .filter((d) => d.isActive !== false),
      );
      setConsumables(
        materials
          .filter((m) => m.id && m.isActive !== false && m.type === 'consumable')
          .map((m) => ({
            id: m.id!,
            name: m.name,
            code: m.code,
            unit: m.baseUnit || 'piece',
            purchaseCost: Number(m.purchaseCost || 0),
          })),
      );
      setOrders(issueRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات المستهلكات.');
    } finally {
      setLoading(false);
    }
  }, [scoped, warehouseIds]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  useEffect(() => {
    if (!scoped) return;
    setWarehouseFilter((prev) => resolveScopedWarehouseId(prev));
    setReportWarehouseId((prev) => resolveScopedWarehouseId(prev));
  }, [scoped, warehouseIds, resolveScopedWarehouseId]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, departmentFilter, warehouseFilter]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSearch]);

  const visibleWarehouses = useMemo(
    () => filterWarehouses(warehouses),
    [warehouses, filterWarehouses],
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allowed = scoped ? new Set(warehouseIds) : null;
    return orders.filter((row) => {
      if (allowed && !allowed.has(row.warehouseId)) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (departmentFilter && row.departmentId !== departmentFilter) return false;
      if (warehouseFilter && row.warehouseId !== warehouseFilter) return false;
      if (!q) return true;
      return (
        row.referenceNo.toLowerCase().includes(q)
        || row.departmentName.toLowerCase().includes(q)
        || row.warehouseName.toLowerCase().includes(q)
        || (row.lines || []).some((line) =>
          line.itemName.toLowerCase().includes(q) || line.itemCode.toLowerCase().includes(q))
      );
    });
  }, [orders, search, statusFilter, departmentFilter, warehouseFilter, scoped, warehouseIds]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const filteredCatalog = useMemo(
    () => filterConsumableCatalog(consumables, catalogSearch, consumableUnitLabel),
    [consumables, catalogSearch],
  );

  const catalogTotalPages = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
  const catalogCurrentPage = Math.min(catalogPage, catalogTotalPages);
  const pagedCatalog = filteredCatalog.slice(
    (catalogCurrentPage - 1) * PAGE_SIZE,
    catalogCurrentPage * PAGE_SIZE,
  );

  const runAction = async (issueId: string, action: () => Promise<void>, success: string) => {
    setBusyId(issueId);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async () => {
    if (!returnIssue?.id) return;
    const lines = (returnIssue.lines || [])
      .map((line) => ({
        lineId: line.lineId,
        itemId: line.itemId,
        locationId: line.locationId,
        locationCode: line.locationCode,
        quantity: Number(returnQtyByLine[departmentConsumableLineKey(line)] || 0),
      }))
      .filter((row) => row.quantity > 0);
    if (!lines.length) {
      toast.error('أدخل كمية مرتجع واحدة على الأقل.');
      return;
    }
    setBusyId(returnIssue.id);
    try {
      await departmentConsumableIssueService.returnLines(returnIssue.id, lines);
      toast.success('تم تسجيل المرتجع.');
      setReturnIssue(null);
      setReturnQtyByLine({});
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل المرتجع.');
    } finally {
      setBusyId(null);
    }
  };

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const data = await departmentConsumableIssueService.monthlyReport({
        month: reportMonth,
        departmentId: reportDepartmentId || undefined,
        warehouseId: reportWarehouseId || undefined,
      });
      setReport(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل التقرير.');
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const exportReport = () => {
    if (!report?.rows.length) {
      toast.error('لا توجد بيانات للتصدير.');
      return;
    }
    exportGenericRows(
      report.rows.map((row) => ({
        القسم: row.departmentName,
        الصنف: row.itemName,
        الكود: row.itemCode,
        الوحدة: row.unit,
        'مصروف': row.issuedQty,
        'مرتجع': row.returnedQty,
        'صافي': row.netQty,
        'قيمة مصروف': row.issuedCost,
        'قيمة مرتجع': row.returnedCost,
        'صافي قيمة': row.netCost,
      })),
      `مستهلكات-أقسام-${report.month}`,
      'تقرير شهري',
    );
    toast.success('تم تصدير التقرير.');
  };

  const exportBalancesSheet = async () => {
    if (!canExport && !canView) {
      toast.error('ليس لديك صلاحية التصدير.');
      return;
    }
    setExportingBalances(true);
    try {
      const visibleWarehouses = filterWarehouses(warehouses);
      const warehouseById = new Map(visibleWarehouses.map((w) => [w.id!, w]));
      const consumableById = new Map(consumables.map((c) => [c.id, c]));
      const consumableIds = new Set(consumables.map((c) => c.id));
      const [balances, locationBalances] = await Promise.all([
        stockService.getBalances(),
        stockService.getLocationBalances({ itemType: 'material' }),
      ]);

      const rows: Array<{
        itemCode: string;
        itemName: string;
        warehouseCode: string;
        warehouseName: string;
        locationCode?: string;
        quantity: number;
        unitPrice: number;
      }> = [];

      const warehousesWithLocations = new Set(
        locations
          .filter((l) => l.isActive !== false && warehouseById.has(l.warehouseId))
          .map((l) => l.warehouseId),
      );

      for (const bal of locationBalances) {
        if (bal.itemType !== 'material' || !consumableIds.has(bal.itemId)) continue;
        const wh = warehouseById.get(bal.warehouseId);
        if (!wh?.id) continue;
        const material = consumableById.get(bal.itemId);
        if (!material) continue;
        rows.push({
          itemCode: material.code,
          itemName: material.name,
          warehouseCode: wh.code,
          warehouseName: wh.name,
          locationCode: bal.locationCode || '',
          quantity: Number(bal.quantity || 0),
          unitPrice: Number(material.purchaseCost || 0),
        });
      }

      for (const bal of balances) {
        if (bal.itemType !== 'material' || !consumableIds.has(bal.itemId)) continue;
        const wh = warehouseById.get(bal.warehouseId);
        if (!wh?.id) continue;
        if (warehousesWithLocations.has(bal.warehouseId)) continue;
        const material = consumableById.get(bal.itemId);
        if (!material) continue;
        rows.push({
          itemCode: material.code,
          itemName: material.name,
          warehouseCode: wh.code,
          warehouseName: wh.name,
          quantity: Number(bal.quantity || 0),
          unitPrice: Number(material.purchaseCost || 0),
        });
      }

      // Include zero-balance consumables on first scoped warehouse so the sheet is complete.
      if (!rows.length && consumables.length && visibleWarehouses[0]?.id) {
        const wh = visibleWarehouses[0];
        for (const material of consumables) {
          rows.push({
            itemCode: material.code,
            itemName: material.name,
            warehouseCode: wh.code,
            warehouseName: wh.name,
            quantity: 0,
            unitPrice: Number(material.purchaseCost || 0),
          });
        }
      }

      exportDepartmentConsumablesBalancesSheet(rows);
      toast.success(`تم تصدير ${rows.length} صف رصيد مستهلكات.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تصدير الأرصدة.');
    } finally {
      setExportingBalances(false);
    }
  };

  const sheetParseContext = useMemo(() => {
    const visibleWarehouses = filterWarehouses(warehouses);
    const consumableIds = new Set(consumables.map((c) => c.id));
    return {
      materials: consumables.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        unit: c.unit,
        purchaseCost: Number(c.purchaseCost || 0),
      })),
      warehouses: visibleWarehouses
        .filter((w) => w.id)
        .map((w) => ({ id: w.id!, code: w.code, name: w.name })),
      locations: locations
        .filter((l) => l.id && (!scoped || warehouseIds.includes(l.warehouseId)))
        .map((l) => ({
          id: l.id!,
          code: l.code,
          warehouseId: l.warehouseId,
          isActive: l.isActive,
        })),
      balances: [] as Array<{
        warehouseId: string;
        itemId: string;
        locationId?: string;
        quantity: number;
      }>,
      allowedWarehouseIds: scoped ? warehouseIds : null,
      _consumableIds: consumableIds,
    };
  }, [consumables, filterWarehouses, locations, scoped, warehouseIds, warehouses]);

  const loadSheetParseContext = useCallback(async () => {
    const base = sheetParseContext;
    const consumableIds = new Set(base.materials.map((m) => m.id));
    const [balances, locationBalances] = await Promise.all([
      stockService.getBalances(),
      stockService.getLocationBalances({ itemType: 'material' }),
    ]);
    const merged: Array<{
      warehouseId: string;
      itemId: string;
      locationId?: string;
      quantity: number;
    }> = [];

    for (const bal of locationBalances) {
      if (bal.itemType !== 'material' || !consumableIds.has(bal.itemId)) continue;
      if (scoped && !warehouseIds.includes(bal.warehouseId)) continue;
      merged.push({
        warehouseId: bal.warehouseId,
        itemId: bal.itemId,
        locationId: bal.locationId,
        quantity: Number(bal.quantity || 0),
      });
    }

    const warehousesWithLocations = new Set(
      base.locations.map((l) => l.warehouseId),
    );
    for (const bal of balances) {
      if (bal.itemType !== 'material' || !consumableIds.has(bal.itemId)) continue;
      if (scoped && !warehouseIds.includes(bal.warehouseId)) continue;
      if (warehousesWithLocations.has(bal.warehouseId)) continue;
      merged.push({
        warehouseId: bal.warehouseId,
        itemId: bal.itemId,
        quantity: Number(bal.quantity || 0),
      });
    }

    return {
      materials: base.materials,
      warehouses: base.warehouses,
      locations: base.locations,
      balances: merged,
      allowedWarehouseIds: base.allowedWarehouseIds,
    };
  }, [scoped, sheetParseContext, warehouseIds]);

  const handleConfirmSheetImport = async (
    rows: ParsedConsumableSheetRow[],
    fileName: string,
  ) => {
    if (!canImportSheet) {
      toast.error('مسار رفع شيت المستهلكات غير متاح.');
      return;
    }
    setSheetBusy(true);
    try {
      const jobId = addJob({
        fileName,
        jobType: 'Department Consumables Sheet',
        totalRows: rows.length,
        startedBy: actor,
      });
      setActiveModal('none');
      setPanelHidden(false);
      setPanelMinimized(false);
      startJob(jobId, 'تحديث أرصدة وأسعار المستهلكات...');
      void runConsumableSheetImportJob({
        jobId,
        rows,
        createdBy: actor,
        onProgress: (processed, total) => {
          setJobProgress(jobId, {
            processedRows: processed,
            totalRows: total,
            statusText: `جاري التطبيق ${processed}/${total}`,
          });
        },
        onComplete: (added, failed) => {
          completeJob(jobId, {
            addedRows: added,
            failedRows: failed,
            statusText: failed
              ? `اكتمل مع أخطاء (${failed} فشل)`
              : 'اكتمل رفع شيت المستهلكات',
          });
          void load();
        },
        onFail: (message) => {
          failJob(jobId, message, 'فشل رفع شيت المستهلكات');
        },
      });
      toast.success('بدأت المهمة — تابع التقدم من «المهام».');
    } finally {
      setSheetBusy(false);
    }
  };

  const openTraceForLine = (line: DepartmentConsumableIssueLine) => {
    setTraceItem({
      id: line.itemId,
      name: line.itemName,
      code: line.itemCode,
      unit: line.unit,
    });
  };

  if (!canView) {
    return (
      <ModuleOpsPageShell eyebrow="صرف مستهلكات الأقسام">
        <OpsDashPanel accent="inventory">
          <p className="text-sm text-[var(--color-text-muted)]">
            ليس لديك صلاحية عرض صرف مستهلكات الأقسام.
          </p>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="صرف مستهلكات الأقسام"
      rangeLabel="تعريف مستهلكات وإضافتها للمخزن وصرفها نهائياً للأقسام مع تقرير شهري"
      actions={(
        <div className="flex flex-wrap gap-2">
          {(canExport || canView) && (
            <Button
              variant="secondary"
              onClick={() => void exportBalancesSheet()}
              disabled={exportingBalances || loading}
            >
              {exportingBalances ? 'جاري التصدير...' : 'تصدير أرصدة Excel'}
            </Button>
          )}
          {canImportSheet && (
            <Button variant="secondary" onClick={() => setActiveModal('importSheet')}>
              رفع شيت مستهلكات
            </Button>
          )}
          {canDefine && (
            <Button variant="secondary" onClick={() => setShowDefine(true)}>
              تعريف مستهلك
            </Button>
          )}
          {canAddStock && (
            <Button variant="secondary" onClick={() => setActiveModal('addStock')}>
              إضافة للمخزن
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setActiveModal('createIssue')}>
              سند صرف جديد
            </Button>
          )}
        </div>
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'issues' ? 'primary' : 'secondary'} onClick={() => setTab('issues')}>
          السندات
        </Button>
        <Button variant={tab === 'catalog' ? 'primary' : 'secondary'} onClick={() => setTab('catalog')}>
          المستهلكات المعرفة
        </Button>
        <Button variant={tab === 'report' ? 'primary' : 'secondary'} onClick={() => setTab('report')}>
          التقرير الشهري
        </Button>
      </div>

      {tab === 'catalog' && (
        <OpsDashPanel title="المستهلكات المعرفة" accent="inventory" className="p-0 overflow-hidden" bodyClassName="p-0">
          <div className="p-4 border-b border-[var(--color-border)]">
            <SmartFilterBar
              pageId="department-consumables-catalog"
              searchPlaceholder="بحث بالاسم / الكود / الوحدة"
              searchValue={catalogSearch}
              onSearchChange={setCatalogSearch}
              extra={canDefine ? (
                <Button size="sm" onClick={() => setShowDefine(true)}>
                  تعريف مستهلك
                </Button>
              ) : undefined}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الكود</th>
                  <th className="erp-th">الاسم</th>
                  <th className="erp-th">الوحدة</th>
                  <th className="erp-th">سعر الوحدة</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      جاري التحميل...
                    </td>
                  </tr>
                )}
                {!loading && pagedCatalog.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      {consumables.length === 0 ? (
                        <>
                          لا توجد مستهلكات معرفة بعد
                          {canDefine && (
                            <>
                              {' — '}
                              <button
                                type="button"
                                className="underline font-bold"
                                onClick={() => setShowDefine(true)}
                              >
                                عرّف مستهلكًا
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        'لا توجد نتائج مطابقة للبحث.'
                      )}
                    </td>
                  </tr>
                )}
                {!loading && pagedCatalog.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--color-border)]">
                    <td className="p-3 text-sm font-mono tabular-nums">{item.code}</td>
                    <td className="p-3 text-sm font-bold">{item.name}</td>
                    <td className="p-3 text-sm">{consumableUnitLabel(item.unit)}</td>
                    <td className="p-3 text-sm tabular-nums">
                      {moneyFmt(Number(item.purchaseCost || 0))}
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setTraceItem(item)}
                      >
                        سجل الحركات
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={catalogCurrentPage}
            totalPages={catalogTotalPages}
            totalItems={filteredCatalog.length}
            onPageChange={setCatalogPage}
            itemLabel="مستهلك"
          />
        </OpsDashPanel>
      )}

      {tab === 'issues' && (
        <OpsDashPanel title="سندات الصرف" accent="inventory" className="p-0 overflow-hidden" bodyClassName="p-0">
          <div className="p-4 border-b border-[var(--color-border)]">
            <SmartFilterBar
              searchPlaceholder="بحث برقم السند / القسم / الصنف"
              searchValue={search}
              onSearchChange={setSearch}
              filters={[
                {
                  key: 'status',
                  label: 'الحالة',
                  options: Object.entries(DEPARTMENT_CONSUMABLE_STATUS_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                  defaultVisible: true,
                },
                {
                  key: 'departmentId',
                  label: 'القسم',
                  options: departments.map((d) => ({ value: d.id || '', label: d.name })),
                  defaultVisible: true,
                },
                {
                  key: 'warehouseId',
                  label: 'المخزن',
                  options: visibleWarehouses.map((w) => ({ value: w.id || '', label: w.name })),
                  defaultVisible: true,
                },
              ]}
              filterValues={{
                status: statusFilter || 'all',
                departmentId: departmentFilter || 'all',
                warehouseId: warehouseFilter || 'all',
              }}
              onFilterChange={(key, value) => {
                if (key === 'warehouseId' && warehouseSelectLocked) return;
                const normalized = value === 'all' ? '' : value;
                if (key === 'status') setStatusFilter(normalized);
                if (key === 'departmentId') setDepartmentFilter(normalized);
                if (key === 'warehouseId') setWarehouseFilter(normalized);
              }}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">السند</th>
                  <th className="erp-th">القسم</th>
                  <th className="erp-th">المخزن</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">البنود</th>
                  <th className="erp-th">القيمة</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      جاري التحميل...
                    </td>
                  </tr>
                )}
                {!loading && pagedOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      لا توجد سندات مطابقة.
                      {consumables.length === 0 && (
                        <div className="mt-2">
                          لا توجد مستهلكات معرفة بعد —{' '}
                          <button
                            type="button"
                            className="underline font-bold"
                            onClick={() => setShowDefine(true)}
                          >
                            عرّف مستهلكًا
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {!loading && pagedOrders.map((order) => {
                  const busy = busyId === order.id;
                  return (
                    <tr key={order.id} className="border-t border-[var(--color-border)]">
                      <td className="p-3 text-sm font-bold">{order.referenceNo}</td>
                      <td className="p-3 text-sm">{order.departmentName}</td>
                      <td className="p-3 text-sm">{order.warehouseName}</td>
                      <td className="p-3 text-sm">
                        {DEPARTMENT_CONSUMABLE_STATUS_LABELS[order.status] || order.status}
                        <div className="text-[11px] text-[var(--color-text-muted)]">
                          {order.approvalMode === 'required' ? 'بموافقة' : 'مباشر'}
                        </div>
                      </td>
                      <td className="p-3 text-sm">
                        {(order.lines || []).slice(0, 3).map((line: DepartmentConsumableIssueLine) => (
                          <button
                            key={`${line.itemId}-${line.locationId || ''}`}
                            type="button"
                            className="block text-start underline-offset-2 hover:underline"
                            onClick={() => openTraceForLine(line)}
                            title="عرض سجل الحركات"
                          >
                            {line.itemName}: {fmt(line.quantity)} {line.unit}
                          </button>
                        ))}
                        {(order.lines || []).length > 3 && (
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            +{(order.lines || []).length - 3} أخرى
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-sm tabular-nums">{fmt(Number(order.totalCostSnapshot || 0))}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {canCreate && canSubmit(order.status, order.approvalMode) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runAction(order.id!, () => departmentConsumableIssueService.submit(order.id!), 'تم تقديم السند.')}
                            >
                              تقديم
                            </Button>
                          )}
                          {canApproveIssue && canApprove(order.status, order.approvalMode) && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction(order.id!, () => departmentConsumableIssueService.approve(order.id!), 'تم اعتماد السند.')}
                            >
                              اعتماد
                            </Button>
                          )}
                          {canApproveIssue && canReject(order.status, order.approvalMode) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('سبب الرفض') || '';
                                void runAction(
                                  order.id!,
                                  () => departmentConsumableIssueService.reject(order.id!, reason),
                                  'تم رفض السند.',
                                );
                              }}
                            >
                              رفض
                            </Button>
                          )}
                          {canExecute && canIssue(order.status, order.approvalMode) && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void runAction(order.id!, () => departmentConsumableIssueService.issue(order.id!), 'تم تنفيذ الصرف.')}
                            >
                              تنفيذ
                            </Button>
                          )}
                          {canExecute && canReturn(order.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setReturnIssue(order);
                                setReturnQtyByLine({});
                              }}
                            >
                              مرتجع
                            </Button>
                          )}
                          {canCreate && canCancel(order.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runAction(order.id!, () => departmentConsumableIssueService.cancel(order.id!), 'تم إلغاء السند.')}
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DataPaginationFooter
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredOrders.length}
            onPageChange={setPage}
            itemLabel="سند"
          />
        </OpsDashPanel>
      )}

      {tab === 'report' && (
        <OpsDashPanel title="التقرير الشهري" accent="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm space-y-1">
              <span className="font-bold">الشهر</span>
              <input
                type="month"
                className="w-full border rounded-lg px-3 py-2"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="font-bold">القسم</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={reportDepartmentId}
                onChange={(e) => setReportDepartmentId(e.target.value)}
              >
                <option value="">كل الأقسام</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="font-bold">المخزن</span>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={reportWarehouseId}
                onChange={(e) => {
                  if (warehouseSelectLocked) return;
                  setReportWarehouseId(e.target.value);
                }}
                disabled={warehouseSelectLocked}
              >
                {!warehouseSelectLocked && <option value="">كل المخازن</option>}
                {visibleWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button onClick={() => void loadReport()} disabled={reportLoading}>
                {reportLoading ? 'جاري التحميل...' : 'عرض'}
              </Button>
              {canExport && (
                <Button variant="secondary" onClick={exportReport} disabled={!report?.rows.length}>
                  Excel
                </Button>
              )}
            </div>
          </div>

          {report && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-[var(--color-text-muted)]">عدد السندات</p>
                <p className="text-lg font-bold tabular-nums">{fmt(report.issueCount)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-[var(--color-text-muted)]">قيمة المصروف</p>
                <p className="text-lg font-bold tabular-nums">{fmt(report.totalIssuedCost)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-[var(--color-text-muted)]">قيمة المرتجع</p>
                <p className="text-lg font-bold tabular-nums">{fmt(report.totalReturnedCost)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-[var(--color-text-muted)]">صافي القيمة</p>
                <p className="text-lg font-bold tabular-nums">{fmt(report.totalNetCost)}</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">القسم</th>
                  <th className="erp-th">الصنف</th>
                  <th className="erp-th">الوحدة</th>
                  <th className="erp-th">مصروف</th>
                  <th className="erp-th">مرتجع</th>
                  <th className="erp-th">صافي</th>
                  <th className="erp-th">صافي قيمة</th>
                </tr>
              </thead>
              <tbody>
                {!report && !reportLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      اختر الشهر ثم اضغط عرض.
                    </td>
                  </tr>
                )}
                {report && report.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                      لا توجد حركات في هذا الشهر.
                    </td>
                  </tr>
                )}
                {report?.rows.map((row) => (
                  <tr key={`${row.departmentId}-${row.itemId}-${row.unit}`} className="border-t border-[var(--color-border)]">
                    <td className="p-3 text-sm">{row.departmentName}</td>
                    <td className="p-3 text-sm">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => setTraceItem({
                          id: row.itemId,
                          name: row.itemName,
                          code: row.itemCode,
                          unit: row.unit,
                        })}
                      >
                        {row.itemName} ({row.itemCode})
                      </button>
                    </td>
                    <td className="p-3 text-sm">{row.unit}</td>
                    <td className="p-3 text-sm tabular-nums">{fmt(row.issuedQty)}</td>
                    <td className="p-3 text-sm tabular-nums">{fmt(row.returnedQty)}</td>
                    <td className="p-3 text-sm tabular-nums font-bold">{fmt(row.netQty)}</td>
                    <td className="p-3 text-sm tabular-nums font-bold">{fmt(row.netCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report?.truncated && (
            <p className="text-xs text-amber-700">تم اقتطاع التقرير عند حد الحركات الأقصى.</p>
          )}
        </OpsDashPanel>
      )}

      <DefineConsumableModal
        open={showDefine}
        onClose={() => setShowDefine(false)}
        canManage={canDefine}
        onCreated={(item) => {
          setConsumables((prev) => (prev.some((c) => c.id === item.id) ? prev : [item, ...prev]));
        }}
      />

      <AddConsumableStockModal
        open={activeModal === 'addStock'}
        onClose={() => setActiveModal('none')}
        onSaved={() => void load()}
        onDefineConsumable={() => setShowDefine(true)}
        warehouses={visibleWarehouses}
        locations={locations}
        consumables={consumables}
        canAdd={canAddStock}
        createdBy={actor}
      />

      <ImportConsumablesSheetModal
        open={activeModal === 'importSheet'}
        onClose={() => setActiveModal('none')}
        loadParseContext={loadSheetParseContext}
        confirming={sheetBusy}
        onConfirm={(rows, fileName) => {
          void handleConfirmSheetImport(rows, fileName);
        }}
      />

      <CreateDepartmentIssueModal
        open={activeModal === 'createIssue'}
        onClose={() => setActiveModal('none')}
        onCreated={() => void load()}
        onDefineConsumable={() => setShowDefine(true)}
        warehouses={visibleWarehouses}
        locations={locations}
        departments={departments}
        consumables={consumables}
        initialWarehouseId={resolveScopedWarehouseId(visibleWarehouses[0]?.id || '')}
        initialDepartmentId={departments[0]?.id}
      />

      <ReturnConsumableModal
        issue={returnIssue}
        qtyByLine={returnQtyByLine}
        onChangeQty={(lineKey, quantity) =>
          setReturnQtyByLine((prev) => ({ ...prev, [lineKey]: quantity }))}
        onClose={() => setReturnIssue(null)}
        onConfirm={() => void handleReturn()}
        busy={busyId === returnIssue?.id}
      />

      <ItemMovementTraceModal
        open={Boolean(traceItem)}
        onClose={() => setTraceItem(null)}
        item={traceItem}
        warehouses={warehouses}
      />
    </ModuleOpsPageShell>
  );
};
