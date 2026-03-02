import React, { useState } from 'react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ProductionLineStatus, type FirestoreProductionLine } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

const statusOptions: { value: ProductionLineStatus; label: string }[] = [
  { value: ProductionLineStatus.ACTIVE, label: 'يعمل' },
  { value: ProductionLineStatus.MAINTENANCE, label: 'صيانة' },
  { value: ProductionLineStatus.IDLE, label: 'متوقف' },
  { value: ProductionLineStatus.WARNING, label: 'تنبيه' },
];

const emptyForm: Omit<FirestoreProductionLine, 'id'> = {
  name: '',
  code: '',
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
};

export const GlobalCreateLineModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.LINES_CREATE);
  const { can } = usePermission();
  const createLine = useAppStore((s) => s.createLine);
  const lines = useAppStore((s) => s._rawLines);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;
  if (!can('lines.create')) return null;

  const normalizeLineCode = (value: string) => value.trim().toUpperCase();
  const normalizeArabicDigits = (value: string) =>
    value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const buildCodeFromLineName = (name: string) => {
    const normalizedName = normalizeArabicDigits(name);
    const numberMatches = normalizedName.match(/\d+/g);
    if (!numberMatches?.length) return '';
    const lineNumber = Number(numberMatches[numberMatches.length - 1]);
    if (!Number.isFinite(lineNumber)) return '';
    return `LINE-${String(lineNumber).padStart(2, '0')}`;
  };

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    const normalizedCode = normalizeLineCode((form.code ?? '').trim() || buildCodeFromLineName(form.name ?? ''));
    if (!form.name || !normalizedCode) {
      setMessage({ type: 'error', text: 'اسم الخط مطلوب. أضف كود الخط أو رقم داخل اسم الخط.' });
      return;
    }
    const isDuplicateCode = lines.some((line) => normalizeLineCode(line.code ?? '') === normalizedCode);
    if (isDuplicateCode) {
      setMessage({ type: 'error', text: 'كود الخط مستخدم بالفعل. استخدم كودًا مختلفًا.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const id = await createLine({ ...form, code: normalizedCode });
      if (!id) throw new Error('create failed');
      setMessage({ type: 'success', text: 'تم إضافة خط الإنتاج بنجاح' });
      setForm(emptyForm);
    } catch {
      setMessage({ type: 'error', text: 'تعذر حفظ بيانات الخط. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">إضافة خط إنتاج جديد</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
              <span className="material-icons-round text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <p className="flex-1">{message.text}</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">كود الخط (اختياري)</label>
            <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="مثال: LINE-01" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم الخط *</label>
            <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: خط الإنتاج A - التعبئة" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل اليومية</label>
              <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={1} max={24} value={form.dailyWorkingHours} onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">أقصى عدد عمال</label>
              <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={1} value={form.maxWorkers} onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الحالة</label>
            <select className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductionLineStatus })}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">add</span>
            إضافة الخط
          </Button>
        </div>
      </div>
    </div>
  );
};

