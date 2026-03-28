import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge } from './UI';
import { usePermission } from '@/utils/permissions';
import type { SystemSettings, CustomWidgetConfig } from '@/types';
import { getCustomWidgets, getWidgetOrder } from '@/utils/dashboardConfig';

interface CustomDashboardWidgetsProps {
  dashboardKey: string;
  systemSettings: SystemSettings | null;
}

function canRenderWidget(
  widget: CustomWidgetConfig,
  can: (permission: string) => boolean,
): boolean {
  if (!widget.permission) return true;
  return can(widget.permission);
}

export const CustomDashboardWidgets: React.FC<CustomDashboardWidgetsProps> = ({
  dashboardKey,
  systemSettings,
}) => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const orderedWidgets = useMemo(() => {
    const order = getWidgetOrder(systemSettings, dashboardKey);
    const custom = getCustomWidgets(systemSettings, dashboardKey);
    const customById = new Map(custom.map((widget) => [widget.id, widget]));

    return order
      .map((item) => ({
        visible: item.visible,
        widget: customById.get(item.id) ?? null,
      }))
      .filter((item): item is { visible: boolean; widget: CustomWidgetConfig } => Boolean(item.widget))
      .filter((item) => item.visible && canRenderWidget(item.widget, can));
  }, [systemSettings, dashboardKey, can]);

  if (orderedWidgets.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {orderedWidgets.map(({ widget }) => {
        if (widget.type === 'quick_link') {
          return (
            <Card key={widget.id}>
              <button
                type="button"
                onClick={() => widget.target && navigate(widget.target)}
                className="w-full text-right space-y-3"
                disabled={!widget.target}
              >
                <div className="flex items-center gap-2">
                  <span className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-icons-round">{widget.icon || 'link'}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)] truncate">{widget.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{widget.description || widget.target || 'رابط سريع'}</p>
                  </div>
                </div>
                {widget.target && <Badge variant="info">{widget.target}</Badge>}
              </button>
            </Card>
          );
        }

        if (widget.type === 'kpi') {
          return (
            <Card key={widget.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[var(--color-text)]">{widget.label}</p>
                  <p className="text-2xl font-bold text-primary">
                    {widget.value || '—'}
                    {widget.unit ? <span className="text-sm font-bold text-[var(--color-text-muted)] mr-1">{widget.unit}</span> : null}
                  </p>
                  {widget.description && (
                    <p className="text-xs text-slate-400">{widget.description}</p>
                  )}
                </div>
                <span className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-icons-round">{widget.icon || 'analytics'}</span>
                </span>
              </div>
            </Card>
          );
        }

        return (
          <Card key={widget.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-9 h-9 rounded-[var(--border-radius-base)] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-icons-round text-base">{widget.icon || 'text_fields'}</span>
              </span>
              <p className="text-sm font-bold text-[var(--color-text)]">{widget.label}</p>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {widget.description || 'Widget نصي مخصص'}
            </p>
          </Card>
        );
      })}
    </div>
  );
};

