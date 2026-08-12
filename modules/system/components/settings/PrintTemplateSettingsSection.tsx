import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductionReportShareCard } from '../../../production/components/ProductionReportShareCard';
import { Button } from '../UI';
import type {
  PaperOrientation,
  PaperSize,
  PrintDocumentTypeId,
  PrintFontFamily,
  PrintTemplateSettings,
  PrintThemePreset,
} from '../../../../types';
import type { ReportPrintRow } from '../../../production/components/ProductionReportPrint';
import { getPrintThemePresetDefaults } from '../../../../utils/printTheme';
import {
  exportAsImage,
  exportToPDF,
  getShareResultFeedbackMessage,
  shareToWhatsApp,
} from '../../../../utils/reportExport';
import { useManagedPrint } from '../../../../utils/printManager';
import { toast } from '../../../../components/Toast';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { PrintDocumentControlsPanel } from './PrintDocumentControlsPanel';
import { PrintEngineDocumentPreview } from './PrintEngineDocumentPreview';
import { PRINT_DOCUMENT_REGISTRY, getPrintDocumentEntry } from '../../../../utils/print/printDocumentRegistry';
import {
  PRINT_FONT_FAMILIES,
  PRINT_FONT_SIZE_DEFAULT,
  PRINT_FONT_SIZE_MAX,
  PRINT_FONT_SIZE_MIN,
} from '../../../../utils/print/printFont';
import { PRINT_PREVIEW_SAMPLE_ROW } from '../../lib/printPreviewSamples';

