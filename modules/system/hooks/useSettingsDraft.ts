import { useCallback, useState } from 'react';
import {
  AVAILABLE_QUICK_ACTIONS,
  DASHBOARD_LABELS,
  DASHBOARD_WIDGETS,
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_ALERT_TOGGLES,
  DEFAULT_BRANDING,
  DEFAULT_DASHBOARD_DISPLAY,
  DEFAULT_KPI_THRESHOLDS,
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_PRINT_TEMPLATE,
  DEFAULT_THEME,
} from '../../../utils/dashboardConfig';
import type {
  AlertSettings,
  AlertToggleSettings,
  BrandingSettings,
  CustomWidgetConfig,
  CustomWidgetType,
  DashboardDisplaySettings,
  ExportImportSettings,
  KPIThreshold,
  PlanSettings,
  PrintTemplateSettings,
  QuickActionItem,
  SystemSettings,
  ThemeSettings,
  WidgetConfig,
} from '../../../types';

type WidgetFormState = {
  dashboardKey: string;
  type: CustomWidgetType;
  label: string;
  icon: string;
  permission: string;
  description: string;
  value: string;
  unit: string;
  target: string;
};

export const useSettingsDraft = (systemSettings: SystemSettings) => {
  const [localWidgets, setLocalWidgets] = useState<Record<string, WidgetConfig[]>>(
    () => JSON.parse(JSON.stringify(systemSettings.dashboardWidgets))
  );
  const [localCustomWidgets, setLocalCustomWidgets] = useState<CustomWidgetConfig[]>(
    () => JSON.parse(JSON.stringify(systemSettings.customDashboardWidgets ?? []))
  );
  const [selectedDashboardKey, setSelectedDashboardKey] = useState<string>(() => Object.keys(DASHBOARD_LABELS)[0] ?? 'dashboard');
  const [widgetForm, setWidgetForm] = useState<WidgetFormState>({
    dashboardKey: Object.keys(DASHBOARD_LABELS)[0] ?? 'dashboard',
    type: 'kpi',
    label: '',
    icon: 'widgets',
    permission: '',
    description: '',
    value: '',
    unit: '',
    target: '',
  });

  const [localAlerts, setLocalAlerts] = useState<AlertSettings>(
    () => ({ ...DEFAULT_ALERT_SETTINGS, ...systemSettings.alertSettings })
  );
  const [localKPIs, setLocalKPIs] = useState<Record<string, KPIThreshold>>(
    () => ({ ...DEFAULT_KPI_THRESHOLDS, ...systemSettings.kpiThresholds })
  );
  const [localPrint, setLocalPrint] = useState<PrintTemplateSettings>(
    () => ({ ...DEFAULT_PRINT_TEMPLATE, ...systemSettings.printTemplate })
  );
  const [localPlanSettings, setLocalPlanSettings] = useState<PlanSettings>(
    () => ({ ...DEFAULT_PLAN_SETTINGS, ...systemSettings.planSettings })
  );
  const [localBranding, setLocalBranding] = useState<BrandingSettings>(
    () => ({ ...DEFAULT_BRANDING, ...systemSettings.branding })
  );
  const [localTheme, setLocalTheme] = useState<ThemeSettings>(
    () => ({ ...DEFAULT_THEME, ...systemSettings.theme })
  );
  const [localDashboardDisplay, setLocalDashboardDisplay] = useState<DashboardDisplaySettings>(
    () => ({ ...DEFAULT_DASHBOARD_DISPLAY, ...systemSettings.dashboardDisplay })
  );
  const [localAlertToggles, setLocalAlertToggles] = useState<AlertToggleSettings>(
    () => ({ ...DEFAULT_ALERT_TOGGLES, ...systemSettings.alertToggles })
  );
  const [localQuickActions, setLocalQuickActions] = useState<QuickActionItem[]>(
    () => (systemSettings.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item, index) => ({ ...item, order: item.order ?? index }))
  );
  const [localExportImport, setLocalExportImport] = useState<ExportImportSettings>(
    () => ({ pages: { ...(systemSettings.exportImport?.pages ?? {}) } })
  );

  const normalizeQuickActions = useCallback(
    (items: QuickActionItem[]) => items.map((item, index) => ({ ...item, order: index })),
    []
  );

  const getQuickActionMatch = useCallback(
    (item: QuickActionItem) => AVAILABLE_QUICK_ACTIONS.find((def) =>
      def.actionType === item.actionType &&
      (def.actionType !== 'navigate' || def.target === item.target)
    )?.key ?? 'custom',
    []
  );

  const normalizeCustomWidgets = useCallback(
    (items: CustomWidgetConfig[]) => {
      const grouped = items.reduce<Record<string, CustomWidgetConfig[]>>((acc, widget) => {
        const key = widget.dashboardKey;
        if (!acc[key]) acc[key] = [];
        acc[key].push(widget);
        return acc;
      }, {});

      Object.keys(grouped).forEach((dashboardKey) => {
        grouped[dashboardKey] = grouped[dashboardKey]
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((widget, index) => ({ ...widget, order: index }));
      });

      return Object.values(grouped).flat();
    },
    [],
  );

  const selectedWidgetDefs = useCallback((dashboardKey: string) => {
    const base = DASHBOARD_WIDGETS[dashboardKey] || [];
    const custom = localCustomWidgets
      .filter((widget) => widget.dashboardKey === dashboardKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((widget) => ({
        id: widget.id,
        label: widget.label,
        icon: widget.icon,
      }));
    return [...base, ...custom];
  }, [localCustomWidgets]);

  return {
    localWidgets,
    setLocalWidgets,
    localCustomWidgets,
    setLocalCustomWidgets,
    selectedDashboardKey,
    setSelectedDashboardKey,
    widgetForm,
    setWidgetForm,
    localAlerts,
    setLocalAlerts,
    localKPIs,
    setLocalKPIs,
    localPrint,
    setLocalPrint,
    localPlanSettings,
    setLocalPlanSettings,
    localBranding,
    setLocalBranding,
    localTheme,
    setLocalTheme,
    localDashboardDisplay,
    setLocalDashboardDisplay,
    localAlertToggles,
    setLocalAlertToggles,
    localQuickActions,
    setLocalQuickActions,
    localExportImport,
    setLocalExportImport,
    normalizeQuickActions,
    getQuickActionMatch,
    normalizeCustomWidgets,
    selectedWidgetDefs,
  };
};
