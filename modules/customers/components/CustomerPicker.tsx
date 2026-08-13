import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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
import { cn, getRootPortalContainer } from '@/lib/utils';
import { FLOATING_MENU_Z_CLASS } from '@/lib/overlayStack';
import { toEnglishDigits } from '@/lib/englishDigits';
import { isListboxNavKey, isListboxOpenKey, listboxIndexAfterKey } from '@/lib/listboxKeyboard';
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

type ListBoxStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
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
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef(0);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [listStyle, setListStyle] = useState<ListBoxStyle | null>(null);
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
  const showList = Boolean(!disabled && !selected && listOpen);

  useEffect(() => {
    if (selected) {
      setQuery(formatCustomerOptionLabel(selected));
      setListOpen(false);
    }
  }, [selected?.id]);

  const moveHighlight = useCallback((next: number) => {
    const max = Math.max(0, matches.length - 1);
    const clamped = Math.max(0, Math.min(next, max));
    highlightRef.current = clamped;
    setHighlight(clamped);
  }, [matches.length]);

  useEffect(() => {
    highlightRef.current = 0;
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (highlightRef.current > Math.max(0, matches.length - 1)) {
      moveHighlight(Math.max(0, matches.length - 1));
    }
  }, [matches.length, moveHighlight]);

  const updateListPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, Math.min(280, preferBelow ? spaceBelow : spaceAbove));
    const top = preferBelow
      ? rect.bottom + gap
      : Math.max(8, rect.top - gap - maxHeight);
    setListStyle({
      top,
      left: rect.left,
      width: Math.max(rect.width, 240),
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showList) {
      setListStyle(null);
      return;
    }
    updateListPosition();
    const onReposition = () => updateListPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [showList, matches.length, updateListPosition]);

  useEffect(() => {
    if (!showList) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-customer-opt-index="${highlight}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, showList, matches.length]);

  useEffect(() => {
    const onDocPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setListOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, []);

  const pickCustomer = (customer: Customer) => {
    onSelect(customer);
    setQuery(formatCustomerOptionLabel(customer));
    setListOpen(false);
  };

  const clearSelection = () => {
    setQuery('');
    setListOpen(false);
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

  const portalTarget = getRootPortalContainer() ?? (typeof document !== 'undefined' ? document.body : null);
  const listbox =
    showList && listStyle && portalTarget
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            dir="rtl"
            style={{
              position: 'fixed',
              top: listStyle.top,
              left: listStyle.left,
              width: listStyle.width,
              maxHeight: listStyle.maxHeight,
              zIndex: 10100,
              margin: 0,
              overflow: 'auto',
              borderRadius: 'var(--border-radius-base, 12px)',
              border: '1px solid var(--color-border, #e5e7eb)',
              backgroundColor: 'var(--color-card, #ffffff)',
              color: 'var(--color-text, #0f172a)',
              boxShadow: 'var(--shadow-dropdown, 0 4px 12px rgba(0,0,0,0.12))',
            }}
            className={cn(FLOATING_MENU_Z_CLASS, 'erp-surface')}
          >
            {matches.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-muted-foreground">لا توجد نتائج في الماستر.</div>
            ) : (
              matches.map((customer, idx) => {
                const active = idx === highlight;
                return (
                  <button
                    key={customer.id}
                    id={`${listId}-opt-${idx}`}
                    type="button"
                    role="option"
                    data-customer-opt-index={idx}
                    aria-selected={active}
                    className={cn(
                      'w-full text-start px-3 py-2 text-sm border-0 border-b last:border-b-0 border-[var(--color-border)]',
                      active ? 'bg-[rgb(var(--color-primary)/0.12)]' : 'bg-transparent hover:bg-[rgb(var(--color-primary)/0.08)]',
                    )}
                    onMouseEnter={() => moveHighlight(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickCustomer(customer);
                    }}
                  >
                    <div className="font-medium">
                      {customer.code} — {customer.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {CUSTOMER_TYPE_LABELS[customer.type]} · {customer.phone}
                    </div>
                  </button>
                );
              })
            )}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px] space-y-1">
          <Label htmlFor={`${listId}-input`}>العميل (ماستر)</Label>
          <Input
            ref={inputRef}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && matches[highlight] ? `${listId}-opt-${highlight}` : undefined
            }
            value={query}
            disabled={disabled}
            autoComplete="off"
            placeholder="بحث بالكود أو الاسم أو الموبايل…"
            onFocus={() => {
              if (disabled || selected) return;
              setListOpen(true);
            }}
            onChange={(e) => {
              setQuery(toEnglishDigits(e.target.value));
              if (selected) onSelect(null);
              setListOpen(true);
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setListOpen(false);
                return;
              }
              if (e.key === 'Tab') {
                setListOpen(false);
                return;
              }
              if (selected) return;
              if (isListboxOpenKey(e.key) && !listOpen) {
                e.preventDefault();
                e.stopPropagation();
                setListOpen(true);
                moveHighlight(e.key === 'ArrowUp' || e.key === 'Up' ? Math.max(0, matches.length - 1) : 0);
                return;
              }
              if (!listOpen) return;
              if (isListboxNavKey(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                moveHighlight(listboxIndexAfterKey(e.key, highlightRef.current, matches.length));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const pick = matches[Math.min(highlightRef.current, Math.max(0, matches.length - 1))];
                if (pick) pickCustomer(pick);
              }
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

      {listbox}

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
