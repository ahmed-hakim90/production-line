/**
 * ERPNext-style global Toast / Alert notification system.
 *
 * Usage:
 *   import { toast } from '../components/Toast';
 *   toast.success('تم الحفظ بنجاح');
 *   toast.error('فشل في الحفظ');
 *   toast.warning('تحذير');
 *   toast.info('معلومة');
 */
import React, { useEffect, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

// ─── tiny pub/sub store ──────────────────────────────────────────────────────

let _id = 0;
let _items: ToastItem[] = [];
const _listeners = new Set<Listener>();

function emit() {
  _listeners.forEach((fn) => fn([..._items]));
}

function add(type: ToastType, message: string, duration = 4000) {
  const id = ++_id;
  _items = [..._items, { id, type, message, duration }];
  emit();
  setTimeout(() => remove(id), duration + 300);
}

function remove(id: number) {
  _items = _items.filter((t) => t.id !== id);
  emit();
}

/** Programmatic API – use this anywhere in the app */
export const toast = {
  success: (msg: string, dur?: number) => add('success', msg, dur),
  error:   (msg: string, dur?: number) => add('error',   msg, dur),
  warning: (msg: string, dur?: number) => add('warning', msg, dur),
  info:    (msg: string, dur?: number) => add('info',    msg, dur),
};

// ─── icons ───────────────────────────────────────────────────────────────────

const ICONS: Record<ToastType, string> = {
  success: 'check_circle',
  error:   'error',
  warning: 'warning',
  info:    'info',
};

// ─── React component ─────────────────────────────────────────────────────────

export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [exiting, setExiting] = useState<Set<number>>(new Set());

  useEffect(() => {
    _listeners.add(setItems);
    return () => { _listeners.delete(setItems); };
  }, []);

  const dismiss = useCallback((id: number) => {
    setExiting((prev) => new Set([...prev, id]));
    setTimeout(() => {
      remove(id);
      setExiting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }, 250);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="erp-toast-container">
      {items.map((t) => (
        <div
          key={t.id}
          className={`erp-toast erp-toast-${t.type}`}
          style={{
            opacity: exiting.has(t.id) ? 0 : 1,
            transform: exiting.has(t.id) ? 'translateY(-8px) scale(0.96)' : undefined,
            transition: 'opacity 200ms, transform 200ms',
          }}
        >
          <span className="material-icons-round text-[18px] shrink-0">{ICONS[t.type]}</span>
          <span className="flex-1 text-[13px] font-medium">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span className="material-icons-round text-[16px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
};
