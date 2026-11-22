import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildQualityAnalytics, csvCell, resolveAnalyticsRange, type AnalyticsDefect, type AnalyticsInspection } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import type { QualityDefectLine } from '../model';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualitySampleService } from '../services/qualitySampleService';

function defectLines(defects: QualityDefectLine[] | undefined, fallback: number): AnalyticsDefect[] {
  const lines = (defects || []).filter((defect) => Number(defect.count) > 0).map((defect) => ({
    reasonLabel: defect.reasonLabel,
    count: Number(defect.count),
  }));
  if (lines.length > 0) return lines;
  return fallback > 0 ? [{ reasonLabel: 'غير مصنف', count: fallback }] : [];
}

export const QualityAnalytics: React.FC = () => {
  const masters = useQualityMasters();
  const [month, setMonth] = useState(localDateIso().slice(0, 7));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [reasonLabel, setReasonLabel] = useState('');
  const [rows, setRows] = useState<AnalyticsInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'rate_desc' | 'rate_asc' | 'inspected_desc' | 'defects_desc'>('rate_desc');
  const [selectedDay, setSelectedDay] = useState('');
  const [productSort, setProductSort] = useState<'defects' | 'rate' | 'inspected' | 'rate_asc'>('defects');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [defectSearch, setDefectSearch] = useState('');
  const [defectLimit, setDefectLimit] = useState<'15' | '20' | '30' | 'all'>('15');
  const [defectSort, setDefectSort] = useState<'desc' | 'asc'>('desc');
  const [defectProduct, setDefectProduct] = useState('');
  const [selectedDefect, setSelectedDefect] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const range = resolveAnalyticsRange({ month, from, to });
      const loadList = async <T,>(work: Promise<T[]>, label: string): Promise<T[]> => {
        try {
          return await work;
        } catch (error: unknown) {
          toast.error(qualityUserMessage(error, label));
          return [];
        }
      };
      const [pallets, hourly, pulls] = await Promise.all([
        loadList(qualityPalletService.listByDateRange(range.from, range.to), 'تعذر تحميل البالتات'),
        loadList(qualitySampleService.listHourlyRange(range.from, range.to), 'تعذر تحميل العينات الساعية'),
        loadList(qualitySampleService.listPullsRange(range.from, range.to), 'تعذر تحميل سحب الخطوط'),
      ]);
      const [palletRows, hourlyRows, pullRows] = await Promise.all([
        loadList(qualityPalletService.withDefects(pallets.filter((row) => row.inspectedQuantity > 0)), 'تعذر تحميل عيوب البالتات'),
        loadList(qualitySampleService.withHourlyDefects(hourly.filter((row) => row.sampleCount > 0)), 'تعذر تحميل عيوب العينات الساعية'),
        loadList(qualitySampleService.withPullDefects(pulls.filter((row) => row.status === 'completed' && row.sampleCount > 0)), 'تعذر تحميل عيوب السحب'),
      ]);
      if (cancelled) return;
      setRows([
        ...pullRows.map((row) => ({
          id: `pull-${row.id}`,
          date: row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          productCode: '',
          inspected: row.sampleCount,
          defects: defectLines(row.defects, row.defectCount),
        })),
        ...palletRows.map((row) => ({
          id: `pallet-${row.id}`,
          date: /^\d{4}-\d{2}-\d{2}/.test(row.inspectionDate || '') ? String(row.inspectionDate).slice(0, 10) : row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          productCode: row.productCode,
          inspected: row.inspectedQuantity,
          defects: defectLines(row.defects, row.rejectedQuantity),
        })),
        ...hourlyRows.map((row) => ({
          id: `hour-${row.id}`,
          date: row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          productCode: '',
          inspected: row.sampleCount,
          defects: defectLines(row.defects, row.defectCount),
        })),
      ]);
    })().catch((error: unknown) => {
      if (!cancelled) toast.error(qualityUserMessage(error, 'تعذر تحميل لوحة التحليل'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [month, from, to]);

  const analysis = useMemo(() => {
    try {
      return buildQualityAnalytics(rows, { month, from, to, lineId, productId, reasonLabel });
    } catch {
      return null;
    }
  }, [rows, month, from, to, lineId, productId, reasonLabel]);

  const compared = useMemo(() => {
    const list = (analysis?.lineProducts || []).filter((row) => {
      const text = search.trim();
      return !text || `${row.lineName} ${row.productName} ${row.productCode}`.includes(text);
    });
    return [...list].sort((left, right) => {
      if (sort === 'rate_asc') return (left.rate ?? 999) - (right.rate ?? 999);
      if (sort === 'inspected_desc') return right.inspected - left.inspected;
      if (sort === 'defects_desc') return right.defects - left.defects;
      return (right.rate ?? -1) - (left.rate ?? -1);
    });
  }, [analysis, search, sort]);

  const sortedProducts = useMemo(() => {
    const list = [...(analysis?.products || [])];
    list.sort((left, right) => {
      if (productSort === 'rate') return (right.rate ?? -1) - (left.rate ?? -1);
      if (productSort === 'rate_asc') return (left.rate ?? 999) - (right.rate ?? 999);
      if (productSort === 'inspected') return right.inspected - left.inspected;
      return right.defects - left.defects;
    });
    return list;
  }, [analysis, productSort]);

  const visibleDefects = useMemo(() => {
    const relations = (analysis?.relations || []).filter((row) => !defectProduct || row.productName === defectProduct);
    const totals = new Map<string, number>();
    relations.forEach((row) => totals.set(row.reasonLabel, (totals.get(row.reasonLabel) || 0) + row.count));
    const occurrenceTotal = [...totals.values()].reduce((sum, count) => sum + count, 0);
    let running = 0;
    const ranked = [...totals.entries()]
      .map(([reasonLabel, count]) => ({
        reasonLabel,
        count,
        share: occurrenceTotal > 0 ? Number(((count / occurrenceTotal) * 100).toFixed(2)) : null,
      }))
      .sort((left, right) => right.count - left.count || left.reasonLabel.localeCompare(right.reasonLabel, 'ar'))
      .map((row) => {
        running += row.count;
        return { ...row, cumulative: occurrenceTotal > 0 ? Number(((running / occurrenceTotal) * 100).toFixed(2)) : null };
      })
      .filter((row) => !defectSearch.trim() || row.reasonLabel.includes(defectSearch.trim()));
    const ordered = defectSort === 'asc' ? [...ranked].reverse() : ranked;
    return defectLimit === 'all' ? ordered : ordered.slice(0, Number(defectLimit));
  }, [analysis, defectProduct, defectSearch, defectLimit, defectSort]);

  const comparisonTotals = compared.reduce((sum, row) => ({
    inspections: sum.inspections + row.inspections,
    inspected: sum.inspected + row.inspected,
    defects: sum.defects + row.defects,
  }), { inspections: 0, inspected: 0, defects: 0 });

  const dayRows = rows.filter((row) => selectedDay
    && row.date.slice(0, 10) === selectedDay
    && (!lineId || row.lineId === lineId)
    && (!productId || row.productId === productId)
    && (!reasonLabel || row.defects.some((defect) => defect.reasonLabel.trim() === reasonLabel)));

  const download = () => {
    if (!analysis) return;
    const header = ['الخط', 'المنتج', 'الكود', 'عمليات الفحص', 'المفحوص', 'العيوب', 'النسبة'];
    const body = compared.map((row) => [
      row.lineName, row.productName, row.productCode, row.inspections, row.inspected, row.defects, row.rate ?? '',
    ]);
    const csv = [header, ...body].map((line) => line.map((cell) => csvCell(cell)).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `تحليل-الجودة-${analysis.range.from}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <QmsPage
      title="تحليلات سحب عينات خطوط الإنتاج"
      subtitle="الشهر هو النطاق الأساسي، بحد 31 يوماً. الإجمالي يجمع سحب الخطوط المكتمل وفحص البالتات والعينات الساعية. أفضل خط أو منتج يحتاج 30 عينة على الأقل."
      actions={<button type="button" className="qms-btn qms-btn-ghost" disabled={!analysis || analysis.lineProducts.length === 0} onClick={download}>تصدير المقارنة</button>}
    >
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">الشهر</span><input className="qms-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label><span className="qms-label">من</span><input className="qms-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="كل الخطوط" options={[{ value: '', label: 'كل الخطوط' }, ...masters.lines.map((line) => ({ value: line.id || '', label: line.name }))]} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="كل المنتجات" options={[{ value: '', label: 'كل المنتجات' }, ...masters.products.map((product) => ({ value: product.id || '', label: product.name }))]} />
          <MasterSelect label="العيب" value={reasonLabel} onChange={setReasonLabel} placeholder="كل العيوب" options={[{ value: '', label: 'كل العيوب' }, ...masters.reasons.map((reason) => ({ value: reason.labelAr, label: reason.labelAr }))]} />
          <button type="button" className="qms-btn qms-btn-ghost" onClick={() => { setFrom(''); setTo(''); setLineId(''); setProductId(''); setReasonLabel(''); setSearch(''); setSelectedDay(''); setSelectedProduct(''); setSelectedDefect(''); setDefectSearch(''); setDefectProduct(''); }}>إعادة ضبط</button>
        </div>
      </section>
      {loading ? <p>جارٍ تحميل التحليل.</p> : null}
      {!loading && analysis && analysis.totals.inspections === 0 ? <p>لا توجد عينات مفحوصة في هذا النطاق.</p> : null}
      {analysis && analysis.totals.inspections > 0 ? (
        <>
          <div className="qms-kpis">
            <div className="qms-card qms-kpi"><span>عمليات الفحص</span><strong>{analysis.totals.inspections}</strong></div>
            <div className="qms-card qms-kpi"><span>المفحوص</span><strong>{analysis.totals.inspected}</strong></div>
            <div className="qms-card qms-kpi"><span>العيوب</span><strong>{analysis.totals.defects}</strong></div>
            <div className="qms-card qms-kpi"><span>نسبة الرفض</span><strong>{analysis.totals.rate ?? '—'}٪</strong></div>
            <div className="qms-card qms-kpi"><span>مرات ظهور العيوب</span><strong>{analysis.totals.occurrences}</strong></div>
          </div>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">اليومي</h2>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={analysis.daily}>
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="inspected" fill="#15803d" name="مفحوص" />
                  <Bar dataKey="defects" fill="#c8102e" name="عيوب" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">الأفضل والأكثر تكراراً</h2>
            <p>أفضل الخطوط: {analysis.bestLines.length === 0 ? 'لا يوجد خط وصل إلى 30 عينة.' : analysis.bestLines.map((row) => `${row.lineName} — مفحوص ${row.inspected}، عيوب ${row.defects}، ${row.rate}٪`).join(' | ')}</p>
            <p>أفضل المنتجات: {analysis.bestProducts.length === 0 ? 'لا يوجد منتج وصل إلى 30 عينة.' : analysis.bestProducts.map((row) => `${row.productName} — مفحوص ${row.inspected}، عيوب ${row.defects}، ${row.rate}٪`).join(' | ')}</p>
            <p>أكثر العيوب: {analysis.mostDefects.map((row) => `${row.reasonLabel} (${row.count})`).join('، ') || '—'}</p>
            <p>أقل العيوب: {analysis.leastDefects.map((row) => `${row.reasonLabel} (${row.count})`).join('، ') || '—'}</p>
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <div className="qms-row">
              <h2 className="qms-label">مقارنة المنتجات</h2>
              <label><span className="qms-label">الترتيب</span>
                <select className="qms-input" value={productSort} onChange={(event) => setProductSort(event.target.value as typeof productSort)}>
                  <option value="defects">أعلى عيوب مسجلة</option>
                  <option value="rate">أعلى نسبة عيوب</option>
                  <option value="inspected">أكبر إجمالي عينات</option>
                  <option value="rate_asc">أقل نسبة عيوب</option>
                </select>
              </label>
            </div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={sortedProducts}>
                  <XAxis dataKey="productName" interval={0} angle={-25} height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="inspected" fill="#cbd5e1" name="مفحوص" onClick={(state) => setSelectedProduct(String((state as { productName?: string }).productName || ''))} />
                  <Bar dataKey="defects" fill="#c8102e" name="عيوب" onClick={(state) => setSelectedProduct(String((state as { productName?: string }).productName || ''))} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {selectedProduct ? (
              <>
                <p>خطوط {selectedProduct}</p>
                <table className="qms-table">
                  <thead><tr><th>الخط</th><th>المفحوص</th><th>العيوب</th><th>النسبة</th></tr></thead>
                  <tbody>
                    {analysis.lineProducts.filter((row) => row.productName === selectedProduct).map((row) => (
                      <tr key={`${row.lineName}-${row.productName}`}><td>{row.lineName}</td><td>{row.inspected}</td><td>{row.defects}</td><td>{row.rate ?? '—'}٪</td></tr>
                    ))}
                  </tbody>
                </table>
                <p>عيوب {selectedProduct}</p>
                <table className="qms-table">
                  <thead><tr><th>العيب</th><th>الخط</th><th>العدد</th></tr></thead>
                  <tbody>
                    {analysis.relations.filter((row) => row.productName === selectedProduct).map((row) => (
                      <tr key={`${row.reasonLabel}-${row.lineName}`}><td>{row.reasonLabel}</td><td>{row.lineName}</td><td>{row.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p>اختر منتجاً من المخطط لعرض الخطوط والعيوب.</p>}
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">المنتجات</h2>
            <table className="qms-table">
              <thead><tr><th>المنتج</th><th>الكود</th><th>المفحوص</th><th>العيوب</th><th>النسبة</th></tr></thead>
              <tbody>
                {sortedProducts.map((row) => (
                  <tr key={row.productId}><td><button type="button" className="qms-btn qms-btn-ghost" onClick={() => setSelectedProduct(row.productName)}>{row.productName}</button></td><td>{row.productCode || '—'}</td><td>{row.inspected}</td><td>{row.defects}</td><td>{row.rate ?? '—'}٪</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">اليوم المحدد</h2>
            <table className="qms-table">
              <thead><tr><th>التاريخ</th><th>المفحوص</th><th>العيوب</th><th>النسبة</th><th></th></tr></thead>
              <tbody>
                {analysis.daily.map((row) => (
                  <tr key={row.date}><td>{row.date}</td><td>{row.inspected}</td><td>{row.defects}</td><td>{row.rate ?? '—'}٪</td><td><button type="button" className="qms-btn qms-btn-ghost" onClick={() => setSelectedDay(row.date)}>تفاصيل</button></td></tr>
                ))}
              </tbody>
            </table>
            {selectedDay ? (
              dayRows.length === 0 ? <p>لا توجد عمليات في {selectedDay} داخل التصفية الحالية.</p> : (
                <table className="qms-table">
                  <thead><tr><th>الخط</th><th>المنتج</th><th>المفحوص</th><th>العيوب</th></tr></thead>
                  <tbody>
                    {dayRows.map((row) => (
                      <tr key={row.id}><td>{row.lineName}</td><td>{row.productName}</td><td>{row.inspected}</td><td>{row.defects.reduce((sum, defect) => sum + defect.count, 0)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : <p>اختر يوماً لعرض الخطوط والمنتجات.</p>}
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">تكرار العيوب</h2>
            <div className="qms-row">
              <label><span className="qms-label">المنتج</span>
                <select className="qms-input" value={defectProduct} onChange={(event) => setDefectProduct(event.target.value)}>
                  <option value="">كل المنتجات</option>
                  {analysis.products.map((row) => <option key={row.productId} value={row.productName}>{row.productName}</option>)}
                </select>
              </label>
              <label><span className="qms-label">بحث</span><input className="qms-input" value={defectSearch} onChange={(event) => setDefectSearch(event.target.value)} placeholder="بحث عن عيب" /></label>
              <label><span className="qms-label">الحد</span>
                <select className="qms-input" value={defectLimit} onChange={(event) => setDefectLimit(event.target.value as typeof defectLimit)}>
                  <option value="15">أعلى 15 عيباً</option>
                  <option value="20">أعلى 20 عيباً</option>
                  <option value="30">أعلى 30 عيباً</option>
                  <option value="all">عرض الكل</option>
                </select>
              </label>
              <label><span className="qms-label">الترتيب</span>
                <select className="qms-input" value={defectSort} onChange={(event) => setDefectSort(event.target.value as typeof defectSort)}>
                  <option value="desc">تنازلي</option>
                  <option value="asc">تصاعدي</option>
                </select>
              </label>
            </div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={visibleDefects}>
                  <XAxis dataKey="reasonLabel" interval={0} angle={-25} height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#c8102e" name="العدد" onClick={(state) => setSelectedDefect(String((state as { reasonLabel?: string }).reasonLabel || ''))} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="qms-table">
              <thead><tr><th>العيب</th><th>العدد</th><th>النسبة</th><th>التراكمي</th></tr></thead>
              <tbody>
                {visibleDefects.map((row) => (
                  <tr key={row.reasonLabel}>
                    <td><button type="button" className="qms-btn qms-btn-ghost" onClick={() => setSelectedDefect(row.reasonLabel)}>{row.reasonLabel}</button></td>
                    <td>{row.count}</td><td>{row.share ?? '—'}٪</td><td>{row.cumulative ?? '—'}٪</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedDefect ? (
              analysis.relations.filter((row) => row.reasonLabel === selectedDefect && (!defectProduct || row.productName === defectProduct)).length === 0
                ? <p>لا توجد خطوط أو منتجات لهذا العيب داخل التصفية.</p>
                : (
                  <table className="qms-table">
                    <thead><tr><th>الخط</th><th>المنتج</th><th>العدد</th></tr></thead>
                    <tbody>
                      {analysis.relations.filter((row) => row.reasonLabel === selectedDefect && (!defectProduct || row.productName === defectProduct)).map((row) => (
                        <tr key={`${row.lineName}-${row.productName}`}><td>{row.lineName}</td><td>{row.productName}</td><td>{row.count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )
            ) : <p>اختر عيباً لعرض المنتجات والخطوط المرتبطة.</p>}
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">خريطة نسبة العيوب حسب الخط والمنتج</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="qms-table">
                <thead>
                  <tr>
                    <th>الخط</th>
                    {[...new Set(analysis.lineProducts.map((row) => row.productName))].map((productName) => <th key={productName}>{productName}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(analysis.lineProducts.map((row) => row.lineName))].map((lineName) => (
                    <tr key={lineName}>
                      <td>{lineName}</td>
                      {[...new Set(analysis.lineProducts.map((row) => row.productName))].map((productName) => {
                        const cell = analysis.lineProducts.find((row) => row.lineName === lineName && row.productName === productName);
                        const tone = cell?.rate == null ? 0 : Math.max(0, Math.min(100, cell.rate));
                        return (
                          <td key={productName} title={cell ? `مفحوص ${cell.inspected}، عيوب ${cell.defects}` : ''} style={{ background: cell ? `hsl(${120 - tone * 1.2} 45% 88%)` : undefined }}>
                            {cell ? `${cell.rate ?? '—'}٪` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">مقارنة الخط والمنتج</h2>
            <div className="qms-row">
              <label><span className="qms-label">بحث</span><input className="qms-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الخط أو المنتج أو الكود" /></label>
              <label><span className="qms-label">الترتيب</span>
                <select className="qms-input" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                  <option value="rate_desc">أعلى نسبة عيوب</option>
                  <option value="rate_asc">أقل نسبة عيوب</option>
                  <option value="inspected_desc">أكبر إجمالي عينات</option>
                  <option value="defects_desc">أعلى عدد عيوب</option>
                </select>
              </label>
            </div>
            <table className="qms-table">
              <thead><tr><th>الخط</th><th>المنتج</th><th>الكود</th><th>مرات الفحص</th><th>المفحوص</th><th>العيوب</th><th>النسبة</th></tr></thead>
              <tbody>
                {compared.map((row) => (
                  <tr key={`${row.lineName}-${row.productName}`}>
                    <td>{row.lineName}</td><td>{row.productName}</td><td>{row.productCode || '—'}</td><td>{row.inspections}</td><td>{row.inspected}</td><td>{row.defects}</td><td>{row.rate ?? '—'}٪</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>الإجمالي</td><td></td><td></td>
                  <td>{comparisonTotals.inspections}</td>
                  <td>{comparisonTotals.inspected}</td>
                  <td>{comparisonTotals.defects}</td>
                  <td>{comparisonTotals.inspected > 0 ? Number(((comparisonTotals.defects / comparisonTotals.inspected) * 100).toFixed(2)) : '—'}٪</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      ) : null}
    </QmsPage>
  );
};
