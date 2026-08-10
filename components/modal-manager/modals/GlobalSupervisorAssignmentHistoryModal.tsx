import React, { useEffect } from 'react';
import { Button } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { useSupervisorStore } from '../../../modules/production/stores/useSupervisorStore';
import type { HistoryPeriod, SupervisorAssignmentAction } from '../../../modules/production/services/supervisorDistributionService';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { useTranslation } from 'react-i18next';

interface HistoryPayload {
  lineId: string;
  lineName: string;
  period: HistoryPeriod;
  referenceDate: string;
}

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
  const { t } = useTranslation();
  const { dir } = useAppDirection();
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
  const actionLabelMap: Record<SupervisorAssignmentAction, string> = {
    assign: t('modalManager.supervisorAssignmentHistory.actions.assign'),
    change: t('modalManager.supervisorAssignmentHistory.actions.change'),
    unassign: t('modalManager.supervisorAssignmentHistory.actions.unassign'),
  };

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
    <ManagedModalPortal>
    <div
      dir={dir}
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl border border-[var(--color-border)] bg-[var(--color-card)] sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-[var(--color-border)] p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute left-4 top-4"
            onClick={close}
            iconName="close"
            tone="neutral"
          >
            {t('ui.close')}
          </Button>
          <h3 className="pe-20 text-base font-medium text-[var(--color-text)]">{t('modalManager.supervisorAssignmentHistory.title', { lineName })}</h3>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4">
          {historyLoading ? (
            <p className="py-8 text-center text-sm font-normal text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.loading')}</p>
          ) : historyError ? (
            <p className="py-8 text-center text-sm font-normal text-[rgb(var(--color-danger))]">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm font-normal text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.empty')}</p>
          ) : (
            <table className="erp-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-right">
                  <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.table.date')}</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.table.supervisor')}</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.table.action')}</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">{t('modalManager.supervisorAssignmentHistory.table.by')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2 font-normal text-[var(--color-text)]">{formatDateTime(item.assignedAt)}</td>
                    <td className="px-3 py-2 font-normal text-[var(--color-text)]">{item.supervisorName || '—'}</td>
                    <td className="px-3 py-2 font-normal text-[var(--color-text)]">{actionLabelMap[item.action] || item.action}</td>
                    <td className="px-3 py-2 font-normal text-[var(--color-text)]">{item.assignedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
