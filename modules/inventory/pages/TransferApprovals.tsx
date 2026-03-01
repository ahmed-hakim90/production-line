import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '../components/UI';
import { transferApprovalService } from '../services/transferApprovalService';
import { warehouseService } from '../services/warehouseService';
import type { InventoryTransferRequest, Warehouse } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';

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
  const transferApprovalPermission = useAppStore(
    (s) => s.systemSettings.planSettings?.transferApprovalPermission || 'inventory.transfers.approve',
  );
  const [requests, setRequests] = useState<InventoryTransferRequest[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string>('');

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

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((row) => row.status === statusFilter);
  }, [requests, statusFilter]);

  const handleApprove = async (requestId?: string) => {
    if (!requestId || !canApprove) return;
    setProcessingId(requestId);
    try {
      await transferApprovalService.approveRequest(
        requestId,
        userDisplayName || userEmail || 'Current User',
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
                            {row.lines.slice(0, 2).map((line) => `${line.itemName} (${line.quantity})`).join('، ')}
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
                            variant="primary"
                            onClick={() => void handleApprove(row.id)}
                            disabled={!canApprove || row.status !== 'pending' || rowProcessing}
                          >
                            <span className="material-icons-round text-sm">check_circle</span>
                            اعتماد
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void handleReject(row.id)}
                            disabled={!canApprove || row.status !== 'pending' || rowProcessing}
                          >
                            <span className="material-icons-round text-sm">cancel</span>
                            رفض
                          </Button>
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
    </div>
  );
};

