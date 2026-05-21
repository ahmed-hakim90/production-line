import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';
import { Badge, Button, Card } from '../components/UI';
import { transferApprovalService } from '../services/transferApprovalService';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [requests, setRequests] = useState<InventoryTransferRequest[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('pending');
  const [slaOnly, setSlaOnly] = useState(false);
  const transferSlaDays = useAppStore((s) => Number(s.systemSettings.planSettings?.transferSlaWarningDays || 2));
  const [typeTab, setTypeTab] = useState<
    'all' | 'manual' | 'production_entry' | 'production_auto' | 'finished_final' | 'packaging'
  >('all');
  const [loading, setLoading] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [processingId, setProcessingId] = useState<string>('');
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'pending-transfer-approval',
  });

  const canApprove = can(transferApprovalPermission as any);
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

  const loadData = async (opts?: { silent?: boolean; warehouses?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const fetchWarehouses = opts?.warehouses ?? !silent;
    if (!silent) setLoading(true);
    try {
      if (fetchWarehouses) {
        const [rows, whs] = await Promise.all([
          transferApprovalService.getAll(),
          warehouseService.getWarehousesForReportingFilters(),
        ]);
        setRequests(rows);
        setWarehouses(whs);
      } else {
        const rows = await transferApprovalService.getAll();
        setRequests(rows);
      }
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
  const withResolvedUnitsPerCarton = <T extends { itemType: 'finished_good' | 'raw_material'; itemId: string; unitsPerCarton?: number }>(line: T): T => {
    if (line.itemType !== 'finished_good') return line;
    const resolved = Number(line.unitsPerCarton || unitsPerCartonByProductId.get(line.itemId) || 0);
    return { ...line, unitsPerCarton: resolved };
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
      const slaOk = !slaOnly || (row.status === 'pending' && transferAgeDays(row) >= transferSlaDays);
      return statusOk && matchesTypeTab(row) && slaOk;
    });
  }, [requests, statusFilter, typeTab, slaOnly, transferSlaDays]);

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
    if (!requestId || !canApprove) return;
    const request = requests.find((row) => row.id === requestId);
    if (isSelfProductionEntryRequest(request)) {
      toast.warning('لا يمكن لمنشئ التقرير اعتماد دخول تم الصنع الخاص به. يجب اعتمادها من مستخدم آخر مخوّل.');
      return;
    }
    setProcessingId(requestId);
    try {
      await transferApprovalService.approveRequest(
        requestId,
        userDisplayName || userEmail || 'Current User',
        {
          allowNegativeFromSource: allowNegativeFromSourceFor(request),
          approverUserId: uid || undefined,
        },
      );
      await loadData({ silent: true });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر اعتماد التحويلة.');
    } finally {
      setProcessingId('');
    }
  };

  const handleReject = async (requestId?: string) => {
    if (!requestId || !canApprove) return;
    const reason = window.prompt('سبب الرفض (اختياري):', '');
    if (reason === null) return;
    setProcessingId(requestId);
    try {
      await transferApprovalService.rejectRequest(
        requestId,
        userDisplayName || userEmail || 'Current User',
        reason || '',
        uid || undefined,
      );
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
    if (!canApprove || bulkApproving || loading) return;
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
          await transferApprovalService.approveRequest(id, actor, {
            allowNegativeFromSource: allowNegativeFromSourceFor(req),
            approverUserId: uid || undefined,
          });
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
          <p className="page-subtitle">التحويلات ودخول تم الصنع لا تؤثر على المخزون قبل الاعتماد.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-bold px-2">
            <input type="checkbox" checked={slaOnly} onChange={(e) => setSlaOnly(e.target.checked)} />
            تجاوز SLA ({transferSlaDays}+ يوم)
          </label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa] text-sm">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">قيد الاعتماد</SelectItem>
              <SelectItem value="approved">معتمدة</SelectItem>
              <SelectItem value="rejected">مرفوضة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
          {canApprove && bulkApproveEligible.length > 0 && (
            <Button
              variant="primary"
              onClick={() => void handleApproveAll()}
              disabled={loading || bulkApproving}
            >
              <span className="material-icons-round text-sm">done_all</span>
              اعتماد الكل ({bulkApproveEligible.length})
            </Button>
          )}
          <Button variant="outline" onClick={() => void loadData()} disabled={loading || bulkApproving}>
            <span className="material-icons-round text-sm">refresh</span>
            تحديث
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'الكل'],
          ['manual', 'يدوي'],
          ['production_entry', 'إدخال إنتاج'],
          ['production_auto', 'تحويل إنتاج'],
          ['finished_final', 'تام'],
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
              {filtered.map((row) => {
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
                      <p><span className="font-bold">المنشئ:</span> {row.createdBy}</p>
                      <p><span className="font-bold">الأصناف:</span> {row.lines.length}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => openRequest(row)} disabled={rowProcessing}>
                        <span className="material-icons-round text-sm">visibility</span>
                        فتح
                      </Button>
                      <Button variant="outline" onClick={() => void printRequest(row)} disabled={rowProcessing}>
                        <span className="material-icons-round text-sm">print</span>
                        طباعة
                      </Button>
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
                {filtered.map((row) => {
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
                          <p className="font-bold">{row.lines.length} صنف</p>
                          <p className="text-xs text-slate-500">
                            {row.lines.slice(0, 2).map((line) => {
                              const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                              return `${line.itemName} (${display.quantity} ${display.unitLabel})`;
                            }).join('، ')}
                            {row.lines.length > 2 ? ' ...' : ''}
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
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openRequest(row)}
                            disabled={rowProcessing}
                          >
                            <span className="material-icons-round text-sm">visibility</span>
                            فتح
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void printRequest(row)}
                            disabled={rowProcessing}
                          >
                            <span className="material-icons-round text-sm">print</span>
                            طباعة
                          </Button>
                          {row.status === 'pending' && (
                            <>
                              <Button
                                variant="primary"
                                onClick={() => void handleApprove(row.id)}
                                disabled={!canApprove || rowProcessing || rowIsSelfProductionEntry}
                                title={rowIsSelfProductionEntry ? 'لا يمكن اعتماد طلب تم إنشاؤه من نفس المستخدم.' : undefined}
                              >
                                <span className="material-icons-round text-sm">check_circle</span>
                                اعتماد
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => void handleReject(row.id)}
                                disabled={!canApprove || rowProcessing}
                              >
                                <span className="material-icons-round text-sm">cancel</span>
                                رفض
                              </Button>
                            </>
                          )}
                          {row.status === 'approved' && (
                            <Button
                              variant="outline"
                              className="!text-rose-600 !border-rose-200 hover:!bg-rose-50 dark:!border-rose-900/60 dark:!text-rose-300 dark:hover:!bg-rose-950/30"
                              onClick={() => void handleCancelMovement(row.id)}
                              disabled={!canApprove || rowProcessing}
                            >
                              <span className="material-icons-round text-sm">undo</span>
                              إلغاء الحركة
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
          </div>
        )}
      </Card>

      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

    </div>
  );
};

