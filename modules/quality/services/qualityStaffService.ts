import { getDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { checkPermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '@/modules/hr/employeeService';
import { userManagementService } from '@/modules/system/services/userManagementService';
import { userService } from '@/services/userService';
import type { FirestoreEmployee } from '@/types';
import type { QualityStaffAssignment } from '../model';
import {
  assertStaffDraft,
  inspectorMayBeSelected,
  staffAssignmentDocId,
  type StaffEmployeeRef,
} from '../domain/staff';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertAnyQualityPermission,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenant,
  qmsDoc,
  qualityTimestamps,
  stampTenant,
} from './qualityGateway';

type TenantEmployee = FirestoreEmployee & { tenantId?: string };

const asEmployeeRef = (employee: TenantEmployee): StaffEmployeeRef => ({
  id: employee.id || '',
  tenantId: employee.tenantId,
  name: employee.name,
  isActive: employee.isActive === true,
  userId: employee.userId,
});

async function loadEmployee(employeeId: string): Promise<TenantEmployee> {
  const employee = await employeeService.getById(employeeId) as TenantEmployee | null;
  if (!employee?.id) throw new Error('الموظف غير موجود في سجل الموظفين.');
  if (employee.tenantId !== activeTenantId()) throw new Error('لا يمكن ربط موظف من شركة أخرى.');
  return employee;
}

async function assertOwnedRefs(ids: string[], collectionName: string): Promise<void> {
  const tenantId = activeTenantId();
  for (const id of ids) {
    const snap = collectionName === 'production_lines'
      ? await getDoc(doc(db, collectionName, id))
      : await getDoc(qmsDoc(collectionName, id));
    if (!snap.exists() || String(snap.data()?.tenantId || '') !== tenantId) {
      throw new Error('أحد الخطوط أو المحطات لا يتبع الشركة الحالية.');
    }
  }
}

export const qualityStaffService = {
  async list(): Promise<QualityStaffAssignment[]> {
    assertAnyQualityPermission([
      'quality.workers.view',
      'quality.pallets.inspect',
      'quality.samples.inspect',
      'quality.settings.view',
      'quality.settings.manage',
    ]);
    const rows = await listByTenant<QualityStaffAssignment>(QMS_COLLECTIONS.WORKERS, activeTenantId());
    return rows.filter((row) => row.tenantId === activeTenantId());
  },

  async save(input: {
    employeeId: string;
    stationIds: string[];
    lineIds: string[];
    isActive: boolean;
    userId?: string;
  }): Promise<void> {
    assertQualityPermission('quality.workers.manage');
    const draft = assertStaffDraft(input);
    const tenantId = activeTenantId();
    const employee = await loadEmployee(draft.employeeId);
    const id = staffAssignmentDocId(tenantId, employee.id || '');
    const existingSnap = await getDoc(qmsDoc(QMS_COLLECTIONS.WORKERS, id));
    if (!employee.isActive && (!existingSnap.exists() || draft.isActive)) {
      throw new Error('لا يمكن تعيين موظف موقوف على فحص جديد.');
    }
    await assertOwnedRefs(draft.stationIds, QMS_COLLECTIONS.STATIONS);
    await assertOwnedRefs(draft.lineIds, 'production_lines');
    let userId = String(employee.userId || '').trim();
    if (draft.userId && draft.userId !== userId) {
      if (!checkPermission(useAppStore.getState().userPermissions, 'employees.edit')) {
        throw new Error('ربط الحساب يتم من المستخدمين ويتطلب صلاحية تعديل الموظفين.');
      }
      const user = await userService.get(draft.userId);
      if (!user || user.tenantId !== tenantId || user.isActive !== true) {
        throw new Error('الحساب المختار غير نشط داخل الشركة.');
      }
      await userManagementService.linkUserToEmployee(draft.userId, employee.id || '');
      userId = draft.userId;
    }
    if (userId) {
      const linked = await userService.get(userId);
      if (!linked || linked.tenantId !== tenantId) throw new Error('الحساب المرتبط بالموظف لا يتبع الشركة الحالية.');
    }
    const actor = currentQualityActor();
    const creating = !existingSnap.exists();
    await setDoc(qmsDoc(QMS_COLLECTIONS.WORKERS, id), stampTenant({
      employeeId: employee.id,
      employeeName: employee.name,
      userId,
      stationIds: draft.stationIds,
      lineIds: draft.lineIds,
      isActive: draft.isActive,
      ...qualityTimestamps(actor, creating),
    }), { merge: true });
    await auditQuality(
      creating ? 'QUALITY_CREATE_WORKER' : 'QUALITY_UPDATE_WORKER',
      creating ? `تعيين ${employee.name} في الجودة` : `تحديث تعيين ${employee.name}`,
      { employeeId: employee.id, isActive: draft.isActive },
    );
  },

  async deactivate(employeeId: string): Promise<void> {
    assertQualityPermission('quality.workers.manage');
    const tenantId = activeTenantId();
    const id = staffAssignmentDocId(tenantId, employeeId);
    const snap = await getDoc(qmsDoc(QMS_COLLECTIONS.WORKERS, id));
    if (!snap.exists() || snap.data()?.tenantId !== tenantId) throw new Error('التعيين غير موجود.');
    const actor = currentQualityActor();
    await setDoc(qmsDoc(QMS_COLLECTIONS.WORKERS, id), {
      isActive: false,
      ...qualityTimestamps(actor, false),
    }, { merge: true });
    await auditQuality('QUALITY_UPDATE_WORKER', 'إيقاف تعيين جودة دون حذف الموظف', { employeeId });
  },

  async requireSelectableInspector(input: {
    employeeId: string;
    stationId?: string;
    lineId?: string;
    stationIsNew?: boolean;
  }): Promise<{ id: string; name: string }> {
    const tenantId = activeTenantId();
    const employee = await loadEmployee(input.employeeId);
    const assignmentSnap = await getDoc(qmsDoc(QMS_COLLECTIONS.WORKERS, staffAssignmentDocId(tenantId, employee.id || '')));
    const assignment = assignmentSnap.exists()
      ? { id: assignmentSnap.id, ...assignmentSnap.data() } as QualityStaffAssignment
      : null;
    if (!inspectorMayBeSelected({
      tenantId,
      employee: asEmployeeRef(employee),
      assignment,
      stationId: input.stationId,
      lineId: input.lineId,
      stationIsNew: input.stationIsNew,
    })) {
      throw new Error('المراقب المختار ليس تعييناً نشطاً في الجودة لهذه المحطة أو الخط.');
    }
    return { id: employee.id || '', name: employee.name };
  },
};
