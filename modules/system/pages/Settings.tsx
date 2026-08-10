
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isConfigured } from '../../../services/firebase';
import { useAppStore } from '../../../store/useAppStore';
import {
  usePermission,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import {
  DASHBOARD_LABELS,
  AVAILABLE_QUICK_ACTIONS,
  DEFAULT_PRINT_TEMPLATE,
  DEFAULT_THEME,
  DEFAULT_EXPORT_IMPORT_PAGE_CONTROL,
} from '../../../utils/dashboardConfig';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import {
  applyAppTheme,
  mergeTenantThemeForApply,
  readCachedTenantTheme,
  resolveTheme,
} from '../../../core/ui-engine/theme/tenantTheme';
import { THEME_PRESETS } from '../../../core/ui-engine/theme/themePresets';
import { employeeService } from '../../hr/employeeService';
import { warehouseService } from '../../inventory/services/warehouseService';
import { userService } from '../../../services/userService';
import type {
  AlertSettings, ThemeSettings,
  QuickActionItem, QuickActionColor, CustomWidgetConfig, FirestoreEmployee, FirestoreUser,
} from '../../../types';
import type { Warehouse } from '../../inventory/types';
import { PRINT_PREVIEW_SAMPLE_ROWS } from '../lib/printPreviewSamples';
import { GeneralSettingsHeader } from '../components/settings/GeneralSettingsHeader';
import { GeneralBrandingSection } from '../components/settings/GeneralBrandingSection';
import { GeneralThemeSection } from '../components/settings/GeneralThemeSection';
import { ProductionWorkerSettingsSection } from '@/modules/production/components/ProductionWorkerSettingsSection';
import { GeneralSystemBehaviorSection } from '../components/settings/GeneralSystemBehaviorSection';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, type ProductionWorkerSettings } from '@/types';
import { InventoryRoutingSettingsSection } from '../components/settings/InventoryRoutingSettingsSection';
import { DepartmentConsumablesSettingsSection } from '../components/settings/DepartmentConsumablesSettingsSection';
import { RepairSpareIssuesSettingsSection } from '../components/settings/RepairSpareIssuesSettingsSection';
import { WarehouseLocationSettingsSection } from '../components/settings/WarehouseLocationSettingsSection';
import { ProductionRequestRoutingSettingsSection } from '../components/settings/ProductionRequestRoutingSettingsSection';
import { ProductionReportBehaviorSettingsSection } from '../components/settings/ProductionReportBehaviorSettingsSection';
import { OperationPathSettingsSection } from '../components/settings/OperationPathSettingsSection';
import { GeneralDashboardDisplaySection } from '../components/settings/GeneralDashboardDisplaySection';
import { GeneralAlertsSection } from '../components/settings/GeneralAlertsSection';
import { KPIThresholdsSection } from '../components/settings/KPIThresholdsSection';
import { PrintTemplateSettingsSection } from '../components/settings/PrintTemplateSettingsSection';
import { ExportImportSettingsSection } from '../components/settings/ExportImportSettingsSection';
import { BackupRestoreSection } from '../components/settings/BackupRestoreSection';
import { ClientVersionSettingsSection } from '../components/settings/ClientVersionSettingsSection';
import { AlertRulesSection } from '../components/settings/AlertRulesSection';
import { QuickActionsSection } from '../components/settings/QuickActionsSection';
import { DashboardWidgetsSection } from '../components/settings/DashboardWidgetsSection';
import { useSettingsDraft } from '../hooks/useSettingsDraft';
import { useSystemSettingsController, type SettingsSectionKey } from '../hooks/useSystemSettingsController';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { getSettingsSection } from '../settings/settingsSections';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { CompanyTenantSection } from '../components/settings/CompanyTenantSection';
import { UiDensitySection } from '../components/settings/UiDensitySection';
import { DefaultHomePathSection } from '../components/settings/DefaultHomePathSection';

