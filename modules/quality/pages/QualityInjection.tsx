import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { usePermission } from '@/utils/permissions';
import { monthBounds } from '../domain/qualityAnalytics';
import { injectionRowsFromSheet, type InjectionQualityInput } from '../domain/incomingReceipt';
import { localDateIso } from '../domain/time';
import type { QualityInjectionMachine, QualityInjectionRecord, QualityShiftOption } from '../model';
import { QmsPage } from '../qms/QmsChrome';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityInjectionService } from '../services/qualityIncomingService';
import { qualitySettingsService } from '../services/qualitySettingsService';

const emptyRecord = {
  machineNumber: '',
  itemName: '',
  shift: '',
  totalQuantity: 0,
  acceptedQuantity: 0,
  rejectedQuantity: 0,
  notes: '',
};

export const QualityInjection: React.FC = () => {
  const { can } = usePermission();
  const today = localDateIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<QualityInjectionRecord[]>([]);
  const [machines, setMachines] = useState<QualityInjectionMachine[]>([]);
  const [shifts, setShifts] = useState<QualityShiftOption[]>([]);
  const [form, setForm] = useState<InjectionQualityInput>({ ...emptyRecord, date: today });
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsReady, setOptionsReady] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [machineDraft, setMachineDraft] = useState('');
  const [machineSaving, setMachineSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const canManage = can('quality.incoming.manage');
  const quantityMismatch = form.totalQuantity !== form.acceptedQuantity + form.rejectedQuantity;
  const activeMachines = machines.filter((machine) => machine.isActive !== false);
  const editingRow = editingId ? rows.find((row) => row.id === editingId) : undefined;
  const selectedInactiveMachine = editingRow?.machineNumber === form.machineNumber
    && !activeMachines.some((machine) => machine.name === form.machineNumber);
  const selectedInactiveShift = editingRow?.shift === form.shift
    && !shifts.some((shift) => shift.name === form.shift);
  const machineValid = activeMachines.some((machine) => machine.name === form.machineNumber) || selectedInactiveMachine;
  const shiftValid = shifts.some((shift) => shift.name === form.shift) || selectedInactiveShift;

  const load = async () => {
    setLoadError('');
    setLoading(true);
    try {
      const range = monthBounds(month);
      setRows(await qualityInjectionService.listRange(range.from, range.to));
    } catch (error) {
      setLoadError(qualityUserMessage(error, 'تعذر تحميل سجلات متابعة جودة قسم الحقن.'));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل سجلات الحقن.')));
  }, [month]);

  const loadOptions = async () => {
    setOptionsLoading(true);
    setOptionsReady(false);
    setOptionsError('');
    try {
      const [nextMachines, nextShifts] = await Promise.all([
        qualityInjectionService.listMachines(true),
        qualitySettingsService.listShifts(),
      ]);
      setMachines(nextMachines);
      setShifts(nextShifts);
      setOptionsReady(true);
    } catch (error) {
      setOptionsError(qualityUserMessage(error, 'تعذر تحميل قوائم الماكينات والورديات.'));
      throw error;
    } finally {
      setOptionsLoading(false);
    }
  };

  useEffect(() => {
    void loadOptions().catch(() => undefined);
  }, []);

  const visibleRows = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return rows
      .filter((row) => !text || `${row.machineNumber} ${row.itemName} ${row.shift} ${row.notes}`.toLocaleLowerCase().includes(text))
      .sort((left, right) => right.date.localeCompare(left.date) || left.machineNumber.localeCompare(right.machineNumber, 'ar', { numeric: true }));
  }, [rows, query]);
  const summary = visibleRows.reduce((totals, row) => ({
    records: totals.records + 1,
    total: totals.total + row.totalQuantity,
    accepted: totals.accepted + row.acceptedQuantity,
    rejected: totals.rejected + row.rejectedQuantity,
  }), { records: 0, total: 0, accepted: 0, rejected: 0 });

  const resetForm = () => {
    setEditingId('');
    setForm({ ...emptyRecord, date: today });
  };

  const save = async () => {
    setSaving(true);
    try {
      await qualityInjectionService.save({ ...form, id: editingId || undefined });
      toast.success(editingId ? 'تم حفظ تعديل سجل الحقن.' : 'تم تسجيل متابعة جودة الحقن.');
      resetForm();
      try {
        await load();
      } catch {
        toast.error('تم حفظ السجل، لكن تعذر تحديث القائمة. حدّث الصفحة للتحقق من ظهوره.');
      }
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ سجل الحقن.'));
    } finally {
      setSaving(false);
    }
  };

  const saveMachineNumber = async () => {
    setMachineSaving(true);
    try {
      await qualityInjectionService.saveMachineNumber(machineDraft);
      const savedMachine = machineDraft.trim().replace(/\s+/g, ' ');
      setMachineDraft('');
      setForm((current) => ({ ...current, machineNumber: savedMachine }));
      toast.success('تمت إضافة رقم الماكينة للقائمة.');
      try {
        await loadOptions();
      } catch {
        toast.error('تم حفظ رقم الماكينة، لكن تعذر تحديث القائمة. أعد تحميلها للتحقق.');
      }
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ رقم الماكينة.'));
    } finally {
      setMachineSaving(false);
    }
  };

  const toggleMachine = async (machine: QualityInjectionMachine) => {
    try {
      await qualityInjectionService.setMachineActive(machine, machine.isActive === false);
      toast.success(machine.isActive === false ? 'تم تفعيل رقم الماكينة.' : 'تم إيقاف رقم الماكينة.');
      try {
        await loadOptions();
      } catch {
        toast.error('تم تحديث الرقم، لكن تعذر تحديث القائمة. أعد تحميلها للتحقق.');
      }
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تحديث رقم الماكينة.'));
    }
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error('حجم الملف أكبر من 5 ميغابايت.');
      return;
    }
    setSaving(true);
    void file.arrayBuffer()
      .then(async (buffer) => {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        if (!sheet) throw new Error('ملف Excel لا يحتوي على ورقة بيانات.');
        const parsed = injectionRowsFromSheet(
          XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }),
        );
        const count = await qualityInjectionService.importRows(parsed);
        toast.success(`تم استيراد ${count} سجل من متابعة جودة الحقن.`);
        try {
          await load();
        } catch {
          toast.error('تم استيراد السجلات، لكن تعذر تحديث القائمة. حدّث الصفحة للتحقق منها.');
        }
      })
      .catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر استيراد ملف Excel.')))
      .finally(() => setSaving(false));
  };

  const startEditing = (row: QualityInjectionRecord) => {
    setEditingId(row.id);
    setForm({
      machineNumber: row.machineNumber,
      itemName: row.itemName,
      date: row.date,
      shift: row.shift,
      totalQuantity: row.totalQuantity,
      acceptedQuantity: row.acceptedQuantity,
      rejectedQuantity: row.rejectedQuantity,
      notes: row.notes,
    });
  };

  return (
    <QmsPage
      title="متابعة جودة قسم الحقن"
      subtitle="سجّل كمية كل ماكينة وصنف حسب التاريخ والوردية، مع توزيع الإجمالي على المقبول والمرفوض."
    >
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <label>
          <span className="qms-label">الشهر</span>
          <input className="qms-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label>
          <span className="qms-label">بحث</span>
          <input
            className="qms-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="رقم الماكينة أو الصنف أو الوردية"
          />
        </label>
        <label>
          <span className="qms-label">استيراد Excel</span>
          <input
            className="qms-input"
            type="file"
            accept=".xlsx,.xls"
            disabled={!canManage || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              importFile(file);
            }}
          />
        </label>
        <small className="qms-muted">الأعمدة المطلوبة: رقم الماكينة، اسم الصنف، التاريخ، الوردية، الإجمالي، المقبول، المرفوض، والملاحظات.</small>
      </div>

      {canManage ? (
        <details className="qms-card" style={{ marginBottom: 12 }}>
          <summary className="qms-label" style={{ cursor: 'pointer' }}>
            إدارة أرقام الماكينات ({activeMachines.length} نشطة)
          </summary>
          <div className="qms-row" style={{ marginTop: 10 }}>
            <label>
              <span className="qms-label">رقم ماكينة جديد</span>
              <input
                className="qms-input"
                maxLength={80}
                value={machineDraft}
                onChange={(event) => setMachineDraft(event.target.value)}
                placeholder="مثال: 1"
              />
            </label>
            <button
              type="button"
              className="qms-btn qms-btn-primary"
              disabled={machineSaving || !machineDraft.trim()}
              onClick={() => void saveMachineNumber()}
            >
              {machineSaving ? 'جارٍ الحفظ…' : 'إضافة ماكينة'}
            </button>
          </div>
          {optionsError ? (
            <div role="alert">
              <p className="qms-error">{optionsError}</p>
              <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void loadOptions().catch(() => undefined)}>إعادة تحميل القوائم</button>
            </div>
          ) : null}
          {machines.length === 0 && !optionsLoading && !optionsError ? <p className="qms-muted">لم تُضف أرقام ماكينات بعد.</p> : null}
          {machines.map((machine) => (
            <div key={machine.id} className="qms-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span>{machine.name}{machine.isActive === false ? ' — موقوفة' : ''}</span>
              <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void toggleMachine(machine)}>
                {machine.isActive === false ? 'تفعيل' : 'إيقاف'}
              </button>
            </div>
          ))}
        </details>
      ) : null}

      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-label">{editingId ? 'تعديل سجل متابعة الحقن' : 'إضافة سجل يدوي'}</h2>
        <div className="qms-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <label>
            <span className="qms-label">رقم الماكينة</span>
            <select
              className="qms-input"
              value={form.machineNumber}
              disabled={optionsLoading || !optionsReady || saving}
              onChange={(event) => setForm({ ...form, machineNumber: event.target.value })}
            >
              <option value="">— اختر رقم الماكينة —</option>
              {selectedInactiveMachine ? <option value={form.machineNumber}>{form.machineNumber} — موقوفة</option> : null}
              {activeMachines.map((machine) => <option key={machine.id} value={machine.name}>{machine.name}</option>)}
            </select>
          </label>
          <label>
            <span className="qms-label">اسم الصنف</span>
            <input className="qms-input" maxLength={150} value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} />
          </label>
          <label>
            <span className="qms-label">التاريخ</span>
            <input className="qms-input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </label>
          <label>
            <span className="qms-label">الوردية</span>
            <select
              className="qms-input"
              value={form.shift}
              disabled={optionsLoading || !optionsReady || saving}
              onChange={(event) => setForm({ ...form, shift: event.target.value })}
            >
              <option value="">— اختر الوردية —</option>
              {selectedInactiveShift ? <option value={form.shift}>{form.shift} — غير نشطة</option> : null}
              {shifts.map((shift) => <option key={shift.id} value={shift.name}>{shift.name}</option>)}
            </select>
          </label>
          <label>
            <span className="qms-label">إجمالي الكمية</span>
            <input className="qms-input" type="number" min={0} step={1} value={form.totalQuantity} onChange={(event) => setForm({ ...form, totalQuantity: Number(event.target.value) })} />
          </label>
          <label>
            <span className="qms-label">كمية المقبول</span>
            <input className="qms-input" type="number" min={0} step={1} value={form.acceptedQuantity} onChange={(event) => setForm({ ...form, acceptedQuantity: Number(event.target.value) })} />
          </label>
          <label>
            <span className="qms-label">كمية المرفوض</span>
            <input className="qms-input" type="number" min={0} step={1} value={form.rejectedQuantity} onChange={(event) => setForm({ ...form, rejectedQuantity: Number(event.target.value) })} />
          </label>
          <label>
            <span className="qms-label">ملاحظات</span>
            <input className="qms-input" maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
        </div>
        {optionsError ? <p className="qms-error" role="alert">{optionsError}</p> : null}
        {!optionsLoading && optionsReady && activeMachines.length === 0 ? <p className="qms-muted">أضف أرقام الماكينات من قسم «إدارة أرقام الماكينات» أولاً.</p> : null}
        {!optionsLoading && optionsReady && shifts.length === 0 ? <p className="qms-muted">لا توجد ورديات نشطة. أضف وردية من إعدادات الموارد البشرية أولاً.</p> : null}
        {quantityMismatch ? (
          <p className="qms-error" role="alert">
            الإجمالي ({form.totalQuantity}) لا يساوي المقبول ({form.acceptedQuantity}) + المرفوض ({form.rejectedQuantity}).
          </p>
        ) : null}
        <div className="qms-row" style={{ marginTop: 10 }}>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !canManage || quantityMismatch || !optionsReady || !machineValid || !shiftValid} onClick={() => void save()}>
            {saving ? 'جارٍ الحفظ…' : editingId ? 'حفظ التعديل' : 'إضافة السجل'}
          </button>
          {editingId ? (
            <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={resetForm}>إلغاء التعديل</button>
          ) : null}
          {!canManage ? <span className="qms-muted">ليس لديك صلاحية إضافة أو تعديل سجلات الحقن.</span> : null}
        </div>
      </section>

      <div className="qms-kpis" style={{ marginBottom: 12 }}>
        <div className="qms-card qms-kpi"><span>السجلات</span><strong>{summary.records}</strong></div>
        <div className="qms-card qms-kpi"><span>إجمالي الإنتاج</span><strong>{summary.total}</strong></div>
        <div className="qms-card qms-kpi"><span>المقبول</span><strong>{summary.accepted}</strong></div>
        <div className="qms-card qms-kpi"><span>المرفوض</span><strong>{summary.rejected}</strong></div>
      </div>

      <section className="qms-card qms-table-wrap">
        <table className="qms-table">
          <thead>
            <tr>
              <th>رقم الماكينة</th>
              <th>اسم الصنف</th>
              <th>التاريخ</th>
              <th>الوردية</th>
              <th>إجمالي الكمية</th>
              <th>المقبول</th>
              <th>المرفوض</th>
              <th>كمية المقبول</th>
              <th>كمية المرفوض</th>
              <th>ملاحظات</th>
              {canManage ? <th>الإجراءات</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.machineNumber}</td>
                <td>{row.itemName}</td>
                <td>{row.date}</td>
                <td>{row.shift}</td>
                <td>{row.totalQuantity}</td>
                <td aria-label={row.acceptedQuantity > 0 ? 'مقبول' : 'لا توجد كمية مقبولة'}>{row.acceptedQuantity > 0 ? '✓' : '—'}</td>
                <td aria-label={row.rejectedQuantity > 0 ? 'مرفوض' : 'لا توجد كمية مرفوضة'}>{row.rejectedQuantity > 0 ? '✓' : '—'}</td>
                <td>{row.acceptedQuantity}</td>
                <td>{row.rejectedQuantity}</td>
                <td>{row.notes || '—'}</td>
                {canManage ? <td><button type="button" className="qms-btn qms-btn-ghost" onClick={() => startEditing(row)}>تعديل</button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p role="status">جارٍ تحميل السجلات…</p> : null}
        {!loading && loadError ? (
          <div role="alert">
            <p className="qms-error">{loadError}</p>
            <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void load().catch(() => undefined)}>إعادة المحاولة</button>
          </div>
        ) : null}
        {!loading && !loadError && visibleRows.length === 0 ? <p>لا توجد سجلات لهذا الشهر أو لم تطابق البحث.</p> : null}
      </section>
    </QmsPage>
  );
};
