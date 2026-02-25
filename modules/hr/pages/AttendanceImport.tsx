import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { getDocs } from 'firebase/firestore';
import { parseCSV, processBatch } from '../attendanceProcessor';
import { attendanceRawLogService, attendanceLogService } from '../attendanceService';
import { employeeService } from '../employeeService';
import { shiftsRef, lateRulesRef } from '../collections';
import { getConfigModule } from '../config';
import type {
  CSVParseResult,
  AttendanceBatchResult,
  EmployeeCodeMap,
  FirestoreShift,
  FirestoreLateRule,
  DayOfWeek,
} from '../types';
import type { GeneralConfig } from '../config/types';
import type { FirestoreEmployee } from '@/types';
import { useAppStore } from '../../../store/useAppStore';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';

const FALLBACK_SHIFT: FirestoreShift = {
  id: 'default',
  name: 'الوردية الرئيسية',
  startTime: '08:00',
  endTime: '16:00',
  breakMinutes: 30,
  lateGraceMinutes: 5,
  crossesMidnight: false,
  isActive: true,
};

const FALLBACK_WEEKLY_OFF: DayOfWeek[] = ['friday'];

type ImportStep = 'upload' | 'preview' | 'processing' | 'done';

export const AttendanceImport: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const [step, setStep] = useState<ImportStep>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [batchResult, setBatchResult] = useState<AttendanceBatchResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [shift, setShift] = useState<FirestoreShift>(FALLBACK_SHIFT);
  const [lateRules, setLateRules] = useState<FirestoreLateRule[]>([]);
  const [weeklyOffDays, setWeeklyOffDays] = useState<DayOfWeek[]>(FALLBACK_WEEKLY_OFF);
  const [codeMap, setCodeMap] = useState<EmployeeCodeMap>({});

  useEffect(() => {
    async function loadSettings() {
      try {
        const [shiftsSnap, lateRulesSnap, employees, generalConfig] = await Promise.all([
          getDocs(shiftsRef()),
          getDocs(lateRulesRef()),
          employeeService.getAll(),
          getConfigModule('general').catch(() => null),
        ]);

        const shifts = shiftsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as FirestoreShift))
          .filter((s) => s.isActive);
        if (shifts.length > 0) {
          setShift(shifts[0]);
        }

        const rules = lateRulesSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as FirestoreLateRule),
        );
        setLateRules(rules);

        if (generalConfig) {
          const gc = generalConfig as GeneralConfig;
          if (gc.weeklyOffDays && gc.weeklyOffDays.length > 0) {
            setWeeklyOffDays(gc.weeklyOffDays);
          }
        }

        const map: EmployeeCodeMap = {};
        employees.forEach((emp: FirestoreEmployee) => {
          if (emp.code && emp.id) {
            map[emp.code] = emp.id;
          }
        });
        setCodeMap(map);
      } catch (err) {
        console.error('Failed to load attendance settings:', err);
      } finally {
        setSettingsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);

      const result = parseCSV(text);
      setParseResult(result);
      setStep('preview');
    };
    reader.readAsText(file);
  }, []);

  const handleProcess = useCallback(() => {
    if (!csvText) return;
    setStep('processing');

    // run in next tick to allow UI update
    setTimeout(() => {
      const result = processBatch({
        csvText,
        codeMap,
        shift,
        lateRules,
        weeklyOffDays,
      });
      setBatchResult(result);
      setStep('done');
    }, 50);
  }, [csvText, codeMap, shift, lateRules, weeklyOffDays]);

  const handleSave = useCallback(async () => {
    if (!batchResult || !parseResult) return;
    const currentBatchResult = batchResult;
    const currentParseResult = parseResult;
    const totalRows = currentBatchResult.records.length || currentParseResult.validRows || 1;
    const jobId = addJob({
      fileName: fileName || 'attendance.csv',
      jobType: 'Attendance Import',
      totalRows,
      startedBy: userDisplayName || 'Current User',
    });
    setSaving(true);
    setSaveError('');
    startJob(jobId, 'Saving to database...');
    setJobProgress(jobId, { processedRows: 0, totalRows, statusText: 'Saving to database...', status: 'processing' });
    // Return UI to upload step immediately; processing continues in background panel.
    setStep('upload');
    setCsvText('');
    setFileName('');
    setParseResult(null);
    setBatchResult(null);
    setSavedCount(0);

    try {
      await attendanceRawLogService.saveBatch(currentParseResult.punches, currentBatchResult.batchId);
      const mid = Math.max(1, Math.floor(totalRows * 0.5));
      setJobProgress(jobId, { processedRows: mid, totalRows, statusText: 'Saving to database...', status: 'processing' });
      const count = await attendanceLogService.saveBatch(
        currentBatchResult.records,
        currentBatchResult.batchId,
        'zk_csv',
      );
      setSavedCount(count);
      completeJob(jobId, { addedRows: count, failedRows: Math.max(0, totalRows - count), statusText: 'Completed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ';
      setSaveError(message);
      failJob(jobId, message, 'Failed');
    } finally {
      setSaving(false);
    }
  }, [batchResult, parseResult, addJob, fileName, userDisplayName, startJob, setJobProgress, completeJob, failJob]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setCsvText('');
    setFileName('');
    setParseResult(null);
    setBatchResult(null);
    setSaveError('');
    setSavedCount(0);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
          استيراد بيانات الحضور
        </h2>
        <p className="text-sm text-slate-500 font-medium">
          استيراد ملف CSV من جهاز البصمة ZKTeco ومعالجته إلى سجلات حضور منظمة.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs font-bold">
        {(['upload', 'preview', 'processing', 'done'] as ImportStep[]).map((s, i) => {
          const labels = ['رفع الملف', 'معاينة', 'معالجة', 'تم'];
          const icons = ['upload_file', 'preview', 'sync', 'check_circle'];
          const isActive = step === s;
          const isPast = ['upload', 'preview', 'processing', 'done'].indexOf(step) > i;
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className={`flex-1 h-0.5 ${isPast ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`} />}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                isActive ? 'bg-primary/10 text-primary' : isPast ? 'text-primary' : 'text-slate-400'
              }`}>
                <span className="material-icons-round text-sm">{icons[i]}</span>
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Upload Step */}
      {step === 'upload' && (
        <Card>
          {settingsLoading && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-400">
              <span className="material-icons-round animate-spin text-sm">refresh</span>
              جاري تحميل إعدادات الحضور...
            </div>
          )}
          {!settingsLoading && Object.keys(codeMap).length === 0 && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-400">
              <span className="material-icons-round text-sm">warning</span>
              لا توجد أكواد موظفين مربوطة — تأكد من إضافة كود لكل موظف في صفحة الموظفين
            </div>
          )}
          <div
            className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={() => fileRef.current?.click()}
          >
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">
              cloud_upload
            </span>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">
              اسحب ملف CSV هنا أو اضغط للاختيار
            </p>
            <p className="text-xs text-slate-400">
              الصيغة المتوقعة: UserID, DateTime, DeviceID
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </Card>
      )}

      {/* Preview Step */}
      {step === 'preview' && parseResult && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-blue-500 text-3xl mb-2 block">description</span>
              <p className="text-xs text-slate-400 font-bold mb-1">إجمالي الصفوف</p>
              <p className="text-2xl font-black">{parseResult.totalRows.toLocaleString('en-US')}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-emerald-500 text-3xl mb-2 block">check_circle</span>
              <p className="text-xs text-slate-400 font-bold mb-1">صفوف صالحة</p>
              <p className="text-2xl font-black text-emerald-600">{parseResult.validRows.toLocaleString('en-US')}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-amber-500 text-3xl mb-2 block">warning</span>
              <p className="text-xs text-slate-400 font-bold mb-1">صفوف مُتخطاة</p>
              <p className="text-2xl font-black text-amber-600">{parseResult.skippedRows.toLocaleString('en-US')}</p>
            </div>
          </div>

          {parseResult.errors.length > 0 && (
            <Card title="أخطاء التحليل">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {parseResult.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
                    <span className="material-icons-round text-sm mt-0.5 shrink-0">error</span>
                    <span dir="ltr" className="font-mono">{err}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Preview table — first 20 rows */}
          <Card title={`معاينة البيانات (${fileName})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">#</th>
                    <th className="text-right py-3 px-3">كود الموظف</th>
                    <th className="text-right py-3 px-3">التاريخ والوقت</th>
                    <th className="text-right py-3 px-3">الجهاز</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.punches.slice(0, 20).map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-xs">{i + 1}</td>
                      <td className="py-2.5 px-3 font-bold">{p.employeeCode}</td>
                      <td className="py-2.5 px-3 font-mono text-xs" dir="ltr">
                        {p.timestamp.toLocaleString('ar-EG', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{p.deviceId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseResult.punches.length > 20 && (
                <p className="text-xs text-slate-400 text-center py-3 font-medium">
                  ... وعدد {(parseResult.punches.length - 20).toLocaleString('en-US')} صف إضافي
                </p>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-sm">arrow_back</span>
              إعادة
            </Button>
            <Button variant="primary" onClick={handleProcess} disabled={parseResult.validRows === 0}>
              <span className="material-icons-round text-sm">play_arrow</span>
              معالجة {parseResult.validRows.toLocaleString('en-US')} سجل
            </Button>
          </div>
        </>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-primary animate-spin mb-4 block">sync</span>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">جاري معالجة البيانات...</p>
            <p className="text-xs text-slate-400 mt-1">يرجى الانتظار</p>
          </div>
        </Card>
      )}

      {/* Done Step */}
      {step === 'done' && batchResult && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-primary text-3xl mb-2 block">badge</span>
              <p className="text-xs text-slate-400 font-bold mb-1">رقم الدفعة</p>
              <p className="text-sm font-black font-mono" dir="ltr">{batchResult.batchId}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-emerald-500 text-3xl mb-2 block">done_all</span>
              <p className="text-xs text-slate-400 font-bold mb-1">تمت معالجتها</p>
              <p className="text-2xl font-black text-emerald-600">{batchResult.totalProcessed}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-amber-500 text-3xl mb-2 block">person_off</span>
              <p className="text-xs text-slate-400 font-bold mb-1">أكواد غير مُطابقة</p>
              <p className="text-2xl font-black text-amber-600">{batchResult.unmatchedCodes.length}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="material-icons-round text-rose-500 text-3xl mb-2 block">error</span>
              <p className="text-xs text-slate-400 font-bold mb-1">أخطاء</p>
              <p className="text-2xl font-black text-rose-600">{batchResult.errors.length}</p>
            </div>
          </div>

          {batchResult.unmatchedCodes.length > 0 && (
            <Card title="أكواد موظفين غير مُطابقة">
              <div className="flex flex-wrap gap-2">
                {batchResult.unmatchedCodes.map((code) => (
                  <Badge key={code} variant="warning">{code}</Badge>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">
                هذه الأكواد غير مربوطة بموظفين في النظام. يرجى ربطها ثم إعادة المعالجة.
              </p>
            </Card>
          )}

          {batchResult.errors.length > 0 && (
            <Card title="أخطاء المعالجة">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {batchResult.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
                    <span className="material-icons-round text-sm mt-0.5 shrink-0">error</span>
                    <span dir="ltr" className="font-mono">{err}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Preview processed records */}
          {batchResult.records.length > 0 && (
            <Card title="السجلات المعالجة">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                      <th className="text-right py-3 px-2">الكود</th>
                      <th className="text-right py-3 px-2">التاريخ</th>
                      <th className="text-right py-3 px-2">الدخول</th>
                      <th className="text-right py-3 px-2">الخروج</th>
                      <th className="text-right py-3 px-2">الساعات</th>
                      <th className="text-right py-3 px-2">تأخير</th>
                      <th className="text-right py-3 px-2">انصراف مبكر</th>
                      <th className="text-right py-3 px-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResult.records.slice(0, 30).map((rec, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-2 font-bold text-xs">{rec.employeeCode}</td>
                        <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">{rec.date}</td>
                        <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">
                          {rec.checkIn.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-xs" dir="ltr">
                          {rec.checkOut
                            ? rec.checkOut.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2 font-bold">{rec.totalHours}</td>
                        <td className="py-2.5 px-2">
                          {rec.lateMinutes > 0
                            ? <span className="text-rose-500 font-bold">{rec.lateMinutes} ط¯</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2">
                          {rec.earlyLeaveMinutes > 0
                            ? <span className="text-amber-500 font-bold">{rec.earlyLeaveMinutes} ط¯</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-2">
                          {rec.isAbsent ? <Badge variant="danger">غائب</Badge>
                            : rec.isIncomplete ? <Badge variant="warning">ناقص</Badge>
                            : rec.isWeeklyOff ? <Badge variant="info">إجازة</Badge>
                            : <Badge variant="success">حاضر</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {batchResult.records.length > 30 && (
                  <p className="text-xs text-slate-400 text-center py-3 font-medium">
                    ... وعدد {(batchResult.records.length - 30).toLocaleString('en-US')} سجل إضافي
                  </p>
                )}
              </div>
            </Card>
          )}

          {saveError && (
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
              <span className="material-icons-round text-rose-500">error</span>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-400">{saveError}</p>
            </div>
          )}

          {savedCount > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
              <span className="material-icons-round text-emerald-500">check_circle</span>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                تم حفظ {savedCount} سجل بنجاح في قاعدة البيانات.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-sm">refresh</span>
              استيراد جديد
            </Button>
            {savedCount === 0 && batchResult.records.length > 0 && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">save</span>
                حفظ في قاعدة البيانات
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

