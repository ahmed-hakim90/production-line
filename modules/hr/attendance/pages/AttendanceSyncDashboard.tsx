import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SelectableTable, type TableColumn } from '@/components/SelectableTable';
import { useAppStore } from '@/store/useAppStore';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { parseAttendanceCSVAuto } from '@/src/services/attendanceProcessor';
import type { RawPunchRecord, AttendanceCSVFormat } from '@/src/services/attendanceProcessor';
import { attendanceImportHistoryService } from '@/modules/hr/attendanceService';
import type { FirestoreAttendanceImportHistory } from '@/modules/hr/types';
import { useJobsStore } from '@/components/background-jobs/useJobsStore';
import * as XLSX from 'xlsx';

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthStart(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

const ATTENDANCE_IMPORT_DRAFT_KEY = 'attendance-import-draft-v1';

type AttendanceImportDraft = {
  fileName: string;
  detectedFormat: AttendanceCSVFormat | null;
  previewCsv: string;
  deletedKeys: string[];
  recordEdits: Array<[string, { checkIn?: string; checkOut?: string }]>;
  savedAt: string;
};

type PreviewParseMeta = {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  parseErrors: string[];
};

function normalizeEmployeeIdentity(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const latinDigits = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
  const withoutExcelDecimal = latinDigits.replace(/\.0+$/, '');
  if (/^\d+$/.test(withoutExcelDecimal)) {
    return String(Number(withoutExcelDecimal));
  }
  return withoutExcelDecimal.toLowerCase();
}

function buildRowsCsv(rows: RawPunchRecord[]): string {
  const header = 'AC-No,"Name","Department","Date","Time"';
  const body = rows.map((row) => `${row.acNo},"${row.acNo}","OUR COMPANY","${row.date}","${row.punches.join(' ')}"`);
  return [header, ...body].join('\n');
}

async function parsePreviewFromFile(file: File): Promise<{ rows: RawPunchRecord[]; format: AttendanceCSVFormat; meta: PreviewParseMeta }> {
  const lowerName = (file.name || '').toLowerCase();
  const isCsvLike = lowerName.endsWith('.csv') || lowerName.endsWith('.txt');
  const isExcelLike = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
  let text = '';

  if (isCsvLike) {
    text = await file.text();
  } else if (isExcelLike) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('الملف لا يحتوي على أوراق بيانات');
    const worksheet = workbook.Sheets[firstSheetName];
    text = XLSX.utils.sheet_to_csv(worksheet);
  } else {
    throw new Error('نوع الملف غير مدعوم. استخدم CSV أو Excel');
  }

  const parsed = parseAttendanceCSVAuto(text);
  if (!parsed.records.length) {
    throw new Error('لم يتم العثور على سجلات صالحة للمعاينة');
  }

  return {
    rows: parsed.records,
    format: parsed.detectedFormat,
    meta: {
      totalRows: parsed.totalRows,
      validRows: parsed.validRows,
      skippedRows: parsed.skippedRows,
      parseErrors: parsed.errors,
    },
  };
}

