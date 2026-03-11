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
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'direct' | 'indirect'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

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

  const getCenterMonthlyDepreciation = (centerId: string) => {
    const centerAssetIds = new Set(
      assets
        .filter((asset) => asset.id && asset.centerId === centerId)
        .map((asset) => String(asset.id))
    );
    if (centerAssetIds.size === 0) return 0;
    return assetDepreciations.reduce((sum, entry) => {
      if (entry.period !== selectedMonth) return sum;
      if (!centerAssetIds.has(String(entry.assetId || ''))) return sum;
      return sum + Number(entry.depreciationAmount || 0);
    }, 0);
  };

  const getSelectedMonthValue = (centerId: string) => {
    const manualValue = costCenterValues.find((v) => v.costCenterId === centerId && v.month === selectedMonth)?.amount ?? 0;
    const depreciationValue = getCenterMonthlyDepreciation(centerId);
    return manualValue + depreciationValue;
  };

  const filteredCenters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return costCenters.filter((center) => {
      const matchSearch = !q
        || center.name.toLowerCase().includes(q)
        || String(center.id || '').toLowerCase().includes(q);
      const matchType = typeFilter === 'all' || center.type === typeFilter;
      const matchStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? center.isActive : !center.isActive);
      return matchSearch && matchType && matchStatus;
    });
  }, [costCenters, search, statusFilter, typeFilter]);

  const totalCenterValue = useMemo(
    () => filteredCenters.reduce((sum, cc) => sum + getSelectedMonthValue(String(cc.id || '')), 0),
    [filteredCenters, selectedMonth, costCenterValues, assetDepreciations, assets]
  );

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
      <div className="rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] font-bold">Costing Workspace</p>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">مراكز التكلفة</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-medium">إدارة مراكز التكلفة المباشرة وغير المباشرة بأسلوب ERP.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none sm:w-auto"
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">إجمالي المراكز</p>
            <p className="text-2xl font-black text-[var(--color-text)]">{filteredCenters.length}</p>
          </div>
          <div className="rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">غير مباشر</p>
            <p className="text-2xl font-black text-amber-600">{filteredCenters.filter((cc) => cc.type === 'indirect').length}</p>
          </div>
          <div className="rounded-[var(--border-radius-lg)] border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">قيمة الشهر المحدد</p>
            <p className="text-xl font-black text-blue-600">{totalCenterValue.toLocaleString('en-US')}</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المركز أو المعرف..."
            className="h-10 flex-1 min-w-0 w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 bg-[var(--color-bg)] text-sm outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'direct' | 'indirect')}
            className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 bg-[var(--color-card)] text-sm"
          >
            <option value="all">كل الأنواع</option>
            <option value="indirect">غير مباشر</option>
            <option value="direct">مباشر</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 bg-[var(--color-card)] text-sm"
          >
            <option value="all">كل الحالات</option>
            <option value="active">مفعل</option>
            <option value="inactive">معطل</option>
          </select>
          <div className="flex items-center rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden sm:ms-auto">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-xs font-bold ${viewMode === 'table' ? 'bg-primary text-white' : 'bg-[var(--color-card)] text-[var(--color-text-muted)]'}`}
            >
              جدول
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2 text-xs font-bold ${viewMode === 'cards' ? 'bg-primary text-white' : 'bg-[var(--color-card)] text-[var(--color-text-muted)]'}`}
            >
              بطاقات
            </button>
          </div>
        </div>
      </Card>

      {filteredCenters.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">account_balance</span>
            <p className="font-bold">لا توجد نتائج مطابقة</p>
            {canManage && <p className="text-sm mt-1">أضف مراكز التكلفة لبدء تتبع المصروفات</p>}
          </div>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCenters.map((cc) => (
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
                <p className="text-[11px] font-medium text-[var(--color-text-muted)] mt-1">
                  يشمل الإهلاك المرتبط بالمركز لهذا الشهر
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
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-no-table-enhance="true">
              <thead className="erp-thead">
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-bold">
                  <th className="erp-th">المركز</th>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">القيمة (الشهر)</th>
                  <th className="erp-th">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCenters.map((cc) => (
                  <tr key={cc.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2.5 px-3">
                      <p className="font-bold text-[var(--color-text)]">{cc.name}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{cc.id || '—'}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={cc.type === 'indirect' ? 'warning' : 'success'}>
                        {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={cc.isActive ? 'success' : 'neutral'}>
                        {cc.isActive ? 'مفعل' : 'معطل'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-bold text-primary">
                      {getSelectedMonthValue(String(cc.id || '')).toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cc.type === 'indirect' && (
                          <button
                            onClick={() => navigate(`/cost-centers/${cc.id}`)}
                            className="px-2 py-1 text-xs font-bold rounded border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100"
                          >
                            توزيع
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEdit(cc)}
                              data-modal-key={MODAL_KEYS.COST_CENTERS_CREATE}
                              className="px-2 py-1 text-xs font-bold rounded border border-primary/20 text-primary bg-primary/5 hover:bg-primary/10"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(cc.id!)}
                              className="px-2 py-1 text-xs font-bold rounded border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100"
                            >
                              حذف
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
