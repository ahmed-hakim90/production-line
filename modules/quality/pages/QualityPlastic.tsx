import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { usePermission } from '@/utils/permissions';
import { QualityNameCatalog } from '../components/QualityNameCatalog';
import { DEFAULT_PLASTIC_REJECTION_REASONS, PLASTIC_DECISIONS, plasticRowsFromSheet, summarizePlastic, type PlasticDecision } from '../domain/incomingReceipt';
import { namedCatalogKey } from '../domain/namedCatalog';
import { monthBounds } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import type { QualityNamedReason, QualityPlasticReceipt } from '../model';
import { QmsPage } from '../qms/QmsChrome';
import { qualityPlasticItemService, qualityPlasticReasonService, qualityPlasticSupplierService } from '../services/qualityCatalogService';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPlasticService } from '../services/qualityIncomingService';

const empty = {
  supplier: '',
  productName: '',
  partName: '',
  quantity: 0,
  inspectedSamples: 0,
  rejectedSamples: 0,
  reasonIds: [] as string[],
  notes: '',
  finalDecision: 'مقبول' as PlasticDecision,
  acceptedPercentage: '',
};

export const QualityPlastic: React.FC = () => {
  const { can } = usePermission();
  const today = localDateIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<QualityPlasticReceipt[]>([]);
  const [editingId, setEditingId] = useState('');
  const [suppliers, setSuppliers] = useState<QualityNamedReason[]>([]);
  const [items, setItems] = useState<QualityNamedReason[]>([]);
  const [reasons, setReasons] = useState<QualityNamedReason[]>([]);
  const [form, setForm] = useState({ ...empty, receivedDate: today });
  const [saving, setSaving] = useState(false);
  const canManage = can('quality.incoming.manage');
  const canDelete = can('quality.records.delete');
  const activeItems = items.filter((item) => item.isActive !== false);
  const activeReasons = reasons.filter((reason) => reason.isActive !== false);

  const load = async () => {
    const range = monthBounds(month);
    const [receipts, supplierRows, itemRows, reasonRows] = await Promise.all([
      qualityPlasticService.listRange(range.from, range.to),
      qualityPlasticSupplierService.list(),
      qualityPlasticItemService.list(),
      qualityPlasticReasonService.list(),
    ]);
    setRows(receipts);
    setSuppliers(supplierRows);
    setItems(itemRows);
    setReasons(reasonRows);
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [month]);
  const summary = summarizePlastic(rows.map((row) => ({
    supplier: row.supplier,
    receivedDate: row.receivedDate,
    productName: row.productName,
    partName: row.partName,
    quantity: row.quantity,
    inspectedSamples: row.inspectedSamples,
    rejectedSamples: row.rejectedSamples,
    reasonIds: row.reasonIds,
    notes: row.notes,
    finalDecision: row.finalDecision,
    acceptedPercentage: row.acceptedPercentage,
  })));

  return (
    <QmsPage title="وارد البلاستيك" subtitle="الصنف يجب أن يكون من القائمة النشطة. إذا وُجدت عينات مرفوضة يلزم سبب رفض. نسبة القبول تُطلب فقط عند القرار مقبول بنسبة. إيقاف صنف أو سبب يبقي السجلات القديمة.">
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <label><span className="qms-label">الشهر</span><input className="qms-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label>
          <span className="qms-label">استيراد إكسل</span>
          <input className="qms-input" type="file" accept=".xlsx,.xls" disabled={!canManage} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > 5_000_000) { toast.error('حجم الملف أكبر من 5 ميغابايت'); return; }
            void file.arrayBuffer().then(async (buffer) => {
              const book = XLSX.read(buffer, { type: 'array', cellDates: false });
              const sheet = book.Sheets[book.SheetNames[0]];
              const parsed = plasticRowsFromSheet(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }), { items, reasons });
              const count = await qualityPlasticService.importRows(parsed);
              toast.success(`تم استيراد ${count} سجلاً`);
              await load();
            }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الاستيراد')));
          }} />
        </label>
        <button
          type="button"
          className="qms-btn qms-btn-ghost"
          disabled={!canManage}
          onClick={() => {
            const existing = new Set(reasons.map((reason) => reason.nameKey));
            const missing = DEFAULT_PLASTIC_REJECTION_REASONS.filter((name) => !existing.has(namedCatalogKey(name)));
            if (missing.length === 0) { toast.success('أسباب الرفض الافتراضية موجودة'); return; }
            void (async () => {
              for (const name of missing) await qualityPlasticReasonService.create(name);
              toast.success('تمت إضافة أسباب الرفض الافتراضية');
              await load();
            })().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر إضافة الأسباب')));
          }}
        >تحميل الأسباب الافتراضية</button>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">تاريخ الاستلام</span><input className="qms-input" type="date" value={form.receivedDate} onChange={(event) => setForm({ ...form, receivedDate: event.target.value })} /></label>
          <label><span className="qms-label">المورد</span>
            <select className="qms-input" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>
              <option value="">اختر المورد</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
            </select>
          </label>
          <label>
            <span className="qms-label">الصنف</span>
            <select className="qms-input" value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })}>
              <option value="">اختر صنفاً نشطاً</option>
              {activeItems.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label><span className="qms-label">اسم الجزء</span><input className="qms-input" maxLength={150} value={form.partName} onChange={(event) => setForm({ ...form, partName: event.target.value })} /></label>
          <label><span className="qms-label">الكمية</span><input className="qms-input" type="number" min={0} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label>
          <label><span className="qms-label">عينات مفحوصة</span><input className="qms-input" type="number" min={0} value={form.inspectedSamples} onChange={(event) => setForm({ ...form, inspectedSamples: Number(event.target.value) })} /></label>
          <label><span className="qms-label">عينات مرفوضة</span><input className="qms-input" type="number" min={0} value={form.rejectedSamples} onChange={(event) => setForm({ ...form, rejectedSamples: Number(event.target.value) })} /></label>
          <label>
            <span className="qms-label">القرار</span>
            <select className="qms-input" value={form.finalDecision} onChange={(event) => setForm({ ...form, finalDecision: event.target.value as PlasticDecision })}>
              {PLASTIC_DECISIONS.map((decision) => <option key={decision} value={decision}>{decision}</option>)}
            </select>
          </label>
          {form.finalDecision === 'مقبول بنسبة' ? (
            <label><span className="qms-label">نسبة القبول</span><input className="qms-input" type="number" min={0} max={100} value={form.acceptedPercentage} onChange={(event) => setForm({ ...form, acceptedPercentage: event.target.value })} /></label>
          ) : null}
          <label><span className="qms-label">ملاحظات</span><input className="qms-input" maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        <div className="qms-row" style={{ marginTop: 8 }}>
          {activeReasons.map((reason) => (
            <label key={reason.id}>
              <input
                type="checkbox"
                checked={form.reasonIds.includes(reason.id)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  reasonIds: event.target.checked ? [...current.reasonIds, reason.id] : current.reasonIds.filter((id) => id !== reason.id),
                }))}
              /> {reason.name}
            </label>
          ))}
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !canManage} onClick={() => {
            setSaving(true);
            void qualityPlasticService.save({
              ...form,
              id: editingId || undefined,
              acceptedPercentage: form.finalDecision === 'مقبول بنسبة' ? Number(form.acceptedPercentage) : null,
            }).then(async () => {
              toast.success('تم حفظ وارد البلاستيك');
              setEditingId('');
              setForm({ ...empty, receivedDate: localDateIso() });
              await load();
            }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))
              .finally(() => setSaving(false));
          }}>{editingId ? 'حفظ التعديل' : 'حفظ'}</button>
        </div>
      </section>
      <div className="qms-kpis" style={{ marginBottom: 12 }}>
        <div className="qms-card qms-kpi"><span>السجلات</span><strong>{summary.records}</strong></div>
        <div className="qms-card qms-kpi"><span>الكمية</span><strong>{summary.quantity}</strong></div>
        <div className="qms-card qms-kpi"><span>المفحوص</span><strong>{summary.inspected}</strong></div>
        <div className="qms-card qms-kpi"><span>المرفوض</span><strong>{summary.rejected}</strong></div>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-label">التحليل حسب المورد</h2>
        {summary.suppliers.length === 0 ? <p>لا يوجد وارد بلاستيك في هذا الشهر.</p> : (
          <table className="qms-table">
            <thead><tr><th>المورد</th><th>السجلات</th><th>الكمية</th><th>المفحوص</th><th>المرفوض</th></tr></thead>
            <tbody>{summary.suppliers.map((row) => <tr key={row.supplier}><td>{row.supplier}</td><td>{row.records}</td><td>{row.quantity}</td><td>{row.inspected}</td><td>{row.rejected}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-label">تكرار أسباب الرفض</h2>
        {summary.reasons.length === 0 ? <p>لا توجد أسباب رفض في هذا الشهر.</p> : (
          <table className="qms-table">
            <thead><tr><th>السبب</th><th>عدد السجلات</th></tr></thead>
            <tbody>
              {summary.reasons.map((row) => (
                <tr key={row.reasonId}><td>{reasons.find((reason) => reason.id === row.reasonId)?.name || row.reasonId}</td><td>{row.count}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>التاريخ</th><th>المورد</th><th>الصنف</th><th>الكمية</th><th>المفحوص</th><th>المرفوض</th><th>القرار</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.receivedDate}</td><td>{row.supplier}</td><td>{row.productName}</td><td>{row.quantity}</td><td>{row.inspectedSamples}</td><td>{row.rejectedSamples}</td><td>{row.finalDecision}{row.acceptedPercentage != null ? ` ${row.acceptedPercentage}٪` : ''}</td>
                <td>
                  {canManage ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { setEditingId(row.id); setForm({ supplier: row.supplier, receivedDate: row.receivedDate, productName: row.productName, partName: row.partName, quantity: row.quantity, inspectedSamples: row.inspectedSamples, rejectedSamples: row.rejectedSamples, reasonIds: row.reasonIds, notes: row.notes, finalDecision: row.finalDecision, acceptedPercentage: row.acceptedPercentage == null ? '' : String(row.acceptedPercentage) }); }}>تعديل</button> : null}
                  {canDelete ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { void qualityPlasticService.remove(row.id).then(async () => { toast.success('تم حذف سجل البلاستيك'); await load(); }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحذف'))); }}>حذف</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا يوجد وارد بلاستيك في هذا الشهر.</p> : null}
      </section>
      <QualityNameCatalog title="موردو البلاستيك" placeholder="اسم المورد" emptyLabel="لا يوجد موردون محفوظون بعد." maxLength={150} names={suppliers} canManage={canManage} onCreate={(name) => qualityPlasticSupplierService.create(name).then(load)} onRename={(id, name) => qualityPlasticSupplierService.rename(id, name).then(load)} onRemove={(id) => qualityPlasticSupplierService.remove(id).then(load)} />
      <QualityNameCatalog title="أصناف البلاستيك" placeholder="اسم الصنف" emptyLabel="لا توجد أصناف محفوظة بعد." maxLength={150} names={items} canManage={canManage} onCreate={(name) => qualityPlasticItemService.create(name).then(load)} onRename={(id, name) => qualityPlasticItemService.rename(id, name).then(load)} onRemove={(id) => qualityPlasticItemService.remove(id).then(load)} onSetActive={(id, isActive) => qualityPlasticItemService.setActive(id, isActive).then(load)} />
      <QualityNameCatalog title="أسباب رفض البلاستيك" placeholder="سبب الرفض" maxLength={250} names={reasons} canManage={canManage} onCreate={(name) => qualityPlasticReasonService.create(name).then(load)} onRename={(id, name) => qualityPlasticReasonService.rename(id, name).then(load)} onRemove={(id) => qualityPlasticReasonService.remove(id).then(load)} onSetActive={(id, isActive) => qualityPlasticReasonService.setActive(id, isActive).then(load)} />
    </QmsPage>
  );
};
