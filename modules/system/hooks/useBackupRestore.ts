import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';
import {
  backupService,
  validateBackupFile,
  type BackupFile,
  type BackupHistoryEntry,
  type RestoreMode,
} from '../../../services/backupService';
import { importTenantBackupCallable } from '../../../modules/auth/services/firebase';

const RESTORE_MODES: { value: RestoreMode; label: string; icon: string; description: string; color: string }[] = [
  { value: 'merge', label: 'دمج', icon: 'merge', description: 'دمج البيانات الجديدة مع البيانات الحالية — لا يتم حذف أي شيء', color: 'emerald' },
  { value: 'replace', label: 'استبدال', icon: 'swap_horiz', description: 'استبدال المجموعات المشمولة فقط — المجموعات الأخرى تبقى', color: 'amber' },
  { value: 'full_reset', label: 'إعادة تعيين كاملة', icon: 'restart_alt', description: 'حذف كل شيء واستبداله بالنسخة الاحتياطية — عملية لا رجعة فيها', color: 'rose' },
];

type UseBackupRestoreParams = {
  activeTab: string;
  isAdmin: boolean;
};

export const useBackupRestore = ({ activeTab, isAdmin }: UseBackupRestoreParams) => {
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ step: string; percent: number } | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [importFile, setImportFile] = useState<BackupFile | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importValidation, setImportValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [skipAutoBackupBeforeRestore, setSkipAutoBackupBeforeRestore] = useState(false);
  const [useServerImport, setUseServerImport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userProfile = useAppStore((s) => s.userProfile);
  const isSuperAdmin = Boolean(userProfile?.isSuperAdmin);
  const tenantIdForHistory = userProfile?.tenantId || undefined;
  const _loadAppData = useAppStore((s) => s._loadAppData);
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const loadBackupHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const history = await backupService.getHistory();
      setBackupHistory(history);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'backup' && isAdmin) {
      loadBackupHistory();
    }
  }, [activeTab, isAdmin, loadBackupHistory]);

  useEffect(() => {
    if (!isSuperAdmin && useServerImport) {
      setUseServerImport(false);
    }
  }, [isSuperAdmin, useServerImport]);

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

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
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

  const clearImportSelection = useCallback(() => {
    setImportFile(null);
    setImportFileName('');
    setImportValidation(null);
  }, []);

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
    clearImportSelection();

    const runServer = useServerImport && isSuperAdmin;
    let result: { success: boolean; error?: string; restored: number };

    if (runServer) {
      setBackupProgress({ step: 'استعادة عبر الخادم (Admin SDK)...', percent: 40 });
      setJobProgress(jobId, {
        processedRows: 40,
        totalRows: 100,
        statusText: 'استعادة عبر الخادم...',
        status: 'processing',
      });
      try {
        const r = await importTenantBackupCallable(
          currentImportFile as unknown as Record<string, unknown>,
          restoreMode,
          tenantIdForHistory,
        );
        result = { success: true, restored: r.restored };
        setJobProgress(jobId, {
          processedRows: 100,
          totalRows: 100,
          statusText: 'اكتمل',
          status: 'processing',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'فشلت الاستعادة';
        result = { success: false, error: msg, restored: 0 };
      }
    } else {
      result = await backupService.importBackup(
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
        },
        { skipAutoBackupBeforeRestore },
      );
    }

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
  }, [
    importFile,
    importFileName,
    addJob,
    userDisplayName,
    userEmail,
    startJob,
    clearImportSelection,
    restoreMode,
    setJobProgress,
    completeJob,
    _loadAppData,
    fetchSystemSettings,
    loadBackupHistory,
    failJob,
    skipAutoBackupBeforeRestore,
    useServerImport,
    isSuperAdmin,
    tenantIdForHistory,
  ]);

  return {
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
    restoreModes: RESTORE_MODES,
    skipAutoBackupBeforeRestore,
    setSkipAutoBackupBeforeRestore,
    useServerImport,
    setUseServerImport,
    isSuperAdmin,
  };
};
