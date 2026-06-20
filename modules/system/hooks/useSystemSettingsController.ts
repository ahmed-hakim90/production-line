import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_ALERT_TOGGLES,
  DEFAULT_BRANDING,
  DEFAULT_DASHBOARD_DISPLAY,
  DEFAULT_KPI_THRESHOLDS,
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_PRINT_TEMPLATE,
  DEFAULT_THEME,
} from '../../../utils/dashboardConfig';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '../../../types';
import type {
  AlertSettings,
  AlertToggleSettings,
  BrandingSettings,
  CustomWidgetConfig,
  DashboardDisplaySettings,
  ExportImportSettings,
  KPIThreshold,
  PlanSettings,
  PrintTemplateSettings,
  ProductionWorkerSettings,
  QuickActionItem,
  SystemSettings,
  ThemeSettings,
  WidgetConfig,
} from '../../../types';

export type SettingsSectionKey =
  | 'general'
  | 'appearance'
  | 'production'
  | 'dashboards'
  | 'alerts'
  | 'reports'
  | 'data'
  | 'clientVersion'
  | 'backup';

type UseSystemSettingsControllerParams = {
  systemSettings: SystemSettings;
  updateSystemSettings: (settings: SystemSettings) => Promise<void>;
  localWidgets: Record<string, WidgetConfig[]>;
  localCustomWidgets: CustomWidgetConfig[];
  localAlerts: AlertSettings;
  localKPIs: Record<string, KPIThreshold>;
  localPrint: PrintTemplateSettings;
  localPlanSettings: PlanSettings;
  localBranding: BrandingSettings;
  localTheme: ThemeSettings;
  localDashboardDisplay: DashboardDisplaySettings;
  localAlertToggles: AlertToggleSettings;
  localQuickActions: QuickActionItem[];
  localExportImport: ExportImportSettings;
  localMinimumClientVersion: string;
  localForceClientUpdate: boolean;
  localClientUpdateMessageAr: string;
  localDefaultHomePath: string;
  localProductionWorkerSettings: ProductionWorkerSettings;
  normalizeQuickActions: (items: QuickActionItem[]) => QuickActionItem[];
  normalizeCustomWidgets: (items: CustomWidgetConfig[]) => CustomWidgetConfig[];
  resolveProductionWorkerSettings: (settings?: ProductionWorkerSettings) => ProductionWorkerSettings;
};

