import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button, SearchableSelect, Badge } from '../components/UI';
import { VoucherItemCombobox } from '@/modules/inventory/components/VoucherItemCombobox';
import { buildCodeVoucherPicker } from '@/modules/inventory/lib/materialVoucherPicker';
import { loadWasteComponentOptions } from '../utils/wasteComponentOptions';
import { useAppStore } from '../../../store/useAppStore';
import type { ProductionReport, ReportComponentScrapItem } from '../../../types';
import { formatNumber, getMonthDateRange, getOperationalDateString } from '../../../utils/calculations';
import { getShareResultFeedbackMessage } from '../../../utils/reportExport';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { useEnsureStoreData } from '@/hooks/useEnsureStoreData';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';

type MaterialOption = {
  materialId: string;
  materialName: string;
  materialCode?: string;
  barcode?: string;
  quantityUsed: number;
};

type ScrapRow = {
  key: string;
  materialId: string;
  quantity: string;
};

const createEmptyRow = (): ScrapRow => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  materialId: '',
  quantity: '',
});

const componentWasteCaption = (input: {
  productName: string;
  items: ReportComponentScrapItem[];
  date: string;
}) => {
  const lines = [
    'تقرير هالك مكونات',
    `المنتج: ${input.productName || '—'}`,
    `التاريخ: ${input.date || '—'}`,
  ];
  if (input.items.length === 0) {
    lines.splice(2, 0, 'المكونات: —');
  } else {
    lines.splice(2, 0, 'المكونات:');
    for (const item of input.items) {
      lines.push(`- ${item.materialName || '—'}: ${formatNumber(Number(item.quantity || 0))}`);
    }
  }
  return lines.join('\n');
};

function getReportComponents(report: ProductionReport): ReportComponentScrapItem[] {
  return (report.componentScrapItems || []).filter((row) => Number(row.quantity || 0) > 0);
}

function formatComponentsLabel(items: ReportComponentScrapItem[]): string {
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].materialName || '—';
  return items.map((item) => item.materialName || '—').join('، ');
}

