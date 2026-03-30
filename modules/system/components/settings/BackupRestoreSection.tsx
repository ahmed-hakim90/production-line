import React from 'react';
import { Card, Button } from '../UI';
import type {
  BackupFile,
  BackupHistoryEntry,
  FirebaseUsageEstimate,
  RestoreMode,
} from '../../../../services/backupService';

type BackupRestoreSectionProps = {
  isAdmin: boolean;
  backupMessage: { type: 'success' | 'error'; text: string } | null;
  setBackupMessage: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
  backupProgress: { step: string; percent: number } | null;
  loadFirebaseUsage: () => Promise<void>;
  firebaseUsageLoading: boolean;
  backupLoading: boolean;
  firebaseUsage: FirebaseUsageEstimate | null;
  projectId: string;
  firebaseUsageError: string;
  formatBytes: (bytes: number) => string;
  firestoreRemainingBytes: number;
  firestoreUsagePercent: number;
  sparkDaily: { reads: number; writes: number; deletes: number };
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
};

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  isAdmin,
  backupMessage,
  setBackupMessage,
  backupProgress,
  loadFirebaseUsage,
  firebaseUsageLoading,
  backupLoading,
  firebaseUsage,
  projectId,
  firebaseUsageError,
  formatBytes,
  firestoreRemainingBytes,
  firestoreUsagePercent,
  sparkDaily,
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
}) => {
  if (!isAdmin) return null;

  return (
    <>
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
                <p>Reads: {sparkDaily.reads.toLocaleString('ar-EG')} / اليوم</p>
                <p>Writes: {sparkDaily.writes.toLocaleString('ar-EG')} / اليوم</p>
                <p>Deletes: {sparkDaily.deletes.toLocaleString('ar-EG')} / اليوم</p>
                <p className="pt-1">مهم: العدادات اليومية الفعلية (Reads/Writes/Deletes) لا يتيحها Firebase Web SDK مباشرة؛ راجعها بدقة من Firebase Console.</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="تصدير نسخة احتياطية">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary text-xl">cloud_download</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">نسخة احتياطية كاملة</p>
                <p className="text-xs text-slate-400">تصدير جميع البيانات — المنتجات، خطط الإنتاج، التقارير، أوامر الشغل، الإشعارات، التكاليف، الخامات، تعيينات العمال، الموارد البشرية، المركبات، والإعدادات</p>
              </div>
            </div>
            <Button onClick={handleExportFull} disabled={backupLoading}>
              {backupLoading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">download</span>
              تصدير كامل
            </Button>
          </div>

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

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-[var(--border-radius-lg)] bg-violet-500/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-violet-600 text-xl">tune</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text)]">الإعدادات فقط</p>
                <p className="text-xs text-slate-400">تصدير إعدادات النظام والأدوار، إعدادات العمالة، خامات المنتجات، وإعدادات الموارد البشرية</p>
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

      <Card title="المجموعات المشمولة في النسخة الكاملة">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: 'الإنتاج', icon: 'factory', color: 'text-primary', items: ['المنتجات', 'خطوط الإنتاج', 'تقارير الإنتاج', 'خطط الإنتاج', 'حالة الخطط', 'إعدادات خط المنتج'] },
            { title: 'أوامر الشغل والإشعارات', icon: 'assignment', color: 'text-amber-600', items: ['أوامر الشغل', 'الإشعارات', 'تعيينات العمال على الخطوط', 'أحداث المسح'] },
            { title: 'المخزون والمستودعات', icon: 'inventory_2', color: 'text-cyan-600', items: ['المستودعات', 'الخامات', 'أرصدة المخزون', 'حركات المخزون', 'جرد المخزون', 'طلبات تحويل المخزون'] },
            { title: 'التكاليف والخامات', icon: 'payments', color: 'text-emerald-600', items: ['خامات المنتجات', 'تكاليف الإنتاج الشهرية', 'مراكز التكلفة', 'قيم مراكز التكلفة', 'توزيعات التكلفة', 'إعدادات العمالة'] },
            { title: 'النظام والإعدادات', icon: 'settings', color: 'text-blue-600', items: ['إعدادات النظام', 'الأدوار والصلاحيات', 'المستخدمين', 'سجل النشاط'] },
            { title: 'الموارد البشرية', icon: 'groups', color: 'text-violet-600', items: ['الموظفين', 'الأقسام', 'المسميات الوظيفية', 'الورديات', 'إعدادات HR', 'الحضور والانصراف', 'الإجازات', 'القروض', 'البدلات', 'التقييمات', 'المركبات', 'قواعد الجزاءات', 'قواعد التأخير', 'أنواع البدلات'] },
            { title: 'الرواتب والموافقات', icon: 'account_balance', color: 'text-rose-600', items: ['أشهر الرواتب', 'سجلات الرواتب', 'تدقيق الرواتب', 'ملخص تكلفة الرواتب', 'مسارات الموافقة', 'إعدادات الموافقة', 'التفويضات', 'تدقيق الموافقات'] },
            { title: 'الجودة', icon: 'verified', color: 'text-fuchsia-600', items: ['إعدادات الجودة', 'قاموس أسباب الجودة', 'تعيينات الجودة', 'فحوصات الجودة', 'عيوب الجودة', 'أوامر إعادة العمل', 'إجراءات CAPA', 'سجلات تدقيق الجودة'] },
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

      <Card title="استعادة من نسخة احتياطية">
        <div className="space-y-6">
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
                    onClick={onClearImportSelection}
                    className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100 transition-all"
                  >
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                )}
              </div>
            </div>

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

          {importFile && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[var(--color-text)]">وضع الاستعادة</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {restoreModes.map((mode) => {
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

      <Card title="سجل النسخ الاحتياطية">
        {historyLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
            <span className="material-icons-round animate-spin">refresh</span>
            <span className="text-sm font-bold">جاري التحميل...</span>
          </div>
        ) : backupHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <span className="material-icons-round text-4xl mb-2 opacity-30">inventory_2</span>
            <p className="text-sm font-bold">لا يوجد سجل نسخ احتياطية بعد</p>
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
  );
};
