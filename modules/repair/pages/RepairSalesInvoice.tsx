import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileDown, Printer, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairSalesInvoice, type RepairSalesInvoiceLine, type RepairSparePart } from '../types';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import { repairTreasuryService } from '../services/repairTreasuryService';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

type DraftLine = RepairSalesInvoiceLine & { key: string };

export const RepairSalesInvoicePage: React.FC = () => {
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branches, branchId],
  );
  const allowedBranches = useMemo(() => {
    if (can('repair.branches.manage')) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, can, currentEmployee?.id, user]);

  useEffect(() => {
    void repairBranchService.list().then((rows) => {
      setBranches(rows);
      const defaultBranch = rows[0]?.id || '';
      setBranchId(defaultBranch);
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
  const printableInvoice = useMemo(() => {
    if (!latestInvoices.length) return null;
    if (!lastSavedInvoiceId) return latestInvoices[0] || null;
    return latestInvoices.find((row) => row.id === lastSavedInvoiceId) || latestInvoices[0] || null;
  }, [latestInvoices, lastSavedInvoiceId]);

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

  const handlePrint = () => {
    if (!printableInvoice) {
      toast.error('احفظ فاتورة أولًا قبل الطباعة.');
      return;
    }
    window.print();
  };

  const handleExportPdf = async () => {
    if (!printableInvoice || !printRef.current) {
      toast.error('لا توجد فاتورة جاهزة للتصدير.');
      return;
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
      toast.success('تم تصدير PDF بنجاح.');
    } catch {
      toast.error('تعذر تصدير PDF حاليًا.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4 repair-invoice-page" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white no-print">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold">فاتورة بيع قطع غيار</h1>
          <p className="text-sm text-muted-foreground mt-1">بيع مباشر بدون طلب صيانة مع خصم المخزون تلقائيًا.</p>
        </CardContent>
      </Card>

      <Card className="no-print">
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

      <Card className="no-print">
        <CardHeader><CardTitle>إضافة سطر</CardTitle></CardHeader>
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

      <Card className="no-print">
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
            <Button onClick={async () => {
              try {
                if (lines.length === 0) {
                  toast.error('لا توجد بنود للحفظ.');
                  return;
                }
                const invoiceId = await repairSalesInvoiceService.create({
                  branchId,
                  warehouseId: activeBranch?.warehouseId,
                  warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeBranch?.warehouseCode,
                  lines: lines.map((line) => ({
                    partId: line.partId,
                    partName: line.partName,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal,
                  })),
                  customerName,
                  customerPhone,
                  notes,
                  createdBy: user?.id || '',
                  createdByName: user?.displayName || user?.email || 'system',
                });
                try {
                  await repairTreasuryService.addEntry({
                    branchId,
                    entryType: 'INCOME',
                    amount: total,
                    note: 'تحصيل فاتورة بيع قطع غيار',
                    referenceId: invoiceId || '',
                    createdBy: user?.id || '',
                    createdByName: user?.displayName || user?.email || 'system',
                  });
                } catch {
                  // Treasury entry is optional if no open session.
                }
                toast.success('تم حفظ الفاتورة وخصم المخزون.');
                setLastSavedInvoiceId(invoiceId || null);
                setLines([]);
                await Promise.all([
                  repairSalesInvoiceService.list(branchId).then(setLatestInvoices),
                  sparePartsService.listParts(branchId).then(setParts),
                ]);
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : 'تعذر حفظ الفاتورة.';
                toast.error(message);
              }
            }} disabled={!branchId || lines.length === 0}>
              حفظ الفاتورة
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!printableInvoice}>
              <Printer className="h-4 w-4 ms-1" /> طباعة A4
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={!printableInvoice || isExportingPdf}>
              <FileDown className="h-4 w-4 ms-1" /> {isExportingPdf ? 'جارٍ التصدير...' : 'تصدير PDF'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader><CardTitle>آخر الفواتير</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {latestInvoices.slice(0, 10).map((row) => (
            <div
              key={row.id}
              className={`rounded border px-2 py-1 flex items-center justify-between cursor-pointer transition-colors ${printableInvoice?.id === row.id ? 'border-primary/70 bg-primary/5' : ''}`}
              onClick={() => setLastSavedInvoiceId(row.id || null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLastSavedInvoiceId(row.id || null);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">{row.invoiceNo}</Badge>
                <span>{row.customerName || 'عميل نقدي'}</span>
              </div>
              <div className="font-mono">{fmt(Number(row.total || 0))}</div>
            </div>
          ))}
          {latestInvoices.length === 0 && <div className="text-muted-foreground">لا توجد فواتير بعد.</div>}
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
  );
};

export default RepairSalesInvoicePage;
