import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';
import { Badge, Card } from '../components/UI';
import { TableIconAction, ToneActionButton } from '@/src/components/erp/TableIconAction';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { transferApprovalService } from '../services/transferApprovalService';
import {
  approveTransferRequest,
  rejectTransferRequest,
} from '../usecases/approveTransferRequest';
import { unwrapOrThrow } from '@/shared/usecases';
import { warehouseService } from '../services/warehouseService';
import type { InventoryTransferRequest, Warehouse } from '../types';
import { transferRequestTypeLabel } from '../lib/stockLabels';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useManagedPrint } from '../../../utils/printManager';
import { StockTransferPrint, type StockTransferPrintData } from '../components/StockTransferPrint';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../utils/transferUnits';
import { toast } from '../../../components/Toast';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { MaterialsWarehouseScopeBanner } from '../components/MaterialsWarehouseScopeBanner';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_TRANSFER_DECISION_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

const PAGE_SIZE = 20;
const TRANSFER_APPROVALS_CACHE_KEY = 'inventory:transfer-approvals';

type TransferApprovalsPageData = {
  requests: InventoryTransferRequest[];
  warehouses: Warehouse[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
};
function transferAgeDays(row: InventoryTransferRequest): number {
  const iso = row.submittedAt || row.createdAt;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

export const TransferApprovals: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const transferApprovalPermission = useAppStore(
    (s) => s.systemSettings.planSettings?.transferApprovalPermission || 'inventory.transfers.approve',
  );
  const transferDisplayUnit = useAppStore(
    (s) => (s.systemSettings.planSettings?.transferDisplayUnit || 'piece') as TransferDisplayUnitMode,
  );
  const rawProducts = useAppStore((s) => s._rawProducts);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const finishedReceiveWarehouseId = useAppStore(
    (s) => s.systemSettings.planSettings?.finishedReceiveWarehouseId || '',
  );
  const defaultProductionWarehouseId = useAppStore(
    (s) => s.systemSettings.planSettings?.defaultProductionWarehouseId || '',
  );
  const decomposedSourceWarehouseId = useAppStore(
    (s) => s.systemSettings.planSettings?.decomposedSourceWarehouseId || '',
  );
  const allowNegativeFinishedTransferStock = useAppStore(
    (s) => Boolean(s.systemSettings.planSettings?.allowNegativeFinishedTransferStock),
  );
  const allowNegativeDecomposedStock = useAppStore(
    (s) => Boolean(s.systemSettings.planSettings?.allowNegativeDecomposedStock),
  );
  const [requests, setRequests] = useState<InventoryTransferRequest[]>(
    () => peekPageDataCache<TransferApprovalsPageData>(TRANSFER_APPROVALS_CACHE_KEY)?.requests ?? [],
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>(
    () => peekPageDataCache<TransferApprovalsPageData>(TRANSFER_APPROVALS_CACHE_KEY)?.warehouses ?? [],
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('pending');
  const [warehouseFilter, setWarehouseFilter] = useState(
    () => searchParams.get('warehouseId') || '',
  );
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
  const [slaOnly, setSlaOnly] = useState(false);
  const transferSlaDays = useAppStore((s) => Number(s.systemSettings.planSettings?.transferSlaWarningDays || 2));
  const [typeTab, setTypeTab] = useState<
    'all' | 'manual' | 'production_entry' | 'production_auto' | 'finished_final' | 'packaging'
  >('production_entry');
  const [loading, setLoading] = useState(
    () => peekPageDataCache<TransferApprovalsPageData>(TRANSFER_APPROVALS_CACHE_KEY) == null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [processingId, setProcessingId] = useState<string>('');
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'pending-transfer-approval',
  });

  useEffect(() => {
    setWarehouseFilter((prev) =>
      resolveScopedWarehouseId(prev, [searchParams.get('warehouseId') || '', scopedWarehouseId]),
    );
  }, [scoped, warehouseIds.join('|'), scopedWarehouseId, searchParams, resolveScopedWarehouseId]);

  const approvePathEnabled = isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.transferApprove,
    INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage,
  );
  const rejectPathEnabled = isOperationPathEnabled(
    systemSettings,
    INVENTORY_OPERATION_KEYS.transferReject,
    INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage,
  );
  const canApprovePermission = can(transferApprovalPermission as any);
  const canApprove = canApprovePermission && (approvePathEnabled || rejectPathEnabled);
  const canApproveNegativeFinishedTransfer = can('inventory.finishedStock.allowNegativeApprove');
  const normalizeActor = (value?: string) => String(value || '').trim().toLowerCase();

  const isSelfProductionEntryRequest = (request: InventoryTransferRequest | undefined): boolean => {
    if (!request || (request.requestType || 'transfer') !== 'production_entry') return false;
    return Boolean(
      (uid && request.createdByUserId && uid === request.createdByUserId) ||
      (
        !request.createdByUserId &&
        normalizeActor(request.createdBy) !== '' &&
        normalizeActor(request.createdBy) === normalizeActor(userDisplayName || userEmail || '')
      ),
    );
  };

  const allowNegativeFromSourceFor = (request: InventoryTransferRequest | undefined): boolean => {
    if (!request || !canApproveNegativeFinishedTransfer) return false;
    const fromId = String(request.fromWarehouseId || '').trim();
    if (!fromId) return false;
    const finishedWarehouseIds = [
      String(finishedReceiveWarehouseId || '').trim(),
      String(defaultProductionWarehouseId || '').trim(),
    ].filter(Boolean);
    const finishedPath =
      allowNegativeFinishedTransferStock &&
      finishedWarehouseIds.length > 0 &&
      finishedWarehouseIds.includes(fromId);
    const decomposedPath =
      allowNegativeDecomposedStock &&
      Boolean(String(decomposedSourceWarehouseId || '').trim()) &&
      fromId === String(decomposedSourceWarehouseId || '').trim();
    return finishedPath || decomposedPath;
  };

  const loadData = async (opts?: { silent?: boolean; warehouses?: boolean; force?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const force = Boolean(opts?.force) || silent;
    const fetchWarehouses = opts?.warehouses ?? !silent;
    const cached = peekPageDataCache<TransferApprovalsPageData>(TRANSFER_APPROVALS_CACHE_KEY);
    if (cached) {
      setRequests(cached.requests);
      if (cached.warehouses.length) setWarehouses(filterWarehouses(cached.warehouses));
    }
    if (!silent) {
      if (cached) setLoading(false);
      else setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        TRANSFER_APPROVALS_CACHE_KEY,
        async () => {
          if (fetchWarehouses) {
            const [rows, whs] = await Promise.all([
              transferApprovalService.getAll(),
              warehouseService.getWarehousesForReportingFilters(),
            ]);
            return { requests: rows, warehouses: filterWarehouses(whs) };
          }
          const rows = await transferApprovalService.getAll();
          const prev =
            peekPageDataCache<TransferApprovalsPageData>(TRANSFER_APPROVALS_CACHE_KEY)?.warehouses
            ?? warehouses;
          return { requests: rows, warehouses: prev };
        },
        { force, maxAgeMs: 45_000 },
      );
      setRequests(data.requests);
      setWarehouses(data.warehouses);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehouseMap = useMemo(
    () => new Map(warehouses.map((w) => [w.id || '', w.name])),
    [warehouses],
  );
  const unitsPerCartonByProductId = useMemo(
    () => new Map(rawProducts.map((p) => [p.id || '', Number(p.unitsPerCarton || 0)])),
    [rawProducts],
  );
  const withResolvedUnitsPerCarton = <T extends { itemType: InventoryTransferRequest['lines'][number]['itemType']; itemId: string; quantity: number; unitsPerCarton?: number }>(line: T): T => {
    if (line.itemType !== 'finished_good') return line;
    const resolved = Number(line.unitsPerCarton || unitsPerCartonByProductId.get(line.itemId) || 0);
    return { ...line, unitsPerCarton: resolved };
  };
  const formatTransferLinesSummary = (lines: InventoryTransferRequest['lines']): string => {
    const summary = lines.slice(0, 2).map((line) => {
      const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
      return `${line.itemName} (${display.quantity} ${display.unitLabel})`;
    }).join('، ');
    return lines.length > 2 ? `${summary} ...` : summary;
  };

  const matchesTypeTab = (row: InventoryTransferRequest) => {
    const t = row.requestType || 'manual_transfer';
    if (typeTab === 'all') return true;
    if (typeTab === 'manual') return t === 'transfer' || t === 'manual_transfer';
    if (typeTab === 'production_entry') return t === 'production_entry';
    if (typeTab === 'production_auto') return t === 'production_auto_transfer';
    if (typeTab === 'finished_final') return t === 'finished_to_final';
    if (typeTab === 'packaging') return t === 'packaging_transfer';
    return true;
  };

  const filtered = useMemo(() => {
    return requests.filter((row) => {
      const statusOk = statusFilter === 'all' || row.status === statusFilter;
      const warehouseOk = scoped
        ? warehouseIds.length > 0 &&
          (warehouseFilter
            ? row.fromWarehouseId === warehouseFilter || row.toWarehouseId === warehouseFilter
            : warehouseIds.includes(row.fromWarehouseId) || warehouseIds.includes(row.toWarehouseId))
        : !warehouseFilter ||
          row.fromWarehouseId === warehouseFilter ||
          row.toWarehouseId === warehouseFilter;
      const slaOk = !slaOnly || (row.status === 'pending' && transferAgeDays(row) >= transferSlaDays);
      return statusOk && warehouseOk && matchesTypeTab(row) && slaOk;
    });
  }, [requests, statusFilter, warehouseFilter, typeTab, slaOnly, transferSlaDays, scoped, warehouseIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, warehouseFilter, typeTab, slaOnly]);

  const bulkApproveEligible = useMemo(
    () => requests.filter((r) => r.status === 'pending' && r.id && !isSelfProductionEntryRequest(r)),
    [requests, uid, userDisplayName, userEmail],
  );

  const buildPrintData = (row: InventoryTransferRequest): StockTransferPrintData => ({
    transferNo: row.referenceNo,
    createdAt: row.createdAt,
    fromWarehouseName: warehouseMap.get(row.fromWarehouseId) || row.fromWarehouseName || row.fromWarehouseId,
    toWarehouseName: warehouseMap.get(row.toWarehouseId) || row.toWarehouseName || row.toWarehouseId,
    createdBy: row.createdBy,
    items: row.lines.map((line) => {
      const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
      return {
        itemName: line.itemName,
        itemCode: line.itemCode,
        unitLabel: display.unitLabel,
        quantity: display.quantity,
        quantityPieces: Number(line.quantity || 0),
      };
    }),
  });

  const printRequest = async (row: InventoryTransferRequest) => {
    setPrintData(buildPrintData(row));
    await new Promise((r) => setTimeout(r, 250));
    handleTransferPrint();
    setTimeout(() => setPrintData(null), 1000);
  };

  const handleApprove = async (requestId?: string) => {
    if (!requestId || !canApprovePermission || !approvePathEnabled) return;
    const request = requests.find((row) => row.id === requestId);
    if (isSelfProductionEntryRequest(request)) {
      toast.warning('لا يمكن لمنشئ التقرير اعتماد إدخال الإنتاج الخاص به. يجب اعتمادها من مستخدم آخر مخوّل.');
      return;
    }
    setProcessingId(requestId);
    try {
      unwrapOrThrow(await approveTransferRequest({
        requestId,
        approvedBy: userDisplayName || userEmail || 'Current User',
        allowNegativeFromSource: allowNegativeFromSourceFor(request),
        approverUserId: uid || undefined,
      }, { path: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage }));
      await loadData({ silent: true });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر اعتماد التحويلة.');
    } finally {
      setProcessingId('');
    }
  };

  const handleReject = async (requestId?: string) => {
    if (!requestId || !canApprovePermission || !rejectPathEnabled) return;
    const reason = window.prompt('سبب الرفض (اختياري):', '');
    if (reason === null) return;
    setProcessingId(requestId);
    try {
      unwrapOrThrow(await rejectTransferRequest({
        requestId,
        rejectedBy: userDisplayName || userEmail || 'Current User',
        reason: reason || '',
        rejectedByUserId: uid || undefined,
      }, { path: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage }));
      await loadData({ silent: true });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر رفض التحويلة.');
    } finally {
      setProcessingId('');
    }
  };

  const handleCancelMovement = async (requestId?: string) => {
    if (!requestId || !canApprove) return;
    const reason = window.prompt('سبب إلغاء الحركة (اختياري):', '');
    if (reason === null) return;
    const confirmed = window.confirm('سيتم عكس حركة المخزون لهذه التحويلة. هل تريد المتابعة؟');
    if (!confirmed) return;
    setProcessingId(requestId);
    try {
      await transferApprovalService.cancelRequest(
        requestId,
        userDisplayName || userEmail || 'Current User',
        reason || '',
        uid || undefined,
      );
      await loadData({ silent: true });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إلغاء الحركة.');
    } finally {
      setProcessingId('');
    }
  };

  const openRequest = (row: InventoryTransferRequest) => {
    const rowIsSelfProductionEntry = isSelfProductionEntryRequest(row);
    openModal(MODAL_KEYS.INVENTORY_APPROVE_TRANSFER, {
      request: row,
      warehouseMap,
      canApprove,
      canCancelMovement: row.status === 'approved',
      approveDisabledReason: rowIsSelfProductionEntry
        ? 'لا يمكن اعتماد طلب أنشأته بنفسك.'
        : undefined,
      onPrint: () => void printRequest(row),
      onApprove: async () => {
        if (!row.id) return;
        await handleApprove(row.id);
      },
      onReject: async () => {
        if (!row.id) return;
        await handleReject(row.id);
      },
      onCancelMovement: async () => {
        if (!row.id) return;
        await handleCancelMovement(row.id);
      },
    });
  };

  const handleApproveAll = async () => {
    if (!canApprovePermission || !approvePathEnabled || bulkApproving || loading) return;
    const targets = bulkApproveEligible;
    if (!targets.length) {
      toast.info('لا توجد طلبات معلقة يمكن اعتمادها دفعة واحدة.');
      return;
    }
    const pendingSelfSkipped = requests.filter(
      (r) => r.status === 'pending' && r.id && isSelfProductionEntryRequest(r),
    ).length;
    let confirmMsg = `سيتم اعتماد ${targets.length} طلبات.`;
    if (pendingSelfSkipped > 0) {
      confirmMsg += ` (${pendingSelfSkipped} طلبات لن يُعتمد تلقائياً لأنها دخول تم الصنع بإنشائك.)`;
    }
    confirmMsg += ' هل تريد المتابعة؟';
    if (!window.confirm(confirmMsg)) return;

    setBulkApproving(true);
    const actor = userDisplayName || userEmail || 'Current User';
    let ok = 0;
    const errors: string[] = [];
    try {
      for (const req of targets) {
        const id = req.id!;
        try {
          unwrapOrThrow(await approveTransferRequest({
            requestId: id,
            approvedBy: actor,
            allowNegativeFromSource: allowNegativeFromSourceFor(req),
            approverUserId: uid || undefined,
          }, { path: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage }));
          ok += 1;
        } catch (e: any) {
          errors.push(`${req.referenceNo || id}: ${e?.message || 'خطأ'}`);
        }
      }
    } finally {
      setBulkApproving(false);
    }

    await loadData({ silent: true });
    if (errors.length === 0) {
      toast.success(`تم اعتماد ${ok} طلبات.`);
    } else {
      toast.warning(
        `تم اعتماد ${ok} طلبات، وفشل ${errors.length}. ${errors.slice(0, 3).join(' — ')}${errors.length > 3 ? '…' : ''}`,
      );
    }
  };

  return (
    <div className="erp-ds-clean space-y-5">
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">اعتماد تحويلات المخازن</h2>
          <p className="page-subtitle">
            اعتماد إدخال الإنتاج يرحّل الرصيد إلى «تم الإنتاج» بانتظار التغليف. التحويلات لا تؤثر على المخزون قبل الاعتماد.
          </p>
        </div>
      </div>

      <SmartFilterBar
      pageId="transfer-approvals"
        quickFilters={[
          {
            key: 'status',
            placeholder: 'كل الحالات',
            options: [
              { value: 'pending', label: 'قيد الاعتماد' },
              { value: 'approved', label: 'معتمدة' },
              { value: 'rejected', label: 'مرفوضة' },
              { value: 'cancelled', label: 'ملغاة' },
            ],
          },
          {
            key: 'warehouse',
            placeholder: 'كل المخازن',
            options: warehouses.map((w) => ({ value: w.id || '', label: w.name })),
            width: 'min-w-[180px]',
          },
        ]}
        quickFilterValues={{ status: statusFilter, warehouse: warehouseFilter || 'all' }}
        onQuickFilterChange={(key, value) => {
          if (key === 'status') setStatusFilter(value as typeof statusFilter);
          if (key === 'warehouse') setWarehouseFilter(value === 'all' ? '' : value);
        }}
        extra={
          <>
            <label className="flex items-center gap-2 text-xs font-bold px-2">
              <input type="checkbox" checked={slaOnly} onChange={(e) => setSlaOnly(e.target.checked)} />
              تجاوز SLA ({transferSlaDays}+ يوم)
            </label>
            {canApprovePermission && approvePathEnabled && bulkApproveEligible.length > 0 && (
              <ToneActionButton
                action="approve"
                icon="done_all"
                onClick={() => void handleApproveAll()}
                disabled={loading || bulkApproving}
                loading={bulkApproving}
              >
                اعتماد الكل ({bulkApproveEligible.length})
              </ToneActionButton>
            )}
            <ToneActionButton
              action="view"
              icon="refresh"
              tone="neutral"
              onClick={() => {
                invalidatePageDataCache(TRANSFER_APPROVALS_CACHE_KEY);
                void loadData({ force: true });
              }}
              disabled={loading || bulkApproving}
              title="تحديث"
            >
              تحديث
            </ToneActionButton>
          </>
        }
      />

      <MaterialsWarehouseScopeBanner
        scoped={scoped}
        routingConfigured={routingConfigured}
        settingsPath={settingsPath}
      />

      <div className="flex flex-wrap gap-2">
        {([
          ['production_entry', 'إدخال إنتاج'],
          ['all', 'الكل'],
          ['manual', 'يدوي'],
          ['production_auto', 'ترحيل تم الإنتاج'],
          ['finished_final', 'إلى منتج تام'],
          ['packaging', 'تغليف'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              typeTab === key ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!canApprove && (
        <div className="rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          لا تملك صلاحية الاعتماد الحالية: <span dir="ltr">{transferApprovalPermission}</span>
        </div>
      )}
      {canApprove &&
        (allowNegativeFinishedTransferStock || allowNegativeDecomposedStock) &&
        !canApproveNegativeFinishedTransfer && (
        <div className="rounded-[var(--border-radius-lg)] border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          تم تفعيل التحويل بالسالب من الإعدادات (تم الصنع و/أو مخزن المفكك)، لكن دورك لا يملك صلاحية
          <span dir="ltr" className="mx-1">inventory.finishedStock.allowNegativeApprove</span>
          لذلك الاعتماد بالسالب غير متاح لك.
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="space-y-2.5 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`transfer-skeleton-${i}`} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">لا توجد طلبات تحويل في هذا الفلتر.</div>
        ) : (
          <div className="space-y-2.5">
            <div className="md:hidden space-y-2.5 p-3">
              {pagedRows.map((row) => {
                const requestType = row.requestType || 'transfer';
                const fromName = requestType === 'production_entry'
                  ? (row.fromWarehouseName || 'تقارير الإنتاج')
                  : (warehouseMap.get(row.fromWarehouseId) || row.fromWarehouseName || row.fromWarehouseId);
                const toName = warehouseMap.get(row.toWarehouseId) || row.toWarehouseName || row.toWarehouseId;
                const rowProcessing = processingId === row.id || bulkApproving;
                return (
                  <div key={row.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--color-text)]">{row.referenceNo}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{transferRequestTypeLabel(requestType)}</p>
                      </div>
                      <Badge variant={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'}>
                        {STATUS_LABEL[row.status] || row.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                      <p><span className="font-bold">من:</span> {fromName}</p>
                      <p><span className="font-bold">إلى:</span> {toName}</p>
                      {row.lines.length === 1 ? (
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {formatTransferLinesSummary(row.lines)}
                        </p>
                      ) : (
                        <p><span className="font-bold">الأصناف:</span> {row.lines.length}</p>
                      )}
                      <p><span className="font-bold">المنشئ:</span> {row.createdBy}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <TableIconAction
                        action="view"
                        onClick={() => openRequest(row)}
                        disabled={rowProcessing}
                        title="فتح"
                        aria-label={`فتح طلب ${row.referenceNo}`}
                      />
                      <TableIconAction
                        action="print"
                        onClick={() => void printRequest(row)}
                        disabled={rowProcessing}
                        aria-label={`طباعة طلب ${row.referenceNo}`}
                      />
                      {row.status === 'pending' && (
                        <>
                          <TableIconAction
                            action="approve"
                            onClick={() => void handleApprove(row.id)}
                            disabled={!canApprove || rowProcessing || isSelfProductionEntryRequest(row)}
                            title={isSelfProductionEntryRequest(row) ? 'لا يمكن اعتماد طلب تم إنشاؤه من نفس المستخدم.' : 'اعتماد'}
                            aria-label={`اعتماد طلب ${row.referenceNo}`}
                          />
                          <TableIconAction
                            action="reject"
                            onClick={() => void handleReject(row.id)}
                            disabled={!canApprove || rowProcessing}
                            aria-label={`رفض طلب ${row.referenceNo}`}
                          />
                        </>
                      )}
                      {row.status === 'approved' && (
                        <TableIconAction
                          action="undo"
                          onClick={() => void handleCancelMovement(row.id)}
                          disabled={!canApprove || rowProcessing}
                          title="إلغاء الحركة"
                          aria-label={`إلغاء حركة طلب ${row.referenceNo}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="erp-table w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">رقم المرجع</th>
                  <th className="erp-th">من</th>
                  <th className="erp-th">إلى</th>
                  <th className="erp-th">الأصناف</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">العمر (يوم)</th>
                  <th className="erp-th">تقرير المصدر</th>
                  <th className="erp-th">المنشئ</th>
                  <th className="erp-th text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {pagedRows.map((row) => {
                  const rowProcessing = processingId === row.id || bulkApproving;
                  const requestType = row.requestType || 'transfer';
                  const rowIsSelfProductionEntry = isSelfProductionEntryRequest(row);
                  const fromName = requestType === 'production_entry'
                    ? (row.fromWarehouseName || 'تقارير الإنتاج')
                    : (warehouseMap.get(row.fromWarehouseId) || row.fromWarehouseName || row.fromWarehouseId);
                  const toName = warehouseMap.get(row.toWarehouseId) || row.toWarehouseName || row.toWarehouseId;
                  return (
                    <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-1">
                          <p className="font-bold">{row.referenceNo}</p>
                          <p className="text-[11px] text-slate-500">{transferRequestTypeLabel(requestType)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{fromName}</td>
                      <td className="px-4 py-3 text-sm">{toName}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-1">
                          {row.lines.length > 1 && (
                            <p className="font-bold">{row.lines.length} صنف</p>
                          )}
                          <p className={row.lines.length === 1 ? 'font-semibold text-[var(--color-text)]' : 'text-xs text-slate-500'}>
                            {formatTransferLinesSummary(row.lines)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge
                          variant={
                            row.status === 'approved'
                              ? 'success'
                              : row.status === 'rejected'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {STATUS_LABEL[row.status] || row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums">
                        <span className={transferAgeDays(row) >= transferSlaDays && row.status === 'pending' ? 'text-rose-600 font-bold' : ''}>
                          {transferAgeDays(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {(row.sourceReportId || row.sourceId) ? (
                          <Link
                            to={withTenantPath(tenantSlug, '/reports')}
                            className="text-primary font-bold hover:underline"
                          >
                            {row.sourceReportId || row.sourceId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{row.createdBy}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <TableIconAction
                            action="view"
                            onClick={() => openRequest(row)}
                            disabled={rowProcessing}
                            title="فتح"
                            aria-label={`فتح طلب ${row.referenceNo}`}
                          />
                          <TableIconAction
                            action="print"
                            onClick={() => void printRequest(row)}
                            disabled={rowProcessing}
                            aria-label={`طباعة طلب ${row.referenceNo}`}
                          />
                          {row.status === 'pending' && (
                            <>
                              <TableIconAction
                                action="approve"
                                onClick={() => void handleApprove(row.id)}
                                disabled={!canApprove || rowProcessing || rowIsSelfProductionEntry}
                                title={rowIsSelfProductionEntry ? 'لا يمكن اعتماد طلب تم إنشاؤه من نفس المستخدم.' : 'اعتماد'}
                                aria-label={`اعتماد طلب ${row.referenceNo}`}
                              />
                              <TableIconAction
                                action="reject"
                                onClick={() => void handleReject(row.id)}
                                disabled={!canApprove || rowProcessing}
                                aria-label={`رفض طلب ${row.referenceNo}`}
                              />
                            </>
                          )}
                          {row.status === 'approved' && (
                            <TableIconAction
                              action="undo"
                              onClick={() => void handleCancelMovement(row.id)}
                              disabled={!canApprove || rowProcessing}
                              title="إلغاء الحركة"
                              aria-label={`إلغاء حركة طلب ${row.referenceNo}`}
                            />
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
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              onPageChange={setCurrentPage}
              itemLabel="طلب"
            />
          </div>
        )}
      </Card>

      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

    </div>
  );
};
