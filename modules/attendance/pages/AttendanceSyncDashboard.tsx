import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '@/store/useAppStore';

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const AttendanceSyncDashboard: React.FC = () => {
  const syncAttendanceFromDevices = useAppStore((s) => s.syncAttendanceFromDevices);
  const processDailyAttendance = useAppStore((s) => s.processDailyAttendance);
  const recalculateAttendanceForDate = useAppStore((s) => s.recalculateAttendanceForDate);
  const attendanceIntegration = useAppStore((s) => s.systemSettings.attendanceIntegration);
  const [file, setFile] = useState<File | null>(null);
  const [targetDate, setTargetDate] = useState(getToday);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const watchStatus = useMemo(() => (
    attendanceIntegration?.watchFolderEnabled ? 'مفعل' : 'متوقف'
  ), [attendanceIntegration?.watchFolderEnabled]);

  const handleUpload = async () => {
    if (!file) {
      setMessage('اختر ملف Excel/CSV أولاً');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await syncAttendanceFromDevices({ mode: 'manual_upload', file });
      setMessage(`تم الاستيراد: ${result.importedRows} | مكرر: ${result.dedupedRows} | فشل: ${result.failedRows}`);
    } catch (error) {
      setMessage((error as Error).message || 'فشل الاستيراد');
    } finally {
      setBusy(false);
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
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
      </div>

      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text)]">استيراد يدوي من ملف</h3>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2"
        />
        <button className="erp-filter-apply" onClick={() => void handleUpload()} disabled={busy}>
          <span className="material-icons-round" style={{ fontSize: 14 }}>upload_file</span>
          استيراد الملف
        </button>
      </div>

      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text)]">المعالجة اليومية</h3>
        <div className="erp-filter-date">
          <span className="erp-filter-label">التاريخ</span>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="erp-filter-apply" onClick={() => void handleProcessDate()} disabled={busy}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>auto_fix_high</span>
            معالجة اليوم
          </button>
          <button className="erp-filter-apply" onClick={() => void handleRecalculate()} disabled={busy}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>restart_alt</span>
            إعادة حساب اليوم
          </button>
        </div>
      </div>

      {message && (
        <div className="card p-3 text-sm font-bold text-[var(--color-text)]">
          {message}
        </div>
      )}
    </div>
  );
};