const WHATSAPP_CARD_WIDTH = 1080;
const WHATSAPP_PREVIEW_SCALE = 0.42;

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
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(false);
  const [exportingWhatsAppPng, setExportingWhatsAppPng] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<PrintDocumentTypeId>('productionReport');
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const whatsAppCardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const previewRow = useMemo(
    () => sampleRows[0] ?? PRINT_PREVIEW_SAMPLE_ROW,
    [sampleRows],
  );

  const selectedDocLabel = useMemo(
    () => getPrintDocumentEntry(selectedDocType).labelAr,
    [selectedDocType],
  );

  const handlePreviewPrint = useManagedPrint({
    contentRef: previewRef,
    printSettings: localPrint,
    documentTitle: `معاينة-${selectedDocLabel}`,
  });

  const runPreviewExport = useCallback(
    async (mode: 'png' | 'pdf' | 'share') => {
      const el = previewRef.current;
      if (!el) {
        toast.error('عنصر المعاينة غير جاهز.');
        return;
      }
      setPreviewBusy(mode);
      try {
        const safeName = `preview-${selectedDocType}`;
        if (mode === 'png') {
          await exportAsImage(el, safeName);
          toast.success('تم تحميل صورة PNG.');
          return;
        }
        if (mode === 'pdf') {
          await exportToPDF(el, safeName, {
            paperSize: localPrint.paperSize,
            orientation: localPrint.orientation,
          });
          toast.success('تم تحميل ملف PDF.');
          return;
        }
        const result = await shareToWhatsApp(el, selectedDocLabel);
        const msg = getShareResultFeedbackMessage(result, { downloadEntityLabel: selectedDocLabel });
        if (msg) toast.success(msg, 8000);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'تعذر تنفيذ العملية.');
      } finally {
        setPreviewBusy(null);
      }
    },
    [localPrint.orientation, localPrint.paperSize, selectedDocLabel, selectedDocType],
  );

  const exportWhatsAppPng = useCallback(async () => {
    const el = whatsAppCardRef.current;
    if (!el) {
      toast.error('بطاقة المعاينة غير جاهزة.');
      return;
    }
    setExportingWhatsAppPng(true);
    try {
      await exportAsImage(el, `whatsapp-preview-${previewRow.reportCode || 'report'}`);
      toast.success('تم تحميل صورة واتساب (PNG).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر تصدير الصورة.');
    } finally {
      setExportingWhatsAppPng(false);
    }
  }, [previewRow.reportCode]);

  if (!isAdmin) return null;
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">إعدادات قالب الطباعة</h3>
          <p className="page-subtitle">تخصيص مظهر التقارير المطبوعة — الشعار، الألوان، حجم الورق وعناصر كل مستند.</p>
        </div>
        <div className="erp-page-actions w-full sm:w-auto">
          <Button
            onClick={() => setShowPreview(true)}
            variant="outline"
            solid={false}
          >
            معاينة الطباعة
          </Button>
          <Button
            onClick={() => setShowWhatsAppPreview(true)}
            variant="outline"
            solid={false}
          >
            معاينة صورة واتساب
          </Button>
          <Button onClick={onSave} disabled={saving} solid>
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </Button>
        </div>
      </div>
      <OpsDashPanel title="الشعار والعنوان">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">image</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">شعار الشركة</p>
                <p className="text-xs text-[var(--color-text-muted)]">يظهر أعلى التقرير المطبوع — PNG أو JPG</p>
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
              <Button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                variant="outline"
                solid={false}
              >
                {uploadingLogo ? 'جاري الرفع...' : localPrint.logoUrl ? 'تغيير الشعار' : 'رفع شعار'}
              </Button>
              {localPrint.logoUrl && (
                <Button
                  onClick={() => setLocalPrint((p) => ({ ...p, logoUrl: '' }))}
                  variant="outline"
                  iconName="delete"
                  tone="delete"
                  solid={false}
                  title="حذف الشعار"
                >
                  حذف الشعار
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">title</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">عنوان الرأس</p>
                <p className="text-xs text-[var(--color-text-muted)]">اسم الشركة / المؤسسة في أعلى التقرير</p>
              </div>
            </div>
            <input
              type="text"
              className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPrint.headerText}
              onChange={(e) => setLocalPrint((p) => ({ ...p, headerText: e.target.value }))}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">short_text</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">نص التذييل</p>
                <p className="text-xs text-[var(--color-text-muted)]">يظهر أسفل التقرير المطبوع</p>
              </div>
            </div>
            <input
              type="text"
              className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPrint.footerText}
              onChange={(e) => setLocalPrint((p) => ({ ...p, footerText: e.target.value }))}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">palette</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">اللون الرئيسي</p>
                <p className="text-xs text-[var(--color-text-muted)]">لون العناوين والحدود في التقرير</p>
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
          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">style</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">ثيم الطباعة الشامل</p>
                <p className="text-xs text-[var(--color-text-muted)]">يُطبق على كل التقارير المطبوعة. يُنصح باختيار ERPNext للتقارير الرسمية.</p>
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
                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
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
      </OpsDashPanel>
      <OpsDashPanel title="خط الطباعة">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">font_download</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">عائلة الخط</p>
                <p className="text-xs text-[var(--color-text-muted)]">يُطبَّق على الطباعة وصورة PNG/PDF/المشاركة</p>
              </div>
            </div>
            <select
              className="w-full sm:w-56 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--color-card)]"
              value={localPrint.printFontFamily || 'Cairo'}
              onChange={(e) =>
                setLocalPrint((p) => ({
                  ...p,
                  printFontFamily: e.target.value as PrintFontFamily,
                }))
              }
              style={{ fontFamily: `'${localPrint.printFontFamily || 'Cairo'}', sans-serif` }}
            >
              {PRINT_FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value} style={{ fontFamily: `'${font.value}', sans-serif` }}>
                  {font.labelAr}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">format_size</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">حجم الخط الأساسي</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  من {PRINT_FONT_SIZE_MIN} إلى {PRINT_FONT_SIZE_MAX} نقطة — الحالي: {localPrint.printFontSizePt ?? PRINT_FONT_SIZE_DEFAULT}pt
                </p>
              </div>
            </div>
            <input
              type="range"
              min={PRINT_FONT_SIZE_MIN}
              max={PRINT_FONT_SIZE_MAX}
              step={1}
              className="w-full sm:w-48 accent-[var(--color-primary)]"
              value={localPrint.printFontSizePt ?? PRINT_FONT_SIZE_DEFAULT}
              onChange={(e) =>
                setLocalPrint((p) => ({
                  ...p,
                  printFontSizePt: Number(e.target.value),
                }))
              }
            />
          </div>
          <div
            className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            style={{
              fontFamily: `'${localPrint.printFontFamily || 'Cairo'}', 'Noto Sans Arabic', Tahoma, sans-serif`,
              fontSize: `${localPrint.printFontSizePt ?? PRINT_FONT_SIZE_DEFAULT}pt`,
            }}
          >
            <p className="font-bold text-[var(--color-text)]">معاينة سريعة للخط</p>
            <p className="mt-1 text-[var(--color-text-muted)]">
              تقرير الإنتاج — فاتورة صيانة — تحويل مخزون — كارت الصنف
            </p>
          </div>
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="الورق والهوامش">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">description</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">حجم الورق</p>
                <p className="text-xs text-[var(--color-text-muted)]">A4 / A5 / حراري</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">crop_rotate</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">اتجاه الورق</p>
                <p className="text-xs text-[var(--color-text-muted)]">عمودي أو أفقي</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">content_copy</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">عدد النسخ</p>
                <p className="text-xs text-[var(--color-text-muted)]">عدد النسخ الافتراضي عند الطباعة</p>
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
          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">border_outer</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">هوامش الصفحة (mm)</p>
                <p className="text-xs text-[var(--color-text-muted)]">يُطبق تلقائيًا على كل صفحات التقرير في المعاينة</p>
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
                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">decimal_increase</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">المنازل العشرية</p>
                <p className="text-xs text-[var(--color-text-muted)]">عدد الخانات بعد الفاصلة في الأرقام</p>
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
      </OpsDashPanel>
      <PrintDocumentControlsPanel
        localPrint={localPrint}
        setLocalPrint={setLocalPrint}
        selectedDocType={selectedDocType}
        setSelectedDocType={setSelectedDocType}
      />

      {!showPreview ? (
        <OpsDashPanel
          title={`معاينة المحرك — ${selectedDocLabel}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" solid={false} onClick={() => setShowPreview(true)}>
                تكبير المعاينة
              </Button>
              <Button
                type="button"
                variant="outline"
                solid={false}
                disabled={!!previewBusy}
                onClick={() => handlePreviewPrint()}
              >
                طباعة العينة
              </Button>
            </div>
          }
        >
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            نفس مكوّن الطباعة التشغيلي — يتحدث فوراً مع الشعار والألوان وحقول المستند المحدد أعلاه.
          </p>
          <div className="overflow-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 max-h-[70vh]">
            <div className="mx-auto w-fit max-w-full shadow-lg bg-white">
              <PrintEngineDocumentPreview
                ref={previewRef}
                docType={selectedDocType}
                printSettings={localPrint}
                sampleRow={previewRow}
              />
            </div>
          </div>
        </OpsDashPanel>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={onReset} variant="ghost" solid={false}>
          إعادة تعيين للقيم الافتراضية
        </Button>
      </div>
      {showPreview && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-[var(--color-border)]">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                  <span className="material-icons-round text-primary">visibility</span>
                  معاينة الطباعة — {selectedDocLabel}
                </h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PRINT_DOCUMENT_REGISTRY.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setSelectedDocType(doc.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                        selectedDocType === doc.id
                          ? 'bg-primary text-white border-primary'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                      }`}
                    >
                      {doc.labelAr}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  solid={false}
                  disabled={!!previewBusy}
                  onClick={() => handlePreviewPrint()}
                >
                  طباعة
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  solid={false}
                  disabled={!!previewBusy}
                  onClick={() => void runPreviewExport('png')}
                >
                  {previewBusy === 'png' ? '...' : 'PNG'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  solid={false}
                  disabled={!!previewBusy}
                  onClick={() => void runPreviewExport('pdf')}
                >
                  {previewBusy === 'pdf' ? '...' : 'PDF'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  solid={false}
                  disabled={!!previewBusy}
                  onClick={() => void runPreviewExport('share')}
                >
                  {previewBusy === 'share' ? '...' : 'مشاركة'}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="w-9 h-9 rounded-[var(--border-radius-base)] bg-[var(--color-bg)] flex items-center justify-center hover:bg-[var(--color-surface-hover)] transition-all"
                >
                  <span className="material-icons-round text-[var(--color-text-muted)]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-[var(--color-bg)] flex justify-center">
              <div className="shadow-2xl bg-[var(--color-card)]">
                <PrintEngineDocumentPreview
                  ref={previewRef}
                  docType={selectedDocType}
                  printSettings={localPrint}
                  sampleRow={previewRow}
                />
              </div>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}
      {showWhatsAppPreview && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-[var(--color-border)]">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                  <span className="material-icons-round text-primary">share</span>
                  معاينة صورة واتساب
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  نفس بطاقة المشاركة المستخدمة في تقارير الإنتاج (عرض 1080 بكسل)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  solid={false}
                  disabled={exportingWhatsAppPng}
                  onClick={() => void exportWhatsAppPng()}
                >
                  {exportingWhatsAppPng ? 'جاري التصدير...' : 'تصدير PNG'}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowWhatsAppPreview(false)}
                  className="w-9 h-9 rounded-[var(--border-radius-base)] bg-[var(--color-bg)] flex items-center justify-center hover:bg-[var(--color-surface-hover)] transition-all"
                >
                  <span className="material-icons-round text-[var(--color-text-muted)]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[var(--color-bg)] flex justify-center">
              <div
                className="shadow-2xl overflow-hidden bg-[var(--color-card)] rounded-[var(--border-radius-lg)]"
                style={{ zoom: WHATSAPP_PREVIEW_SCALE }}
              >
                <div style={{ width: WHATSAPP_CARD_WIDTH, background: 'white' }}>
                  <ProductionReportShareCard report={previewRow} printSettings={localPrint} />
                </div>
              </div>
              {/* Full-size capture target (off-screen) — matches production WhatsApp share path */}
              <div
                aria-hidden
                style={{
                  position: 'fixed',
                  left: -99999,
                  top: 0,
                  width: WHATSAPP_CARD_WIDTH,
                  pointerEvents: 'none',
                  zIndex: -1,
                }}
              >
                <div ref={whatsAppCardRef} style={{ width: WHATSAPP_CARD_WIDTH, background: 'white' }}>
                  <ProductionReportShareCard report={previewRow} printSettings={localPrint} />
                </div>
              </div>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}
      <OpsDashPanel title="معمل تصدير الصور وواتساب">
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          جرّب بطاقة مشاركة واتساب (1080) وتصدير PNG بنفس قالب الطباعة، بالإضافة إلى مستندات الطباعة وتحويل المخزن.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" solid={false} onClick={() => setShowWhatsAppPreview(true)}>
            معاينة صورة واتساب هنا
          </Button>
          <Link
            to="/dev/image-export"
            className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <span className="material-icons-round text-base">open_in_new</span>
            فتح معمل التصدير
          </Link>
        </div>
      </OpsDashPanel>
    </>
  );
};
