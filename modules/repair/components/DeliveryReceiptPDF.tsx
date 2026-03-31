import React, { forwardRef } from 'react';
import type { RepairJob, RepairBranch } from '../types';
import { REPAIR_STATUS_LABELS, REPAIR_WARRANTY_LABELS } from '../types';

interface DeliveryReceiptPDFProps {
  job: RepairJob;
  branch?: RepairBranch | null;
}

/** Rendered into a hidden div then captured with html2canvas → jsPDF */
export const DeliveryReceiptPDF = forwardRef<HTMLDivElement, DeliveryReceiptPDFProps>(
  ({ job, branch }, ref) => {
    const deliveryDate = job.deliveredAt
      ? new Date(job.deliveredAt).toLocaleDateString('ar-EG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    const createdDate = new Date(job.createdAt).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const warrantyLabel = REPAIR_WARRANTY_LABELS[job.warranty] ?? 'بدون ضمان';
    const isFree = job.paymentType === 'warranty_free' || job.finalCost === 0;

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: 'Cairo, Arial, sans-serif',
          width: '794px',
          minHeight: '600px',
          padding: '40px',
          background: '#fff',
          color: '#1a1a1a',
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8', margin: 0 }}>
            {branch?.name ?? 'مركز الصيانة'}
          </h1>
          {branch?.address && <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>{branch.address}</p>}
          {branch?.phone && <p style={{ color: '#6b7280', fontSize: '14px' }}>📞 {branch.phone}</p>}
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '12px', color: '#374151' }}>
            إيصال تسليم جهاز
          </h2>
        </div>

        {/* Receipt Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
          <div>
            <p style={{ fontWeight: 'bold', fontSize: '16px', color: '#1d4ed8' }}>رقم الإيصال: {job.receiptNo}</p>
            <p style={{ color: '#6b7280', fontSize: '13px' }}>تاريخ الاستلام: {createdDate}</p>
            <p style={{ color: '#6b7280', fontSize: '13px' }}>تاريخ التسليم: {deliveryDate}</p>
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontWeight: 'bold', fontSize: '14px' }}>حالة الجهاز</p>
            <span style={{
              background: '#dcfce7', color: '#166534',
              padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold',
            }}>
              {REPAIR_STATUS_LABELS[job.status]}
            </span>
          </div>
        </div>

        {/* Customer & Device Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontWeight: 'bold', fontSize: '15px', color: '#374151', marginBottom: '10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
              بيانات العميل
            </h3>
            <Row label="الاسم" value={job.customerName} />
            <Row label="الهاتف" value={job.customerPhone} />
            {job.customerAddress && <Row label="العنوان" value={job.customerAddress} />}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontWeight: 'bold', fontSize: '15px', color: '#374151', marginBottom: '10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
              بيانات الجهاز
            </h3>
            <Row label="النوع" value={job.deviceType} />
            <Row label="الماركة" value={job.deviceBrand} />
            <Row label="الموديل" value={job.deviceModel} />
            {job.deviceColor && <Row label="اللون" value={job.deviceColor} />}
          </div>
        </div>

        {/* Problem & Parts */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h3 style={{ fontWeight: 'bold', fontSize: '15px', color: '#374151', marginBottom: '8px' }}>
            العطل والإصلاح
          </h3>
          <p style={{ color: '#4b5563', fontSize: '14px', marginBottom: '8px' }}>
            <strong>وصف العطل:</strong> {job.problemDescription}
          </p>

          {job.partsUsed.length > 0 && (
            <>
              <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#374151', marginTop: '10px' }}>قطع الغيار المستخدمة:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: '6px', textAlign: 'right', border: '1px solid #e5e7eb' }}>القطعة</th>
                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>الكمية</th>
                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>السعر</th>
                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {job.partsUsed.map((p, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px', border: '1px solid #e5e7eb' }}>{p.partName}</td>
                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>{p.quantity}</td>
                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>{p.unitCost}</td>
                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #e5e7eb' }}>{p.quantity * p.unitCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Cost & Warranty */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', borderRadius: '8px', padding: '16px', marginBottom: '32px' }}>
          <div>
            <p style={{ fontWeight: 'bold', fontSize: '15px', color: '#1e40af' }}>
              🛡️ الضمان: {warrantyLabel}
            </p>
            {job.warranty !== 'none' && (
              <p style={{ color: '#3b82f6', fontSize: '13px' }}>يبدأ من تاريخ التسليم</p>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            {isFree ? (
              <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#16a34a' }}>مجاني (ضمان)</p>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>إجمالي التكلفة</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>
                  {(job.finalCost ?? 0).toLocaleString('ar-EG')} جنيه
                </p>
              </>
            )}
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '8px', color: '#6b7280', fontSize: '13px' }}>
              توقيع المركز
            </div>
          </div>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div style={{ borderTop: '1px solid #9ca3af', paddingTop: '8px', color: '#6b7280', fontSize: '13px' }}>
              توقيع العميل
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '11px', marginTop: '24px' }}>
          شكراً لثقتكم بنا • {branch?.name ?? 'مركز الصيانة'}
        </p>
      </div>
    );
  },
);

DeliveryReceiptPDF.displayName = 'DeliveryReceiptPDF';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '4px' }}>
    <strong>{label}:</strong> {value}
  </p>
);
