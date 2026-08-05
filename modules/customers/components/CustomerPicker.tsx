import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toEnglishDigits } from '@/lib/englishDigits';
import { customerService } from '../services/customerService';
import { formatCustomerOptionLabel, matchCustomers } from '../lib/customerSearch';
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_OPTIONS,
  type Customer,
  type CustomerType,
} from '../types';
import { toast } from 'sonner';

type CustomerPickerProps = {
  customers: Customer[];
  valueId?: string;
  disabled?: boolean;
  /** عند الاختيار من الماستر */
  onSelect: (customer: Customer | null) => void;
  /** بعد إنشاء عميل ماستر جديد */
  onCreated?: (customer: Customer) => void;
  canCreate?: boolean;
  actor?: { userId?: string; userName?: string };
};

export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  customers,
  valueId,
  disabled,
  onSelect,
  onCreated,
  canCreate = true,
  actor,
}) => {
  const [query, setQuery] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'consumer' as CustomerType,
    name: '',
    phone: '',
    address: '',
  });

  const selected = useMemo(
    () => customers.find((c) => c.id === valueId) || null,
    [customers, valueId],
  );

  const matches = useMemo(() => matchCustomers(customers, query, 25), [customers, query]);

  useEffect(() => {
    if (selected) {
      setQuery(formatCustomerOptionLabel(selected));
    }
  }, [selected?.id]);

  const clearSelection = () => {
    setQuery('');
    onSelect(null);
  };

  const createCustomer = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('اسم ورقم هاتف العميل مطلوبان.');
      return;
    }
    setCreating(true);
    try {
      const created = await customerService.create({
        code: form.code.trim() || undefined,
        type: form.type,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || undefined,
        createdBy: actor?.userId,
        createdByName: actor?.userName,
      });
      toast.success('تم إضافة العميل للماستر.');
      setOpenCreate(false);
      setForm({ code: '', type: 'consumer', name: '', phone: '', address: '' });
      onCreated?.(created);
      onSelect(created);
    } catch (e: unknown) {
      if (customerService.isDuplicateCodeError(e)) {
        toast.error('كود العميل مستخدم بالفعل.');
      } else {
        toast.error(e instanceof Error ? e.message : 'تعذر إنشاء العميل.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px] space-y-1">
          <Label>العميل (ماستر)</Label>
          <Input
            value={query}
            disabled={disabled}
            placeholder="بحث بالكود أو الاسم أو الموبايل…"
            onChange={(e) => {
              setQuery(toEnglishDigits(e.target.value));
              if (selected) onSelect(null);
            }}
          />
        </div>
        {selected && (
          <Button type="button" variant="outline" disabled={disabled} onClick={clearSelection}>
            مسح
          </Button>
        )}
        {canCreate && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setForm((prev) => ({
                ...prev,
                name: selected ? '' : query && !/—/.test(query) ? query : prev.name,
                phone: prev.phone,
              }));
              setOpenCreate(true);
            }}
          >
            عميل جديد
          </Button>
        )}
      </div>

      {selected && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="font-medium">
            {selected.code} — {selected.name}
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">
            {CUSTOMER_TYPE_LABELS[selected.type]} · {selected.phone}
            {selected.address ? ` · ${selected.address}` : ''}
          </div>
        </div>
      )}

      {!selected && query.trim().length > 0 && (
        <div className="max-h-48 overflow-auto rounded-md border divide-y">
          {matches.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">لا توجد نتائج في الماستر.</div>
          ) : (
            matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full text-start px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(customer);
                  setQuery(formatCustomerOptionLabel(customer));
                }}
              >
                <div className="font-medium">
                  {customer.code} — {customer.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {CUSTOMER_TYPE_LABELS[customer.type]} · {customer.phone}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة عميل للماستر</DialogTitle>
            <DialogDescription>
              يُحفظ في سجل العملاء ويُستخدم من الصيانة وأي موديول لاحق.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>الكود (اختياري — يُولَّد تلقائيًا)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="مثال: CST-00012"
              />
            </div>
            <div className="grid gap-1">
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
            <div className="grid gap-1">
              <Label>الاسم</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>الموبايل</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div className="grid gap-1">
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              إلغاء
            </Button>
            <Button type="button" disabled={creating} onClick={() => void createCustomer()}>
              {creating ? 'جاري الحفظ…' : 'حفظ في الماستر'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
