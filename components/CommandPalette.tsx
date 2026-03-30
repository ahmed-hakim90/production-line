/**
 * ERPNext-style Global Command Palette (Awesomebar)
 * Triggered via Ctrl+K or the search button in Topbar
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';
import {
  BarChart3,
  Boxes,
  Factory,
  FileBarChart2,
  FolderOpen,
  Home,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  Users,
  Circle,
  type LucideIcon,
} from 'lucide-react';
import { MENU_CONFIG, canAccessMenuItem } from '@/config/menu.config';
import { usePermission } from '@/utils/permissions';

interface PaletteItem {
  key: string;
  label: string;
  group: string;
  groupIcon: string;
  icon: string;
  path: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const PALETTE_ICON_MAP: Record<string, LucideIcon> = {
  analytics: BarChart3,
  bar_chart: BarChart3,
  category: FolderOpen,
  dashboard: Home,
  factory: Factory,
  folder: FolderOpen,
  groups: Users,
  inventory: Boxes,
  report: FileBarChart2,
  security: ShieldCheck,
  settings: Settings,
};

function renderPaletteIcon(name?: string, className?: string, size = 16) {
  if (!name) return null;
  const Lucide = PALETTE_ICON_MAP[name];
  if (Lucide) return <Lucide size={size} className={className} />;
  return <Circle size={size} className={className} />;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can }  = usePermission();

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    MENU_CONFIG.forEach((group) => {
      group.children.forEach((item) => {
        if (canAccessMenuItem(can, item)) {
          items.push({
            key: item.key,
            label: item.label,
            group: group.label,
            groupIcon: group.icon,
            icon: item.icon,
            path: item.path,
          });
        }
      });
    });
    return items;
  }, [can]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 8);
    const q = query.toLowerCase().trim();
    return allItems.filter(
      (i) => i.label.includes(q) || i.group.includes(q) || i.path.includes(q),
    ).slice(0, 10);
  }, [query, allItems]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  const go = useCallback((item: PaletteItem) => {
    navigate(withTenantPath(tenantSlug, item.path));
    onClose();
  }, [navigate, onClose, tenantSlug]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && filtered[activeIdx]) { go(filtered[activeIdx]); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, filtered, activeIdx, go, onClose]);

  /* Scroll active item into view */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-[540px] rounded-[var(--border-radius-lg)] bg-[var(--color-card)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-modal, 0 16px 48px rgba(0,0,0,0.14))' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[var(--color-border)]">
          <Search size={18} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="ابحث في النظام... (صفحة، تقرير، وحدة)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[13.5px] text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            dir="rtl"
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-muted)] bg-[#f0f2f5] border border-[var(--color-border)]">
            Esc
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--color-text-muted)]">
              <SearchX size={30} className="mb-2 block opacity-30 mx-auto" />
              لا توجد نتائج لـ "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.key}
                data-idx={idx}
                onClick={() => go(item)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={[
                  'w-full flex items-center gap-3 px-3.5 py-2.5 transition-colors text-start',
                  idx === activeIdx ? 'bg-primary/5' : 'hover:bg-[#f0f2f5]',
                ].join(' ')}
              >
                {/* Item icon */}
                <span className={[
                  'w-8 h-8 rounded-[var(--border-radius-sm)] flex items-center justify-center shrink-0',
                  idx === activeIdx ? 'bg-primary/10 text-primary' : 'bg-[#f0f2f5] text-[var(--color-text-muted)]',
                ].join(' ')}>
                  {renderPaletteIcon(item.icon, undefined, 16)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] truncate ${idx === activeIdx ? 'text-primary font-semibold' : 'text-[var(--color-text)] font-medium'}`}>
                    {item.label}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1 truncate">
                    {renderPaletteIcon(item.groupIcon, undefined, 11)}
                    {item.group}
                  </p>
                </div>
                {idx === activeIdx && (
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-muted)] bg-[#f0f2f5] border border-[var(--color-border)] shrink-0">
                    Enter ↵
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-[var(--color-border)] px-3.5 py-2 flex items-center gap-3 text-[10.5px] text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#f0f2f5] border border-[var(--color-border)] font-mono">↑↓</kbd> تنقل</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#f0f2f5] border border-[var(--color-border)] font-mono">↵</kbd> فتح</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-[#f0f2f5] border border-[var(--color-border)] font-mono">Esc</kbd> إغلاق</span>
          <span className="mr-auto flex items-center gap-1 opacity-70">
            <kbd className="px-1 py-0.5 rounded bg-[#f0f2f5] border border-[var(--color-border)] font-mono">Ctrl K</kbd> فتح سريع
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