export const useSystemSettingsController = ({
  systemSettings,
  updateSystemSettings,
  localWidgets,
  localCustomWidgets,
  localAlerts,
  localKPIs,
  localPrint,
  localPlanSettings,
  localBranding,
  localTheme,
  localDashboardDisplay,
  localAlertToggles,
  localQuickActions,
  localExportImport,
  localMinimumClientVersion,
  localForceClientUpdate,
  localClientUpdateMessageAr,
  localDefaultHomePath,
  localProductionWorkerSettings,
  normalizeQuickActions,
  normalizeCustomWidgets,
  resolveProductionWorkerSettings,
}: UseSystemSettingsControllerParams) => {
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const serialize = useCallback((value: unknown) => JSON.stringify(value), []);

  const handleSave = useCallback(async (section: SettingsSectionKey) => {
    setSaving(true);
    setSaveMessage('');
    try {
      const updated: SystemSettings = {
        ...systemSettings,
        dashboardWidgets: section === 'dashboards' ? localWidgets : systemSettings.dashboardWidgets,
        customDashboardWidgets: section === 'dashboards'
          ? normalizeCustomWidgets(localCustomWidgets)
          : (systemSettings.customDashboardWidgets ?? []),
        alertSettings: section === 'alerts' ? localAlerts : systemSettings.alertSettings,
        kpiThresholds: section === 'alerts' ? localKPIs : systemSettings.kpiThresholds,
        printTemplate: section === 'reports' ? localPrint : systemSettings.printTemplate,
        planSettings: section === 'general' || section === 'production' ? localPlanSettings : (systemSettings.planSettings ?? DEFAULT_PLAN_SETTINGS),
        branding: section === 'appearance' ? localBranding : (systemSettings.branding ?? DEFAULT_BRANDING),
        theme: section === 'appearance' ? localTheme : (systemSettings.theme ?? DEFAULT_THEME),
        dashboardDisplay: section === 'dashboards' ? localDashboardDisplay : (systemSettings.dashboardDisplay ?? DEFAULT_DASHBOARD_DISPLAY),
        alertToggles: section === 'alerts' ? localAlertToggles : (systemSettings.alertToggles ?? DEFAULT_ALERT_TOGGLES),
        quickActions: section === 'dashboards' ? normalizeQuickActions(localQuickActions) : (systemSettings.quickActions ?? []),
        exportImport: section === 'data' ? localExportImport : (systemSettings.exportImport ?? { pages: {} }),
        minimumClientVersion:
          section === 'clientVersion' ? localMinimumClientVersion.trim() : systemSettings.minimumClientVersion,
        forceClientUpdate:
          section === 'clientVersion' ? localForceClientUpdate : systemSettings.forceClientUpdate,
        clientUpdateMessageAr:
          section === 'clientVersion' ? localClientUpdateMessageAr.trim() : systemSettings.clientUpdateMessageAr,
        defaultHomeLogicalPath:
          section === 'general' ? localDefaultHomePath.trim() : systemSettings.defaultHomeLogicalPath,
        productionWorkerSettings:
          section === 'production'
            ? localProductionWorkerSettings
            : (systemSettings.productionWorkerSettings ?? DEFAULT_PRODUCTION_WORKER_SETTINGS),
      };
      await updateSystemSettings(updated);
      setSaveMessage('تم الحفظ بنجاح');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setSaveMessage('فشل الحفظ');
    }
    setSaving(false);
  }, [
    systemSettings,
    localWidgets,
    localCustomWidgets,
    localAlerts,
    localKPIs,
    localPrint,
    localPlanSettings,
    localBranding,
    localTheme,
    localDashboardDisplay,
    localAlertToggles,
    normalizeQuickActions,
    normalizeCustomWidgets,
    localQuickActions,
    localExportImport,
    localMinimumClientVersion,
    localForceClientUpdate,
    localClientUpdateMessageAr,
    localDefaultHomePath,
    localProductionWorkerSettings,
    updateSystemSettings,
  ]);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const updated: SystemSettings = {
        ...systemSettings,
        dashboardWidgets: localWidgets,
        customDashboardWidgets: normalizeCustomWidgets(localCustomWidgets),
        alertSettings: localAlerts,
        kpiThresholds: localKPIs,
        printTemplate: localPrint,
        planSettings: localPlanSettings,
        branding: localBranding,
        theme: localTheme,
        dashboardDisplay: localDashboardDisplay,
        alertToggles: localAlertToggles,
        quickActions: normalizeQuickActions(localQuickActions),
        exportImport: localExportImport,
        minimumClientVersion: localMinimumClientVersion.trim(),
        forceClientUpdate: localForceClientUpdate,
        clientUpdateMessageAr: localClientUpdateMessageAr.trim(),
        defaultHomeLogicalPath: localDefaultHomePath.trim(),
        productionWorkerSettings: localProductionWorkerSettings,
      };
      await updateSystemSettings(updated);
      setSaveMessage('تم حفظ جميع الإعدادات بنجاح');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setSaveMessage('فشل حفظ جميع الإعدادات');
    } finally {
      setSaving(false);
    }
  }, [
    systemSettings,
    localWidgets,
    localCustomWidgets,
    localAlerts,
    localKPIs,
    localPrint,
    localPlanSettings,
    localBranding,
    localTheme,
    localDashboardDisplay,
    localAlertToggles,
    localQuickActions,
    localExportImport,
    localMinimumClientVersion,
    localForceClientUpdate,
    localClientUpdateMessageAr,
    localDefaultHomePath,
    localProductionWorkerSettings,
    normalizeCustomWidgets,
    normalizeQuickActions,
    updateSystemSettings,
  ]);

  const dirtyBySection = useMemo(() => {
    const savedQuickActionsSorted = (systemSettings.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return {
      general:
        serialize({ ...DEFAULT_PLAN_SETTINGS, ...systemSettings.planSettings }) !== serialize(localPlanSettings) ||
        (systemSettings.defaultHomeLogicalPath ?? '') !== localDefaultHomePath,
      appearance:
        serialize({ ...DEFAULT_BRANDING, ...systemSettings.branding }) !== serialize(localBranding) ||
        serialize({ ...DEFAULT_THEME, ...systemSettings.theme }) !== serialize(localTheme),
      production:
        serialize({ ...DEFAULT_PLAN_SETTINGS, ...systemSettings.planSettings }) !== serialize(localPlanSettings) ||
        serialize(resolveProductionWorkerSettings(systemSettings.productionWorkerSettings)) !== serialize(localProductionWorkerSettings),
      dashboards:
        serialize({ ...DEFAULT_DASHBOARD_DISPLAY, ...systemSettings.dashboardDisplay }) !== serialize(localDashboardDisplay) ||
        serialize(systemSettings.dashboardWidgets) !== serialize(localWidgets) ||
        serialize(normalizeCustomWidgets(systemSettings.customDashboardWidgets ?? [])) !== serialize(normalizeCustomWidgets(localCustomWidgets)) ||
        serialize(normalizeQuickActions(savedQuickActionsSorted)) !== serialize(normalizeQuickActions(localQuickActions)),
      alerts:
        serialize({ ...DEFAULT_ALERT_TOGGLES, ...systemSettings.alertToggles }) !== serialize(localAlertToggles) ||
        serialize(systemSettings.alertSettings) !== serialize(localAlerts) ||
        serialize(systemSettings.kpiThresholds ?? DEFAULT_KPI_THRESHOLDS) !== serialize(localKPIs),
      reports:
        serialize(systemSettings.printTemplate ?? DEFAULT_PRINT_TEMPLATE) !== serialize(localPrint),
      data:
        serialize(systemSettings.exportImport ?? { pages: {} }) !== serialize(localExportImport),
      clientVersion:
        (systemSettings.minimumClientVersion ?? '') !== localMinimumClientVersion ||
        (systemSettings.forceClientUpdate === true) !== localForceClientUpdate ||
        (systemSettings.clientUpdateMessageAr ?? '') !== localClientUpdateMessageAr,
      backup: false,
    } as const satisfies Record<SettingsSectionKey, boolean>;
  }, [
    serialize,
    systemSettings,
    localPlanSettings,
    localDefaultHomePath,
    localBranding,
    localTheme,
    localProductionWorkerSettings,
    localDashboardDisplay,
    localWidgets,
    localCustomWidgets,
    localQuickActions,
    localAlertToggles,
    localAlerts,
    localKPIs,
    localPrint,
    localExportImport,
    localMinimumClientVersion,
    localForceClientUpdate,
    localClientUpdateMessageAr,
    normalizeQuickActions,
    normalizeCustomWidgets,
    resolveProductionWorkerSettings,
  ]);

  const hasUnsavedChanges = useMemo(
    () => Object.values(dirtyBySection).some(Boolean),
    [dirtyBySection],
  );

  return {
    saving,
    saveMessage,
    setSaveMessage,
    dirtyBySection,
    hasUnsavedChanges,
    handleSave,
    handleSaveAll,
  };
};
