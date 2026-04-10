import React, { useMemo, useState } from 'react';
import {
  importCustomerDepositsPackCallable,
  type ImportCustomerDepositsPackMode,
} from '../../auth/services/firebase';
import { usePermission } from '../../../utils/permissions';
import { toast } from '../../../components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import {
  buildCustomerDepositsPack,
  downloadCustomerDepositsPackExcel,
  downloadCustomerDepositsPackExcelTemplate,
  downloadCustomerDepositsPackJson,
  downloadCustomerDepositsPackJsonTemplate,
  attachSessionTenantToPackForImport,
  parseCustomerDepositsPackExcel,
  parseCustomerDepositsPackJson,
} from '../utils/customerDepositsPackExport';
import type { CustomerDepositsPack } from '../utils/customerDepositsPackTypes';
import {
  analyzeCustomerDepositsPackForImport,
  CUSTOMER_DEPOSITS_PACK_PREVIEW_ROW_LIMIT,
  previewCell,
} from '../utils/customerDepositsPackImportAnalysis';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type CustomerDepositsPackImportExportSectionProps = {
  onImportSuccess?: () => void;
};

export const CustomerDepositsPackImportExportSection: React.FC<CustomerDepositsPackImportExportSectionProps> = ({
  onImportSuccess,
}) => {
  const { can } = usePermission();
  const manage = can('customerDeposits.manage');
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [parsedPack, setParsedPack] = useState<CustomerDepositsPack | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportCustomerDepositsPackMode>('merge');
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const packAnalysis = useMemo(
    () => (parsedPack ? analyzeCustomerDepositsPackForImport(parsedPack) : null),
    [parsedPack],
  );

  if (!manage) return null;

  const runExportJson = async () => {
    setExportBusy(true);
    try {
      const pack = await buildCustomerDepositsPack();
      downloadCustomerDepositsPackJson(pack);
      toast.success('تم تصدير JSON');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setExportBusy(false);
    }
  };

  const runExportExcel = async () => {
    setExportBusy(true);
    try {
      const pack = await buildCustomerDepositsPack();
      downloadCustomerDepositsPackExcel(pack);
      toast.success('تم تصدير Excel');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setExportBusy(false);
    }
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    setParsedPack(null);
    setParseError(null);
    setLastFileName(null);
    if (!file) return;
    setLastFileName(file.name);
    const lower = file.name.toLowerCase();
    setParseBusy(true);
    const parseToastId =
      lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.json')
        ? toast.loading(
            lower.endsWith('.json')
              ? 'جاري تحليل JSON…'
              : 'جاري قراءة Excel في الخلفية (تقسيم المعالجة لعدم تجميد الصفحة)…',
          )
        : null;
    try {
      if (lower.endsWith('.json')) {
        const text = await file.text();
        await new Promise<void>((r) => setTimeout(r, 0));
        setParsedPack(parseCustomerDepositsPackJson(text));
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        const pack = await parseCustomerDepositsPackExcel(buf);
        setParsedPack(pack);
      } else {
        setParseError('استخدم ملفًا بامتداد .json أو .xlsx / .xls');
      }
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'تعذر قراءة الملف');
    } finally {
      if (parseToastId != null) toast.dismiss(parseToastId);
      setParseBusy(false);
    }
    e.target.value = '';
  };

  const runImport = async (mode: ImportCustomerDepositsPackMode) => {
    if (!parsedPack) {
      toast.error('اختر ملف JSON أو Excel صالحًا أولًا');
      return;
    }
    setImportBusy(true);
    const loadingId = toast.loading('جاري استيراد الحزمة على الخادم… يمكنك متابعة العمل؛ انتظر حتى تظهر النتيجة.');
    try {
      const packForServer = attachSessionTenantToPackForImport(parsedPack);
      const result = await importCustomerDepositsPackCallable(packForServer, mode);
      const msg =
        mode === 'replace_module'
          ? `استبدال كامل: حُذف ${result.deletedBefore ?? 0} مستندًا تقريبًا، ثم كُتب ${result.written.entries} إيداع.`
          : `دمج: عُدّل/أُضيف ${result.written.customers} عميل، ${result.written.entries} إيداع، …`;
      toast.success(msg, { id: loadingId, duration: 6500 });
      setParsedPack(null);
      setLastFileName(null);
      setReplaceDialogOpen(false);
      setReplaceConfirm('');
      onImportSuccess?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل الاستيراد', { id: loadingId, duration: 8000 });
    } finally {
      setImportBusy(false);
    }
  };

  const requestReplaceImport = () => {
    if (!parsedPack) {
      toast.error('اختر ملف JSON أو Excel');
      return;
    }
    setReplaceDialogOpen(true);
    setReplaceConfirm('');
  };

  const confirmReplaceImport = () => {
    if (replaceConfirm.trim() !== 'حذف') {
      toast.error('اكتب كلمة «حذف» للتأكيد');
      return;
    }
    void runImport('replace_module');
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
          <CardTitle className="text-base font-semibold">تصدير واستيراد كامل</CardTitle>
          <CardDescription className="text-xs">
            لا حاجة لمعرّف الشركة داخل صفوف البيانات: يُضبط تلقائيًا عند الاستيراد.             في وضع «دمج»، يُحدَّث العميل أولًا بمطابقة{' '}
            <span className="font-semibold text-foreground">كود العميل</span> (المطبّع في القاعدة) وليس بمعرّف
            الشيت إن كان قديماً أو من نسخة أخرى؛ وحساب البنك بمطابقة{' '}
            <span className="font-semibold text-foreground">رقم الحساب</span>. عمود{' '}
            <span className="font-mono text-foreground">_docId</span> مفيد للإيداعات والتسويات أكثر من العملاء/البنوك.
            الإيداعات تُعالج عبر السحابة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={exportBusy} onClick={() => void runExportJson()}>
              تصدير JSON
            </Button>
            <Button type="button" variant="outline" disabled={exportBusy} onClick={() => void runExportExcel()}>
              تصدير Excel
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">قوالب (بدون معرّف شركة)</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  try {
                    downloadCustomerDepositsPackJsonTemplate();
                    toast.success('تم تنزيل قالب JSON');
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : 'تعذر التصدير');
                  }
                }}
              >
                تصدير قالب JSON
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  try {
                    downloadCustomerDepositsPackExcelTemplate();
                    toast.success('تم تنزيل قالب Excel');
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : 'تعذر التصدير');
                  }
                }}
              >
                تصدير قالب Excel
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <Label className="text-xs text-muted-foreground">استيراد من JSON أو Excel</Label>
            <Input
              type="file"
              accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="cursor-pointer"
              disabled={parseBusy || importBusy}
              onChange={onFileChange}
            />
            {parseBusy && <p className="text-xs text-muted-foreground">جاري تحليل الملف دون تجميد الصفحة…</p>}
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            {parsedPack && packAnalysis && (
              <div className="space-y-3 text-xs text-muted-foreground">
                {lastFileName ? (
                  <p>
                    الملف: <span className="font-medium text-foreground">{lastFileName}</span>
                  </p>
                ) : null}
                {parsedPack.metadata.tenantId ? (
                  <p>
                    tenantId في الملف (اختياري):{' '}
                    <span className="font-mono text-foreground">{parsedPack.metadata.tenantId}</span>
                  </p>
                ) : null}
                <p>
                  سيتم الاستيراد على شركة جلستك الحالية:{' '}
                  <span className="font-mono text-foreground">{getCurrentTenantIdOrNull() ?? '—'}</span>
                </p>
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="mb-2 text-sm font-semibold text-foreground">معاينة وتحليل قبل التنفيذ</p>
                  {parsedPack.metadata.exportedAt ? (
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      تاريخ التصدير في الملف:{' '}
                      <span className="font-mono text-foreground">{parsedPack.metadata.exportedAt}</span>
                    </p>
                  ) : null}
                  <p className="mb-2 leading-relaxed">
                    الصفوف الفارغة في الشيت تُتجاهل عند الاستيراد. المعاينة تعرض أوائل{' '}
                    {CUSTOMER_DEPOSITS_PACK_PREVIEW_ROW_LIMIT} صفوف غير فارغة لكل
                    قسم (محليًا في المتصفح فقط — لا يُرفع شيء قبل الضغط على تنفيذ الاستيراد).
                  </p>
                  {!packAnalysis.versionOk ? (
                    <p className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-destructive">
                      تحذير إصدار الحزمة — راجع الملف أو صدّر من النظام ثم أعد المحاولة.
                    </p>
                  ) : null}
                  {packAnalysis.warnings.length > 0 ? (
                    <ul className="mb-3 list-inside list-disc space-y-1 text-amber-900 dark:text-amber-200">
                      {packAnalysis.warnings.map((w, i) => (
                        <li key={i} className="leading-relaxed">
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-emerald-800 dark:text-emerald-200">لا تنبيهات واضحة على مستوى الملف.</p>
                  )}
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <span className="font-medium text-foreground">العملاء:</span> إجمالي الصفوف{' '}
                      {packAnalysis.customers.totalRows}، غير فارغ {packAnalysis.customers.nonBlankRows}
                      {packAnalysis.customers.missingCodeOrNameRows > 0
                        ? `، صفوف ناقصة كود/اسم: ${packAnalysis.customers.missingCodeOrNameRows}`
                        : ''}
                      {packAnalysis.customers.duplicateCodesNormalized.length > 0
                        ? `، أكواد مكررة: ${packAnalysis.customers.duplicateCodesNormalized.length}`
                        : ''}
                    </div>
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <span className="font-medium text-foreground">البنوك:</span> إجمالي {packAnalysis.banks.totalRows}،
                      غير فارغ {packAnalysis.banks.nonBlankRows}
                      {packAnalysis.banks.missingAccountOrLabelRows > 0
                        ? `، ناقص رقم/بنك: ${packAnalysis.banks.missingAccountOrLabelRows}`
                        : ''}
                      {packAnalysis.banks.duplicateAccountsNormalized.length > 0
                        ? `، أرقام مكررة: ${packAnalysis.banks.duplicateAccountsNormalized.length}`
                        : ''}
                    </div>
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <span className="font-medium text-foreground">الإيداعات:</span> غير فارغ{' '}
                      {packAnalysis.entries.nonBlankRows} — بـ _docId: {packAnalysis.entries.withDocId} — بلا _docId:{' '}
                      {packAnalysis.entries.withoutDocId}
                    </div>
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <span className="font-medium text-foreground">التسويات:</span> غير فارغ{' '}
                      {packAnalysis.adjustments.nonBlankRows} — بـ _docId: {packAnalysis.adjustments.withDocId} — بلا
                      _docId: {packAnalysis.adjustments.withoutDocId}
                    </div>
                  </div>

                  <div className="max-h-[220px] space-y-3 overflow-y-auto pr-1">
                    <div>
                      <p className="mb-1 font-medium text-foreground">معاينة — عملاء (أوائل الصفوف)</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">الكود</TableHead>
                            <TableHead className="text-right">الاسم</TableHead>
                            <TableHead className="text-right">رصيد افتتاحي</TableHead>
                            <TableHead className="text-right font-mono text-[10px]">_docId</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packAnalysis.customers.preview.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                لا صفوف غير فارغة
                              </TableCell>
                            </TableRow>
                          ) : (
                            packAnalysis.customers.preview.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-[11px]">{previewCell(row.code)}</TableCell>
                                <TableCell>{previewCell(row.name)}</TableCell>
                                <TableCell className="tabular-nums">{previewCell(row.openingBalance)}</TableCell>
                                <TableCell className="max-w-[100px] truncate font-mono text-[10px]" title={previewCell(row._docId ?? row.id)}>
                                  {previewCell(row._docId ?? row.id) || '—'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">معاينة — حسابات بنك</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">رقم الحساب</TableHead>
                            <TableHead className="text-right">البنك</TableHead>
                            <TableHead className="text-right">رصيد افتتاحي</TableHead>
                            <TableHead className="text-right font-mono text-[10px]">_docId</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packAnalysis.banks.preview.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                لا صفوف غير فارغة
                              </TableCell>
                            </TableRow>
                          ) : (
                            packAnalysis.banks.preview.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-[11px]">{previewCell(row.accountNumber)}</TableCell>
                                <TableCell>{previewCell(row.bankLabel)}</TableCell>
                                <TableCell className="tabular-nums">{previewCell(row.openingBalance)}</TableCell>
                                <TableCell className="max-w-[100px] truncate font-mono text-[10px]" title={previewCell(row._docId ?? row.id)}>
                                  {previewCell(row._docId ?? row.id) || '—'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">معاينة — إيداعات</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">تاريخ</TableHead>
                            <TableHead className="text-right">مبلغ</TableHead>
                            <TableHead className="text-right">مودع</TableHead>
                            <TableHead className="text-right">عميل</TableHead>
                            <TableHead className="text-right">حالة</TableHead>
                            <TableHead className="text-right font-mono text-[10px]">_docId</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packAnalysis.entries.preview.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground">
                                لا صفوف غير فارغة
                              </TableCell>
                            </TableRow>
                          ) : (
                            packAnalysis.entries.preview.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{previewCell(row.depositDate)}</TableCell>
                                <TableCell className="tabular-nums">{previewCell(row.amount)}</TableCell>
                                <TableCell className="max-w-[120px] truncate">{previewCell(row.depositorName)}</TableCell>
                                <TableCell className="max-w-[100px] truncate font-mono text-[10px]">
                                  {previewCell(row.customerCodeSnapshot)}
                                </TableCell>
                                <TableCell>{previewCell(row.status)}</TableCell>
                                <TableCell className="max-w-[90px] truncate font-mono text-[10px]" title={previewCell(row._docId ?? row.id)}>
                                  {previewCell(row._docId ?? row.id) || '—'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">معاينة — تسويات</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">تاريخ</TableHead>
                            <TableHead className="text-right">مبلغ</TableHead>
                            <TableHead className="text-right">ملاحظة</TableHead>
                            <TableHead className="text-right font-mono text-[10px]">_docId</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packAnalysis.adjustments.preview.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                لا صفوف غير فارغة
                              </TableCell>
                            </TableRow>
                          ) : (
                            packAnalysis.adjustments.preview.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{previewCell(row.effectiveDate)}</TableCell>
                                <TableCell className="tabular-nums">{previewCell(row.signedAmount)}</TableCell>
                                <TableCell className="max-w-[180px] truncate">{previewCell(row.note)}</TableCell>
                                <TableCell className="max-w-[90px] truncate font-mono text-[10px]" title={previewCell(row._docId ?? row.id)}>
                                  {previewCell(row._docId ?? row.id) || '—'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                    />
                    دمج (تحديث العملاء بالكود والبنوك برقم الحساب؛ أو بـ _docId للإيداعات/التسويات)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace_module'}
                      onChange={() => setImportMode('replace_module')}
                    />
                    استبدال كامل الموديول (خطير)
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importMode === 'merge' ? (
                    <Button type="button" disabled={importBusy || parseBusy} onClick={() => void runImport('merge')}>
                      تنفيذ الدمج
                    </Button>
                  ) : (
                    <Button type="button" variant="destructive" disabled={importBusy || parseBusy} onClick={requestReplaceImport}>
                      تنفيذ الاستبدال…
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد استبدال موديول إيداعات العملاء</DialogTitle>
            <DialogDescription>
              سيتم حذف كل العملاء وحسابات البنك والإيداعات والتسويات لهذه الشركة ثم كتابة محتوى الملف. لا يمكن التراجع
              تلقائيًا.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="replace-confirm">اكتب «حذف» للمتابعة</Label>
            <Input
              id="replace-confirm"
              value={replaceConfirm}
              onChange={(e) => setReplaceConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReplaceDialogOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" variant="destructive" disabled={importBusy} onClick={confirmReplaceImport}>
              تأكيد الحذف والاستيراد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
