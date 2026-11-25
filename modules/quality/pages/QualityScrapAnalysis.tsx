import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildScrapBoard, type QuantityShare } from '../domain/scrapAnalysis';
import { monthBounds } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySecondSortReturnService } from '../services/qualityCatalogService';
import { qualityScrapService, qualitySecondSortService } from '../services/qualitySecondSortService';

function ShareTable({ title, rows, discount }: { title: string; rows: QuantityShare[]; discount?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  return (
    <section className="qms-card" style={{ marginTop: 12 }}>
      <h2 className="qms-label">{title}</h2>
      {rows.length === 0 ? <p>لا توجد كميات في هذا النطاق.</p> : (
        <table className="qms-table">
          <thead><tr><th>الترتيب</th><th>البند</th><th>الكمية</th><th>النسبة</th><th>عدد التقارير</th>{discount ? <th>متوسط الخصم</th> : null}</tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const share = total > 0 ? Number(((row.quantity / total) * 100).toFixed(2)) : null;
              return (
                <tr key={row.label}>
                  <td>{index + 1}</td><td>{row.label}</td><td>{row.quantity}</td><td>{share ?? '—'}٪</td><td>{row.count}</td>
                  {discount ? <td>{row.averageDiscount ?? '—'}٪</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const QualityScrapAnalysis: React.FC = () => {
  const [month, setMonth] = useState(localDateIso().slice(0, 7));
  const [board, setBoard] = useState<ReturnType<typeof buildScrapBoard> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const range = monthBounds(month);
      const loadList = async <T,>(work: Promise<T[]>): Promise<T[]> => {
        try {
          return await work;
        } catch (error: unknown) {
          toast.error(qualityUserMessage(error, 'تعذر تحميل جزء من التحليل'));
          return [];
        }
      };
      const [scrap, handovers, returns] = await Promise.all([
        loadList(qualityScrapService.listRange(range.from, range.to)),
        loadList(qualitySecondSortService.listRange(range.from, range.to)),
        loadList(qualitySecondSortReturnService.listRange(range.from, range.to)),
      ]);
      if (cancelled) return;
      setBoard(buildScrapBoard({
        scrap: scrap.map((row) => ({
          lineName: row.lineName,
          productName: row.productName,
          reasonLabel: row.reasonLabel,
          quantity: row.quantity,
          periods: row.periods,
        })),
        handovers: handovers.map((row) => ({
          productName: row.productName,
          quantity: row.quantity,
          discountPercent: row.discountPercent,
          reasonName: row.reasonName,
          problem: row.problem,
        })),
        returns: returns.map((row) => ({ productName: row.productName, notes: row.notes, quantity: row.quantity })),
      }));
    })().catch((error: unknown) => {
      if (!cancelled) toast.error(qualityUserMessage(error, 'تعذر تحميل تحليل الهالك'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [month]);

  return (
    <section>
      <label><span className="qms-label">شهر التحليل</span><input className="qms-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      {loading ? <p>جارٍ تحميل التحليل.</p> : null}
      {board ? (
        <>
          <div className="qms-kpis" style={{ marginTop: 12 }}>
            <div className="qms-card qms-kpi"><span>كمية الهالك</span><strong>{board.scrapQuantity}</strong></div>
            <div className="qms-card qms-kpi"><span>كمية الفرز الثاني</span><strong>{board.handoverQuantity}</strong></div>
            <div className="qms-card qms-kpi"><span>متوسط الخصم</span><strong>{board.averageDiscount ?? '—'}٪</strong></div>
            <div className="qms-card qms-kpi"><span>كمية الإرجاع</span><strong>{board.returnQuantity}</strong></div>
          </div>
          <ShareTable title="الهالك حسب السبب" rows={board.byReason} />
          <ShareTable title="الهالك حسب المنتج" rows={board.byProduct} />
          <ShareTable title="الهالك حسب الخط" rows={board.byLine} />
          <ShareTable title="الفرز الثاني حسب السبب" rows={board.sortByReason} discount />
          <ShareTable title="الفرز الثاني حسب المنتج" rows={board.sortByProduct} discount />
          <section className="qms-card" style={{ marginTop: 12 }}>
            <h2 className="qms-label">إرجاع الفرز الثاني</h2>
            {board.returnsByNote.length === 0 ? <p>لا توجد إرجاعات في هذا الشهر.</p> : (
              <table className="qms-table">
                <thead><tr><th>المنتج</th><th>الملاحظات</th><th>الكمية</th><th>التقارير</th></tr></thead>
                <tbody>
                  {board.returnsByNote.map((row) => (
                    <tr key={`${row.productName}-${row.notes}`}><td>{row.productName}</td><td>{row.notes || '—'}</td><td>{row.quantity}</td><td>{row.count}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
};
