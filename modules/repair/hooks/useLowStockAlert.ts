import { useEffect, useRef, useState } from 'react';
import { sparePartsService } from '../services/sparePartsService';
import type { RepairSparePart, RepairSparePartStock } from '../types';

interface LowStockItem {
  part: RepairSparePart;
  stock: RepairSparePartStock;
}

const SESSION_DISMISSED_KEY = 'repair_low_stock_dismissed';

export function useLowStockAlert(branchId: string, parts: RepairSparePart[]) {
  const [stock, setStock] = useState<RepairSparePartStock[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  // Load dismissed set from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_DISMISSED_KEY);
      if (stored) dismissedRef.current = new Set(JSON.parse(stored));
    } catch {}
  }, []);

  // Subscribe to stock changes
  useEffect(() => {
    if (!branchId) return;
    const unsub = sparePartsService.subscribeStock(branchId, setStock);
    return () => unsub();
  }, [branchId]);

  // Compute low stock items whenever stock or parts change
  useEffect(() => {
    if (parts.length === 0 || stock.length === 0) return;

    const partsMap = new Map(parts.map((p) => [p.id!, p]));
    const stockMap = new Map(stock.map((s) => [s.partId, s]));

    const low: LowStockItem[] = [];
    for (const [partId, part] of partsMap) {
      const s = stockMap.get(partId);
      const qty = s?.quantity ?? 0;
      if (qty <= part.minStock && !dismissedRef.current.has(partId)) {
        low.push({ part, stock: s ?? { branchId, partId, partName: part.name, quantity: 0, updatedAt: '' } });
      }
    }

    if (low.length > 0) {
      setLowStockItems(low);
      setAlertVisible(true);
      playAlert();
    }
  }, [stock, parts]);

  function playAlert() {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/alert.mp3');
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Browser may block autoplay — silent fallback
      });
    } catch {}
  }

  function dismiss() {
    // Mark all current low items as dismissed for this session
    for (const item of lowStockItems) {
      dismissedRef.current.add(item.part.id!);
    }
    try {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, JSON.stringify([...dismissedRef.current]));
    } catch {}
    setAlertVisible(false);
  }

  return { lowStockItems, alertVisible, dismiss };
}
