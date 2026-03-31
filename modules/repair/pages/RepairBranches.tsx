import React, { useEffect, useState } from 'react';
import { repairBranchService } from '../services/repairBranchService';
import type { RepairBranch, RepairTechnicianAssignment } from '../types';
import { useAppStore } from '../../../store/useAppStore';

export const RepairBranches: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [assignments, setAssignments] = useState<RepairTechnicianAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', address: '', phone: '', isMain: false });

  // Tech assignment
  const [techAssignModal, setTechAssignModal] = useState<string | null>(null); // branchId
  const [techId, setTechId] = useState('');
  const [techName, setTechName] = useState('');

  useEffect(() => {
    Promise.all([
      repairBranchService.getAll(),
      repairBranchService.getAllAssignments(),
    ]).then(([b, a]) => {
      setBranches(b);
      setAssignments(a);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    if (!form.name) { setError('اسم الفرع مطلوب'); return; }
    setSaving(true);
    try {
      await repairBranchService.create({ ...form, isActive: true }, uid!);
      const updated = await repairBranchService.getAll();
      setBranches(updated);
      setShowAdd(false);
      setForm({ name: '', address: '', phone: '', isMain: false });
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleAssignTech = async (branchId: string) => {
    if (!techId || !techName) { setError('يرجى إدخال بيانات الفني'); return; }
    setSaving(true);
    try {
      const existing = assignments.find((a) => a.technicianId === techId);
      const currentBranches = existing?.branchIds ?? [];
      if (!currentBranches.includes(branchId)) {
        await repairBranchService.setTechnicianBranches(techId, techName, [...currentBranches, branchId]);
        const updated = await repairBranchService.getAllAssignments();
        setAssignments(updated);
      }
      setTechAssignModal(null);
      setTechId('');
      setTechName('');
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  // Map branchId → technician list
  const branchTechs = (branchId: string) =>
    assignments.filter((a) => a.branchIds.includes(branchId));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة الفروع</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add_circle</span>
          فرع جديد
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {branches.map((branch) => {
          const techs = branchTechs(branch.id!);
          return (
            <div key={branch.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">store</span>
                    <h3 className="font-bold text-gray-800">{branch.name}</h3>
                    {branch.isMain && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">رئيسي</span>
                    )}
                  </div>
                  {branch.address && <p className="text-xs text-gray-500 mt-1">{branch.address}</p>}
                  {branch.phone && <p className="text-xs text-gray-500">📞 {branch.phone}</p>}
                </div>
              </div>

              {/* Technicians */}
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">الفنيون ({techs.length})</p>
                  <button
                    onClick={() => setTechAssignModal(branch.id!)}
                    className="text-blue-600 text-xs hover:underline"
                  >
                    + إضافة فني
                  </button>
                </div>
                {techs.length === 0 ? (
                  <p className="text-xs text-gray-400">لا يوجد فنيون مرتبطون</p>
                ) : (
                  <div className="space-y-1">
                    {techs.map((t) => (
                      <div key={t.technicianId} className="flex items-center justify-between">
                        <span className="text-xs text-gray-700">{t.technicianName}</span>
                        <button
                          onClick={async () => {
                            const newBranches = t.branchIds.filter((b) => b !== branch.id);
                            if (newBranches.length === 0) {
                              await repairBranchService.removeAssignment(t.technicianId);
                            } else {
                              await repairBranchService.setTechnicianBranches(t.technicianId, t.technicianName, newBranches);
                            }
                            const updated = await repairBranchService.getAllAssignments();
                            setAssignments(updated);
                          }}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          إزالة
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Branch Modal */}
      {showAdd && (
        <Modal title="فرع جديد" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            {[
              { label: 'اسم الفرع *', field: 'name', placeholder: 'فرع المعادي' },
              { label: 'العنوان', field: 'address', placeholder: '15 شارع...' },
              { label: 'رقم الهاتف', field: 'phone', placeholder: '01xxxxxxxxx' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={(form as any)[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={placeholder}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isMain}
                onChange={(e) => setForm((f) => ({ ...f, isMain: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-700">فرع رئيسي</span>
            </label>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'حفظ'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign Tech Modal */}
      {techAssignModal && (
        <Modal title="إضافة فني للفرع" onClose={() => setTechAssignModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              الفرع: <strong>{branches.find((b) => b.id === techAssignModal)?.name}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID الفني</label>
              <input
                type="text"
                value={techId}
                onChange={(e) => setTechId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="uid من Firebase"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">اسم الفني</label>
              <input
                type="text"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="محمد أحمد"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTechAssignModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={() => handleAssignTech(techAssignModal)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'إضافة'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);
