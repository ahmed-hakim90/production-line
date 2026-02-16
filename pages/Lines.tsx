
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber } from '../utils/calculations';
import { ProductionLineStatus, FirestoreProductionLine } from '../types';
import { usePermission } from '../utils/permissions';


const statusOptions: { value: ProductionLineStatus; label: string }[] = [
  { value: ProductionLineStatus.ACTIVE, label: 'يعمل' },
  { value: ProductionLineStatus.MAINTENANCE, label: 'صيانة' },
  { value: ProductionLineStatus.IDLE, label: 'متوقف' },
  { value: ProductionLineStatus.WARNING, label: 'تنبيه' },
];

const emptyForm: Omit<FirestoreProductionLine, 'id'> = {
  name: '',
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
};

export const Lines: React.FC = () => {
  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const createLine = useAppStore((s) => s.createLine);
  const updateLine = useAppStore((s) => s.updateLine);
  const deleteLine = useAppStore((s) => s.deleteLine);
  const createLineStatus = useAppStore((s) => s.createLineStatus);
  const updateLineStatus = useAppStore((s) => s.updateLineStatus);

  const can = usePermission();
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Set Target Modal ──
  const [targetModal, setTargetModal] = useState<{ lineId: string; lineName: string } | null>(null);
  const [targetForm, setTargetForm] = useState({ currentProductId: '', targetTodayQty: 0 });
  const [targetSaving, setTargetSaving] = useState(false);

  const openTargetModal = (lineId: string, lineName: string) => {
    const existing = lineStatuses.find((s) => s.lineId === lineId);
    setTargetForm({
      currentProductId: existing?.currentProductId ?? '',
      targetTodayQty: existing?.targetTodayQty ?? 0,
    });
    setTargetModal({ lineId, lineName });
  };

  const handleSaveTarget = async () => {
    if (!targetModal) return;
    setTargetSaving(true);
    const existing = lineStatuses.find((s) => s.lineId === targetModal.lineId);
    if (existing?.id) {
      await updateLineStatus(existing.id, {
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    } else {
      await createLineStatus({
        lineId: targetModal.lineId,
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    }
    setTargetSaving(false);
    setTargetModal(null);
  };

  const getVariant = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'success' as const;
      case ProductionLineStatus.WARNING: return 'warning' as const;
      case ProductionLineStatus.MAINTENANCE: return 'neutral' as const;
      default: return 'neutral' as const;
    }
  };

  const getStatusLabel = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'يعمل حالياً';
      case ProductionLineStatus.WARNING: return 'تنبيه';
      case ProductionLineStatus.MAINTENANCE: return 'صيانة';
      case ProductionLineStatus.IDLE: return 'جاهز للتشغيل';
      default: return 'غير معروف';
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const raw = _rawLines.find((l) => l.id === id);
    if (!raw) return;
    setEditId(id);
    setForm({
      name: raw.name,
      dailyWorkingHours: raw.dailyWorkingHours,
      maxWorkers: raw.maxWorkers,
      status: raw.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    if (editId) {
      await updateLine(editId, form);
    } else {
      await createLine(form);
    }
    setSaving(false);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteLine(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">خطوط الإنتاج</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة ومراقبة جميع خطوط الإنتاج في المصنع.</p>
        </div>
        {can("lines.create") && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            إضافة خط إنتاج
          </Button>
        )}
      </div>

      {/* Lines Grid */}
      {productionLines.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
            <p className="font-bold text-lg">لا توجد خطوط إنتاج بعد</p>
            <p className="text-sm mt-1">
              {can("lines.create")
                ? 'اضغط "إضافة خط إنتاج" لإضافة أول خط'
                : 'لا توجد خطوط إنتاج لعرضها حالياً'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {productionLines.map((line) => {
            const raw = _rawLines.find((l) => l.id === line.id);
            return (
              <Card key={line.id} className="transition-all hover:ring-2 hover:ring-primary/10">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h4 className="font-bold text-lg text-slate-800 dark:text-white">{line.name}</h4>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{line.supervisorName}</span>
                  </div>
                  <Badge variant={getVariant(line.status)} pulse={line.status === ProductionLineStatus.ACTIVE}>
                    {getStatusLabel(line.status)}
                  </Badge>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-slate-400 font-bold mb-1">المنتج الحالي</p>
                  <p className="text-base font-bold text-slate-700 dark:text-slate-200">{line.currentProduct}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">ساعات العمل</p>
                    <p className="text-lg font-black text-primary">{raw?.dailyWorkingHours ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">أقصى عمال</p>
                    <p className="text-lg font-black text-primary">{raw?.maxWorkers ?? 0}</p>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">الإنجاز: {formatNumber(line.achievement)} / {formatNumber(line.target)}</span>
                    <span className={line.efficiency > 80 ? 'text-emerald-600' : 'text-amber-600'}>{line.efficiency}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${line.status === ProductionLineStatus.WARNING ? 'bg-amber-500' : 'bg-primary shadow-[0_0_10px_rgba(19,146,236,0.3)]'}`}
                      style={{ width: `${Math.min(line.efficiency, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {can("lineStatus.edit") && (
                  <button
                    onClick={() => openTargetModal(line.id, line.name)}
                    className="mb-4 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-all"
                  >
                    <span className="material-icons-round text-sm">flag</span>
                    {line.target > 0 ? `تعديل الهدف (${formatNumber(line.target)})` : 'تعيين هدف اليوم'}
                  </button>
                )}

                <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button variant="primary" className="flex-1 text-xs py-2" onClick={() => navigate(`/lines/${line.id}`)}>
                    <span className="material-icons-round text-sm">visibility</span>
                    التفاصيل
                  </Button>
                  {can("lines.edit") && (
                    <Button variant="outline" className="flex-1 text-xs py-2" onClick={() => openEdit(line.id)}>
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </Button>
                  )}
                  {can("lines.delete") && (
                    <button
                      onClick={() => setDeleteConfirmId(line.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                    >
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (can("lines.create") || can("lines.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل خط الإنتاج' : 'إضافة خط إنتاج جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم الخط *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: خط الإنتاج A - التعبئة"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل اليومية</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    max={24}
                    value={form.dailyWorkingHours}
                    onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">أقصى عدد عمال</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    value={form.maxWorkers}
                    onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الحالة</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ProductionLineStatus })}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'إضافة الخط'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && can("lines.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا الخط؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set Target Modal ── */}
      {targetModal && can("lineStatus.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTargetModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تعيين هدف اليوم</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{targetModal.lineName}</p>
              </div>
              <button onClick={() => setTargetModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج الحالي *</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.currentProductId}
                  onChange={(e) => setTargetForm({ ...targetForm, currentProductId: e.target.value })}
                >
                  <option value="">اختر المنتج...</option>
                  {_rawProducts.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الهدف اليومي (كمية) *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.targetTodayQty || ''}
                  onChange={(e) => setTargetForm({ ...targetForm, targetTodayQty: Number(e.target.value) })}
                  placeholder="مثال: 500"
                />
              </div>
              {targetForm.currentProductId && targetForm.targetTodayQty > 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-3">
                  <span className="material-icons-round text-primary text-lg">info</span>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    سيتم تعيين هدف <span className="font-black text-primary">{formatNumber(targetForm.targetTodayQty)}</span> وحدة
                    من <span className="font-black text-slate-800 dark:text-white">{_rawProducts.find(p => p.id === targetForm.currentProductId)?.name}</span> لهذا الخط
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setTargetModal(null)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSaveTarget}
                disabled={targetSaving || !targetForm.currentProductId || !targetForm.targetTodayQty}
              >
                {targetSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">flag</span>
                حفظ الهدف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
