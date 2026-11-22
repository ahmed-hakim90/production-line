import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePermission } from '@/utils/permissions';
import { localDateIso } from '../domain/time';
import { totalLinePullSampleCount } from '../domain/samples';
import {
  buildQualityAnalytics,
  heatmapColor,
  paretoTopCauseCount,
  type ProductChartSort,
  type QualityAnalyticsRecord,
} from '../domain/analytics';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualitySampleService } from '../services/qualitySampleService';
import { qualityUserMessage } from '../services/qualityGateway';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';
import '../qms/qms.css';

function TotalInspectionsCanvas(props: { sampleCount: number; defectCount: number; defectRate: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * scale);
      canvas.height = Math.round(bounds.height * scale);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.direction = 'rtl';
      context.font = '12px Cairo, Segoe UI, sans-serif';

      const left = 64;
      const right = 18;
      const top = 58;
      const bottom = 48;
      const chartWidth = Math.max(1, bounds.width - left - right);
      const chartHeight = Math.max(1, bounds.height - top - bottom);
      const maxValue = Math.max(props.sampleCount, props.defectCount, 1) * 1.16;
      const yFor = (value: number) => top + chartHeight - (value / maxValue) * chartHeight;

      context.strokeStyle = '#e2e8f0';
      context.fillStyle = '#64748b';
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = maxValue * tick / 4;
        const y = yFor(value);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(left + chartWidth, y);
        context.stroke();
        context.fillText(Math.round(value).toLocaleString('ar-EG'), left - 8, y);
      }

      const bars = [
        { label: 'العينات المفحوصة', value: props.sampleCount, color: '#4f46e5', capsule: props.sampleCount.toLocaleString('ar-EG') },
        { label: 'العيوب المكتشفة', value: props.defectCount, color: '#dc2626', capsule: `${props.defectCount.toLocaleString('ar-EG')} (${props.defectRate.toFixed(1)}٪)` },
      ];
      const barWidth = Math.min(112, chartWidth / 4);
      bars.forEach((bar, index) => {
        const center = left + chartWidth * (index + 0.5) / bars.length;
        const barTop = yFor(bar.value);
        const barHeight = Math.max(0, top + chartHeight - barTop);
        context.fillStyle = bar.color;
        context.beginPath();
        context.roundRect(center - barWidth / 2, barTop, barWidth, barHeight, [8, 8, 0, 0]);
        context.fill();

        context.font = '700 11px Cairo, Segoe UI, sans-serif';
        const capsuleWidth = Math.min(chartWidth / 2 - 8, Math.max(64, context.measureText(bar.capsule).width + 20));
        const capsuleX = center - capsuleWidth / 2;
        const capsuleY = Math.max(4, barTop - 34);
        context.fillStyle = bar.color;
        context.beginPath();
        context.roundRect(capsuleX, capsuleY, capsuleWidth, 24, 12);
        context.fill();
        context.fillStyle = '#fff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(bar.capsule, center, capsuleY + 12, capsuleWidth - 8);

        context.fillStyle = '#334155';
        context.font = '12px Cairo, Segoe UI, sans-serif';
        context.fillText(bar.label, center, bounds.height - 22);
      });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [props.sampleCount, props.defectCount, props.defectRate]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`العينات المفحوصة ${formatNumber(props.sampleCount)}، العيوب المكتشفة ${formatNumber(props.defectCount)}، النسبة ${props.defectRate.toFixed(1)}٪`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

