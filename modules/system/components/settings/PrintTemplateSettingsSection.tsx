import React from 'react';
import { SingleReportPrint } from '../../../production/components/ProductionReportPrint';
import { Card, Button } from '../UI';
import type { PaperOrientation, PaperSize, PrintTemplateSettings, PrintThemePreset } from '../../../../types';
import type { ReportPrintRow } from '../../../production/components/ProductionReportPrint';
import { getPrintThemePresetDefaults } from '../../../../utils/printTheme';

type PrintTemplateSettingsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  showPreview: boolean;
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>;
  uploadingLogo: boolean;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  localPrint: PrintTemplateSettings;
  setLocalPrint: React.Dispatch<React.SetStateAction<PrintTemplateSettings>>;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onReset: () => void;
  sampleRows: ReportPrintRow[];
};

export const PrintTemplateSettingsSection: React.FC<PrintTemplateSettingsSectionProps> = ({
  isAdmin,
  saving,
  showPreview,
  setShowPreview,
  uploadingLogo,
  logoInputRef,
  localPrint,
  setLocalPrint,
  handleLogoUpload,
  onSave,
  onReset,
  sampleRows,
}) => {
  if (!isAdmin) return null;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">إعدادات قالب الطباعة</h3>
          <p className="page-subtitle">تخصيص مظهر التقارير المطبوعة — الشعار، الألوان، حجم الورق والمزيد.</p>
        </div>
        <div className="erp-page-actions w-full sm:w-auto">
          <Button
            onClick={() => setShowPreview(true)}
            className="!bg-[#f0f2f5] dark:!bg-slate-800 !text-[var(--color-text)] dark:!text-[var(--color-text-muted)] hover:!bg-slate-200 dark:hover:!bg-slate-700"
          >
            <span className="material-icons-round text-sm">visibility</span>
            معاينة
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">save</span>
            حفظ التغييرات
          </Button>
        </div>
      </div>

      <Card title="الشعار والعنوان">
        <div className="space-y-6">
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

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">style</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">ثيم الطباعة الشامل</p>
                <p className="text-xs text-slate-400">ينطبق على كل التقارير المطبوعة. يُنصح باختيار ERPNext للتقارير الرسمية.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ['erpnext', 'ERPNext'],
                ['classic', 'Classic'],
                ['high_contrast', 'High Contrast'],
                ['minimal', 'Minimal'],
              ] as [PrintThemePreset, string][]).map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() => {
                    const presetDefaults = getPrintThemePresetDefaults(preset);
                    setLocalPrint((p) => ({
                      ...p,
                      printThemePreset: preset,
                      primaryColor: presetDefaults.primary,
                      textColor: presetDefaults.text,
                      mutedTextColor: presetDefaults.mutedText,
                      borderColor: presetDefaults.border,
                      tableHeaderBgColor: presetDefaults.tableHeaderBg,
                      tableHeaderTextColor: presetDefaults.tableHeaderText,
                      tableRowAltBgColor: presetDefaults.tableRowAltBg,
                      accentSuccessColor: presetDefaults.success,
                      accentWarningColor: presetDefaults.warning,
                      accentDangerColor: presetDefaults.danger,
                    }));
                  }}
                  className={`px-3 py-2 rounded-[var(--border-radius-lg)] text-xs font-bold transition-all ${
                    (localPrint.printThemePreset ?? 'erpnext') === preset
                      ? 'bg-primary text-white shadow-primary/20'
                      : 'bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {preset === 'erpnext' && (
                      <span className="px-1.5 py-0.5 rounded bg-black/10 text-[10px] font-black">
                        Recommended
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {([
                { key: 'textColor' as const, label: 'لون النص' },
                { key: 'mutedTextColor' as const, label: 'النص الثانوي' },
                { key: 'borderColor' as const, label: 'الحدود' },
                { key: 'tableHeaderBgColor' as const, label: 'خلفية رأس الجدول' },
                { key: 'tableHeaderTextColor' as const, label: 'نص رأس الجدول' },
                { key: 'tableRowAltBgColor' as const, label: 'صف بديل الجدول' },
                { key: 'accentSuccessColor' as const, label: 'لون النجاح' },
                { key: 'accentWarningColor' as const, label: 'لون التحذير' },
                { key: 'accentDangerColor' as const, label: 'لون الخطر' },
              ]).map((field) => (
                <label key={field.key} className="space-y-1">
                  <span className="text-xs font-bold text-slate-500">{field.label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-9 h-9 rounded-[var(--border-radius-base)] border border-[var(--color-border)] cursor-pointer"
                      value={localPrint[field.key] || '#000000'}
                      onChange={(e) => setLocalPrint((p) => ({ ...p, [field.key]: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-xs font-mono font-bold py-2 px-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      value={localPrint[field.key] || ''}
                      onChange={(e) => setLocalPrint((p) => ({ ...p, [field.key]: e.target.value }))}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="الورق والطباعة">
        <div className="space-y-6">
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
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {([['a4', 'A4'], ['a5', 'A5'], ['thermal', 'حراري']] as [PaperSize, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLocalPrint((p) => ({ ...p, paperSize: val }))}
                  className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex-1 sm:flex-none ${
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
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {([['portrait', 'عمودي'], ['landscape', 'أفقي']] as [PaperOrientation, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLocalPrint((p) => ({ ...p, orientation: val }))}
                  className={`px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none ${
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

      <div className="flex justify-end">
        <button
          onClick={onReset}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">restart_alt</span>
          إعادة تعيين للقيم الافتراضية
        </button>
      </div>

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
                <SingleReportPrint
                  report={
                    sampleRows[0] ?? {
                      reportId: 'preview-1',
                      reportCode: 'PR-000001',
                      date: '2026-03-15',
                      lineName: 'خط 1',
                      productName: 'منتج تجريبي',
                      employeeName: 'مشرف تجريبي',
                      quantityProduced: 1200,
                      wasteQuantity: 35,
                      workersCount: 12,
                      workersProductionCount: 6,
                      workersPackagingCount: 3,
                      workersQualityCount: 2,
                      workersMaintenanceCount: 1,
                      workersExternalCount: 0,
                      workHours: 8,
                      workOrderNumber: 'WO-0001',
                      costPerUnit: 2.35,
                    }
                  }
                  printSettings={localPrint}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