export const AttendanceSyncDashboard: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const importAttendanceFingerprintCsv = useAppStore((s) => s.importAttendanceFingerprintCsv);
  const employees = useAppStore((s) => s._rawEmployees);
  const processDailyAttendance = useAppStore((s) => s.processDailyAttendance);
  const recalculateAttendanceForDate = useAppStore((s) => s.recalculateAttendanceForDate);
  const deleteAttendanceRecordsByBatch = useAppStore((s) => s.deleteAttendanceRecordsByBatch);
  const attendanceIntegration = useAppStore((s) => s.systemSettings.attendanceIntegration);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);
  const [file, setFile] = useState<File | null>(null);
  const [targetDate, setTargetDate] = useState(getToday);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'new_import' | 'history'>('new_import');
  const [history, setHistory] = useState<FirestoreAttendanceImportHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);
  const [batchRangeStart, setBatchRangeStart] = useState(getMonthStart());
  const [batchRangeEnd, setBatchRangeEnd] = useState(getToday());
  const [historyRangePreset, setHistoryRangePreset] = useState<'month' | 'today' | 'custom'>('month');
  const [previewRows, setPreviewRows] = useState<RawPunchRecord[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'incomplete' | 'absent'>('all');
  const [detectedFormat, setDetectedFormat] = useState<AttendanceCSVFormat | null>(null);
  const [recordEdits, setRecordEdits] = useState<Map<string, { checkIn?: string; checkOut?: string }>>(new Map());
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<PreviewParseMeta | null>(null);

  const watchStatus = useMemo(() => (
    attendanceIntegration?.watchFolderEnabled ? 'مفعل' : 'متوقف'
  ), [attendanceIntegration?.watchFolderEnabled]);

  const visibleRecords = useMemo(() => {
    const base = previewRows.filter((row) => !deletedKeys.has(`${row.acNo}|${row.date}`));
    if (previewFilter === 'absent') {
      return base.filter((row) => row.punches.length === 0);
    }
    if (previewFilter === 'incomplete') {
      return base.filter((row) => row.punches.length === 1);
    }
    return base;
  }, [previewRows, deletedKeys, previewFilter]);

  const previewDiagnostics = useMemo(() => {
    const activeRows = previewRows.filter((row) => !deletedKeys.has(`${row.acNo}|${row.date}`));
    const employeeAcNoSet = new Set(
      employees
        .flatMap((employee) => [normalizeEmployeeIdentity(employee.acNo), normalizeEmployeeIdentity(employee.code)])
        .filter(Boolean),
    );
    const rowKeyCount = new Map<string, number>();
    const duplicateKeys = new Set<string>();

    for (const row of activeRows) {
      const key = `${row.acNo}|${row.date}`;
      const count = (rowKeyCount.get(key) || 0) + 1;
      rowKeyCount.set(key, count);
      if (count > 1) duplicateKeys.add(key);
    }

    const missingEmployeeRows = activeRows.filter((row) => !employeeAcNoSet.has(normalizeEmployeeIdentity(row.acNo)));
    const incompleteRows = activeRows.filter((row) => row.punches.length === 1);
    const emptyPunchRows = activeRows.filter((row) => row.punches.length === 0);

    return {
      activeCount: activeRows.length,
      duplicateCount: duplicateKeys.size,
      duplicateExamples: Array.from(duplicateKeys).slice(0, 10),
      missingEmployeeCount: missingEmployeeRows.length,
      missingEmployeeExamples: Array.from(new Set(missingEmployeeRows.map((row) => row.acNo))).slice(0, 10),
      incompleteCount: incompleteRows.length,
      emptyPunchCount: emptyPunchRows.length,
    };
  }, [deletedKeys, employees, previewRows]);

  const previewIssueByRowKey = useMemo(() => {
    const activeRows = previewRows.filter((row) => !deletedKeys.has(`${row.acNo}|${row.date}`));
    const employeeIdentitySet = new Set(
      employees
        .flatMap((employee) => [normalizeEmployeeIdentity(employee.acNo), normalizeEmployeeIdentity(employee.code)])
        .filter(Boolean),
    );
    const keyCount = new Map<string, number>();
    activeRows.forEach((row) => {
      const key = `${normalizeEmployeeIdentity(row.acNo)}|${row.date}`;
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });

    const issueMap = new Map<string, 'error' | 'duplicate' | 'warning'>();
    activeRows.forEach((row) => {
      const rowKey = `${row.acNo}|${row.date}`;
      const normalizedKey = `${normalizeEmployeeIdentity(row.acNo)}|${row.date}`;
      const hasMissingEmployee = !employeeIdentitySet.has(normalizeEmployeeIdentity(row.acNo));
      const isDuplicate = (keyCount.get(normalizedKey) || 0) > 1;
      const hasWarning = row.punches.length <= 1;
      if (hasMissingEmployee) {
        issueMap.set(rowKey, 'error');
      } else if (isDuplicate) {
        issueMap.set(rowKey, 'duplicate');
      } else if (hasWarning) {
        issueMap.set(rowKey, 'warning');
      }
    });
    return issueMap;
  }, [deletedKeys, employees, previewRows]);

  const historyTableColumns = useMemo<TableColumn<FirestoreAttendanceImportHistory>[]>(() => [
    {
      id: 'importedAt',
      header: 'التاريخ',
      render: (row) => row.importedAt?.toDate?.()?.toLocaleString('ar-EG') || '—',
      sortKey: (row) => row.importedAt?.toDate?.()?.getTime?.() || 0,
    },
    { id: 'fileName', header: 'الملف', render: (row) => row.fileName || '—', sortKey: (row) => row.fileName || '' },
    {
      id: 'processedRecords',
      header: 'السجلات',
      render: (row) => row.processedRecords,
      sortKey: (row) => row.processedRecords,
    },
    {
      id: 'status',
      header: 'الحالة',
      render: (row) => (row.status === 'completed' ? 'مكتمل' : 'جزئي'),
      sortKey: (row) => row.status || '',
    },
    {
      id: 'format',
      header: 'تنسيق',
      render: (row) => (row.format === 'zk_export' ? 'تصدير' : 'قياسي'),
      sortKey: (row) => row.format || '',
    },
  ], []);

  const previewTableColumns = useMemo<TableColumn<RawPunchRecord>[]>(() => [
    {
      id: 'acNo',
      header: 'الكود',
      render: (row) => row.acNo,
      sortKey: (row) => row.acNo || '',
    },
    {
      id: 'date',
      header: 'التاريخ',
      render: (row) => row.date,
      sortKey: (row) => row.date || '',
    },
    {
      id: 'rawPunches',
      header: 'البصمات الخام',
      render: (row) => {
        const key = `${row.acNo}|${row.date}`;
        return (
          <div className="flex flex-wrap gap-1">
            {row.punches.length === 0 ? (
              <span className="text-xs text-[var(--color-text-muted)]">—</span>
            ) : row.punches.map((p) => (
              <span key={`${key}-${p}`} className="px-2 py-0.5 rounded bg-[#f0f2f5] border border-[var(--color-border)] text-xs font-mono">{p}</span>
            ))}
          </div>
        );
      },
      sortKey: (row) => row.punches.join(' '),
    },
    {
      id: 'checkIn',
      header: 'الدخول',
      render: (row) => {
        const key = `${row.acNo}|${row.date}`;
        const edit = recordEdits.get(key);
        return (
          <input
            value={edit?.checkIn ?? row.punches[0] ?? ''}
            onChange={(e) => {
              const next = new Map(recordEdits);
              next.set(key, { ...(next.get(key) || {}), checkIn: e.target.value });
              setRecordEdits(next);
            }}
            className="erp-filter-input-inner"
            placeholder="07:57"
          />
        );
      },
      sortKey: (row) => {
        const key = `${row.acNo}|${row.date}`;
        const edit = recordEdits.get(key);
        return edit?.checkIn ?? row.punches[0] ?? '';
      },
    },
    {
      id: 'checkOut',
      header: 'الخروج',
      render: (row) => {
        const key = `${row.acNo}|${row.date}`;
        const edit = recordEdits.get(key);
        return (
          <input
            value={edit?.checkOut ?? row.punches[row.punches.length - 1] ?? ''}
            onChange={(e) => {
              const next = new Map(recordEdits);
              next.set(key, { ...(next.get(key) || {}), checkOut: e.target.value });
              setRecordEdits(next);
            }}
            className="erp-filter-input-inner"
            placeholder="14:39"
          />
        );
      },
      sortKey: (row) => {
        const key = `${row.acNo}|${row.date}`;
        const edit = recordEdits.get(key);
        return edit?.checkOut ?? row.punches[row.punches.length - 1] ?? '';
      },
    },
  ], [recordEdits]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ATTENDANCE_IMPORT_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as AttendanceImportDraft;
      if (!draft?.previewCsv) return;
      const parsed = parseAttendanceCSVAuto(draft.previewCsv);
      if (!parsed.records.length) return;
      setPreviewRows(parsed.records);
      setDetectedFormat(draft.detectedFormat || parsed.detectedFormat);
      setPreviewMeta({
        totalRows: parsed.totalRows,
        validRows: parsed.validRows,
        skippedRows: parsed.skippedRows,
        parseErrors: parsed.errors,
      });
      setFileName(draft.fileName || 'attendance-draft.csv');
      setDeletedKeys(new Set(draft.deletedKeys || []));
      setRecordEdits(new Map(draft.recordEdits || []));
      setDraftRestored(true);
      setMessage('تم استرجاع مسودة الاستيراد المحلية. يمكنك المتابعة من حيث توقفت.');
    } catch {
      localStorage.removeItem(ATTENDANCE_IMPORT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (previewRows.length === 0) return;
    const draft: AttendanceImportDraft = {
      fileName: fileName || 'attendance-draft.csv',
      detectedFormat,
      previewCsv: buildRowsCsv(previewRows),
      deletedKeys: Array.from(deletedKeys),
      recordEdits: Array.from(recordEdits.entries()),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(ATTENDANCE_IMPORT_DRAFT_KEY, JSON.stringify(draft));
  }, [previewRows, deletedKeys, recordEdits, fileName, detectedFormat]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await attendanceImportHistoryService.getAll();
      setHistory(rows);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'history') {
      void loadHistory();
    }
  }, [tab]);

  const patchRowTimes = (row: RawPunchRecord): RawPunchRecord => {
    const key = `${row.acNo}|${row.date}`;
    const edit = recordEdits.get(key);
    if (!edit) return row;
    const times = [edit.checkIn, edit.checkOut]
      .map((value) => String(value || '').trim())
      .filter((value) => /^\d{2}:\d{2}$/.test(value));
    return { ...row, punches: times };
  };

  const buildPreviewCsv = (): string => {
    const header = 'AC-No,"Name","Department","Date","Time"';
    const rows = previewRows
      .filter((row) => !deletedKeys.has(`${row.acNo}|${row.date}`))
      .map((row) => patchRowTimes(row))
      .map((row) => `${row.acNo},"${row.acNo}","OUR COMPANY","${row.date}","${row.punches.join(' ')}"`);
    return [header, ...rows].join('\n');
  };

  const clearPreviewDraft = () => {
    setPreviewRows([]);
    setDeletedKeys(new Set());
    setRecordEdits(new Map());
    setDetectedFormat(null);
    setFileName('');
    setDraftRestored(false);
    setPreviewMeta(null);
    localStorage.removeItem(ATTENDANCE_IMPORT_DRAFT_KEY);
  };

  const applyHistoryRangePreset = (preset: 'month' | 'today') => {
    if (preset === 'today') {
      const today = getToday();
      setBatchRangeStart(today);
      setBatchRangeEnd(today);
      setHistoryRangePreset('today');
      return;
    }
    setBatchRangeStart(getMonthStart());
    setBatchRangeEnd(getToday());
    setHistoryRangePreset('month');
  };

  const handlePreparePreview = async () => {
    if (!file) {
      setMessage('اختر ملف Excel/CSV أولاً للمعاينة');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const parsed = await parsePreviewFromFile(file);
      setPreviewRows(parsed.rows);
      setDetectedFormat(parsed.format);
      setPreviewMeta(parsed.meta);
      setFileName(file.name || 'attendance.csv');
      setDeletedKeys(new Set());
      setRecordEdits(new Map());
      setDraftRestored(false);
      setMessage(`تمت المعاينة محليًا: ${parsed.rows.length} سجل — لن يتم الرفع إلا بعد الضغط على "اعتماد ورفع للداتابيز"`);
    } catch (error) {
      setMessage((error as Error).message || 'فشلت قراءة الملف محليًا');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (previewRows.length === 0) {
      setMessage('اعمل معاينة للملف أولًا قبل الرفع');
      return;
    }
    setBusy(true);
    setMessage('');
    setProgress({ done: 0, total: 0 });
    setPanelHidden(false);
    setPanelMinimized(false);
    setMessage('بدأت عملية الرفع. يمكنك متابعة التقدم مباشرة من بانل المهام.');
    try {
      const importSourceFile = new File([buildPreviewCsv()], fileName || 'attendance.csv', { type: 'text/csv' });

      const result = await importAttendanceFingerprintCsv({
        file: importSourceFile,
        importLabel: `fingerprint-${new Date().toISOString().slice(0, 7)}`,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      if (result.batchId) {
        setMessage('تم رفع السجلات، جاري حفظ سجل الاستيراد في قاعدة البيانات...');
        await attendanceImportHistoryService.save({
          batchId: result.batchId,
          fileName: fileName || file.name || 'attendance.csv',
          importedBy: uid || '',
          importedByName: userDisplayName || '',
          totalPunches: result.totalRows,
          processedRecords: result.importedRows,
          unmatchedCodes: result.errors.filter((e) => e.includes('mapping failed')),
          format: result.detectedFormat || detectedFormat || 'zk_export',
          status: result.errors.some((e) => e.includes('mapping failed')) ? 'partial' : 'completed',
        });
      }

      setMessage(`تم الاستيراد: ${result.importedRows} | مكرر: ${result.dedupedRows} | فشل: ${result.failedRows}`);
      clearPreviewDraft();
      setFile(null);
      setDetectedFormat(result.detectedFormat || detectedFormat);
    } catch (error) {
      setMessage(`${(error as Error).message || 'فشل الاستيراد'} — تم الاحتفاظ بالمسودة محليًا لإعادة المحاولة`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    setDeletingBatchId(batchId);
    setConfirmDeleteBatchId(null);
    const jobId = addJob({
      fileName: batchId,
      jobType: 'Attendance Import Delete',
      totalRows: 1,
      startedBy: userDisplayName || 'System',
    });
    startJob(jobId, 'Deleting imported attendance batch...');
    try {
      const recordsResult = await deleteAttendanceRecordsByBatch(batchId);
      const result = await attendanceImportHistoryService.deleteByBatchId(batchId);
      completeJob(jobId, {
        addedRows: 0,
        failedRows: 0,
        statusText: `Deleted records ${recordsResult.deleted} + logs ${result.deletedLogs} + raw ${result.deletedRaw}`,
      });
      setMessage(`تم حذف الدفعة: ${batchId}`);
      await loadHistory();
    } catch (error) {
      failJob(jobId, (error as Error).message || 'Delete failed', 'Failed');
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleDeleteBatchRange = async (batchId: string) => {
    if (!batchRangeStart || !batchRangeEnd) {
      setMessage('حدد نطاق التاريخ أولاً');
      return;
    }
    if (batchRangeStart > batchRangeEnd) {
      setMessage('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return;
    }
    const confirmed = window.confirm(`سيتم حذف سجلات الدفعة ${batchId} من ${batchRangeStart} إلى ${batchRangeEnd}. متابعة؟`);
    if (!confirmed) return;

    setDeletingBatchId(batchId);
    try {
      const result = await deleteAttendanceRecordsByBatch(batchId, {
        startDate: batchRangeStart,
        endDate: batchRangeEnd,
      });
      setMessage(`تم حذف ${result.deleted} سجل من الدفعة ${batchId} داخل النطاق المحدد`);
    } catch (error) {
      setMessage((error as Error).message || 'فشل الحذف الجزئي');
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleProcessDate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await processDailyAttendance(targetDate);
      setMessage(`تمت المعالجة ليوم ${targetDate}: ${result.recordsUpserted} سجل`);
    } catch (error) {
      setMessage((error as Error).message || 'فشلت المعالجة');
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await recalculateAttendanceForDate(targetDate);
      setMessage(`تمت إعادة الحساب: ${result.recordsUpserted} سجل`);
    } catch (error) {
      setMessage((error as Error).message || 'فشلت إعادة الحساب');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة مزامنة الحضور"
        subtitle="استيراد ملفات ZKTeco ومعالجة السجلات اليومية"
        icon="sync"
        extra={(
          <label className="erp-filter-date">
            <span className="erp-filter-label">تاريخ المعالجة</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        secondaryAction={{
          label: tab === 'new_import' ? 'سجل الاستيراد' : 'استيراد جديد',
          icon: tab === 'new_import' ? 'search' : 'add',
          onClick: () => {
            const nextTab = tab === 'new_import' ? 'history' : 'new_import';
            setTab(nextTab);
            if (nextTab === 'history') {
              void loadHistory();
            }
          },
          disabled: busy || historyLoading,
        }}
        moreActions={[
          {
            label: 'تحديث سجل الاستيراد',
            icon: 'refresh',
            group: 'السجل',
            onClick: () => {
              setTab('history');
              void loadHistory();
            },
            disabled: historyLoading,
          },
          {
            label: 'قواعد البصمة للورديات',
            icon: 'settings',
            group: 'الإعدادات',
            onClick: () => {
              openModal(MODAL_KEYS.ATTENDANCE_SHIFT_RULES);
            },
            dataModalKey: MODAL_KEYS.ATTENDANCE_SHIFT_RULES,
          },
          {
            label: 'إشعار توقيع (معالجة يدوية)',
            icon: 'edit',
            group: 'الإعدادات',
            onClick: () => {
              openModal(MODAL_KEYS.ATTENDANCE_SIGNATURE_FIX);
            },
            dataModalKey: MODAL_KEYS.ATTENDANCE_SIGNATURE_FIX,
          },
          {
            label: 'معالجة اليوم المحدد',
            icon: 'check',
            group: 'المعالجة اليومية',
            onClick: () => {
              void handleProcessDate();
            },
            disabled: busy,
          },
          {
            label: 'إعادة حساب اليوم المحدد',
            icon: 'refresh',
            group: 'المعالجة اليومية',
            onClick: () => {
              void handleRecalculate();
            },
            disabled: busy,
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="erp-kpi-card">
          <div className="erp-kpi-label">حالة المجلد المراقب</div>
          <div className="erp-kpi-value">{watchStatus}</div>
        </div>
        <div className="erp-kpi-card">
          <div className="erp-kpi-label">المسار</div>
          <div className="text-sm font-bold truncate">{attendanceIntegration?.watchFolderPath || 'غير محدد'}</div>
        </div>
        <div className="erp-kpi-card">
          <div className="erp-kpi-label">نمط الملفات</div>
          <div className="text-sm font-bold">{attendanceIntegration?.importFilePattern || '*.xlsx,*.xls,*.csv'}</div>
        </div>
        <div className="erp-kpi-card">
          <div className="erp-kpi-label">سجل الاستيراد</div>
          <div className="erp-kpi-value">{history.length}</div>
        </div>
      </div>

      <div className="erp-filter-bar">
        <div className="erp-date-seg">
          <button
            type="button"
            className={`erp-date-seg-btn ${tab === 'new_import' ? 'active' : ''}`}
            onClick={() => setTab('new_import')}
          >
            استيراد جديد
          </button>
          <button
            type="button"
            className={`erp-date-seg-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setTab('history');
              void loadHistory();
            }}
          >
            سجل الاستيراد ({history.length})
          </button>
        </div>

        {tab === 'history' && (
          <>
            <div className="erp-date-seg">
              <button
                type="button"
                className={`erp-date-seg-btn ${historyRangePreset === 'today' ? 'active' : ''}`}
                onClick={() => applyHistoryRangePreset('today')}
              >
                اليوم
              </button>
              <button
                type="button"
                className={`erp-date-seg-btn ${historyRangePreset === 'month' ? 'active' : ''}`}
                onClick={() => applyHistoryRangePreset('month')}
              >
                هذا الشهر
              </button>
            </div>

            <label className="erp-filter-date">
              <span className="erp-filter-label">من</span>
              <input
                type="date"
                value={batchRangeStart}
                onChange={(e) => {
                  setHistoryRangePreset('custom');
                  setBatchRangeStart(e.target.value);
                }}
              />
            </label>
            <label className="erp-filter-date">
              <span className="erp-filter-label">إلى</span>
              <input
                type="date"
                value={batchRangeEnd}
                onChange={(e) => {
                  setHistoryRangePreset('custom');
                  setBatchRangeEnd(e.target.value);
                }}
              />
            </label>
            <button className="erp-filter-apply" onClick={() => void loadHistory()} disabled={historyLoading}>
              <span className="material-icons-round text-sm">sync</span>
              {historyLoading ? 'جار التحميل...' : 'تحديث'}
            </button>
          </>
        )}
      </div>

      {tab === 'history' && (
        <div className="card p-4 space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            الحذف الجزئي حسب نطاق التاريخ على الدفعة المحددة فقط.
          </p>
          {historyLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">جار التحميل...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">لا يوجد سجل استيراد.</div>
          ) : (
            <SelectableTable<FirestoreAttendanceImportHistory>
              data={history}
              columns={historyTableColumns}
              getId={(row) => row.id || row.batchId}
              renderActions={(row) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    className="p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50 transition-all"
                    disabled={deletingBatchId === row.batchId}
                    onClick={() => void handleDeleteBatchRange(row.batchId)}
                    title="حذف بالنطاق"
                  >
                    <span className="material-icons-round text-sm">date_range</span>
                  </button>
                  <button
                    className="p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 transition-all"
                    disabled={deletingBatchId === row.batchId}
                    onClick={() => setConfirmDeleteBatchId(row.batchId)}
                    title={deletingBatchId === row.batchId ? 'جاري الحذف...' : 'حذف'}
                  >
                    <span className="material-icons-round text-sm">
                      {deletingBatchId === row.batchId ? 'hourglass_top' : 'delete'}
                    </span>
                  </button>
                </div>
              )}
              actionsHeader="إجراءات"
              tableId="attendance-sync-history"
              pageSize={15}
              enableSearch={true}
              searchPlaceholder="بحث باسم الملف أو الحالة أو التنسيق"
              enableColumnVisibility={true}
              checkboxSelection={false}
              loading={historyLoading}
            />
          )}
        </div>
      )}

      {tab === 'new_import' && (
        <>

      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text)]">استيراد يدوي من ملف</h3>
        {detectedFormat && (
          <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] text-xs font-bold">
            {detectedFormat === 'zk_export' ? 'تنسيق ZK تصدير' : 'تنسيق ZK قياسي'}
          </div>
        )}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            clearPreviewDraft();
          }}
          className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2"
        />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {previewRows.length > 0 && (
            <button
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] border border-rose-200 dark:border-rose-900/30 transition-colors"
              onClick={clearPreviewDraft}
              disabled={busy}
              title="مسح البيانات المؤقتة"
            >
              <span className="material-icons-round" style={{ fontSize: 14 }}>delete_sweep</span>
              مسح المسودة
            </button>
          )}

          <div className="flex-1" />

          <button className="btn btn-secondary text-xs" onClick={() => void handlePreparePreview()} disabled={busy || !file}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>visibility</span>
            معاينة محلية
          </button>
          <button className="btn btn-primary text-xs" onClick={() => void handleUpload()} disabled={busy || previewRows.length === 0}>
            {busy ? (
              <>
                <span className="material-icons-round animate-spin" style={{ fontSize: 14 }}>sync</span>
                جاري الرفع...
              </>
            ) : (
              <>
                <span className="material-icons-round" style={{ fontSize: 14 }}>cloud_upload</span>
                اعتماد ورفع البيانات
              </>
            )}
          </button>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          يتم حفظ المعاينة محليًا تلقائيًا حتى لا تضيع التعديلات عند انقطاع الإنترنت أو إغلاق المتصفح.
          {draftRestored && ' (تم استرجاع مسودة سابقة)'}
        </div>
        {busy && progress.total > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-[var(--color-text-muted)]">
              {`جاري الرفع... ${progress.done}/${progress.total}`}
            </div>
            <div className="erp-progress-wrap">
              <div
                className="erp-progress-bar striped"
                style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {previewRows.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 py-2">
              <div className="text-[11px] text-[var(--color-text-muted)]">إجمالي الملف</div>
              <div className="text-sm font-bold">{previewMeta?.totalRows ?? previewRows.length}</div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <div className="text-[11px] text-emerald-700">سجلات المعاينة</div>
              <div className="text-sm font-bold text-emerald-700">{previewDiagnostics.activeCount}</div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50/60 px-3 py-2">
              <div className="text-[11px] text-rose-700">أخطاء القراءة</div>
              <div className="text-sm font-bold text-rose-700">{(previewMeta?.skippedRows || 0) + (previewMeta?.parseErrors.length || 0)}</div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50/60 px-3 py-2">
              <div className="text-[11px] text-rose-700">فشل مطابقة الموظف</div>
              <div className="text-sm font-bold text-rose-700">{previewDiagnostics.missingEmployeeCount}</div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-orange-200 bg-orange-50/60 px-3 py-2">
              <div className="text-[11px] text-orange-700">مكرر (AC-No + تاريخ)</div>
              <div className="text-sm font-bold text-orange-700">{previewDiagnostics.duplicateCount}</div>
            </div>
            <div className="rounded-[var(--border-radius-base)] border border-amber-200 bg-amber-50/60 px-3 py-2">
              <div className="text-[11px] text-amber-700">تنبيهات</div>
              <div className="text-sm font-bold text-amber-700">{previewDiagnostics.incompleteCount + previewDiagnostics.emptyPunchCount}</div>
            </div>
          </div>

          {previewMeta && (previewMeta.skippedRows > 0 || previewMeta.parseErrors.length > 0) && (
            <div className="rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700 space-y-1">
              <div className="font-bold">أخطاء الملف/القراءة:</div>
              {previewMeta.skippedRows > 0 && (
                <div>تم تخطي {previewMeta.skippedRows} صف أثناء قراءة الملف.</div>
              )}
              {previewMeta.parseErrors.slice(0, 5).map((err) => (
                <div key={err}>- {err}</div>
              ))}
            </div>
          )}

          {previewDiagnostics.missingEmployeeCount > 0 && (
            <div className="rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700 space-y-1">
              <div className="font-bold">أكواد غير مرتبطة بموظف (ستفشل عند الرفع):</div>
              <div>{previewDiagnostics.missingEmployeeExamples.join(' ، ')}</div>
            </div>
          )}

          {previewDiagnostics.duplicateCount > 0 && (
            <div className="rounded-[var(--border-radius-base)] border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs text-orange-700 space-y-1">
              <div className="font-bold">سجلات مكررة داخل المعاينة:</div>
              <div>{previewDiagnostics.duplicateExamples.join(' ، ')}</div>
            </div>
          )}

          {(previewDiagnostics.incompleteCount > 0 || previewDiagnostics.emptyPunchCount > 0) && (
            <div className="rounded-[var(--border-radius-base)] border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 space-y-1">
              <div className="font-bold">تنبيهات:</div>
              {previewDiagnostics.incompleteCount > 0 && <div>- {previewDiagnostics.incompleteCount} سجل يحتوي على بصمة واحدة فقط.</div>}
              {previewDiagnostics.emptyPunchCount > 0 && <div>- {previewDiagnostics.emptyPunchCount} سجل بدون بصمات.</div>}
            </div>
          )}

          <div className="erp-filter-bar">
            <select
              value={previewFilter}
              onChange={(e) => setPreviewFilter(e.target.value as 'all' | 'incomplete' | 'absent')}
              className="erp-filter-select"
            >
              <option value="all">كل السجلات</option>
              <option value="incomplete">بصمة واحدة فقط</option>
              <option value="absent">بدون بصمات</option>
            </select>
          </div>
          <SelectableTable<RawPunchRecord>
            data={visibleRecords}
            columns={previewTableColumns}
            getId={(row) => `${row.acNo}|${row.date}`}
            getRowClassName={(row) => {
              const issue = previewIssueByRowKey.get(`${row.acNo}|${row.date}`);
              if (issue === 'error') return 'bg-rose-50/70 dark:bg-rose-900/15';
              if (issue === 'duplicate') return 'bg-orange-50/70 dark:bg-orange-900/15';
              if (issue === 'warning') return 'bg-amber-50/60 dark:bg-amber-900/10';
              return '';
            }}
            renderActions={(row) => {
              const key = `${row.acNo}|${row.date}`;
              return (
                <button
                  className="p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 transition-all"
                  onClick={() => {
                    const next = new Set(deletedKeys);
                    next.add(key);
                    setDeletedKeys(next);
                  }}
                  title="حذف السجل من المعاينة"
                >
                  <span className="material-icons-round text-sm">delete</span>
                </button>
              );
            }}
            actionsHeader="إجراءات"
            tableId="attendance-sync-preview"
            pageSize={25}
            enableSearch={true}
            searchPlaceholder="بحث بالكود أو التاريخ أو البصمات"
            enableColumnVisibility={true}
            checkboxSelection={false}
          />
        </div>
      )}

      {message && (
        <div className="card p-3 text-sm font-bold text-[var(--color-text)]">
          {message}
        </div>
      )}
        </>
      )}

      {confirmDeleteBatchId && (
        <div className="fixed inset-0 bg-black/35 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 w-full max-w-md space-y-3">
            <div className="text-sm font-bold">تأكيد حذف الدفعة</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              سيتم حذف السجلات المرتبطة بالدفعة: {confirmDeleteBatchId}
            </div>
            <div className="flex justify-end gap-2">
              <button className="erp-filter-apply !bg-slate-500" onClick={() => setConfirmDeleteBatchId(null)}>إلغاء</button>
              <button className="erp-filter-apply !bg-rose-600" onClick={() => void handleDeleteBatch(confirmDeleteBatchId)}>تأكيد الحذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
