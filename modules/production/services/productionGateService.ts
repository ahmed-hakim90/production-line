import { getDocs, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsClient, isConfigured } from '../../auth/services/firebase';
import { auth } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';

export type ProductionGateStatus = 'open' | 'completed' | 'auto_closed' | 'cancelled';

export interface ProductionGateSession {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  exitAt: any;
  entryAt?: any | null;
  durationMinutes?: number | null;
  status: ProductionGateStatus;
}

export interface GateActionResult {
  action: 'exit' | 'entry';
  sessionId: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  actionAt: string;
  durationMinutes: number | null;
}

export interface GateEmployeePreview {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  currentStatus: 'inside' | 'outside';
  nextAction: 'exit' | 'entry';
  exitAt: string | null;
  currentDurationMinutes: number;
  todayExitCount: number;
  registrationAllowed: boolean;
}

export interface GateEmployeeCacheResult { employees: GateEmployeePreview[]; syncedAt: string }

const requireFirebase = () => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase غير مهيأ.');
  return functionsClient;
};

const friendlyError = (error: unknown, fallback: string) => {
  const message = String((error as { message?: string })?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  return new Error(message && !message.toLowerCase().includes('internal') ? message : fallback);
};

export const productionGateService = {
  cacheScope(): string { return auth?.currentUser?.uid || 'signed-out'; },

  async syncEmployeeCache(): Promise<GateEmployeeCacheResult> {
    try {
      const callable = httpsCallable<Record<string, never>, GateEmployeeCacheResult>(requireFirebase(), 'syncProductionGateEmployeeCache');
      return (await callable({})).data;
    } catch (error) {
      throw friendlyError(error, 'تعذر تحديث كاش العمال.');
    }
  },
  async preview(employeeCode: string): Promise<GateEmployeePreview> {
    try {
      const callable = httpsCallable<{ employeeCode: string }, GateEmployeePreview>(requireFirebase(), 'previewProductionGateEmployee');
      return (await callable({ employeeCode: employeeCode.trim() })).data;
    } catch (error) {
      throw friendlyError(error, 'تعذر تحميل بيانات الموظف.');
    }
  },

  async register(employeeCode: string, employeeId?: string, event?: { eventId: string; occurredAt: string; expectedAction: 'exit' | 'entry' }): Promise<GateActionResult> {
    try {
      const callable = httpsCallable<{ employeeCode: string; employeeId?: string; eventId?: string; occurredAt?: string; expectedAction?: 'exit' | 'entry' }, GateActionResult>(requireFirebase(), 'registerProductionGateAction');
      return (await callable({ employeeCode: employeeCode.trim(), employeeId, ...event })).data;
    } catch (error) {
      throw friendlyError(error, 'تعذر تسجيل الحركة.');
    }
  },

  async list(startDate: string, endDate: string): Promise<ProductionGateSession[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(tenantQuery(db, 'production_gate_sessions',
      where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), orderBy('exitAt', 'desc')));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() } as ProductionGateSession));
  },

  async correct(input: { sessionId: string; exitAt?: string; entryAt?: string | null; reason: string; cancel?: boolean }): Promise<void> {
    try {
      const callable = httpsCallable<typeof input, { ok: true }>(requireFirebase(), 'correctProductionGateSession');
      await callable(input);
    } catch (error) {
      throw friendlyError(error, 'تعذر تصحيح الحركة.');
    }
  },
};
