import { employeeService } from '../../hr/employeeService';
import { roleService } from './roleService';
import { userService } from '../../../services/userService';
import { deleteUserHard, updateUserCredentialsHard } from '../../auth/services/firebase';
import { repairBranchService } from '../../repair/services/repairBranchService';
import type { FirestoreEmployee, FirestoreRole, FirestoreUser } from '../../../types';

export interface UserManagementRow {
  user: FirestoreUser;
  employee: FirestoreEmployee | null;
  role: FirestoreRole | null;
}

function hasNonEmptyId(value: string | undefined): value is string {
  return Boolean(value && value.trim());
}

export const userManagementService = {
  async getRows(): Promise<UserManagementRow[]> {
    const [users, employees, roles] = await Promise.all([
      userService.getAll(),
      employeeService.getAll(),
      roleService.getAll(),
    ]);
    const employeeByUserId = new Map<string, FirestoreEmployee>();
    employees.forEach((employee) => {
      if (!hasNonEmptyId(employee.userId)) return;
      employeeByUserId.set(employee.userId, employee);
    });
    const roleById = new Map<string, FirestoreRole>();
    roles.forEach((role) => {
      if (!hasNonEmptyId(role.id)) return;
      roleById.set(role.id, role);
    });

    return users.map((user) => {
      const userId = String(user.id || '').trim();
      const employee = userId ? employeeByUserId.get(userId) ?? null : null;
      const roleId = String(user.roleId || '').trim();
      const role = roleById.get(roleId) ?? null;
      return { user, employee, role };
    });
  },

  async linkUserToEmployee(userId: string, employeeId: string): Promise<void> {
    const [user, selectedEmployee, linkedEmployee] = await Promise.all([
      userService.get(userId),
      employeeService.getById(employeeId),
      employeeService.getByUserId(userId),
    ]);
    if (!user) throw new Error('المستخدم غير موجود.');
    if (!selectedEmployee?.id) throw new Error('الموظف غير موجود.');

    if (selectedEmployee.userId && selectedEmployee.userId !== userId) {
      throw new Error('هذا الموظف مرتبط بالفعل بمستخدم آخر.');
    }

    if (linkedEmployee?.id && linkedEmployee.id !== selectedEmployee.id) {
      await employeeService.update(linkedEmployee.id, {
        userId: '',
        email: '',
        hasSystemAccess: false,
      });
    }

    await employeeService.update(selectedEmployee.id, {
      userId,
      email: user.email,
      hasSystemAccess: true,
    });
  },

  async unlinkUserFromEmployee(userId: string): Promise<void> {
    const employee = await employeeService.getByUserId(userId);
    if (!employee?.id) return;
    await employeeService.update(employee.id, {
      userId: '',
      email: '',
      hasSystemAccess: false,
    });
  },

  async updateUserRole(userId: string, roleId: string): Promise<void> {
    await userService.updateRoleId(userId, roleId);
  },

  /**
   * Bind inventory warehouse; if it belongs to a repair branch, also set repairBranchId
   * so repair + inventory pages stay aligned (ADR-004).
   */
  async updateInventoryWarehouseId(userId: string, warehouseId: string | null): Promise<void> {
    const nextWarehouseId = String(warehouseId || '').trim() || null;
    const previous = await userService.get(userId);
    const previousWarehouseId = String(previous?.inventoryWarehouseId || '').trim() || null;

    await userService.updateInventoryWarehouseId(userId, nextWarehouseId);

    if (nextWarehouseId) {
      const branch = await repairBranchService.findByWarehouseId(nextWarehouseId);
      if (branch?.id) {
        await userService.update(userId, {
          repairBranchId: branch.id,
          repairBranchIds: [branch.id],
        } as Partial<FirestoreUser>);
      }
      return;
    }

    // Clearing warehouse: clear repair branch only if it pointed at the previous warehouse's branch.
    if (!previousWarehouseId) return;
    const previousBranch = await repairBranchService.findByWarehouseId(previousWarehouseId);
    const previousBranchId = String(previousBranch?.id || '').trim();
    if (!previousBranchId) return;
    const currentBranchId = String((previous as FirestoreUser & { repairBranchId?: string })?.repairBranchId || '').trim();
    if (currentBranchId && currentBranchId !== previousBranchId) return;
    await userService.update(userId, {
      repairBranchId: '',
      repairBranchIds: [],
    } as Partial<FirestoreUser>);
  },

  async toggleUserActive(userId: string, isActive: boolean): Promise<void> {
    await userService.toggleActive(userId, isActive);
  },

  async hardDeleteUser(userId: string): Promise<void> {
    await deleteUserHard(userId);
  },

  async updateUserCredentials(
    userId: string,
    input: { email?: string; password?: string },
  ): Promise<void> {
    const email = String(input.email || '').trim();
    const password = String(input.password || '').trim();
    if (!email && !password) {
      throw new Error('أدخل بريدًا جديدًا أو كلمة مرور جديدة.');
    }
    await updateUserCredentialsHard({
      targetUid: userId,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
    });
  },
};
