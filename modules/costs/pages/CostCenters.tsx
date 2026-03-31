import React, { useMemo, useState } from 'react';
import { Download, Eye, Pencil, Trash2 } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, Badge, Button } from '../../../components/UI';
import { PageHeader } from '../../../components/PageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { DataTable, type Column } from '../../../src/components/erp/DataTable';
import type { RowActionMenuItem } from '../../../src/components/erp/RowActionsMenu';
import { KPICard } from '../../../src/components/erp/KPICard';
import { StatusBadge } from '../../../src/components/erp/StatusBadge';
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
  const navigate = useTenantNavigate();
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
    const center = costCenters.find((item) => String(item.id || '') === centerId);
    const monthValue = costCenterValues.find((v) => v.costCenterId === centerId && v.month === selectedMonth);
    const valueSource = monthValue?.valueSource || center?.valueSource || 'manual';
    const hasSavedBreakdown = monthValue?.manualAmount !== undefined || monthValue?.salariesAmount !== undefined;
    const snapshotBase = valueSource === 'manual'
      ? (hasSavedBreakdown ? Number(monthValue?.manualAmount || 0) : Number(monthValue?.amount || 0))
      : valueSource === 'salaries'
        ? (hasSavedBreakdown ? Number(monthValue?.salariesAmount || 0) : Number(monthValue?.amount || 0))
        : (hasSavedBreakdown
          ? Number(monthValue?.manualAmount || 0) + Number(monthValue?.salariesAmount || 0)
          : Number(monthValue?.amount || 0));
    const depreciationValue = getCenterMonthlyDepreciation(centerId);
    return snapshotBase + depreciationValue;
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
      const monthlyAmount = getSelectedMonthValue(String(center.id || ''));
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
        'أساس التوزيع': center.allocationBasis === 'by_qty' ? 'حسب الكمية' : 'حسب نسب الخطوط',
        'نطاق المنتجات': center.productScope === 'selected' ? 'منتجات محددة' : center.productScope === 'category' ? 'فئة منتجات' : 'كل المنتجات',
        'مصدر القيمة': center.valueSource === 'combined' ? 'مرتبات + يدوي' : center.valueSource === 'salaries' ? 'مرتبات' : 'يدوي',
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
      const monthlyAmount = getSelectedMonthValue(String(center.id || ''));
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

  const directCentersCount = useMemo(
    () => filteredCenters.filter((cc) => cc.type === 'direct').length,
    [filteredCenters]
  );
  const indirectCentersCount = useMemo(
    () => filteredCenters.filter((cc) => cc.type === 'indirect').length,
    [filteredCenters]
  );

  const centerColumns: Column<CostCenter>[] = [
    {
      key: 'center',
      header: 'المركز',
      cell: (cc) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">{cc.name}</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">{cc.id || '—'}</p>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'type',
      header: 'النوع',
      cell: (cc) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge label={cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'} type={cc.type === 'indirect' ? 'warning' : 'success'} />
          {cc.type === 'indirect' && (
            <StatusBadge label={cc.allocationBasis === 'by_qty' ? 'كمية' : 'خطوط'} type="info" />
          )}
        </div>
      ),
      align: 'center',
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (cc) => (
        <StatusBadge label={cc.isActive ? 'مفعل' : 'معطل'} type={cc.isActive ? 'success' : 'muted'} dot />
      ),
      align: 'center',
    },
    {
      key: 'value',
      header: 'القيمة (الشهر)',
      cell: (cc) => getSelectedMonthValue(String(cc.id || '')).toLocaleString('en-US'),
      align: 'center',
      sortable: true,
    },
  ];

  const getCenterRowActions = (cc: CostCenter): RowActionMenuItem[] => {
    const actions: RowActionMenuItem[] = [];
    if (cc.type === 'indirect') {
      actions.push({
        label: 'توزيع',
        icon: <Eye className="h-4 w-4" />,
        onClick: () => navigate(`/cost-centers/${cc.id}`),
      });
    }
    if (canManage) {
      actions.push(
        {
          label: 'تعديل',
          icon: <Pencil className="h-4 w-4" />,
          onClick: () => openEdit(cc),
        },
        {
          label: 'حذف',
          icon: <Trash2 className="h-4 w-4" />,
          onClick: () => setDeleteConfirm(cc.id!),
          variant: 'danger',
        }
      );
    }
    return actions;
  };

  return (
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title="مراكز التكلفة"
        subtitle="إدارة مراكز التكلفة المباشرة وغير المباشرة بأسلوب ERP."
        icon="account_balance"
        backAction={false}
        primaryAction={canManage ? {
          label: 'إضافة مركز تكلفة',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.COST_CENTERS_CREATE,
        } : undefined}
        extra={(
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm outline-none"
            />
            {canExport && costCenters.length > 0 && (
              <Button variant="ghost" onClick={handleExportCenters}>
                <Download className="h-4 w-4" />
                تصدير التوزيع
              </Button>
            )}
          </div>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard label="إجمالي المراكز" value={filteredCenters.length} iconType="metric" color="indigo" />
        <KPICard label="مراكز مباشرة" value={directCentersCount} iconType="money" color="green" />
        <KPICard label="مراكز غير مباشرة" value={indirectCentersCount} iconType="trend" color="amber" />
      </div>

      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المركز أو المعرف..."
            className="h-10 flex-1 min-w-0 w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] px-3 bg-[var(--color-bg)] text-sm outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto"
          />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'direct' | 'indirect')}>
            <SelectTrigger className="h-10 min-w-[150px] rounded-lg border border-slate-200 bg-white text-sm">
              <SelectValue placeholder="كل الأنواع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="indirect">غير مباشر</SelectItem>
              <SelectItem value="direct">مباشر</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className="h-10 min-w-[150px] rounded-lg border border-slate-200 bg-white text-sm">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">مفعل</SelectItem>
              <SelectItem value="inactive">معطل</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden sm:ms-auto">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-xs font-medium ${viewMode === 'table' ? 'bg-[#4F46E5] text-white' : 'bg-[var(--color-card)] text-[var(--color-text-muted)]'}`}
            >
              جدول
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2 text-xs font-medium ${viewMode === 'cards' ? 'bg-[#4F46E5] text-white' : 'bg-[var(--color-card)] text-[var(--color-text-muted)]'}`}
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
            <p className="font-medium">لا توجد نتائج مطابقة</p>
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
                      ? 'bg-[#4F46E5]/10 text-[#4F46E5]'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'
                  }`}>
                    <span className="material-icons-round text-lg">
                      {cc.type === 'indirect' ? 'share' : 'engineering'}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-[var(--color-text)]">{cc.name}</h4>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <Badge variant={cc.type === 'indirect' ? 'warning' : 'success'}>
                        {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                      </Badge>
                      {cc.type === 'indirect' && (
                        <>
                          <Badge variant="neutral">{cc.allocationBasis === 'by_qty' ? 'حسب الكمية' : 'حسب نسب الخطوط'}</Badge>
                          <Badge variant="neutral">{cc.productScope === 'selected' ? 'منتجات محددة' : cc.productScope === 'category' ? 'فئة منتجات' : 'كل المنتجات'}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {!cc.isActive && (
                  <Badge variant="neutral">معطل</Badge>
                )}
              </div>

              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-4 mb-4">
                <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-1">قيمة الشهر المحدد</p>
                <p className="text-lg font-medium text-[var(--color-text)]">
                  {getSelectedMonthValue(cc.id!).toLocaleString('en-US')} ج.م
                </p>
                <p className="text-[11px] font-medium text-[var(--color-text-muted)] mt-1">
                  يشمل الإهلاك المرتبط بالمركز لهذا الشهر
                </p>
              </div>

              <div className="flex items-center gap-2">
                {cc.type === 'indirect' && (
                  <Button variant="ghost" onClick={() => navigate(`/cost-centers/${cc.id}`)} className="flex-1">
                    التوزيع
                  </Button>
                )}
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(cc)}
                      data-modal-key={MODAL_KEYS.COST_CENTERS_CREATE}
                      className="flex-1"
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteConfirm(cc.id!)}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      حذف
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <DataTable
            columns={centerColumns}
            data={filteredCenters}
            emptyMessage="لا توجد نتائج مطابقة"
            getRowActions={getCenterRowActions}
          />
        </Card>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-none w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="material-icons-round text-rose-500 text-4xl mb-3">warning</span>
            <h3 className="text-lg font-medium mb-2">حذف مركز التكلفة</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا المركز؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
              <Button
                variant="ghost"
                onClick={() => handleDelete(deleteConfirm)}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                حذف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};




