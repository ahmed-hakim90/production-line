import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { departmentsRef, jobPositionsRef, shiftsRef, employeesRef } from '../collections';
import { HR_COLLECTIONS } from '../collections';
import { parseHRExcel, type HRImportResult, type ParsedDepartmentRow, type ParsedPositionRow, type ParsedEmployeeRow, type HRLookups } from '../importHR';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift, FirestoreVehicle, JobLevel } from '../types';
import type { FirestoreEmployee, EmploymentType } from '@/types';
import { EMPLOYMENT_TYPE_LABELS } from '@/types';
import { JOB_LEVEL_LABELS } from '../types';
import { downloadHRTemplate } from '@/utils/downloadTemplates';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';
import { vehicleService } from '../vehicleService';

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';
type PreviewTab = 'employees' | 'departments' | 'positions';

export const HRImport: React.FC = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<HRImportResult | null>(null);
  const [tab, setTab] = useState<PreviewTab>('employees');
  const [lookups, setLookups] = useState<HRLookups | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [parseError, setParseError] = useState('');

  // Import progress
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ depts: 0, positions: 0, employees: 0, updated: 0 });
  const [importDone, setImportDone] = useState({ depts: 0, positions: 0, employees: 0, updated: 0, errors: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const normalize = useCallback((value: string) => value.trim().toLowerCase(), []);

  const buildResult = useCallback((
    departmentsRows: ParsedDepartmentRow[],
    positionsRows: ParsedPositionRow[],
    employeesRows: ParsedEmployeeRow[],
  ): HRImportResult => {
    const deptErrors = departmentsRows.filter((r) => r.errors.length > 0).length;
    const posErrors = positionsRows.filter((r) => r.errors.length > 0).length;
    const empErrors = employeesRows.filter((r) => r.errors.length > 0).length;
    const empValidRows = employeesRows.filter((r) => r.errors.length === 0);
    const updates = empValidRows.filter((r) => !!r.existingId).length;

    return {
      departments: {
        rows: departmentsRows,
        valid: departmentsRows.length - deptErrors,
        errors: deptErrors,
      },
      positions: {
        rows: positionsRows,
        valid: positionsRows.length - posErrors,
        errors: posErrors,
      },
      employees: {
        rows: employeesRows,
        valid: empValidRows.length,
        errors: empErrors,
        updates,
      },
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLookupsLoading(true);
      try {
        const [deptSnap, posSnap, shiftSnap, empSnap, vehicleList] = await Promise.all([
          getDocs(departmentsRef()),
          getDocs(jobPositionsRef()),
          getDocs(shiftsRef()),
          getDocs(employeesRef()),
          vehicleService.getAll(),
        ]);
        setLookups({
          departments: deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)),
          positions: posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)),
          shifts: shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift)),
          vehicles: vehicleList.map((v) => ({ ...v } as FirestoreVehicle)),
          employees: empSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreEmployee)),
        });
      } catch (e) {
        console.error('Failed to load lookups:', e);
      } finally {
        setLookupsLoading(false);
      }
    })();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lookups) return;
    setFileName(file.name);
    setParseError('');

    try {
      const parsed = await parseHRExcel(file, lookups);
      setResult(parsed);
      if (parsed.employees.rows.length > 0) setTab('employees');
      else if (parsed.departments.rows.length > 0) setTab('departments');
      else if (parsed.positions.rows.length > 0) setTab('positions');
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'فشل في قراءة الملف');
    }
  }, [lookups]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !lookups) return;

    const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileSelect(fakeEvent);
  }, [handleFileSelect, lookups]);

  const handleImport = useCallback(async () => {
    if (!result) return;
    const currentResult = result;
    const validDepts = currentResult.departments.rows.filter((r) => r.errors.length === 0);
    const validPositions = currentResult.positions.rows.filter((r) => r.errors.length === 0);
    const validEmps = currentResult.employees.rows.filter((r) => r.errors.length === 0);
    const totalOps = validDepts.length + validPositions.length + validEmps.length;
    const jobId = addJob({
      fileName: fileName || 'hr-import.xlsx',
      jobType: 'HR Import',
      totalRows: totalOps || 1,
      startedBy: userDisplayName || 'Current User',
    });

    setImporting(true);
    startJob(jobId, 'Saving to database...');
    // Return UI to upload step immediately; processing continues in background panel.
    setStep('upload');
    setFileName('');
    setResult(null);
    setParseError('');

    const errors: string[] = [];
    const createdDeptMap: Record<string, string> = {};
    const createdPosMap: Record<string, string> = {};
    let deptCount = 0, posCount = 0, empCount = 0;
    let doneOps = 0;
    // 1. Create departments (sheet + employee-derived missing departments)
    const existingDeptNames = new Set((lookups?.departments ?? []).map((d) => normalize(d.name)));
    const deptNamesFromSheet = new Set(validDepts.map((d) => normalize(d.name)));
    const autoDepartmentNames = Array.from(
      new Set(
        validEmps
          .map((emp) => String(emp.departmentName || '').trim())
          .filter((name) => !!name)
          .filter((name) => !existingDeptNames.has(normalize(name)))
          .filter((name) => !deptNamesFromSheet.has(normalize(name))),
      ),
    ) as string[];

    const departmentsToCreate = [
      ...validDepts,
      ...autoDepartmentNames.map((name) => ({
        rowIndex: 0,
        name,
        code: name.substring(0, 3).toUpperCase(),
        errors: [],
      } as ParsedDepartmentRow)),
    ];

    for (const dept of departmentsToCreate) {
      try {
        const ref = await addDoc(departmentsRef(), {
          name: dept.name,
          code: dept.code,
          managerId: '',
          isActive: true,
          createdAt: serverTimestamp(),
        });
        createdDeptMap[dept.name.toLowerCase()] = ref.id;
        deptCount++;
        setImportProgress((p) => ({ ...p, depts: deptCount }));
      } catch (err) {
        errors.push(`خطأ في إنشاء القسم "${dept.name}": ${err instanceof Error ? err.message : 'خطأ'}`);
      }
      doneOps++;
      setJobProgress(jobId, { processedRows: doneOps, totalRows: totalOps || 1, statusText: 'Saving to database...', status: 'processing' });
    }

    // Helper: resolve departmentId from name (existing + newly created)
    const resolveDeptId = (name: string): string => {
      const n = name.trim().toLowerCase();
      if (createdDeptMap[n]) return createdDeptMap[n];
      const existing = lookups?.departments.find((d) => d.name.trim().toLowerCase() === n);
      return existing?.id ?? '';
    };

    // 2. Create positions (sheet + employee-derived missing positions)
    const existingPositionTitles = new Set((lookups?.positions ?? []).map((p) => normalize(p.title)));
    const positionTitlesFromSheet = new Set(validPositions.map((p) => normalize(p.title)));
    const autoPositionMap = new Map<string, ParsedPositionRow>();
    for (const emp of validEmps) {
      const title = emp.positionTitle.trim();
      if (!title) continue;
      const titleKey = normalize(title);
      if (existingPositionTitles.has(titleKey) || positionTitlesFromSheet.has(titleKey)) continue;

      const existingAuto = autoPositionMap.get(titleKey);
      if (!existingAuto) {
        autoPositionMap.set(titleKey, {
          rowIndex: 0,
          title,
          departmentName: emp.departmentName || '',
          departmentId: '',
          level: emp.level,
          errors: [],
        });
        continue;
      }

      const currentDept = normalize(existingAuto.departmentName || '');
      const newDept = normalize(emp.departmentName || '');
      if (currentDept && newDept && currentDept !== newDept) {
        errors.push(`تعذر تعريف المنصب "${title}" تلقائيًا لأن له أكثر من قسم في ملف الموظفين`);
      } else if (!currentDept && newDept) {
        existingAuto.departmentName = emp.departmentName;
      }
    }

    const positionsToCreate = [...validPositions, ...Array.from(autoPositionMap.values())];

    for (const pos of positionsToCreate) {
      try {
        const departmentId = resolveDeptId(pos.departmentName);
        const ref = await addDoc(jobPositionsRef(), {
          title: pos.title,
          departmentId,
          level: pos.level,
          hasSystemAccessDefault: false,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        createdPosMap[pos.title.toLowerCase()] = ref.id;
        posCount++;
        setImportProgress((p) => ({ ...p, positions: posCount }));
      } catch (err) {
        errors.push(`خطأ في إنشاء المنصب "${pos.title}": ${err instanceof Error ? err.message : 'خطأ'}`);
      }
      doneOps++;
      setJobProgress(jobId, { processedRows: doneOps, totalRows: totalOps || 1, statusText: 'Saving to database...', status: 'processing' });
    }

    // Helper: resolve positionId from title
    const resolvePosId = (title: string): string => {
      const t = title.trim().toLowerCase();
      if (createdPosMap[t]) return createdPosMap[t];
      const existing = lookups?.positions.find((p) => p.title.trim().toLowerCase() === t);
      return existing?.id ?? '';
    };

    // Helper: resolve shiftId from name
    const resolveShiftId = (name: string): string => {
      if (!name) return '';
      const n = name.trim().toLowerCase();
      const existing = lookups?.shifts.find((s) => s.name.trim().toLowerCase() === n);
      return existing?.id ?? '';
    };

    // Helper: resolve vehicleId from vehicle name
    const resolveVehicleId = (name: string): string => {
      if (!name) return '';
      const n = name.trim().toLowerCase();
      const existing = lookups?.vehicles.find((v) => v.name.trim().toLowerCase() === n);
      return existing?.id ?? '';
    };

    // 3. Create or Update employees
    let updatedCount = 0;
    for (const emp of validEmps) {
      try {
        if (emp.existingId) {
          // Build partial update object with only provided fields
          const updateData: Record<string, any> = {};
          if (emp.providedFields.includes('name')) updateData.name = emp.name;
          if (emp.providedFields.includes('code')) updateData.code = emp.code;
          if (emp.providedFields.includes('phone')) updateData.phone = emp.phone;
          if (emp.providedFields.includes('departmentName')) updateData.departmentId = resolveDeptId(emp.departmentName);
          if (emp.providedFields.includes('positionTitle')) updateData.jobPositionId = resolvePosId(emp.positionTitle);
          if (emp.providedFields.includes('level')) updateData.level = emp.level;
          if (emp.providedFields.includes('employmentType')) updateData.employmentType = emp.employmentType;
          if (emp.providedFields.includes('baseSalary')) updateData.baseSalary = emp.baseSalary;
          if (emp.providedFields.includes('hourlyRate')) updateData.hourlyRate = emp.hourlyRate;
          if (emp.providedFields.includes('shiftName')) updateData.shiftId = resolveShiftId(emp.shiftName);
          if (emp.providedFields.includes('vehicleName')) updateData.vehicleId = resolveVehicleId(emp.vehicleName);
          if (emp.providedFields.includes('email')) updateData.email = emp.email;
          if (emp.providedFields.includes('isActive')) updateData.isActive = emp.isActive;
          if (emp.providedFields.includes('hasSystemAccess')) updateData.hasSystemAccess = emp.hasSystemAccess;

          if (Object.keys(updateData).length > 0) {
            await updateDoc(doc(db, HR_COLLECTIONS.EMPLOYEES, emp.existingId), updateData);
            updatedCount++;
            setImportProgress((p) => ({ ...p, updated: updatedCount }));
          }
        } else {
          await addDoc(employeesRef(), {
            name: emp.name,
            code: emp.code || '',
            phone: emp.phone || '',
            departmentId: resolveDeptId(emp.departmentName),
            jobPositionId: resolvePosId(emp.positionTitle),
            level: emp.level,
            employmentType: emp.employmentType,
            baseSalary: emp.baseSalary,
            hourlyRate: emp.hourlyRate,
            shiftId: resolveShiftId(emp.shiftName),
            vehicleId: resolveVehicleId(emp.vehicleName),
            email: emp.email || '',
            managerId: '',
            hasSystemAccess: emp.hasSystemAccess,
            isActive: emp.isActive,
            createdAt: serverTimestamp(),
          });
          empCount++;
          setImportProgress((p) => ({ ...p, employees: empCount }));
        }
      } catch (err) {
        const action = emp.existingId ? 'تحديث' : 'إنشاء';
        errors.push(`خطأ في ${action} الموظف "${emp.name}": ${err instanceof Error ? err.message : 'خطأ'}`);
      }
      doneOps++;
      setJobProgress(jobId, { processedRows: doneOps, totalRows: totalOps || 1, statusText: 'Saving to database...', status: 'processing' });
    }

    setImportDone({ depts: deptCount, positions: posCount, employees: empCount, updated: updatedCount, errors: errors.length });
    setImportErrors(errors);
    const addedRows = deptCount + posCount + empCount + updatedCount;
    if (errors.length > 0 && addedRows === 0) {
      failJob(jobId, errors[0], 'Failed');
    } else {
      completeJob(jobId, { addedRows, failedRows: errors.length, statusText: 'Completed' });
    }
    setImporting(false);
  }, [result, lookups, addJob, fileName, userDisplayName, startJob, setJobProgress, failJob, completeJob, normalize]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setResult(null);
    setParseError('');
    setImportProgress({ depts: 0, positions: 0, employees: 0, updated: 0 });
    setImportDone({ depts: 0, positions: 0, employees: 0, updated: 0, errors: 0 });
    setImportErrors([]);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const totalValid = result
    ? result.departments.valid + result.positions.valid + result.employees.valid
    : 0;
  const totalErrors = result
    ? result.departments.errors + result.positions.errors + result.employees.errors
    : 0;
  const totalUpdates = result?.employees.updates ?? 0;
  const totalNew = totalValid - totalUpdates;

  const removeDepartmentRow = useCallback((rowIndex: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const nextDepartments = prev.departments.rows.filter((row) => row.rowIndex !== rowIndex);
      return buildResult(nextDepartments, prev.positions.rows, prev.employees.rows);
    });
  }, [buildResult]);

  const removePositionRow = useCallback((rowIndex: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const nextPositions = prev.positions.rows.filter((row) => row.rowIndex !== rowIndex);
      return buildResult(prev.departments.rows, nextPositions, prev.employees.rows);
    });
  }, [buildResult]);

  const removeEmployeeRow = useCallback((rowIndex: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const nextEmployees = prev.employees.rows.filter((row) => row.rowIndex !== rowIndex);
      return buildResult(prev.departments.rows, prev.positions.rows, nextEmployees);
    });
  }, [buildResult]);

  const removeEmployeeErrors = useCallback(() => {
    setResult((prev) => {
      if (!prev) return prev;
      const nextEmployees = prev.employees.rows.filter((row) => row.errors.length === 0);
      return buildResult(prev.departments.rows, prev.positions.rows, nextEmployees);
    });
  }, [buildResult]);

  const removeEmployeeUpdates = useCallback(() => {
    setResult((prev) => {
      if (!prev) return prev;
      const nextEmployees = prev.employees.rows.filter((row) => !row.existingId || row.errors.length > 0);
      return buildResult(prev.departments.rows, prev.positions.rows, nextEmployees);
    });
  }, [buildResult]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">
            استيراد بيانات الموظفين
          </h2>
          <p className="page-subtitle">
            استيراد الأقسام والمناصب والموظفين من ملف Excel
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/employees')} className="self-start sm:self-auto shrink-0">
          <span className="material-icons-round text-sm">arrow_forward</span>
          العودة للموظفين
        </Button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs font-bold">
        {(['upload', 'preview', 'importing', 'done'] as ImportStep[]).map((s, i) => {
          const labels = ['رفع الملف', 'معاينة', 'استيراد', 'تم'];
          const icons = ['upload_file', 'preview', 'sync', 'check_circle'];
          const isActive = step === s;
          const isPast = ['upload', 'preview', 'importing', 'done'].indexOf(step) > i;
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className={`flex-1 h-0.5 ${isPast ? 'bg-primary' : 'bg-slate-200'}`} />}
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
        <>
          <Card>
            <div
              className="border-2 border-dashed border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={() => !lookupsLoading && fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {lookupsLoading ? (
                <>
                  <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block animate-pulse">hourglass_empty</span>
                  <p className="text-sm font-bold text-slate-400">جاري تحميل البيانات المرجعية...</p>
                </>
              ) : (
                <>
                  <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">cloud_upload</span>
                  <p className="text-sm font-bold text-[var(--color-text-muted)] mb-1">
                    اسحب ملف Excel هنا أو اضغط للاختيار
                  </p>
                  <p className="text-xs text-slate-400">
                    يدعم ملفات .xlsx و .xls — يمكن أن يحتوي على أوراق: الأقسام، المناصب، الموظفين
                  </p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
                disabled={lookupsLoading}
              />
            </div>
          </Card>

          {parseError && (
            <div className="bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
              <span className="material-icons-round text-rose-500">error</span>
              <p className="text-sm font-bold text-rose-700">{parseError}</p>
            </div>
          )}

          <Card>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">تحميل القالب</h3>
                <p className="text-xs text-slate-400">
                  قم بتحميل ملف Excel نموذجي يحتوي على الأعمدة المطلوبة (3 أوراق: الأقسام، المناصب، الموظفين)
                </p>
              </div>
              <Button variant="outline" onClick={() => downloadHRTemplate(lookups ?? undefined)} className="shrink-0">
                <span className="material-icons-round text-sm">download</span>
                تحميل القالب
              </Button>
            </div>
          </Card>

          {!lookupsLoading && lookups && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">أقسام حالية</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{lookups.departments.length}</p>
              </div>
              <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مناصب حالية</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{lookups.positions.length}</p>
              </div>
              <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">ورديات حالية</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{lookups.shifts.length}</p>
              </div>
              <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">موظفين حاليين</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{lookups.employees.length}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview Step */}
      {step === 'preview' && result && (
        <>
          {/* Summary cards */}
          <div className={`grid grid-cols-1 gap-4 ${totalUpdates > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-blue-500 text-3xl mb-2 block">description</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">إجمالي الصفوف</p>
              <p className="text-2xl font-black">
                {(result.departments.rows.length + result.positions.rows.length + result.employees.rows.length).toLocaleString('en-US')}
              </p>
            </div>
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-emerald-500 text-3xl mb-2 block">add_circle</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">جديد</p>
              <p className="text-2xl font-bold text-emerald-600">{totalNew.toLocaleString('en-US')}</p>
            </div>
            {totalUpdates > 0 && (
              <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-amber-200 text-center">
                <span className="material-icons-round text-amber-500 text-3xl mb-2 block">sync</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">تحديث موظفين حاليين</p>
                <p className="text-2xl font-bold text-amber-600">{totalUpdates.toLocaleString('en-US')}</p>
              </div>
            )}
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-rose-500 text-3xl mb-2 block">error</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">بها أخطاء</p>
              <p className="text-2xl font-bold text-rose-600">{totalErrors.toLocaleString('en-US')}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#f0f2f5] rounded-[var(--border-radius-lg)] p-1">
            {([
              { key: 'employees' as PreviewTab, label: 'الموظفين', count: result.employees.rows.length, icon: 'groups' },
              { key: 'departments' as PreviewTab, label: 'الأقسام', count: result.departments.rows.length, icon: 'business' },
              { key: 'positions' as PreviewTab, label: 'المناصب', count: result.positions.rows.length, icon: 'work' },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[var(--border-radius-base)] text-sm font-bold transition-all ${
                  tab === t.key
                    ? 'bg-[var(--color-card)] text-primary'
                    : 'text-slate-500 hover:text-[var(--color-text)] dark:hover:text-[var(--color-text-muted)]'
                }`}
              >
                <span className="material-icons-round text-base">{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
                {t.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    tab === t.key ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Department preview */}
          {tab === 'departments' && (
            <Card title={`الأقسام — ${result.departments.valid} صالح، ${result.departments.errors} خطأ`}>
              {result.departments.rows.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد بيانات أقسام في الملف (ورقة "الأقسام")</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th">#</th>
                        <th className="erp-th">الاسم</th>
                        <th className="erp-th">الرمز</th>
                        <th className="erp-th">الحالة</th>
                        <th className="erp-th">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.departments.rows.map((row) => (
                        <tr key={row.rowIndex} className={`border-b border-[var(--color-border)] ${row.errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}`}>
                          <td className="py-2.5 px-3 font-mono text-[var(--color-text-muted)] text-xs">{row.rowIndex}</td>
                          <td className="py-2.5 px-3 font-bold">{row.name || '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-xs">{row.code || '—'}</td>
                          <td className="py-2.5 px-3">
                            {row.errors.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.errors.map((err, i) => (
                                  <div key={i} className="flex items-center gap-1 text-xs text-rose-600">
                                    <span className="material-icons-round text-xs">error</span>
                                    {err}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <Badge variant="success">صالح</Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Button
                              variant="ghost"
                              onClick={() => removeDepartmentRow(row.rowIndex)}
                              className="!px-2 !py-1 text-rose-600 hover:bg-rose-50"
                            >
                              <span className="material-icons-round text-sm">delete</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Position preview */}
          {tab === 'positions' && (
            <Card title={`المناصب — ${result.positions.valid} صالح، ${result.positions.errors} خطأ`}>
              {result.positions.rows.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد بيانات مناصب في الملف (ورقة "المناصب")</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th">#</th>
                        <th className="erp-th">المنصب</th>
                        <th className="erp-th">القسم</th>
                        <th className="erp-th">المستوى</th>
                        <th className="erp-th">الحالة</th>
                        <th className="erp-th">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.positions.rows.map((row) => (
                        <tr key={row.rowIndex} className={`border-b border-[var(--color-border)] ${row.errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}`}>
                          <td className="py-2.5 px-3 font-mono text-[var(--color-text-muted)] text-xs">{row.rowIndex}</td>
                          <td className="py-2.5 px-3 font-bold">{row.title || '—'}</td>
                          <td className="py-2.5 px-3 text-[var(--color-text-muted)]">{row.departmentName || '—'}</td>
                          <td className="py-2.5 px-3 text-sm">{JOB_LEVEL_LABELS[row.level] ?? row.level}</td>
                          <td className="py-2.5 px-3">
                            {row.errors.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.errors.map((err, i) => (
                                  <div key={i} className="flex items-center gap-1 text-xs text-rose-600">
                                    <span className="material-icons-round text-xs">error</span>
                                    {err}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <Badge variant="success">صالح</Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Button
                              variant="ghost"
                              onClick={() => removePositionRow(row.rowIndex)}
                              className="!px-2 !py-1 text-rose-600 hover:bg-rose-50"
                            >
                              <span className="material-icons-round text-sm">delete</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Employee preview */}
          {tab === 'employees' && (
            <Card title={`الموظفين — ${result.employees.valid - result.employees.updates} جديد، ${result.employees.updates} تحديث، ${result.employees.errors} خطأ`}>
              {result.employees.rows.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد بيانات موظفين في الملف (ورقة "الموظفين")</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button variant="outline" onClick={removeEmployeeErrors} disabled={result.employees.errors === 0}>
                      <span className="material-icons-round text-sm">error</span>
                      حذف الصفوف بها أخطاء
                    </Button>
                    <Button variant="outline" onClick={removeEmployeeUpdates} disabled={result.employees.updates === 0}>
                      <span className="material-icons-round text-sm">sync_disabled</span>
                      حذف صفوف التحديث
                    </Button>
                  </div>
                  {result.employees.updates > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-base)] p-3 mb-4 flex items-start gap-2">
                      <span className="material-icons-round text-amber-500 text-lg mt-0.5">info</span>
                      <div className="text-xs text-amber-700 font-medium">
                        <p className="font-bold mb-0.5">تم اكتشاف موظفين حاليين</p>
                        <p>الصفوف المميزة بـ "تحديث" سيتم تحديث بياناتها فقط بالأعمدة الموجودة في الملف — لن يتم مسح أي بيانات قديمة.</p>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th">#</th>
                          <th className="erp-th">العملية</th>
                          <th className="erp-th">الاسم</th>
                          <th className="erp-th">الرمز</th>
                          <th className="erp-th">رقم الهاتف</th>
                          <th className="erp-th">القسم</th>
                          <th className="erp-th">المنصب</th>
                          <th className="erp-th">المستوى</th>
                          <th className="erp-th">نوع التوظيف</th>
                          <th className="erp-th">الراتب</th>
                          <th className="erp-th">المركبة</th>
                          <th className="erp-th">البريد</th>
                          <th className="erp-th">نشط</th>
                          <th className="erp-th">الأخطاء</th>
                          <th className="erp-th">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.employees.rows.map((row) => (
                          <tr key={row.rowIndex} className={`border-b border-[var(--color-border)] ${
                            row.errors.length > 0
                              ? 'bg-rose-50/50 dark:bg-rose-900/10'
                              : row.existingId
                                ? 'bg-amber-50/50 dark:bg-amber-900/10'
                                : ''
                          }`}>
                            <td className="py-2.5 px-3 font-mono text-[var(--color-text-muted)] text-xs">{row.rowIndex}</td>
                            <td className="py-2.5 px-3">
                              {row.errors.length > 0 ? null : row.existingId ? (
                                <Badge variant="warning">تحديث</Badge>
                              ) : (
                                <Badge variant="success">جديد</Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-bold">{row.name || '—'}</td>
                            <td className="py-2.5 px-3 font-mono text-xs">{row.code || '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('phone') ? row.phone : '—'}</td>
                            <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-xs">{row.departmentName || '—'}</td>
                            <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-xs">{row.positionTitle || '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('level') ? (JOB_LEVEL_LABELS[row.level] ?? row.level) : '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('employmentType') ? (EMPLOYMENT_TYPE_LABELS[row.employmentType] ?? row.employmentType) : '—'}</td>
                            <td className="py-2.5 px-3 font-mono text-xs">{row.providedFields.includes('baseSalary') ? row.baseSalary.toLocaleString('en-US') : '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('vehicleName') ? row.vehicleName : '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('email') ? row.email : '—'}</td>
                            <td className="py-2.5 px-3 text-xs">{row.providedFields.includes('isActive') ? (row.isActive ? 'نشط' : 'غير نشط') : '—'}</td>
                            <td className="py-2.5 px-3">
                              {row.errors.length > 0 ? (
                                <div className="space-y-0.5">
                                  {row.errors.map((err, i) => (
                                    <div key={i} className="flex items-center gap-1 text-xs text-rose-600">
                                      <span className="material-icons-round text-xs">error</span>
                                      {err}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-emerald-600 font-bold">
                                  {row.providedFields.filter((f) => f !== 'name' && f !== 'code').length} {row.existingId ? 'حقل للتحديث' : 'حقل'}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <Button
                                variant="ghost"
                                onClick={() => removeEmployeeRow(row.rowIndex)}
                                className="!px-2 !py-1 text-rose-600 hover:bg-rose-50"
                              >
                                <span className="material-icons-round text-sm">delete</span>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-sm">arrow_back</span>
              إعادة
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={totalValid === 0}>
              <span className="material-icons-round text-sm">upload</span>
              {totalUpdates > 0
                ? `استيراد ${totalNew.toLocaleString('en-US')} جديد + تحديث ${totalUpdates.toLocaleString('en-US')}`
                : `استيراد ${totalValid.toLocaleString('en-US')} سجل`
              }
            </Button>
          </div>
        </>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <Card>
          <div className="text-center py-12 space-y-6">
            <span className="material-icons-round text-5xl text-primary animate-spin block">sync</span>
            <div>
              <p className="text-sm font-bold text-[var(--color-text-muted)] mb-4">جاري الاستيراد...</p>
              <div className="max-w-sm mx-auto space-y-3">
                {result && result.departments.valid > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--color-text-muted)] w-16 text-left">الأقسام</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.depts / result.departments.valid) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400">{importProgress.depts}/{result.departments.valid}</span>
                  </div>
                )}
                {result && result.positions.valid > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--color-text-muted)] w-16 text-left">المناصب</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.positions / result.positions.valid) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400">{importProgress.positions}/{result.positions.valid}</span>
                  </div>
                )}
                {result && (result.employees.valid - result.employees.updates) > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--color-text-muted)] w-16 text-left">موظفين جدد</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.employees / (result.employees.valid - result.employees.updates)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400">{importProgress.employees}/{result.employees.valid - result.employees.updates}</span>
                  </div>
                )}
                {result && result.employees.updates > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-amber-500 w-16 text-left">تحديث</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.updated / result.employees.updates) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400">{importProgress.updated}/{result.employees.updates}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Done Step */}
      {step === 'done' && (
        <>
          <div className={`grid grid-cols-2 gap-4 ${importDone.updated > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-blue-500 text-3xl mb-2 block">business</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">أقسام</p>
              <p className="text-2xl font-bold text-blue-600">{importDone.depts}</p>
            </div>
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-indigo-500 text-3xl mb-2 block">work</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مناصب</p>
              <p className="text-2xl font-bold text-indigo-600">{importDone.positions}</p>
            </div>
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-emerald-500 text-3xl mb-2 block">person_add</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">موظفين جدد</p>
              <p className="text-2xl font-bold text-emerald-600">{importDone.employees}</p>
            </div>
            {importDone.updated > 0 && (
              <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-amber-200 text-center">
                <span className="material-icons-round text-amber-500 text-3xl mb-2 block">sync</span>
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">تم تحديثهم</p>
                <p className="text-2xl font-bold text-amber-600">{importDone.updated}</p>
              </div>
            )}
            <div className="bg-[var(--color-card)] p-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] text-center">
              <span className="material-icons-round text-rose-500 text-3xl mb-2 block">error</span>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">أخطاء</p>
              <p className="text-2xl font-bold text-rose-600">{importDone.errors}</p>
            </div>
          </div>

          {importDone.errors === 0 && (importDone.depts + importDone.positions + importDone.employees + importDone.updated) > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
              <span className="material-icons-round text-emerald-500">check_circle</span>
              <p className="text-sm font-bold text-emerald-700">
                تم الاستيراد بنجاح!
                {importDone.depts > 0 && ` تمت إضافة ${importDone.depts} قسم`}
                {importDone.positions > 0 && ` و${importDone.positions} منصب`}
                {importDone.employees > 0 && ` و${importDone.employees} موظف جديد`}
                {importDone.updated > 0 && ` وتحديث ${importDone.updated} موظف حالي`}
                .
              </p>
            </div>
          )}

          {importErrors.length > 0 && (
            <Card title="أخطاء الاستيراد">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {importErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-rose-600">
                    <span className="material-icons-round text-sm mt-0.5 shrink-0">error</span>
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-sm">refresh</span>
              استيراد جديد
            </Button>
            <Button variant="primary" onClick={() => navigate('/employees')}>
              <span className="material-icons-round text-sm">groups</span>
              الذهاب للموظفين
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

