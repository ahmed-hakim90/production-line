import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import type { CostCenter } from '../../../types';
import { getCurrentMonth, getWorkingDaysForMonth } from '../../../utils/costCalculations';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';

export const CostCenters: React.FC = () => {
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const _rawLines = useAppStore((s) => s._rawLines);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const deleteCostCenter = useAppStore((s) => s.deleteCostCenter);
  const navigate = useNavigate();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const canManage = can('costs.manage');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'costCenters'),
    [exportImportSettings]
  );
  const canExport = can('export') && pageControl.exportEnabled;

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const lineNameMap = useMemo(
    () => new Map(_rawLines.map((line) => [line.id || '', line.name || ''])),
    [_rawLines]
  );

  const openCreate = () => {
    openModal(MODAL_KEYS.COST_CENTERS_CREATE);
  };

  const openEdit = (cc: CostCenter) => {
    openModal(MODAL_KEYS.COST_CENTERS_CREATE, { costCenter: cc });
  };

  const handleDelete = async (id: string) => {
    await deleteCostCenter(id);
    setDeleteConfirm(null);
  };

  const getSelectedMonthValue = (centerId: string) => {
    return costCenterValues.find((v) => v.costCenterId === centerId && v.month === selectedMonth)?.amount ?? 0;
  };

  const handleExportCenters = () => {
    const summaryRows = costCenters.map((center) => {
      const centerValue = costCenterValues.find(
        (value) => value.costCenterId === center.id && value.month === selectedMonth
      );
      const monthlyAmount = centerValue?.amount ?? 0;
      const workingDays = getWorkingDaysForMonth(centerValue, selectedMonth);
      const allocationDoc = costAllocations.find(
        (allocation) => allocation.costCenterId === center.id && allocation.month === selectedMonth
      );
      const totalAllocationPct = (allocationDoc?.allocations || []).reduce(
        (sum, item) => sum + (item.percentage || 0),
        0
      );
      const distributedMonthly = monthlyAmount * (totalAllocationPct / 100);
      const dailyAmount = workingDays > 0 ? monthlyAmount / workingDays : 0;

      return {
        'الشهر': selectedMonth,
        'أيام الشغل': workingDays,
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
      const centerValue = costCenterValues.find(
        (value) => value.costCenterId === center.id && value.month === selectedMonth
      );
      const monthlyAmount = centerValue?.amount ?? 0;
      const workingDays = getWorkingDaysForMonth(centerValue, selectedMonth);
      const allocationDoc = costAllocations.find(
        (allocation) => allocation.costCenterId === center.id && allocation.month === selectedMonth
      );
      const allocations = allocationDoc?.allocations || [];
      if (allocations.length === 0) {
        detailsRows.push({
          'الشهر': selectedMonth,
          'أيام الشغل': workingDays,
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
          'أيام الشغل': workingDays,
          'اسم مركز التكلفة': center.name,
          'النوع': center.type === 'indirect' ? 'غير مباشر' : 'مباشر',
          'الخط': lineNameMap.get(allocation.lineId) || allocation.lineId,
          'النسبة %': allocation.percentage || 0,
          'المبلغ الشهري الموزع': allocatedMonthly,
          'المبلغ اليومي': workingDays > 0 ? allocatedMonthly / workingDays : 0,
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
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">مراكز التكلفة</h2>
          <p className="text-sm text-[var(--color-text-muted)] font-medium">إدارة مراكز التكلفة المباشرة وغير المباشرة.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
          />
          {canExport && costCenters.length > 0 && (
            <Button variant={pageControl.exportVariant} onClick={handleExportCenters}>
              <span className="material-icons-round text-sm">file_download</span>
              تصدير التوزيع
            </Button>
          )}
          {canManage && (
            <Button variant="primary" onClick={openCreate} data-modal-key={MODAL_KEYS.COST_CENTERS_CREATE}>
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
                  <div className={`w-10 h-10 rounded-[var(--border-radius-base)] flex items-center justify-center ${
                    cc.type === 'indirect'
                      ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                  }`}>
                    <span className="material-icons-round text-lg">
                      {cc.type === 'indirect' ? 'share' : 'engineering'}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--color-text)]">{cc.name}</h4>
                    <Badge variant={cc.type === 'indirect' ? 'warning' : 'success'}>
                      {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                    </Badge>
                  </div>
                </div>
                {!cc.isActive && (
                  <Badge variant="neutral">معطل</Badge>
                )}
              </div>

              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 mb-4">
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1">قيمة الشهر المحدد</p>
                <p className="text-lg font-bold text-[var(--color-text)]">
                  {getSelectedMonthValue(cc.id!).toLocaleString('en-US')} ج.م
                </p>
              </div>

              <div className="flex items-center gap-2">
                {cc.type === 'indirect' && (
                  <button
                    onClick={() => navigate(`/cost-centers/${cc.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/10 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-[var(--border-radius-base)] transition-all"
                  >
                    <span className="material-icons-round text-sm">pie_chart</span>
                    التوزيع
                  </button>
                )}
                {canManage && (
                  <>
                    <button
                      onClick={() => openEdit(cc)}
                      data-modal-key={MODAL_KEYS.COST_CENTERS_CREATE}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-[var(--border-radius-base)] transition-all"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(cc.id!)}
                      className="py-2 px-3 text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/10 dark:hover:bg-rose-900/20 border border-rose-200 rounded-[var(--border-radius-base)] transition-all"
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

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="material-icons-round text-rose-500 text-4xl mb-3">warning</span>
            <h3 className="text-lg font-bold mb-2">حذف مركز التكلفة</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا المركز؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-6 py-2.5 text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-[var(--border-radius-lg)] transition-all"
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
