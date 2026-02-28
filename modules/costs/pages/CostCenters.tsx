import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import type { CostCenter } from '../../../types';
import { getCurrentMonth, getDaysInMonth } from '../../../utils/costCalculations';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export const CostCenters: React.FC = () => {
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const _rawLines = useAppStore((s) => s._rawLines);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const createCostCenter = useAppStore((s) => s.createCostCenter);
  const updateCostCenter = useAppStore((s) => s.updateCostCenter);
  const deleteCostCenter = useAppStore((s) => s.deleteCostCenter);
  const navigate = useNavigate();
  const { can } = usePermission();
  const canManage = can('costs.manage');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'costCenters'),
    [exportImportSettings]
  );
  const canExport = can('export') && pageControl.exportEnabled;

  const [modal, setModal] = useState<CostCenter | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', type: 'indirect' as 'indirect' | 'direct', isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const lineNameMap = useMemo(
    () => new Map(_rawLines.map((line) => [line.id || '', line.name || ''])),
    [_rawLines]
  );

  const openCreate = () => {
    setForm({ name: '', type: 'indirect', isActive: true });
    setModal('new');
  };

  const openEdit = (cc: CostCenter) => {
    setForm({ name: cc.name, type: cc.type, isActive: cc.isActive });
    setModal(cc);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (modal === 'new') {
      await createCostCenter(form);
    } else if (modal && modal !== 'new') {
      await updateCostCenter(modal.id!, form);
    }
    setSaving(false);
    setModal(null);
  };

  const handleDelete = async (id: string) => {
    await deleteCostCenter(id);
    setDeleteConfirm(null);
  };

  const getCurrentMonthValue = (centerId: string) => {
    const month = new Date().toISOString().slice(0, 7);
    return costCenterValues.find((v) => v.costCenterId === centerId && v.month === month)?.amount ?? 0;
  };

  const handleExportCenters = () => {
    const daysInMonth = getDaysInMonth(selectedMonth);

    const summaryRows = costCenters.map((center) => {
      const monthlyAmount = costCenterValues.find(
        (value) => value.costCenterId === center.id && value.month === selectedMonth
      )?.amount ?? 0;
      const allocationDoc = costAllocations.find(
        (allocation) => allocation.costCenterId === center.id && allocation.month === selectedMonth
      );
      const totalAllocationPct = (allocationDoc?.allocations || []).reduce(
        (sum, item) => sum + (item.percentage || 0),
        0
      );
      const distributedMonthly = monthlyAmount * (totalAllocationPct / 100);
      const dailyAmount = daysInMonth > 0 ? monthlyAmount / daysInMonth : 0;

      return {
        'الشهر': selectedMonth,
        'معرف المركز': center.id || '',
        'اسم مركز التكلفة': center.name,
        'النوع': center.type === 'indirect' ? 'غير مباشر' : 'مباشر',
        'الحالة': center.isActive ? 'مفعل' : 'معطل',
        'القيمة الشهرية': monthlyAmount,
        'القيمة اليومية': dailyAmount,
        'إجمالي نسبة التوزيع %': totalAllocationPct,
        'المتبقي %': 100 - totalAllocationPct,
        'إجمالي المبلغ الموزع': distributedMonthly,
      };
    });

    const detailsRows: Array<Record<string, string | number>> = [];
    costCenters.forEach((center) => {
      const monthlyAmount = costCenterValues.find(
        (value) => value.costCenterId === center.id && value.month === selectedMonth
      )?.amount ?? 0;
      const allocationDoc = costAllocations.find(
        (allocation) => allocation.costCenterId === center.id && allocation.month === selectedMonth
      );
      const allocations = allocationDoc?.allocations || [];
      if (allocations.length === 0) {
        detailsRows.push({
          'الشهر': selectedMonth,
          'اسم مركز التكلفة': center.name,
          'النوع': center.type === 'indirect' ? 'غير مباشر' : 'مباشر',
          'الخط': center.type === 'indirect' ? 'بدون توزيع' : 'مركز مباشر (غير موزع على خطوط)',
          'النسبة %': 0,
          'المبلغ الشهري الموزع': 0,
          'المبلغ اليومي': 0,
        });
        return;
      }

      allocations.forEach((allocation) => {
        const allocatedMonthly = monthlyAmount * ((allocation.percentage || 0) / 100);
        detailsRows.push({
          'الشهر': selectedMonth,
          'اسم مركز التكلفة': center.name,
          'النوع': center.type === 'indirect' ? 'غير مباشر' : 'مباشر',
          'الخط': lineNameMap.get(allocation.lineId) || allocation.lineId,
          'النسبة %': allocation.percentage || 0,
          'المبلغ الشهري الموزع': allocatedMonthly,
          'المبلغ اليومي': daysInMonth > 0 ? allocatedMonthly / daysInMonth : 0,
        });
      });
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'ملخص المراكز');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailsRows), 'تفاصيل التوزيع');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([buffer]), `توزيع-مراكز-التكلفة-${selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">مراكز التكلفة</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة مراكز التكلفة المباشرة وغير المباشرة.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
          />
          {canExport && costCenters.length > 0 && (
            <Button variant={pageControl.exportVariant} onClick={handleExportCenters}>
              <span className="material-icons-round text-sm">file_download</span>
              تصدير التوزيع
            </Button>
          )}
          {canManage && (
            <Button variant="primary" onClick={openCreate}>
              <span className="material-icons-round text-sm">add</span>
              إضافة مركز تكلفة
            </Button>
          )}
        </div>
      </div>

      {costCenters.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">account_balance</span>
            <p className="font-bold">لا توجد مراكز تكلفة بعد</p>
            {canManage && <p className="text-sm mt-1">أضف مراكز التكلفة لبدء تتبع المصروفات</p>}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {costCenters.map((cc) => (
            <Card key={cc.id} className="transition-all hover:ring-2 hover:ring-primary/10">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    cc.type === 'indirect'
                      ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                  }`}>
                    <span className="material-icons-round text-lg">
                      {cc.type === 'indirect' ? 'share' : 'engineering'}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white">{cc.name}</h4>
                    <Badge variant={cc.type === 'indirect' ? 'warning' : 'success'}>
                      {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                    </Badge>
                  </div>
                </div>
                {!cc.isActive && (
                  <Badge variant="neutral">معطل</Badge>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-4">
                <p className="text-[11px] font-bold text-slate-400 mb-1">قيمة الشهر الحالي</p>
                <p className="text-lg font-black text-slate-800 dark:text-white">
                  {getCurrentMonthValue(cc.id!).toLocaleString('en-US')} ج.م
                </p>
              </div>

              <div className="flex items-center gap-2">
                {cc.type === 'indirect' && (
                  <button
                    onClick={() => navigate(`/cost-centers/${cc.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/10 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg transition-all"
                  >
                    <span className="material-icons-round text-sm">pie_chart</span>
                    التوزيع
                  </button>
                )}
                {canManage && (
                  <>
                    <button
                      onClick={() => openEdit(cc)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-all"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(cc.id!)}
                      className="py-2 px-3 text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/10 dark:hover:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg transition-all"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{modal === 'new' ? 'إضافة مركز تكلفة' : 'تعديل مركز التكلفة'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم مركز التكلفة *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: إيجار المصنع"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">النوع *</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'indirect' | 'direct' })}
                >
                  <option value="indirect">غير مباشر (يوزع على الخطوط)</option>
                  <option value="direct">مباشر</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/20"
                />
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">مفعل</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setModal(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                حفظ
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="material-icons-round text-rose-500 text-4xl mb-3">warning</span>
            <h3 className="text-lg font-bold mb-2">حذف مركز التكلفة</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا المركز؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-6 py-2.5 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-all"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
