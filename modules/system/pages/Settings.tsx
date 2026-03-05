
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isConfigured } from '../../../services/firebase';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Badge, Button } from '../components/UI';
import {
  usePermission,
  useCurrentRole,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import {
  DASHBOARD_LABELS,
  AVAILABLE_QUICK_ACTIONS,
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_KPI_THRESHOLDS,
  DEFAULT_PRINT_TEMPLATE,
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_BRANDING,
  DEFAULT_THEME,
  DEFAULT_DASHBOARD_DISPLAY,
  DEFAULT_ALERT_TOGGLES,
  DEFAULT_EXPORT_IMPORT_PAGE_CONTROL,
} from '../../../utils/dashboardConfig';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { applyTheme, setupAutoThemeListener } from '../../../utils/themeEngine';
import { warehouseService } from '../../inventory/services/warehouseService';
import type {
  SystemSettings, AlertSettings, ThemeSettings,
  QuickActionItem, QuickActionColor, CustomWidgetConfig,
} from '../../../types';
import type { Warehouse } from '../../inventory/types';
import type { ReportPrintRow } from '../../production/components/ProductionReportPrint';
import { GeneralSettingsHeader } from '../components/settings/GeneralSettingsHeader';
import { GeneralBrandingSection } from '../components/settings/GeneralBrandingSection';
import { GeneralThemeSection } from '../components/settings/GeneralThemeSection';
import { GeneralSystemBehaviorSection } from '../components/settings/GeneralSystemBehaviorSection';
import { GeneralDashboardDisplaySection } from '../components/settings/GeneralDashboardDisplaySection';
import { GeneralAlertsSection } from '../components/settings/GeneralAlertsSection';
import { KPIThresholdsSection } from '../components/settings/KPIThresholdsSection';
import { PrintTemplateSettingsSection } from '../components/settings/PrintTemplateSettingsSection';
import { ExportImportSettingsSection } from '../components/settings/ExportImportSettingsSection';
import { BackupRestoreSection } from '../components/settings/BackupRestoreSection';
import { AlertRulesSection } from '../components/settings/AlertRulesSection';
import { QuickActionsSection } from '../components/settings/QuickActionsSection';
import { DashboardWidgetsSection } from '../components/settings/DashboardWidgetsSection';
import { useSettingsDraft } from '../hooks/useSettingsDraft';
import { useBackupRestore } from '../hooks/useBackupRestore';

type SettingsTab = 'general' | 'quickActions' | 'dashboardWidgets' | 'alertRules' | 'kpiThresholds' | 'printTemplate' | 'exportImport' | 'backup';

const TABS: { key: SettingsTab; label: string; icon: string; adminOnly: boolean }[] = [
  { key: 'general', label: 'الإعدادات العامة', icon: 'settings', adminOnly: false },
  { key: 'quickActions', label: 'الإجراءات السريعة', icon: 'bolt', adminOnly: true },
  { key: 'dashboardWidgets', label: 'إعدادات لوحات التحكم', icon: 'dashboard_customize', adminOnly: true },
  { key: 'alertRules', label: 'قواعد التنبيهات', icon: 'notifications_active', adminOnly: true },
  { key: 'kpiThresholds', label: 'حدود المؤشرات', icon: 'tune', adminOnly: true },
  { key: 'printTemplate', label: 'إعدادات الطباعة', icon: 'print', adminOnly: true },
  { key: 'exportImport', label: 'التصدير والاستيراد', icon: 'import_export', adminOnly: true },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: 'backup', adminOnly: true },
];

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
  { value: 'Asia/Qatar', label: 'قطر (GMT+3)' },
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
  partialTheme: Partial<ThemeSettings>;
}

