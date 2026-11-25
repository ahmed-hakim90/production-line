import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { usePermission } from '@/utils/permissions';
import { QualityNameCatalog } from '../components/QualityNameCatalog';
import { cartonRowsFromSheet, summarizeCartons } from '../domain/incomingReceipt';
import { monthBounds } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import type { QualityCartonReceipt, QualityNamedReason } from '../model';
import { QmsPage } from '../qms/QmsChrome';
import { qualityCartonSupplierService } from '../services/qualityCatalogService';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityCartonService } from '../services/qualityIncomingService';

const empty = {
  supplier: '',
  shipmentNumber: '',
  totalQuantity: 0,
  deliveryNoteNumber: '',
  totalItems: 0,
  acceptedItems: 0,
  rejectedItems: 0,
  rejectedItemCode: '',
  notes: '',
};

export const QualityCartons: React.FC = () => {
  const { can } = usePermission();
  const today = localDateIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [supplierFilter, setSupplierFilter] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<QualityCartonReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<QualityNamedReason[]>([]);
  const [form, setForm] = useState({ ...empty, receivedDate: today });
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const canManage = can('quality.incoming.manage');
  const canDelete = can('quality.records.delete');

  const load = async () => {
    const range = monthBounds(month);
    const [receipts, names] = await Promise.all([
      qualityCartonService.listRange(range.from, range.to),
      qualityCartonSupplierService.list(),
    ]);
    setRows(receipts);
    setSuppliers(names);
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [month]);

  const setField = (field: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  const visible = rows.filter((row) => {
    if (supplierFilter && row.supplier !== supplierFilter) return false;
    const text = query.trim();
    if (!text) return true;
    return `${row.supplier} ${row.shipmentNumber} ${row.deliveryNoteNumber} ${row.rejectedItemCode} ${row.notes}`.includes(text);
  });
  const summary = summarizeCartons(visible);

  return (
    <QmsPage title="وارد الكراتين" subtitle="إذن التسليم لا يتكرر لنفس المورد والتاريخ. أول استلام لشحنة في اليوم يُحسب شحنة واحدة، والتكرار داخل نفس الشحنة لا يُضاعف العدد.">
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <label><span className="qms-label">الشهر</span><input className="qms-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label><span className="qms-label">بحث</span><input className="qms-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="شحنة أو إذن أو كود أو ملاحظة" /></label>
        <label><span className="qms-label">الشركة</span>
          <select className="qms-input" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">كل الشركات</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
          </select>
        </label>
        <label>
          <span className="qms-label">استيراد إكسل</span>
          <input
            className="qms-input"
            type="file"
            accept=".xlsx,.xls"
            disabled={!canManage}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > 5_000_000) { toast.error('حجم الملف أكبر من 5 ميغابايت'); return; }
              void file.arrayBuffer().then(async (buffer) => {
                const book = XLSX.read(buffer, { type: 'array', cellDates: false });
                const sheet = book.Sheets[book.SheetNames[0]];
                const parsed = cartonRowsFromSheet(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }));
                const count = await qualityCartonService.importRows(parsed);
                toast.success(`تم استيراد ${count} سجلاً`);
                await load();
              }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الاستيراد')));
            }}
          />
        </label>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">المورد</span>
            <select className="qms-input" value={form.supplier} onChange={(event) => setField('supplier', event.target.value)}>
              <option value="">اختر الشركة</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
            </select>
          </label>
          <label><span className="qms-label">تاريخ الاستلام</span><input className="qms-input" type="date" value={form.receivedDate} onChange={(event) => setField('receivedDate', event.target.value)} /></label>
          <label><span className="qms-label">رقم الشحنة</span><input className="qms-input" maxLength={80} value={form.shipmentNumber} onChange={(event) => setField('shipmentNumber', event.target.value)} /></label>
          <label><span className="qms-label">إجمالي الكمية</span><input className="qms-input" type="number" min={0} value={form.totalQuantity} onChange={(event) => setField('totalQuantity', Number(event.target.value))} /></label>
          <label><span className="qms-label">رقم إذن التسليم</span><input className="qms-input" maxLength={80} value={form.deliveryNoteNumber} onChange={(event) => setField('deliveryNoteNumber', event.target.value)} /></label>
          <label><span className="qms-label">إجمالي الأصناف</span><input className="qms-input" type="number" min={0} value={form.totalItems} onChange={(event) => setField('totalItems', Number(event.target.value))} /></label>
          <label><span className="qms-label">المقبول</span><input className="qms-input" type="number" min={0} value={form.acceptedItems} onChange={(event) => setField('acceptedItems', Number(event.target.value))} /></label>
          <label><span className="qms-label">المرفوض</span><input className="qms-input" type="number" min={0} value={form.rejectedItems} onChange={(event) => setField('rejectedItems', Number(event.target.value))} /></label>
          <label><span className="qms-label">كود الصنف المرفوض</span><input className="qms-input" maxLength={80} value={form.rejectedItemCode} onChange={(event) => setField('rejectedItemCode', event.target.value)} /></label>
          <label><span className="qms-label">ملاحظات</span><input className="qms-input" maxLength={1000} value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !canManage} onClick={() => {
            setSaving(true);
            void qualityCartonService.save({ ...form, id: editingId || undefined })
              .then(async () => { toast.success('تم حفظ وارد الكراتين'); setForm({ ...empty, receivedDate: localDateIso() }); setEditingId(''); await load(); })
              .catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))
              .finally(() => setSaving(false));
          }}>{editingId ? 'حفظ التعديل' : 'حفظ'}</button>
          {editingId ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { setEditingId(''); setForm({ ...empty, receivedDate: localDateIso() }); }}>إلغاء التعديل</button> : null}
        </div>
      </section>
      <div className="qms-kpis" style={{ marginBottom: 12 }}>
        <div className="qms-card qms-kpi"><span>السجلات</span><strong>{summary.records}</strong></div>
        <div className="qms-card qms-kpi"><span>الشحنات</span><strong>{summary.shipments}</strong></div>
        <div className="qms-card qms-kpi"><span>الكمية</span><strong>{summary.quantity}</strong></div>
        <div className="qms-card qms-kpi"><span>المقبول</span><strong>{summary.accepted}</strong></div>
        <div className="qms-card qms-kpi"><span>المرفوض</span><strong>{summary.rejected}</strong></div>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-label">تحليل الاستلام حسب الشركة</h2>
        {summary.suppliers.length === 0 ? <p>لا يوجد وارد في هذا الشهر.</p> : (
          <table className="qms-table">
            <thead><tr><th>الشركة</th><th>السجلات</th><th>الشحنات</th><th>الكمية</th><th>المقبول</th><th>المرفوض</th></tr></thead>
            <tbody>{summary.suppliers.map((row) => <tr key={row.supplier}><td>{row.supplier}</td><td>{row.records}</td><td>{row.shipments}</td><td>{row.quantity}</td><td>{row.accepted}</td><td>{row.rejected}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>التاريخ</th><th>المورد</th><th>الشحنة</th><th>عدد الشحنات</th><th>الكمية</th><th>الإذن</th><th>المقبول</th><th>المرفوض</th><th></th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>{row.receivedDate}</td><td>{row.supplier}</td><td>{row.shipmentNumber || '—'}</td><td>{row.shipmentCount}</td><td>{row.totalQuantity}</td><td>{row.deliveryNoteNumber || '—'}</td><td>{row.acceptedItems}</td><td>{row.rejectedItems}</td>
                <td>
                  {canManage ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { setEditingId(row.id); setForm({ supplier: row.supplier, receivedDate: row.receivedDate, shipmentNumber: row.shipmentNumber, totalQuantity: row.totalQuantity, deliveryNoteNumber: row.deliveryNoteNumber, totalItems: row.totalItems, acceptedItems: row.acceptedItems, rejectedItems: row.rejectedItems, rejectedItemCode: row.rejectedItemCode, notes: row.notes }); }}>تعديل</button> : null}
                  {canDelete ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { void qualityCartonService.remove(row.id).then(async () => { toast.success('تم حذف إذن الكراتين'); await load(); }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحذف'))); }}>حذف</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? <p>لا يوجد وارد كراتين في هذا النطاق.</p> : null}
      </section>
      <QualityNameCatalog
        title="موردو الكراتين"
        placeholder="اسم المورد"
        emptyLabel="لا يوجد موردون محفوظون بعد."
        maxLength={150}
        names={suppliers}
        canManage={canManage}
        onCreate={(name) => qualityCartonSupplierService.create(name).then(load)}
        onRename={(id, name) => qualityCartonSupplierService.rename(id, name).then(load)}
        onRemove={(id) => qualityCartonSupplierService.remove(id).then(load)}
      />
    </QmsPage>
  );
};
