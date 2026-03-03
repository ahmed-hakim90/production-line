
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  DASHBOARD_WIDGETS,
  DASHBOARD_LABELS,
  CUSTOM_WIDGET_TYPES,
  AVAILABLE_QUICK_ACTIONS,
  KPI_DEFINITIONS,
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
import { EXPORT_IMPORT_PAGE_REGISTRY, getExportImportPageControl } from '../../../utils/exportImportControls';
import { ProductionReportPrint, computePrintTotals } from '../../production/components/ProductionReportPrint';
import {
  backupService,
  validateBackupFile,
  type BackupFile,
  type BackupHistoryEntry,
  type FirebaseUsageEstimate,
  type RestoreMode,
} from '../../../services/backupService';
import { applyTheme, setupAutoThemeListener } from '../../../utils/themeEngine';
import { warehouseService } from '../../inventory/services/warehouseService';
import type {
  SystemSettings, WidgetConfig, AlertSettings, KPIThreshold, PrintTemplateSettings,
  PaperSize, PaperOrientation, PlanSettings, BrandingSettings, ThemeSettings,
  DashboardDisplaySettings, AlertToggleSettings, ThemeMode, UIDensity, QuickActionItem, QuickActionColor,
  CustomWidgetConfig, CustomWidgetType, ExportImportSettings, SidebarIconStyle,
} from '../../../types';
import type { Warehouse } from '../../inventory/types';
import type { ReportPrintRow } from '../../production/components/ProductionReportPrint';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';

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

const RESTORE_MODES: { value: RestoreMode; label: string; icon: string; description: string; color: string }[] = [
  { value: 'merge', label: 'دمج', icon: 'merge', description: 'دمج البيانات الجديدة مع البيانات الحالية — لا يتم حذف أي شيء', color: 'emerald' },
  { value: 'replace', label: 'استبدال', icon: 'swap_horiz', description: 'استبدال المجموعات المشمولة فقط — المجموعات الأخرى تبقى', color: 'amber' },
  { value: 'full_reset', label: 'إعادة تعيين كاملة', icon: 'restart_alt', description: 'حذف كل شيء واستبداله بالنسخة الاحتياطية — عملية لا رجعة فيها', color: 'rose' },
];

