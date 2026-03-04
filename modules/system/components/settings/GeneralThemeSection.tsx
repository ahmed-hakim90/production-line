import React from 'react';
import { Card } from '../UI';
import type { ThemeSettings } from '../../../../types';

type ThemePresetOption = {
  id: string;
  name: string;
  description: string;
  colors: { primary: string; bg: string; card: string };
  partialTheme: Partial<ThemeSettings>;
};

type FontFamilyOption = {
  value: string;
  label: string;
};

type GeneralThemeSectionProps = {
  isAdmin: boolean;
  localTheme: ThemeSettings;
  setLocalTheme: React.Dispatch<React.SetStateAction<ThemeSettings>>;
  themePresets: ThemePresetOption[];
  fontFamilies: FontFamilyOption[];
  defaultTheme: ThemeSettings;
};

export const GeneralThemeSection: React.FC<GeneralThemeSectionProps> = ({
  isAdmin,
  localTheme,
  setLocalTheme,
  themePresets,
  fontFamilies,
  defaultTheme,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="محرك المظهر">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">auto_awesome</span>
            <p className="text-sm font-bold text-[var(--color-text)]">ثيمات جاهزة</p>
            <span className="text-xs text-[var(--color-text-muted)] font-medium">— اختر واحدة وعدّل عليها</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {themePresets.map((preset) => {
              const isActive =
                localTheme.primaryColor === preset.partialTheme.primaryColor &&
                localTheme.darkMode === preset.partialTheme.darkMode;
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
                  {isActive && (
                    <span className="absolute top-1.5 left-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow">
                      <span className="material-icons-round text-white" style={{ fontSize: '10px' }}>check</span>
                    </span>
                  )}
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

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-[var(--color-text-muted)] font-bold">أو خصّص بنفسك</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div>
          <p className="text-sm font-bold text-[var(--color-text)] mb-3">الألوان</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {([
              { key: 'primaryColor' as const, label: 'اللون الرئيسي' },
              { key: 'secondaryColor' as const, label: 'اللون الثانوي' },
              { key: 'successColor' as const, label: 'لون النجاح' },
              { key: 'warningColor' as const, label: 'لون التحذير' },
              { key: 'dangerColor' as const, label: 'لون الخطر' },
              { key: 'backgroundColor' as const, label: 'لون الخلفية' },
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
              { value: 'light' as const, label: 'فاتح', icon: 'light_mode' },
              { value: 'dark' as const, label: 'داكن', icon: 'dark_mode' },
              { value: 'auto' as const, label: 'تلقائي', icon: 'brightness_auto' },
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
            {fontFamilies.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
          </select>
        </div>

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
              <div className="flex items-center gap-2 mb-2">
                {[
                  { label: 'حاد', value: 0 },
                  { label: 'عادي', value: 6 },
                  { label: 'مستدير', value: 12 },
                  { label: 'دائري', value: 20 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setLocalTheme((prev) => ({ ...prev, borderRadius: preset.value }))}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-all ${
                      localTheme.borderRadius === preset.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-primary/40'
                    }`}
                  >
                    {preset.label}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              { value: 'comfortable' as const, label: 'مريح', icon: 'view_agenda' },
              { value: 'compact' as const, label: 'مضغوط', icon: 'view_headline' },
            ]).map((density) => (
              <button
                key={density.value}
                onClick={() => setLocalTheme((p) => ({ ...p, density: density.value }))}
                className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                  localTheme.density === density.value
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                }`}
              >
                <span className="material-icons-round text-sm">{density.icon}</span>
                {density.label}
              </button>
            ))}
          </div>
        </div>

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
              { value: 'colorful' as const, label: 'ملوّن', icon: 'palette' },
              { value: 'primary' as const, label: 'رئيسي', icon: 'circle' },
              { value: 'muted' as const, label: 'محايد', icon: 'tonality' },
            ]).map((iconStyle) => (
              <button
                key={iconStyle.value}
                onClick={() => setLocalTheme((p) => ({ ...p, sidebarIconStyle: iconStyle.value }))}
                className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center gap-2 ${
                  (localTheme.sidebarIconStyle ?? 'colorful') === iconStyle.value
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary/30'
                }`}
              >
                <span className="material-icons-round text-sm">{iconStyle.icon}</span>
                {iconStyle.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <p className="text-xs font-bold text-[var(--color-text-muted)] px-4 py-2.5 bg-[#f8f9fa] border-b border-[var(--color-border)]">
            معاينة مباشرة
          </p>
          <div className="p-4" style={{ backgroundColor: localTheme.backgroundColor }}>
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

        <button
          onClick={() => setLocalTheme({ ...defaultTheme })}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">restart_alt</span>
          إعادة تعيين للقيم الافتراضية
        </button>
      </div>
    </Card>
  );
};
