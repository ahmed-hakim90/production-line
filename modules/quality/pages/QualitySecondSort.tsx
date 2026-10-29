import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { usePermission } from '@/utils/permissions';
import { QualitySecondSortPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant, secondSortPageStyle } from '../print/qualityPrintModel';
import { activeTenantId } from '../services/qualityGateway';
import { localDateIso } from '../domain/time';
import type { QualitySector } from '../domain/sector';
import type { QualityPhotoRef, QualitySecondSortReport } from '../model';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySecondSortService } from '../services/qualitySecondSortService';
import { MasterSelect, QmsPage, SectorSwitch, useQualityMasters } from '../qms/QmsChrome';

const defaultSignatures = () => [
  { title: 'توقيع مشرف الهوالك', name: '' },
  { title: 'توقيع مشرف الفرز الثاني والهالك', name: '' },
];

export const QualitySecondSort: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintSheet = qualityRecordPrintAllowed(permissions, 'quality.secondSort.view');
  const canPrintPhotos = can('quality.photos.view');
  const masters = useQualityMasters();
  const [date, setDate] = useState(localDateIso());
  const [sector, setSector] = useState<QualitySector | ''>('');
  const [rows, setRows] = useState<QualitySecondSortReport[]>([]);
  const [editingId, setEditingId] = useState('');
  const [productId, setProductId] = useState('');
  const [problem, setProblem] = useState('');
  const [discount, setDiscount] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [approval, setApproval] = useState('');
  const [fontScale, setFontScale] = useState(100);
  const [signatures, setSignatures] = useState(defaultSignatures);
  const [photos, setPhotos] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<QualityPhotoRef[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async (reportDate = date) => setRows(await qualitySecondSortService.list(reportDate));

  useEffect(() => {
    void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل التسليمات')));
  }, [date]);

  const reset = () => {
    setEditingId('');
    setProductId('');
    setProblem('');
    setDiscount(0);
    setQuantity(0);
    setApproval('');
    setFontScale(100);
    setSignatures(defaultSignatures());
    setPhotos([]);
    setExistingPhotos([]);
  };

  const edit = (row: QualitySecondSortReport) => {
    setEditingId(row.id);
    setDate(row.reportDate);
    setSector(row.sector);
    setProductId(row.productId);
    setProblem(row.problem);
    setDiscount(row.discountPercent);
    setQuantity(row.quantity);
    setApproval(row.approval || '');
    setFontScale(row.fontScale || 100);
    setSignatures(row.signatures?.length ? row.signatures : defaultSignatures());
    setExistingPhotos(row.photos || []);
    setPhotos([]);
  };

  const save = async () => {
    const product = masters.products.find((item) => item.id === productId);
    if (!product || !sector) {
      toast.error('اختر المنتج وقطاع الجودة');
      return;
    }
    if (existingPhotos.length + photos.length > 5) {
      toast.error('يمكن إرفاق 5 صور كحد أقصى');
      return;
    }
    setSaving(true);
    try {
      await qualitySecondSortService.save({
        id: editingId || undefined,
        reportDate: date,
        productId: product.id || '',
        productName: product.name,
        productCode: product.code || '',
        problem,
        discountPercent: discount,
        quantity,
        approval,
        fontScale,
        sector,
        signatures,
        photos,
        existingPhotos,
      });
      toast.success('تم حفظ تسليم الفرز الثاني');
      reset();
      await load();
    } catch (error: unknown) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const printRow = (row: QualitySecondSortReport) => {
    const [scoped] = rowsMatchingTenant([row], activeTenantId());
    if (!scoped || !canPrintSheet) return;
    printDocument({
      documentTitle: `فرز-ثاني-${scoped.productCode || scoped.productName}`,
      printSettings: printTemplate,
      pageStyle: secondSortPageStyle(printTemplate),
      render: (ref) => (
        <QualitySecondSortPrint
          ref={ref}
          row={scoped}
          includePhotos={canPrintPhotos}
          printSettings={printTemplate}
        />
      ),
    });
  };

  return (
    <QmsPage title="تسليم الفرز الثاني" subtitle="ورقة تسليم A5 أفقي (210×148 مم) مع الصور ونسبة الخصم والتوقيعات. الصور تُحفظ في التخزين وليس داخل المستند." actions={<SectorSwitch value={sector || 'all'} onChange={(value) => setSector(value === 'all' ? '' : value)} />}>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">التاريخ</span><input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MasterSelect label="الموديل" value={productId} onChange={setProductId} placeholder="اختر المنتج" options={masters.products.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <label><span className="qms-label">الكمية</span><input className="qms-input" type="number" min={0} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <label><span className="qms-label">نسبة الخصم</span><input className="qms-input" type="number" min={0} max={100} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label>
          <label><span className="qms-label">حجم الخط {fontScale}٪</span><input className="qms-input" type="range" min={80} max={150} step={10} value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} /></label>
        </div>
        <label><span className="qms-label">المشكلة</span><textarea className="qms-input" value={problem} onChange={(event) => setProblem(event.target.value)} /></label>
        <label><span className="qms-label">الاعتماد</span><input className="qms-input" value={approval} onChange={(event) => setApproval(event.target.value)} /></label>
        <div className="qms-grid" style={{ marginTop: 8 }}>
          {signatures.map((signature, index) => (
            <div className="qms-row" key={`${signature.title}-${index}`}>
              <label><span className="qms-label">عنوان التوقيع</span><input className="qms-input" value={signature.title} onChange={(event) => setSignatures((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /></label>
              <label><span className="qms-label">الاسم</span><input className="qms-input" value={signature.name} onChange={(event) => setSignatures((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
              <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setSignatures((current) => current.filter((_, itemIndex) => itemIndex !== index))}>حذف التوقيع</button>
            </div>
          ))}
          <button type="button" className="qms-btn qms-btn-ghost" disabled={signatures.length >= 8} onClick={() => setSignatures((current) => [...current, { title: 'توقيع', name: '' }])}>إضافة توقيع</button>
        </div>
        <label><span className="qms-label">الصور</span><input className="qms-input" type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 5))} /></label>
        <div className="qms-row">
          {existingPhotos.map((photo) => (
            <button key={photo.storagePath} type="button" className="qms-btn qms-btn-ghost" onClick={() => setExistingPhotos((current) => current.filter((item) => item.storagePath !== photo.storagePath))}>إزالة صورة محفوظة</button>
          ))}
        </div>
        <div className="qms-row" style={{ marginTop: 8 }}>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.secondSort.manage')} onClick={() => void save()}>{editingId ? 'تحديث التسليم' : 'حفظ التسليم'}</button>
          {editingId ? <button type="button" className="qms-btn qms-btn-ghost" onClick={reset}>تسليم جديد</button> : null}
        </div>
      </section>
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>الموديل</th><th>المشكلة</th><th>الكمية</th><th>الخصم</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.productCode ? `${row.productName} (${row.productCode})` : row.productName}</td>
                <td>{row.problem}</td>
                <td>{row.quantity}</td>
                <td>{row.discountPercent}٪</td>
                <td>
                  <button type="button" className="qms-btn qms-btn-ghost" onClick={() => edit(row)}>تعديل</button>
                  {canPrintSheet ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => printRow(row)}>طباعة</button> : null}
                  {can('quality.records.delete') ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void qualitySecondSortService.remove(row.id).then(() => load()).then(() => toast.success('تم الحذف')).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحذف')))}>حذف</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا توجد تسليمات في هذا التاريخ.</p> : null}
      </section>
    </QmsPage>
  );
};
