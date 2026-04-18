import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type OnlineDashboardDateContextBarProps = {
  rangeFrom: string;
  rangeTo: string;
  onRangeFromChange: (v: string) => void;
  onRangeToChange: (v: string) => void;
  /** Jump links to section ids (smooth scroll). */
  sectionIds?: {
    bostaApi?: string;
    firestore?: string;
    reconciliation?: string;
  };
  /** Optional actions (e.g. Bosta Firestore sync) shown on the right on wide screens. */
  endActions?: React.ReactNode;
  className?: string;
};

function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const OnlineDashboardDateContextBar: React.FC<OnlineDashboardDateContextBarProps> = ({
  rangeFrom,
  rangeTo,
  onRangeFromChange,
  onRangeToChange,
  sectionIds,
  endActions,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        'sticky top-0 z-20 border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:px-5">
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="online-dash-from" className="text-[11px] text-muted-foreground">
              {t('onlineDispatchDashboard.contextBarFrom')}
            </Label>
            <Input
              id="online-dash-from"
              type="date"
              value={rangeFrom}
              onChange={(e) => onRangeFromChange(e.target.value)}
              className="h-9 w-[168px] sm:w-[180px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="online-dash-to" className="text-[11px] text-muted-foreground">
              {t('onlineDispatchDashboard.contextBarTo')}
            </Label>
            <Input
              id="online-dash-to"
              type="date"
              value={rangeTo}
              onChange={(e) => onRangeToChange(e.target.value)}
              className="h-9 w-[168px] sm:w-[180px]"
            />
          </div>
          <p className="hidden pb-2 text-[11px] text-muted-foreground sm:block max-w-[14rem] leading-snug">
            {t('onlineDispatchDashboard.contextBarHint')}
          </p>
        </div>
        {endActions ||
        (sectionIds && (sectionIds.bostaApi || sectionIds.firestore || sectionIds.reconciliation)) ? (
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:ms-auto sm:w-auto sm:justify-end">
            {endActions}
            {sectionIds?.bostaApi ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => scrollToSection(sectionIds.bostaApi!)}
              >
                {t('onlineDispatchDashboard.jumpBostaTable')}
              </Button>
            ) : null}
            {sectionIds?.reconciliation ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => scrollToSection(sectionIds.reconciliation!)}
              >
                {t('onlineDispatchDashboard.jumpReconciliation')}
              </Button>
            ) : null}
            {sectionIds?.firestore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => scrollToSection(sectionIds.firestore!)}
              >
                {t('onlineDispatchDashboard.jumpFirestore')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
};
