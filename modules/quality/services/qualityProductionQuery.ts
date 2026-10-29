import { getDocs, query, where } from 'firebase/firestore';
import { collection } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { activeTenantId, assertQualityPermission, requireQualityDb } from './qualityGateway';
import type { ProductionQuantityRow } from '../domain/productionQuantity';

export const qualityProductionQuery = {
  async quantitiesForDate(date: string): Promise<ProductionQuantityRow[]> {
    assertQualityPermission('quality.reports.view');
    requireQualityDb();
    const snap = await getDocs(query(
      collection(db, 'production_reports'),
      where('tenantId', '==', activeTenantId()),
      where('date', '==', date),
    ));
    return snap.docs.map((item) => {
      const data = item.data();
      return {
        date: String(data.date || ''),
        lineId: String(data.lineId || ''),
        productId: String(data.productId || ''),
        quantityProduced: Number(data.quantityProduced || 0),
      };
    });
  },

  async quantitiesForRange(from: string, to: string): Promise<ProductionQuantityRow[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      throw new Error('نطاق التاريخ غير صالح.');
    }
    const days: string[] = [];
    let cursor = from;
    while (cursor <= to) {
      days.push(cursor);
      if (days.length > 31) throw new Error('نطاق المخطط 31 يوماً كحد أقصى.');
      const [year, month, day] = cursor.split('-').map(Number);
      const next = new Date(year, month - 1, day + 1);
      cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }
    const batches = await Promise.all(days.map((day) => this.quantitiesForDate(day)));
    return batches.flat();
  },
};
