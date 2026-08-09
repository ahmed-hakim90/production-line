import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { resolveRepairSettings, type ResolvedRepairStatus } from '../config/repairSettings';
import {
  REPAIR_STATUS_ROLE_LABELS,
  REPAIR_STATUS_ROLES,
  validateMandatoryStatusRoles,
  type RepairStatusRole,
} from '../lib/repairStatusAdvance';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';
import { repairBranchService } from '../services/repairBranchService';
import { employeeService } from '../../hr/employeeService';
import type { RepairBranch } from '../types';
import type {
  FirestoreEmployee,
  RepairAccessoryCatalogItem,
  RepairServiceCatalogItem,
  RepairUnrepairableReason,
} from '../../../types';
import { withTenantPath } from '@/lib/tenantPaths';
import { cn } from '@/lib/utils';
import { repairServiceCatalogService } from '../services/repairServiceCatalogService';
import { usePermission } from '@/utils/permissions';
import { purgeRepairOperationalDataCallable } from '../../auth/services/firebase';

function repairSettingsFingerprint(settings: ReturnType<typeof useAppStore.getState>['systemSettings']): string {
  try {
    return JSON.stringify(settings?.repairSettings ?? null);
  } catch {
    return '';
  }
}

export const RepairSettings: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const userProfile = useAppStore((s) => s.userProfile);
  const productCategories = useAppStore((s) => s._productCategories);
  const resolved = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const fp = useMemo(() => repairSettingsFingerprint(systemSettings), [systemSettings]);
  const tenantId = String(userProfile?.tenantId || '').trim();
  const purgeConfirmExpected = tenantId ? `PURGE_REPAIR_OPS_${tenantId}` : '';
  const canPurgeOps = can('repair.settings.manage') || can('roles.manage');
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purging, setPurging] = useState(false);

  const categoryOptions = useMemo(
    () =>
      (productCategories || [])
        .filter((c) => c.id && c.name)
        .map((c) => ({ id: String(c.id), name: String(c.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [productCategories],
  );

  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState<ResolvedRepairStatus[]>(() => resolved.workflow.statuses);
  const [initialStatusId, setInitialStatusId] = useState(resolved.workflow.initialStatusId);
  const [openStatusIds, setOpenStatusIds] = useState<string[]>(resolved.workflow.openStatusIds);
  const [managerScope, setManagerScope] = useState<'branch' | 'centers'>(resolved.access.managerScope);
  const [defaultWarranty, setDefaultWarranty] = useState<'none' | '3months' | '6months'>(resolved.defaults.defaultWarranty);
  const [defaultMinStock, setDefaultMinStock] = useState(String(resolved.defaults.defaultMinStock));
  const [defaultSlaHours, setDefaultSlaHours] = useState(String(resolved.defaults.defaultSlaHours));
  const [timezone, setTimezone] = useState(resolved.treasury.autoClose.timezone || 'Africa/Cairo');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(Boolean(resolved.treasury.autoClose.enabled));
  const [blockIfPrevDayOpen, setBlockIfPrevDayOpen] = useState(Boolean(resolved.treasury.autoClose.blockOperationsIfPrevDayOpen));
  const [allowPartialCollection, setAllowPartialCollection] = useState(
    Boolean(resolved.payments.allowPartialCollection),
  );
  const [accessoriesCatalog, setAccessoriesCatalog] = useState<RepairAccessoryCatalogItem[]>(
    () => resolved.accessoriesCatalog,
  );
  const [serviceCatalog, setServiceCatalog] = useState<RepairServiceCatalogItem[]>(
    () => resolved.serviceCatalog,
  );
  const [unrepairableReasons, setUnrepairableReasons] = useState<RepairUnrepairableReason[]>(
    () => resolved.unrepairableReasons,
  );

  type RepairSettingsManagersData = {
    repairBranches: RepairBranch[];
    employees: FirestoreEmployee[];
    managerByBranchId: Record<string, string>;
  };
  const SETTINGS_MANAGERS_CACHE_KEY = 'repair:settings:branchManagers';
  const initialManagersCache = peekPageDataCache<RepairSettingsManagersData>(SETTINGS_MANAGERS_CACHE_KEY);
  const [repairBranches, setRepairBranches] = useState<RepairBranch[]>(() => initialManagersCache?.repairBranches ?? []);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>(() => initialManagersCache?.employees ?? []);
  const [branchManagersLoading, setBranchManagersLoading] = useState(() => initialManagersCache == null);
  const [managerByBranchId, setManagerByBranchId] = useState<Record<string, string>>(() => initialManagersCache?.managerByBranchId ?? {});
  const [managerSearch, setManagerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const cached = peekPageDataCache<RepairSettingsManagersData>(SETTINGS_MANAGERS_CACHE_KEY);
    if (cached) {
      setRepairBranches(cached.repairBranches);
      setEmployees(cached.employees);
      setManagerByBranchId(cached.managerByBranchId);
      setBranchManagersLoading(false);
    } else {
      setBranchManagersLoading(true);
    }
    (async () => {
      try {
        const { data } = await fetchCachedPageData(
          SETTINGS_MANAGERS_CACHE_KEY,
          async () => {
            const [brList, empList] = await Promise.all([
              repairBranchService.list(),
              employeeService.getAll(),
            ]);
            const active = empList.filter((e) => e.isActive !== false);
            return {
              repairBranches: brList,
              employees: active,
              managerByBranchId: Object.fromEntries(
                brList.map((b) => [String(b.id || ''), String(b.managerEmployeeId || '')]),
              ),
            };
          },
          { maxAgeMs: 60_000 },
        );
        if (cancelled) return;
        setRepairBranches(data.repairBranches);
        setEmployees(data.employees);
        setManagerByBranchId(data.managerByBranchId);
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
    setAllowPartialCollection(Boolean(r.payments.allowPartialCollection));
    setAccessoriesCatalog(r.accessoriesCatalog);
    setServiceCatalog(r.serviceCatalog);
    setUnrepairableReasons(r.unrepairableReasons);
  }, [fp]);

  useEffect(() => {
    let cancelled = false;
    void repairServiceCatalogService.get()
      .then((catalog) => {
        if (!cancelled && catalog.services.length > 0) setServiceCatalog(catalog.services);
      })
      .catch(() => {
        // Keep the sanitized legacy names visible; saving will create the protected catalog.
      });
    return () => { cancelled = true; };
  }, []);

  const onSave = async () => {
    const minStock = Math.max(0, Math.round(Number(defaultMinStock) || 0));
    const sla = Math.max(0, Math.round(Number(defaultSlaHours) || 0));
    const normalizedAccessories = accessoriesCatalog
      .map((row, index) => {
        const categoryIds = Array.isArray(row.categoryIds)
          ? row.categoryIds.map((id) => String(id || '').trim()).filter(Boolean)
          : [];
        return {
          id: String(row.id || '').trim() || `acc-${index + 1}`,
          label: String(row.label || '').trim(),
          enabled: row.enabled !== false,
          ...(categoryIds.length > 0 ? { categoryIds } : {}),
        };
      })
      .filter((row) => row.label.length > 0);
    const normalizedServices = serviceCatalog
      .map((row, index) => {
        const price = Number(row.price);
        const internalCost = Number(row.internalCost);
        return {
          id: String(row.id || '').trim() || `svc-${index + 1}`,
          name: String(row.name || '').trim(),
          price: Number.isFinite(price) ? Math.max(0, price) : 0,
          internalCost: Number.isFinite(internalCost) ? Math.max(0, internalCost) : 0,
          enabled: row.enabled !== false,
        };
      })
      .filter((row) => row.name.length > 0);
    const normalizedUnrepairableReasons = unrepairableReasons
      .map((row, index) => ({
        id: String(row.id || '').trim() || `reason-${index + 1}`,
        label: String(row.label || '').trim(),
        enabled: row.enabled !== false,
      }))
      .filter((row) => row.label.length > 0);
    const roleErrors = validateMandatoryStatusRoles(statuses);
    if (roleErrors.length > 0) {
      toast.error(roleErrors[0]);
      return;
    }
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
        invalidatePageDataCache(SETTINGS_MANAGERS_CACHE_KEY);
        const refreshed = await repairBranchService.list();
        setRepairBranches(refreshed);
        setManagerByBranchId(
          Object.fromEntries(
            refreshed.map((b) => [String(b.id || ''), String(b.managerEmployeeId || '')]),
          ),
        );
      }

      await repairServiceCatalogService.save(normalizedServices);
      await updateSystemSettings({
        ...systemSettings,
        repairSettings: {
          ...(systemSettings.repairSettings || {}),
          access: {
            managerScope,
          },
          workflow: {
            statuses: statuses.map((status, idx) => ({
              ...status,
              id: mapLegacyRepairStatus(status.id),
              order: idx + 1,
            })),
            initialStatusId: mapLegacyRepairStatus(initialStatusId),
            openStatusIds: Array.from(new Set(openStatusIds.map((id) => mapLegacyRepairStatus(id)))),
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
          payments: {
            ...(systemSettings.repairSettings?.payments || {}),
            allowPartialCollection,
          },
          accessoriesCatalog: normalizedAccessories,
          unrepairableReasons: normalizedUnrepairableReasons,
          // Names remain available to operational screens; real prices live only
          // in repair_service_catalog and are never readable by technicians.
          serviceCatalog: normalizedServices.map(({ id, name, enabled }) => ({
            id,
            name,
            enabled,
            price: 0,
          })),
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
    <div className="erp-ds-clean space-y-4 p-4 md:p-6">
      <PageHeader
        title="إعدادات الصيانة"
        subtitle="تحكم في سير العمل، الصلاحيات، الافتراضيات، وسياسة خزينة الصيانة."
        icon="settings"
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
          <CardTitle className="text-base font-semibold tracking-tight">إكسسوارات الاستلام</CardTitle>
          <CardDescription>
            قائمة الإكسسوارات عند الاستلام. اربط كل إكسسوار بفئات المنتجات — بدون فئات = يظهر لكل المنتجات.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-[var(--color-border)]/80">
                  <TableHead className="w-[120px] font-medium">المعرف</TableHead>
                  <TableHead className="w-[140px] font-medium">الاسم</TableHead>
                  <TableHead className="font-medium">فئات المنتجات</TableHead>
                  <TableHead className="w-[72px] text-center font-medium">مفعّل</TableHead>
                  <TableHead className="w-[64px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessoriesCatalog.map((item, index) => (
                  <TableRow key={`acc-${index}-${item.id}`} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <TableCell className="align-top py-3">
                      <Input
                        value={item.id}
                        onChange={(e) =>
                          setAccessoriesCatalog((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, id: e.target.value.trim() } : row,
                            ),
                          )
                        }
                        className="h-9 bg-background font-mono text-xs"
                        dir="ltr"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          setAccessoriesCatalog((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                          )
                        }
                        className="h-9 bg-background"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      {categoryOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">لا توجد فئات منتجات محمّلة.</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-h-28 overflow-y-auto">
                          {categoryOptions.map((cat) => {
                            const checked = (item.categoryIds || []).includes(cat.id);
                            return (
                              <label key={cat.id} className="inline-flex items-center gap-1.5 text-xs">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    setAccessoriesCatalog((prev) =>
                                      prev.map((row, i) => {
                                        if (i !== index) return row;
                                        const current = Array.isArray(row.categoryIds) ? row.categoryIds : [];
                                        const next = c
                                          ? [...current.filter((id) => id !== cat.id), cat.id]
                                          : current.filter((id) => id !== cat.id);
                                        return { ...row, categoryIds: next };
                                      }),
                                    );
                                  }}
                                  aria-label={cat.name}
                                />
                                <span className="truncate max-w-[9rem]">{cat.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {(item.categoryIds || []).length === 0 ? (
                        <p className="text-[10px] text-muted-foreground mt-1">كل الفئات</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-center align-middle py-3">
                      <Checkbox
                        checked={item.enabled !== false}
                        onCheckedChange={(c) =>
                          setAccessoriesCatalog((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, enabled: Boolean(c) } : row)),
                          )
                        }
                        aria-label="مفعّل"
                      />
                    </TableCell>
                    <TableCell className="align-middle py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setAccessoriesCatalog((prev) => prev.filter((_, i) => i !== index))}
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
              setAccessoriesCatalog((prev) => [
                ...prev,
                { id: `acc_${Date.now()}`, label: 'إكسسوار جديد', enabled: true, categoryIds: [] },
              ])
            }
          >
            إضافة إكسسوار
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">خدمات وتكاليف الإصلاح</CardTitle>
          <CardDescription>
            سعر البيع للعميل والتكلفة الداخلية المعيارية المستخدمة في تحليل الضمان فقط.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-[var(--color-border)]/80">
                  <TableHead className="w-[140px] font-medium">المعرف</TableHead>
                  <TableHead className="font-medium">الخدمة</TableHead>
                  <TableHead className="w-[120px] font-medium">السعر</TableHead>
                  <TableHead className="w-[140px] font-medium">التكلفة الداخلية</TableHead>
                  <TableHead className="w-[90px] text-center font-medium">مفعّل</TableHead>
                  <TableHead className="w-[72px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceCatalog.map((item, index) => (
                  <TableRow key={`svc-${index}-${item.id}`} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <TableCell className="align-top py-3">
                      <Input
                        value={item.id}
                        onChange={(e) =>
                          setServiceCatalog((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, id: e.target.value.trim() } : row,
                            ),
                          )
                        }
                        className="h-9 bg-background font-mono text-xs"
                        dir="ltr"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          setServiceCatalog((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)),
                          )
                        }
                        className="h-9 bg-background"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={String(item.price ?? 0)}
                        onChange={(e) =>
                          setServiceCatalog((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, price: Math.max(0, Number(e.target.value) || 0) }
                                : row,
                            ),
                          )
                        }
                        className="h-9 bg-background tabular-nums"
                        dir="ltr"
                      />
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={String(item.internalCost ?? 0)}
                        onChange={(e) =>
                          setServiceCatalog((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, internalCost: Math.max(0, Number(e.target.value) || 0) }
                                : row,
                            ),
                          )
                        }
                        className="h-9 bg-background tabular-nums"
                        dir="ltr"
                      />
                    </TableCell>
                    <TableCell className="text-center align-middle py-3">
                      <Checkbox
                        checked={item.enabled !== false}
                        onCheckedChange={(c) =>
                          setServiceCatalog((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, enabled: Boolean(c) } : row)),
                          )
                        }
                        aria-label="مفعّل"
                      />
                    </TableCell>
                    <TableCell className="align-middle py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setServiceCatalog((prev) => prev.filter((_, i) => i !== index))}
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
              setServiceCatalog((prev) => [
                ...prev,
                { id: `svc_${Date.now()}`, name: 'خدمة جديدة', price: 0, internalCost: 0, enabled: true },
              ])
            }
          >
            إضافة خدمة
          </Button>
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
          <CardTitle className="text-base font-semibold tracking-tight">إقفال الدفع من شاشة الطلب</CardTitle>
          <CardDescription>
            تحكم في الأزرار الظاهرة عند تحصيل وتسليم الطلب من شاشة تفاصيل الطلب.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border)]/70 bg-muted/20 p-3 text-sm">
            <Checkbox
              checked={allowPartialCollection}
              onCheckedChange={(checked) => setAllowPartialCollection(checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">إظهار «تحصيل جزئي / مبلغ مخصص»</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                عند الإيقاف يبقى زر «تحصيل كامل وتسليم» فقط على شاشة الطلب. التحصيل الجزئي يبقى متاحًا من شاشة التحصيل والتسليم إن لزم.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="border border-[var(--color-border)]/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">حالات الطلب وسير العمل</CardTitle>
          <CardDescription>
            عرّف الحالات والألوان والدور في المسار. الحالة تتقدم تلقائياً حسب الأكشن (تشخيص / قطعة / موافقة / تم الإصلاح) عبر الدور المعيّن.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)]/70 bg-muted/20 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-[var(--color-border)]/80">
                  <TableHead className="w-[110px] font-medium">المعرف</TableHead>
                  <TableHead className="font-medium">الاسم</TableHead>
                  <TableHead className="min-w-[180px] font-medium">الدور في المسار</TableHead>
                  <TableHead className="w-[100px] font-medium">اللون</TableHead>
                  <TableHead className="w-[80px] text-center font-medium">نهائية</TableHead>
                  <TableHead className="w-[80px] text-center font-medium">مفعّلة</TableHead>
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
                      <Select
                        value={status.role || 'none'}
                        onValueChange={(value) =>
                          setStatuses((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, role: value as RepairStatusRole } : s)),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 bg-background text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REPAIR_STATUS_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {REPAIR_STATUS_ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  role: 'none',
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
          <CardTitle className="text-base font-semibold tracking-tight">أسباب عدم قابلية الإصلاح</CardTitle>
          <CardDescription>
            قائمة ثابتة يختار منها الفني. تُحفظ ككود واسم وتظهر في تحليل أسباب عدم الإصلاح وإعادة الفتح.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-[var(--color-border)]/70 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">الكود</TableHead>
                  <TableHead>السبب</TableHead>
                  <TableHead className="w-[80px] text-center">مفعّل</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unrepairableReasons.map((reason, index) => (
                  <TableRow key={`${reason.id}-${index}`}>
                    <TableCell>
                      <Input
                        dir="ltr"
                        className="font-mono text-xs"
                        value={reason.id}
                        onChange={(e) => setUnrepairableReasons((rows) => rows.map((row, i) =>
                          i === index ? { ...row, id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_') } : row,
                        ))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={reason.label}
                        onChange={(e) => setUnrepairableReasons((rows) => rows.map((row, i) =>
                          i === index ? { ...row, label: e.target.value } : row,
                        ))}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={reason.enabled !== false}
                        onCheckedChange={(checked) => setUnrepairableReasons((rows) => rows.map((row, i) =>
                          i === index ? { ...row, enabled: Boolean(checked) } : row,
                        ))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setUnrepairableReasons((rows) => rows.filter((_, i) => i !== index))}
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
            onClick={() => setUnrepairableReasons((rows) => [
              ...rows,
              { id: `reason_${Date.now()}`, label: 'سبب جديد', enabled: true },
            ])}
          >
            إضافة سبب
          </Button>
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

      {canPurgeOps && tenantId ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">منطقة خطر — مسح بيانات تشغيل تجريبية</CardTitle>
            <CardDescription>
              يمسح كل طلبات الصيانة والعهدة وسندات الصرف وطلبات العملاء والاستبدال والتحصيل المرتبط،
              مع الإبقاء على الفروع والقطع والعملاء وأرصدة المخزون الحالية.
              لا يُستخدم إلا على بيانات تجريبية.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
              <p>سيُحذف: الطلبات · العهدة · غير القابل للإصلاح · سندات الصرف · طلبات العملاء · الاستبدال · الماليات/الخزينة المرتبطة.</p>
              <p>سيبقى: الفروع · كتالوج القطع · أرصدة قطع المراكز · العملاء · stock_items.</p>
            </div>
            <div className="max-w-xl space-y-2">
              <Label htmlFor="purge-confirm">
                للتأكيد اكتب: <span className="font-mono text-xs" dir="ltr">{purgeConfirmExpected}</span>
              </Label>
              <Input
                id="purge-confirm"
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                className="font-mono text-sm"
                dir="ltr"
                autoComplete="off"
                placeholder={purgeConfirmExpected}
              />
            </div>
            <Button
              variant="destructive"
              disabled={purging || purgeConfirm.trim() !== purgeConfirmExpected}
              onClick={async () => {
                const ok = window.confirm(
                  'تأكيد نهائي: مسح كل بيانات تشغيل الصيانة التجريبية لهذه الشركة؟ لا يمكن التراجع.',
                );
                if (!ok) return;
                setPurging(true);
                try {
                  const result = await purgeRepairOperationalDataCallable({
                    tenantId,
                    confirmPhrase: purgeConfirm.trim(),
                  });
                  setPurgeConfirm('');
                  toast.success(`تم المسح: ${result.deletedFirestoreDocs} مستند.`);
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'تعذر مسح بيانات الصيانة.');
                } finally {
                  setPurging(false);
                }
              }}
            >
              {purging ? 'جارٍ المسح...' : 'مسح بيانات تشغيل الصيانة'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end border-t border-[var(--color-border)]/60 pt-6">
        <Button onClick={onSave} disabled={saving} size="lg">
          {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الصيانة'}
        </Button>
      </div>
    </div>
  );
};

export default RepairSettings;
