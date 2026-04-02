import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { resolveRepairSettings } from '../config/repairSettings';
import { repairBranchService } from '../services/repairBranchService';
import { employeeService } from '../../hr/employeeService';
import type { RepairBranch } from '../types';
import type { FirestoreEmployee } from '../../../types';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';

function repairSettingsFingerprint(settings: ReturnType<typeof useAppStore.getState>['systemSettings']): string {
  try {
    return JSON.stringify(settings?.repairSettings ?? null);
  } catch {
    return '';
  }
}

export const RepairSettings: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const resolved = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const fp = useMemo(() => repairSettingsFingerprint(systemSettings), [systemSettings]);

  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState(() => resolved.workflow.statuses);
  const [initialStatusId, setInitialStatusId] = useState(resolved.workflow.initialStatusId);
  const [openStatusIds, setOpenStatusIds] = useState<string[]>(resolved.workflow.openStatusIds);
  const [managerScope, setManagerScope] = useState<'branch' | 'centers'>(resolved.access.managerScope);
  const [defaultWarranty, setDefaultWarranty] = useState<'none' | '3months' | '6months'>(resolved.defaults.defaultWarranty);
  const [defaultMinStock, setDefaultMinStock] = useState(String(resolved.defaults.defaultMinStock));
  const [defaultSlaHours, setDefaultSlaHours] = useState(String(resolved.defaults.defaultSlaHours));
  const [timezone, setTimezone] = useState(resolved.treasury.autoClose.timezone || 'Africa/Cairo');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(Boolean(resolved.treasury.autoClose.enabled));
  const [blockIfPrevDayOpen, setBlockIfPrevDayOpen] = useState(Boolean(resolved.treasury.autoClose.blockOperationsIfPrevDayOpen));

  const [repairBranches, setRepairBranches] = useState<RepairBranch[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [branchManagersLoading, setBranchManagersLoading] = useState(true);
  const [managerByBranchId, setManagerByBranchId] = useState<Record<string, string>>({});
  const [managerSearch, setManagerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBranchManagersLoading(true);
      try {
        const [brList, empList] = await Promise.all([
          repairBranchService.list(),
          employeeService.getAll(),
        ]);
        if (cancelled) return;
        setRepairBranches(brList);
        const active = empList.filter((e) => e.isActive !== false);
        setEmployees(active);
        setManagerByBranchId(
          Object.fromEntries(
            brList.map((b) => [String(b.id || ''), String(b.managerEmployeeId || '')]),
          ),
        );
      } finally {
        if (!cancelled) setBranchManagersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const employeesForManagerSelect = useMemo(() => {
    const byId = new Map<string, FirestoreEmployee>();
    employees.forEach((e) => {
      const id = String(e.id || '').trim();
      if (id) byId.set(id, e);
    });
    repairBranches.forEach((b) => {
      const bid = String(b.id || '');
      const mid = String(managerByBranchId[bid] || b.managerEmployeeId || '').trim();
      if (mid && !byId.has(mid)) {
        byId.set(mid, {
          id: mid,
          name: String(b.managerEmployeeName || mid),
        } as FirestoreEmployee);
      }
    });
    return Array.from(byId.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ar'),
    );
  }, [employees, repairBranches, managerByBranchId]);

  const filteredManagerEmployees = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();
    if (!q) return employeesForManagerSelect;
    return employeesForManagerSelect.filter((e) => {
      const name = String(e.name || '').toLowerCase();
      const code = String(e.code || '').toLowerCase();
      return `${name} ${code}`.includes(q);
    });
  }, [employeesForManagerSelect, managerSearch]);

  useEffect(() => {
    const r = resolveRepairSettings(useAppStore.getState().systemSettings);
    setStatuses(r.workflow.statuses);
    setInitialStatusId(r.workflow.initialStatusId);
    setOpenStatusIds(r.workflow.openStatusIds);
    setManagerScope(r.access.managerScope);
    setDefaultWarranty(r.defaults.defaultWarranty);
    setDefaultMinStock(String(r.defaults.defaultMinStock));
    setDefaultSlaHours(String(r.defaults.defaultSlaHours));
    setTimezone(r.treasury.autoClose.timezone || 'Africa/Cairo');
    setAutoCloseEnabled(Boolean(r.treasury.autoClose.enabled));
    setBlockIfPrevDayOpen(Boolean(r.treasury.autoClose.blockOperationsIfPrevDayOpen));
  }, [fp]);

  const onSave = async () => {
    const minStock = Math.max(0, Math.round(Number(defaultMinStock) || 0));
    const sla = Math.max(0, Math.round(Number(defaultSlaHours) || 0));
    setSaving(true);
    try {
      let branchManagersUpdated = false;
      for (const branch of repairBranches) {
        const id = String(branch.id || '').trim();
        if (!id) continue;
        const next = String(managerByBranchId[id] ?? '').trim();
        const prev = String(branch.managerEmployeeId || '').trim();
        if (next === prev) continue;
        if (!next) {
          toast.error(`اختر الموظف المسؤول عن فرع: ${branch.name || id}`);
          return;
        }
        const emp = employeesForManagerSelect.find((e) => String(e.id) === next);
        await repairBranchService.update(id, {
          managerEmployeeId: next,
          managerEmployeeName: String(emp?.name || branch.managerEmployeeName || ''),
        });
        branchManagersUpdated = true;
      }
      if (branchManagersUpdated) {
        const refreshed = await repairBranchService.list();
        setRepairBranches(refreshed);
        setManagerByBranchId(
          Object.fromEntries(
            refreshed.map((b) => [String(b.id || ''), String(b.managerEmployeeId || '')]),
          ),
        );
      }

      await updateSystemSettings({
        ...systemSettings,
        repairSettings: {
          ...(systemSettings.repairSettings || {}),
          access: {
            managerScope,
          },
          workflow: {
            statuses: statuses.map((status, idx) => ({ ...status, order: idx + 1 })),
            initialStatusId,
            openStatusIds,
          },
          defaults: {
            ...(systemSettings.repairSettings?.defaults || {}),
            defaultWarranty,
            defaultMinStock: minStock,
            defaultSlaHours: sla,
          },
          treasury: {
            autoClose: {
              enabled: autoCloseEnabled,
              mode: 'scheduled_midnight',
              timezone,
              blockOperationsIfPrevDayOpen: blockIfPrevDayOpen,
            },
          },
        },
      });
      toast.success(
        branchManagersUpdated
          ? 'تم حفظ إعدادات الصيانة ومسؤولي الفروع.'
          : 'تم حفظ إعدادات الصيانة.',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ إعدادات الصيانة.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="إعدادات الصيانة"
        subtitle="تحكم في سير العمل، الصلاحيات، الافتراضيات، وسياسة خزينة الصيانة."
        icon={<Settings2 className="h-4 w-4" strokeWidth={2} />}
        actions={
          <Button onClick={onSave} disabled={saving} className="shrink-0">
            {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </Button>
        }
      />

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">صلاحية مدير الصيانة (النطاق)</CardTitle>
          <CardDescription>
            يحدد هل يرى مدير الصيانة في اللوحات فرعاً مرتبطاً به فقط، أم كل مراكز الصيانة. أما «مسؤول الفرع» فيُحدَّد لكل مركز في الجدول أدناه.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-2">
            <Label htmlFor="manager-scope">نطاق مدير الصيانة</Label>
            <Select value={managerScope} onValueChange={(v) => setManagerScope(v as 'branch' | 'centers')}>
              <SelectTrigger id="manager-scope" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="branch">فرع واحد (حسب ربط المستخدم بالفرع)</SelectItem>
                <SelectItem value="centers">كل مراكز الصيانة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">مسؤول كل فرع (مدير المركز)</CardTitle>
          <CardDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              اختر الموظف المسؤول عن تشغيل كل مركز صيانة. يُستخدم في الصلاحيات والخزينة والطلبات المرتبطة بالفرع.
            </span>
            <Link
              to={withTenantPath(tenantSlug, '/repair/branches')}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline shrink-0"
            >
              إدارة الفروع وإضافة فرع
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {branchManagersLoading ? (
            <p className="text-sm text-muted-foreground">جاري تحميل الفروع والموظفين...</p>
          ) : repairBranches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد فروع صيانة بعد.{' '}
              <Link to={withTenantPath(tenantSlug, '/repair/branches')} className="text-primary font-medium underline-offset-4 hover:underline">
                أنشئ فرعاً من صفحة فروع الصيانة
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="mgr-search">بحث عن موظف (لقائمة المسؤولين)</Label>
                <Input
                  id="mgr-search"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  placeholder="اسم أو كود..."
                  className="bg-background"
                />
              </div>
              <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/15 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-[var(--color-border)]/80">
                      <TableHead className="font-medium">مركز الصيانة</TableHead>
                      <TableHead className="min-w-[220px] font-medium">المسؤول عن الفرع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repairBranches.map((branch) => {
                      const bid = String(branch.id || '');
                      const value = managerByBranchId[bid] ?? String(branch.managerEmployeeId || '');
                      return (
                        <TableRow key={bid} className="border-b border-[var(--color-border)]/50 last:border-0">
                          <TableCell className="py-3">
                            <div className="font-medium">{branch.name || bid}</div>
                            {branch.isMain ? (
                              <span className="text-xs text-muted-foreground">رئيسي</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-3">
                            <Select
                              value={value || undefined}
                              onOpenChange={(open) => {
                                if (!open) setManagerSearch('');
                              }}
                              onValueChange={(v) =>
                                setManagerByBranchId((prev) => ({ ...prev, [bid]: v }))
                              }
                            >
                              <SelectTrigger className="bg-background w-full max-w-md">
                                <SelectValue placeholder="اختر المسؤول" />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-2 border-b border-[var(--color-border)]">
                                  <Input
                                    value={managerSearch}
                                    onChange={(e) => setManagerSearch(e.target.value)}
                                    placeholder="ابحث..."
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="h-8"
                                  />
                                </div>
                                {filteredManagerEmployees.map((employee) => (
                                  <SelectItem key={String(employee.id)} value={String(employee.id || '')}>
                                    {`${String(employee.name || '').trim() || '—'}${employee.code ? ` (${employee.code})` : ''}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">الافتراضيات عند إنشاء الطلبات</CardTitle>
          <CardDescription>قيم البداية لقطع الغيار والضمان ووقت الاستجابة المتوقع.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>الضمان الافتراضي</Label>
              <Select value={defaultWarranty} onValueChange={(v) => setDefaultWarranty(v as typeof defaultWarranty)}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ضمان</SelectItem>
                  <SelectItem value="3months">3 أشهر</SelectItem>
                  <SelectItem value="6months">6 أشهر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-stock">الحد الأدنى الافتراضي للمخزون (قطعة)</Label>
              <Input
                id="min-stock"
                type="number"
                min={0}
                inputMode="numeric"
                value={defaultMinStock}
                onChange={(e) => setDefaultMinStock(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sla-hours">SLA افتراضي (ساعات)</Label>
              <Input
                id="sla-hours"
                type="number"
                min={0}
                inputMode="numeric"
                value={defaultSlaHours}
                onChange={(e) => setDefaultSlaHours(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">حالات الطلب وسير العمل</CardTitle>
          <CardDescription>عرّف الحالات والألوان والحالة الابتدائية والحالات المعتبرة «مفتوحة».</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-[var(--color-border)]/80">
                  <TableHead className="w-[120px] font-medium">المعرف</TableHead>
                  <TableHead className="font-medium">الاسم</TableHead>
                  <TableHead className="w-[100px] font-medium">اللون</TableHead>
                  <TableHead className="w-[90px] text-center font-medium">نهائية</TableHead>
                  <TableHead className="w-[90px] text-center font-medium">مفعّلة</TableHead>
                  <TableHead className="w-[72px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((status, index) => (
                  <TableRow key={status.id} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <TableCell className="align-top py-3">
                      <Input
                        value={status.id}
                        onChange={(e) =>
                          setStatuses((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, id: e.target.value.trim() } : s)),
                          )
                        }
                        className="h-9 bg-background font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Input
                        value={status.label}
                        onChange={(e) =>
                          setStatuses((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)),
                          )
                        }
                        className="h-9 bg-background"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={status.color}
                          onChange={(e) =>
                            setStatuses((prev) =>
                              prev.map((s, i) => (i === index ? { ...s, color: e.target.value } : s)),
                            )
                          }
                          className="h-9 flex-1 bg-background font-mono text-xs"
                        />
                        <span
                          className="h-9 w-9 shrink-0 rounded-md border border-[var(--color-border)]"
                          style={{ backgroundColor: status.color || '#64748b' }}
                          title={status.color}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-middle py-3">
                      <Checkbox
                        checked={status.isTerminal}
                        onCheckedChange={(c) =>
                          setStatuses((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, isTerminal: Boolean(c) } : s)),
                          )
                        }
                        aria-label="نهائية"
                      />
                    </TableCell>
                    <TableCell className="text-center align-middle py-3">
                      <Checkbox
                        checked={status.isEnabled}
                        onCheckedChange={(c) =>
                          setStatuses((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, isEnabled: Boolean(c) } : s)),
                          )
                        }
                        aria-label="مفعّلة"
                      />
                    </TableCell>
                    <TableCell className="align-middle py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setStatuses((prev) => prev.filter((_, i) => i !== index))}
                      >
                        حذف
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            type="button"
            variant="outline"
            className="border-dashed"
            onClick={() =>
              setStatuses((prev) => [
                ...prev,
                {
                  id: `custom_${Date.now()}`,
                  label: 'حالة جديدة',
                  color: '#64748b',
                  order: prev.length + 1,
                  isTerminal: false,
                  isEnabled: true,
                },
              ])
            }
          >
            إضافة حالة
          </Button>

          <Separator className="my-2" />

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الحالة الابتدائية</Label>
              <Select value={initialStatusId} onValueChange={setInitialStatusId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الحالات المفتوحة</Label>
              <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/10 p-3 space-y-2.5 max-h-48 overflow-y-auto">
                {statuses.map((status) => (
                  <label
                    key={`open-${status.id}`}
                    className={cn('flex items-center gap-2.5 text-sm cursor-pointer')}
                  >
                    <Checkbox
                      checked={openStatusIds.includes(status.id)}
                      onCheckedChange={(checked) =>
                        setOpenStatusIds((prev) =>
                          checked
                            ? Array.from(new Set([...prev, status.id]))
                            : prev.filter((id) => id !== status.id),
                        )
                      }
                    />
                    <span>{status.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">سياسة الخزينة</CardTitle>
          <CardDescription>الإغلاق التلقائي والتحقق من خزينة اليوم السابق.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-[var(--color-border)]/60 bg-muted/15 p-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium">إغلاق تلقائي منتصف الليل</p>
              <p className="text-xs text-muted-foreground">يتم إغلاق يوم الخزينة تلقائياً حسب المنطقة الزمنية.</p>
            </div>
            <Checkbox
              checked={autoCloseEnabled}
              onCheckedChange={(c) => setAutoCloseEnabled(Boolean(c))}
              className="mt-1"
              aria-label="تفعيل الإغلاق التلقائي"
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-[var(--color-border)]/60 bg-muted/15 p-4">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium">منع العمل عند خزينة يوم سابق مفتوحة</p>
              <p className="text-xs text-muted-foreground">يقلل أخطاء الترحيل بين الأيام.</p>
            </div>
            <Checkbox
              checked={blockIfPrevDayOpen}
              onCheckedChange={(c) => setBlockIfPrevDayOpen(Boolean(c))}
              className="mt-1"
              aria-label="منع العمليات"
            />
          </div>
          <div className="max-w-md space-y-2">
            <Label htmlFor="tz">المنطقة الزمنية (IANA)</Label>
            <Input
              id="tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Africa/Cairo"
              className="bg-background font-mono text-sm"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t border-[var(--color-border)]/60 pt-6">
        <Button onClick={onSave} disabled={saving} size="lg">
          {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الصيانة'}
        </Button>
      </div>
    </div>
  );
};

export default RepairSettings;
