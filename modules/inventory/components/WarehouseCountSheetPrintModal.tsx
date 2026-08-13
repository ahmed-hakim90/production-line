import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './UI';
import { ModalShell } from './departmentConsumables/ModalShell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';
import type { StockItemBalance, Warehouse, WarehouseLocation, WarehouseRack, WarehouseRole } from '../types';
import type { WarehouseCountSheetScope } from '../lib/warehouseCountSheet';
import type { PrintWarehouseCountInput } from '../hooks/useWarehouseCountSheetPrint';
import { cn } from '@/lib/utils';

type WarehouseOption = {
  value: string;
  label: string;
  warehouseRole?: WarehouseRole;
};

type Props = {
  open: boolean;
  onClose: () => void;
  warehouses: WarehouseOption[] | Warehouse[];
  balances: StockItemBalance[];
  initialWarehouseId?: string;
  warehouseSelectLocked?: boolean;
  printing?: boolean;
  resolveWarehouseRole?: (warehouseId: string) => WarehouseRole | undefined;
  onPrint: (input: PrintWarehouseCountInput) => void | Promise<void>;
};

const SCOPE_OPTIONS: Array<{ id: WarehouseCountSheetScope; label: string; hint: string }> = [
  { id: 'warehouse', label: 'المخزن كله', hint: 'كل الأصناف في المخزن' },
  { id: 'rack', label: 'راك', hint: 'كل الأرفف داخل راك واحد' },
  { id: 'shelf', label: 'رف', hint: 'رف واحد فقط' },
];

function toOptions(warehouses: Props['warehouses']): WarehouseOption[] {
  return warehouses
    .map((row) => {
      if ('value' in row) return row;
      return {
        value: String(row.id || ''),
        label: row.name,
        warehouseRole: row.warehouseRole,
      };
    })
    .filter((row) => row.value);
}

function rackLabel(rack: WarehouseRack): string {
  const name = String(rack.name || '').trim();
  const code = String(rack.code || '').trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || rack.id || 'راك';
}

function shelfLabel(loc: WarehouseLocation): string {
  const name = String(loc.shelfName || loc.shelf || '').trim();
  const code = String(loc.code || '').trim();
  if (name && code && name !== code) return `${name} — ${code}`;
  return code || name || loc.id || 'رف';
}