export const ComponentWasteReports: React.FC = () => {
  const referenceDataLoading = useEnsureStoreData(['products', 'lines', 'employees']);
  const createComponentWasteReport = useAppStore((s) => s.createComponentWasteReport);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);

  const [date, setDate] = useState(() => getOperationalDateString(8));
  const [employeeId, setEmployeeId] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState<ScrapRow[]>(() => [createEmptyRow()]);
  const [notes, setNotes] = useState('');
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentReports, setRecentReports] = useState<ProductionReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [shareReport, setShareReport] = useState<ProductionReport | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  const currentEmployee = useMemo(
    () => _rawEmployees.find((employee) => employee.userId === uid) ?? null,
    [_rawEmployees, uid],
  );

  useEffect(() => {
    if (currentEmployee?.id && !employeeId) setEmployeeId(currentEmployee.id);
  }, [currentEmployee?.id, employeeId]);

  useEffect(() => {
    if (_rawLines.length === 1 && !lineId) setLineId(_rawLines[0].id || '');
  }, [_rawLines, lineId]);

  useEffect(() => {
    if (!productId) {
      setMaterialOptions([]);
      setRows([createEmptyRow()]);
      return;
    }

    let cancelled = false;
    setMaterialsLoading(true);
    loadWasteComponentOptions(productId)
      .then((options) => {
        if (cancelled) return;
        setMaterialOptions(options);
        setRows((prev) => {
          const valid = prev
            .map((row) => ({
              ...row,
              materialId: options.some((opt) => opt.materialId === row.materialId) ? row.materialId : '',
            }));
          return valid.length > 0 ? valid : [createEmptyRow()];
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMaterialOptions([]);
          setRows([createEmptyRow()]);
        }
      })
      .finally(() => {
        if (!cancelled) setMaterialsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const productPicker = useMemo(
    () =>
      buildCodeVoucherPicker(
        _rawProducts
          .filter((product) => Boolean(product.id))
          .map((product) => ({
            value: product.id!,
            label: product.code ? `${product.name} (${product.code})` : product.name,
            name: product.name,
            code: product.code,
            barcode: product.barcode,
            stockItemType: 'finished_good' as const,
          })),
      ),
    [_rawProducts],
  );

  const lineOptions = useMemo(
    () => _rawLines
      .filter((line) => Boolean(line.id))
      .map((line) => ({
        value: line.id!,
        label: line.name,
      })),
    [_rawLines],
  );

  const employeeOptions = useMemo(
    () => _rawEmployees
      .filter((employee) => Boolean(employee.id))
      .map((employee) => ({
        value: employee.id!,
        label: employee.code ? `${employee.name} (${employee.code})` : employee.name,
      })),
    [_rawEmployees],
  );

  const materialById = useMemo(
    () => new Map(materialOptions.map((option) => [option.materialId, option])),
    [materialOptions],
  );

  const selectedComponents = useMemo(() => {
    return rows
      .map((row) => {
        const material = materialById.get(row.materialId);
        if (!material) return null;
        const quantity = Number(row.quantity || 0);
        if (quantity <= 0) return null;
        return {
          materialId: material.materialId,
          materialName: material.materialName,
          quantity,
        } satisfies ReportComponentScrapItem;
      })
      .filter((item): item is ReportComponentScrapItem => Boolean(item));
  }, [rows, materialById]);

  const hasDuplicate = useMemo(() => {
    const ids = rows.map((row) => row.materialId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [rows]);

  const totalScrapQty = useMemo(
    () => selectedComponents.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [selectedComponents],
  );

  const productNameById = useMemo(
    () => new Map(_rawProducts.filter((p) => p.id).map((p) => [p.id!, p.name])),
    [_rawProducts],
  );

  const lineNameById = useMemo(
    () => new Map(_rawLines.filter((l) => l.id).map((l) => [l.id!, l.name])),
    [_rawLines],
  );

  const employeeNameById = useMemo(
    () => new Map(_rawEmployees.filter((e) => e.id).map((e) => [e.id!, e.name])),
    [_rawEmployees],
  );

  const loadRecentReports = async () => {
    setReportsLoading(true);
    try {
      const { start, end } = getMonthDateRange();
      const reportRows = await ensureProductionReportsForRange(start, end, { force: true });
      setRecentReports(
        reportRows
          .filter((report) => report.reportType === 'component_waste')
          .sort((a, b) => String(b.createdAt?.seconds ?? b.date ?? '').localeCompare(String(a.createdAt?.seconds ?? a.date ?? '')))
          .slice(0, 20),
      );
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecentReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = Boolean(
    employeeId
    && lineId
    && productId
    && selectedComponents.length > 0
    && !hasDuplicate,
  );

  const addRow = () => {
    if (rows.length >= materialOptions.length) return;
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const updateRow = (key: string, patch: Partial<Pick<ScrapRow, 'materialId' | 'quantity'>>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length > 0 ? next : [createEmptyRow()];
    });
  };

  const handleSave = async () => {
    if (!canSave) {
      showAppToast('error', hasDuplicate
        ? 'لا يمكن تكرار نفس المكون أكثر من مرة.'
        : 'اختر المنتج والخط وأضف مكوناً واحداً على الأقل بكمية أكبر من صفر.');
      return;
    }

    setSaving(true);
    try {
      const id = await createComponentWasteReport({
        employeeId,
        lineId,
        productId,
        date,
        components: selectedComponents,
        notes,
      });

      const currentStoreError = useAppStore.getState().error;
      if (!id) {
        showAppToast('error', currentStoreError || 'تعذر حفظ تقرير الهالك.');
        return;
      }

      showAppToast('success', currentStoreError || 'تم حفظ تقرير الهالك وتنفيذ حركة المخزون.');
      setRows([createEmptyRow()]);
      setNotes('');
      void loadRecentReports();
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async (report: ProductionReport) => {
    if (!report.id || exportingId) return;
    setExportingId(report.id);
    setShareReport(report);
    try {
      const { shareToWhatsApp, waitForExportPaint } = await import('../../../utils/reportExport');
      await waitForExportPaint(150);
      if (!shareRef.current) return;

      const items = getReportComponents(report);
      const result = await shareToWhatsApp(
        shareRef.current,
        `تقرير-هالك-مكونات-${report.date}`,
        {
          caption: componentWasteCaption({
            productName: productNameById.get(report.productId) || '',
            items,
            date: report.date,
          }),
        },
      );
      const message = getShareResultFeedbackMessage(result);
      if (message) showAppToast('info', message, { duration: 8000 });
    } finally {
      setShareReport(null);
      setExportingId(null);
    }
  };

  const shareItems = shareReport ? getReportComponents(shareReport) : [];
  const shareTotalQty = shareItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (referenceDataLoading) {
    return <PageContentSkeleton variant="form" />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="تقرير هالك المكونات"
      rangeLabel="اختيار منتج ومكوّن أو أكثر وتسجيل كميات الهالك مع حركة مخزون تلقائية"
    >
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <OpsDashPanel title="تسجيل هالك مكونات" accent="production">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">التاريخ</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">الموظف</label>
              {currentEmployee?.id ? (
                <div className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2.5 text-sm font-bold">
                  {currentEmployee.name}
                </div>
              ) : (
                <SearchableSelect
                  placeholder="اختر الموظف"
                  options={employeeOptions}
                  value={employeeId}
                  onChange={setEmployeeId}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">الخط</label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={lineOptions}
                value={lineId}
                onChange={setLineId}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">المنتج</label>
              <VoucherItemCombobox
                placeholder="ابحث بالاسم أو امسح الباركود"
                options={productPicker.options}
                catalog={productPicker.catalog}
                value={productId}
                onChange={setProductId}
              />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">المكونات</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {materialsLoading
                    ? 'جاري تحميل المكونات...'
                    : `${selectedComponents.length} من ${materialOptions.length} مكوّن`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addRow}
                disabled={!productId || materialsLoading || rows.length >= materialOptions.length || materialOptions.length === 0}
              >
                إضافة مكون
              </Button>
            </div>

            {!materialsLoading && productId && materialOptions.length === 0 && (
              <p className="text-xs text-[rgb(var(--color-warning))]">لا توجد مكونات في BOM هذا المنتج.</p>
            )}

            <div className="space-y-3">
              {rows.map((row) => {
                const selectedIds = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.materialId).filter(Boolean));
                const rowPicker = buildCodeVoucherPicker(
                  materialOptions
                    .filter((opt) => !selectedIds.has(opt.materialId) || opt.materialId === row.materialId)
                    .map((item) => ({
                      value: item.materialId,
                      label: item.quantityUsed > 0
                        ? `${item.materialName}${item.materialCode ? ` (${item.materialCode})` : ''} - ${formatNumber(item.quantityUsed)} / وحدة`
                        : `${item.materialName}${item.materialCode ? ` (${item.materialCode})` : ''}`,
                      name: item.materialName,
                      code: item.materialCode,
                      barcode: item.barcode,
                      stockItemType: 'material' as const,
                    })),
                );

                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-muted)]/15 p-3"
                  >
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">المكون</label>
                      <VoucherItemCombobox
                        placeholder={materialsLoading ? 'جاري التحميل...' : 'ابحث بالاسم أو امسح الباركود'}
                        options={rowPicker.options}
                        catalog={rowPicker.catalog}
                        value={row.materialId}
                        onChange={(value) => updateRow(row.key, { materialId: value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">كمية الهالك</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        placeholder="0"
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-2.5 text-sm outline-none focus:border-primary tabular-nums"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length <= 1}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasDuplicate && (
              <p className="text-xs font-bold text-[rgb(var(--color-danger))]">لا يمكن اختيار نفس المكون أكثر من مرة.</p>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="سبب الهالك أو أي ملاحظة..."
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-2.5 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              سيتم خصم الكميات من مخزن المفكك وإضافتها إلى مخزن الهالك.
            </p>
            <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ تقرير الهالك'}
            </Button>
          </div>
        </OpsDashPanel>

        <OpsDashPanel title="ملخص الاختيار" accent="production">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">المنتج</span>
              <span className="font-bold text-end">{productNameById.get(productId) || '—'}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">المكونات</span>
                <span className="font-bold tabular-nums">{selectedComponents.length || 0}</span>
              </div>
              {selectedComponents.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-end">—</p>
              ) : (
                <div className="space-y-1.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
                  {selectedComponents.map((item) => (
                    <div key={item.materialId} className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-end">{item.materialName}</span>
                      <span className="font-bold tabular-nums text-[rgb(var(--color-danger))]">{formatNumber(item.quantity)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">إجمالي الهالك</span>
              <span className="font-bold tabular-nums">{formatNumber(totalScrapQty)}</span>
            </div>
            <div className="rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-danger)/0.1)] border border-[rgb(var(--color-danger)/0.25)] text-[rgb(var(--color-danger))] p-3 text-xs leading-relaxed">
              التقرير لا يضيف إنتاج ولا ساعات عمل، لكنه يسجل الهالك ويحدث المخزون تلقائياً.
            </div>
          </div>
        </OpsDashPanel>
      </div>

      <OpsDashPanel title="آخر تقارير هالك المكونات" accent="production">
        {reportsLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            جاري تحميل التقارير...
          </div>
        ) : recentReports.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">لا توجد تقارير هالك مكونات هذا الشهر.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 px-3 text-start">التاريخ</th>
                  <th className="py-2 px-3 text-start">المنتج</th>
                  <th className="py-2 px-3 text-start">المكونات</th>
                  <th className="py-2 px-3 text-center">الكمية</th>
                  <th className="py-2 px-3 text-start">الخط</th>
                  <th className="py-2 px-3 text-start">الموظف</th>
                  <th className="py-2 px-3 text-center">مشاركة</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((report) => {
                  const items = getReportComponents(report);
                  const qty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                  return (
                    <tr key={report.id} className="border-b border-[var(--color-border)]/60">
                      <td className="py-2.5 px-3 tabular-nums">{report.date}</td>
                      <td className="py-2.5 px-3 font-semibold">{productNameById.get(report.productId) || '—'}</td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-0.5">
                          <p>{formatComponentsLabel(items)}</p>
                          {items.length > 1 && (
                            <p className="text-[11px] text-[var(--color-text-muted)]">{items.length} مكونات</p>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold tabular-nums text-[rgb(var(--color-danger))]">{formatNumber(qty)}</td>
                      <td className="py-2.5 px-3">{lineNameById.get(report.lineId) || '—'}</td>
                      <td className="py-2.5 px-3">{employeeNameById.get(report.employeeId) || '—'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleShare(report)}
                          disabled={Boolean(exportingId)}
                        >
                          {exportingId === report.id ? 'جاري المشاركة...' : 'واتساب'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </OpsDashPanel>

      <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, direction: 'rtl' }}>
        {shareReport && (
          <div ref={shareRef} className="arabic-export-root w-[520px] bg-[var(--color-card)] text-[var(--color-text)] rounded-2xl border border-[var(--color-border)] p-5" dir="rtl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 mb-4">
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">تقرير</p>
                <h2 className="text-xl font-bold">هالك مكونات</h2>
              </div>
              <Badge variant="danger">هالك</Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-text-muted)]">التاريخ</span>
                <span className="font-bold">{shareReport.date}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-text-muted)]">المنتج</span>
                <span className="font-bold text-end">{productNameById.get(shareReport.productId) || '—'}</span>
              </div>
              <div className="space-y-2">
                <span className="text-[var(--color-text-muted)]">المكونات</span>
                <div className="rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
                  {shareItems.length === 0 ? (
                    <div className="px-3 py-2 font-bold">—</div>
                  ) : (
                    shareItems.map((item) => (
                      <div key={item.materialId} className="px-3 py-2 flex justify-between gap-3">
                        <span className="font-semibold text-end">{item.materialName || '—'}</span>
                        <span className="font-bold tabular-nums text-[rgb(var(--color-danger))]">{formatNumber(Number(item.quantity || 0))}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-[rgb(var(--color-danger)/0.1)] border border-[rgb(var(--color-danger)/0.25)] px-4 py-3 flex justify-between gap-4">
                <span className="text-[rgb(var(--color-danger))] font-semibold">إجمالي الهالك</span>
                <span className="text-2xl font-black text-[rgb(var(--color-danger))] tabular-nums">{formatNumber(shareTotalQty)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-text-muted)]">الخط</span>
                <span className="font-bold">{lineNameById.get(shareReport.lineId) || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-text-muted)]">الموظف</span>
                <span className="font-bold">{employeeNameById.get(shareReport.employeeId) || '—'}</span>
              </div>
              {shareReport.notes && (
                <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">ملاحظات</p>
                  <p className="font-semibold leading-relaxed">{shareReport.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModuleOpsPageShell>
  );
};

export default ComponentWasteReports;
