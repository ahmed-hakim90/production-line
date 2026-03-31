import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SystemSettings } from '@/types';
import { getCustomWidgets, getWidgetOrder } from '@/utils/dashboardConfig';
import { usePermission } from '@/utils/permissions';
import { CustomDashboardWidgetItem, canRenderCustomWidget } from './CustomDashboardWidgets';

export type DashboardBuiltinRenderer = (widgetId: string) => React.ReactNode;

type OrderedDashboardWidgetsProps = {
  dashboardKey: string;
  systemSettings: SystemSettings | null;
  renderBuiltin: DashboardBuiltinRenderer;
};

export const OrderedDashboardWidgets: React.FC<OrderedDashboardWidgetsProps> = ({
  dashboardKey,
  systemSettings,
  renderBuiltin,
}) => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const order = useMemo(
    () => getWidgetOrder(systemSettings, dashboardKey).filter((w) => w.visible),
    [systemSettings, dashboardKey],
  );

  const customs = useMemo(() => {
    const list = getCustomWidgets(systemSettings, dashboardKey);
    return new Map(list.map((w) => [w.id, w]));
  }, [systemSettings, dashboardKey]);

  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < order.length) {
    const w = order[i];
    const custom = customs.get(w.id);
    if (custom) {
      if (canRenderCustomWidget(custom, can)) {
        nodes.push(<CustomDashboardWidgetItem key={w.id} widget={custom} navigate={navigate} />);
      }
      i += 1;
      continue;
    }

    if (
      dashboardKey === 'dashboard' &&
      w.id === 'production_lines' &&
      order[i + 1]?.id === 'smart_planning'
    ) {
      const pl = renderBuiltin('production_lines');
      const sp = renderBuiltin('smart_planning');
      if (pl != null || sp != null) {
        nodes.push(
          <div key={`pl-sp-${i}`} className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {pl != null ? (
              <div className="lg:col-span-2 space-y-5 sm:space-y-6">{pl}</div>
            ) : null}
            {sp != null ? <div className="lg:col-span-1">{sp}</div> : null}
          </div>,
        );
      }
      i += 2;
      continue;
    }

    if (dashboardKey === 'dashboard' && (w.id === 'production_lines' || w.id === 'smart_planning')) {
      const out = renderBuiltin(w.id);
      if (out != null) {
        const wrapClass =
          w.id === 'production_lines' ? 'space-y-5 sm:space-y-6 w-full' : 'w-full';
        nodes.push(
          <div key={w.id} className={wrapClass}>
            {out}
          </div>,
        );
      }
      i += 1;
      continue;
    }

    const built = renderBuiltin(w.id);
    if (built != null) {
      nodes.push(<React.Fragment key={w.id}>{built}</React.Fragment>);
    }
    i += 1;
  }

  return <>{nodes}</>;
};
