import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportToPDF } from '../../../utils/reportExport';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { productMaterialService } from '../../production/services/productMaterialService';
import { formatRepairWhatsAppMessage } from '../utils/whatsappRepairMessage';
import { DeliveryReceiptPDF } from '../components/DeliveryReceiptPDF';
import { StatusBadge } from '../components/StatusBadge';
import { WhatsAppShare } from '../components/WhatsAppShare';
import { REPAIR_JOB_STATUS_LABELS, type FirestoreUserWithRepair, type RepairBranch, type RepairJob, type RepairSparePart } from '../types';

export const RepairJobDetail: React.FC = () => {
  const { jobId = '' } = useParams<{ jobId: string }>();
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const [job, setJob] = useState<RepairJob | null>(null);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [allowedPartIds, setAllowedPartIds] = useState<Set<string>>(new Set());
  const [hasProductComponents, setHasProductComponents] = useState(false);
  const [status, setStatus] = useState<RepairJob['status']>('received');
  const [finalCost, setFinalCost] = useState('');
  const [warranty, setWarranty] = useState<RepairJob['warranty']>('none');
  const [reason, setReason] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void repairJobService.getById(jobId).then((row) => {
      setJob(row);
      setStatus(row?.status || 'received');
      setFinalCost(String(row?.finalCost ?? ''));
      setWarranty(row?.warranty || 'none');
    });
    void repairBranchService.list().then(setBranches);
  }, [jobId]);

  useEffect(() => {
    if (!job?.branchId) return;
    void Promise.all([
      sparePartsService.listParts(job.branchId),
      job.productId ? productMaterialService.getByProduct(job.productId) : Promise.resolve([]),
    ]).then(([partsRows, materials]) => {
      const normalizedMaterials = materials
        .map((m) => ({
          materialId: String(m.materialId || '').trim(),
          materialName: String(m.materialName || '').trim().toLowerCase(),
        }))
        .filter((m) => m.materialId || m.materialName);
      const allowedIds = new Set<string>();
      if (normalizedMaterials.length > 0) {
        partsRows.forEach((part) => {
          const partId = String(part.id || '').trim();
          const partName = String(part.name || '').trim().toLowerCase();
          const isAllowed = normalizedMaterials.some(
            (m) => (m.materialId && m.materialId === partId) || (m.materialName && m.materialName === partName),
          );
          if (isAllowed && partId) allowedIds.add(partId);
        });
      }
      setAllowedPartIds(allowedIds);
      setHasProductComponents(normalizedMaterials.length > 0);
      setParts(partsRows);
    });
  }, [job?.branchId, job?.productId]);

  const filteredParts = useMemo(
    () => parts.filter((part) => part.id && allowedPartIds.has(part.id)),
    [allowedPartIds, parts],
  );

  const branch = useMemo(
    () => branches.find((b) => b.id === job?.branchId) || null,
    [branches, job?.branchId],
  );
  const branchWarehouseId = String(branch?.warehouseId || '').trim();
  const branchWarehouseCode = String(branch?.warehouseCode || '').trim();

  if (!job) return <div dir="rtl" role="status" aria-live="polite">جاري تحميل الطلب...</div>;

  const applyStatus = async () => {
    try {
      await repairJobService.changeStatus({
        jobId,
        status,
        technicianId: userProfile?.id,
        reason: status === 'unrepairable' ? reason : undefined,
        finalCost: status === 'delivered' ? Number(finalCost || 0) : undefined,
        warranty: status === 'delivered' ? warranty : undefined,
      });
      const next = await repairJobService.getById(jobId);
      setJob(next);
      toast.success('تم تحديث الحالة.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحديث الحالة.');
    }
  };

  const assignToMe = async () => {
    if (!userProfile?.id) return;
    await repairJobService.assignTechnician(jobId, userProfile.id);
    setJob(await repairJobService.getById(jobId));
    toast.success('تم إسناد الطلب لك.');
  };

  const addPartUsage = async () => {
    if (!hasProductComponents) {
      toast.error('لا يمكن صرف قطع غيار لأن المنتج لا يحتوي مكونات معرفة.');
      return;
    }
    if (!branchWarehouseId) {
      toast.error('هذا الفرع لا يملك مخزنًا مرتبطًا. لا يمكن صرف قطع الغيار.');
      return;
    }
    const part = parts.find((p) => p.id === selectedPartId);
    if (!part || !job.branchId) return;
    if (!part.id || !allowedPartIds.has(part.id)) {
      toast.error('هذه القطعة ليست ضمن مكونات المنتج.');
      return;
    }
    const qty = Number(partQty || 0);
    if (qty <= 0) return;
    const nextParts = [...(job.partsUsed || []), {
      partId: part.id || '',
      partName: part.name,
      quantity: qty,
      unitCost: 0,
    }];
    await sparePartsService.adjustStock({
      branchId: job.branchId,
      warehouseId: branchWarehouseId,
      warehouseName: branch?.name ? `مخزن ${branch.name}` : branchWarehouseCode,
      partId: part.id || '',
      partName: part.name,
      quantity: qty,
      type: 'OUT',
      createdBy: userProfile?.displayName || userProfile?.email || 'system',
      jobId,
      notes: 'استهلاك قطع غيار في طلب صيانة',
    });
    await repairJobService.update(jobId, { partsUsed: nextParts });
    setJob(await repairJobService.getById(jobId));
    toast.success('تم خصم القطعة من المخزون.');
  };

  const exportReceipt = async () => {
    if (!receiptRef.current) return;
    await exportToPDF(receiptRef.current, `repair-receipt-${job.receiptNo}`);
  };
  const handlePrintRepairRequest = () => {
    window.print();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white no-print">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">تفاصيل الطلب #{job.receiptNo}</h1>
              <p className="text-sm text-muted-foreground mt-1">مراجعة الحالة، القطع المستخدمة، وإصدار إيصال التسليم.</p>
            </div>
            <StatusBadge status={job.status} />
          </div>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader><CardTitle>بيانات العميل والجهاز</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>{job.customerName} - {job.customerPhone}</div>
          {job.customerAddress && <div>{job.customerAddress}</div>}
          <div>{job.deviceBrand} {job.deviceModel}</div>
          <div>نوع الجهاز: {job.deviceType || '—'}</div>
          {job.deviceColor && <div>اللون: {job.deviceColor}</div>}
          {job.accessories && <div>الإكسسوارات: {job.accessories}</div>}
          <div className="pt-1">وصف العطل: {job.problemDescription}</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3 no-print">
        <Card>
          <CardHeader><CardTitle>تحديث الحالة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label>تغيير الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RepairJob['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="received">{REPAIR_JOB_STATUS_LABELS.received}</SelectItem>
                <SelectItem value="inspection">{REPAIR_JOB_STATUS_LABELS.inspection}</SelectItem>
                <SelectItem value="repair">{REPAIR_JOB_STATUS_LABELS.repair}</SelectItem>
                <SelectItem value="ready">{REPAIR_JOB_STATUS_LABELS.ready}</SelectItem>
                <SelectItem value="delivered">{REPAIR_JOB_STATUS_LABELS.delivered}</SelectItem>
                <SelectItem value="unrepairable">{REPAIR_JOB_STATUS_LABELS.unrepairable}</SelectItem>
              </SelectContent>
            </Select>
            {status === 'unrepairable' && (
              <div className="space-y-1">
                <Label htmlFor="unrepairable-reason">سبب عدم إمكانية الإصلاح</Label>
                <textarea
                  id="unrepairable-reason"
                  placeholder="اكتب السبب بالتفصيل"
                  className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            {status === 'delivered' && (
              <div className="space-y-2">
                <Input type="number" placeholder="التكلفة النهائية" value={finalCost} onChange={(e) => setFinalCost(e.target.value)} />
                <Select value={warranty} onValueChange={(v) => setWarranty(v as RepairJob['warranty'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون</SelectItem>
                    <SelectItem value="3months">3 شهور</SelectItem>
                    <SelectItem value="6months">6 شهور</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={applyStatus} disabled={!can('repair.jobs.edit')}>حفظ الحالة</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>استهلاك قطع غيار</CardTitle>
            <CardDescription>استخدم هذا القسم لتسجيل قطع الغيار المصروفة للطلب.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!branchWarehouseId && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                هذا الفرع لا يملك مخزنًا مرتبطًا، لذلك لا يمكن صرف قطع الغيار من الطلب.
              </div>
            )}
            {!hasProductComponents && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                المنتج المختار في الطلب لا يحتوي مكونات معرفة. يجب إضافة المكونات أولًا قبل صرف قطع الغيار.
              </div>
            )}
            <Select value={selectedPartId} onValueChange={setSelectedPartId}>
              <SelectTrigger><SelectValue placeholder="اختر قطعة" /></SelectTrigger>
              <SelectContent>{filteredParts.map((p) => <SelectItem key={p.id} value={p.id || ''}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={1} value={partQty} onChange={(e) => setPartQty(e.target.value)} />
            <Button variant="outline" onClick={addPartUsage} disabled={!hasProductComponents || !branchWarehouseId}>إضافة/خصم</Button>
            <Button variant="secondary" onClick={assignToMe}>إسناد الطلب لي</Button>
          </CardContent>
        </Card>
      </div>

      {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 && (
        <Card className="no-print">
          <CardHeader><CardTitle>قطع الغيار المستخدمة</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {job.partsUsed.map((part, idx) => (
              <div key={`${part.partId}-${idx}`} className="flex items-center justify-between border rounded px-2 py-1">
                <span>{part.partName}</span>
                <Badge variant="secondary">x {part.quantity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {Array.isArray(job.statusHistory) && job.statusHistory.length > 0 && (
        <Card className="no-print">
          <CardHeader><CardTitle>سجل الحالة</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[...job.statusHistory].reverse().map((entry, idx) => (
              <div key={`${entry.at}-${idx}`} className="rounded border px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={entry.status} />
                  <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString('ar-EG')}</span>
                </div>
                {entry.reason && <div className="mt-1 text-xs text-muted-foreground">السبب: {entry.reason}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 no-print">
        <Button variant="outline" onClick={handlePrintRepairRequest}>
          <Printer className="h-4 w-4 ms-1" /> طباعة طلب الصيانة
        </Button>
        <WhatsAppShare text={formatRepairWhatsAppMessage(job)} />
        <Button variant="outline" onClick={exportReceipt}>تنزيل إيصال PDF</Button>
      </div>

      <Card className="repair-job-print-sheet">
        <CardHeader className="border-b">
          <CardTitle className="text-xl">طلب صيانة</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">نسخة مهيأة للطباعة</p>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-2 text-sm">
            <div><span className="font-semibold">رقم الطلب:</span> {job.receiptNo}</div>
            <div><span className="font-semibold">تاريخ الإنشاء:</span> {new Date(job.createdAt).toLocaleString('ar-EG')}</div>
            <div><span className="font-semibold">الفرع:</span> {branch?.name || '-'}</div>
            <div><span className="font-semibold">العميل:</span> {job.customerName || '-'}</div>
            <div><span className="font-semibold">الهاتف:</span> {job.customerPhone || '-'}</div>
            <div><span className="font-semibold">الحالة:</span> {REPAIR_JOB_STATUS_LABELS[job.status] || job.status}</div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm repair-job-print-table">
              <tbody>
                <tr>
                  <th className="w-1/3 text-right p-2 font-semibold bg-muted/40">نوع الجهاز</th>
                  <td className="p-2">{job.deviceType || '-'}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">الماركة / الموديل</th>
                  <td className="p-2">{job.deviceBrand} {job.deviceModel}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">اللون</th>
                  <td className="p-2">{job.deviceColor || '-'}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">الإكسسوارات</th>
                  <td className="p-2">{job.accessories || '-'}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">العنوان</th>
                  <td className="p-2">{job.customerAddress || '-'}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">التكلفة النهائية</th>
                  <td className="p-2">{Number(job.finalCost || 0) > 0 ? Number(job.finalCost || 0).toLocaleString('ar-EG') : '-'}</td>
                </tr>
                <tr>
                  <th className="text-right p-2 font-semibold bg-muted/40">الضمان</th>
                  <td className="p-2">{job.warranty || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded border p-3 text-sm">
            <span className="font-semibold">وصف العطل:</span> {job.problemDescription || '-'}
          </div>

          {Array.isArray(job.partsUsed) && job.partsUsed.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm repair-job-print-table">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-right p-2">#</th>
                    <th className="text-right p-2">القطعة</th>
                    <th className="text-right p-2">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {job.partsUsed.map((part, idx) => (
                    <tr key={`${part.partId}-${idx}`}>
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">{part.partName}</td>
                      <td className="p-2">{part.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-6 text-sm">
            <div className="border-t pt-2 text-center">توقيع الموظف</div>
            <div className="border-t pt-2 text-center">توقيع العميل</div>
          </div>
        </CardContent>
      </Card>

      <div className="hidden">
        <DeliveryReceiptPDF ref={receiptRef} job={job} branch={branch} />
      </div>
    </div>
  );
};

export default RepairJobDetail;