export const WarehouseCountSheetPrintModal: React.FC<Props> = ({
  open,
  onClose,
  warehouses,
  balances,
  initialWarehouseId,
  warehouseSelectLocked,
  printing,
  resolveWarehouseRole,
  onPrint,
}) => {
  const options = useMemo(() => toOptions(warehouses), [warehouses]);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId || options[0]?.value || '');
  const [scope, setScope] = useState<WarehouseCountSheetScope>('warehouse');
  const [rackId, setRackId] = useState('');
  const [shelfId, setShelfId] = useState('');
  const [racks, setRacks] = useState<WarehouseRack[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initialWarehouseId || options[0]?.value || '';
    setWarehouseId(next);
    setScope('warehouse');
    setRackId('');
    setShelfId('');
  }, [open, initialWarehouseId, options]);

  useEffect(() => {
    if (!open) return;
    const id = String(warehouseId || '').trim();
    if (!id) {
      setRacks([]);
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLoadingLookups(true);
    Promise.all([
      warehouseRackService.getAll(id).catch(() => [] as WarehouseRack[]),
      warehouseLocationService.getAll(id).catch(() => [] as WarehouseLocation[]),
    ]).then(([nextRacks, nextLocations]) => {
      if (cancelled) return;
      setRacks(nextRacks.filter((row) => row.isActive !== false && row.id));
      setLocations(nextLocations.filter((row) => row.isActive !== false && row.id));
    }).finally(() => {
      if (!cancelled) setLoadingLookups(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId]);

  const selectedWarehouse = options.find((row) => row.value === warehouseId);
  const selectedRack = racks.find((row) => row.id === rackId) || null;
  const shelvesForRack = useMemo(() => {
    if (!selectedRack) return [];
    return locations.filter((loc) => {
      if (loc.rackId && selectedRack.id && loc.rackId === selectedRack.id) return true;
      const rackCode = String(selectedRack.code || '').trim().toLowerCase();
      const locCode = String(loc.rackCode || loc.rack || '').trim().toLowerCase();
      return Boolean(rackCode && locCode && locCode === rackCode);
    });
  }, [locations, selectedRack]);
  const selectedShelf = shelvesForRack.find((row) => row.id === shelfId) || null;

  const canSubmit = Boolean(warehouseId)
    && !printing
    && !loadingLookups
    && (scope === 'warehouse' || (scope === 'rack' && selectedRack) || (scope === 'shelf' && selectedShelf));

  const changeWarehouse = (id: string) => {
    setWarehouseId(id);
    setRackId('');
    setShelfId('');
  };

  const changeRack = (id: string) => {
    setRackId(id);
    setShelfId('');
  };

  const submit = () => {
    if (!canSubmit || !warehouseId) return;
    const warehouseRole = resolveWarehouseRole?.(warehouseId) || selectedWarehouse?.warehouseRole;
    onClose();
    void onPrint({
      warehouseId,
      warehouseName: selectedWarehouse?.label || warehouseId,
      warehouseRole,
      balances: balances.filter((row) => row.warehouseId === warehouseId),
      scope,
      rack: selectedRack,
      shelf: selectedShelf,
    });
  };

  if (!open) return null;

  return (
    <ModalShell
      title="طباعة ورقة الجرد"
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" variant="primary" disabled={!canSubmit} onClick={submit}>
            {printing ? 'جاري تجهيز الجرد…' : 'طباعة'}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        اختَر المخزن ثم حدّد هل تطبع المخزن كله، راك معيّن بكل أرففه، أو رف واحد.
      </p>
      <div className="space-y-1">
        <label className="text-sm font-semibold" htmlFor="count-sheet-warehouse">المخزن</label>
        <Select
          value={warehouseId || 'none'}
          disabled={warehouseSelectLocked || options.length <= 1}
          onValueChange={(value) => changeWarehouse(value === 'none' ? '' : value)}
        >
          <SelectTrigger id="count-sheet-warehouse" className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]">
            <SelectValue placeholder="اختر المخزن" />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? <SelectItem value="none">لا توجد مخازن</SelectItem> : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">نطاق الجرد</p>
        <div className="grid grid-cols-3 gap-2">
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setScope(option.id)}
                className={cn(
                  'rounded-[var(--border-radius-lg)] border px-2 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {SCOPE_OPTIONS.find((row) => row.id === scope)?.hint}
        </p>
      </div>
      {scope !== 'warehouse' ? (
        <div className="space-y-1">
          <label className="text-sm font-semibold" htmlFor="count-sheet-rack">الراك</label>
          <Select
            value={rackId || 'none'}
            disabled={loadingLookups || racks.length === 0}
            onValueChange={(value) => changeRack(value === 'none' ? '' : value)}
          >
            <SelectTrigger id="count-sheet-rack" className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]">
              <SelectValue placeholder={loadingLookups ? 'جاري التحميل…' : 'اختر الراك'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{racks.length === 0 ? 'لا توجد راكات' : 'اختر الراك'}</SelectItem>
              {racks.map((rack) => (
                <SelectItem key={rack.id} value={String(rack.id)}>
                  {rackLabel(rack)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {scope === 'shelf' ? (
        <div className="space-y-1">
          <label className="text-sm font-semibold" htmlFor="count-sheet-shelf">الرف</label>
          <Select
            value={shelfId || 'none'}
            disabled={!selectedRack || shelvesForRack.length === 0}
            onValueChange={(value) => setShelfId(value === 'none' ? '' : value)}
          >
            <SelectTrigger id="count-sheet-shelf" className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]">
              <SelectValue placeholder={!selectedRack ? 'اختر الراك أولاً' : 'اختر الرف'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {!selectedRack ? 'اختر الراك أولاً' : shelvesForRack.length === 0 ? 'لا توجد أرفف في هذا الراك' : 'اختر الرف'}
              </SelectItem>
              {shelvesForRack.map((loc) => (
                <SelectItem key={loc.id} value={String(loc.id)}>
                  {shelfLabel(loc)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </ModalShell>
  );
};