const formatNumber = (value: number) => value.toLocaleString('ar-EG');
const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const currentMonth = () => localDateIso().slice(0, 7);
const monthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-${'01'}`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const QualityDashboard: React.FC = () => {
  const { can } = usePermission();
  const masters = useQualityMasters();
  const monthDefault = currentMonth();
  const initialRange = monthRange(monthDefault);
  const [month, setMonth] = useState(monthDefault);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [records, setRecords] = useState<QualityAnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productSort, setProductSort] = useState<ProductChartSort>('defects');
  const [reasonSearch, setReasonSearch] = useState('');
  const [reasonLimit, setReasonLimit] = useState<'15' | '20' | '30' | 'all'>('15');
  const [reasonOrder, setReasonOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (!from || !to || to < from) {
      setError('اختر نطاقًا زمنيًا صحيحًا.');
      setRecords([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      qualityPalletService.listByDateRange(from, to),
      qualitySampleService.listPullsRange(from, to),
      qualitySampleService.listHourlyRange(from, to),
    ]).then(async ([pallets, pulls, hourly]) => {
      const [detailedPallets, detailedPulls, detailedHourly] = await Promise.all([
        qualityPalletService.withDefects(pallets.filter((row) => row.inspectionStatus === 'تم الفحص')),
        qualitySampleService.withPullDefects(pulls.filter((row) => row.status === 'completed')),
        qualitySampleService.withHourlyDefects(hourly),
      ]);
      if (cancelled) return;
      setRecords([
        ...detailedPallets.map((row): QualityAnalyticsRecord => ({
          id: row.id,
          source: 'pallet',
          date: row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          productCode: row.productCode,
          sampleCount: row.inspectedQuantity,
          defectCount: row.rejectedQuantity,
          defects: row.defects || [],
        })),
        ...detailedPulls.map((row): QualityAnalyticsRecord => ({
          id: row.id,
          source: 'line',
          date: row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          sampleCount: totalLinePullSampleCount(row),
          defectCount: row.defectCount,
          defects: row.defects || [],
        })),
        ...detailedHourly.map((row): QualityAnalyticsRecord => ({
          id: row.id,
          source: 'hourly',
          date: row.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          sampleCount: row.sampleCount,
          defectCount: row.defectCount,
          defects: row.defects || [],
        })),
      ]);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setRecords([]);
      setError(qualityUserMessage(loadError, 'تعذر تحميل بيانات لوحة الجودة'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [from, to]);

  const analytics = useMemo(
    () => buildQualityAnalytics(records, { lineId, productId, reasonId, productSort }),
    [records, lineId, productId, reasonId, productSort],
  );
  const searchedReasons = analytics.reasons
    .filter((reason) => !reasonSearch.trim() || reason.name.toLocaleLowerCase().includes(reasonSearch.trim().toLocaleLowerCase()))
    .sort((a, b) => reasonOrder === 'desc' ? b.count - a.count : a.count - b.count);
  const limitedReasons = reasonLimit === 'all' ? searchedReasons : searchedReasons.slice(0, Number(reasonLimit));
  const paretoReasons = analytics.reasons;
  const heatLines = [...new Map(records
    .filter((record) => (!lineId || record.lineId === lineId) && (!productId || record.productId === productId))
    .map((record) => [record.lineId || `name:${record.lineName}`, record.lineName])).entries()];
  const heatProducts = [...new Map(records
    .filter((record) => (!lineId || record.lineId === lineId) && (!productId || record.productId === productId))
    .map((record) => [
      record.productId || `name:${record.productCode || record.productName}`,
      record.productCode ? `${record.productName} (${record.productCode})` : record.productName,
    ])).entries()];
  const heatCellMap = new Map(analytics.heatmap.map((cell) => [`${cell.lineKey}|${cell.productKey}`, cell]));

  const resetFilters = () => {
    const range = monthRange(currentMonth());
    setMonth(currentMonth());
    setFrom(range.from);
    setTo(range.to);
    setLineId('');
    setProductId('');
    setReasonId('');
    setProductSort('defects');
    setReasonSearch('');
    setReasonLimit('15');
    setReasonOrder('desc');
  };

  const exportCsv = () => {
    const rows = [
      ['خط الإنتاج', 'اسم المنتج', 'كود المنتج', 'مرات الفحص', 'إجمالي المفحوص', 'إجمالي العيوب', 'نسبة العيوب %'],
      ...analytics.lineProducts.map((row) => [
        row.lineName || '',
        row.productName || '',
        row.code || '',
        row.inspectionCount,
        row.sampleCount,
        row.defectCount,
        row.defectRate.toFixed(2),
      ]),
      ['الإجمالي العام', '', '', analytics.inspectionCount, analytics.sampleCount, analytics.defectCount, analytics.defectRate.toFixed(2)],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `quality-${from}-${to}.csv`);
  };

  return (
    <QmsPage title="لوحة تحليلات الجودة" subtitle="تجميع موحد لفحص البالتات، والعينات الساعية، وسحب عينات الخطوط." actions={
      can('quality.reports.export')
        ? <button type="button" className="qms-btn qms-btn-primary" disabled={loading || analytics.lineProducts.length === 0} onClick={exportCsv}>تصدير CSV</button>
        : undefined
    }>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">الشهر</span><input className="qms-input" type="month" value={month} onChange={(event) => {
            setMonth(event.target.value);
            if (event.target.value) {
              const range = monthRange(event.target.value);
              setFrom(range.from);
              setTo(range.to);
            }
          }} /></label>
          <label><span className="qms-label">من تاريخ</span><input className="qms-input" type="date" value={from} onChange={(event) => { setMonth(''); setFrom(event.target.value); }} /></label>
          <label><span className="qms-label">إلى تاريخ</span><input className="qms-input" type="date" value={to} onChange={(event) => { setMonth(''); setTo(event.target.value); }} /></label>
          <MasterSelect label="خط الإنتاج" value={lineId} onChange={setLineId} placeholder="كل الخطوط" options={masters.lines.map((line) => ({ value: line.id || '', label: line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="كل المنتجات" options={masters.products.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <MasterSelect label="سبب العيب" value={reasonId} onChange={setReasonId} placeholder="كل الأسباب" options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))} />
          <button type="button" className="qms-btn qms-btn-ghost" onClick={resetFilters}>إعادة ضبط الفلاتر</button>
        </div>
      </section>

      {error ? <div className="qms-card qms-error" role="alert">{error}</div> : null}
      {loading ? <div className="qms-card" role="status">جاري تحميل بيانات التحليلات...</div> : null}

      <section className="qms-kpis qms-analytics-kpis">
        <div className="qms-card qms-kpi"><span>إجمالي العينات المفحوصة</span><strong>{formatNumber(analytics.sampleCount)}</strong></div>
        <div className="qms-card qms-kpi"><span>إجمالي العيوب</span><strong>{formatNumber(analytics.defectCount)}</strong></div>
        <div className="qms-card qms-kpi"><span>النسبة العامة للعيوب</span><strong>{analytics.defectRate.toFixed(2)}٪</strong></div>
        <div className="qms-card qms-kpi"><span>مرات ظهور أسباب العيوب</span><strong>{formatNumber(analytics.defectOccurrenceCount)}</strong></div>
        <div className="qms-card qms-kpi"><span>أفضل خط (حد أدنى 30 عينة)</span><strong>{analytics.bestLine?.name || 'لا توجد بيانات كافية'}</strong></div>
        <div className="qms-card qms-kpi"><span>أفضل منتج</span><strong>{analytics.bestProduct?.name || '—'}</strong></div>
        <div className="qms-card qms-kpi"><span>أكثر عيب تكرارًا</span><strong>{analytics.reasons[0]?.name || '—'}</strong><small>{analytics.reasons[0] ? `${formatNumber(analytics.reasons[0].count)} (${(analytics.reasons[0].share * 100).toFixed(1)}٪)` : ''}</small></div>
        <div className="qms-card qms-kpi"><span>أقل عيب تكرارًا</span><strong>{analytics.reasons[analytics.reasons.length - 1]?.name || '—'}</strong><small>{analytics.reasons[analytics.reasons.length - 1] ? formatNumber(analytics.reasons[analytics.reasons.length - 1].count) : ''}</small></div>
      </section>

      <section className="qms-card qms-chart-card">
        <h2 className="qms-title">إجمالي العينات والعيوب</h2>
        <div className="qms-chart">
          <TotalInspectionsCanvas
            sampleCount={analytics.sampleCount}
            defectCount={analytics.defectCount}
            defectRate={analytics.defectRate}
          />
        </div>
      </section>

      <section className="qms-card qms-chart-card">
        <div className="qms-row qms-chart-heading">
          <h2 className="qms-title">مقارنة المنتجات</h2>
          <label><span className="qms-label">الترتيب</span><select className="qms-input" value={productSort} onChange={(event) => setProductSort(event.target.value as ProductChartSort)}>
            <option value="defects">الأعلى في العيوب</option><option value="rate">الأعلى في النسبة</option><option value="samples">الأكبر في العينات</option><option value="fewest-defects">الأقل في العيوب</option>
          </select></label>
        </div>
        <div className="qms-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.products} margin={{ top: 16, right: 16, left: 8, bottom: 56 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval="preserveStartEnd" angle={-25} textAnchor="end" height={64} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="sampleCount" name="العينات" fill="#4f46e5" />
              <Bar dataKey="defectCount" name="العيوب" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="qms-card qms-chart-card">
        <div className="qms-row qms-chart-heading">
          <h2 className="qms-title">تكرار العيوب المسجلة</h2>
          <label><span className="qms-label">بحث عن عيب</span><input className="qms-input" value={reasonSearch} onChange={(event) => setReasonSearch(event.target.value)} /></label>
          <label><span className="qms-label">عدد الأسباب</span><select className="qms-input" value={reasonLimit} onChange={(event) => setReasonLimit(event.target.value as typeof reasonLimit)}>
            <option value="15">أعلى 15</option><option value="20">أعلى 20</option><option value="30">أعلى 30</option><option value="all">الكل</option>
          </select></label>
          <label><span className="qms-label">الترتيب</span><select className="qms-input" value={reasonOrder} onChange={(event) => setReasonOrder(event.target.value as typeof reasonOrder)}>
            <option value="desc">تنازلي</option><option value="asc">تصاعدي</option>
          </select></label>
        </div>
        <div className="qms-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={limitedReasons} margin={{ top: 28, right: 16, left: 8, bottom: 68 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval="preserveStartEnd" angle={-30} textAnchor="end" height={76} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="مرات التكرار" fill="#dc2626" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="count" position="top" fill="#991b1b" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="qms-card qms-chart-card">
        <h2 className="qms-title">تحليل باريتو — مبدأ 80/20</h2>
        <p className="qms-muted">أول {paretoTopCauseCount(paretoReasons)} سببًا يفسّر 80٪ من مرات ظهور العيوب ضمن النطاق.</p>
        <div className="qms-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={paretoReasons} margin={{ top: 16, right: 18, left: 8, bottom: 68 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval="preserveStartEnd" angle={-30} textAnchor="end" height={76} />
              <YAxis yAxisId="count" allowDecimals={false} />
              <YAxis yAxisId="share" orientation="right" domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}٪`} />
              <Tooltip formatter={(value, name) => name === 'النسبة التراكمية' ? `${(Number(value) * 100).toFixed(1)}٪` : formatNumber(Number(value))} />
              <Legend />
              <ReferenceLine yAxisId="share" y={0.8} stroke="#2563eb" strokeDasharray="4 4" />
              <Bar yAxisId="count" dataKey="count" name="مرات التكرار" fill="#dc2626" />
              <Line yAxisId="share" dataKey="cumulativeShare" name="النسبة التراكمية" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="qms-card qms-heatmap-card">
        <h2 className="qms-title">خريطة حرارة الخطوط والمنتجات</h2>
        <div className="qms-table-wrap">
          <table className="qms-table qms-heatmap">
            <thead><tr><th>خط الإنتاج</th>{heatProducts.map(([key, name]) => <th key={key}>{name}</th>)}</tr></thead>
            <tbody>
              {heatLines.map(([lineKey, name]) => (
                <tr key={lineKey}>
                  <th scope="row">{name}</th>
                  {heatProducts.map(([productKey]) => {
                    const cell = heatCellMap.get(`${lineKey}|${productKey}`);
                    const backgroundColor = cell ? heatmapColor(cell.defectRate) : '#e2e8f0';
                    const title = cell
                      ? `${formatNumber(cell.sampleCount)} مفحوص، ${formatNumber(cell.defectCount)} عيب، ${cell.defectRate.toFixed(2)}٪`
                      : 'لا توجد بيانات';
                    return <td key={productKey} title={title} aria-label={`${name}، ${title}`} style={{ backgroundColor, color: cell && cell.defectRate >= 10 ? '#fff' : '#1e293b', textAlign: 'center', fontWeight: 700 }}>
                      {cell ? `${cell.defectRate.toFixed(1)}٪` : '—'}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="qms-muted">الأخضر: أقل من 1٪، الأصفر: 1–أقل من 5٪، البرتقالي: 5–أقل من 10٪، الأحمر الداكن: 10٪ فأكثر.</p>
      </section>

      <section className="qms-card qms-table-wrap">
        <h2 className="qms-title">مقارنة الخطوط والمنتجات</h2>
        <table className="qms-table">
          <thead><tr><th>خط الإنتاج</th><th>اسم المنتج</th><th>الكود</th><th>مرات الفحص</th><th>إجمالي المفحوص</th><th>إجمالي العيوب</th><th>نسبة العيوب %</th></tr></thead>
          <tbody>
            {analytics.lineProducts.map((row) => (
              <tr key={row.key}>
                <td>{row.lineName}</td><td>{row.productName}</td><td>{row.code || '—'}</td>
                <td>{formatNumber(row.inspectionCount)}</td><td>{formatNumber(row.sampleCount)}</td><td>{formatNumber(row.defectCount)}</td><td>{row.defectRate.toFixed(2)}٪</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="qms-total-row"><th>الإجمالي العام</th><td>—</td><td>—</td><td>{formatNumber(analytics.inspectionCount)}</td><td>{formatNumber(analytics.sampleCount)}</td><td>{formatNumber(analytics.defectCount)}</td><td>{analytics.defectRate.toFixed(2)}٪</td></tr></tfoot>
        </table>
        {!loading && analytics.inspectionCount === 0 ? <p className="qms-muted">لا توجد فحوصات مكتملة في هذا النطاق.</p> : null}
      </section>
    </QmsPage>
  );
};
