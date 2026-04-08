import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const normalizedSource = useMemo(() => ({
    dashboardWidgets: JSON.parse(JSON.stringify(systemSettings.dashboardWidgets)) as Record<string, WidgetConfig[]>,
    customDashboardWidgets: JSON.parse(JSON.stringify(systemSettings.customDashboardWidgets ?? [])) as CustomWidgetConfig[],
    alertSettings: { ...DEFAULT_ALERT_SETTINGS, ...systemSettings.alertSettings } as AlertSettings,
    kpiThresholds: { ...DEFAULT_KPI_THRESHOLDS, ...systemSettings.kpiThresholds } as Record<string, KPIThreshold>,
    printTemplate: { ...DEFAULT_PRINT_TEMPLATE, ...systemSettings.printTemplate } as PrintTemplateSettings,
    planSettings: { ...DEFAULT_PLAN_SETTINGS, ...systemSettings.planSettings } as PlanSettings,
    branding: { ...DEFAULT_BRANDING, ...systemSettings.branding } as BrandingSettings,
    theme: { ...DEFAULT_THEME, ...systemSettings.theme } as ThemeSettings,
    dashboardDisplay: { ...DEFAULT_DASHBOARD_DISPLAY, ...systemSettings.dashboardDisplay } as DashboardDisplaySettings,
    alertToggles: { ...DEFAULT_ALERT_TOGGLES, ...systemSettings.alertToggles } as AlertToggleSettings,
    quickActions: (systemSettings.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item, index) => ({ ...item, order: item.order ?? index })),
    exportImport: { pages: { ...(systemSettings.exportImport?.pages ?? {}) } } as ExportImportSettings,
    minimumClientVersion: systemSettings.minimumClientVersion ?? '',
    forceClientUpdate: systemSettings.forceClientUpdate === true,
    clientUpdateMessageAr: systemSettings.clientUpdateMessageAr ?? '',
    defaultHomeLogicalPath: systemSettings.defaultHomeLogicalPath ?? '',
  }), [systemSettings]);
  const sourceSignature = useMemo(() => JSON.stringify(normalizedSource), [normalizedSource]);
  const initialSourceSignatureRef = useRef<string>(sourceSignature);
  const didInitialHydrationRef = useRef<boolean>(false);

  const [localWidgets, setLocalWidgets] = useState<Record<string, WidgetConfig[]>>(
    () => normalizedSource.dashboardWidgets
  );
  const [localCustomWidgets, setLocalCustomWidgets] = useState<CustomWidgetConfig[]>(
    () => normalizedSource.customDashboardWidgets
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
    () => normalizedSource.alertSettings
  );
  const [localKPIs, setLocalKPIs] = useState<Record<string, KPIThreshold>>(
    () => normalizedSource.kpiThresholds
  );
  const [localPrint, setLocalPrint] = useState<PrintTemplateSettings>(
    () => normalizedSource.printTemplate
  );
  const [localPlanSettings, setLocalPlanSettings] = useState<PlanSettings>(
    () => normalizedSource.planSettings
  );
  const [localBranding, setLocalBranding] = useState<BrandingSettings>(
    () => normalizedSource.branding
  );
  const [localTheme, setLocalTheme] = useState<ThemeSettings>(
    () => normalizedSource.theme
  );
  const [localDashboardDisplay, setLocalDashboardDisplay] = useState<DashboardDisplaySettings>(
    () => normalizedSource.dashboardDisplay
  );
  const [localAlertToggles, setLocalAlertToggles] = useState<AlertToggleSettings>(
    () => normalizedSource.alertToggles
  );
  const [localQuickActions, setLocalQuickActions] = useState<QuickActionItem[]>(
    () => normalizedSource.quickActions
  );
  const [localExportImport, setLocalExportImport] = useState<ExportImportSettings>(
    () => normalizedSource.exportImport
  );
  const [localMinimumClientVersion, setLocalMinimumClientVersion] = useState(
    () => normalizedSource.minimumClientVersion,
  );
  const [localForceClientUpdate, setLocalForceClientUpdate] = useState(
    () => normalizedSource.forceClientUpdate,
  );
  const [localClientUpdateMessageAr, setLocalClientUpdateMessageAr] = useState(
    () => normalizedSource.clientUpdateMessageAr,
  );
  const [localDefaultHomePath, setLocalDefaultHomePath] = useState(
    () => normalizedSource.defaultHomeLogicalPath,
  );

  useEffect(() => {
    if (sourceSignature === initialSourceSignatureRef.current || didInitialHydrationRef.current) return;

    setLocalWidgets(normalizedSource.dashboardWidgets);
    setLocalCustomWidgets(normalizedSource.customDashboardWidgets);
    setLocalAlerts(normalizedSource.alertSettings);
    setLocalKPIs(normalizedSource.kpiThresholds);
    setLocalPrint(normalizedSource.printTemplate);
    setLocalPlanSettings(normalizedSource.planSettings);
    setLocalBranding(normalizedSource.branding);
    setLocalTheme(normalizedSource.theme);
    setLocalDashboardDisplay(normalizedSource.dashboardDisplay);
    setLocalAlertToggles(normalizedSource.alertToggles);
    setLocalQuickActions(normalizedSource.quickActions);
    setLocalExportImport(normalizedSource.exportImport);
    setLocalMinimumClientVersion(normalizedSource.minimumClientVersion);
    setLocalForceClientUpdate(normalizedSource.forceClientUpdate);
    setLocalClientUpdateMessageAr(normalizedSource.clientUpdateMessageAr);
    setLocalDefaultHomePath(normalizedSource.defaultHomeLogicalPath);
    didInitialHydrationRef.current = true;
  }, [normalizedSource, sourceSignature]);

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
    localMinimumClientVersion,
    setLocalMinimumClientVersion,
    localForceClientUpdate,
    setLocalForceClientUpdate,
    localClientUpdateMessageAr,
    setLocalClientUpdateMessageAr,
    localDefaultHomePath,
    setLocalDefaultHomePath,
    normalizeQuickActions,
    getQuickActionMatch,
    normalizeCustomWidgets,
    selectedWidgetDefs,
  };
};
