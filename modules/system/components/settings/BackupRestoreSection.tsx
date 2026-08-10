import React from 'react';
import { Button } from '../UI';
import type {
  BackupFile,
  BackupHistoryEntry,
  RestoreMode,
} from '../../../../services/backupService';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';

type BackupRestoreSectionProps = {
  isAdmin: boolean;
  backupMessage: { type: 'success' | 'error'; text: string } | null;
  setBackupMessage: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
  backupProgress: { step: string; percent: number } | null;
  backupLoading: boolean;
  handleExportFull: () => Promise<void>;
  selectedMonth: string;
  setSelectedMonth: React.Dispatch<React.SetStateAction<string>>;
  handleExportMonthly: () => Promise<void>;
  handleExportSettings: () => Promise<void>;
  importFileName: string;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImportSelection: () => void;
  importValidation: { valid: boolean; error?: string } | null;
  importFile: BackupFile | null;
  restoreModes: { value: RestoreMode; label: string; icon: string; description: string; color: string }[];
  restoreMode: RestoreMode;
  setRestoreMode: React.Dispatch<React.SetStateAction<RestoreMode>>;
  setShowConfirmRestore: React.Dispatch<React.SetStateAction<boolean>>;
  historyLoading: boolean;
  backupHistory: BackupHistoryEntry[];
  showConfirmRestore: boolean;
  handleRestore: () => Promise<void>;
  skipAutoBackupBeforeRestore: boolean;
  setSkipAutoBackupBeforeRestore: React.Dispatch<React.SetStateAction<boolean>>;
  useServerImport: boolean;
  setUseServerImport: React.Dispatch<React.SetStateAction<boolean>>;
  isSuperAdmin: boolean;
};
export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  isAdmin,
  backupMessage,
  setBackupMessage,
  backupProgress,
  backupLoading,
  handleExportFull,
  selectedMonth,
  setSelectedMonth,
  handleExportMonthly,
  handleExportSettings,
  importFileName,
  importInputRef,
  handleFileSelect,
  onClearImportSelection,
  importValidation,
  importFile,
  restoreModes,
  restoreMode,
  setRestoreMode,
  setShowConfirmRestore,
  historyLoading,
  backupHistory,
  showConfirmRestore,
  handleRestore,
  skipAutoBackupBeforeRestore,
  setSkipAutoBackupBeforeRestore,
  useServerImport,
  setUseServerImport,
  isSuperAdmin,
}) => {
  if (!isAdmin) return null;
  return (
    <>
      {backupMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
          backupMessage.type === 'success'
            ? 'bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] text-[rgb(var(--color-success))] border border-[rgb(var(--color-success)/0.25)]'
            : 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] text-[rgb(var(--color-danger))] border border-[rgb(var(--color-danger)/0.25)]'
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
      {backupProgress && (
        <div className="bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] border border-[rgb(var(--color-primary)/0.25)] dark:border-[rgb(var(--color-primary)/0.25)] rounded-[var(--border-radius-lg)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-[rgb(var(--color-primary))] flex items-center gap-2">
              <span className="material-icons-round animate-spin text-sm">refresh</span>
              {backupProgress.step}
            </span>
            <span className="text-sm font-bold text-[rgb(var(--color-primary))]">{backupProgress.percent}%</span>
          </div>
          <div className="w-full bg-[rgb(var(--color-primary)/0.25)] rounded-full h-2.5">
            <div
              className="bg-[rgb(var(--color-primary))] h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${backupProgress.percent}%` }}
            />
          </div>
        </div>
      )}
      <OpsDashPanel title="تصدير نسخة احتياطية">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary text-xl">cloud_download</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">نسخة احتياطية كاملة</p>
                <p className="text-xs text-[var(--color-text-muted)]">تصدير جميع البيانات — المنتجات، خطط الإنتاج، التقارير، أوامر الشغل، الإشعارات، التكاليف، الخامات، تعيينات العمال، الموارد البشرية، المركبات، والإعدادات</p>
              </div>
            </div>
            <Button onClick={handleExportFull} disabled={backupLoading}>
              {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">download</span>
              تصدير كامل
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-warning)/0.1)]0/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-[rgb(var(--color-warning))] text-xl">date_range</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">نسخة شهرية</p>
                <p className="text-xs text-[var(--color-text-muted)]">تصدير تقارير الإنتاج، أوامر الشغل، تعيينات العمال، تكاليف الإنتاج الشهرية، الحضور، والإجازات لشهر محدد</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-secondary)/0.1)]0/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-[rgb(var(--color-secondary))] text-xl">tune</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">الإعدادات فقط</p>
                <p className="text-xs text-[var(--color-text-muted)]">تصدير إعدادات النظام والأدوار، إعدادات العمالة، خامات المنتجات، وإعدادات الموارد البشرية</p>
              </div>
            </div>
            <Button onClick={handleExportSettings} disabled={backupLoading}>
              {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">download</span>
              تصدير الإعدادات
            </Button>
          </div>
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="المجموعات المشمولة في النسخة الكاملة">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: 'الإنتاج', icon: 'factory', color: 'text-primary', items: ['المنتجات', 'خطوط الإنتاج', 'تقارير الإنتاج', 'خطط الإنتاج', 'حالة الخطط', 'إعدادات خط المنتج'] },
            { title: 'أوامر الشغل والإشعارات', icon: 'assignment', color: 'text-[rgb(var(--color-warning))]', items: ['أوامر الشغل', 'الإشعارات', 'تعيينات العمال على الخطوط', 'أحداث المسح'] },
            { title: 'المخزون والمستودعات', icon: 'inventory_2', color: 'text-[rgb(var(--color-secondary))]', items: ['المستودعات', 'الخامات', 'أرصدة المخزون', 'حركات المخزون', 'جرد المخزون', 'طلبات تحويل المخزون'] },
            { title: 'التكاليف والخامات', icon: 'payments', color: 'text-[rgb(var(--color-success))]', items: ['خامات المنتجات', 'تكاليف الإنتاج الشهرية', 'مراكز التكلفة', 'قيم مراكز التكلفة', 'توزيعات التكلفة', 'إعدادات العمالة'] },
            { title: 'النظام والإعدادات', icon: 'settings', color: 'text-[rgb(var(--color-primary))]', items: ['إعدادات النظام', 'الأدوار والصلاحيات', 'المستخدمين', 'سجل النشاط'] },
            { title: 'الموارد البشرية', icon: 'groups', color: 'text-[rgb(var(--color-secondary))]', items: ['الموظفين', 'الأقسام', 'المسميات الوظيفية', 'الورديات', 'إعدادات HR', 'الحضور والانصراف', 'الإجازات', 'القروض', 'البدلات', 'التقييمات', 'المركبات', 'قواعد الجزاءات', 'قواعد التأخير', 'أنواع البدلات'] },
            { title: 'الرواتب والموافقات', icon: 'account_balance', color: 'text-[rgb(var(--color-danger))]', items: ['أشهر الرواتب', 'سجلات الرواتب', 'تدقيق الرواتب', 'ملخص تكلفة الرواتب', 'مسارات الموافقة', 'إعدادات الموافقة', 'التفويضات', 'تدقيق الموافقات'] },
            { title: 'الجودة', icon: 'verified', color: 'text-[rgb(var(--color-secondary))]', items: ['إعدادات الجودة', 'قاموس أسباب الجودة', 'تعيينات الجودة', 'فحوصات الجودة', 'عيوب الجودة', 'أوامر إعادة العمل', 'إجراءات CAPA', 'سجلات تدقيق الجودة'] },
            { title: 'التدقيق', icon: 'history', color: 'text-[var(--color-text-muted)]', items: ['سجل تدقيق النظام'] },
          ].map((group) => (
            <div key={group.title} className="p-3 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2 mb-2">
                <span className={`material-icons-round text-sm ${group.color}`}>{group.icon}</span>
                <span className="text-xs font-bold text-[var(--color-text)]">{group.title}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-border)] text-[var(--color-text-muted)] mr-auto">{group.items.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item) => (
                  <span key={item} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]">{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="استعادة من نسخة احتياطية">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-primary)/0.1)]0/10 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-[rgb(var(--color-primary))] text-xl">upload_file</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {importFileName || 'اختر ملف النسخة الاحتياطية'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">ملف JSON تم تصديره من النظام</p>
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
                  className="px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-[rgb(var(--color-primary)/0.1)]0/10 text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.1)]0/20 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-icons-round text-sm">folder_open</span>
                  اختيار ملف
                </button>
                {importFileName && (
                  <button
                    onClick={onClearImportSelection}
                    className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.15)] transition-all"
                  >
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                )}
              </div>
            </div>
            {importValidation && (
              <div className={`flex items-start gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
                importValidation.valid
                  ? 'bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] text-[rgb(var(--color-success))] border border-[rgb(var(--color-success)/0.25)]'
                  : 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] text-[rgb(var(--color-danger))] border border-[rgb(var(--color-danger)/0.25)]'
              }`}>
                <span className="material-icons-round text-lg mt-0.5">
                  {importValidation.valid ? 'verified' : 'error'}
                </span>
                {importValidation.valid && importFile ? (
                  <div className="flex-1">
                    <p className="mb-2">ملف صالح — جاهز للاستعادة</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                        <p className="text-[10px] text-[rgb(var(--color-success))]/70 mb-0.5">النوع</p>
                        <p className="text-xs font-black">
                          {importFile.metadata.type === 'full' ? 'كاملة' : importFile.metadata.type === 'monthly' ? 'شهرية' : 'إعدادات'}
                        </p>
                      </div>
                      <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                        <p className="text-[10px] text-[rgb(var(--color-success))]/70 mb-0.5">المستندات</p>
                        <p className="text-xs font-black">{importFile.metadata.totalDocuments}</p>
                      </div>
                      <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                        <p className="text-[10px] text-[rgb(var(--color-success))]/70 mb-0.5">الإصدار</p>
                        <p className="text-xs font-black">{importFile.metadata.version}</p>
                      </div>
                      <div className="bg-[var(--color-card)]/50/50 rounded-[var(--border-radius-base)] p-2 text-center">
                        <p className="text-[10px] text-[rgb(var(--color-success))]/70 mb-0.5">التاريخ</p>
                        <p className="text-xs font-black">{new Date(importFile.metadata.createdAt).toLocaleDateString('ar-EG')}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {importFile.metadata.collectionsIncluded.map((c) => (
                        <span key={c} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-card)]/50/50">
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
          {importFile && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[var(--color-text)]">وضع الاستعادة</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {restoreModes.map((mode) => {
                  const selected = restoreMode === mode.value;
                  const activeStyles: Record<string, string> = {
                    emerald: 'border-[rgb(var(--color-success))] bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)]',
                    amber: 'border-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)]',
                    rose: 'border-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)]',
                  };
                  const iconStyles: Record<string, string> = {
                    emerald: 'text-[rgb(var(--color-success))]',
                    amber: 'text-[rgb(var(--color-warning))]',
                    rose: 'text-[rgb(var(--color-danger))]',
                  };
                  const labelStyles: Record<string, string> = {
                    emerald: 'text-[rgb(var(--color-success))]',
                    amber: 'text-[rgb(var(--color-warning))]',
                    rose: 'text-[rgb(var(--color-danger))]',
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
                          selected ? iconStyles[mode.color] : 'text-[var(--color-text-muted)]'
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
                      <p className="text-xs text-[var(--color-text-muted)]">{mode.description}</p>
                    </button>
                  );
                })}
              </div>
              {restoreMode !== 'merge' && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
                  restoreMode === 'full_reset'
                    ? 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] text-[rgb(var(--color-danger))] border border-[rgb(var(--color-danger)/0.25)]'
                    : 'bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] text-[rgb(var(--color-warning))] border border-[rgb(var(--color-warning)/0.25)]'
                }`}>
                  <span className="material-icons-round text-lg">warning</span>
                  {restoreMode === 'full_reset'
                    ? useServerImport
                      ? 'تحذير: سيتم حذف جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية (عبر الخادم).'
                      : skipAutoBackupBeforeRestore
                        ? 'تحذير: سيتم حذف جميع البيانات الحالية واستبدالها. تم تخطي النسخة التلقائية — لا يوجد احتياطي تلقائي قبل الاستعادة.'
                        : 'تحذير: سيتم حذف جميع البيانات الحالية واستبدالها بالنسخة الاحتياطية. سيتم إنشاء نسخة احتياطية تلقائية أولاً.'
                    : useServerImport
                      ? 'تحذير: سيتم استبدال المجموعات المشمولة (عبر الخادم).'
                      : skipAutoBackupBeforeRestore
                        ? 'تحذير: سيتم استبدال المجموعات المشمولة. تم تخطي النسخة التلقائية — لا يوجد احتياطي تلقائي قبل الاستعادة.'
                        : 'تحذير: سيتم استبدال المجموعات المشمولة. سيتم إنشاء نسخة احتياطية تلقائية أولاً.'}
                </div>
              )}
              <div className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 bg-[var(--color-muted)]/10">
                <p className="text-sm font-bold text-[var(--color-text)]">خيارات الاستعادة</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-[var(--color-border)]"
                    checked={skipAutoBackupBeforeRestore}
                    disabled={backupLoading || useServerImport}
                    onChange={(e) => setSkipAutoBackupBeforeRestore(e.target.checked)}
                  />
                  <span className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                    تخطي النسخة الاحتياطية التلقائية قبل الاستعادة (مفيد عند فشل التصدير أو صلاحيات القراءة).
                    {useServerImport ? ' (غير مُستخدم عند الاستعادة عبر الخادم.)' : ''}
                  </span>
                </label>
                {isSuperAdmin ? (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-[var(--color-border)]"
                      checked={useServerImport}
                      disabled={backupLoading}
                      onChange={(e) => setUseServerImport(e.target.checked)}
                    />
                    <span className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                      استعادة عبر الخادم (للمشرف العام): تستخدم Admin SDK وتتجاوز قواعد الأمان للعميل — مناسبة لـ users/roles ونسخ كاملة.
                    </span>
                  </label>
                ) : null}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowConfirmRestore(true)}
                  disabled={backupLoading}
                  className={restoreMode === 'full_reset' ? '!bg-[rgb(var(--color-danger))] hover:!bg-[rgb(var(--color-danger))]' : ''}
                >
                  <span className="material-icons-round text-sm">restore</span>
                  بدء الاستعادة
                </Button>
              </div>
            </div>
          )}
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="قواعد الأمان">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-success)/0.25)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-icons-round text-[rgb(var(--color-success))]">shield</span>
              <span className="text-sm font-bold text-[rgb(var(--color-success))]">نسخ تلقائي</span>
            </div>
            <p className="text-xs text-[rgb(var(--color-success))]/80">
              يُفضّل إنشاء نسخة احتياطية كاملة تلقائياً قبل الاستعادة؛ يمكنك تخطيه من «خيارات الاستعادة» إذا فشل التصدير أو صلاحيات القراءة.
            </p>
          </div>
          <div className="p-4 bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-primary)/0.25)] dark:border-[rgb(var(--color-primary)/0.25)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-icons-round text-[rgb(var(--color-primary))]">verified</span>
              <span className="text-sm font-bold text-[rgb(var(--color-primary))]">فحص الملف</span>
            </div>
            <p className="text-xs text-[rgb(var(--color-primary))]/80">يتم التحقق من صحة الملف والإصدار قبل السماح بالاستعادة</p>
          </div>
          <div className="p-4 bg-[rgb(var(--color-secondary)/0.1)] dark:bg-[rgb(var(--color-secondary)/0.15)] rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-secondary)/0.25)] dark:border-[rgb(var(--color-secondary)/0.25)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-icons-round text-[rgb(var(--color-secondary))]">sync</span>
              <span className="text-sm font-bold text-[rgb(var(--color-secondary))] dark:text-[rgb(var(--color-secondary))]">إعادة بناء تلقائي</span>
            </div>
            <p className="text-xs text-[rgb(var(--color-secondary))]/80">بعد الاستعادة يتم إعادة حساب التكاليف وتحديث لوحات التحكم تلقائياً</p>
          </div>
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="سجل النسخ الاحتياطية">
        {historyLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-[var(--color-text-muted)]">
            <span className="material-icons-round animate-spin">refresh</span>
            <span className="text-sm font-bold">جاري التحميل...</span>
          </div>
        ) : backupHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
            <span className="material-icons-round text-4xl mb-2 opacity-30">inventory_2</span>
            <p className="text-sm font-bold">لا يوجد سجل نسخ احتياطية بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backupHistory.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] border border-[var(--color-border)]"
              >
                <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0 ${
                  entry.action === 'export'
                    ? 'bg-[rgb(var(--color-success)/0.1)]'
                    : 'bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)]'
                }`}>
                  <span className={`material-icons-round ${
                    entry.action === 'export'
                      ? 'text-[rgb(var(--color-success))]'
                      : 'text-[rgb(var(--color-primary))]'
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
                    ? 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]'
                    : 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]'
                }`}>
                  {entry.action === 'export' ? 'تصدير' : 'استيراد'}
                </span>
              </div>
            ))}
          </div>
        )}
      </OpsDashPanel>
      {showConfirmRestore && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md">
            <div className="p-6 text-center">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                restoreMode === 'full_reset'
                  ? 'bg-[rgb(var(--color-danger)/0.1)]'
                  : restoreMode === 'replace'
                  ? 'bg-[rgb(var(--color-warning)/0.1)]'
                  : 'bg-[rgb(var(--color-success)/0.1)]'
              }`}>
                <span className={`material-icons-round text-3xl ${
                  restoreMode === 'full_reset'
                    ? 'text-[rgb(var(--color-danger))]'
                    : restoreMode === 'replace'
                    ? 'text-[rgb(var(--color-warning))]'
                    : 'text-[rgb(var(--color-success))]'
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
                {useServerImport
                  ? 'ستتم الاستعادة عبر الخادم (Admin SDK) — بدون نسخة تلقائية من المتصفح.'
                  : skipAutoBackupBeforeRestore
                    ? 'تم اختيار تخطي النسخة التلقائية — لا يوجد احتياطي تلقائي قبل الاستعادة.'
                    : 'سيتم إنشاء نسخة احتياطية تلقائية من المتصفح قبل البدء (إن لم يُختر التخطي).'}
              </p>
              <div className="flex items-center gap-3 justify-center">
                <button
                  onClick={() => setShowConfirmRestore(false)}
                  className="px-5 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-all"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleRestore}
                  className={`px-5 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold text-white transition-all flex items-center gap-2 ${
                    restoreMode === 'full_reset'
                      ? 'bg-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.9)]'
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
        </ManagedModalPortal>
      )}
    </>
  );
};
