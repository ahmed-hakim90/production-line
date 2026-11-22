import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { usePermission } from '@/utils/permissions';
import { QualitySecondSortReturnPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant, secondSortPageStyle } from '../print/qualityPrintModel';
import { activeTenantId, qualityUserMessage } from '../services/qualityGateway';
import { localDateIso } from '../domain/time';
import type { QualitySector } from '../domain/sector';
import type { QualitySecondSortReturn as SecondSortReturnReport } from '../model';
import { qualitySecondSortReturnService } from '../services/qualityCatalogService';
import { MasterSelect, QmsPage, SectorSwitch, useQualityMasters } from '../qms/QmsChrome';

const defaultSignatures = () => [
  { title: 'توقيع مشرف الفرز الأول', name: '' },
  { title: 'توقيع مشرف الفرز الثاني', name: '' },
];

export const QualitySecondSortReturn: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintSheet = qualityRecordPrintAllowed(permissions, 'quality.secondSort.view');
  const masters = useQualityMasters();
  const [date, setDate] = useState(localDateIso());
  const [sector, setSector] = useState<QualitySector | ''>('');
  const [rows, setRows] = useState<SecondSortReturnReport[]>([]);
  const [editingId, setEditingId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [signatures, setSignatures] = useState(defaultSignatures);
  const [saving, setSaving] = useState(false);

  const load = async (reportDate = date) => setRows(await qualitySecondSortReturnService.list(reportDate));

  useEffect(() => {
    void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل الإرجاعات')));
  }, [date]);

  const reset = () => {
    setEditingId('');
    setProductId('');
    setQuantity(0);
    setNotes('');
    setSignatures(defaultSignatures());
  };

  const edit = (row: SecondSortReturnReport) => {
    setEditingId(row.id);
    setDate(row.reportDate);
    setSector(row.sector);
    setProductId(row.productId);
    setQuantity(row.quantity);
    setNotes(row.notes || '');
    setSignatures(row.signatures?.length ? row.signatures : defaultSignatures());
  };

  const save = async () => {
    const product = masters.products.find((item) => item.id === productId);
    if (!product || !sector) {
      toast.error('اختر المنتج وقطاع الجودة');
      return;
    }
    setSaving(true);
    try {
      await qualitySecondSortReturnService.save({
        id: editingId || undefined,
        reportDate: date,
        productId: product.id || '',
        productName: product.name,
        productCode: product.code || '',
        sector,
        quantity,
        notes,
        signatures,
      });
      toast.success('تم حفظ إرجاع الفرز');
      reset();
      await load();
    } catch (error: unknown) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const printRow = (row: SecondSortReturnReport) => {
    const [scoped] = rowsMatchingTenant([row], activeTenantId());
    if (!scoped || !canPrintSheet) return;
    printDocument({
      documentTitle: `إرجاع-فرز-${scoped.productCode || scoped.productName}`,
      printSettings: printTemplate,
      pageStyle: secondSortPageStyle(printTemplate),
      render: (ref) => <QualitySecondSortReturnPrint ref={ref} row={scoped} printSettings={printTemplate} />,
    });
  };

  return (
    <QmsPage title="إرجاع فرز ثاني لفرز أول" subtitle="تقرير مستقل يسجل التاريخ والمنتج والكمية والملاحظات والتوقيعات، ويُطبع على A5 أفقي." actions={<SectorSwitch value={sector || 'all'} onChange={(value) => setSector(value === 'all' ? '' : value)} />}>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">التاريخ</span><input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="اختر المنتج" options={masters.products.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <label><span className="qms-label">الكمية</span><input className="qms-input" type="number" min={0} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        </div>
        <label><span className="qms-label">الملاحظات</span><textarea className="qms-input" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="qms-grid" style={{ marginTop: 8 }}>
          {signatures.map((signature, index) => (
            <div className="qms-row" key={`${signature.title}-${index}`}>
              <label><span className="qms-label">عنوان التوقيع</span><input className="qms-input" maxLength={80} value={signature.title} onChange={(event) => setSignatures((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /></label>
              <label><span className="qms-label">الاسم</span><input className="qms-input" maxLength={80} value={signature.name} onChange={(event) => setSignatures((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
            </div>
          ))}
          <button type="button" className="qms-btn qms-btn-ghost" disabled={signatures.length >= 8} onClick={() => setSignatures((current) => [...current, { title: 'توقيع', name: '' }])}>إضافة توقيع</button>
        </div>
        <div className="qms-row" style={{ marginTop: 8 }}>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.secondSort.manage')} onClick={() => void save()}>{editingId ? 'تحديث الإرجاع' : 'حفظ الإرجاع'}</button>
          {editingId ? <button type="button" className="qms-btn qms-btn-ghost" onClick={reset}>تقرير جديد</button> : null}
        </div>
      </section>
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>المنتج</th><th>الكمية</th><th>الملاحظات</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.productCode ? `${row.productName} (${row.productCode})` : row.productName}</td>
                <td>{row.quantity}</td>
                <td>{row.notes || '—'}</td>
                <td>
                  <button type="button" className="qms-btn qms-btn-ghost" onClick={() => edit(row)}>تعديل</button>
                  {canPrintSheet ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => printRow(row)}>طباعة</button> : null}
                  {can('quality.records.delete') ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void qualitySecondSortReturnService.remove(row.id).then(() => load()).then(() => toast.success('تم الحذف')).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحذف')))}>حذف</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا توجد تقارير إرجاع في هذا التاريخ.</p> : null}
      </section>
    </QmsPage>
  );
};
