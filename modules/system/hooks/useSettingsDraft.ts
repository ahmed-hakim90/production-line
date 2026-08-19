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
  DEFAULT_PRINT_TEMPLATE,
  DEFAULT_THEME,
  resolveUiFontFamily,
} from '../../../utils/dashboardConfig';
import { syncPlanSettingsWarehouseRouting } from '../../inventory/lib/syncPlanSettingsWarehouseRouting';
import { resolvePrintTemplate, resolveSystemSettings } from '../lib/resolveSystemSettings';
import type {
  AlertSettings,
  AlertToggleSettings,
  BrandingSettings,
  CustomWidgetConfig,
  CustomWidgetType,
  DashboardDisplaySettings,
  ExportImportSettings,
  KPIThreshold,
  OperationPathSettings,
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
  const normalizedSource = useMemo(() => {
    const resolved = resolveSystemSettings(systemSettings);
    return {
      dashboardWidgets: JSON.parse(JSON.stringify(resolved.dashboardWidgets)) as Record<string, WidgetConfig[]>,
      customDashboardWidgets: JSON.parse(JSON.stringify(resolved.customDashboardWidgets ?? [])) as CustomWidgetConfig[],
      alertSettings: { ...DEFAULT_ALERT_SETTINGS, ...resolved.alertSettings } as AlertSettings,
      kpiThresholds: { ...DEFAULT_KPI_THRESHOLDS, ...resolved.kpiThresholds } as Record<string, KPIThreshold>,
      printTemplate: resolvePrintTemplate(resolved.printTemplate),
      planSettings: syncPlanSettingsWarehouseRouting(resolved.planSettings) as PlanSettings,
      branding: { ...DEFAULT_BRANDING, ...resolved.branding } as BrandingSettings,
      theme: {
        ...DEFAULT_THEME,
        ...resolved.theme,
        baseFontFamily: resolveUiFontFamily(resolved.theme?.baseFontFamily),
      } as ThemeSettings,
      dashboardDisplay: { ...DEFAULT_DASHBOARD_DISPLAY, ...resolved.dashboardDisplay } as DashboardDisplaySettings,
      alertToggles: { ...DEFAULT_ALERT_TOGGLES, ...resolved.alertToggles } as AlertToggleSettings,
      quickActions: (resolved.quickActions ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item, index) => ({ ...item, order: item.order ?? index })),
      exportImport: { pages: { ...(resolved.exportImport?.pages ?? {}) } } as ExportImportSettings,
      operationPaths: resolved.operationPaths as OperationPathSettings,
      minimumClientVersion: resolved.minimumClientVersion ?? '',
      forceClientUpdate: resolved.forceClientUpdate === true,
      clientUpdateMessageAr: resolved.clientUpdateMessageAr ?? '',
      defaultHomeLogicalPath: resolved.defaultHomeLogicalPath ?? '',
    };
  }, [systemSettings]);
  const sourceSignature = useMemo(() => JSON.stringify(normalizedSource), [normalizedSource]);
  const planSettingsSignature = useMemo(
    () => JSON.stringify(normalizedSource.planSettings),
    [normalizedSource.planSettings],
  );
  const lastHydratedPlanSignatureRef = useRef<string>(planSettingsSignature);
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
  const [localOperationPaths, setLocalOperationPaths] = useState<OperationPathSettings>(
    () => normalizedSource.operationPaths,
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
    setLocalOperationPaths(normalizedSource.operationPaths);
    setLocalMinimumClientVersion(normalizedSource.minimumClientVersion);
    setLocalForceClientUpdate(normalizedSource.forceClientUpdate);
    setLocalClientUpdateMessageAr(normalizedSource.clientUpdateMessageAr);
    setLocalDefaultHomePath(normalizedSource.defaultHomeLogicalPath);
    lastHydratedPlanSignatureRef.current = planSettingsSignature;
    didInitialHydrationRef.current = true;
  }, [normalizedSource, sourceSignature, planSettingsSignature]);

  // Keep planSettings draft aligned after save / migration fetch when local is still
  // on the previously hydrated store snapshot (not mid-edit vs that snapshot).
  useEffect(() => {
    if (!didInitialHydrationRef.current) return;
    if (planSettingsSignature === lastHydratedPlanSignatureRef.current) return;
    setLocalPlanSettings((prev) => {
      const prevSynced = syncPlanSettingsWarehouseRouting(prev);
      const prevSig = JSON.stringify(prevSynced);
      if (prevSig !== lastHydratedPlanSignatureRef.current) {
        // User has local edits — do not clobber.
        lastHydratedPlanSignatureRef.current = planSettingsSignature;
        return prev;
      }
      lastHydratedPlanSignatureRef.current = planSettingsSignature;
      return normalizedSource.planSettings;
    });
  }, [planSettingsSignature, normalizedSource.planSettings]);

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
    localOperationPaths,
    setLocalOperationPaths,
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
