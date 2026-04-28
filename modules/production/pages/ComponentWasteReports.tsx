import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PackageX, Share2 } from 'lucide-react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { Card, Button, SearchableSelect, Badge } from '../components/UI';
import { productMaterialService } from '../services/productMaterialService';
import { useAppStore } from '../../../store/useAppStore';
import type { ProductionReport, ProductMaterial, ReportComponentScrapItem } from '../../../types';
import { formatNumber, getMonthDateRange, getOperationalDateString } from '../../../utils/calculations';
import { getShareResultFeedbackMessage } from '../../../utils/reportExport';

type MaterialOption = {
  materialId: string;
  materialName: string;
  quantityUsed: number;
};

const componentWasteCaption = (input: {
  productName: string;
  materialName: string;
  quantity: number;
  date: string;
}) => [
  'تقرير هالك مكونات',
  `المنتج: ${input.productName || '—'}`,
  `المكون: ${input.materialName || '—'}`,
  `كمية الهالك: ${formatNumber(input.quantity)}`,
  `التاريخ: ${input.date || '—'}`,
].join('\n');

function resolveMaterialOptions(rows: ProductMaterial[]): MaterialOption[] {
  const seen = new Set<string>();
  return rows
    .map((row) => ({
      materialId: String(row.materialId || '').trim(),
      materialName: String(row.materialName || '').trim(),
      quantityUsed: Number(row.quantityUsed || 0),
    }))
    .filter((row) => {
      if (!row.materialId || seen.has(row.materialId)) return false;
      seen.add(row.materialId);
      return true;
    });
}

function getReportComponent(report: ProductionReport): ReportComponentScrapItem | null {
  const item = report.componentScrapItems?.find((row) => Number(row.quantity || 0) > 0);
  return item ?? null;
}