const SAMPLE_ROWS: ReportPrintRow[] = [
  { date: '2026-02-21', lineName: 'خط 1', productName: 'منتج A', employeeName: 'أحمد محمد', quantityProduced: 1200, quantityWaste: 35, workersCount: 12, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 2', productName: 'منتج B', employeeName: 'سعيد علي', quantityProduced: 950, quantityWaste: 20, workersCount: 10, workHours: 8 },
  { date: '2026-02-21', lineName: 'خط 3', productName: 'منتج C', employeeName: 'خالد حسن', quantityProduced: 800, quantityWaste: 15, workersCount: 8, workHours: 7.5 },
];

const FIRESTORE_SPARK_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB
const FIRESTORE_SPARK_DAILY = {
  reads: 50000,
  writes: 20000,
  deletes: 20000,
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

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

  // ── Local editable copies ──────────────────────────────────────────────────

  const [localWidgets, setLocalWidgets] = useState<Record<string, WidgetConfig[]>>(
    () => JSON.parse(JSON.stringify(systemSettings.dashboardWidgets))
  );
  const [localCustomWidgets, setLocalCustomWidgets] = useState<CustomWidgetConfig[]>(
    () => JSON.parse(JSON.stringify(systemSettings.customDashboardWidgets ?? []))
  );
  const [selectedDashboardKey, setSelectedDashboardKey] = useState<string>(() => Object.keys(DASHBOARD_LABELS)[0] ?? 'dashboard');
  const [widgetForm, setWidgetForm] = useState<{
    dashboardKey: string;
    type: CustomWidgetType;
    label: string;
    icon: string;
    permission: string;
    description: string;
    value: string;
    unit: string;
    target: string;
  }>({
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

  // ── Backup state ────────────────────────────────────────────────────────────
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ step: string; percent: number } | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [firebaseUsage, setFirebaseUsage] = useState<FirebaseUsageEstimate | null>(null);
  const [firebaseUsageLoading, setFirebaseUsageLoading] = useState(false);
  const [firebaseUsageError, setFirebaseUsageError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [importFile, setImportFile] = useState<BackupFile | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importValidation, setImportValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadBackupHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const history = await backupService.getHistory();
      setBackupHistory(history);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  const loadFirebaseUsage = useCallback(async () => {
    setFirebaseUsageLoading(true);
    setFirebaseUsageError('');
    try {
      const usage = await backupService.getUsageEstimate();
      setFirebaseUsage(usage);
    } catch (err: any) {
      setFirebaseUsageError(err?.message || 'تعذر تحميل استهلاك Firebase');
    }
    setFirebaseUsageLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'backup' && isAdmin) {
      loadBackupHistory();
      if (!firebaseUsage && !firebaseUsageLoading) {
        loadFirebaseUsage();
      }
    }
  }, [activeTab, isAdmin, loadBackupHistory, loadFirebaseUsage, firebaseUsage, firebaseUsageLoading]);

  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const handleExportFull = useCallback(async () => {
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      await backupService.exportFullBackup(userEmail || 'admin');
      setBackupMessage({ type: 'success', text: 'تم تصدير النسخة الاحتياطية الكاملة بنجاح' });
      loadBackupHistory();
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || 'فشل التصدير' });
    }
    setBackupLoading(false);
  }, [userEmail, loadBackupHistory]);

  const handleExportMonthly = useCallback(async () => {
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      await backupService.exportMonthlyBackup(selectedMonth, userEmail || 'admin');
      setBackupMessage({ type: 'success', text: `تم تصدير بيانات شهر ${selectedMonth} بنجاح` });
      loadBackupHistory();
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || 'فشل التصدير' });
    }
    setBackupLoading(false);
  }, [selectedMonth, userEmail, loadBackupHistory]);

  const handleExportSettings = useCallback(async () => {
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      await backupService.exportSettingsOnly(userEmail || 'admin');
      setBackupMessage({ type: 'success', text: 'تم تصدير الإعدادات بنجاح' });
      loadBackupHistory();
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || 'فشل التصدير' });
    }
    setBackupLoading(false);
  }, [userEmail, loadBackupHistory]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportFile(null);
    setImportValidation(null);
    setBackupMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const validation = validateBackupFile(parsed);
        setImportValidation(validation);
        if (validation.valid) {
          setImportFile(parsed as BackupFile);
        }
      } catch {
        setImportValidation({ valid: false, error: 'ملف JSON غير صالح — تأكد من صحة الملف' });
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  }, []);

  const _loadAppData = useAppStore((s) => s._loadAppData);
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);

  const handleRestore = useCallback(async () => {
    if (!importFile) return;
    const currentImportFile = importFile;
    const currentImportFileName = importFileName || 'backup.json';
    const jobId = addJob({
      fileName: currentImportFileName,
      jobType: 'Backup Import',
      totalRows: 100,
      startedBy: userDisplayName || userEmail || 'Current User',
    });
    setShowConfirmRestore(false);
    setBackupLoading(true);
    setBackupMessage(null);
    startJob(jobId, 'Saving to database...');
    // Clear selection immediately; restore continues in background jobs panel.
    setImportFile(null);
    setImportFileName('');
    setImportValidation(null);

    const result = await backupService.importBackup(
      currentImportFile,
      restoreMode,
      userEmail || 'admin',
      (step, percent) => {
        setBackupProgress({ step, percent });
        setJobProgress(jobId, {
          processedRows: Math.max(0, Math.min(percent, 100)),
          totalRows: 100,
          statusText: step || 'Saving to database...',
          status: 'processing',
        });
      }
    );

    setBackupProgress(null);

    if (result.success) {
      completeJob(jobId, {
        addedRows: result.restored || 0,
        failedRows: 0,
        statusText: 'Completed',
      });
      setBackupMessage({
        type: 'success',
        text: `تمت الاستعادة بنجاح — ${result.restored} مستند`,
      });

      try {
        await _loadAppData();
        await fetchSystemSettings();
      } catch { /* ignore */ }
      loadBackupHistory();
    } else {
      failJob(jobId, result.error || 'Restore failed', 'Failed');
      setBackupMessage({ type: 'error', text: result.error || 'فشلت الاستعادة' });
    }

    setBackupLoading(false);
  }, [importFile, importFileName, restoreMode, userEmail, userDisplayName, _loadAppData, fetchSystemSettings, loadBackupHistory, addJob, startJob, setJobProgress, completeJob, failJob]);

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
  const projectId = (import.meta as any)?.env?.VITE_FIREBASE_PROJECT_ID || '';
  const firestoreUsagePercent = firebaseUsage
    ? Math.min((firebaseUsage.estimatedBytes / FIRESTORE_SPARK_LIMIT_BYTES) * 100, 100)
    : 0;
  const firestoreRemainingBytes = firebaseUsage
    ? Math.max(FIRESTORE_SPARK_LIMIT_BYTES - firebaseUsage.estimatedBytes, 0)
    : FIRESTORE_SPARK_LIMIT_BYTES;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">الإعدادات</h2>
        <p className="page-subtitle">إعدادات النظام وحالة الاتصال والصلاحيات.</p>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
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
          {/* Save button */}
          {isAdmin && (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">الإعدادات العامة</h3>
                <p className="page-subtitle">هوية المصنع، المظهر، سلوك النظام، لوحة التحكم، والتنبيهات.</p>
              </div>
              <Button onClick={() => handleSave('general')} disabled={saving}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">save</span>
                حفظ جميع الإعدادات
              </Button>
            </div>
          )}

          {/* ── Section 1: Branding ────────────────────────────────────────── */}
          {isAdmin && (
            <Card title="هوية المصنع">
              <div className="space-y-5">
                {/* Factory Name */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">factory</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">اسم المصنع</p>
                      <p className="text-xs text-slate-400">يظهر في التقارير والواجهة</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localBranding.factoryName}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, factoryName: e.target.value }))}
                  />
                </div>

                {/* Logo */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">image</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">شعار المصنع</p>
                      <p className="text-xs text-slate-400">PNG أو JPG — يظهر في الواجهة والتقارير</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {localBranding.logoUrl && (
                      <img src={localBranding.logoUrl} alt="logo" className="w-12 h-12 rounded-[var(--border-radius-base)] object-contain border border-[var(--color-border)] bg-[var(--color-card)]" />
                    )}
                    <input ref={brandingLogoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleBrandingLogoUpload} />
                    <button
                      onClick={() => brandingLogoRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploadingLogo ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">upload</span>}
                      {localBranding.logoUrl ? 'تغيير' : 'رفع'}
                    </button>
                    {localBranding.logoUrl && (
                      <button onClick={() => setLocalBranding((p) => ({ ...p, logoUrl: '' }))} className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100 transition-all">
                        <span className="material-icons-round text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Currency */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">payments</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">العملة</p>
                      <p className="text-xs text-slate-400">العملة المستخدمة في التكاليف والتقارير</p>
                    </div>
                  </div>
                  <select
                    className="w-full sm:w-64 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localBranding.currency}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, currency: e.target.value }))}
                  >
                    {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {/* Timezone */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">schedule</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">المنطقة الزمنية</p>
                      <p className="text-xs text-slate-400">تحدد توقيت التقارير والعمليات</p>
                    </div>
                  </div>
                  <select
                    className="w-full sm:w-64 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localBranding.timezone}
                    onChange={(e) => setLocalBranding((p) => ({ ...p, timezone: e.target.value }))}
                  >
                    {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
              </div>
            </Card>
          )}

          {/* ── Section 2: Theme Engine ────────────────────────────────────── */}
          {isAdmin && (
            <Card title="محرك المظهر">
              <div className="space-y-6">

                {/* ── Preset Themes ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-primary text-lg">auto_awesome</span>
                    <p className="text-sm font-bold text-[var(--color-text)]">ثيمات جاهزة</p>
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">— اختر واحدة وعدّل عليها</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {THEME_PRESETS.map((preset) => {
                      const isActive =
                        localTheme.primaryColor === preset.partialTheme.primaryColor &&
                        localTheme.darkMode    === preset.partialTheme.darkMode;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setLocalTheme((p) => ({ ...p, ...preset.partialTheme }))}
                          className={[
                            'relative flex flex-col items-center gap-2.5 p-3 rounded-[var(--border-radius-lg)] border-2 transition-all duration-150 text-center group',
                            isActive
                              ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                              : 'border-[var(--color-border)] hover:border-primary/40 hover:bg-[#f8f9fa]/60',
                          ].join(' ')}
                        >
                          {/* Active check */}
                          {isActive && (
                            <span className="absolute top-1.5 left-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow">
                              <span className="material-icons-round text-white" style={{ fontSize: '10px' }}>check</span>
                            </span>
                          )}
                          {/* Color swatches mini preview */}
                          <div className="flex gap-1 items-center">
                            <div
                              className="w-7 h-7 rounded-[var(--border-radius-base)] shadow-inner border border-black/10"
                              style={{ backgroundColor: preset.colors.primary }}
                            />
                            <div
                              className="w-5 h-5 rounded-[var(--border-radius-sm)] shadow-inner border border-black/10"
                              style={{ backgroundColor: preset.colors.bg }}
                            />
                            <div
                              className="w-5 h-5 rounded-[var(--border-radius-sm)] shadow-inner border border-black/10"
                              style={{ backgroundColor: preset.colors.card }}
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[var(--color-text)] leading-tight">{preset.name}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mt-0.5">{preset.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-[var(--color-text-muted)] font-bold">أو خصّص بنفسك</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Color Grid */}
                <div>
                  <p className="text-sm font-bold text-[var(--color-text)] mb-3">الألوان</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {([
                      { key: 'primaryColor' as const, label: 'اللون الرئيسي', icon: 'palette' },
                      { key: 'secondaryColor' as const, label: 'اللون الثانوي', icon: 'color_lens' },
                      { key: 'successColor' as const, label: 'لون النجاح', icon: 'check_circle' },
                      { key: 'warningColor' as const, label: 'لون التحذير', icon: 'warning' },
                      { key: 'dangerColor' as const, label: 'لون الخطر', icon: 'error' },
                      { key: 'backgroundColor' as const, label: 'لون الخلفية', icon: 'format_paint' },
                    ]).map((color) => (
                      <div key={color.key} className="flex items-center gap-3 p-3 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                        <input
                          type="color"
                          className="w-10 h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] cursor-pointer shrink-0"
                          value={localTheme[color.key]}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, [color.key]: e.target.value }))}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[var(--color-text-muted)]">{color.label}</p>
                          <input
                            type="text"
                            className="w-full border-0 bg-transparent text-xs font-mono font-bold text-[var(--color-text)] outline-none p-0 mt-0.5"
                            value={localTheme[color.key]}
                            onChange={(e) => setLocalTheme((p) => ({ ...p, [color.key]: e.target.value }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dark Mode */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">dark_mode</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">الوضع</p>
                      <p className="text-xs text-slate-400">فاتح، داكن، أو تلقائي حسب النظام</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {([
                      { value: 'light' as ThemeMode, label: 'فاتح', icon: 'light_mode' },
                      { value: 'dark' as ThemeMode, label: 'داكن', icon: 'dark_mode' },
                      { value: 'auto' as ThemeMode, label: 'تلقائي', icon: 'brightness_auto' },
                    ]).map((mode) => (
                      <button
                        key={mode.value}
                        onClick={() => setLocalTheme((p) => ({ ...p, darkMode: mode.value }))}
                        className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                          localTheme.darkMode === mode.value
                            ? 'bg-primary text-white shadow-primary/20'
                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                        }`}
                      >
                        <span className="material-icons-round text-sm">{mode.icon}</span>
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">text_fields</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">نوع الخط</p>
                      <p className="text-xs text-slate-400">الخط المستخدم في جميع أنحاء التطبيق</p>
                    </div>
                  </div>
                  <select
                    className="w-full sm:w-56 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localTheme.baseFontFamily}
                    onChange={(e) => setLocalTheme((p) => ({ ...p, baseFontFamily: e.target.value }))}
                  >
                    {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                  </select>
                </div>

                {/* Font Size + Border Radius */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">format_size</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">حجم الخط الأساسي</p>
                      <div className="erp-page-actions">
                        <input
                          type="range"
                          min={11}
                          max={20}
                          step={1}
                          className="flex-1 accent-primary"
                          value={localTheme.baseFontSize}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, baseFontSize: Number(e.target.value) }))}
                        />
                        <span className="text-sm font-bold text-[var(--color-text)] w-12 text-center">{localTheme.baseFontSize}px</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">rounded_corner</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">استدارة الحواف</p>
                      {/* Quick presets */}
                      <div className="flex items-center gap-2 mb-2">
                        {[
                          { label: 'حاد', value: 0 },
                          { label: 'عادي', value: 6 },
                          { label: 'مستدير', value: 12 },
                          { label: 'دائري', value: 20 },
                        ].map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setLocalTheme((prev) => ({ ...prev, borderRadius: p.value }))}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-all ${
                              localTheme.borderRadius === p.value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-primary/40'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                        <span className="text-[11px] text-[var(--color-text-muted)] mr-auto">{localTheme.borderRadius}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={2}
                        className="w-full accent-primary"
                        value={localTheme.borderRadius}
                        onChange={(e) => setLocalTheme((p) => ({ ...p, borderRadius: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Text Colors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Main text color */}
                  <div className="flex items-center gap-3 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">title</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">لون النص الرئيسي</p>
                      <p className="text-[10px] text-slate-400 mb-2">نص العناوين والبيانات الأساسية</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={localTheme.textColor || '#1a1a1a'}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, textColor: e.target.value }))}
                          className="w-10 h-8 rounded cursor-pointer border border-[var(--color-border)] p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={localTheme.textColor || '#1a1a1a'}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, textColor: e.target.value }))}
                          className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-xs font-mono py-1.5 px-2 outline-none focus:border-primary"
                          maxLength={7}
                          placeholder="#1a1a1a"
                        />
                        <button
                          onClick={() => setLocalTheme((p) => ({ ...p, textColor: '#1a1a1a' }))}
                          className="text-[var(--color-text-muted)] hover:text-primary transition-colors"
                          title="إعادة تعيين"
                        >
                          <span className="material-icons-round text-sm">restart_alt</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Muted text color */}
                  <div className="flex items-center gap-3 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">subtitles</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">لون النص الثانوي</p>
                      <p className="text-[10px] text-slate-400 mb-2">التسميات والتفاصيل الرمادية</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={localTheme.mutedTextColor || '#8d99a6'}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, mutedTextColor: e.target.value }))}
                          className="w-10 h-8 rounded cursor-pointer border border-[var(--color-border)] p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={localTheme.mutedTextColor || '#8d99a6'}
                          onChange={(e) => setLocalTheme((p) => ({ ...p, mutedTextColor: e.target.value }))}
                          className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-xs font-mono py-1.5 px-2 outline-none focus:border-primary"
                          maxLength={7}
                          placeholder="#8d99a6"
                        />
                        <button
                          onClick={() => setLocalTheme((p) => ({ ...p, mutedTextColor: '#8d99a6' }))}
                          className="text-[var(--color-text-muted)] hover:text-primary transition-colors"
                          title="إعادة تعيين"
                        >
                          <span className="material-icons-round text-sm">restart_alt</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Density */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">density_medium</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">كثافة العرض</p>
                      <p className="text-xs text-slate-400">مريح يعطي مساحة أكبر، مضغوط يعرض محتوى أكثر</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {([
                      { value: 'comfortable' as UIDensity, label: 'مريح', icon: 'view_agenda' },
                      { value: 'compact' as UIDensity, label: 'مضغوط', icon: 'view_headline' },
                    ]).map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setLocalTheme((p) => ({ ...p, density: d.value }))}
                        className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                          localTheme.density === d.value
                            ? 'bg-primary text-white shadow-primary/20'
                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                        }`}
                      >
                        <span className="material-icons-round text-sm">{d.icon}</span>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sidebar Icon Style */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">interests</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">ألوان أيقونات القائمة</p>
                      <p className="text-xs text-slate-400">ملوّن يعطي كل قسم لونه، رئيسي يوحّد اللون، محايد رمادي هادئ</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {([
                      { value: 'colorful' as SidebarIconStyle, label: 'ملوّن', icon: 'palette' },
                      { value: 'primary' as SidebarIconStyle, label: 'رئيسي', icon: 'circle' },
                      { value: 'muted'   as SidebarIconStyle, label: 'محايد', icon: 'tonality' },
                    ]).map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setLocalTheme((p) => ({ ...p, sidebarIconStyle: s.value }))}
                        className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                          (localTheme.sidebarIconStyle ?? 'colorful') === s.value
                            ? 'bg-primary text-white shadow-primary/20'
                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                        }`}
                      >
                        <span className="material-icons-round text-sm">{s.icon}</span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Live UI Preview ── */}
                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
                  <p className="text-xs font-bold text-[var(--color-text-muted)] px-4 py-2.5 bg-[#f8f9fa] border-b border-[var(--color-border)]">
                    معاينة مباشرة
                  </p>
                  {/* Mini app mockup */}
                  <div className="p-4" style={{ backgroundColor: localTheme.backgroundColor }}>
                    {/* Topbar mock */}
                    <div className="rounded-[var(--border-radius-lg)] mb-3 px-4 py-2.5 flex items-center justify-between"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div className="erp-page-actions">
                        <div className="w-6 h-6 rounded-[var(--border-radius-base)] flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: localTheme.primaryColor }}>م</div>
                        <span className="text-xs font-bold" style={{ color: '#0f172a' }}>مؤسسة المغربي</span>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center">
                          <span className="material-icons-round text-slate-400" style={{ fontSize: 13 }}>notifications</span>
                        </div>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: localTheme.primaryColor }}>م</div>
                      </div>
                    </div>
                    {/* KPI cards mock */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: 'الإنتاج', value: '١٢٤', icon: 'factory' },
                        { label: 'الجودة', value: '٩٨٪', icon: 'verified' },
                        { label: 'المهام', value: '٣٧', icon: 'assignment' },
                      ].map((kpi) => (
                        <div key={kpi.label} className="rounded-[var(--border-radius-lg)] p-2.5 flex items-center gap-2"
                          style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                          <div className="w-7 h-7 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${localTheme.primaryColor}18` }}>
                            <span className="material-icons-round text-[14px]" style={{ color: localTheme.primaryColor }}>{kpi.icon}</span>
                          </div>
                          <div>
                            <p className="text-[8px] text-[var(--color-text-muted)] font-medium">{kpi.label}</p>
                            <p className="text-xs font-black" style={{ color: '#0f172a' }}>{kpi.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Buttons mock */}
                    <div className="erp-page-actions">
                      <button className="px-3 py-1.5 rounded-[var(--border-radius-base)] text-white text-[10px] font-bold"
                        style={{ backgroundColor: localTheme.primaryColor }}>
                        + إضافة جديد
                      </button>
                      <button className="px-3 py-1.5 rounded-[var(--border-radius-base)] text-[10px] font-bold border"
                        style={{ color: localTheme.primaryColor, borderColor: `${localTheme.primaryColor}40`, backgroundColor: `${localTheme.primaryColor}08` }}>
                        تصدير
                      </button>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--border-radius-base)] text-[9px] font-bold"
                        style={{ backgroundColor: localTheme.successColor + '15', color: localTheme.successColor }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: localTheme.successColor }} />
                        نشط
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--border-radius-base)] text-[9px] font-bold"
                        style={{ backgroundColor: localTheme.dangerColor + '15', color: localTheme.dangerColor }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: localTheme.dangerColor }} />
                        خطر
                      </div>
                    </div>
                  </div>
                </div>

                {/* Color swatches row */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: 'رئيسي', color: localTheme.primaryColor },
                    { label: 'ثانوي', color: localTheme.secondaryColor },
                    { label: 'نجاح', color: localTheme.successColor },
                    { label: 'تحذير', color: localTheme.warningColor },
                    { label: 'خطر', color: localTheme.dangerColor },
                    { label: 'خلفية', color: localTheme.backgroundColor },
                  ]).map((swatch) => (
                    <div key={swatch.label} className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--border-radius-base)] bg-[#f8f9fa] border border-[var(--color-border)]">
                      <div className="w-4 h-4 rounded shadow-inner border border-black/10" style={{ backgroundColor: swatch.color }} />
                      <span className="text-[10px] font-bold text-slate-500">{swatch.label}</span>
                      <span className="text-[9px] font-mono text-slate-400">{swatch.color}</span>
                    </div>
                  ))}
                </div>

                {/* Reset */}
                <button
                  onClick={() => setLocalTheme({ ...DEFAULT_THEME })}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <span className="material-icons-round text-sm">restart_alt</span>
                  إعادة تعيين للقيم الافتراضية
                </button>
              </div>
            </Card>
          )}

          {/* ── Section 3: System Behavior ─────────────────────────────────── */}
          {isAdmin && (
            <Card title="سلوك النظام">
              <div className="space-y-4">
                {/* Toggle Settings */}
                {([
                  { key: 'allowMultipleActivePlans' as keyof PlanSettings, label: 'السماح بخطط متعددة نشطة على نفس الخط', icon: 'playlist_add', desc: 'عند التعطيل، لن يُسمح بإنشاء خطة جديدة على خط يحتوي بالفعل على خطة نشطة.' },
                  { key: 'allowReportWithoutPlan' as keyof PlanSettings, label: 'السماح بالتقارير بدون خطة', icon: 'assignment', desc: 'عند التعطيل، لن يتمكن المشرفون من إنشاء تقارير إنتاج بدون خطة نشطة.' },
                  { key: 'allowOverProduction' as keyof PlanSettings, label: 'السماح بالإنتاج الزائد', icon: 'trending_up', desc: 'عند التعطيل، لن يُسمح بإضافة تقارير بعد الوصول إلى الكمية المخططة.' },
                  { key: 'autoClosePlan' as keyof PlanSettings, label: 'إغلاق الخطة تلقائياً عند الاكتمال', icon: 'event_available', desc: 'عند التفعيل، يتم تغيير حالة الخطة إلى "مكتملة" تلقائياً عند الوصول للكمية المخططة.' },
                  { key: 'requireFinishedStockApprovalForReports' as keyof PlanSettings, label: 'اعتماد دخول تم الصنع من التقارير', icon: 'approval', desc: 'عند التفعيل، لا تتم إضافة المنتج التام تلقائياً للمخزن بعد التقرير، بل يظهر طلب اعتماد للمستخدم المخول.' },
                  { key: 'allowNegativeDecomposedStock' as keyof PlanSettings, label: 'السماح بالسالب في مخزن المفكك', icon: 'remove_circle_outline', desc: 'عند التفعيل، يمكن خصم مواد خام من مخزن المفكك حتى لو الرصيد الحالي غير كافٍ.' },
                  { key: 'allowNegativeFinishedTransferStock' as keyof PlanSettings, label: 'السماح بتحويل تم الصنع بالسالب', icon: 'swap_horiz', desc: 'عند التفعيل، يمكن اعتماد تحويلات مخزن "تم الصنع" حتى لو الرصيد الحالي أقل من الكمية المطلوبة.' },
                ]).map((setting) => (
                  <div key={setting.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">{setting.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">{setting.label}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{setting.desc}</p>
                    </div>
                    <button
                      onClick={() => setLocalPlanSettings((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${(localPlanSettings as any)[setting.key] ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${(localPlanSettings as any)[setting.key] ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
                    </button>
                  </div>
                ))}

                {/* Numeric & Select Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Max Waste Threshold */}
                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">delete_sweep</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">حد الهدر الأقصى</p>
                    </div>
                    <div className="erp-page-actions">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        value={localPlanSettings.maxWasteThreshold}
                        onChange={(e) => setLocalPlanSettings((p) => ({ ...p, maxWasteThreshold: Number(e.target.value) }))}
                      />
                      <span className="text-sm font-bold text-slate-400">%</span>
                    </div>
                  </div>

                  {/* Efficiency Calculation Mode */}
                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">speed</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">حساب الكفاءة</p>
                    </div>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.efficiencyCalculationMode}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, efficiencyCalculationMode: e.target.value as 'standard' | 'weighted' }))}
                    >
                      <option value="standard">قياسي</option>
                      <option value="weighted">مرجّح</option>
                    </select>
                  </div>

                  {/* Average Production Mode */}
                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">equalizer</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">متوسط الإنتاج</p>
                    </div>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.averageProductionMode}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, averageProductionMode: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                    >
                      <option value="daily">يومي</option>
                      <option value="weekly">أسبوعي</option>
                      <option value="monthly">شهري</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-primary text-lg">warehouse</span>
                    <p className="text-sm font-bold text-[var(--color-text)]">مخزن استقبال الإنتاج</p>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">
                    أي تقرير إنتاج جديد أو إغلاق أمر شغل سيتم ترحيل الكمية المنتجة تلقائياً إلى هذا المخزن.
                  </p>
                  <select
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localPlanSettings.defaultProductionWarehouseId ?? ''}
                    onChange={(e) => setLocalPlanSettings((p) => ({ ...p, defaultProductionWarehouseId: e.target.value }))}
                  >
                    <option value="">بدون ترحيل تلقائي</option>
                    {inventoryWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] sm:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">science</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">مخزن المواد الخام</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">
                      المنتجات التي لها رصيد في هذا المخزن يتم اعتبارها "خامات" ولن تظهر في الإنتاج أو التكاليف أو قوائم اختيار المنتج.
                    </p>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.rawMaterialWarehouseId ?? ''}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, rawMaterialWarehouseId: e.target.value }))}
                    >
                      <option value="">غير محدد</option>
                      {inventoryWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">call_split</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">مخزن المفكك (خصم الخامات)</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">
                      عند تسجيل تقرير إنتاج، النظام يخصم مكونات المنتج (الخامات) من هذا المخزن.
                    </p>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.decomposedSourceWarehouseId ?? ''}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, decomposedSourceWarehouseId: e.target.value }))}
                    >
                      <option value="">غير محدد</option>
                      {inventoryWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">inventory_2</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">مخزن تم الصنع</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">
                      الكمية المنتجة (تم الصنع) تُضاف تلقائيًا إلى هذا المخزن من تقرير الإنتاج.
                    </p>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.finishedReceiveWarehouseId ?? ''}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, finishedReceiveWarehouseId: e.target.value }))}
                    >
                      <option value="">غير محدد</option>
                      {inventoryWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">delete_sweep</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">مخزن الهالك</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">
                      كمية الهالك في تقرير الإنتاج تُرحَّل تلقائيًا إلى هذا المخزن.
                    </p>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.wasteReceiveWarehouseId ?? ''}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, wasteReceiveWarehouseId: e.target.value }))}
                    >
                      <option value="">غير محدد</option>
                      {inventoryWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round text-primary text-lg">inventory</span>
                      <p className="text-sm font-bold text-[var(--color-text)]">مخزن المنتج التام</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3">
                      يستخدم للعرض في مؤشرات "منتج تام". لا يتم إضافة حركة إنتاج تلقائية عليه حاليًا.
                    </p>
                    <select
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPlanSettings.finalProductWarehouseId ?? ''}
                      onChange={(e) => setLocalPlanSettings((p) => ({ ...p, finalProductWarehouseId: e.target.value }))}
                    >
                      <option value="">غير محدد</option>
                      {inventoryWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-primary text-lg">verified_user</span>
                    <p className="text-sm font-bold text-[var(--color-text)]">صلاحية معتمد تحويلات المخازن</p>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">
                    أي مستخدم يملك هذه الصلاحية يمكنه قبول/رفض التحويلات المعلقة.
                  </p>
                  <select
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localPlanSettings.transferApprovalPermission ?? ''}
                    onChange={(e) => setLocalPlanSettings((p) => ({ ...p, transferApprovalPermission: e.target.value }))}
                  >
                    {ALL_PERMISSIONS.map((permission) => (
                      <option key={permission} value={permission}>{permission}</option>
                    ))}
                  </select>
                </div>
                <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-primary text-lg">straighten</span>
                    <p className="text-sm font-bold text-[var(--color-text)]">وحدة عرض تحويلات المنتج النهائي</p>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">
                    يحدد طريقة عرض كميات تحويلات المنتج النهائي في الشاشات والطباعة: قطعة أو كرتونة.
                  </p>
                  <select
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={localPlanSettings.transferDisplayUnit ?? 'piece'}
                    onChange={(e) => setLocalPlanSettings((p) => ({ ...p, transferDisplayUnit: e.target.value as 'piece' | 'carton' }))}
                  >
                    <option value="piece">قطعة</option>
                    <option value="carton">كرتونة</option>
                  </select>
                </div>
              </div>
            </Card>
          )}

          {/* ── Section 4: Dashboard Settings ─────────────────────────────── */}
          {isAdmin && (
            <Card title="إعدادات لوحة التحكم">
              <div className="space-y-4">
                {([
                  { key: 'showCostWidgets' as keyof DashboardDisplaySettings, label: 'عرض عناصر التكاليف', icon: 'account_balance', desc: 'إظهار عناصر التكلفة والتحليل المالي في لوحات التحكم' },
                  { key: 'showAlertsWidget' as keyof DashboardDisplaySettings, label: 'عرض عنصر التنبيهات', icon: 'notifications_active', desc: 'إظهار قسم التنبيهات النشطة في لوحات التحكم' },
                  { key: 'enableDragReorder' as keyof DashboardDisplaySettings, label: 'تفعيل السحب لإعادة الترتيب', icon: 'drag_indicator', desc: 'السماح بإعادة ترتيب العناصر في لوحات التحكم بالسحب والإفلات' },
                ]).map((setting) => (
                  <div key={setting.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">{setting.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">{setting.label}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{setting.desc}</p>
                    </div>
                    <button
                      onClick={() => setLocalDashboardDisplay((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${(localDashboardDisplay as any)[setting.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${(localDashboardDisplay as any)[setting.key] ? 'right-0.5' : 'right-[22px]'}`} />
                    </button>
                  </div>
                ))}

                {/* Widgets Per Row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">view_column</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">عدد العناصر في الصف</p>
                      <p className="text-xs text-slate-400">عدد الأعمدة في شبكة لوحة التحكم</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setLocalDashboardDisplay((p) => ({ ...p, widgetsPerRow: n }))}
                        className={`w-12 h-10 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all ${
                          localDashboardDisplay.widgetsPerRow === n
                            ? 'bg-primary text-white shadow-primary/20'
                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── Section 5: Alerts Settings ─────────────────────────────────── */}
          {isAdmin && (
            <Card title="إعدادات التنبيهات">
              <div className="space-y-4">
                {([
                  { key: 'enablePlanDelayAlert' as keyof AlertToggleSettings, label: 'تنبيه تأخر الخطط', icon: 'schedule', desc: 'إرسال تنبيه عند تأخر خطة الإنتاج عن الموعد المحدد' },
                  { key: 'enableCapacityAlert' as keyof AlertToggleSettings, label: 'تنبيه السعة الإنتاجية', icon: 'production_quantity_limits', desc: 'تنبيه عند اقتراب خط الإنتاج من الحد الأقصى للسعة' },
                  { key: 'enableCostVarianceAlert' as keyof AlertToggleSettings, label: 'تنبيه انحراف التكلفة', icon: 'compare_arrows', desc: 'تنبيه عند تجاوز التكلفة الفعلية للتكلفة المعيارية' },
                ]).map((alert) => (
                  <div key={alert.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                    <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">{alert.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">{alert.label}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{alert.desc}</p>
                    </div>
                    <button
                      onClick={() => setLocalAlertToggles((prev) => ({ ...prev, [alert.key]: !prev[alert.key] }))}
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${localAlertToggles[alert.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${localAlertToggles[alert.key] ? 'right-0.5' : 'right-[22px]'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── System Status (for all users) ─────────────────────────────── */}
          <Card title="حالة النظام">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-5 text-center">
                <span className="material-icons-round text-primary text-3xl mb-2 block">cloud_done</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">اتصال Firebase</p>
                <Badge variant={isAuthenticated ? 'success' : 'danger'}>
                  {isAuthenticated ? 'متصل' : 'غير متصل'}
                </Badge>
              </div>
              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-5 text-center">
                <span className="material-icons-round text-primary text-3xl mb-2 block">inventory_2</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">المنتجات</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{products.length}</p>
              </div>
              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-5 text-center">
                <span className="material-icons-round text-primary text-3xl mb-2 block">precision_manufacturing</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">خطوط الإنتاج</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{productionLines.length}</p>
              </div>
              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-5 text-center">
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
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">الإجراءات السريعة — لوحة مدير النظام</h3>
              <p className="page-subtitle">أنشئ أزرار تنقل أو تصدير بسرعة، وخصص الاسم والأيقونة واللون.</p>
            </div>
            <Button onClick={() => handleSave('quickActions')} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              حفظ التغييرات
            </Button>
          </div>

          <Card title="قائمة الأزرار السريعة" subtitle="الترتيب هنا هو نفس ترتيب الظهور في لوحة مدير النظام">
            <div className="space-y-3">
              {localQuickActions.length === 0 && (
                <div className="text-center py-10 bg-[#f8f9fa]/50 border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-lg)]">
                  <span className="material-icons-round text-3xl text-[var(--color-text-muted)] dark:text-slate-600">bolt</span>
                  <p className="mt-2 text-sm font-bold text-slate-500">لا توجد إجراءات سريعة حتى الآن</p>
                </div>
              )}

              {localQuickActions.map((item, index) => {
                const selectedColor = QUICK_ACTION_COLORS.find((c) => c.value === item.color) ?? QUICK_ACTION_COLORS[0];
                return (
                  <div key={item.id} className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 space-y-4 bg-[var(--color-card)]">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] border ${selectedColor.classes}`}>
                        <span className="material-icons-round text-base">{item.icon}</span>
                        <span className="text-sm font-bold">{item.label || 'بدون اسم'}</span>
                      </div>
                      <span className="text-[11px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-1 rounded-full sm:mr-auto">
                        ترتيب #{index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveQuickAction(item.id, 'up')}
                          disabled={index === 0}
                          className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          title="تحريك لأعلى"
                        >
                          <span className="material-icons-round text-sm">keyboard_arrow_up</span>
                        </button>
                        <button
                          onClick={() => moveQuickAction(item.id, 'down')}
                          disabled={index === localQuickActions.length - 1}
                          className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          title="تحريك لأسفل"
                        >
                          <span className="material-icons-round text-sm">keyboard_arrow_down</span>
                        </button>
                        <button
                          onClick={() => setEditingQuickActionId((prev) => prev === item.id ? null : item.id)}
                          className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 transition-all"
                          title="تعديل"
                        >
                          <span className="material-icons-round text-sm">edit</span>
                        </button>
                        <button
                          onClick={() => removeQuickAction(item.id)}
                          className="w-8 h-8 rounded-[var(--border-radius-base)] border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all"
                          title="حذف"
                        >
                          <span className="material-icons-round text-sm">delete</span>
                        </button>
                      </div>
                    </div>

                    {editingQuickActionId === item.id && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/40 border border-[var(--color-border)]">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">اسم الزر</label>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateQuickAction(item.id, { label: e.target.value })}
                            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            placeholder="مثال: إدخال سريع"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">الإجراء</label>
                          <select
                            value={getQuickActionMatch(item)}
                            onChange={(e) => {
                              const selected = AVAILABLE_QUICK_ACTIONS.find((def) => def.key === e.target.value);
                              if (!selected) return;
                              updateQuickAction(item.id, {
                                actionType: selected.actionType,
                                target: selected.target,
                                permission: selected.permission,
                                icon: selected.icon,
                                color: selected.color,
                              });
                            }}
                            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                          >
                            <option value="custom">مخصص (تعديل يدوي)</option>
                            {AVAILABLE_QUICK_ACTIONS.map((def) => (
                              <option key={def.key} value={def.key}>{def.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">الأيقونة</label>
                          <select
                            value={item.icon}
                            onChange={(e) => updateQuickAction(item.id, { icon: e.target.value })}
                            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                          >
                            {QUICK_ACTION_ICONS.map((icon) => (
                              <option key={icon} value={icon}>{icon}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">اللون</label>
                          <div className="flex flex-wrap gap-2">
                            {QUICK_ACTION_COLORS.map((color) => (
                              <button
                                key={color.value}
                                onClick={() => updateQuickAction(item.id, { color: color.value })}
                                className={`px-3 py-1.5 rounded-[var(--border-radius-base)] border text-xs font-bold transition-all ${color.classes} ${item.color === color.value ? 'ring-2 ring-primary/30' : ''}`}
                              >
                                {color.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="lg:col-span-2 text-[11px] font-medium text-[var(--color-text-muted)] flex flex-wrap items-center gap-3">
                          <span>النوع: <span className="font-bold text-[var(--color-text-muted)]">{item.actionType}</span></span>
                          {item.target && <span>المسار: <span className="font-mono">{item.target}</span></span>}
                          {item.permission && <span>الصلاحية: <span className="font-mono">{item.permission}</span></span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button variant="outline" onClick={addQuickAction}>
                <span className="material-icons-round text-sm">add</span>
                إضافة زر سريع
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Dashboard Widget Settings ────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboardWidgets' && isAdmin && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">إعدادات عناصر لوحات التحكم</h3>
              <p className="page-subtitle">تحكم في ترتيب وظهور العناصر من مكان واحد، مع إمكانية إضافة Widget جديد.</p>
            </div>
            <Button onClick={() => handleSave('widgets')} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              حفظ التغييرات
            </Button>
          </div>

          <Card title="اختيار لوحة التحكم">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(DASHBOARD_LABELS).map(([dashboardKey, dashboardLabel]) => (
                <button
                  key={dashboardKey}
                  onClick={() => handleSelectDashboard(dashboardKey)}
                  className={`text-sm font-bold rounded-[var(--border-radius-lg)] px-4 py-3 border transition-all ${
                    selectedDashboardKey === dashboardKey
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-primary/20'
                  }`}
                >
                  {dashboardLabel}
                </button>
              ))}
            </div>
          </Card>

          <Card title={`عناصر ${DASHBOARD_LABELS[selectedDashboardKey] || 'لوحة التحكم'}`} subtitle="اسحب لإعادة الترتيب، وفعّل/عطّل العرض حسب الحاجة">
            <div className="space-y-1">
              {(localWidgets[selectedDashboardKey] || selectedWidgetDefs(selectedDashboardKey).map((def) => ({ id: def.id, visible: true }))).map((widget, index) => {
                const defs = selectedWidgetDefs(selectedDashboardKey);
                const def = defs.find((d) => d.id === widget.id);
                if (!def) return null;
                const isCustom = localCustomWidgets.some((custom) => custom.id === widget.id);

                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={() => handleDragStart(selectedDashboardKey, index)}
                    onDragEnter={() => handleDragEnter(selectedDashboardKey, index)}
                    onDragEnd={() => handleDragEnd(selectedDashboardKey)}
                    onDragOver={(e) => e.preventDefault()}
                    className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border transition-all cursor-grab active:cursor-grabbing group ${
                      widget.visible
                        ? 'bg-[var(--color-card)] border-[var(--color-border)] hover:border-primary/30'
                        : 'bg-[#f8f9fa]/50 border-[var(--color-border)] opacity-60'
                    }`}
                  >
                    <span className="material-icons-round text-[var(--color-text-muted)] dark:text-slate-600 text-lg group-hover:text-primary transition-colors">
                      drag_indicator
                    </span>
                    <span className="w-8 h-8 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary text-sm">{def.icon}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)] truncate">{def.label}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{widget.id}</p>
                    </div>
                    {isCustom && (
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full">
                        مخصص
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">
                      #{index + 1}
                    </span>
                    {isCustom && (
                      <button
                        onClick={() => removeCustomWidget(selectedDashboardKey, widget.id)}
                        className="w-8 h-8 rounded-[var(--border-radius-base)] border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all"
                        title="حذف الـ Widget"
                      >
                        <span className="material-icons-round text-sm">delete</span>
                      </button>
                    )}
                    <button
                      onClick={() => toggleWidget(selectedDashboardKey, widget.id)}
                      className={`w-10 h-6 rounded-full transition-all relative shrink-0 ${
                        widget.visible
                          ? 'bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-[var(--color-card)] rounded-full shadow transition-all ${
                          widget.visible ? 'right-0.5' : 'right-[18px]'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="إنشاء Widget جديد" subtitle="Builder بسيط لعنصر Dashboard جديد">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">اللوحة المستهدفة</label>
                <select
                  value={widgetForm.dashboardKey}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, dashboardKey: e.target.value }))}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  {Object.entries(DASHBOARD_LABELS).map(([dashboardKey, label]) => (
                    <option key={dashboardKey} value={dashboardKey}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">نوع الـ Widget</label>
                <select
                  value={widgetForm.type}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, type: e.target.value as CustomWidgetType }))}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  {CUSTOM_WIDGET_TYPES.map((typeDef) => (
                    <option key={typeDef.type} value={typeDef.type}>{typeDef.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">الاسم</label>
                <input
                  type="text"
                  value={widgetForm.label}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="اسم الـ Widget"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">الأيقونة</label>
                <input
                  type="text"
                  value={widgetForm.icon}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, icon: e.target.value }))}
                  placeholder="widgets"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">الصلاحية (اختياري)</label>
                <input
                  type="text"
                  value={widgetForm.permission}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, permission: e.target.value }))}
                  placeholder="مثال: reports.view"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">الوصف/النص</label>
                <input
                  type="text"
                  value={widgetForm.description}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="وصف قصير"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              {widgetForm.type === 'kpi' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">القيمة</label>
                    <input
                      type="text"
                      value={widgetForm.value}
                      onChange={(e) => setWidgetForm((prev) => ({ ...prev, value: e.target.value }))}
                      placeholder="مثال: 1250"
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">الوحدة</label>
                    <input
                      type="text"
                      value={widgetForm.unit}
                      onChange={(e) => setWidgetForm((prev) => ({ ...prev, unit: e.target.value }))}
                      placeholder="وحدة"
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </>
              )}
              {widgetForm.type === 'quick_link' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">المسار</label>
                  <input
                    type="text"
                    value={widgetForm.target}
                    onChange={(e) => setWidgetForm((prev) => ({ ...prev, target: e.target.value }))}
                    placeholder="/reports"
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button variant="outline" onClick={addCustomWidget}>
                <span className="material-icons-round text-sm">add</span>
                إضافة Widget
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Alert Rules ──────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alertRules' && isAdmin && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">قواعد التنبيهات</h3>
              <p className="page-subtitle">حدد الحدود التي يتم عندها إنشاء تنبيهات في لوحات التحكم.</p>
            </div>
            <Button onClick={() => handleSave('alerts')} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              حفظ التغييرات
            </Button>
          </div>

          <Card>
            <div className="space-y-6">
              {ALERT_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary">{field.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">{field.label}</p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">{field.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      step={field.key === 'planDelayDays' ? 1 : 0.5}
                      className="w-24 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localAlerts[field.key]}
                      onChange={(e) =>
                        setLocalAlerts((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                      }
                    />
                    <span className="text-sm font-bold text-[var(--color-text-muted)] w-10">{field.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="القيم الافتراضية">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {ALERT_FIELDS.map((field) => (
                <div key={field.key} className="text-center p-3 bg-[#f8f9fa] rounded-[var(--border-radius-lg)]">
                  <p className="text-xs font-bold text-[var(--color-text-muted)] mb-1">{field.label}</p>
                  <p className="text-lg font-bold text-[var(--color-text-muted)]">
                    {DEFAULT_ALERT_SETTINGS[field.key]} {field.unit}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setLocalAlerts({ ...DEFAULT_ALERT_SETTINGS })}
              className="mt-4 text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-icons-round text-sm">restart_alt</span>
              إعادة تعيين للقيم الافتراضية
            </button>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: KPI Thresholds ───────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'kpiThresholds' && isAdmin && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">حدود مؤشرات الأداء</h3>
              <p className="page-subtitle">حدد قيم "جيد" و"تحذير" لكل مؤشر. تُستخدم لتلوين المؤشرات في لوحات التحكم.</p>
            </div>
            <Button onClick={() => handleSave('kpis')} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              حفظ التغييرات
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">المؤشر</th>
                    <th className="erp-th text-center">الوحدة</th>
                    <th className="erp-th text-center">المقياس</th>
                    <th className="erp-th text-center">
                      <span className="text-emerald-600">جيد</span>
                    </th>
                    <th className="erp-th text-center">
                      <span className="text-amber-600">تحذير</span>
                    </th>
                    <th className="erp-th text-center">
                      <span className="text-rose-600">خطر</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {KPI_DEFINITIONS.map((kpi) => {
                    const threshold = localKPIs[kpi.key] || DEFAULT_KPI_THRESHOLDS[kpi.key];
                    return (
                      <tr key={kpi.key} className="hover:bg-[#f8f9fa] transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <span className="material-icons-round text-primary">{kpi.icon}</span>
                            <span className="font-bold text-[var(--color-text)]">{kpi.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center text-[var(--color-text-muted)] font-bold">{kpi.unit}</td>
                        <td className="py-4 px-4 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            kpi.invertedScale
                              ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700'
                              : 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400'
                          }`}>
                            {kpi.invertedScale ? 'أقل = أفضل' : 'أعلى = أفضل'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="w-20 border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={threshold.good}
                            onChange={(e) =>
                              setLocalKPIs((prev) => ({
                                ...prev,
                                [kpi.key]: { ...prev[kpi.key], good: Number(e.target.value) },
                              }))
                            }
                          />
                        </td>
                        <td className="py-4 px-4 text-center">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="w-20 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                            value={threshold.warning}
                            onChange={(e) =>
                              setLocalKPIs((prev) => ({
                                ...prev,
                                [kpi.key]: { ...prev[kpi.key], warning: Number(e.target.value) },
                              }))
                            }
                          />
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-xs font-bold text-slate-400">
                            {kpi.invertedScale
                              ? `> ${threshold.warning}${kpi.unit}`
                              : `< ${threshold.warning}${kpi.unit}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Visual preview */}
          <Card title="معاينة الألوان">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {KPI_DEFINITIONS.map((kpi) => {
                const threshold = localKPIs[kpi.key] || DEFAULT_KPI_THRESHOLDS[kpi.key];
                return (
                  <div key={kpi.key} className="space-y-2">
                    <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">{kpi.label}</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-emerald-700">
                          {kpi.invertedScale ? `≤ ${threshold.good}${kpi.unit}` : `≥ ${threshold.good}${kpi.unit}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-amber-50 dark:bg-amber-900/10 border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-xs font-bold text-amber-700">
                          {kpi.invertedScale
                            ? `${threshold.good} — ${threshold.warning}${kpi.unit}`
                            : `${threshold.warning} — ${threshold.good}${kpi.unit}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-rose-50 dark:bg-rose-900/10 border border-rose-200">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span className="text-xs font-bold text-rose-700">
                          {kpi.invertedScale ? `> ${threshold.warning}${kpi.unit}` : `< ${threshold.warning}${kpi.unit}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setLocalKPIs({ ...DEFAULT_KPI_THRESHOLDS })}
              className="mt-6 text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-icons-round text-sm">restart_alt</span>
              إعادة تعيين للقيم الافتراضية
            </button>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Print Template Settings ───────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'printTemplate' && isAdmin && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">إعدادات قالب الطباعة</h3>
              <p className="page-subtitle">تخصيص مظهر التقارير المطبوعة — الشعار، الألوان، حجم الورق والمزيد.</p>
            </div>
            <div className="erp-page-actions">
              <Button
                onClick={() => setShowPreview(true)}
                className="!bg-[#f0f2f5] dark:!bg-slate-800 !text-[var(--color-text)] dark:!text-[var(--color-text-muted)] hover:!bg-slate-200 dark:hover:!bg-slate-700"
              >
                <span className="material-icons-round text-sm">visibility</span>
                معاينة
              </Button>
              <Button onClick={() => handleSave('print')} disabled={saving}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">save</span>
                حفظ التغييرات
              </Button>
            </div>
          </div>

          {/* Logo & Header */}
          <Card title="الشعار والعنوان">
            <div className="space-y-6">
              {/* Logo Upload */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">image</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">شعار الشركة</p>
                    <p className="text-xs text-slate-400">يظهر أعلى التقرير المطبوع — PNG أو JPG</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {localPrint.logoUrl && (
                    <img
                      src={localPrint.logoUrl}
                      alt="logo"
                      className="w-12 h-12 rounded-[var(--border-radius-base)] object-contain border border-[var(--color-border)] bg-[var(--color-card)]"
                    />
                  )}
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploadingLogo ? (
                      <span className="material-icons-round animate-spin text-sm">refresh</span>
                    ) : (
                      <span className="material-icons-round text-sm">upload</span>
                    )}
                    {localPrint.logoUrl ? 'تغيير' : 'رفع'}
                  </button>
                  {localPrint.logoUrl && (
                    <button
                      onClick={() => setLocalPrint((p) => ({ ...p, logoUrl: '' }))}
                      className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100 transition-all"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Header Text */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">title</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">عنوان الرأس</p>
                    <p className="text-xs text-slate-400">اسم الشركة / المؤسسة في أعلى التقرير</p>
                  </div>
                </div>
                <input
                  type="text"
                  className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={localPrint.headerText}
                  onChange={(e) => setLocalPrint((p) => ({ ...p, headerText: e.target.value }))}
                />
              </div>

              {/* Footer Text */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">short_text</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">نص التذييل</p>
                    <p className="text-xs text-slate-400">يظهر أسفل التقرير المطبوع</p>
                  </div>
                </div>
                <input
                  type="text"
                  className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={localPrint.footerText}
                  onChange={(e) => setLocalPrint((p) => ({ ...p, footerText: e.target.value }))}
                />
              </div>

              {/* Primary Color */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">palette</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">اللون الرئيسي</p>
                    <p className="text-xs text-slate-400">لون العناوين والحدود في التقرير</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="color"
                    className="w-10 h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] cursor-pointer"
                    value={localPrint.primaryColor}
                    onChange={(e) => setLocalPrint((p) => ({ ...p, primaryColor: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="w-28 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-mono font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-center"
                    value={localPrint.primaryColor}
                    onChange={(e) => setLocalPrint((p) => ({ ...p, primaryColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Paper & Print Settings */}
          <Card title="الورق والطباعة">
            <div className="space-y-6">
              {/* Paper Size */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">description</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">حجم الورق</p>
                    <p className="text-xs text-slate-400">A4 / A5 / حراري</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {([['a4', 'A4'], ['a5', 'A5'], ['thermal', 'حراري']] as [PaperSize, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setLocalPrint((p) => ({ ...p, paperSize: val }))}
                      className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all ${
                        localPrint.paperSize === val
                          ? 'bg-primary text-white shadow-primary/20'
                          : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">crop_rotate</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">اتجاه الورق</p>
                    <p className="text-xs text-slate-400">عمودي أو أفقي</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {([['portrait', 'عمودي'], ['landscape', 'أفقي']] as [PaperOrientation, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setLocalPrint((p) => ({ ...p, orientation: val }))}
                      className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                        localPrint.orientation === val
                          ? 'bg-primary text-white shadow-primary/20'
                          : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                      }`}
                    >
                      <span className="material-icons-round text-sm">{val === 'portrait' ? 'stay_current_portrait' : 'stay_current_landscape'}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Copies */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">content_copy</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">عدد النسخ</p>
                    <p className="text-xs text-slate-400">عدد النسخ الافتراضي عند الطباعة</p>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-24 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={localPrint.copies}
                  onChange={(e) => setLocalPrint((p) => ({ ...p, copies: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                />
              </div>

              {/* Page Margins */}
              <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">border_outer</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">هوامش الصفحة (mm)</p>
                    <p className="text-xs text-slate-400">تُطبَّق تلقائيًا على كل صفحات الطباعة في النظام</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    { key: 'marginTopMm' as const, label: 'أعلى' },
                    { key: 'marginRightMm' as const, label: 'يمين' },
                    { key: 'marginBottomMm' as const, label: 'أسفل' },
                    { key: 'marginLeftMm' as const, label: 'يسار' },
                  ]).map((field) => (
                    <label key={field.key} className="space-y-1">
                      <span className="text-xs font-bold text-slate-500">{field.label}</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        value={localPrint[field.key]}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          const safe = Number.isFinite(next) ? Math.max(0, Math.min(30, next)) : 0;
                          setLocalPrint((p) => ({ ...p, [field.key]: safe }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Decimal Places */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">decimal_increase</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">المنازل العشرية</p>
                    <p className="text-xs text-slate-400">عدد الخانات بعد الفاصلة في الأرقام</p>
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={4}
                  className="w-24 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={localPrint.decimalPlaces}
                  onChange={(e) => setLocalPrint((p) => ({ ...p, decimalPlaces: Math.max(0, Math.min(4, Number(e.target.value))) }))}
                />
              </div>
            </div>
          </Card>

          {/* Toggle Settings */}
          <Card title="عناصر التقرير">
            <div className="space-y-3">
              {([
                { key: 'showWaste' as const, label: 'عرض الهالك', icon: 'delete_sweep', desc: 'إظهار عمود ونسبة الهالك في التقرير' },
                { key: 'showEmployee' as const, label: 'عرض الموظف', icon: 'person', desc: 'إظهار اسم الموظف في التقرير' },
                { key: 'showCosts' as const, label: 'عرض التكاليف', icon: 'payments', desc: 'إظهار تكاليف المنتج والتكاليف الصناعية في الطباعة' },
                { key: 'showWorkOrder' as const, label: 'عرض أمر الشغل', icon: 'assignment', desc: 'إظهار رقم أمر الشغل وبياناته في التقرير' },
                { key: 'showSellingPrice' as const, label: 'عرض سعر البيع', icon: 'sell', desc: 'إظهار سعر البيع وهامش الربح في طباعة المنتج' },
                { key: 'printBackground' as const, label: 'طباعة الألوان والخلفيات', icon: 'format_color_fill', desc: 'المحافظة على ألوان التصميم أثناء الطباعة' },
                { key: 'showQRCode' as const, label: 'عرض رمز QR', icon: 'qr_code', desc: 'إظهار رمز QR للتحقق من صحة التقرير' },
              ]).map((toggle) => (
                <div
                  key={toggle.key}
                  className={`flex items-center gap-3 p-4 rounded-[var(--border-radius-lg)] border transition-all ${
                    localPrint[toggle.key]
                      ? 'bg-[var(--color-card)] border-[var(--color-border)]'
                      : 'bg-[#f8f9fa]/50 border-[var(--color-border)] opacity-60'
                  }`}
                >
                  <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">{toggle.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">{toggle.label}</p>
                    <p className="text-xs text-slate-400">{toggle.desc}</p>
                  </div>
                  <button
                    onClick={() => setLocalPrint((p) => ({ ...p, [toggle.key]: !p[toggle.key] }))}
                    className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${
                      localPrint[toggle.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                        localPrint[toggle.key] ? 'right-0.5' : 'right-[22px]'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* Reset to defaults */}
          <div className="flex justify-end">
            <button
              onClick={() => setLocalPrint({ ...DEFAULT_PRINT_TEMPLATE })}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-icons-round text-sm">restart_alt</span>
              إعادة تعيين للقيم الافتراضية
            </button>
          </div>

          {/* ── Preview Modal ── */}
          {showPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                  <h3 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                    <span className="material-icons-round text-primary">visibility</span>
                    معاينة التقرير المطبوع
                  </h3>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="w-9 h-9 rounded-[var(--border-radius-base)] bg-[#f0f2f5] flex items-center justify-center hover:bg-[#e8eaed] transition-all"
                  >
                    <span className="material-icons-round text-slate-500">close</span>
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-[#f0f2f5] dark:bg-slate-950 flex justify-center">
                  <div className="shadow-2xl">
                    <ProductionReportPrint
                      title="تقرير الإنتاج اليومي — معاينة"
                      subtitle="بيانات تجريبية للمعاينة فقط"
                      rows={SAMPLE_ROWS}
                      totals={computePrintTotals(SAMPLE_ROWS)}
                      printSettings={localPrint}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Export & Import ─────────────────────────────────────────  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'exportImport' && isAdmin && (
        <>
          <div className="erp-page-head">
            <div>
              <h3 className="text-lg font-bold">التصدير والاستيراد</h3>
              <p className="page-subtitle">تحكم مركزي في إظهار/إخفاء أزرار الاستيراد والتصدير وشكلها لكل صفحة.</p>
            </div>
            <Button onClick={() => handleSave('exportImport')} disabled={saving}>
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              حفظ إعدادات التصدير/الاستيراد
            </Button>
          </div>

          <Card title="تحكم الصفحات">
            <div className="space-y-3">
              {EXPORT_IMPORT_PAGE_REGISTRY.map((page) => {
                const control = getExportImportPageControl(localExportImport, page.key);
                return (
                  <div
                    key={page.key}
                    className="p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa]/60/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--color-text)]">{page.label}</h4>
                        <p className="text-xs text-[var(--color-text-muted)] font-mono">{page.path}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-[var(--color-text)]">زر التصدير</p>
                          <button
                            onClick={() => updateExportImportControl(page.key, { exportEnabled: !control.exportEnabled })}
                            className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${
                              control.exportEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                                control.exportEnabled ? 'right-0.5' : 'right-[22px]'
                              }`}
                            />
                          </button>
                        </div>
                        <select
                          value={control.exportVariant}
                          onChange={(e) => updateExportImportControl(page.key, { exportVariant: e.target.value as 'primary' | 'secondary' | 'outline' })}
                          className="w-full bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] py-2.5 px-3 text-sm font-bold outline-none"
                        >
                          <option value="primary">شكل رئيسي</option>
                          <option value="secondary">شكل ثانوي</option>
                          <option value="outline">شكل حدود فقط</option>
                        </select>
                      </div>

                      <div className="p-3 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-[var(--color-text)]">زر الاستيراد</p>
                          <button
                            onClick={() => updateExportImportControl(page.key, { importEnabled: !control.importEnabled })}
                            className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${
                              control.importEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                                control.importEnabled ? 'right-0.5' : 'right-[22px]'
                              }`}
                            />
                          </button>
                        </div>
                        <select
                          value={control.importVariant}
                          onChange={(e) => updateExportImportControl(page.key, { importVariant: e.target.value as 'primary' | 'secondary' | 'outline' })}
                          className="w-full bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] py-2.5 px-3 text-sm font-bold outline-none"
                        >
                          <option value="primary">شكل رئيسي</option>
                          <option value="secondary">شكل ثانوي</option>
                          <option value="outline">شكل حدود فقط</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ─── Export Section ─── */}
          <Card title="التصدير (Excel Export)">
            <div className="space-y-3">
              {[
                { section: 'تقارير الإنتاج', page: 'صفحة التقارير', path: '/reports', icon: 'description', color: 'text-blue-500', features: ['تصدير التقارير بالتاريخ والخط والمنتج والموظف', 'تكلفة الوحدة (حسب الصلاحية)', 'بيانات أمر الشغل (الكمية والعمالة المخططة)', 'صف إجمالي بالمجاميع والمتوسطات'] },
                { section: 'أوامر الشغل', page: 'صفحة التقارير / أوامر الشغل', path: '/work-orders', icon: 'assignment', color: 'text-amber-500', features: ['رقم الأمر، المنتج، الخط، المشرف', 'الكمية المطلوبة / المنتجة / المتبقية', 'عدد العمالة، التكلفة المقدرة والفعلية', 'الحالة والملاحظات'] },
                { section: 'المنتجات (تخصيص)', page: 'صفحة المنتجات', path: '/products', icon: 'inventory_2', color: 'text-emerald-500', features: ['الكود والاسم والفئة', 'بيانات المخزون (افتتاحي / إنتاج / هالك / حالي)', 'تكاليف المنتج (صينية، مواد خام، تغليف)', 'تكاليف صناعية (م. وغ.م)', 'سعر البيع وهامش الربح', 'مودال تخصيص الأعمدة قبل التصدير'] },
                { section: 'منتج واحد (تفصيلي)', page: 'صفحة تفاصيل المنتج', path: '/products', icon: 'receipt_long', color: 'text-teal-500', features: ['شيت بيانات المنتج الأساسية', 'شيت تفصيل التكاليف مع سعر البيع وهامش الربح', 'شيت المواد الخام المستخدمة', 'شيت التكلفة حسب خط الإنتاج'] },
                { section: 'الموظفين', page: 'صفحة الموظفين', path: '/employees', icon: 'groups', color: 'text-purple-500', features: ['الكود والاسم والقسم والوظيفة', 'نوع التوظيف والمستوى والراتب', 'الوردية والبريد والحالة والصلاحيات'] },
                { section: 'تقارير مشرف', page: 'صفحة تفاصيل المشرف', path: '/supervisors', icon: 'person', color: 'text-orange-500', features: ['تقارير الإنتاج الخاصة بالمشرف', 'تكلفة الوحدة (حسب الصلاحية)', 'صف إجمالي بالمجاميع'] },
                { section: 'ملخص المنتجات', page: 'لوحة تحكم المصنع', path: '/factory-dashboard', icon: 'summarize', color: 'text-indigo-500', features: ['اسم المنتج والكود والكمية', 'متوسط تكلفة الوحدة (حسب الصلاحية)'] },
                { section: 'بيانات الموارد البشرية', page: 'وحدة HR', path: '/hr', icon: 'badge', color: 'text-rose-500', features: ['كشوف المرتبات والحضور', 'الإجازات والقروض', 'تصدير عام لأي بيانات HR'] },
              ].map((item) => (
                <div key={item.section} className="p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] hover:bg-[#f8f9fa]/30 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-[#f0f2f5] flex items-center justify-center shrink-0 mt-0.5">
                      <span className={`material-icons-round ${item.color}`}>{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-[var(--color-text)]">{item.section}</h4>
                        <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">{item.page}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {item.features.map((f, i) => (
                          <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                            <span className="material-icons-round text-[10px] text-emerald-400">check</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ─── Import Section ─── */}
          <Card title="الاستيراد (Excel Import)">
            <div className="space-y-3">
              {[
                { section: 'استيراد تقارير الإنتاج', page: 'صفحة التقارير', path: '/reports', icon: 'upload_file', color: 'text-blue-500', features: ['رفع ملف Excel يحتوي على تقارير الإنتاج', 'مطابقة تلقائية للخط والمنتج والموظف (بالاسم أو الكود)', 'كشف التكرار مع التقارير الموجودة', 'معاينة البيانات قبل الحفظ مع عرض الأخطاء', 'تحميل نموذج Excel فارغ مع قوائم الاختيار'] },
                { section: 'استيراد المنتجات', page: 'صفحة المنتجات', path: '/products', icon: 'inventory_2', color: 'text-emerald-500', features: ['رفع ملف Excel بأسماء وأكواد المنتجات', 'تكاليف التعبئة والتغليف', 'سعر البيع', 'كشف التكرار بالاسم والكود', 'معاينة وتحقق قبل الحفظ'] },
                { section: 'استيراد الموظفين', page: 'وحدة HR', path: '/hr/import', icon: 'person_add', color: 'text-purple-500', features: ['رفع بيانات الموظفين من Excel', 'مطابقة الأقسام والوظائف والورديات', 'بيانات الراتب ونوع التوظيف'] },
              ].map((item) => (
                <div key={item.section} className="p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] hover:bg-[#f8f9fa]/30 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-[#f0f2f5] flex items-center justify-center shrink-0 mt-0.5">
                      <span className={`material-icons-round ${item.color}`}>{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-[var(--color-text)]">{item.section}</h4>
                        <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">{item.page}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {item.features.map((f, i) => (
                          <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                            <span className="material-icons-round text-[10px] text-emerald-400">check</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ─── Templates Section ─── */}
          <Card title="القوالب (Templates)">
            <p className="text-sm text-[var(--color-text-muted)] mb-4">يمكنك تحميل نماذج Excel فارغة مع أسماء الأعمدة الصحيحة وقوائم الاختيار لتسهيل عملية الاستيراد.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'قالب تقارير الإنتاج', desc: 'يتضمن أسماء الخطوط والمنتجات والموظفين', icon: 'description', page: 'صفحة التقارير → تحميل قالب' },
                { label: 'قالب المنتجات', desc: 'يتضمن أعمدة التكلفة وسعر البيع', icon: 'inventory_2', page: 'صفحة المنتجات → تحميل نموذج' },
                { label: 'قالب الموظفين', desc: 'يتضمن الأقسام والوظائف والورديات', icon: 'person_add', page: 'HR → استيراد الموظفين' },
              ].map((t) => (
                <div key={t.label} className="p-4 rounded-[var(--border-radius-lg)] border border-dashed border-[var(--color-border)] bg-[#f8f9fa]/50/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-icons-round text-primary text-base">{t.icon}</span>
                    <h4 className="text-sm font-bold text-[var(--color-text)]">{t.label}</h4>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">{t.desc}</p>
                  <p className="text-[10px] font-bold text-primary">{t.page}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ─── Notes ─── */}
          <div className="p-4 rounded-[var(--border-radius-lg)] bg-amber-50 dark:bg-amber-900/10 border border-amber-200 flex items-start gap-3">
            <span className="material-icons-round text-amber-500 mt-0.5">info</span>
            <div className="text-sm text-amber-700">
              <p className="font-bold mb-1">ملاحظات هامة</p>
              <ul className="space-y-1 text-xs text-amber-600">
                <li>• التكاليف تظهر في التصدير فقط للمستخدمين الذين لديهم صلاحية عرض التكاليف</li>
                <li>• عمليات الاستيراد تعرض معاينة للبيانات قبل الحفظ مع إظهار الأخطاء والتحذيرات</li>
                <li>• يتم كشف البيانات المكررة تلقائياً عند الاستيراد</li>
                <li>• سعر البيع وهامش الربح متاحين في تصدير المنتجات وتصدير المنتج الواحد</li>
              </ul>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB: Backup & Restore ──────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'backup' && isAdmin && (
        <>
          {/* Backup status message */}
          {backupMessage && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
              backupMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 dark:bg-rose-900/10 text-rose-700 border border-rose-200'
            }`}>
              <span className="material-icons-round text-lg">
                {backupMessage.type === 'success' ? 'check_circle' : 'error'}
              </span>
              {backupMessage.text}
              <button onClick={() => setBackupMessage(null)} className="mr-auto">
                <span className="material-icons-round text-sm opacity-60 hover:opacity-100">close</span>
              </button>
            </div>
          )}

          {/* Progress bar */}
          {backupProgress && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-[var(--border-radius-lg)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-blue-700 flex items-center gap-2">
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                  {backupProgress.step}
                </span>
                <span className="text-sm font-bold text-blue-600">{backupProgress.percent}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${backupProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Firebase Usage */}
          <Card title="استهلاك Firebase (تقديري)">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button onClick={loadFirebaseUsage} disabled={firebaseUsageLoading || backupLoading}>
                  {firebaseUsageLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  <span className="material-icons-round text-sm">monitoring</span>
                  تحديث الاستهلاك
                </Button>
                {firebaseUsage?.generatedAt && (
                  <p className="text-xs text-slate-400">
                    آخر تحديث: {new Date(firebaseUsage.generatedAt).toLocaleString('ar-EG')}
                  </p>
                )}
                {projectId && (
                  <a
                    href={`https://console.firebase.google.com/project/${projectId}/usage`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    فتح Firebase Console Usage
                  </a>
                )}
              </div>

              {firebaseUsageError && (
                <div className="px-4 py-3 rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50 dark:bg-rose-900/10 text-rose-700 text-sm font-bold">
                  {firebaseUsageError}
                </div>
              )}

              {firebaseUsage && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa]/60">
                      <p className="text-[11px] text-slate-400">إجمالي المستندات</p>
                      <p className="text-lg font-bold text-[var(--color-text)]">{firebaseUsage.totalDocuments.toLocaleString('ar-EG')}</p>
                    </div>
                    <div className="p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa]/60">
                      <p className="text-[11px] text-slate-400">الحجم التقديري الحالي</p>
                      <p className="text-lg font-bold text-[var(--color-text)]">{formatBytes(firebaseUsage.estimatedBytes)}</p>
                    </div>
                    <div className="p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa]/60">
                      <p className="text-[11px] text-slate-400">المتبقي من Firestore المجاني</p>
                      <p className="text-lg font-bold text-emerald-600">{formatBytes(firestoreRemainingBytes)}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-slate-500">استهلاك مساحة Firestore المجانية (1 GiB)</p>
                      <p className="text-xs font-bold text-[var(--color-text-muted)]">{firestoreUsagePercent.toFixed(1)}%</p>
                    </div>
                    <div className="w-full h-2.5 bg-[#f0f2f5] rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${firestoreUsagePercent}%` }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 dark:bg-amber-900/10 text-xs text-amber-700 space-y-1">
                    <p className="font-bold">حدود Spark اليومية (Firestore)</p>
                    <p>Reads: {FIRESTORE_SPARK_DAILY.reads.toLocaleString('ar-EG')} / اليوم</p>
                    <p>Writes: {FIRESTORE_SPARK_DAILY.writes.toLocaleString('ar-EG')} / اليوم</p>
                    <p>Deletes: {FIRESTORE_SPARK_DAILY.deletes.toLocaleString('ar-EG')} / اليوم</p>
                    <p className="pt-1">مهم: العدادات اليومية الفعلية (Reads/Writes/Deletes) لا يتيحها Firebase Web SDK مباشرة، تظهر بدقة من Firebase Console.</p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* ── Export Section ──────────────────────────────────────────────── */}
          <Card title="تصدير نسخة احتياطية">
            <div className="space-y-4">
              {/* Full Backup */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary text-xl">cloud_download</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">نسخة احتياطية كاملة</p>
                    <p className="text-xs text-slate-400">تصدير جميع البيانات — المنتجات، الخطوط، التقارير، أوامر الشغل، الإشعارات، التكاليف، الخامات، تعيينات العمال، الموارد البشرية، المركبات، والإعدادات</p>
                  </div>
                </div>
                <Button onClick={handleExportFull} disabled={backupLoading}>
                  {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  <span className="material-icons-round text-sm">download</span>
                  تصدير كامل
                </Button>
              </div>

              {/* Monthly Backup */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-amber-500/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-amber-600 text-xl">date_range</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">نسخة شهرية</p>
                    <p className="text-xs text-slate-400">تصدير تقارير الإنتاج، أوامر الشغل، تعيينات العمال، تكاليف الإنتاج الشهرية، الحضور، والإجازات لشهر محدد</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="month"
                    className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                  <Button onClick={handleExportMonthly} disabled={backupLoading}>
                    {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                    <span className="material-icons-round text-sm">download</span>
                    تصدير
                  </Button>
                </div>
              </div>

              {/* Settings Only */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-violet-500/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-violet-600 text-xl">tune</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]">الإعدادات فقط</p>
                    <p className="text-xs text-slate-400">تصدير إعدادات النظام، الأدوار، إعدادات العمالة، خامات المنتجات، وإعدادات الموارد البشرية</p>
                  </div>
                </div>
                <Button onClick={handleExportSettings} disabled={backupLoading}>
                  {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  <span className="material-icons-round text-sm">download</span>
                  تصدير الإعدادات
                </Button>
              </div>
            </div>
          </Card>

          {/* ── Collections Summary ────────────────────────────────────────── */}
          <Card title="المجموعات المشمولة في النسخة الكاملة">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { title: 'الإنتاج', icon: 'factory', color: 'text-primary', items: ['المنتجات', 'خطوط الإنتاج', 'تقارير الإنتاج', 'خطط الإنتاج', 'حالة الخطوط', 'إعدادات خط المنتج'] },
                { title: 'أوامر الشغل والإشعارات', icon: 'assignment', color: 'text-amber-600', items: ['أوامر الشغل', 'الإشعارات', 'تعيينات العمال على الخطوط', 'أحداث المسح'] },
                { title: 'المخزون والمستودعات', icon: 'inventory_2', color: 'text-cyan-600', items: ['المستودعات', 'الخامات', 'أرصدة المخزون', 'حركات المخزون', 'جرد المخزون', 'طلبات تحويل المخزون'] },
                { title: 'التكاليف والخامات', icon: 'payments', color: 'text-emerald-600', items: ['خامات المنتجات', 'تكاليف الإنتاج الشهرية', 'مراكز التكلفة', 'قيم مراكز التكلفة', 'توزيعات التكلفة', 'إعدادات العمالة'] },
                { title: 'النظام', icon: 'settings', color: 'text-blue-600', items: ['إعدادات النظام', 'الأدوار والصلاحيات', 'المستخدمين', 'سجل النشاط'] },
                { title: 'الموارد البشرية', icon: 'groups', color: 'text-violet-600', items: ['الموظفين', 'الأقسام', 'المسميات الوظيفية', 'الورديات', 'إعدادات HR', 'الحضور والانصراف', 'الإجازات', 'القروض', 'البدلات', 'الاستقطاعات', 'المركبات', 'قواعد الجزاءات', 'قواعد التأخير', 'أنواع البدلات'] },
                { title: 'الرواتب والموافقات', icon: 'account_balance', color: 'text-rose-600', items: ['أشهر الرواتب', 'سجلات الرواتب', 'تدقيق الرواتب', 'ملخص تكلفة الرواتب', 'طلبات الموافقة', 'إعدادات الموافقة', 'التفويضات', 'تدقيق الموافقات'] },
                { title: 'الجودة', icon: 'verified', color: 'text-fuchsia-600', items: ['إعدادات الجودة', 'قاموس أسباب الجودة', 'تعيينات الجودة', 'فحوصات الجودة', 'عيوب الجودة', 'أوامر إعادة العمل', 'إجراءات CAPA', 'سجلات طباعة الجودة'] },
                { title: 'التدقيق', icon: 'history', color: 'text-slate-600', items: ['سجل تدقيق النظام'] },
              ].map((group) => (
                <div key={group.title} className="p-3 bg-[#f8f9fa]/50 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`material-icons-round text-sm ${group.color}`}>{group.icon}</span>
                    <span className="text-xs font-bold text-[var(--color-text)]">{group.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-[var(--color-text-muted)] mr-auto">{group.items.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <span key={item} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]">{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Import Section ──────────────────────────────────────────────── */}
          <Card title="استعادة من نسخة احتياطية">
            <div className="space-y-6">
              {/* File Upload */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-blue-500/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-blue-600 text-xl">upload_file</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)]">
                        {importFileName || 'اختر ملف النسخة الاحتياطية'}
                      </p>
                      <p className="text-xs text-slate-400">ملف JSON تم تصديره من النظام</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <button
                      onClick={() => importInputRef.current?.click()}
                      disabled={backupLoading}
                      className="px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      <span className="material-icons-round text-sm">folder_open</span>
                      اختيار ملف
                    </button>
                    {importFileName && (
                      <button
                        onClick={() => {
                          setImportFile(null);
                          setImportFileName('');
                          setImportValidation(null);
                        }}
                        className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100 transition-all"
                      >
                        <span className="material-icons-round text-sm">close</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Validation result */}
                {importValidation && (
                  <div className={`flex items-start gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
                    importValidation.valid
                      ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-900/10 text-rose-700 border border-rose-200'
                  }`}>
                    <span className="material-icons-round text-lg mt-0.5">
                      {importValidation.valid ? 'verified' : 'error'}
                    </span>
                    {importValidation.valid && importFile ? (
                      <div className="flex-1">
                        <p className="mb-2">ملف صالح — جاهز للاستعادة</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                            <p className="text-[10px] text-emerald-600/70 mb-0.5">النوع</p>
                            <p className="text-xs font-black">
                              {importFile.metadata.type === 'full' ? 'كاملة' : importFile.metadata.type === 'monthly' ? 'شهرية' : 'إعدادات'}
                            </p>
                          </div>
                          <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                            <p className="text-[10px] text-emerald-600/70 mb-0.5">المستندات</p>
                            <p className="text-xs font-black">{importFile.metadata.totalDocuments}</p>
                          </div>
                          <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                            <p className="text-[10px] text-emerald-600/70 mb-0.5">الإصدار</p>
                            <p className="text-xs font-black">{importFile.metadata.version}</p>
                          </div>
                          <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                            <p className="text-[10px] text-emerald-600/70 mb-0.5">التاريخ</p>
                            <p className="text-xs font-black">{new Date(importFile.metadata.createdAt).toLocaleDateString('ar-EG')}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {importFile.metadata.collectionsIncluded.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/50/50">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span>{importValidation.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Restore Mode Selection */}
              {importFile && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-[var(--color-text)]">وضع الاستعادة</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {RESTORE_MODES.map((mode) => {
                      const selected = restoreMode === mode.value;
                      const activeStyles: Record<string, string> = {
                        emerald: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10',
                        amber: 'border-amber-500 bg-amber-50 dark:bg-amber-900/10',
                        rose: 'border-rose-500 bg-rose-50 dark:bg-rose-900/10',
                      };
                      const iconStyles: Record<string, string> = {
                        emerald: 'text-emerald-600',
                        amber: 'text-amber-600',
                        rose: 'text-rose-600',
                      };
                      const labelStyles: Record<string, string> = {
                        emerald: 'text-emerald-700',
                        amber: 'text-amber-700',
                        rose: 'text-rose-700',
                      };
                      return (
                        <button
                          key={mode.value}
                          onClick={() => setRestoreMode(mode.value)}
                          className={`p-4 rounded-[var(--border-radius-lg)] border-2 text-right transition-all ${
                            selected
                              ? activeStyles[mode.color]
                              : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`material-icons-round ${
                              selected ? iconStyles[mode.color] : 'text-slate-400'
                            }`}>
                              {mode.icon}
                            </span>
                            <span className={`text-sm font-bold ${
                              selected ? labelStyles[mode.color] : 'text-[var(--color-text)]'
                            }`}>
                              {mode.label}
                            </span>
                            {selected && (
                              <span className={`material-icons-round ${iconStyles[mode.color]} mr-auto text-lg`}>check_circle</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{mode.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Warning for destructive modes */}
                  {restoreMode !== 'merge' && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
                      restoreMode === 'full_reset'
                        ? 'bg-rose-50 dark:bg-rose-900/10 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 border border-amber-200'
                    }`}>
                      <span className="material-icons-round text-lg">warning</span>
                      {restoreMode === 'full_reset'
                        ? 'تحذير: سيتم حذف جميع البيانات الحالية واستبدالها. سيتم إنشاء نسخة احتياطية تلقائية أولاً.'
                        : 'تحذير: سيتم استبدال المجموعات المشمولة. سيتم إنشاء نسخة احتياطية تلقائية أولاً.'}
                    </div>
                  )}

                  {/* Restore Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setShowConfirmRestore(true)}
                      disabled={backupLoading}
                      className={restoreMode === 'full_reset' ? '!bg-rose-600 hover:!bg-rose-700' : ''}
                    >
                      <span className="material-icons-round text-sm">restore</span>
                      بدء الاستعادة
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── Safety Info ──────────────────────────────────────────────────── */}
          <Card title="قواعد الأمان">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-lg)] border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-icons-round text-emerald-600">shield</span>
                  <span className="text-sm font-bold text-emerald-700">نسخ تلقائي</span>
                </div>
                <p className="text-xs text-emerald-600/80">يتم إنشاء نسخة احتياطية كاملة تلقائياً قبل أي عملية استعادة</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-[var(--border-radius-lg)] border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-icons-round text-blue-600">verified</span>
                  <span className="text-sm font-bold text-blue-700">فحص الملف</span>
                </div>
                <p className="text-xs text-blue-600/80">يتم التحقق من صحة الملف والإصدار قبل السماح بالاستعادة</p>
              </div>
              <div className="p-4 bg-violet-50 dark:bg-violet-900/10 rounded-[var(--border-radius-lg)] border border-violet-200 dark:border-violet-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-icons-round text-violet-600">sync</span>
                  <span className="text-sm font-bold text-violet-700 dark:text-violet-400">إعادة بناء تلقائي</span>
                </div>
                <p className="text-xs text-violet-600/80">بعد الاستعادة يتم إعادة حساب التكاليف وتحديث لوحات التحكم تلقائياً</p>
              </div>
            </div>
          </Card>

          {/* ── Backup History ───────────────────────────────────────────────── */}
          <Card title="سجل النسخ الاحتياطي">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                <span className="material-icons-round animate-spin">refresh</span>
                <span className="text-sm font-bold">جاري التحميل...</span>
              </div>
            ) : backupHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <span className="material-icons-round text-4xl mb-2 opacity-30">inventory_2</span>
                <p className="text-sm font-bold">لا يوجد سجل نسخ احتياطي بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backupHistory.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    className="flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa] border border-[var(--color-border)]"
                  >
                    <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0 ${
                      entry.action === 'export'
                        ? 'bg-emerald-100'
                        : 'bg-blue-100 dark:bg-blue-900/20'
                    }`}>
                      <span className={`material-icons-round ${
                        entry.action === 'export'
                          ? 'text-emerald-600'
                          : 'text-blue-600'
                      }`}>
                        {entry.action === 'export' ? 'cloud_download' : 'cloud_upload'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text)] truncate">
                        {entry.action === 'export' ? 'تصدير' : 'استعادة'}
                        {' — '}
                        {entry.type === 'full' ? 'كاملة' : entry.type === 'monthly' ? `شهرية (${entry.month})` : 'إعدادات'}
                        {entry.mode && ` — ${entry.mode === 'merge' ? 'دمج' : entry.mode === 'replace' ? 'استبدال' : 'إعادة تعيين'}`}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {entry.totalDocuments} مستند · {entry.createdBy}
                        {entry.createdAt?.toDate && ` · ${entry.createdAt.toDate().toLocaleString('ar-EG')}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      entry.action === 'export'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {entry.action === 'export' ? 'تصدير' : 'استيراد'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Confirm Restore Modal ── */}
          {showConfirmRestore && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md">
                <div className="p-6 text-center">
                  <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                    restoreMode === 'full_reset'
                      ? 'bg-rose-100'
                      : restoreMode === 'replace'
                      ? 'bg-amber-100'
                      : 'bg-emerald-100'
                  }`}>
                    <span className={`material-icons-round text-3xl ${
                      restoreMode === 'full_reset'
                        ? 'text-rose-600'
                        : restoreMode === 'replace'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}>
                      {restoreMode === 'full_reset' ? 'warning' : 'restore'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
                    تأكيد الاستعادة
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] mb-4">
                    {restoreMode === 'merge' && 'سيتم دمج البيانات من النسخة الاحتياطية مع البيانات الحالية.'}
                    {restoreMode === 'replace' && 'سيتم استبدال المجموعات المشمولة في النسخة الاحتياطية. البيانات الحالية في هذه المجموعات ستُحذف.'}
                    {restoreMode === 'full_reset' && 'سيتم حذف جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية. هذه العملية لا يمكن التراجع عنها.'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mb-6 flex items-center justify-center gap-1">
                    <span className="material-icons-round text-xs">info</span>
                    سيتم إنشاء نسخة احتياطية تلقائية قبل البدء
                  </p>
                  <div className="flex items-center gap-3 justify-center">
                    <button
                      onClick={() => setShowConfirmRestore(false)}
                      className="px-5 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed] transition-all"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleRestore}
                      className={`px-5 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold text-white transition-all flex items-center gap-2 ${
                        restoreMode === 'full_reset'
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-primary hover:bg-primary/90'
                      }`}
                    >
                      <span className="material-icons-round text-sm">restore</span>
                      تأكيد الاستعادة
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