const CURRENCIES = [
  { value: 'SAR', label: 'ريال سعودي (SAR)' },
  { value: 'EGP', label: 'جنيه مصري (EGP)' },
  { value: 'AED', label: 'درهم إماراتي (AED)' },
  { value: 'USD', label: 'دولار أمريكي (USD)' },
  { value: 'EUR', label: 'يورو (EUR)' },
  { value: 'KWD', label: 'دينار كويتي (KWD)' },
  { value: 'QAR', label: 'ريال قطري (QAR)' },
  { value: 'BHD', label: 'دينار بحريني (BHD)' },
  { value: 'OMR', label: 'ريال عماني (OMR)' },
  { value: 'JOD', label: 'دينار أردني (JOD)' },
];

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Asia/Kuwait', label: 'الكويت (GMT+3)' },
  { value: 'Asia/Qatar', label: 'الدوحة (GMT+3)' },
  { value: 'Asia/Bahrain', label: 'البحرين (GMT+3)' },
  { value: 'Asia/Muscat', label: 'مسقط (GMT+4)' },
  { value: 'Asia/Amman', label: 'عمّان (GMT+3)' },
  { value: 'Europe/London', label: 'لندن (GMT+0)' },
  { value: 'America/New_York', label: 'نيويورك (GMT-5)' },
];

const QUICK_ACTION_ICONS = Array.from(new Set([
  ...AVAILABLE_QUICK_ACTIONS.map((item) => item.icon),
  'bolt',
  'analytics',
  'dashboard',
  'add_task',
  'fact_check',
  'inventory_2',
  'precision_manufacturing',
  'groups',
]));

const QUICK_ACTION_COLORS: { value: QuickActionColor; label: string; classes: string }[] = [
  { value: 'primary', label: 'أزرق رئيسي', classes: 'bg-primary/10 text-primary border-primary/20' },
  { value: 'emerald', label: 'أخضر', classes: 'bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] text-[rgb(var(--color-success))] border-[rgb(var(--color-success)/0.25)]' },
  { value: 'amber', label: 'أصفر', classes: 'bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] text-[rgb(var(--color-warning))] border-[rgb(var(--color-warning)/0.25)]' },
  { value: 'rose', label: 'وردي', classes: 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] text-[rgb(var(--color-danger))] border-[rgb(var(--color-danger)/0.25)]' },
  { value: 'violet', label: 'بنفسجي', classes: 'bg-[rgb(var(--color-secondary)/0.1)] dark:bg-[rgb(var(--color-secondary)/0.15)] text-[rgb(var(--color-secondary))] border-[rgb(var(--color-secondary)/0.25)] dark:border-[rgb(var(--color-secondary)/0.25)]' },
  { value: 'slate', label: 'رمادي', classes: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border-[var(--color-border)]' },
];

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Tajawal', label: 'Tajawal' },
  { value: 'Rubik', label: 'Rubik' },
  { value: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic' },
  { value: 'Noto Sans Arabic', label: 'Noto Sans Arabic' },
];

const resolveProductionWorkerSettings = (
  settings?: ProductionWorkerSettings,
): ProductionWorkerSettings => ({
  performance: {
    ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
    ...(settings?.performance ?? {}),
  },
  bonus: {
    ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
    ...(settings?.bonus ?? {}),
  },
  supervisorBonus: {
    ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
    ...(settings?.supervisorBonus ?? {}),
    tiers: settings?.supervisorBonus?.tiers?.length
      ? settings.supervisorBonus.tiers
      : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
  },
});

const ALERT_FIELDS: { key: keyof AlertSettings; label: string; icon: string; unit: string; description: string }[] = [
  { key: 'wasteThreshold', label: 'حد الهدر', icon: 'delete_sweep', unit: '%', description: 'نسبة الهدر المقبولة — تنبيه عند تجاوزها' },
  { key: 'costVarianceThreshold', label: 'حد انحراف التكلفة', icon: 'compare_arrows', unit: '%', description: 'نسبة الانحراف المقبولة عن التكلفة المعيارية' },
  { key: 'efficiencyThreshold', label: 'حد الكفاءة', icon: 'speed', unit: '%', description: 'الحد الأدنى المقبول للكفاءة — تنبيه عند الانخفاض' },
  { key: 'planDelayDays', label: 'أيام تأخر الخطة', icon: 'schedule', unit: 'يوم', description: 'عدد الأيام المسموح بتأخرها قبل التنبيه' },
  { key: 'overProductionThreshold', label: 'حد الإنتاج الزائد', icon: 'trending_up', unit: '%', description: 'نسبة تجاوز الهدف المسموحة — تنبيه عند التجاوز' },
];

const SettingsGroupTitle: React.FC<{ title: string; description: string; icon: string }> = ({
  title,
  description,
  icon,
}) => (
  <div className="flex items-start gap-3 pt-2">
    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <span className="material-icons-round text-xl">{icon}</span>
    </div>
    <div className="min-w-0">
      <h3 className="text-base font-bold text-[var(--color-text)]">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)] leading-6">{description}</p>
    </div>
  </div>
);

