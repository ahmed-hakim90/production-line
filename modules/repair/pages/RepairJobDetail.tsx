import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { repairJobService } from '../services/repairJobService';
import { sparePartsService } from '../services/sparePartsService';
import { repairBranchService } from '../services/repairBranchService';
import { repairCashService } from '../services/repairCashService';
import { StatusBadge } from '../components/StatusBadge';
import { DeliveryReceiptPDF } from '../components/DeliveryReceiptPDF';
import { buildStatusWhatsAppMessage, sendWhatsAppMessage } from '../utils/whatsappRepairMessage';
import type {
  RepairJob,
  RepairJobStatus,
  RepairSparePart,
  RepairPartUsed,
  RepairBranch,
} from '../types';
import { REPAIR_WARRANTY_LABELS } from '../types';
import { useAppStore } from '../../../store/useAppStore';

const STATUS_FLOW: RepairJobStatus[] = ['received', 'inspection', 'repair', 'ready', 'delivered'];
const STATUS_LABELS: Record<RepairJobStatus, string> = {
  received: 'وارد',
  inspection: 'فحص',
  repair: 'إصلاح',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  unrepairable: 'غير قابل للإصلاح',
};

export const RepairJobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  const [job, setJob] = useState<RepairJob | null>(null);
  const [branch, setBranch] = useState<RepairBranch | null>(null);
  const [availableParts, setAvailableParts] = useState<RepairSparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Delivery dialog state
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [finalCost, setFinalCost] = useState('');
  const [deliveryWarranty, setDeliveryWarranty] = useState<RepairJob['warranty']>('none');
  const [paymentType, setPaymentType] = useState<RepairJob['paymentType']>('paid');

  // Unrepairable dialog
  const [showUnrepairableDialog, setShowUnrepairableDialog] = useState(false);
  const [unrepairableReason, setUnrepairableReason] = useState('');

  // Parts editor
  const [editingParts, setEditingParts] = useState(false);
  const [draftParts, setDraftParts] = useState<RepairPartUsed[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedUnitCost, setSelectedUnitCost] = useState(0);

  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    repairJobService.getById(id).then((j) => {
      setJob(j);
      if (j?.branchId) {
        repairBranchService.getById(j.branchId).then(setBranch);
        sparePartsService.getAll(j.branchId).then(setAvailableParts);
      }
      setLoading(false);
    });
  }, [id]);

  const changeStatus = async (newStatus: RepairJobStatus) => {
    if (!job?.id) return;
    if (newStatus === 'delivered') {
      setShowDeliveryDialog(true);
      return;
    }
    setSaving(true);
    try {
      await repairJobService.updateStatus({
        jobId: job.id,
        status: newStatus,
        changedBy: uid!,
        changedByName: userDisplayName,
      });
      setJob((j) => j ? { ...j, status: newStatus } : j);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const markUnrepairable = async () => {
    if (!job?.id || !unrepairableReason.trim()) return;
    setSaving(true);
    try {
      await repairJobService.updateStatus({
        jobId: job.id,
        status: 'unrepairable',
        changedBy: uid!,
        changedByName: userDisplayName,
        unrepairableReason,
      });
      setJob((j) => j ? { ...j, status: 'unrepairable', unrepairableReason } : j);
      setShowUnrepairableDialog(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelivery = async () => {
    if (!job?.id) return;
    setSaving(true);
    try {
      const cost = paymentType === 'warranty_free' ? 0 : Number(finalCost) || 0;
      await repairJobService.updateStatus({
        jobId: job.id,
        status: 'delivered',
        changedBy: uid!,
        changedByName: userDisplayName,
        finalCost: cost,
        warranty: deliveryWarranty,
        paymentType,
      });
      // Record income in cash register if cost > 0
      if (cost > 0 && job.branchId) {
        const session = await repairCashService.getOpenSession(job.branchId);
        await repairCashService.addTransaction({
          branchId: job.branchId,
          sessionId: session?.id,
          type: 'income',
          category: 'صيانة',
          amount: cost,
          jobId: job.id,
          description: `صيانة ${job.receiptNo} - ${job.customerName}`,
          createdBy: uid!,
        });
      }
      setJob((j) => j ? { ...j, status: 'delivered', finalCost: cost, warranty: deliveryWarranty, paymentType } : j);
      setShowDeliveryDialog(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = async () => {
    if (!pdfRef.current || !job) return;
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');
    const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    pdf.save(`${job.receiptNo}.pdf`);
  };

  const sendWhatsApp = () => {
    if (!job) return;
    const msg = buildStatusWhatsAppMessage(job, branch?.phone);
    sendWhatsAppMessage(job.customerPhone, msg);
  };

  // Parts editing
  const addPartToDraft = () => {
    if (!selectedPartId) return;
    const part = availableParts.find((p) => p.id === selectedPartId);
    if (!part) return;
    setDraftParts((prev) => {
      const existing = prev.find((p) => p.partId === selectedPartId);
      if (existing) {
        return prev.map((p) =>
          p.partId === selectedPartId
            ? { ...p, quantity: p.quantity + selectedQty }
            : p,
        );
      }
      return [...prev, {
        partId: part.id!,
        partName: part.name,
        quantity: selectedQty,
        unitCost: selectedUnitCost || part.sellingPrice,
      }];
    });
    setSelectedPartId('');
    setSelectedQty(1);
    setSelectedUnitCost(0);
  };

  const saveParts = async () => {
    if (!job?.id) return;
    setSaving(true);
    try {
      await repairJobService.updatePartsUsed({
        jobId: job.id,
        branchId: job.branchId,
        previousParts: job.partsUsed,
        newParts: draftParts,
        updatedBy: uid!,
      });
      setJob((j) => j ? { ...j, partsUsed: draftParts } : j);
      setEditingParts(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>الطلب غير موجود</p>
        <Link to="/repair/jobs" className="text-blue-600 hover:underline mt-2 inline-block">
          رجوع للقائمة
        </Link>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(job.status);
  const isTerminal = job.status === 'delivered' || job.status === 'unrepairable';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{job.receiptNo}</h1>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm text-gray-500">
              {job.customerName} • {job.deviceBrand} {job.deviceModel}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={sendWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base">chat</span>
            واتساب
          </button>
          {job.status === 'delivered' && (
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-base">download</span>
              PDF
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Status Flow */}
      {!isTerminal && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-bold text-gray-700 mb-4">تحديث الحالة</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_FLOW.map((s, idx) => (
              <div key={s} className="flex items-center gap-1">
                <button
                  onClick={() => idx > currentIdx && changeStatus(s)}
                  disabled={saving || idx <= currentIdx}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    idx === currentIdx
                      ? 'bg-blue-600 text-white'
                      : idx < currentIdx
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
                {idx < STATUS_FLOW.length - 1 && (
                  <span className="material-symbols-outlined text-gray-300 text-base">chevron_left</span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowUnrepairableDialog(true)}
            disabled={saving}
            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
          >
            تعذّر الإصلاح
          </button>
        </div>
      )}

      {/* Customer & Device */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="بيانات العميل">
          <InfoRow label="الاسم" value={job.customerName} />
          <InfoRow label="الهاتف" value={job.customerPhone} />
          {job.customerAddress && <InfoRow label="العنوان" value={job.customerAddress} />}
        </Card>
        <Card title="بيانات الجهاز">
          <InfoRow label="النوع" value={job.deviceType} />
          <InfoRow label="الماركة" value={job.deviceBrand} />
          <InfoRow label="الموديل" value={job.deviceModel} />
          {job.deviceColor && <InfoRow label="اللون" value={job.deviceColor} />}
          {job.devicePassword && <InfoRow label="كلمة المرور" value={job.devicePassword} />}
          {job.accessories && <InfoRow label="الملحقات" value={job.accessories} />}
        </Card>
      </div>

      {/* Problem */}
      <Card title="وصف العطل">
        <p className="text-gray-700 text-sm leading-relaxed">{job.problemDescription}</p>
      </Card>

      {/* Parts Used */}
      <Card title="قطع الغيار المستخدمة">
        {!editingParts ? (
          <>
            {job.partsUsed.length === 0 ? (
              <p className="text-gray-400 text-sm">لم تُستخدم قطع غيار بعد</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th className="text-right pb-2">القطعة</th>
                    <th className="text-center pb-2">الكمية</th>
                    <th className="text-center pb-2">السعر</th>
                    <th className="text-center pb-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {job.partsUsed.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-2">{p.partName}</td>
                      <td className="py-2 text-center">{p.quantity}</td>
                      <td className="py-2 text-center">{p.unitCost} ج</td>
                      <td className="py-2 text-center font-semibold">{p.quantity * p.unitCost} ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!isTerminal && (
              <button
                onClick={() => { setDraftParts([...job.partsUsed]); setEditingParts(true); }}
                className="mt-3 text-blue-600 text-sm hover:underline"
              >
                + تعديل القطع
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {/* Add part row */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedPartId}
                onChange={(e) => {
                  setSelectedPartId(e.target.value);
                  const p = availableParts.find((x) => x.id === e.target.value);
                  if (p) setSelectedUnitCost(p.sellingPrice);
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">اختر القطعة...</option>
                {availableParts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.code}</option>
                ))}
              </select>
              <input
                type="number"
                value={selectedQty}
                onChange={(e) => setSelectedQty(Number(e.target.value))}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="1"
                placeholder="كمية"
              />
              <input
                type="number"
                value={selectedUnitCost}
                onChange={(e) => setSelectedUnitCost(Number(e.target.value))}
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="0"
                placeholder="سعر"
              />
              <button onClick={addPartToDraft} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200">
                إضافة
              </button>
            </div>

            {/* Draft list */}
            {draftParts.length > 0 && (
              <table className="w-full text-sm">
                <tbody>
                  {draftParts.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-2">{p.partName}</td>
                      <td className="py-2 text-center">{p.quantity}</td>
                      <td className="py-2 text-center">{p.unitCost} ج</td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => setDraftParts((prev) => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex gap-2">
              <button
                onClick={saveParts}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? '...' : 'حفظ القطع'}
              </button>
              <button
                onClick={() => setEditingParts(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Financial Summary */}
      <Card title="الملخص المالي">
        <div className="flex items-center justify-between">
          <div>
            <InfoRow label="الضمان" value={REPAIR_WARRANTY_LABELS[job.warranty]} />
            {job.estimatedCost !== undefined && (
              <InfoRow label="التقدير" value={`${job.estimatedCost} ج`} />
            )}
          </div>
          <div className="text-center">
            {job.finalCost !== undefined ? (
              <>
                <p className="text-xs text-gray-500">التكلفة النهائية</p>
                <p className="text-2xl font-bold text-blue-600">
                  {job.finalCost === 0 ? 'مجاني' : `${job.finalCost.toLocaleString('ar-EG')} ج`}
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">لم تُحدد بعد</p>
            )}
          </div>
        </div>
      </Card>

      {/* Status History */}
      {job.statusHistory && job.statusHistory.length > 0 && (
        <Card title="سجل الحالات">
          <div className="space-y-2">
            {[...job.statusHistory].reverse().map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <StatusBadge status={h.status} size="sm" />
                <span className="text-gray-500 text-xs">
                  {new Date(h.changedAt).toLocaleString('ar-EG')}
                </span>
                {h.changedByName && <span className="text-gray-400 text-xs">— {h.changedByName}</span>}
                {h.notes && <span className="text-gray-600 text-xs">({h.notes})</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Hidden PDF */}
      <DeliveryReceiptPDF ref={pdfRef} job={job} branch={branch} />

      {/* Delivery Dialog */}
      {showDeliveryDialog && (
        <Dialog title="تسليم الجهاز" onClose={() => setShowDeliveryDialog(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوع الدفع</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as RepairJob['paymentType'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="paid">مدفوع</option>
                <option value="warranty_free">مجاني (ضمان)</option>
                <option value="service_only">خدمة فقط (بدون قطع)</option>
              </select>
            </div>
            {paymentType !== 'warranty_free' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التكلفة النهائية (ج)</label>
                <input
                  type="number"
                  value={finalCost}
                  onChange={(e) => setFinalCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min="0"
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الضمان</label>
              <select
                value={deliveryWarranty}
                onChange={(e) => setDeliveryWarranty(e.target.value as RepairJob['warranty'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="none">بدون ضمان</option>
                <option value="3months">3 شهور</option>
                <option value="6months">6 شهور</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeliveryDialog(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={confirmDelivery} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'تأكيد التسليم'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Unrepairable Dialog */}
      {showUnrepairableDialog && (
        <Dialog title="تعذّر الإصلاح" onClose={() => setShowUnrepairableDialog(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">يرجى ذكر سبب عدم إمكانية الإصلاح</p>
            <textarea
              value={unrepairableReason}
              onChange={(e) => setUnrepairableReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="مثال: قطعة الغيار غير متوفرة في السوق..."
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUnrepairableDialog(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={markUnrepairable} disabled={saving || !unrepairableReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
    <h2 className="font-bold text-gray-700 text-sm mb-4 border-b border-gray-100 pb-2">{title}</h2>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <p className="text-sm text-gray-700 mb-1.5">
    <span className="text-gray-500">{label}: </span>
    <span className="font-medium">{value}</span>
  </p>
);

const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);
