import React, { useEffect } from 'react';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useSupervisorStore } from '../../../modules/production/stores/useSupervisorStore';
import type { HistoryPeriod, SupervisorAssignmentAction } from '../../../modules/production/services/supervisorDistributionService';

interface HistoryPayload {
  lineId: string;
  lineName: string;
  period: HistoryPeriod;
  referenceDate: string;
}

const actionLabelMap: Record<SupervisorAssignmentAction, string> = {
  assign: 'تعيين',
  change: 'تغيير',
  unassign: 'فك التعيين',
};

const formatDateTime = (value: unknown): string => {
  const dateValue = (() => {
    if (!value) return null;
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    const parsed = new Date(value as string);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  })();

  if (!dateValue) return '—';
  return dateValue.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const GlobalSupervisorAssignmentHistoryModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.PRODUCTION_SUPERVISOR_ASSIGNMENT_HISTORY);
  const history = useSupervisorStore((state) => state.history);
  const historyLoading = useSupervisorStore((state) => state.historyLoading);
  const historyError = useSupervisorStore((state) => state.historyError);
  const fetchHistory = useSupervisorStore((state) => state.fetchHistory);
  const clearHistory = useSupervisorStore((state) => state.clearHistory);

  const typedPayload = (payload || {}) as Partial<HistoryPayload>;
  const lineId = String(typedPayload.lineId || '');
  const lineName = String(typedPayload.lineName || '—');
  const period = (typedPayload.period || 'today') as HistoryPeriod;
  const referenceDate = String(typedPayload.referenceDate || '');

  useEffect(() => {
    if (!isOpen || !lineId || !referenceDate) return;
    void fetchHistory(lineId, lineName, period, referenceDate);
  }, [isOpen, lineId, lineName, period, referenceDate, fetchHistory]);

  useEffect(() => {
    if (isOpen) return;
    clearHistory();
  }, [isOpen, clearHistory]);

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-gray-200 bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-gray-200 p-4">
          <button
            type="button"
            className="absolute left-4 top-4 rounded-lg border border-gray-200 px-2 py-1 text-xs font-normal text-gray-600"
            onClick={close}
          >
            إغلاق
          </button>
          <h3 className="text-base font-medium text-gray-800">سجل التعيينات — {lineName}</h3>
        </div>

        <div className="max-h-[60vh] overflow-auto p-4">
          {historyLoading ? (
            <p className="py-8 text-center text-sm font-normal text-gray-500">جاري تحميل السجل...</p>
          ) : historyError ? (
            <p className="py-8 text-center text-sm font-normal text-red-700">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm font-normal text-gray-500">لا يوجد سجل تعيينات لهذا الخط</p>
          ) : (
            <table className="erp-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-right">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">التاريخ</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">المشرف</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">الإجراء</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-normal text-gray-700">{formatDateTime(item.assignedAt)}</td>
                    <td className="px-3 py-2 font-normal text-gray-700">{item.supervisorName || '—'}</td>
                    <td className="px-3 py-2 font-normal text-gray-700">{actionLabelMap[item.action] || item.action}</td>
                    <td className="px-3 py-2 font-normal text-gray-700">{item.assignedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
