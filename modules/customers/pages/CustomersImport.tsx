import React, { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/UI';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { useJobsStore } from '@/components/background-jobs/useJobsStore';
import { toast } from 'sonner';
import { runCustomersImportJob } from '../lib/applyCustomersImport';
import {
  downloadCustomersTemplate,
  parseCustomersExcel,
  type ParsedCustomerImportRow,
} from '../lib/importCustomers';
import { customerService } from '../services/customerService';
import { CUSTOMER_TYPE_LABELS, type Customer } from '../types';

type Step = 'upload' | 'preview';
type PreviewFilter = 'all' | 'ready' | 'create' | 'update' | 'error';

const PREVIEW_PAGE_SIZE = 50;

const STEP_LABELS: { key: Step | 'tasks'; label: string; icon: string }[] = [
  { key: 'upload', label: 'رفع الملف', icon: 'upload_file' },
  { key: 'preview', label: 'معاينة', icon: 'preview' },
  { key: 'tasks', label: 'المهام', icon: 'assignment' },
];

function statusBadge(row: ParsedCustomerImportRow) {
  if (row.status === 'error') return <Badge variant="danger">خطأ</Badge>;
  if (row.status === 'update') return <Badge variant="warning">تحديث</Badge>;
  if (row.status === 'create') return <Badge variant="success">جديد</Badge>;
  return <Badge variant="neutral">تجاهل</Badge>;
}

export const CustomersImport: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const fileRef = useRef<HTMLInputElement>(null);

  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);
  const setPanelHidden = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ParsedCustomerImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [page, setPage] = useState(1);

  const createCount = useMemo(() => rows.filter((r) => r.status === 'create').length, [rows]);
  const updateCount = useMemo(() => rows.filter((r) => r.status === 'update').length, [rows]);
  const errorCount = useMemo(() => rows.filter((r) => r.status === 'error').length, [rows]);
  const readyRows = useMemo(
    () => rows.filter((r) => r.status === 'create' || r.status === 'update'),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (filter === 'ready') return readyRows;
    if (filter === 'create') return rows.filter((r) => r.status === 'create');
    if (filter === 'update') return rows.filter((r) => r.status === 'update');
    if (filter === 'error') return rows.filter((r) => r.status === 'error');
    return rows;
  }, [filter, readyRows, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PREVIEW_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice(
    (safePage - 1) * PREVIEW_PAGE_SIZE,
    safePage * PREVIEW_PAGE_SIZE,
  );

  if (!can('customers.import')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية استيراد العملاء.</div>;
  }

  const reset = () => {
    setStep('upload');
    setRows([]);
    setFileName('');
    setParsing(false);
    setQueueing(false);
    setFilter('all');
    setPage(1);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const existing = await customerService.listAll({ includeInactive: true });
      const byCode = new Map<string, Customer>();
      for (const c of existing) {
        if (c.code) byCode.set(c.code, c);
      }
      const parsed = parseCustomersExcel(buffer, byCode);
      setRows(parsed.rows);
      setFilter(parsed.errorCount > 0 ? 'error' : 'all');
      setPage(1);
      setStep('preview');
      if (parsed.errorCount > 0) {
        toast.warning(`تم اكتشاف ${parsed.errorCount} صف بها أخطاء — راجع تبويب الأخطاء.`);
      } else if (parsed.readyCount === 0) {
        toast.error('لا توجد صفوف صالحة في الملف.');
      } else {
        toast.success(`جاهز للاستيراد: ${parsed.readyCount} صف صالح.`);
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      const isQueryLimit =
        /limit value in the structured query/i.test(raw) || /maximum value of 10000/i.test(raw);
      toast.error(isQueryLimit ? 'تعذر تحميل قائمة العملاء الحالية. حاول مرة أخرى.' : raw || 'تعذر قراءة الملف.');
      setRows([]);
      setFileName('');
      setStep('upload');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const queueImport = () => {
    if (readyRows.length === 0) {
      toast.error('لا توجد صفوف صالحة للاستيراد.');
      return;
    }
    setQueueing(true);
    try {
      const actorName = String(userDisplayName || user?.displayName || user?.email || 'مستخدم');
      const jobId = addJob({
        fileName: fileName || 'customers-import.xlsx',
        jobType: 'Customers Import',
        totalRows: readyRows.length,
        startedBy: actorName,
      });
      setPanelHidden(false);
      setPanelMinimized(false);
      startJob(jobId, 'حفظ العملاء...');

      const rowsSnapshot = [...readyRows];
      const actor = {
        userId: String(user?.id || ''),
        userName: actorName,
      };

      void runCustomersImportJob({
        jobId,
        rows: rowsSnapshot,
        actor,
        onProgress: (processed, total) => {
          setJobProgress(jobId, {
            processedRows: processed,
            totalRows: total,
            statusText: `جاري الحفظ ${processed}/${total}`,
          });
        },
        onComplete: (created, updated, failed) => {
          completeJob(jobId, {
            addedRows: created + updated,
            failedRows: failed,
            statusText: failed
              ? `اكتمل مع أخطاء (${failed} فشل)`
              : `اكتمل: ${created} جديد، ${updated} تحديث`,
          });
        },
        onFail: (message) => {
          failJob(jobId, message, 'فشل استيراد العملاء');
        },
      });

      toast.success('بدأت المهمة — تابع التقدم من «المهام».');
      reset();
    } finally {
      setQueueing(false);
    }
  };

  const filterButtons: { key: PreviewFilter; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: rows.length },
    { key: 'ready', label: 'صالح', count: readyRows.length },
    { key: 'create', label: 'جديد', count: createCount },
    { key: 'update', label: 'تحديث', count: updateCount },
    { key: 'error', label: 'أخطاء', count: errorCount },
  ];

  const activeStepIndex = step === 'upload' ? 0 : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title="استيراد العملاء"
        subtitle="رفع ماستر العملاء من Excel بالأكواد — الإنشاء/التحديث يُنفَّذ عبر «المهام»"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => downloadCustomersTemplate()}>
              تنزيل القالب
            </Button>
            <Button asChild variant="outline">
              <Link to={withTenantPath(tenantSlug, '/customers')}>العودة للقائمة</Link>
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 text-xs font-bold">
        {STEP_LABELS.map((s, i) => {
          const isPast = activeStepIndex > i;
          const isCurrent = i === activeStepIndex;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && (
                <div className={`flex-1 h-0.5 ${isPast || isCurrent ? 'bg-primary' : 'bg-slate-200'}`} />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                  isCurrent ? 'bg-primary/10 text-primary' : isPast ? 'text-primary' : 'text-slate-400'
                }`}
              >
                <span className="material-icons-round text-sm">{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {step === 'upload' && (
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            className="rounded-xl border-2 border-dashed border-[var(--color-border)] p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={() => !parsing && fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!parsing) fileRef.current?.click();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (parsing) return;
              void onFile(e.dataTransfer.files?.[0] || null);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            {parsing ? (
              <>
                <span className="material-icons-round text-5xl text-primary mb-3 block animate-pulse">hourglass_empty</span>
                <p className="text-sm font-bold text-primary">جاري قراءة الملف والتحقق من الصفوف...</p>
                {fileName ? <p className="text-xs text-muted-foreground mt-1">{fileName}</p> : null}
              </>
            ) : (
              <>
                <span className="material-icons-round text-5xl text-muted-foreground mb-3 block">cloud_upload</span>
                <p className="text-sm font-bold mb-1">اسحب ملف Excel هنا أو اضغط للاختيار</p>
                <p className="text-xs text-muted-foreground">
                  يدعم .xlsx و .xls — بعد المعاينة يُنفَّذ الاستيراد في «المهام»
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              disabled={parsing}
              onChange={(e) => void onFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="rounded-xl border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold mb-0.5">قالب الاستيراد</p>
              <p className="text-xs text-muted-foreground">
                أعمدة مطلوبة: الكود، النوع (مستهلك/تاجر)، الاسم — الهاتف يُحفظ كما في الملف. والكود مفتاح الإنشاء أو التحديث.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => downloadCustomersTemplate()}>
              تنزيل القالب
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border p-4 text-center">
              <p className="text-xs text-muted-foreground font-bold mb-1">إجمالي الصفوف</p>
              <p className="text-2xl font-black tabular-nums">{rows.length.toLocaleString('en-US')}</p>
              {fileName ? <p className="text-[10px] text-muted-foreground mt-1 truncate">{fileName}</p> : null}
            </div>
            <div className="rounded-xl border border-emerald-200 p-4 text-center">
              <p className="text-xs text-muted-foreground font-bold mb-1">جديد</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{createCount.toLocaleString('en-US')}</p>
            </div>
            <div className="rounded-xl border border-amber-200 p-4 text-center">
              <p className="text-xs text-muted-foreground font-bold mb-1">تحديث</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{updateCount.toLocaleString('en-US')}</p>
            </div>
            <div className="rounded-xl border border-rose-200 p-4 text-center">
              <p className="text-xs text-muted-foreground font-bold mb-1">بها أخطاء</p>
              <p className="text-2xl font-bold text-rose-600 tabular-nums">{errorCount.toLocaleString('en-US')}</p>
            </div>
          </div>

          {errorCount > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-3 flex items-start gap-2 text-sm text-rose-700">
              <span className="material-icons-round text-base mt-0.5">error</span>
              <div>
                <p className="font-bold">صفوف بها أخطاء لن تُستورد</p>
                <p className="text-xs mt-0.5">استخدم فلتر «أخطاء» لعرضها وإصلاحها في الملف ثم ارفع مرة أخرى.</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1 rounded-lg bg-[#f0f2f5] dark:bg-slate-900/40 p-1">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  filter === f.key
                    ? 'bg-[var(--color-card)] text-primary shadow-sm'
                    : 'text-slate-500 hover:text-[var(--color-text)]'
                }`}
              >
                {f.label}
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                    filter === f.key ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border max-h-[420px]">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead sticky top-0 bg-[var(--color-card)] z-10">
                <tr>
                  <th className="erp-th">#</th>
                  <th className="erp-th">الكود</th>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">الاسم</th>
                  <th className="erp-th">الهاتف</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      لا توجد صفوف في هذا الفلتر.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr
                      key={row.rowNo}
                      className={`border-t ${
                        row.status === 'error'
                          ? 'bg-rose-50/70 dark:bg-rose-900/15'
                          : row.status === 'update'
                            ? 'bg-amber-50/50 dark:bg-amber-900/10'
                            : ''
                      }`}
                    >
                      <td className="p-2 tabular-nums text-xs text-muted-foreground">{row.rowNo}</td>
                      <td className="p-2 tabular-nums font-mono text-xs">{row.code || '—'}</td>
                      <td className="p-2">
                        {row.type ? CUSTOMER_TYPE_LABELS[row.type] : row.type || '—'}
                      </td>
                      <td className="p-2 font-medium">{row.name || '—'}</td>
                      <td className="p-2 tabular-nums text-xs">{row.phone || '—'}</td>
                      <td className="p-2">{statusBadge(row)}</td>
                      <td className="p-2 text-xs">
                        {row.error ? (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <span className="material-icons-round text-xs">error</span>
                            {row.error}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            onPageChange={setPage}
            itemLabel="صف"
          />

          <p className="text-xs text-muted-foreground">
            الصفوف الصالحة فقط ({readyRows.length.toLocaleString('en-US')}) تُرسل إلى «المهام» — يمكنك مغادرة الصفحة بعد البدء.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={queueing}>
              ملف آخر
            </Button>
            {errorCount > 0 && filter !== 'error' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilter('error');
                  setPage(1);
                }}
              >
                عرض الأخطاء ({errorCount})
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={readyRows.length === 0 || queueing}
              onClick={queueImport}
            >
              {queueing
                ? 'جاري الإرسال للمهام...'
                : `تطبيق ${readyRows.length.toLocaleString('en-US')} صف عبر المهام`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
