import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import {
  downloadCustomersTemplate,
  parseCustomersExcel,
  toCustomerUpsertInput,
  type ParsedCustomerImportRow,
} from '../lib/importCustomers';
import { customerService } from '../services/customerService';
import { CUSTOMER_TYPE_LABELS, type Customer } from '../types';

type Step = 'upload' | 'preview' | 'importing' | 'done';

export const CustomersImport: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile);
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ParsedCustomerImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ created: 0, updated: 0, failed: 0 });

  const readyRows = useMemo(
    () => rows.filter((r) => r.status === 'create' || r.status === 'update'),
    [rows],
  );

  if (!can('customers.import')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية استيراد العملاء.</div>;
  }

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const existing = await customerService.listAll({ includeInactive: true });
      const byCode = new Map<string, Customer>();
      for (const c of existing) {
        if (c.code) byCode.set(c.code, c);
      }
      const parsed = parseCustomersExcel(buffer, byCode);
      setRows(parsed.rows);
      setFileName(file.name);
      setStep('preview');
      if (parsed.errorCount > 0) {
        toast.warning(`تم اكتشاف ${parsed.errorCount} صفوف بها أخطاء.`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر قراءة الملف.');
    }
  };

  const runImport = async () => {
    if (readyRows.length === 0) {
      toast.error('لا توجد صفوف صالحة للاستيراد.');
      return;
    }
    setStep('importing');
    setProgress({ done: 0, total: readyRows.length });
    const actor = {
      userId: String(user?.id || ''),
      userName: String(user?.displayName || user?.email || 'مستخدم'),
    };
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < readyRows.length; i += 1) {
      const row = readyRows[i];
      try {
        const input = toCustomerUpsertInput(row);
        const res = await customerService.upsertByCode(input, actor);
        if (res.created) created += 1;
        else updated += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: readyRows.length });
    }

    setResult({ created, updated, failed });
    setStep('done');
    toast.success(`الاستيراد اكتمل: ${created} جديد، ${updated} تحديث.`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="استيراد العملاء"
        subtitle="رفع ماستر العملاء من Excel بالأكواد — إنشاء أو تحديث حسب الكود"
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

      {step === 'upload' && (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            ارفع ملف Excel بنفس أعمدة القالب (كود، نوع، اسم، هاتف…).
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
          />
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="text-sm">
            الملف: <span className="font-medium">{fileName}</span> — صفوف صالحة: {readyRows.length} من{' '}
            {rows.length}
          </div>
          <div className="overflow-x-auto rounded-xl border max-h-[420px]">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead sticky top-0 bg-[var(--color-card)]">
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
                {rows.map((row) => (
                  <tr key={row.rowNo} className="border-t">
                    <td className="p-2 tabular-nums">{row.rowNo}</td>
                    <td className="p-2 tabular-nums">{row.code || '—'}</td>
                    <td className="p-2">
                      {row.type ? CUSTOMER_TYPE_LABELS[row.type] : row.type || '—'}
                    </td>
                    <td className="p-2">{row.name || '—'}</td>
                    <td className="p-2 tabular-nums">{row.phone || '—'}</td>
                    <td className="p-2">
                      {row.status === 'create' && 'جديد'}
                      {row.status === 'update' && 'تحديث'}
                      {row.status === 'error' && 'خطأ'}
                      {row.status === 'skip' && 'تجاهل'}
                    </td>
                    <td className="p-2 text-rose-700 text-xs">{row.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep('upload')}>
              ملف آخر
            </Button>
            <Button type="button" disabled={readyRows.length === 0} onClick={() => void runImport()}>
              تنفيذ الاستيراد
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="rounded-xl border p-6 text-sm">
          جاري الاستيراد… {progress.done} / {progress.total}
        </div>
      )}

      {step === 'done' && (
        <div className="rounded-xl border p-6 space-y-3 text-sm">
          <p>
            تم: <strong>{result.created}</strong> جديد، <strong>{result.updated}</strong> تحديث،{' '}
            <strong>{result.failed}</strong> فشل.
          </p>
          <Button asChild>
            <Link to={withTenantPath(tenantSlug, '/customers')}>عرض العملاء</Link>
          </Button>
        </div>
      )}
    </div>
  );
};
