import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card } from '../components/UI';
import { transferApprovalService } from '../services/transferApprovalService';
import { warehouseService } from '../services/warehouseService';
import type { InventoryTransferRequest, Warehouse } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '../../../utils/printManager';
import { StockTransferPrint, type StockTransferPrintData } from '../components/StockTransferPrint';
import { getTransferDisplay, type TransferDisplayUnitMode } from '../utils/transferUnits';

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
};

export const TransferApprovals: React.FC = () => {
  const { can } = usePermission();
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
  const allowNegativeFinishedTransferStock = useAppStore(
    (s) => Boolean(s.systemSettings.planSettings?.allowNegativeFinishedTransferStock),
  );
  const [requests, setRequests] = useState<InventoryTransferRequest[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('pending');
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<InventoryTransferRequest | null>(null);
  const [printData, setPrintData] = useState<StockTransferPrintData | null>(null);
  const transferPrintRef = useRef<HTMLDivElement>(null);
  const handleTransferPrint = useManagedPrint({
    contentRef: transferPrintRef,
    printSettings: printTemplate,
    documentTitle: 'pending-transfer-approval',
  });

  const canApprove = can(transferApprovalPermission as any);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rows, whs] = await Promise.all([
        transferApprovalService.getAll(),
        warehouseService.getAll(),
      ]);
      setRequests(rows);
      setWarehouses(whs);
    } finally {
      setLoading(false);
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

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((row) => row.status === statusFilter);
  }, [requests, statusFilter]);

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

  const openRequest = (row: InventoryTransferRequest) => {
    setSelectedRequest(row);
  };

  const printRequest = async (row: InventoryTransferRequest) => {
    setPrintData(buildPrintData(row));
    await new Promise((r) => setTimeout(r, 250));
    handleTransferPrint();
    setTimeout(() => setPrintData(null), 1000);
  };

  const handleApprove = async (requestId?: string) => {
    if (!requestId || !canApprove) return;
    const request = requests.find((row) => row.id === requestId);
    const allowNegativeFromSource =
      Boolean(allowNegativeFinishedTransferStock) &&
      Boolean(finishedReceiveWarehouseId) &&
      request?.fromWarehouseId === finishedReceiveWarehouseId;
    setProcessingId(requestId);
    try {
      await transferApprovalService.approveRequest(
        requestId,
        userDisplayName || userEmail || 'Current User',
        { allowNegativeFromSource },
      );
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر اعتماد التحويلة.');
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
      );
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر رفض التحويلة.');
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
      );
      await loadData();
    } catch (error: any) {
      window.alert(error?.message || 'تعذر إلغاء الحركة.');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">اعتماد تحويلات المخازن</h2>
          <p className="text-sm text-slate-500 font-medium">التحويلات لا تؤثر على المخزون قبل الاعتماد.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">كل الحالات</option>
            <option value="pending">قيد الاعتماد</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
            <option value="cancelled">ملغاة</option>
          </select>
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <span className="material-icons-round text-sm">refresh</span>
            تحديث
          </Button>
        </div>
      </div>

      {!canApprove && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          لا تملك صلاحية الاعتماد الحالية: <span dir="ltr">{transferApprovalPermission}</span>
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">جاري تحميل طلبات التحويل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">لا توجد طلبات تحويل في هذا الفلتر.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-black text-slate-500">رقم المرجع</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500">من</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500">إلى</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500">الأصناف</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500">الحالة</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500">المنشئ</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((row) => {
                  const rowProcessing = processingId === row.id;
                  const fromName = warehouseMap.get(row.fromWarehouseId) || row.fromWarehouseName || row.fromWarehouseId;
                  const toName = warehouseMap.get(row.toWarehouseId) || row.toWarehouseName || row.toWarehouseId;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-sm font-bold">{row.referenceNo}</td>
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
                                disabled={!canApprove || rowProcessing}
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
        )}
      </Card>

      <div className="hidden">
        <StockTransferPrint ref={transferPrintRef} data={printData} printSettings={printTemplate} />
      </div>

      {selectedRequest && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تفاصيل طلب التحويل</h3>
                <p className="text-xs text-slate-500 mt-1">مرجع: {selectedRequest.referenceNo}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-500">من المخزن</p>
                  <p className="text-sm font-black">
                    {warehouseMap.get(selectedRequest.fromWarehouseId) || selectedRequest.fromWarehouseName || selectedRequest.fromWarehouseId}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-500">إلى المخزن</p>
                  <p className="text-sm font-black">
                    {warehouseMap.get(selectedRequest.toWarehouseId) || selectedRequest.toWarehouseName || selectedRequest.toWarehouseId}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-3 py-2 text-xs font-black text-slate-500">الصنف</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">النوع</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500 text-center">الكمية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedRequest.lines.map((line) => (
                      <tr key={`${line.itemId}-${line.itemType}`}>
                        <td className="px-3 py-2 text-sm font-bold">{line.itemName} <span className="text-xs text-slate-400">({line.itemCode})</span></td>
                        <td className="px-3 py-2 text-sm">{line.itemType === 'finished_good' ? 'منتج نهائي' : 'مادة خام'}</td>
                        <td className="px-3 py-2 text-sm text-center font-black">
                          {(() => {
                            const display = getTransferDisplay(withResolvedUnitsPerCarton(line), transferDisplayUnit);
                            return `${display.quantity} ${display.unitLabel}`;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                إغلاق
              </Button>
              <Button variant="primary" onClick={() => void printRequest(selectedRequest)}>
                <span className="material-icons-round text-sm">print</span>
                طباعة الطلب
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

