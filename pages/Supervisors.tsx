
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { FirestoreSupervisor } from '../types';
import { usePermission } from '../utils/permissions';

const emptyForm: Omit<FirestoreSupervisor, 'id'> = { name: '' };

export const Supervisors: React.FC = () => {
  const supervisors = useAppStore((s) => s.supervisors);
  const createSupervisor = useAppStore((s) => s.createSupervisor);
  const updateSupervisor = useAppStore((s) => s.updateSupervisor);
  const deleteSupervisor = useAppStore((s) => s.deleteSupervisor);

  const can = usePermission();
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = supervisors.filter(
    (s) => !search || s.name.includes(search)
  );

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const sup = supervisors.find((s) => s.id === id);
    if (!sup) return;
    setEditId(id);
    setForm({ name: sup.name });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    if (editId) {
      await updateSupervisor(editId, form);
    } else {
      await createSupervisor(form);
    }
    setSaving(false);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteSupervisor(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">فريق العمل</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة المشرفين والعاملين على خطوط الإنتاج.</p>
        </div>
        {can("supervisors.create") && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">person_add</span>
            إضافة مشرف
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 relative shadow-sm">
        <span className="material-icons-round absolute right-7 text-slate-400">search</span>
        <input
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm font-medium"
          placeholder="ابحث عن مشرف بالاسم..."
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">groups</span>
            <p className="font-bold text-lg">لا يوجد مشرفين{search ? ' مطابقين للبحث' : ' بعد'}</p>
            <p className="text-sm mt-1">
              {can("supervisors.create")
                ? 'اضغط "إضافة مشرف" لإضافة أول مشرف'
                : 'لا يوجد مشرفين لعرضهم حالياً'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((sup) => (
            <Card key={sup.id} className="transition-all hover:ring-2 hover:ring-primary/10">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 ring-4 ring-primary/5">
                  <span className="material-icons-round text-primary text-4xl">person</span>
                </div>
                <h4 className="font-bold text-lg text-slate-800 dark:text-white mb-1">{sup.name}</h4>
                <Badge variant={sup.status === 'online' ? 'success' : 'neutral'}>
                  {sup.status === 'online' ? 'متصل' : 'غير متصل'}
                </Badge>

                <div className="w-full mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <Button variant="primary" className="flex-1 text-xs py-2" onClick={() => navigate(`/supervisors/${sup.id}`)}>
                    <span className="material-icons-round text-sm">visibility</span>
                    التفاصيل
                  </Button>
                  {can("supervisors.edit") && (
                    <Button variant="outline" className="flex-1 text-xs py-2" onClick={() => openEdit(sup.id)}>
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </Button>
                  )}
                  {can("supervisors.delete") && (
                    <button
                      onClick={() => setDeleteConfirmId(sup.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                    >
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (can("supervisors.create") || can("supervisors.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المشرف' : 'إضافة مشرف جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم المشرف *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: م. سامر عادل"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'person_add'}</span>
                {editId ? 'حفظ' : 'إضافة'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && can("supervisors.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">person_remove</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا المشرف؟</p>
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
    </div>
  );
};
