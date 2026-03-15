import React from 'react';
import {
  Boxes,
  Check,
  Circle,
  FileText,
  IdCard,
  ImageUp,
  Info,
  Loader2,
  PackageSearch,
  Save,
  ScrollText,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Card, Button } from '../UI';
import { EXPORT_IMPORT_PAGE_REGISTRY, getExportImportPageControl } from '../../../../utils/exportImportControls';
import type { ExportImportSettings } from '../../../../types';

type ExportImportSettingsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  localExportImport: ExportImportSettings;
  updateExportImportControl: (
    pageKey: string,
    patch: Partial<{
      exportEnabled: boolean;
      importEnabled: boolean;
      exportVariant: 'primary' | 'secondary' | 'outline';
      importVariant: 'primary' | 'secondary' | 'outline';
    }>
  ) => void;
  onSave: () => void;
};

const SETTINGS_ICON_MAP: Record<string, LucideIcon> = {
  description: FileText,
  assignment: ScrollText,
  inventory_2: Boxes,
  receipt_long: ScrollText,
  groups: IdCard,
  person: IdCard,
  summarize: PackageSearch,
  badge: IdCard,
  upload_file: ImageUp,
  person_add: UserPlus,
  check: Check,
  info: Info,
};

const SettingsIcon = ({
  name,
  className,
  size = 16,
}: {
  name: string;
  className?: string;
  size?: number;
}) => {
  const Icon = SETTINGS_ICON_MAP[name] ?? Circle;
  return <Icon size={size} className={className} />;
};

export const ExportImportSettingsSection: React.FC<ExportImportSettingsSectionProps> = ({
  isAdmin,
  saving,
  localExportImport,
  updateExportImportControl,
  onSave,
}) => {
  if (!isAdmin) return null;

  return (
    <>
      <div className="erp-page-head">
        <div>
          <h3 className="text-lg font-bold">التصدير والاستيراد</h3>
          <p className="page-subtitle">تحكم مركزي في إظهار/إخفاء أزرار الاستيراد والتصدير وشكلها لكل صفحة.</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          <Save size={14} />
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
                  <SettingsIcon name={item.icon} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-[var(--color-text)]">{item.section}</h4>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">{item.page}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {item.features.map((f, i) => (
                      <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                        <SettingsIcon name="check" className="text-[10px] text-emerald-400" size={10} />
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
                  <SettingsIcon name={item.icon} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-[var(--color-text)]">{item.section}</h4>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">{item.page}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {item.features.map((f, i) => (
                      <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                        <SettingsIcon name="check" className="text-[10px] text-emerald-400" size={10} />
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
                <SettingsIcon name={t.icon} className="text-primary text-base" />
                <h4 className="text-sm font-bold text-[var(--color-text)]">{t.label}</h4>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">{t.desc}</p>
              <p className="text-[10px] font-bold text-primary">{t.page}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="p-4 rounded-[var(--border-radius-lg)] bg-amber-50 dark:bg-amber-900/10 border border-amber-200 flex items-start gap-3">
        <SettingsIcon name="info" className="text-amber-500 mt-0.5" />
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
  );
};