export const ComponentWasteReports: React.FC = () => {
  const createComponentWasteReport = useAppStore((s) => s.createComponentWasteReport);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const saveErrorFromStore = useAppStore((s) => s.error);

  const [date, setDate] = useState(() => getOperationalDateString(8));
  const [employeeId, setEmployeeId] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<ProductionReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [shareReport, setShareReport] = useState<ProductionReport | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
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
      setMaterialId('');
      return;
    }

    let cancelled = false;
    setMaterialsLoading(true);
    productMaterialService.getByProduct(productId)
      .then((rows) => {
        if (cancelled) return;
        const options = resolveMaterialOptions(rows);
        setMaterialOptions(options);
        setMaterialId((prev) => (options.some((opt) => opt.materialId === prev) ? prev : ''));
      })
      .catch(() => {
        if (!cancelled) {
          setMaterialOptions([]);
          setMaterialId('');
        }
      })
      .finally(() => {
        if (!cancelled) setMaterialsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const productOptions = useMemo(
    () => _rawProducts
      .filter((product) => Boolean(product.id))
      .map((product) => ({
        value: product.id!,
        label: product.code ? `${product.name} (${product.code})` : product.name,
      })),
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

  const selectedMaterial = useMemo(
    () => materialOptions.find((option) => option.materialId === materialId) ?? null,
    [materialOptions, materialId],
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
      const rows = await ensureProductionReportsForRange(start, end, { force: true });
      setRecentReports(
        rows
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

  const canSave = Boolean(employeeId && lineId && productId && selectedMaterial && Number(quantity || 0) > 0);

  const handleSave = async () => {
    if (!canSave || !selectedMaterial) {
      setSaveError('اختر المنتج والمكون والخط وأدخل كمية أكبر من صفر.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const id = await createComponentWasteReport({
        employeeId,
        lineId,
        productId,
        date,
        component: {
          materialId: selectedMaterial.materialId,
          materialName: selectedMaterial.materialName,
          quantity: Number(quantity || 0),
        },
        notes,
      });

      const currentStoreError = useAppStore.getState().error;
      if (!id) {
        setSaveError(currentStoreError || 'تعذر حفظ تقرير الهالك.');
        return;
      }

      setSaveMessage(currentStoreError || 'تم حفظ تقرير الهالك وتنفيذ حركة المخزون.');
      setMaterialId('');
      setQuantity('');
      setNotes('');
      await loadRecentReports();
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

      const item = getReportComponent(report);
      const result = await shareToWhatsApp(
        shareRef.current,
        `تقرير-هالك-مكونات-${report.date}`,
        {
          caption: componentWasteCaption({
            productName: productNameById.get(report.productId) || '',
            materialName: item?.materialName || '',
            quantity: Number(item?.quantity || 0),
            date: report.date,
          }),
        },
      );
      setShareToast(getShareResultFeedbackMessage(result));
    } finally {
      setShareReport(null);
      setExportingId(null);
    }
  };

  const shareItem = shareReport ? getReportComponent(shareReport) : null;
  const visibleError = saveError || (saveErrorFromStore && !saveMessage ? saveErrorFromStore : null);

  return (
    <div className="erp-dashboard-theme space-y-5">
      <PageHeader
        title="تقرير هالك المكونات"
        subtitle="اختيار منتج ومكون وتسجيل كمية الهالك مع حركة مخزون تلقائية"
        icon={<PackageX size={18} />}
      />

      {visibleError && (
        <div className="erp-alert erp-alert-danger">
          <AlertTriangle size={18} />
          <p className="flex-1">{visibleError}</p>
        </div>
      )}
      {saveMessage && (
        <div className="erp-alert erp-alert-success">
          <PackageX size={18} />
          <p className="flex-1">{saveMessage}</p>
        </div>
      )}
      {shareToast && (
        <div className="erp-alert erp-alert-success">
          <Share2 size={18} />
          <p className="flex-1">{shareToast}</p>
          <button type="button" onClick={() => setShareToast(null)} className="text-sm font-bold opacity-70 hover:opacity-100">
            إغلاق
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card title="تسجيل هالك مكون">
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
              <SearchableSelect
                placeholder="اختر المنتج"
                options={productOptions}
                value={productId}
                onChange={setProductId}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">المكون</label>
              <SearchableSelect
                placeholder={materialsLoading ? 'جاري تحميل المكونات...' : 'اختر المكون'}
                options={materialOptions.map((item) => ({
                  value: item.materialId,
                  label: item.quantityUsed > 0
                    ? `${item.materialName} - ${formatNumber(item.quantityUsed)} / وحدة`
                    : item.materialName,
                }))}
                value={materialId}
                onChange={setMaterialId}
              />
              {!materialsLoading && productId && materialOptions.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">لا توجد مكونات خام مربوطة بهذا المنتج.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">كمية الهالك</label>
              <input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-2.5 text-sm outline-none focus:border-primary tabular-nums"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="سبب الهالك أو أي ملاحظة..."
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-2.5 text-sm outline-none focus:border-primary resize-none"
              />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              سيتم خصم الكمية من مخزن المفكك وإضافتها إلى مخزن الهالك.
            </p>
            <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <PackageX size={16} />}
              حفظ تقرير الهالك
            </Button>
          </div>
        </Card>

        <Card title="ملخص الاختيار">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">المنتج</span>
              <span className="font-bold text-end">{productNameById.get(productId) || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">المكون</span>
              <span className="font-bold text-end">{selectedMaterial?.materialName || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">كمية الهالك</span>
              <span className="font-bold tabular-nums">{formatNumber(Number(quantity || 0))}</span>
            </div>
            <div className="rounded-[var(--border-radius-lg)] bg-rose-50 border border-rose-100 text-rose-700 p-3 text-xs leading-relaxed">
              التقرير لا يضيف إنتاج ولا ساعات عمل، لكنه يسجل الهالك ويحدث المخزون تلقائياً.
            </div>
          </div>
        </Card>
      </div>

      <Card title="آخر تقارير هالك المكونات">
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
                  <th className="py-2 px-3 text-start">المكون</th>
                  <th className="py-2 px-3 text-center">الكمية</th>
                  <th className="py-2 px-3 text-start">الخط</th>
                  <th className="py-2 px-3 text-start">الموظف</th>
                  <th className="py-2 px-3 text-center">مشاركة</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((report) => {
                  const item = getReportComponent(report);
                  return (
                    <tr key={report.id} className="border-b border-[var(--color-border)]/60">
                      <td className="py-2.5 px-3 tabular-nums">{report.date}</td>
                      <td className="py-2.5 px-3 font-semibold">{productNameById.get(report.productId) || '—'}</td>
                      <td className="py-2.5 px-3">{item?.materialName || '—'}</td>
                      <td className="py-2.5 px-3 text-center font-bold tabular-nums text-rose-600">{formatNumber(Number(item?.quantity || 0))}</td>
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
                          {exportingId === report.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                          واتساب
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, direction: 'rtl' }}>
        {shareReport && (
          <div ref={shareRef} className="arabic-export-root w-[520px] bg-white text-slate-900 rounded-2xl border border-slate-200 p-5" dir="rtl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
              <div>
                <p className="text-xs text-slate-500">تقرير</p>
                <h2 className="text-xl font-bold">هالك مكونات</h2>
              </div>
              <Badge variant="danger">هالك</Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">التاريخ</span>
                <span className="font-bold">{shareReport.date}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">المنتج</span>
                <span className="font-bold text-end">{productNameById.get(shareReport.productId) || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">المكون</span>
                <span className="font-bold text-end">{shareItem?.materialName || '—'}</span>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 flex justify-between gap-4">
                <span className="text-rose-700 font-semibold">كمية الهالك</span>
                <span className="text-2xl font-black text-rose-700 tabular-nums">{formatNumber(Number(shareItem?.quantity || 0))}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">الخط</span>
                <span className="font-bold">{lineNameById.get(shareReport.lineId) || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">الموظف</span>
                <span className="font-bold">{employeeNameById.get(shareReport.employeeId) || '—'}</span>
              </div>
              {shareReport.notes && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-500 mb-1">ملاحظات</p>
                  <p className="font-semibold leading-relaxed">{shareReport.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComponentWasteReports;
