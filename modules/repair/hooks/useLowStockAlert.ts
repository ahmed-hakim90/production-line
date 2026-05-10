import { useEffect, useMemo, useRef, useState } from 'react';
import type { RepairSparePart, RepairSparePartStock } from '../types';
import { sparePartsService } from '../services/sparePartsService';

export interface LowStockEntry {
  partId: string;
  partName: string;
  quantity: number;
  minStock: number;
}

export function useLowStockAlert(branchId?: string) {
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const [reservedByPart, setReservedByPart] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState(false);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (!branchId) return;
    void sparePartsService.listParts(branchId).then(setParts);
    void sparePartsService.listStock(branchId).then(setStock);
    void sparePartsService.listActiveReservationsForBranch(branchId).then((rows) => {
      const m: Record<string, number> = {};
      rows.forEach((r) => {
        const pid = String(r.partId || '').trim();
        if (!pid) return;
        m[pid] = (m[pid] || 0) + Number(r.quantity || 0);
      });
      setReservedByPart(m);
    });
  }, [branchId]);

  const lowStockEntries = useMemo<LowStockEntry[]>(() => {
    const minByPart = new Map(parts.map((p) => [p.id || '', Number(p.minStock || 0)]));
    return stock
      .map((s) => ({
        partId: s.partId,
        partName: s.partName,
        quantity: Number(s.quantity || 0),
        minStock: Number(minByPart.get(s.partId) || 0),
      }))
      .map((s) => {
        const reserved = reservedByPart[s.partId] || 0;
        const effective = Math.max(0, s.quantity - reserved);
        return { ...s, quantity: effective };
      })
      .filter((s) => s.minStock > 0 && s.quantity <= s.minStock);
  }, [parts, stock, reservedByPart]);

  const shouldOpen = lowStockEntries.length > 0 && !dismissed;

  useEffect(() => {
    if (!shouldOpen || hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    try {
      void new Audio('/alert.mp3').play().catch(() => {});
    } catch {
      // ignore
    }
  }, [shouldOpen]);

  return {
    lowStockEntries,
    isOpen: shouldOpen,
    dismiss: () => setDismissed(true),
  };
}
