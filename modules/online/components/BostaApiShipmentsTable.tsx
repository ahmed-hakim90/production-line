import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { onlineDispatchTsToMs } from '../services/onlineDispatchService';
import type { BostaApiMergedRow } from '../utils/bostaApiMerge';
import { OnlineDispatchStatusBadge } from './OnlineDispatchStatusBadge';
import {
  arabicLabelForBostaState,
  bostaCategoryBadgeClass,
  categorizeBostaStateLabel,
} from '../utils/bostaStatePresentation';

export type { BostaApiMergedRow } from '../utils/bostaApiMerge';

export type BostaApiShipmentsTableProps = {
  rows: BostaApiMergedRow[];
  emptyMessage: string;
  truncated?: boolean;
};

function formatShort(ts: unknown): string {
  const ms = onlineDispatchTsToMs(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BostaApiShipmentsTable: React.FC<BostaApiShipmentsTableProps> = ({
  rows,
  emptyMessage,
  truncated,
}) => {
  const { t } = useTranslation();
  const cellPad = 'py-2.5 px-3 align-top text-sm';

  const truncatedNote = useMemo(
    () => (truncated ? t('onlineDispatchDashboard.bostaTableTruncated') : null),
    [truncated, t],
  );

  return (
    <div className="space-y-2">
      {truncatedNote ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">{truncatedNote}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
                {t('onlineDispatchDashboard.bostaTableColTracking')}
              </th>
              <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
                {t('onlineDispatchDashboard.bostaTableColState')}
              </th>
              <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
                {t('onlineDispatchDashboard.bostaTableColCreated')}
              </th>
              <th className={`${cellPad} text-right text-xs font-semibold text-muted-foreground`}>
                {t('onlineDispatchDashboard.bostaTableColLocal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cat = categorizeBostaStateLabel(r.api.stateLabel);
              const ar = arabicLabelForBostaState(r.api.stateLabel);
              const badgeClass = bostaCategoryBadgeClass(cat);
              return (
                <tr key={r.api.trackingNumber} className="border-b border-border/60 hover:bg-muted/20">
                  <td className={`${cellPad} font-mono text-xs break-all`} dir="ltr">
                    {r.api.trackingNumber}
                  </td>
                  <td className={cellPad}>
                    <Badge variant="outline" className={`text-[11px] font-medium ${badgeClass}`}>
                      {ar}
                    </Badge>
                  </td>
                  <td className={`${cellPad} tabular-nums text-xs`}>
                    {new Date(r.api.createdAtMs).toLocaleString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className={cellPad}>
                    {r.local ? (
                      <div className="min-w-0 space-y-1 text-[11px] leading-tight">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <OnlineDispatchStatusBadge status={r.local.status} />
                          <span className="text-muted-foreground">
                            {r.local.barcode !== `BOSTA_${r.api.trackingNumber}` &&
                            r.local.barcode !== r.api.trackingNumber
                              ? `باركود: ${r.local.barcode}`
                              : null}
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          تسليم بوسطة:{' '}
                          {onlineDispatchTsToMs(r.local.handedToPostAt)
                            ? formatShort(r.local.handedToPostAt)
                            : '—'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('onlineDispatchDashboard.notRegisteredLocalHint')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
