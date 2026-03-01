import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { reportService } from '../../production/services/reportService';
import type {
  MonthlyProductionCost,
  CostCenter,
  CostCenterValue,
  CostAllocation,
} from '../../../types';
import { calculateDailyIndirectCost } from '../../../utils/costCalculations';

const COLLECTION = 'monthly_production_costs';

function docId(productId: string, month: string): string {
  return `${productId}_${month}`;
}

export const monthlyProductionCostService = {
  async getByProduct(productId: string): Promise<MonthlyProductionCost[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('productId', '==', productId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MonthlyProductionCost))
        .sort((a, b) => b.month.localeCompare(a.month));
    } catch (error) {
      console.error('monthlyProductionCostService.getByProduct error:', error);
      throw error;
    }
  },

  async getByMonth(month: string): Promise<MonthlyProductionCost[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('month', '==', month));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MonthlyProductionCost))
        .sort((a, b) => a.productId.localeCompare(b.productId));
    } catch (error) {
      console.error('monthlyProductionCostService.getByMonth error:', error);
      throw error;
    }
  },

  async getByProductAndMonth(productId: string, month: string): Promise<MonthlyProductionCost | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, docId(productId, month)));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as MonthlyProductionCost;
    } catch (error) {
      console.error('monthlyProductionCostService.getByProductAndMonth error:', error);
      throw error;
    }
  },

  async calculate(
    productId: string,
    month: string,
    hourlyRate: number,
    costCenters: CostCenter[],
    costCenterValues: CostCenterValue[],
    costAllocations: CostAllocation[],
    supervisorHourlyRates?: Map<string, number>,
  ): Promise<MonthlyProductionCost | null> {
    if (!isConfigured) return null;

    const existing = await this.getByProductAndMonth(productId, month);
    if (existing?.isClosed) return existing;

    const startDate = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const allReports = await reportService.getByDateRange(startDate, endDate);
    const productReports = allReports.filter((r) => r.productId === productId);

    if (productReports.length === 0) {
      const emptyDoc: Omit<MonthlyProductionCost, 'id'> = {
        productId,
        month,
        totalProducedQty: 0,
        totalProductionCost: 0,
        averageUnitCost: 0,
        isClosed: false,
        calculatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, COLLECTION, docId(productId, month)), emptyDoc);
      return { id: docId(productId, month), ...emptyDoc };
    }

    const lineDateQtyTotals = new Map<string, number>();
    const lineDateHoursTotals = new Map<string, number>();
    allReports.forEach((r) => {
      const key = `${r.lineId}_${r.date}`;
      lineDateQtyTotals.set(key, (lineDateQtyTotals.get(key) || 0) + (r.quantityProduced || 0));
      lineDateHoursTotals.set(key, (lineDateHoursTotals.get(key) || 0) + Math.max(0, r.workHours || 0));
    });

    const indirectCache = new Map<string, number>();
    let totalLabor = 0;
    let totalIndirect = 0;
    let totalQty = 0;

    for (const r of productReports) {
      if (!r.quantityProduced || r.quantityProduced <= 0) continue;

      totalLabor += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
      totalQty += r.quantityProduced;

      const rMonth = r.date?.slice(0, 7) || month;
      const cacheKey = `${r.lineId}_${rMonth}`;
      if (!indirectCache.has(cacheKey)) {
        indirectCache.set(
          cacheKey,
          calculateDailyIndirectCost(r.lineId, rMonth, costCenters, costCenterValues, costAllocations),
        );
      }
      const lineIndirect = indirectCache.get(cacheKey) || 0;
      const lineDateKey = `${r.lineId}_${r.date}`;
      const lineDateTotalHours = lineDateHoursTotals.get(lineDateKey) || 0;
      const reportHours = Math.max(0, r.workHours || 0);
      if (lineDateTotalHours > 0 && reportHours > 0) {
        totalIndirect += lineIndirect * (reportHours / lineDateTotalHours);
      } else {
        const lineDateTotalQty = lineDateQtyTotals.get(lineDateKey) || 0;
        if (lineDateTotalQty > 0) {
          totalIndirect += lineIndirect * (r.quantityProduced / lineDateTotalQty);
        }
      }
      totalIndirect += (supervisorHourlyRates?.get(r.employeeId) || 0) * (r.workHours || 0);
    }

    const totalCost = totalLabor + totalIndirect;
    const avgUnitCost = totalQty > 0 ? totalCost / totalQty : 0;

    const record: Omit<MonthlyProductionCost, 'id'> = {
      productId,
      month,
      totalProducedQty: totalQty,
      totalProductionCost: totalCost,
      averageUnitCost: avgUnitCost,
      isClosed: false,
      calculatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, COLLECTION, docId(productId, month)), record);
    return { id: docId(productId, month), ...record };
  },

  async calculateAll(
    productIds: string[],
    month: string,
    hourlyRate: number,
    costCenters: CostCenter[],
    costCenterValues: CostCenterValue[],
    costAllocations: CostAllocation[],
    supervisorHourlyRates?: Map<string, number>,
  ): Promise<MonthlyProductionCost[]> {
    const results: MonthlyProductionCost[] = [];
    for (const pid of productIds) {
      const result = await this.calculate(
        pid,
        month,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
        supervisorHourlyRates,
      );
      if (result) results.push(result);
    }
    return results;
  },

  async closeMonth(productId: string, month: string): Promise<void> {
    if (!isConfigured) return;
    const id = docId(productId, month);
    const existing = await this.getByProductAndMonth(productId, month);
    if (!existing) return;
    await setDoc(
      doc(db, COLLECTION, id),
      { ...existing, isClosed: true, calculatedAt: serverTimestamp() },
      { merge: true },
    );
  },

  async closeMonthForAll(productIds: string[], month: string): Promise<void> {
    for (const pid of productIds) {
      await this.closeMonth(pid, month);
    }
  },
};
