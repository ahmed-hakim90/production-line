import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../modules/auth/services/firebase';

const ROOT_COLLECTION = 'dashboardStats';
const TENANT_ID = 'global';
const DAILY_COLLECTION = 'daily';
const MAX_RANGE_DAYS = 370;

type DashboardTotals = {
  totalProduction: number;
  totalWaste: number;
  totalCost: number;
  reportsCount: number;
};

const normalizeNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const dashboardStatsService = {
  async getRangeTotals(startDate: string, endDate: string): Promise<DashboardTotals> {
    if (!isConfigured) {
      return { totalProduction: 0, totalWaste: 0, totalCost: 0, reportsCount: 0 };
    }
    const q = query(
      collection(db, ROOT_COLLECTION, TENANT_ID, DAILY_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      limit(MAX_RANGE_DAYS),
    );
    const snap = await getDocs(q);
    return snap.docs.reduce<DashboardTotals>((acc, row) => {
      const data = row.data() as Record<string, unknown>;
      acc.totalProduction += normalizeNumber(data.totalProduction);
      acc.totalWaste += normalizeNumber(data.totalWaste);
      acc.totalCost += normalizeNumber(data.totalCost);
      acc.reportsCount += normalizeNumber(data.reportsCount);
      return acc;
    }, {
      totalProduction: 0,
      totalWaste: 0,
      totalCost: 0,
      reportsCount: 0,
    });
  },
};