const THEME_PRESETS: ThemePreset[] = [
  /* ── ERPNext Espresso (مقترح كثيم افتراضي) ── */
  {
    id: 'erpnext_espresso',
    name: 'ERPNext Espresso ⭐',
    description: 'أزرق نقي — النمط الرسمي',
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
  { date: '2026-02-21', lineName: 'خط 1', productName: 'منتج A', employeeName: 'أحمد محمد', quantityProduced: 1200, quantityWaste: 35, workersCount: 12, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 2', productName: 'منتج B', employeeName: 'سعيد علي', quantityProduced: 950, quantityWaste: 20, workersCount: 10, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 3', productName: 'منتج C', employeeName: 'خالد حسن', quantityProduced: 800, quantityWaste: 15, workersCount: 8, workHours: 7.5 },
];

const ALERT_FIELDS: { key: keyof AlertSettings; label: string; icon: string; unit: string; description: string }[] = [
  { key: 'wasteThreshold', label: 'حد الهدر', icon: 'delete_sweep', unit: '%', description: 'نسبة الهدر المقبولة — تنبيه عند تجاوزها' },
  { key: 'costVarianceThreshold', label: 'حد انحراف التكلفة', icon: 'compare_arrows', unit: '%', description: 'نسبة الانحراف المقبولة عن التكلفة المعيارية' },
  { key: 'efficiencyThreshold', label: 'حد الكفاءة', icon: 'speed', unit: '%', description: 'الحد الأدنى المقبول للكفاءة — تنبيه عند الانخفاض' },
  { key: 'planDelayDays', label: 'أيام تأخر الخطة', icon: 'schedule', unit: 'يوم', description: 'عدد الأيام المسموح بتأخرها قبل التنبيه' },
  { key: 'overProductionThreshold', label: 'حد الإنتاج الزائد', icon: 'trending_up', unit: '%', description: 'نسبة تجاوز الهدف المسموحة — تنبيه عند التجاوز' },
];

export const Settings: React.FC = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const products = useAppStore((s) => s.products);
  const productionLines = useAppStore((s) => s.productionLines);
  const employees = useAppStore((s) => s.employees);
  const userPermissions = useAppStore((s) => s.userPermissions);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);

  const { can } = usePermission();
  const { roleName, roleColor } = useCurrentRole();
  const isAdmin = can('roles.manage');

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const enabledCount = Object.values(userPermissions).filter(Boolean).length;

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
    normalizeQuickActions,
    getQuickActionMatch,
    normalizeCustomWidgets,
    selectedWidgetDefs,
  } = useSettingsDraft(systemSettings);
  const [inventoryWarehouses, setInventoryWarehouses] = useState<Warehouse[]>([]);
  const [editingQuickActionId, setEditingQuickActionId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const brandingLogoRef = useRef<HTMLInputElement>(null);

  // Instant theme preview
  useEffect(() => {
    if (activeTab === 'general') {
      applyTheme(localTheme);
      setupAutoThemeListener(localTheme);
    }
  }, [localTheme, activeTab]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const whs = await warehouseService.getAll();
        setInventoryWarehouses(whs.filter((w) => w.isActive !== false));
      } catch {
        setInventoryWarehouses([]);
      }
    })();
  }, [isAdmin]);

  // Revert to saved theme when leaving general tab
  useEffect(() => {
    return () => {
      const saved = systemSettings.theme ?? DEFAULT_THEME;
      applyTheme(saved);
      setupAutoThemeListener(saved);
    };
  }, []);

  const {
    backupLoading,
    backupProgress,
    backupMessage,
    setBackupMessage,
    backupHistory,
    historyLoading,
    firebaseUsage,
    firebaseUsageLoading,
    firebaseUsageError,
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
    loadFirebaseUsage,
    handleExportFull,
    handleExportMonthly,
    handleExportSettings,
    handleFileSelect,
    clearImportSelection,
    handleRestore,
    projectId,
    firestoreUsagePercent,
    firestoreRemainingBytes,
    sparkDaily,
    restoreModes,
    formatBytes,
  } = useBackupRestore({ activeTab, isAdmin });

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

  const handleSave = useCallback(async (section: 'general' | 'quickActions' | 'widgets' | 'alerts' | 'kpis' | 'print' | 'exportImport') => {
    setSaving(true);
    setSaveMessage('');
    try {
      const updated: SystemSettings = {
        ...systemSettings,
        dashboardWidgets: section === 'widgets' ? localWidgets : systemSettings.dashboardWidgets,
        customDashboardWidgets: section === 'widgets'
          ? normalizeCustomWidgets(localCustomWidgets)
          : (systemSettings.customDashboardWidgets ?? []),
        alertSettings: section === 'alerts' ? localAlerts : systemSettings.alertSettings,
        kpiThresholds: section === 'kpis' ? localKPIs : systemSettings.kpiThresholds,
        printTemplate: section === 'print' ? localPrint : systemSettings.printTemplate,
        planSettings: section === 'general' ? localPlanSettings : (systemSettings.planSettings ?? DEFAULT_PLAN_SETTINGS),
        branding: section === 'general' ? localBranding : (systemSettings.branding ?? DEFAULT_BRANDING),
        theme: section === 'general' ? localTheme : (systemSettings.theme ?? DEFAULT_THEME),
        dashboardDisplay: section === 'general' ? localDashboardDisplay : (systemSettings.dashboardDisplay ?? DEFAULT_DASHBOARD_DISPLAY),
        alertToggles: section === 'general' ? localAlertToggles : (systemSettings.alertToggles ?? DEFAULT_ALERT_TOGGLES),
        quickActions: section === 'quickActions' ? normalizeQuickActions(localQuickActions) : (systemSettings.quickActions ?? []),
        exportImport: section === 'exportImport' ? localExportImport : (systemSettings.exportImport ?? { pages: {} }),
      };
      await updateSystemSettings(updated);
      setSaveMessage('تم الحفظ بنجاح');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setSaveMessage('فشل الحفظ');
    }
    setSaving(false);
  }, [systemSettings, localWidgets, localCustomWidgets, localAlerts, localKPIs, localPrint, localPlanSettings, localBranding, localTheme, localDashboardDisplay, localAlertToggles, normalizeQuickActions, normalizeCustomWidgets, localQuickActions, localExportImport, updateSystemSettings]);

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

  // ── Visible tabs ───────────────────────────────────────────────────────────

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const serialize = useCallback((value: unknown) => JSON.stringify(value), []);
  const dirtyBySection = useMemo(() => {
    const savedQuickActions = (systemSettings.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item, index) => ({ ...item, order: item.order ?? index }));
    return {
      general:
        serialize({ ...DEFAULT_PLAN_SETTINGS, ...systemSettings.planSettings }) !== serialize(localPlanSettings) ||
        serialize({ ...DEFAULT_BRANDING, ...systemSettings.branding }) !== serialize(localBranding) ||
        serialize({ ...DEFAULT_THEME, ...systemSettings.theme }) !== serialize(localTheme) ||
        serialize({ ...DEFAULT_DASHBOARD_DISPLAY, ...systemSettings.dashboardDisplay }) !== serialize(localDashboardDisplay) ||
        serialize({ ...DEFAULT_ALERT_TOGGLES, ...systemSettings.alertToggles }) !== serialize(localAlertToggles),
      quickActions:
        serialize(savedQuickActions) !== serialize(normalizeQuickActions(localQuickActions)),
      widgets:
        serialize(systemSettings.dashboardWidgets) !== serialize(localWidgets) ||
        serialize(systemSettings.customDashboardWidgets ?? []) !== serialize(normalizeCustomWidgets(localCustomWidgets)),
      alerts:
        serialize(systemSettings.alertSettings) !== serialize(localAlerts),
      kpis:
        serialize(systemSettings.kpiThresholds) !== serialize(localKPIs),
      print:
        serialize(systemSettings.printTemplate) !== serialize(localPrint),
      exportImport:
        serialize(systemSettings.exportImport ?? { pages: {} }) !== serialize(localExportImport),
    } as const;
  }, [
    serialize,
    systemSettings,
    localPlanSettings,
    localBranding,
    localTheme,
    localDashboardDisplay,
    localAlertToggles,
    localQuickActions,
    localWidgets,
    localCustomWidgets,
    localAlerts,
    localKPIs,
    localPrint,
    localExportImport,
    normalizeQuickActions,
    normalizeCustomWidgets,
  ]);
  const hasUnsavedChanges = useMemo(
    () => Object.values(dirtyBySection).some(Boolean),
    [dirtyBySection],
  );
  const tabToSection: Partial<Record<SettingsTab, keyof typeof dirtyBySection>> = {
    general: 'general',
    quickActions: 'quickActions',
    dashboardWidgets: 'widgets',
    alertRules: 'alerts',
    kpiThresholds: 'kpis',
    printTemplate: 'print',
    exportImport: 'exportImport',
  };
  const handleTabChange = useCallback((nextTab: SettingsTab) => {
    if (nextTab === activeTab) return;
    const currentSection = tabToSection[activeTab];
    if (currentSection && dirtyBySection[currentSection]) {
      const ok = window.confirm('لديك تغييرات غير محفوظة في هذا التبويب. هل تريد المتابعة بدون حفظ؟');
      if (!ok) return;
    }
    setActiveTab(nextTab);
  }, [activeTab, dirtyBySection]);
  const getTabDirty = useCallback((tab: SettingsTab) => {
    const section = tabToSection[tab];
    return section ? Boolean(dirtyBySection[section]) : false;
  }, [dirtyBySection]);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">الإعدادات</h2>
        <p className="page-subtitle">إعدادات النظام وحالة الاتصال والصلاحيات.</p>
      </div>

      {hasUnsavedChanges && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40">
          <span className="material-icons-round text-lg">pending_actions</span>
          لديك تعديلات غير محفوظة. تأكد من الضغط على زر الحفظ في التبويب المناسب.
        </div>
      )}

      {/* ── Tab Bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30 hover:bg-[var(--color-bg)]'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
            {getTabDirty(tab.key) && (
              <span className={`inline-block w-2 h-2 rounded-full ${
                activeTab === tab.key ? 'bg-white' : 'bg-amber-500'
              }`} />
            )}
          </button>
        ))}
      </div>

      {/* ── Save feedback ─────────────────────────────────────────────────── */}
      {saveMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
          saveMessage.includes('نجاح')
            ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 dark:bg-rose-900/10 text-rose-700 border border-rose-200'
        }`}>
          <span className="material-icons-round text-lg">{saveMessage.includes('نجاح') ? 'check_circle' : 'error'}</span>
          {saveMessage}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: General Settings ─────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'general' && (
        <>
          <GeneralSettingsHeader
            isAdmin={isAdmin}
            saving={saving}
            onSave={() => handleSave('general')}
          />

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

          <GeneralSystemBehaviorSection
            isAdmin={isAdmin}
            localPlanSettings={localPlanSettings}
            setLocalPlanSettings={setLocalPlanSettings}
            inventoryWarehouses={inventoryWarehouses}
            allPermissions={ALL_PERMISSIONS}
          />

          <GeneralDashboardDisplaySection
            isAdmin={isAdmin}
            localDashboardDisplay={localDashboardDisplay}
            setLocalDashboardDisplay={setLocalDashboardDisplay}
          />

          <GeneralAlertsSection
            isAdmin={isAdmin}
            localAlertToggles={localAlertToggles}
            setLocalAlertToggles={setLocalAlertToggles}
          />

          {/* ── System Status (for all users) ─────────────────────────────── */}
          <Card title="حالة النظام">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] p-5 text-center border border-[var(--color-border)]">
                <span className="material-icons-round text-primary text-3xl mb-2 block">cloud_done</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">اتصال Firebase</p>
                <Badge variant={isAuthenticated ? 'success' : 'danger'}>
                  {isAuthenticated ? 'متصل' : 'غير متصل'}
                </Badge>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] p-5 text-center border border-[var(--color-border)]">
                <span className="material-icons-round text-primary text-3xl mb-2 block">inventory_2</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">المنتجات</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{products.length}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] p-5 text-center border border-[var(--color-border)]">
                <span className="material-icons-round text-primary text-3xl mb-2 block">precision_manufacturing</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">خطوط الإنتاج</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{productionLines.length}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] p-5 text-center border border-[var(--color-border)]">
                <span className="material-icons-round text-primary text-3xl mb-2 block">groups</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">المشرفين</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{employees.length}</p>
              </div>
            </div>
          </Card>

          {/* Current Role Info (for all users) */}
          <Card title="الدور الحالي والصلاحيات">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-icons-round text-primary text-2xl">shield</span>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الدور الحالي</p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${roleColor}`}>
                  {roleName}
                </span>
              </div>
              <div className="mr-auto text-xs text-[var(--color-text-muted)] font-bold">
                {enabledCount} / {ALL_PERMISSIONS.length} صلاحية مفعلة
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Quick Actions ────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'quickActions' && isAdmin && (
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
          onSave={() => handleSave('quickActions')}
          availableQuickActions={AVAILABLE_QUICK_ACTIONS}
          quickActionIcons={QUICK_ACTION_ICONS}
          quickActionColors={QUICK_ACTION_COLORS}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Dashboard Widget Settings ────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboardWidgets' && isAdmin && (
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
          onSave={() => handleSave('widgets')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Alert Rules ──────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alertRules' && isAdmin && (
        <AlertRulesSection
          isAdmin={isAdmin}
          saving={saving}
          localAlerts={localAlerts}
          setLocalAlerts={setLocalAlerts}
          onSave={() => handleSave('alerts')}
          alertFields={ALERT_FIELDS}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: KPI Thresholds ───────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'kpiThresholds' && isAdmin && (
        <KPIThresholdsSection
          isAdmin={isAdmin}
          saving={saving}
          localKPIs={localKPIs}
          setLocalKPIs={setLocalKPIs}
          onSave={() => handleSave('kpis')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Print Template Settings ───────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'printTemplate' && isAdmin && (
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
          onSave={() => handleSave('print')}
          onReset={() => setLocalPrint({ ...DEFAULT_PRINT_TEMPLATE })}
          sampleRows={SAMPLE_ROWS}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Export & Import ─────────────────────────────────────────  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'exportImport' && isAdmin && (
        <ExportImportSettingsSection
          isAdmin={isAdmin}
          saving={saving}
          localExportImport={localExportImport}
          updateExportImportControl={updateExportImportControl}
          onSave={() => handleSave('exportImport')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Backup & Restore ──────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'backup' && isAdmin && (
        <BackupRestoreSection
          isAdmin={isAdmin}
          backupMessage={backupMessage}
          setBackupMessage={setBackupMessage}
          backupProgress={backupProgress}
          loadFirebaseUsage={loadFirebaseUsage}
          firebaseUsageLoading={firebaseUsageLoading}
          backupLoading={backupLoading}
          firebaseUsage={firebaseUsage}
          projectId={projectId}
          firebaseUsageError={firebaseUsageError}
          formatBytes={formatBytes}
          firestoreRemainingBytes={firestoreRemainingBytes}
          firestoreUsagePercent={firestoreUsagePercent}
          sparkDaily={sparkDaily}
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
        />
      )}
    </div>
  );
};
