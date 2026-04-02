import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileDown, MessageCircle, Pencil, PlusCircle, Printer, Trash2, XCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairSalesInvoice, type RepairSalesInvoiceLine, type RepairSparePart } from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { exportHRData } from '../../../utils/exportExcel';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

type DraftLine = RepairSalesInvoiceLine & { key: string };

export const RepairSalesInvoicePage: React.FC = () => {
  const { dir } = useAppDirection();
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('0');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [latestInvoices, setLatestInvoices] = useState<RepairSalesInvoice[]>([]);
  const [lastSavedInvoiceId, setLastSavedInvoiceId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [invoiceNoFilter, setInvoiceNoFilter] = useState('');
  const [customerNameFilter, setCustomerNameFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const printRef = useRef<HTMLDivElement | null>(null);
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branches, branchId],
  );
  const allowedBranches = useMemo(() => {
    if (repairCtx.canViewAllBranches) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && (branch.technicianIds || []).includes(employeeId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, repairCtx.canViewAllBranches, currentEmployee?.id, user]);

  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
    });
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchId('');
      return;
    }
    const isCurrentAllowed = allowedBranches.some((branch) => branch.id === branchId);
    if (isCurrentAllowed) return;
    setBranchId(String(allowedBranches[0].id || ''));
  }, [allowedBranches, branchId]);

  useEffect(() => {
    if (!branchId) return;
    void sparePartsService.listParts(branchId).then(setParts);
    void repairSalesInvoiceService.list(branchId).then(setLatestInvoices);
  }, [branchId]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    [lines],
  );
  const selectedPart = useMemo(
    () => parts.find((part) => part.id === selectedPartId) || null,
    [parts, selectedPartId],
  );
  const filteredInvoices = useMemo(() => {
    const invoiceNoQuery = invoiceNoFilter.trim().toLowerCase();
    const customerQuery = customerNameFilter.trim().toLowerCase();
    const from = fromDateFilter ? new Date(`${fromDateFilter}T00:00:00`) : null;
    const to = toDateFilter ? new Date(`${toDateFilter}T23:59:59`) : null;
    return latestInvoices.filter((invoice) => {
      const invoiceNo = String(invoice.invoiceNo || '').toLowerCase();
      const customerName = String(invoice.customerName || '').toLowerCase();
      const createdAt = new Date(invoice.createdAt);
      const matchNo = !invoiceNoQuery || invoiceNo.includes(invoiceNoQuery);
      const matchCustomer = !customerQuery || customerName.includes(customerQuery);
      const matchFrom = !from || createdAt >= from;
      const matchTo = !to || createdAt <= to;
      return matchNo && matchCustomer && matchFrom && matchTo;
    });
  }, [latestInvoices, invoiceNoFilter, customerNameFilter, fromDateFilter, toDateFilter]);
  const printableInvoice = useMemo(() => {
    if (!filteredInvoices.length) return null;
    if (!lastSavedInvoiceId) return filteredInvoices[0] || null;
    return filteredInvoices.find((row) => row.id === lastSavedInvoiceId) || filteredInvoices[0] || null;
  }, [filteredInvoices, lastSavedInvoiceId]);
  const managerBranchIds = useMemo(() => {
    const employeeId = String(currentEmployee?.id || '').trim();
    if (!employeeId) return new Set<string>();
    return new Set(
      branches
        .filter((branch) => String(branch.managerEmployeeId || '') === employeeId)
        .map((branch) => String(branch.id || ''))
        .filter(Boolean),
    );
  }, [branches, currentEmployee?.id]);
  const canEditByRole = can('repair.salesInvoice.edit');
  const canCancelByRole = can('repair.salesInvoice.cancel');
  const canManageInvoiceByBranch = (invoiceBranchId: string) => managerBranchIds.has(String(invoiceBranchId || ''));
  const canEditInvoice = (invoice: RepairSalesInvoice) => canEditByRole || canManageInvoiceByBranch(invoice.branchId);
  const canCancelInvoice = (invoice: RepairSalesInvoice) => canCancelByRole || canManageInvoiceByBranch(invoice.branchId);
  const isCancelledInvoice = (invoice: RepairSalesInvoice | null | undefined) =>
    (invoice?.status || 'active') === 'cancelled';

  const addLine = () => {
    const part = parts.find((p) => p.id === selectedPartId);
    if (!part?.id) return;
    const quantity = Math.max(1, Number(qty || 0));
    const unitPrice = Math.max(0, Number(price || 0));
    const lineTotal = quantity * unitPrice;
    setLines((prev) => [
      ...prev,
      {
        key: `${part.id}-${Date.now()}`,
        partId: part.id || '',
        partName: part.name,
        quantity,
        unitPrice,
        lineTotal,
      },
    ]);
    setQty('1');
    setPrice('0');
  };
  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };
  const branchNameById = (id: string) => branches.find((b) => b.id === id)?.name || '-';
  const getErrorMessage = (error: unknown, fallback: string): string => (
    error instanceof Error && error.message ? error.message : fallback
  );
  const resetDraft = () => {
    setEditingInvoiceId(null);
    setLines([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
  };
  const startEditInvoice = (invoice: RepairSalesInvoice) => {
    if (isCancelledInvoice(invoice)) {
      toast.error('لا يمكن تعديل فاتورة ملغاة.');
      return;
    }
    if (!canEditInvoice(invoice)) {
      toast.error('ليس لديك صلاحية تعديل هذه الفاتورة.');
      return;
    }
    setEditingInvoiceId(invoice.id || null);
    setBranchId(invoice.branchId || '');
    setCustomerName(invoice.customerName || '');
    setCustomerPhone(invoice.customerPhone || '');
    setNotes(invoice.notes || '');
    setLines(
      (invoice.lines || []).map((line, index) => ({
        key: `${line.partId}-${Date.now()}-${index}`,
        partId: line.partId,
        partName: line.partName,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        lineTotal: Number(line.lineTotal || 0),
      })),
    );
  };
  const handleCancelInvoice = async (invoice: RepairSalesInvoice) => {
    if (!invoice.id) return;
    if (!canCancelInvoice(invoice)) {
      toast.error('ليس لديك صلاحية إلغاء هذه الفاتورة.');
      return;
    }
    if (isCancelledInvoice(invoice)) {
      toast.error('الفاتورة ملغاة بالفعل.');
      return;
    }
    const confirmed = window.confirm(`تأكيد إلغاء الفاتورة ${invoice.invoiceNo}؟ سيتم عكس المخزون والخزينة.`);
    if (!confirmed) return;
    const reasonInput = window.prompt('سبب الإلغاء (اختياري):', '');
    if (reasonInput === null) return;
    try {
      await repairSalesInvoiceService.cancelInvoice({
        id: invoice.id,
        cancelledBy: user?.id || '',
        cancelledByName: user?.displayName || user?.email || 'system',
        cancelReason: reasonInput.trim(),
      });
      toast.success('تم إلغاء الفاتورة وعكس الحركات.');
      if (editingInvoiceId === invoice.id) {
        resetDraft();
      }
      await Promise.all([
        repairSalesInvoiceService.list(branchId).then(setLatestInvoices),
        sparePartsService.listParts(branchId).then(setParts),
      ]);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'تعذر إلغاء الفاتورة.'));
    }
  };

  const handleSaveInvoice = async () => {
    try {
      if (lines.length === 0) {
        toast.error('لا توجد بنود للحفظ.');
        return;
      }
      const invoiceLines = lines.map((line) => ({
        partId: line.partId,
        partName: line.partName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      }));
      if (editingInvoiceId) {
        const invoice = latestInvoices.find((row) => row.id === editingInvoiceId);
        if (!invoice) {
          toast.error('تعذر تحميل الفاتورة للتعديل.');
          return;
        }
        if (!canEditInvoice(invoice)) {
          toast.error('ليس لديك صلاحية تعديل هذه الفاتورة.');
          return;
        }
        await repairSalesInvoiceService.updateInvoice({
          id: editingInvoiceId,
          branchId,
          warehouseId: activeBranch?.warehouseId,
          warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeBranch?.warehouseCode,
          lines: invoiceLines,
          customerName,
          customerPhone,
          notes,
          updatedBy: user?.id || '',
          updatedByName: user?.displayName || user?.email || 'system',
        });
        toast.success('تم تعديل الفاتورة وتحديث المخزون والخزينة.');
        setLastSavedInvoiceId(editingInvoiceId);
      } else {
        await repairTreasuryService.ensureOpenSession(branchId);
        const invoiceId = await repairSalesInvoiceService.create({
          branchId,
          warehouseId: activeBranch?.warehouseId,
          warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeBranch?.warehouseCode,
          lines: invoiceLines,
          customerName,
          customerPhone,
          notes,
          createdBy: user?.id || '',
          createdByName: user?.displayName || user?.email || 'system',
        });
        await repairTreasuryService.addEntry({
          branchId,
          entryType: 'INCOME',
          amount: total,
          note: 'تحصيل فاتورة بيع قطع غيار',
          referenceId: invoiceId || '',
          createdBy: user?.id || '',
          createdByName: user?.displayName || user?.email || 'system',
        });
        toast.success('تم حفظ الفاتورة وخصم المخزون وتسجيل حركة الخزينة.');
        setLastSavedInvoiceId(invoiceId || null);
      }
      resetDraft();
      await Promise.all([
        repairSalesInvoiceService.list(branchId).then(setLatestInvoices),
        sparePartsService.listParts(branchId).then(setParts),
      ]);
    } catch (e: unknown) {
      const message = getErrorMessage(e, 'تعذر حفظ الفاتورة.');
      toast.error(message);
    }
  };

  const handlePrint = () => {
    if (!printableInvoice) {
      toast.error('احفظ فاتورة أولًا قبل الطباعة.');
      return;
    }
    window.print();
  };

  const exportPrintableInvoicePdf = async (showSuccessToast = true): Promise<boolean> => {
    if (!printableInvoice || !printRef.current) {
      toast.error('لا توجد فاتورة جاهزة للتصدير.');
      return false;
    }
    setIsExportingPdf(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const imageHeight = (canvas.height * availableWidth) / canvas.width;
      if (imageHeight <= availableHeight) {
        pdf.addImage(imageData, 'PNG', margin, margin, availableWidth, imageHeight);
      } else {
        const ratio = availableHeight / imageHeight;
        pdf.addImage(imageData, 'PNG', margin, margin, availableWidth * ratio, availableHeight);
      }
      const safeInvoiceNo = String(printableInvoice.invoiceNo || 'invoice').replace(/[^\w-]/g, '_');
      pdf.save(`invoice-${safeInvoiceNo}.pdf`);
      if (showSuccessToast) {
        toast.success('تم تصدير PDF بنجاح.');
      }
      return true;
    } catch {
      toast.error('تعذر تصدير PDF حاليًا.');
      return false;
    } finally {
      setIsExportingPdf(false);
    }
  };
  const handleExportPdf = async () => {
    await exportPrintableInvoicePdf();
  };
  const buildWhatsAppInvoiceText = (invoice: RepairSalesInvoice, includePdfHint = false) => {
    const invoiceLines = (invoice.lines || [])
      .slice(0, 8)
      .map((line, index) => `${index + 1}) ${line.partName} - ${fmt(line.quantity)} × ${fmt(line.unitPrice)} = ${fmt(line.lineTotal)} جنيه`)
      .join('\n');
    const branchName = branchNameById(invoice.branchId);
    return [
      'السلام عليكم،',
      'تفاصيل فاتورة بيع قطع الغيار:',
      `رقم الفاتورة: ${invoice.invoiceNo}`,
      `الفرع: ${branchName}`,
      `العميل: ${invoice.customerName || 'عميل نقدي'}`,
      `الهاتف: ${invoice.customerPhone || '-'}`,
      `الإجمالي: ${fmt(Number(invoice.total || 0))} جنيه`,
      'البنود:',
      invoiceLines || '-',
      invoice.notes ? `ملاحظات: ${invoice.notes}` : '',
      includePdfHint ? 'تم تجهيز نسخة PDF على جهازك. رجاءً قم بإرفاق الملف يدويًا داخل واتساب قبل الإرسال.' : '',
    ]
      .filter(Boolean)
      .join('\n');
  };
  const openWhatsApp = (message: string, phone: string | undefined) => {
    const normalizedPhone = String(phone || '').replace(/[^\d]/g, '');
    const target = normalizedPhone ? `https://wa.me/${normalizedPhone}` : 'https://wa.me/';
    const url = `${target}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const handleShareWhatsAppText = () => {
    if (!printableInvoice) {
      toast.error('لا توجد فاتورة جاهزة للمشاركة.');
      return;
    }
    const message = buildWhatsAppInvoiceText(printableInvoice);
    openWhatsApp(message, printableInvoice.customerPhone);
  };
  const handleShareWhatsAppWithPdfHint = async () => {
    if (!printableInvoice) {
      toast.error('لا توجد فاتورة جاهزة للمشاركة.');
      return;
    }
    const exported = await exportPrintableInvoicePdf(false);
    if (!exported) return;
    const message = buildWhatsAppInvoiceText(printableInvoice, true);
    openWhatsApp(message, printableInvoice.customerPhone);
    toast.success('تم تجهيز PDF وفتح واتساب.');
  };
  const handleCreateNewInvoice = () => {
    resetDraft();
    setSelectedPartId('');
    setQty('1');
    setPrice('0');
    toast.success('تم تجهيز نموذج فاتورة جديدة.');
  };
  const handleClearInvoiceFilters = () => {
    setInvoiceNoFilter('');
    setCustomerNameFilter('');
    setFromDateFilter('');
    setToDateFilter('');
  };
  const handleExportInvoicesExcel = () => {
    if (filteredInvoices.length === 0) {
      toast.error('لا توجد فواتير مطابقة للتصدير.');
      return;
    }
    const rows = filteredInvoices.map((invoice, index) => ({
      '#': index + 1,
      'رقم الفاتورة': invoice.invoiceNo || '-',
      'الحالة': isCancelledInvoice(invoice) ? 'ملغاة' : 'نشطة',
      'التاريخ': new Date(invoice.createdAt).toLocaleString('ar-EG'),
      'الفرع': branchNameById(invoice.branchId),
      'اسم العميل': invoice.customerName || 'عميل نقدي',
      'الهاتف': invoice.customerPhone || '-',
      'عدد البنود': Number(invoice.lines?.length || 0),
      'الإجمالي': Number(invoice.total || 0),
      'ملاحظات': invoice.notes || '',
      'منشئ الفاتورة': invoice.createdByName || '-',
    }));
    const dateLabel = new Date().toISOString().slice(0, 10);
    exportHRData(rows, 'فواتير-بيع-قطع-غيار', `فواتير-بيع-قطع-غيار-${dateLabel}`);
    toast.success('تم تصدير ملف Excel بنجاح.');
  };

  return (
    <div className="space-y-4 repair-invoice-page" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white no-print">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">فاتورة بيع قطع غيار</h1>
              <p className="text-sm text-muted-foreground mt-1">واجهة محسنة لإنشاء الفاتورة، مراجعتها، ثم طباعتها أو مشاركتها مباشرة.</p>
            </div>
            <Button variant="outline" onClick={handleCreateNewInvoice}>
              <PlusCircle className="h-4 w-4 ms-1" /> فاتورة جديدة
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7 no-print">
          <Card>
            <CardHeader>
              <CardTitle>بيانات الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 grid md:grid-cols-3 gap-3">
              <div>
                <Label>الفرع</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    {allowedBranches.map((branch) => <SelectItem key={branch.id} value={branch.id || ''}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>اسم العميل</Label><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="مثال: أحمد محمد" /></div>
              <div><Label>الهاتف</Label><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>إضافة بند</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-5 gap-2 items-end">
              <div>
                <Label>القطعة</Label>
                <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                  <SelectTrigger><SelectValue placeholder="اختر قطعة" /></SelectTrigger>
                  <SelectContent>
                    {parts.map((part) => <SelectItem key={part.id} value={part.id || ''}>{part.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>الكمية</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              <div><Label>سعر الوحدة</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
              <div><Label>ملاحظات الفاتورة</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="تظهر في نسخة الطباعة" /></div>
              <Button onClick={addLine} disabled={!selectedPartId}>إضافة</Button>
            </CardContent>
            {selectedPart && (
              <CardContent className="pt-0 pb-4">
                <p className="text-xs text-muted-foreground">القطعة المختارة: <span className="font-medium text-foreground">{selectedPart.name}</span></p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>بنود الفاتورة</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm repair-invoice-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right p-2 font-semibold">#</th>
                      <th className="text-right p-2 font-semibold">القطعة</th>
                      <th className="text-right p-2 font-semibold">الكمية</th>
                      <th className="text-right p-2 font-semibold">سعر الوحدة</th>
                      <th className="text-right p-2 font-semibold">الإجمالي</th>
                      <th className="text-right p-2 font-semibold">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={line.key} className="border-t">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2">{line.partName} <Badge variant="outline">x {line.quantity}</Badge></td>
                        <td className="p-2">{fmt(line.quantity)}</td>
                        <td className="p-2">{fmt(line.unitPrice)}</td>
                        <td className="p-2 font-medium">{fmt(line.lineTotal)}</td>
                        <td className="p-2">
                          <Button variant="ghost" size="icon" onClick={() => removeLine(line.key)} aria-label="حذف السطر">
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lines.length === 0 && <div className="text-muted-foreground">أضف بنودًا أولًا.</div>}
              <div className="rounded-lg border p-3 grid md:grid-cols-2 gap-2">
                <div className="text-muted-foreground">عدد البنود: {lines.length}</div>
                <div className="text-left md:text-right font-bold">الإجمالي الكلي: {fmt(total)} جنيه</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveInvoice} disabled={!branchId || lines.length === 0}>
                  {editingInvoiceId ? 'تحديث الفاتورة' : 'حفظ الفاتورة'}
                </Button>
                {editingInvoiceId && (
                  <Button variant="outline" onClick={resetDraft}>
                    إلغاء وضع التعديل
                  </Button>
                )}
                <Button variant="outline" onClick={handleCreateNewInvoice}>
                  <PlusCircle className="h-4 w-4 ms-1" /> فاتورة جديدة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card className="no-print">
            <CardHeader>
              <CardTitle>معاينة وإجراءات الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePrint} disabled={!printableInvoice}>
                  <Printer className="h-4 w-4 ms-1" /> طباعة A4
                </Button>
                <Button variant="outline" onClick={handleExportPdf} disabled={!printableInvoice || isExportingPdf}>
                  <FileDown className="h-4 w-4 ms-1" /> {isExportingPdf ? 'جارٍ التصدير...' : 'تصدير PDF'}
                </Button>
                <Button variant="outline" onClick={handleShareWhatsAppText} disabled={!printableInvoice}>
                  <MessageCircle className="h-4 w-4 ms-1" /> واتساب (نص)
                </Button>
                <Button variant="outline" onClick={() => void handleShareWhatsAppWithPdfHint()} disabled={!printableInvoice || isExportingPdf}>
                  <MessageCircle className="h-4 w-4 ms-1" /> واتساب + PDF
                </Button>
              </div>
              <div className="rounded-md border p-2 text-xs text-muted-foreground">
                في مشاركة واتساب + PDF: يتم توليد ملف PDF أولًا، ثم فتح واتساب برسالة جاهزة لتقوم بإرفاق الملف يدويًا.
              </div>
            </CardContent>
          </Card>

          <Card className="repair-invoice-print-sheet" ref={printRef}>
            <CardHeader className="border-b">
              <CardTitle className="text-xl">فاتورة بيع قطع غيار</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">نسخة مهيأة للطباعة والتصدير PDF</p>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {printableInvoice ? (
                <>
                  <div className="grid md:grid-cols-3 gap-2 text-sm">
                    <div><span className="font-semibold">رقم الفاتورة:</span> {printableInvoice.invoiceNo}</div>
                    <div><span className="font-semibold">الحالة:</span> {isCancelledInvoice(printableInvoice) ? 'ملغاة' : 'نشطة'}</div>
                    <div><span className="font-semibold">التاريخ:</span> {new Date(printableInvoice.createdAt).toLocaleString('ar-EG')}</div>
                    <div><span className="font-semibold">الفرع:</span> {branchNameById(printableInvoice.branchId)}</div>
                    <div><span className="font-semibold">العميل:</span> {printableInvoice.customerName || 'عميل نقدي'}</div>
                    <div><span className="font-semibold">الهاتف:</span> {printableInvoice.customerPhone || '-'}</div>
                    <div><span className="font-semibold">منشئ الفاتورة:</span> {printableInvoice.createdByName || '-'}</div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm repair-invoice-table">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-2">#</th>
                          <th className="text-right p-2">القطعة</th>
                          <th className="text-right p-2">الكمية</th>
                          <th className="text-right p-2">سعر الوحدة</th>
                          <th className="text-right p-2">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableInvoice.lines.map((line, index) => (
                          <tr key={`${line.partId}-${index}`} className="border-t">
                            <td className="p-2">{index + 1}</td>
                            <td className="p-2">{line.partName}</td>
                            <td className="p-2">{fmt(line.quantity)}</td>
                            <td className="p-2">{fmt(line.unitPrice)}</td>
                            <td className="p-2 font-medium">{fmt(line.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded border p-3 flex items-center justify-between">
                    <span className="font-semibold">الإجمالي النهائي</span>
                    <span className="text-lg font-bold">{fmt(Number(printableInvoice.total || 0))} جنيه</span>
                  </div>
                  <div className="rounded border p-3 text-sm">
                    <span className="font-semibold">ملاحظات:</span> {printableInvoice.notes || '-'}
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-6 text-sm">
                    <div className="border-t pt-2 text-center">توقيع البائع</div>
                    <div className="border-t pt-2 text-center">توقيع العميل</div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">احفظ فاتورة أو اختر واحدة من قائمة آخر الفواتير لعرض نسخة الطباعة.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="no-print">
        <CardHeader><CardTitle>آخر الفواتير</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid gap-3 xl:grid-cols-12 items-end">
            <div className="xl:col-span-3">
              <Label>فلترة برقم الفاتورة</Label>
              <Input
                value={invoiceNoFilter}
                onChange={(e) => setInvoiceNoFilter(e.target.value)}
                placeholder="مثال: RSI-00015"
              />
            </div>
            <div className="xl:col-span-3">
              <Label>فلترة باسم العميل</Label>
              <Input
                value={customerNameFilter}
                onChange={(e) => setCustomerNameFilter(e.target.value)}
                placeholder="اكتب اسم العميل"
              />
            </div>
            <div className="xl:col-span-2">
              <Label>من تاريخ</Label>
              <Input type="date" value={fromDateFilter} onChange={(e) => setFromDateFilter(e.target.value)} />
            </div>
            <div className="xl:col-span-2">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={toDateFilter} onChange={(e) => setToDateFilter(e.target.value)} />
            </div>
            <div className="xl:col-span-2 flex flex-wrap xl:justify-end gap-2">
              <Button variant="outline" onClick={handleClearInvoiceFilters}>مسح الفلاتر</Button>
              <Button variant="outline" onClick={handleExportInvoicesExcel}>
              <FileDown className="h-4 w-4 ms-1" /> تصدير Excel
            </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Badge variant="secondary">عدد النتائج: {filteredInvoices.length}</Badge>
          </div>
          {filteredInvoices.slice(0, 50).map((row) => (
            <div
              key={row.id}
              className={`rounded border px-3 py-2 flex items-center justify-between gap-3 transition-colors ${printableInvoice?.id === row.id ? 'border-primary/80 bg-primary/10' : 'hover:bg-muted/40'}`}
              role="button"
              tabIndex={0}
              onClick={() => setLastSavedInvoiceId(row.id || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLastSavedInvoiceId(row.id || null);
                }
              }}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{row.invoiceNo}</Badge>
                  <span className="font-medium">{row.customerName || 'عميل نقدي'}</span>
                  {isCancelledInvoice(row) && <Badge variant="destructive">ملغاة</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString('ar-EG')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-semibold">{fmt(Number(row.total || 0))} ج</div>
                {!isCancelledInvoice(row) && canEditInvoice(row) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditInvoice(row);
                    }}
                    aria-label="تعديل الفاتورة"
                  >
                    <Pencil className="h-4 w-4 text-sky-600" />
                  </Button>
                )}
                {!isCancelledInvoice(row) && canCancelInvoice(row) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCancelInvoice(row);
                    }}
                    aria-label="إلغاء الفاتورة (ليس حذفًا نهائيًا)"
                    title="إلغاء الفاتورة (ليس حذفًا نهائيًا)"
                  >
                    <XCircle className="h-4 w-4 text-rose-600" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {filteredInvoices.length === 0 && <div className="text-muted-foreground">لا توجد فواتير مطابقة للفلاتر الحالية.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairSalesInvoicePage;
