import type { SettingsSectionKey } from '../hooks/useSystemSettingsController';

export type SettingsSectionMeta = {
  key: SettingsSectionKey;
  label: string;
  subtitle: string;
  icon: string;
  adminOnly: boolean;
  path: string;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { key: 'general', label: 'الإعدادات العامة', subtitle: 'صفحة البداية، بيانات الشركة، وسلوك النظام.', icon: 'settings', adminOnly: false, path: '/settings/general' },
  { key: 'appearance', label: 'المظهر والهوية', subtitle: 'الشعار، الثيم، الخط، وكثافة الواجهة.', icon: 'palette', adminOnly: false, path: '/settings/appearance' },
  { key: 'production', label: 'إعدادات الإنتاج', subtitle: 'عمال الإنتاج ومسارات المخزون المرتبطة بالإنتاج.', icon: 'precision_manufacturing', adminOnly: true, path: '/settings/production' },
  { key: 'dashboards', label: 'لوحات التحكم', subtitle: 'الإجراءات السريعة و Widgets لوحات التحكم.', icon: 'dashboard_customize', adminOnly: true, path: '/settings/dashboards' },
  { key: 'alerts', label: 'التنبيهات والمؤشرات', subtitle: 'قواعد التنبيهات، مفاتيحها، وحدود KPI.', icon: 'notifications_active', adminOnly: true, path: '/settings/alerts' },
  { key: 'reports', label: 'التقارير والطباعة', subtitle: 'قوالب الطباعة وإعدادات التقارير.', icon: 'print', adminOnly: true, path: '/settings/reports' },
  { key: 'data', label: 'التصدير والاستيراد', subtitle: 'صلاحيات وأدوات تصدير واستيراد البيانات.', icon: 'import_export', adminOnly: true, path: '/settings/data' },
  { key: 'clientVersion', label: 'إصدار التطبيق', subtitle: 'الحد الأدنى للإصدار والتحديث الإجباري.', icon: 'system_update', adminOnly: true, path: '/settings/client-version' },
  { key: 'backup', label: 'النسخ الاحتياطي', subtitle: 'تصدير واستعادة نسخ بيانات المستأجر.', icon: 'backup', adminOnly: true, path: '/settings/backup' },
];

export const getSettingsSection = (key: SettingsSectionKey): SettingsSectionMeta =>
  SETTINGS_SECTIONS.find((item) => item.key === key) ?? SETTINGS_SECTIONS[0];
