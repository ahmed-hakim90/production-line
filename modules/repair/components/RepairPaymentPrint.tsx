import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { getPrintThemePalette } from '../../../utils/printTheme';
import type { RepairBranch, RepairJob, RepairPayment, RepairPaymentAuthorization } from '../types';

const methodLabel = (method?: string) => method === 'card' ? 'بطاقة' : method === 'bank_transfer' ? 'تحويل بنكي' : 'نقدي';
const money = (value: unknown) => `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export const RepairPaymentPrint = React.forwardRef<HTMLDivElement, {
  authorization: RepairPaymentAuthorization | null;
  payment?: RepairPayment | null;
  job?: RepairJob | null;
  branch?: RepairBranch | null;
  printSettings?: PrintTemplateSettings;
}>(function RepairPaymentPrint({ authorization, payment, job, branch, printSettings }, ref) {
  if (!authorization) return <div ref={ref} />;
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const palette = getPrintThemePalette(ps);
  const isReceipt = Boolean(payment);
  const isUnpriced = Number(authorization.grossAmount || 0) <= 0;
  const cells: Array<[string, string]> = [
    ['إجمالي الخدمات', money(authorization.serviceGross)],
    ['إجمالي قطع الغيار', money(authorization.partsGross)],
    ['الإجمالي قبل الخصم', money(authorization.grossAmount)],
    ['الخصم المعتمد', money(authorization.discountAmount)],
    ['صافي المطلوب', money(authorization.netAmount)],
    ['إجمالي المدفوع', money(authorization.paidAmount)],
    ['الرصيد المتبقي', money(authorization.balanceDue)],
    ['حالة الإذن', isUnpriced ? 'غير صالح — بدون تسعير' : authorization.status === 'paid' ? 'مدفوع بالكامل' : authorization.status === 'partial' ? 'مدفوع جزئيًا' : authorization.status === 'pending_approval' ? 'بانتظار اعتماد' : 'معتمد'],
  ];
  return (
    <div ref={ref} dir="rtl" className="print-root arabic-export-root" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '12mm', boxSizing: 'border-box', background: '#fff', color: palette.text, fontFamily: "'Segoe UI','Tahoma','Arial',sans-serif" }}>
      <header style={{ border: `2px solid ${ps.primaryColor}`, borderRadius: '3mm', overflow: 'hidden', marginBottom: '7mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5mm 6mm', borderBottom: `3px solid ${ps.primaryColor}` }}>
          <div style={{ flex: 1 }}>
            {ps.logoUrl ? <img src={ps.logoUrl} alt="" style={{ maxHeight: '15mm', maxWidth: '42mm', objectFit: 'contain' }} /> : null}
            <p style={{ margin: '1mm 0 0', color: ps.primaryColor, fontWeight: 900, fontSize: '14pt' }}>{ps.headerText}</p>
          </div>
          <div style={{ flex: 1.2, textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '18pt' }}>{isReceipt ? 'إيصال تحصيل صيانة' : 'إذن دفع طلب صيانة'}</h1>
            <p style={{ margin: '1mm 0 0', color: palette.mutedText, fontSize: '9pt' }}>{branch?.name || 'مركز الصيانة'}</p>
          </div>
          <div style={{ flex: 1, textAlign: 'left', fontFamily: 'monospace', fontWeight: 900 }}>{payment?.paymentNo || authorization.authorizationNo}</div>
        </div>
      </header>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6mm' }}>
        <tbody>
          {[
            ['رقم طلب الصيانة', authorization.receiptNo],
            ['العميل', job?.customerName || '—'],
            ['الهاتف', job?.customerPhone || '—'],
            ['تاريخ المستند', new Date(payment?.createdAt || authorization.createdAt).toLocaleString('ar-EG')],
          ].map(([label, value]) => (
            <tr key={label}><td style={{ border: `1px solid ${palette.border}`, background: palette.tableRowAltBg, padding: '3mm', width: '25%', fontWeight: 800 }}>{label}</td><td style={{ border: `1px solid ${palette.border}`, padding: '3mm', fontWeight: 800 }}>{value}</td></tr>
          ))}
        </tbody>
      </table>
      {payment ? (
        <div style={{ padding: '5mm', border: `2px solid ${ps.primaryColor}`, borderRadius: '3mm', marginBottom: '7mm', textAlign: 'center' }}>
          <p style={{ margin: 0, color: palette.mutedText, fontWeight: 700 }}>تم استلام مبلغ</p>
          <p style={{ margin: '2mm 0', fontSize: '24pt', fontWeight: 900, color: ps.primaryColor }}>{money(payment.amount)}</p>
          <p style={{ margin: 0, fontWeight: 800 }}>وسيلة الدفع: {methodLabel(payment.method)}</p>
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${palette.border}`, marginBottom: '8mm' }}>
        {cells.map(([label, value], index) => (
          <div key={label} style={{ padding: '4mm', borderLeft: index % 4 < 3 ? `1px solid ${palette.border}` : undefined, borderBottom: index < 4 ? `1px solid ${palette.border}` : undefined, background: index % 2 ? '#fff' : palette.tableRowAltBg }}>
            <p style={{ margin: 0, fontSize: '8pt', color: palette.mutedText, fontWeight: 700 }}>{label}</p>
            <p style={{ margin: '1mm 0 0', fontSize: '11pt', fontWeight: 900 }}>{value}</p>
          </div>
        ))}
      </div>
      <p style={{ padding: '4mm', background: palette.tableRowAltBg, border: `1px solid ${palette.border}`, borderRadius: '2mm', fontSize: '9pt', lineHeight: 1.8 }}>
        هذا المستند مرتبط بطلب الصيانة المذكور، وأي خصم ظاهر به لا يصبح نافذًا إلا بعد اعتماد الإدارة. لا يُعد إذن الدفع إثباتًا للتحصيل إلا عند وجود رقم إيصال دفعة.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12mm', marginTop: '18mm' }}>
        {['توقيع العميل', 'موظف الاستقبال', 'الختم والاعتماد'].map((label) => <div key={label} style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '3mm', textAlign: 'center', fontWeight: 800 }}>{label}</div>)}
      </div>
      {ps.footerText ? <footer style={{ borderTop: `1px solid ${palette.border}`, marginTop: '18mm', paddingTop: '3mm', textAlign: 'center', color: palette.mutedText, fontSize: '8pt' }}>{ps.footerText}</footer> : null}
    </div>
  );
});
