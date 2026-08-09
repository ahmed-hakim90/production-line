import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { customerService } from '../services/customerService';
import { downloadCustomersTemplate } from '../lib/importCustomers';
import {
  CUSTOMER_LIST_LOAD_FALLBACK,
  toCustomerListLoadErrorMessage,
  waitForTenantId,
} from '../lib/customerListLoadError';
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_OPTIONS,
  type Customer,
  type CustomerType,
} from '../types';

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  id: '',
  code: '',
  type: 'consumer' as CustomerType,
  name: '',
  phone: '',
  address: '',
  notes: '',
  isActive: true,
};

export const Customers: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canCreate = can('customers.create');
  const canEdit = can('customers.edit');
  const canImport = can('customers.import');
  const user = useAppStore((s) => s.userProfile);

  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const tenantId = await waitForTenantId();
      if (!tenantId) {
        const message = toCustomerListLoadErrorMessage(
          new Error('Tenant context not initialised'),
        );
        setLoadError(message);
        setRows([]);
        toast.error(message);
        return;
      }
      const list = await customerService.listAll({ includeInactive: true });
      setRows(list);
      setLoadError(null);
    } catch (error: unknown) {
      const message = toCustomerListLoadErrorMessage(error, CUSTOMER_LIST_LOAD_FALLBACK);
      setLoadError(message);
      setRows([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter]);

  const filtered = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      list = list.filter((c) => {
        const blob = `${c.code} ${c.name} ${c.phone} ${c.phoneDigits}`.toLowerCase();
        return blob.includes(q) || (digits.length >= 3 && c.phoneDigits.includes(digits));
      });
    }
    if (typeFilter !== 'all') list = list.filter((c) => c.type === typeFilter);
    if (statusFilter === 'active') list = list.filter((c) => c.isActive !== false);
    if (statusFilter === 'inactive') list = list.filter((c) => c.isActive === false);
    return list;
  }, [rows, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setForm({
      id: customer.id || '',
      code: customer.code,
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      address: customer.address || '',
      notes: customer.notes || '',
      isActive: customer.isActive !== false,
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const actor = {
        userId: String(user?.id || ''),
        userName: String(user?.displayName || user?.email || 'مستخدم'),
      };
      if (form.id) {
        const updated = await customerService.update(form.id, {
          code: form.code,
          type: form.type,
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          isActive: form.isActive,
          updatedBy: actor.userId,
          updatedByName: actor.userName,
        });
        setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        toast.success('تم تحديث العميل.');
      } else {
        const created = await customerService.create({
          code: form.code || undefined,
          type: form.type,
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          isActive: form.isActive,
          createdBy: actor.userId,
          createdByName: actor.userName,
        });
        setRows((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
        toast.success('تم إنشاء العميل.');
      }
      setModalOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ العميل.');
    } finally {
      setSaving(false);
    }
  };

  if (!can('customers.view')) {
    return <div className="p-6 text-sm text-muted-foreground">ليس لديك صلاحية عرض العملاء.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="العملاء"
        subtitle="ماستر بيانات العملاء (مستهلك / تاجر) — المرجع لكل الموديولات"
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button type="button" variant="outline" asChild>
                <Link to={withTenantPath(tenantSlug, '/customers/repair-link')}>ربط طلبات الصيانة</Link>
              </Button>
            )}
            {canImport && (
              <>
                <Button type="button" variant="outline" onClick={() => downloadCustomersTemplate()}>
                  قالب Excel
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link to={withTenantPath(tenantSlug, '/customers/import')}>استيراد</Link>
                </Button>
              </>
            )}
            {canCreate && (
              <Button type="button" onClick={openCreate}>
                عميل جديد
              </Button>
            )}
          </div>
        }
      />

      <div className="rounded-xl border bg-[var(--color-card)] overflow-hidden">
        <div className="p-3 border-b">
          <SmartFilterBar
            pageId="customers-list"
            searchPlaceholder="بحث بالكود / الاسم / الموبايل…"
            searchValue={search}
            onSearchChange={setSearch}
            quickFilters={[
              {
                key: 'type',
                placeholder: 'كل الأنواع',
                options: CUSTOMER_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              },
              {
                key: 'status',
                placeholder: 'كل الحالات',
                options: [
                  { value: 'active', label: 'نشط' },
                  { value: 'inactive', label: 'غير نشط' },
                ],
              },
            ]}
            quickFilterValues={{ type: typeFilter === 'all' ? '' : typeFilter, status: statusFilter === 'all' ? '' : statusFilter }}
            onQuickFilterChange={(key, value) => {
              if (key === 'type') setTypeFilter(value || 'all');
              if (key === 'status') setStatusFilter(value || 'all');
            }}
          />
        </div>

        <div className="erp-mobile-card-list p-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`cust-m-sk-${i}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-sm text-muted-foreground"
              >
                جاري التحميل…
              </div>
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center">
              <p className="text-sm text-destructive font-medium">{loadError}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void load()}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : paged.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا يوجد عملاء مطابقون.</p>
          ) : (
            paged.map((customer) => (
              <div
                key={`m-${customer.id}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      className="block truncate text-sm font-bold text-primary hover:underline"
                      to={withTenantPath(tenantSlug, `/customers/${customer.id}`)}
                    >
                      <span className="font-mono tabular-nums">{customer.code}</span>
                      <span className="mx-1 text-[var(--color-text-muted)]">·</span>
                      <span>{customer.name}</span>
                    </Link>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {CUSTOMER_TYPE_LABELS[customer.type]}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text)]" dir="ltr">
                      {customer.phone || '—'}
                    </p>
                  </div>
                  <StatusBadge
                    type={customer.isActive !== false ? 'success' : 'muted'}
                    label={customer.isActive !== false ? 'نشط' : 'غير نشط'}
                  />
                </div>
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => openEdit(customer)}
                    >
                      <Pencil className="me-1 h-3.5 w-3.5" />
                      تعديل
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="erp-desktop-table erp-table-wrap overflow-x-auto">
          <table className="erp-table w-full min-w-[720px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الكود</th>
                <th className="erp-th">الاسم</th>
                <th className="erp-th">النوع</th>
                <th className="erp-th">الموبايل</th>
                <th className="erp-th">العنوان</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="p-3 text-sm text-muted-foreground">
                      جاري التحميل…
                    </td>
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center">
                    <p className="text-sm text-destructive font-medium">{loadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void load()}
                    >
                      إعادة المحاولة
                    </Button>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    لا يوجد عملاء مطابقون.
                  </td>
                </tr>
              ) : (
                paged.map((customer) => (
                  <tr key={customer.id} className="border-t">
                    <td className="p-2 tabular-nums">
                      <Link
                        className="text-primary hover:underline font-medium"
                        to={withTenantPath(tenantSlug, `/customers/${customer.id}`)}
                      >
                        {customer.code}
                      </Link>
                    </td>
                    <td className="p-2">{customer.name}</td>
                    <td className="p-2">{CUSTOMER_TYPE_LABELS[customer.type]}</td>
                    <td className="p-2 tabular-nums dir-ltr text-start">{customer.phone}</td>
                    <td className="p-2 max-w-[220px] truncate">{customer.address || '—'}</td>
                    <td className="p-2">
                      <StatusBadge
                        type={customer.isActive !== false ? 'success' : 'muted'}
                        label={customer.isActive !== false ? 'نشط' : 'غير نشط'}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="تعديل"
                            onClick={() => openEdit(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          itemLabel="عميل"
          onPageChange={setPage}
        />
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'تعديل عميل' : 'عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>النوع</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((p) => ({ ...p, type: v as CustomerType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الكود {form.id ? '' : '(اختياري)'}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder={form.id ? '' : 'يُولَّد تلقائيًا إن تُرك فارغًا'}
              />
            </div>
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>الموبايل</Label>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            {form.id && (
              <div>
                <Label>الحالة</Label>
                <Select
                  value={form.isActive ? 'active' : 'inactive'}
                  onValueChange={(v) => setForm((p) => ({ ...p, isActive: v === 'active' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">غير نشط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'جاري الحفظ…' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
