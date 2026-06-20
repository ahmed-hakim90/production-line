
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
import { warehouseService } from '../../inventory/services/warehouseService';
import { userService } from '../../../services/userService';
import type {
  AlertSettings, ThemeSettings,
  QuickActionItem, QuickActionColor, CustomWidgetConfig, FirestoreUser,
} from '../../../types';
import type { Warehouse } from '../../inventory/types';
import type { ReportPrintRow } from '../../production/components/ProductionReportPrint';
import { GeneralSettingsHeader } from '../components/settings/GeneralSettingsHeader';
import { GeneralBrandingSection } from '../components/settings/GeneralBrandingSection';
import { GeneralThemeSection } from '../components/settings/GeneralThemeSection';
import { ProductionWorkerSettingsSection } from '@/modules/production/components/ProductionWorkerSettingsSection';
import { GeneralSystemBehaviorSection } from '../components/settings/GeneralSystemBehaviorSection';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, type ProductionWorkerSettings } from '@/types';
import { InventoryRoutingSettingsSection } from '../components/settings/InventoryRoutingSettingsSection';
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
import { PageHeader } from '../../../components/PageHeader';
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
  { value: 'emerald', label: 'أخضر', classes: 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-200' },
  { value: 'amber', label: 'أصفر', classes: 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200' },
  { value: 'rose', label: 'وردي', classes: 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-200' },
  { value: 'violet', label: 'بنفسجي', classes: 'bg-violet-50 dark:bg-violet-900/10 text-violet-600 border-violet-200 dark:border-violet-800' },
  { value: 'slate', label: 'رمادي', classes: 'bg-[#f0f2f5] text-[var(--color-text-muted)] border-[var(--color-border)]' },
];

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Tajawal', label: 'Tajawal' },
  { value: 'Rubik', label: 'Rubik' },
  { value: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic' },
  { value: 'Noto Sans Arabic', label: 'Noto Sans Arabic' },
];

// ── Ready-made theme presets ─────────────────────────────────────────────────
interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: { primary: string; bg: string; card: string };
  swatches?: [string, string, string];
  partialTheme: Partial<ThemeSettings>;
}

const THEME_PRESETS: ThemePreset[] = [
  /* ── Indigo Pro (default) ─────────────────────────────────────────────── */
  {
    id: 'indigo-pro',
    name: 'Indigo Pro ⭐',
    description: 'الثيم الافتراضي الرسمي',
    colors: { primary: '#4F46E5', bg: '#F8FAFC', card: '#C7D2FE' },
    swatches: ['#F1F5F9', '#C7D2FE', '#4F46E5'],
    partialTheme: {
      primaryColor: '#4F46E5',
      secondaryColor: '#6366F1',
      successColor: '#059669',
      warningColor: '#D97706',
      dangerColor: '#DC2626',
      backgroundColor: '#F8FAFC',
      cssVars: {
        '--primary': '239 84% 60%',
        '--primary-foreground': '0 0% 100%',
        '--secondary': '240 5% 96%',
        '--secondary-foreground': '240 6% 10%',
        '--background': '210 40% 98%',
        '--foreground': '222 84% 5%',
        '--muted': '210 40% 96%',
        '--muted-foreground': '215 16% 47%',
        '--accent': '239 84% 97%',
        '--accent-foreground': '239 84% 30%',
        '--border': '214 32% 91%',
        '--input': '214 32% 91%',
        '--ring': '239 84% 60%',
        '--card': '0 0% 100%',
        '--card-foreground': '222 84% 5%',
        '--radius': '0.5rem',
      },
      darkMode: 'light',
      sidebarIconStyle: 'primary',
    },
  },
  {
    id: 'erpnext_espresso',
    name: 'ERPNext Espresso',
    description: 'أزرق نقي — نمط بديل',
    colors: { primary: '#2490EF', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#2490EF', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  {
    id: 'erpnext_indigo',
    name: 'Indigo Pro',
    description: 'نيلي داكن محترف',
    colors: { primary: '#4361ee', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#4361ee', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  /* ── ثيمات مخصصة (خلفية Espresso موحدة) ── */
  {
    id: 'classic_red',
    name: 'كلاسيك أحمر',
    description: 'هوية المؤسسة',
    colors: { primary: '#a80008', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#a80008', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'colorful' },
  },
  {
    id: 'royal_blue',
    name: 'أزرق ملكي',
    description: 'أنيق ومحترف',
    colors: { primary: '#1e40af', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#1e40af', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  {
    id: 'emerald_pro',
    name: 'أخضر زمردي',
    description: 'مناسب للمصانع',
    colors: { primary: '#047857', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#047857', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'colorful' },
  },
  {
    id: 'violet_modern',
    name: 'بنفسجي عصري',
    description: 'تصميم حديث',
    colors: { primary: '#6d28d9', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#6d28d9', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  {
    id: 'amber_gold',
    name: 'ذهبي احترافي',
    description: 'دافئ ومميز',
    colors: { primary: '#b45309', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#b45309', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'colorful' },
  },
  {
    id: 'sky_blue',
    name: 'سماوي نقي',
    description: 'هادئ ومريح',
    colors: { primary: '#0284c7', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#0284c7', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  {
    id: 'teal_factory',
    name: 'تيل صناعي',
    description: 'ثيم المصنع',
    colors: { primary: '#0f766e', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#0f766e', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'colorful' },
  },
  {
    id: 'rose_elegant',
    name: 'وردي أنيق',
    description: 'راقٍ وعصري',
    colors: { primary: '#be185d', bg: '#f0f2f5', card: '#ffffff' },
    partialTheme: { primaryColor: '#be185d', darkMode: 'light', backgroundColor: '#f0f2f5', sidebarIconStyle: 'primary' },
  },
  /* ── داكن ── */
  {
    id: 'dark_navy',
    name: 'داكن ليلي',
    description: 'للعمل الليلي',
    colors: { primary: '#60a5fa', bg: '#020617', card: '#0f172a' },
    partialTheme: { primaryColor: '#60a5fa', darkMode: 'dark', backgroundColor: '#020617', sidebarIconStyle: 'primary' },
  },
  {
    id: 'dark_emerald',
    name: 'داكن أخضر',
    description: 'داكن مميز',
    colors: { primary: '#34d399', bg: '#020617', card: '#0f172a' },
    partialTheme: { primaryColor: '#34d399', darkMode: 'dark', backgroundColor: '#020617', sidebarIconStyle: 'muted' },
  },
];

const SAMPLE_ROWS: ReportPrintRow[] = [
  { date: '2026-02-21', lineName: 'خط 1', productName: 'منتج A', employeeName: 'أحمد محمد', quantityProduced: 1200, wasteQuantity: 35, workersCount: 12, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 2', productName: 'منتج B', employeeName: 'سعيد علي', quantityProduced: 950, wasteQuantity: 20, workersCount: 10, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 3', productName: 'منتج C', employeeName: 'خالد حسن', quantityProduced: 800, wasteQuantity: 15, workersCount: 8, workHours: 7.5 },
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
  });
  const [inventoryWarehouses, setInventoryWarehouses] = useState<Warehouse[]>([]);
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
        const users = await userService.getAll();
        setSystemUsers(users.filter((user) => user.isActive !== false));
      } catch {
        setSystemUsers([]);
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
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title={sectionMeta.label}
        subtitle={sectionMeta.subtitle}
        backAction={false}
        primaryAction={activeSection === 'backup' ? undefined : {
          label: 'حفظ الصفحة',
          icon: 'save',
          onClick: () => handleSave(activeSection),
          disabled: saving || !hasUnsavedChanges,
        }}
        loading={saving}
      />

      {hasUnsavedChanges && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-accent text-accent-foreground border border-border">
          <span className="material-icons-round text-base">info</span>
          لديك تعديلات غير محفوظة. احفظ التغييرات قبل مغادرة الصفحة.
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
            saving={saving}
            onSave={() => handleSave('general')}
          />

          {can('settings.edit') && (
            <DefaultHomePathSection value={localDefaultHomePath} onChange={setLocalDefaultHomePath} />
          )}

          <CompanyTenantSection isAdmin={isAdmin} />

          <GeneralSystemBehaviorSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            inventoryWarehouses={inventoryWarehouses}
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
          <UiDensitySection />

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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── PAGE: Production Settings ─────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'production' && isAdmin && (
        <>
          <ProductionWorkerSettingsSection
            value={localProductionWorkerSettings}
            onChange={setLocalProductionWorkerSettings}
            disabled={!isAdmin}
          />

          <InventoryRoutingSettingsSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
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

          <AlertRulesSection
            isAdmin={isAdmin}
            saving={saving}
            localAlerts={localAlerts}
            setLocalAlerts={setLocalAlerts}
            onSave={() => handleSave('alerts')}
            alertFields={ALERT_FIELDS}
          />

          <KPIThresholdsSection
            isAdmin={isAdmin}
            saving={saving}
            localKPIs={localKPIs}
            setLocalKPIs={setLocalKPIs}
            onSave={() => handleSave('alerts')}
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
          sampleRows={SAMPLE_ROWS}
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
    </div>
  );
};
