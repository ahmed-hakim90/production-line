import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '../../../components/Toast';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { sparePartsService } from '../services/sparePartsService';
import { userService } from '../../../services/userService';
import { employeeService } from '../../hr/employeeService';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import type { RepairBranch } from '../types';

type BranchStats = {
  productsCount: number;
  techniciansCount: number;
  requestsCount: number;
};

export const RepairBranches: React.FC = () => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [rows, setRows] = useState<RepairBranch[]>([]);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [branchStats, setBranchStats] = useState<Record<string, BranchStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    isMain: false,
    managerEmployeeId: '',
    managerEmployeeName: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState('');
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeModalBranchId, setEmployeeModalBranchId] = useState('');
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeModalMode, setEmployeeModalMode] = useState<'new' | 'existingEmployee' | 'existingUser'>('new');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignAsBranchManager, setAssignAsBranchManager] = useState(true);
  const [techniciansModalOpen, setTechniciansModalOpen] = useState(false);
  const [techniciansModalBranchId, setTechniciansModalBranchId] = useState('');
  const [newEmployeeForm, setNewEmployeeForm] = useState({
    name: '',
    phone: '',
    code: '',
  });
  const [branchPendingDelete, setBranchPendingDelete] = useState<RepairBranch | null>(null);

  const loadBranches = async () => {
    setRows(await repairBranchService.list());
  };
  const loadUsers = async () => {
    const result = await userService.getAll();
    setUsers(result.filter((user) => user.isActive !== false));
  };
  const loadEmployees = async () => {
    const result = await employeeService.getAll();
    setEmployees(result.filter((employee) => employee.isActive !== false));
  };
  const loadBranchStats = async (sourceRows: RepairBranch[]) => {
    if (sourceRows.length === 0) {
      setBranchStats({});
      return;
    }
    setStatsLoading(true);
    try {
      const entries = await Promise.all(
        sourceRows.map(async (branch) => {
          const branchId = String(branch.id || '');
          if (!branchId) return null;
          const [stockRows, jobRows] = await Promise.all([
            sparePartsService.listStock(branchId),
            repairJobService.listByBranch(branchId),
          ]);
          return [
            branchId,
            {
              productsCount: stockRows.length,
              requestsCount: jobRows.length,
              techniciansCount: (branch.technicianIds || []).length,
            } satisfies BranchStats,
          ] as const;
        }),
      );
      const next = entries.reduce<Record<string, BranchStats>>((acc, entry) => {
        if (!entry) return acc;
        acc[entry[0]] = entry[1];
        return acc;
      }, {});
      setBranchStats(next);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, []);
  useEffect(() => {
    void loadUsers();
  }, []);
  useEffect(() => {
    void loadEmployees();
  }, []);
  useEffect(() => {
    void loadBranchStats(rows);
  }, [rows]);

  const create = async () => {
    if (!form.name) return;
    if (!form.managerEmployeeId) {
      toast.error('اختر المسؤول عن الفرع قبل الحفظ.');
      return;
    }
    await repairBranchService.create(form);
    toast.success('تمت إضافة الفرع.');
    setForm({
      name: '',
      phone: '',
      address: '',
      isMain: false,
      managerEmployeeId: '',
      managerEmployeeName: '',
    });
    setManagerFilter('');
    setBranchModalOpen(false);
    await loadBranches();
  };
  const save = async (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    if (!row.managerEmployeeId) {
      toast.error('اختر المسؤول عن الفرع قبل حفظ التعديلات.');
      return;
    }
    await repairBranchService.update(id, {
      name: row.name,
      phone: row.phone,
      address: row.address,
      isMain: row.isMain,
      managerEmployeeId: row.managerEmployeeId,
      managerEmployeeName: row.managerEmployeeName || '',
    });
    setEditingId(null);
    toast.success('تم تحديث الفرع.');
  };
  const remove = async () => {
    const id = branchPendingDelete?.id;
    if (!id) return;
    try {
      await repairBranchService.remove(id);
      toast.success('تم حذف الفرع.');
      await loadBranches();
      setBranchPendingDelete(null);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف الفرع.');
    }
  };
  const openAddEmployeeModal = (branchId: string) => {
    setEmployeeModalBranchId(branchId);
    setEmployeeModalMode('new');
    setSelectedEmployeeId('');
    setSelectedUserId('');
    setAssignAsBranchManager(true);
    setNewEmployeeForm({ name: '', phone: '', code: '' });
    setEmployeeModalOpen(true);
  };
  const handleCreateEmployee = async () => {
    const targetBranch = rows.find((branch) => String(branch.id || '') === employeeModalBranchId);
    if (!targetBranch) {
      toast.error('تعذر تحديد الفرع المستهدف.');
      return;
    }
    setEmployeeSaving(true);
    try {
      let employeeId: string | null = null;
      let employeeName = '';

      if (employeeModalMode === 'new') {
        if (!newEmployeeForm.name.trim()) {
          toast.error('أدخل اسم الموظف.');
          return;
        }
        employeeName = newEmployeeForm.name.trim();
        employeeId = await employeeService.create({
          name: employeeName,
          phone: newEmployeeForm.phone.trim(),
          code: newEmployeeForm.code.trim(),
          departmentId: '',
          jobPositionId: '',
          level: 1,
          managerId: '',
          employmentType: 'full_time',
          baseSalary: 0,
          hourlyRate: 0,
          shiftId: '',
          vehicleId: '',
          hasSystemAccess: false,
          isActive: true,
        });
      }

      if (employeeModalMode === 'existingEmployee') {
        if (!selectedEmployeeId) {
          toast.error('اختر موظفًا من القائمة.');
          return;
        }
        const selectedEmployee = employees.find((employee) => String(employee.id || '') === selectedEmployeeId);
        if (!selectedEmployee?.id) {
          toast.error('الموظف المحدد غير صالح.');
          return;
        }
        employeeId = String(selectedEmployee.id);
        employeeName = String(selectedEmployee.name || '');
      }

      if (employeeModalMode === 'existingUser') {
        if (!selectedUserId) {
          toast.error('اختر مستخدمًا من القائمة.');
          return;
        }
        const selectedUser = users.find((user) => String(user.id || '') === selectedUserId);
        if (!selectedUser?.id) {
          toast.error('المستخدم المحدد غير صالح.');
          return;
        }

        const existingEmployee = employees.find((employee) => String(employee.userId || '') === String(selectedUser.id));
        if (existingEmployee?.id) {
          employeeId = String(existingEmployee.id);
          employeeName = String(existingEmployee.name || selectedUser.displayName || selectedUser.email);
        } else {
          employeeName = String(selectedUser.displayName || selectedUser.email || 'موظف');
          employeeId = await employeeService.create({
            name: employeeName,
            phone: '',
            code: String(selectedUser.code || ''),
            departmentId: '',
            jobPositionId: '',
            level: 1,
            managerId: '',
            employmentType: 'full_time',
            baseSalary: 0,
            hourlyRate: 0,
            shiftId: '',
            vehicleId: '',
            hasSystemAccess: true,
            isActive: true,
            userId: String(selectedUser.id),
            email: String(selectedUser.email || ''),
          });
        }
      }

      if (employeeId) {
        await repairBranchService.assignTechnicianToBranch(employeeModalBranchId, employeeId);
      }
      if (assignAsBranchManager && employeeId) {
        await repairBranchService.update(employeeModalBranchId, {
          managerEmployeeId: employeeId,
          managerEmployeeName: employeeName,
        });
      }
      await Promise.all([loadEmployees(), loadBranches()]);
      setEmployeeModalOpen(false);
      toast.success('تم تنفيذ العملية بنجاح.');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تنفيذ العملية.');
    } finally {
      setEmployeeSaving(false);
    }
  };
  const filteredManagers = employees.filter((employee) => {
    const q = managerFilter.trim().toLowerCase();
    if (!q) return true;
    const name = String(employee.name || '').toLowerCase();
    const code = String(employee.code || '').toLowerCase();
    return `${name} ${code}`.includes(q);
  });
  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      const id = String(employee.id || '').trim();
      if (!id) return;
      map.set(id, String(employee.name || '').trim() || id);
    });
    return map;
  }, [employees]);
  const selectedTechniciansBranch = useMemo(
    () => rows.find((branch) => String(branch.id || '') === techniciansModalBranchId) || null,
    [rows, techniciansModalBranchId],
  );
  const selectedTechnicianIds = selectedTechniciansBranch?.technicianIds || [];

  const openTechniciansModal = (branchId: string) => {
    setTechniciansModalBranchId(branchId);
    setTechniciansModalOpen(true);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">فروع الصيانة</h1>
              <p className="text-sm text-muted-foreground mt-1">إدارة الفروع وتحديث بياناتها بسهولة.</p>
            </div>
            <Dialog
              open={branchModalOpen}
              onOpenChange={(open) => {
                setBranchModalOpen(open);
                if (!open) setManagerFilter('');
              }}
            >
              <Button onClick={() => setBranchModalOpen(true)}>إضافة فرع</Button>
              <DialogContent dir="rtl" className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>إضافة فرع</DialogTitle>
                  <DialogDescription>أدخل الاسم والهاتف والعنوان وحدد الموظف المسؤول لإنشاء فرع جديد.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                  <div><Label>العنوان</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
                  <div className="xl:col-span-2">
                    <Label>المسؤول عن الفرع</Label>
                    <Select
                      value={form.managerEmployeeId || ''}
                      onOpenChange={(open) => {
                        if (!open) setManagerFilter('');
                      }}
                      onValueChange={(value) => {
                        const employee = employees.find((item) => item.id === value);
                        setForm((p) => ({
                          ...p,
                          managerEmployeeId: value,
                          managerEmployeeName: String(employee?.name || ''),
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الموظف المسؤول" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b">
                          <Input
                            value={managerFilter}
                            onChange={(e) => setManagerFilter(e.target.value)}
                            placeholder="ابحث عن مسؤول..."
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        {filteredManagers.map((employee) => (
                          <SelectItem key={employee.id} value={String(employee.id || '')}>
                            {employee.name}
                          </SelectItem>
                        ))}
                        {filteredManagers.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">لا توجد نتائج مطابقة.</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBranchModalOpen(false)}>إلغاء</Button>
                  <Button onClick={create}>إضافة الفرع</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>قائمة الفروع</CardTitle>
            <div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1">
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                onClick={() => setViewMode('list')}
              >
                قائمة
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                onClick={() => setViewMode('grid')}
              >
                بطاقات
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-4'}>
          {rows.map((b) => (
            <Card key={b.id} className="text-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {b.name} {b.isMain ? '(رئيسي)' : ''}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {b.phone} {b.address ? `- ${b.address}` : ''}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground mt-1">
                      المسؤول: {b.managerEmployeeName || 'غير محدد'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openAddEmployeeModal(String(b.id || ''))}>
                      أضف موظف
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(b.id || null)}>تعديل</Button>
                    <Button size="sm" variant="destructive" onClick={() => setBranchPendingDelete(b)}>حذف</Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <div className="rounded border bg-muted/20 px-3 py-2">
                    <div className="text-xs text-muted-foreground">منتجات المخزن</div>
                    <div className="text-lg font-semibold">
                      {statsLoading ? '...' : (branchStats[String(b.id || '')]?.productsCount ?? 0)}
                    </div>
                  </div>
                  <div className="rounded border bg-muted/20 px-3 py-2">
                    <div className="text-xs text-muted-foreground">الفنيين</div>
                    <div className="text-lg font-semibold">
                      {branchStats[String(b.id || '')]?.techniciansCount ?? (b.technicianIds || []).length}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-auto px-0 py-0 text-xs font-medium whitespace-nowrap justify-start"
                      onClick={() => openTechniciansModal(String(b.id || ''))}
                    >
                      عرض الفنيين
                    </Button>
                  </div>
                  <div className="rounded border bg-muted/20 px-3 py-2">
                    <div className="text-xs text-muted-foreground">الطلبات</div>
                    <div className="text-lg font-semibold">
                      {statsLoading ? '...' : (branchStats[String(b.id || '')]?.requestsCount ?? 0)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
              {editingId === b.id ? (
                <div className="grid md:grid-cols-5 gap-2">
                  <Input value={b.name} onChange={(e) => setRows((prev) => prev.map((item) => item.id === b.id ? { ...item, name: e.target.value } : item))} />
                  <Input value={b.phone} onChange={(e) => setRows((prev) => prev.map((item) => item.id === b.id ? { ...item, phone: e.target.value } : item))} />
                  <Input value={b.address} onChange={(e) => setRows((prev) => prev.map((item) => item.id === b.id ? { ...item, address: e.target.value } : item))} />
                  <Select
                    value={b.managerEmployeeId || ''}
                    onValueChange={(value) => {
                      const employee = employees.find((item) => item.id === value);
                      setRows((prev) =>
                        prev.map((item) =>
                          item.id === b.id
                            ? {
                              ...item,
                              managerEmployeeId: value,
                              managerEmployeeName: String(employee?.name || ''),
                            }
                            : item,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المسؤول" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id || '')}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => b.id && save(b.id)}>حفظ</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>إلغاء</Button>
                  </div>
                </div>
              ) : null}
              </CardContent>
            </Card>
          ))}
          </div>
          {rows.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">لا توجد فروع صيانة حالياً.</div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(branchPendingDelete)} onOpenChange={(open) => !open && setBranchPendingDelete(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الفرع</DialogTitle>
            <DialogDescription>
              هل تريد حذف الفرع "{branchPendingDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchPendingDelete(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={remove}>حذف نهائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={employeeModalOpen} onOpenChange={setEmployeeModalOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة موظف للفرع</DialogTitle>
            <DialogDescription>
              يمكنك إنشاء موظف جديد أو اختياره من الموظفين/المستخدمين الحاليين.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>طريقة الإضافة</Label>
              <Select value={employeeModalMode} onValueChange={(value) => setEmployeeModalMode(value as 'new' | 'existingEmployee' | 'existingUser')}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر طريقة الإضافة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">إنشاء موظف جديد</SelectItem>
                  <SelectItem value="existingEmployee">اختيار من الموظفين</SelectItem>
                  <SelectItem value="existingUser">اختيار من المستخدمين</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {employeeModalMode === 'new' && (
              <>
                <div>
                  <Label>اسم الموظف</Label>
                  <Input
                    value={newEmployeeForm.name}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="الاسم بالكامل"
                  />
                </div>
                <div>
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={newEmployeeForm.phone}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="01xxxxxxxxx"
                  />
                </div>
                <div>
                  <Label>كود الموظف (اختياري)</Label>
                  <Input
                    value={newEmployeeForm.code}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="EMP-001"
                  />
                </div>
              </>
            )}

            {employeeModalMode === 'existingEmployee' && (
              <div>
                <Label>اختر موظف</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر من الموظفين الحاليين" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.filter((employee) => employee.id).map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id || '')}>
                        {employee.name} {employee.code ? `(${employee.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {employeeModalMode === 'existingUser' && (
              <div>
                <Label>اختر مستخدم</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر من المستخدمين الحاليين" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter((user) => user.id).map((user) => (
                      <SelectItem key={user.id} value={String(user.id || '')}>
                        {user.displayName} - {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignAsBranchManager}
                onChange={(e) => setAssignAsBranchManager(e.target.checked)}
              />
              تعيين الموظف كمسؤول الفرع بعد إنشائه
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployeeModalOpen(false)} disabled={employeeSaving}>إلغاء</Button>
            <Button onClick={handleCreateEmployee} disabled={employeeSaving}>
              {employeeSaving ? 'جاري الحفظ...' : 'حفظ الموظف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={techniciansModalOpen} onOpenChange={setTechniciansModalOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              الفنيون المعينون - {selectedTechniciansBranch?.name || 'الفرع'}
            </DialogTitle>
            <DialogDescription>
              عدد الفنيين: {selectedTechnicianIds.length}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {selectedTechnicianIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">لا يوجد فنيون معينون لهذا الفرع حالياً.</div>
            ) : (
              selectedTechnicianIds.map((technicianId) => (
                <div key={technicianId} className="rounded border px-3 py-2 text-sm">
                  {employeeNameById.get(String(technicianId || '').trim()) || `ID: ${technicianId}`}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechniciansModalOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairBranches;