type SettingsProps = {
  section?: SettingsSectionKey;
};

export const Settings: React.FC<SettingsProps> = ({ section = 'general' }) => {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);

  const { can } = usePermission();
  const isAdmin = can('roles.manage');

  const activeSection = section;
  const sectionMeta = getSettingsSection(activeSection);
  const [localProductionWorkerSettings, setLocalProductionWorkerSettings] = useState<ProductionWorkerSettings>(
    () => resolveProductionWorkerSettings(systemSettings.productionWorkerSettings),
  );
  useEffect(() => {
    setLocalProductionWorkerSettings(resolveProductionWorkerSettings(systemSettings.productionWorkerSettings));
  }, [systemSettings.productionWorkerSettings]);

  // ── Local editable draft state ─────────────────────────────────────────────
  const {
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
  } = useSettingsDraft(systemSettings);
  const {
    saving,
    saveMessage,
    setSaveMessage,
    dirtyBySection,
    hasUnsavedChanges,
    handleSave,
  } = useSystemSettingsController({
    systemSettings,
    updateSystemSettings,
    localWidgets,
    localCustomWidgets,
    localAlerts,
    localKPIs,
    localPrint,
    localPlanSettings,
    setLocalPlanSettings,
    localBranding,
    localTheme,
    localDashboardDisplay,
    localAlertToggles,
    localQuickActions,
    localExportImport,
    localOperationPaths,
    localMinimumClientVersion,
    localForceClientUpdate,
    localClientUpdateMessageAr,
    localDefaultHomePath,
    localProductionWorkerSettings,
    normalizeQuickActions,
    normalizeCustomWidgets,
    resolveProductionWorkerSettings,
  });
  const activeSectionHasUnsavedChanges = dirtyBySection[activeSection] === true;
  const [inventoryWarehouses, setInventoryWarehouses] = useState<Warehouse[]>([]);
  const [productionApproverEmployees, setProductionApproverEmployees] = useState<FirestoreEmployee[]>([]);
  const [systemUsers, setSystemUsers] = useState<FirestoreUser[]>([]);
  const [editingQuickActionId, setEditingQuickActionId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const brandingLogoRef = useRef<HTMLInputElement>(null);

  // Instant theme preview (merges with cached tenant logo / styles).
  useEffect(() => {
    if (activeSection === 'appearance') {
      const base = readCachedTenantTheme() ?? resolveTheme();
      applyAppTheme(mergeTenantThemeForApply(base, localTheme), localTheme);
    }
  }, [localTheme, activeSection]);

  // Revert preview when leaving the appearance page (back to last saved theme from store).
  useEffect(() => {
    if (activeSection === 'appearance') return;
    const saved = systemSettings.theme ?? DEFAULT_THEME;
    const base = readCachedTenantTheme() ?? resolveTheme();
    applyAppTheme(mergeTenantThemeForApply(base, saved), saved);
  }, [activeSection, systemSettings.theme]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const whs = await warehouseService.getActiveWarehouses();
        setInventoryWarehouses(whs);
      } catch {
        setInventoryWarehouses([]);
      }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const [users, employees] = await Promise.all([
          userService.getAll(),
          employeeService.getAll(),
        ]);
        setSystemUsers(users.filter((user) => user.isActive !== false));
        setProductionApproverEmployees(employees.filter((employee) => employee.isActive !== false));
      } catch {
        setSystemUsers([]);
        setProductionApproverEmployees([]);
      }
    })();
  }, [isAdmin]);

  // Revert to persisted theme when leaving the settings page (uses latest store snapshot).
  useEffect(() => {
    return () => {
      const saved = useAppStore.getState().systemSettings.theme ?? DEFAULT_THEME;
      const base = readCachedTenantTheme() ?? resolveTheme();
      applyAppTheme(mergeTenantThemeForApply(base, saved), saved);
    };
  }, []);

  const {
    backupLoading,
    backupProgress,
    backupMessage,
    setBackupMessage,
    backupHistory,
    historyLoading,
    selectedMonth,
    setSelectedMonth,
    importFile,
    importFileName,
    importValidation,
    restoreMode,
    setRestoreMode,
    showConfirmRestore,
    setShowConfirmRestore,
    importInputRef,
    handleExportFull,
    handleExportMonthly,
    handleExportSettings,
    handleFileSelect,
    clearImportSelection,
    handleRestore,
    restoreModes,
    skipAutoBackupBeforeRestore,
    setSkipAutoBackupBeforeRestore,
    useServerImport,
    setUseServerImport,
    isSuperAdmin,
  } = useBackupRestore({ activeTab: activeSection, isAdmin });

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isConfigured) return;
    setUploadingLogo(true);
    try {
      const fileRef = storageRef(storage, `print_settings/logo_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setLocalPrint((prev) => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error('Logo upload error:', err);
      setSaveMessage('فشل رفع الشعار');
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  }, []);

  const handleBrandingLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isConfigured) return;
    setUploadingLogo(true);
    try {
      const fileRef = storageRef(storage, `branding/logo_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setLocalBranding((prev) => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error('Logo upload error:', err);
      setSaveMessage('فشل رفع الشعار');
    }
    setUploadingLogo(false);
    if (brandingLogoRef.current) brandingLogoRef.current.value = '';
  }, []);

  // ── Widget drag & drop ─────────────────────────────────────────────────────

  const dragItem = useRef<{ dashboardKey: string; index: number } | null>(null);
  const dragOverItem = useRef<{ dashboardKey: string; index: number } | null>(null);

  const handleDragStart = (dashboardKey: string, index: number) => {
    dragItem.current = { dashboardKey, index };
  };

  const handleDragEnter = (dashboardKey: string, index: number) => {
    dragOverItem.current = { dashboardKey, index };
  };

  const handleDragEnd = (dashboardKey: string) => {
    if (
      !dragItem.current ||
      !dragOverItem.current ||
      dragItem.current.dashboardKey !== dashboardKey ||
      dragOverItem.current.dashboardKey !== dashboardKey
    ) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const fromIdx = dragItem.current.index;
    const toIdx = dragOverItem.current.index;
    if (fromIdx === toIdx) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    setLocalWidgets((prev) => {
      const seed = prev[dashboardKey] || selectedWidgetDefs(dashboardKey).map((def) => ({ id: def.id, visible: true }));
      const list = [...seed];
      const [removed] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, removed);

      setLocalCustomWidgets((widgets) => {
        const customIds = new Set(
          list
            .map((item) => item.id)
            .filter((itemId) => widgets.some((widget) => widget.id === itemId && widget.dashboardKey === dashboardKey)),
        );
        const customOrder = list
          .map((item) => item.id)
          .filter((itemId) => customIds.has(itemId));

        return normalizeCustomWidgets(widgets.map((widget) => {
          if (widget.dashboardKey !== dashboardKey) return widget;
          const idx = customOrder.indexOf(widget.id);
          if (idx === -1) return widget;
          return { ...widget, order: idx };
        }));
      });

      return { ...prev, [dashboardKey]: list };
    });

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const toggleWidget = (dashboardKey: string, widgetId: string) => {
    setLocalWidgets((prev) => {
      const seed = prev[dashboardKey] || selectedWidgetDefs(dashboardKey).map((def) => ({ id: def.id, visible: true }));
      const list = seed.map((w) =>
        w.id === widgetId ? { ...w, visible: !w.visible } : w
      );
      return { ...prev, [dashboardKey]: list };
    });

    setLocalCustomWidgets((prev) => prev.map((widget) =>
      widget.id === widgetId ? { ...widget, visible: !widget.visible } : widget
    ));
  };

  const addCustomWidget = () => {
    const dashboardKey = widgetForm.dashboardKey || selectedDashboardKey;
    const trimmedLabel = widgetForm.label.trim();
    if (!trimmedLabel) {
      setSaveMessage('اسم الـ Widget مطلوب');
      return;
    }
    if (widgetForm.type === 'quick_link' && !widgetForm.target.trim()) {
      setSaveMessage('مسار الرابط مطلوب لهذا النوع');
      return;
    }

    const dashboardCustom = localCustomWidgets.filter((widget) => widget.dashboardKey === dashboardKey);
    const nextOrder = dashboardCustom.length;
    const id = `custom_${dashboardKey}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newWidget: CustomWidgetConfig = {
      id,
      dashboardKey,
      type: widgetForm.type,
      label: trimmedLabel,
      icon: widgetForm.icon.trim() || 'widgets',
      visible: true,
      order: nextOrder,
      permission: widgetForm.permission.trim() || undefined,
      description: widgetForm.description.trim() || undefined,
      value: widgetForm.value.trim() || undefined,
      unit: widgetForm.unit.trim() || undefined,
      target: widgetForm.type === 'quick_link' ? widgetForm.target.trim() : undefined,
    };

    setLocalCustomWidgets((prev) => normalizeCustomWidgets([...prev, newWidget]));
    setLocalWidgets((prev) => {
      const current = prev[dashboardKey] || selectedWidgetDefs(dashboardKey).map((def) => ({ id: def.id, visible: true }));
      const exists = current.some((item) => item.id === newWidget.id);
      return {
        ...prev,
        [dashboardKey]: exists ? current : [...current, { id: newWidget.id, visible: true }],
      };
    });
    setSelectedDashboardKey(dashboardKey);
    setWidgetForm((prev) => ({
      ...prev,
      label: '',
      description: '',
      value: '',
      unit: '',
      target: '',
      permission: '',
    }));
    setSaveMessage('');
  };

  const removeCustomWidget = (dashboardKey: string, widgetId: string) => {
    setLocalCustomWidgets((prev) =>
      normalizeCustomWidgets(prev.filter((widget) => widget.id !== widgetId))
    );
    setLocalWidgets((prev) => {
      const list = (prev[dashboardKey] || []).filter((widget) => widget.id !== widgetId);
      return { ...prev, [dashboardKey]: list };
    });
  };

  const handleSelectDashboard = (dashboardKey: string) => {
    setSelectedDashboardKey(dashboardKey);
    setWidgetForm((prev) => ({ ...prev, dashboardKey }));
  };

  const moveWidgetToDashboard = (fromKey: string, toKey: string, widgetId: string) => {
    if (fromKey === toKey) return;
    const isCustom = localCustomWidgets.some((w) => w.id === widgetId);
    setLocalWidgets((prev) => {
      const fromList = [...(prev[fromKey] || selectedWidgetDefs(fromKey).map((d) => ({ id: d.id, visible: true })))];
      const idx = fromList.findIndex((w) => w.id === widgetId);
      if (idx === -1) return prev;
      const [item] = fromList.splice(idx, 1);
      const toList = [...(prev[toKey] || selectedWidgetDefs(toKey).map((d) => ({ id: d.id, visible: true })))];
      if (toList.some((w) => w.id === widgetId)) return prev;
      toList.push({ id: item.id, visible: item.visible });
      return { ...prev, [fromKey]: fromList, [toKey]: toList };
    });
    if (isCustom) {
      setLocalCustomWidgets((prev) =>
        normalizeCustomWidgets(prev.map((w) => (w.id === widgetId ? { ...w, dashboardKey: toKey } : w)))
      );
    }
    setSelectedDashboardKey(toKey);
    setSaveMessage('');
  };

  const addQuickAction = () => {
    const template = AVAILABLE_QUICK_ACTIONS[0];
    const newAction: QuickActionItem = {
      id: `quick_action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: template?.label ?? 'إجراء سريع',
      icon: template?.icon ?? 'bolt',
      color: template?.color ?? 'primary',
      actionType: template?.actionType ?? 'navigate',
      target: template?.target,
      permission: template?.permission,
      order: localQuickActions.length,
    };
    setLocalQuickActions((prev) => normalizeQuickActions([...prev, newAction]));
    setEditingQuickActionId(newAction.id);
  };

  const removeQuickAction = (id: string) => {
    setLocalQuickActions((prev) => normalizeQuickActions(prev.filter((item) => item.id !== id)));
    if (editingQuickActionId === id) setEditingQuickActionId(null);
  };

  const moveQuickAction = (id: string, direction: 'up' | 'down') => {
    setLocalQuickActions((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return normalizeQuickActions(next);
    });
  };

  const updateQuickAction = (id: string, patch: Partial<QuickActionItem>) => {
    setLocalQuickActions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateExportImportControl = useCallback(
    (pageKey: string, patch: Partial<(typeof DEFAULT_EXPORT_IMPORT_PAGE_CONTROL)>) => {
      setLocalExportImport((prev) => {
        const current = getExportImportPageControl(prev, pageKey);
        return {
          pages: {
            ...prev.pages,
            [pageKey]: { ...current, ...patch },
          },
        };
      });
    },
    [],
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  return (
    <ModuleOpsPageShell
      eyebrow="النظام"
      rangeLabel={`${sectionMeta.label} — ${sectionMeta.subtitle}`}
      actions={activeSection === 'backup' ? undefined : (
        <Button
          variant="primary"
          onClick={() => handleSave(activeSection)}
          disabled={saving || !activeSectionHasUnsavedChanges}
        >
          <span className="material-icons-round text-[15px]">save</span>
          {saving ? 'جاري الحفظ…' : 'حفظ الصفحة'}
        </Button>
      )}
    >
      {activeSectionHasUnsavedChanges && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-accent text-accent-foreground border border-border">
          <span className="material-icons-round text-base">info</span>
          لديك تعديلات غير محفوظة في هذه الصفحة. احفظ التغييرات قبل مغادرتها.
        </div>
      )}

      {/* ── Save feedback ─────────────────────────────────────────────────── */}
      {saveMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-medium ${
          saveMessage.includes('نجاح')
            ? 'bg-accent text-accent-foreground border border-border'
            : 'bg-destructive/10 text-destructive border border-destructive/25'
        }`}>
          <span className="material-icons-round text-lg">{saveMessage.includes('نجاح') ? 'check_circle' : 'error'}</span>
          {saveMessage}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: General Settings ────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'general' && (
        <>
          <GeneralSettingsHeader
            isAdmin={isAdmin}
          />

          <CompanyTenantSection isAdmin={isAdmin} />

          {can('settings.edit') && (
            <DefaultHomePathSection value={localDefaultHomePath} onChange={setLocalDefaultHomePath} />
          )}

          <GeneralSystemBehaviorSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            allPermissions={ALL_PERMISSIONS}
            hrUsers={systemUsers.map((user) => ({
              id: user.id || '',
              label: `${user.displayName || 'مستخدم'}${user.email ? ` (${user.email})` : ''}`,
            })).filter((item) => item.id)}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Appearance Settings ─────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'appearance' && (
        <>
          <GeneralBrandingSection
            isAdmin={isAdmin}
            localBranding={localBranding}
            setLocalBranding={setLocalBranding}
            uploadingLogo={uploadingLogo}
            brandingLogoRef={brandingLogoRef}
            onBrandingLogoUpload={handleBrandingLogoUpload}
            currencies={CURRENCIES}
            timezones={TIMEZONES}
          />

          <GeneralThemeSection
            isAdmin={isAdmin}
            localTheme={localTheme}
            setLocalTheme={setLocalTheme}
            themePresets={THEME_PRESETS}
            fontFamilies={FONT_FAMILIES}
            defaultTheme={DEFAULT_THEME}
          />

          <UiDensitySection />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Production Settings ─────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'production' && isAdmin && (
        <>
          <SettingsGroupTitle
            title="مسار التقرير والمخزون"
            description="المصدر الوحيد لقرار إذن الصرف، اعتماد إدخال الإنتاج، خصم BOM، وتوجيه مخازن الإنتاج والتغليف."
            icon="account_tree"
          />
          <ProductionReportBehaviorSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            localProductionWorkerSettings={localProductionWorkerSettings}
            setLocalProductionWorkerSettings={setLocalProductionWorkerSettings}
          />

          <OperationPathSettingsSection
            isAdmin={isAdmin}
            value={localOperationPaths}
            onChange={setLocalOperationPaths}
          />

          <InventoryRoutingSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            inventoryWarehouses={inventoryWarehouses}
          />

          <SettingsGroupTitle
            title="مستهلكات الأقسام"
            description="سياسة اعتماد صرف المستهلكات للأقسام (مباشر أو بموافقة)."
            icon="shopping_bag"
          />
          <DepartmentConsumablesSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
          />

          <SettingsGroupTitle
            title="قطع غيار الصيانة"
            description="سياسة اعتماد صرف قطع الغيار من مخازن مراكز الصيانة."
            icon="build"
          />
          <RepairSpareIssuesSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
          />

          <SettingsGroupTitle
            title="طلبات واعتمادات الإنتاج"
            description="موافقو طلبات الإنتاج وجهات الاطلاع بدون خلطها مع اعتماد حركات المخزون."
            icon="approval"
          />
          <ProductionRequestRoutingSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            employees={productionApproverEmployees}
          />

          <SettingsGroupTitle
            title="طاقم الإنتاج"
            description="ربط عمال الإنتاج وقواعد الأداء والمكافآت."
            icon="groups"
          />
          <ProductionWorkerSettingsSection
            value={localProductionWorkerSettings}
            onChange={setLocalProductionWorkerSettings}
            disabled={!isAdmin}
          />

          <SettingsGroupTitle
            title="لوكيشن المخازن"
            description="إلزام الرفوف واللوكيشن لكل مخزن بشكل مستقل عن مسار تقرير الإنتاج."
            icon="location_on"
          />
          <WarehouseLocationSettingsSection
            isAdmin={isAdmin}
            inventoryWarehouses={inventoryWarehouses}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Dashboards ──────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'dashboards' && isAdmin && (
        <>
          <GeneralDashboardDisplaySection
            isAdmin={isAdmin}
            localDashboardDisplay={localDashboardDisplay}
            setLocalDashboardDisplay={setLocalDashboardDisplay}
          />

          <QuickActionsSection
            isAdmin={isAdmin}
            saving={saving}
            localQuickActions={localQuickActions}
            editingQuickActionId={editingQuickActionId}
            setEditingQuickActionId={setEditingQuickActionId}
            moveQuickAction={moveQuickAction}
            removeQuickAction={removeQuickAction}
            getQuickActionMatch={getQuickActionMatch}
            updateQuickAction={updateQuickAction}
            addQuickAction={addQuickAction}
            onSave={() => handleSave('dashboards')}
            availableQuickActions={AVAILABLE_QUICK_ACTIONS}
            quickActionIcons={QUICK_ACTION_ICONS}
            quickActionColors={QUICK_ACTION_COLORS}
          />

          <DashboardWidgetsSection
            isAdmin={isAdmin}
            saving={saving}
            dashboardLabels={DASHBOARD_LABELS}
            selectedDashboardKey={selectedDashboardKey}
            handleSelectDashboard={handleSelectDashboard}
            localWidgets={localWidgets}
            selectedWidgetDefs={selectedWidgetDefs}
            localCustomWidgets={localCustomWidgets}
            handleDragStart={handleDragStart}
            handleDragEnter={handleDragEnter}
            handleDragEnd={handleDragEnd}
            toggleWidget={toggleWidget}
            removeCustomWidget={removeCustomWidget}
            widgetForm={widgetForm}
            setWidgetForm={setWidgetForm}
            addCustomWidget={addCustomWidget}
            onSave={() => handleSave('dashboards')}
            onMoveWidgetToDashboard={moveWidgetToDashboard}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Alerts ─────────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'alerts' && isAdmin && (
        <>
          <GeneralAlertsSection
            isAdmin={isAdmin}
            localAlertToggles={localAlertToggles}
            setLocalAlertToggles={setLocalAlertToggles}
          />

          <KPIThresholdsSection
            isAdmin={isAdmin}
            saving={saving}
            localKPIs={localKPIs}
            setLocalKPIs={setLocalKPIs}
            onSave={() => handleSave('alerts')}
          />

          <AlertRulesSection
            isAdmin={isAdmin}
            saving={saving}
            localAlerts={localAlerts}
            setLocalAlerts={setLocalAlerts}
            onSave={() => handleSave('alerts')}
            alertFields={ALERT_FIELDS}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Reports ───────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'reports' && isAdmin && (
        <PrintTemplateSettingsSection
          isAdmin={isAdmin}
          saving={saving}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          uploadingLogo={uploadingLogo}
          logoInputRef={logoInputRef}
          localPrint={localPrint}
          setLocalPrint={setLocalPrint}
          handleLogoUpload={handleLogoUpload}
          onSave={() => handleSave('reports')}
          onReset={() => setLocalPrint({ ...DEFAULT_PRINT_TEMPLATE })}
          sampleRows={PRINT_PREVIEW_SAMPLE_ROWS}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Export & Import ───────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'data' && isAdmin && (
        <ExportImportSettingsSection
          isAdmin={isAdmin}
          saving={saving}
          localExportImport={localExportImport}
          updateExportImportControl={updateExportImportControl}
          onSave={() => handleSave('data')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Client version / forced update ────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'clientVersion' && isAdmin && (
        <ClientVersionSettingsSection
          isAdmin={isAdmin}
          saving={saving}
          firestoreMinimumClientVersion={systemSettings.minimumClientVersion}
          firestoreForceClientUpdate={systemSettings.forceClientUpdate}
          firestoreClientUpdateMessageAr={systemSettings.clientUpdateMessageAr}
          localMinimumClientVersion={localMinimumClientVersion}
          setLocalMinimumClientVersion={setLocalMinimumClientVersion}
          localForceClientUpdate={localForceClientUpdate}
          setLocalForceClientUpdate={setLocalForceClientUpdate}
          localClientUpdateMessageAr={localClientUpdateMessageAr}
          setLocalClientUpdateMessageAr={setLocalClientUpdateMessageAr}
          onSave={() => handleSave('clientVersion')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Backup & Restore ─────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'backup' && isAdmin && (
        <BackupRestoreSection
          isAdmin={isAdmin}
          backupMessage={backupMessage}
          setBackupMessage={setBackupMessage}
          backupProgress={backupProgress}
          backupLoading={backupLoading}
          handleExportFull={handleExportFull}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          handleExportMonthly={handleExportMonthly}
          handleExportSettings={handleExportSettings}
          importFileName={importFileName}
          importInputRef={importInputRef}
          handleFileSelect={handleFileSelect}
          onClearImportSelection={clearImportSelection}
          importValidation={importValidation}
          importFile={importFile}
          restoreModes={restoreModes}
          restoreMode={restoreMode}
          setRestoreMode={setRestoreMode}
          setShowConfirmRestore={setShowConfirmRestore}
          historyLoading={historyLoading}
          backupHistory={backupHistory}
          showConfirmRestore={showConfirmRestore}
          handleRestore={handleRestore}
          skipAutoBackupBeforeRestore={skipAutoBackupBeforeRestore}
          setSkipAutoBackupBeforeRestore={setSkipAutoBackupBeforeRestore}
          useServerImport={useServerImport}
          setUseServerImport={setUseServerImport}
          isSuperAdmin={isSuperAdmin}
        />
      )}
    </ModuleOpsPageShell>
  );
};
