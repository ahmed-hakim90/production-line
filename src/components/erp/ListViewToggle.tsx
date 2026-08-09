import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ListViewMode = 'table' | 'kanban';

export type ListViewToggleProps = {
  value: ListViewMode;
  onChange: (mode: ListViewMode) => void;
  className?: string;
  /** Hide labels on very tight toolbars */
  compact?: boolean;
};

/**
 * Shared table ↔ kanban switch used on ERP list pages (especially repair queues).
 */
export const ListViewToggle: React.FC<ListViewToggleProps> = ({
  value,
  onChange,
  className,
  compact = false,
}) => (
  <div
    className={cn('inline-flex rounded-lg border border-border/80 bg-background p-0.5', className)}
    role="group"
    aria-label="عرض القائمة"
  >
    <Button
      variant={value === 'kanban' ? 'default' : 'ghost'}
      size="sm"
      type="button"
      className="h-8 gap-1"
      aria-pressed={value === 'kanban'}
      onClick={() => onChange('kanban')}
    >
      <LayoutGrid className="h-3.5 w-3.5" />
      {compact ? null : 'كنبان'}
    </Button>
    <Button
      variant={value === 'table' ? 'default' : 'ghost'}
      size="sm"
      type="button"
      className="h-8 gap-1"
      aria-pressed={value === 'table'}
      onClick={() => onChange('table')}
    >
      <List className="h-3.5 w-3.5" />
      {compact ? null : 'جدول'}
    </Button>
  </div>
);

const STORAGE_PREFIX = 'erp-list-view:';

function getLocalStorage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') {
      return store;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readStoredListViewMode(
  pageId: string,
  fallback: ListViewMode = 'kanban',
): ListViewMode {
  const store = getLocalStorage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(`${STORAGE_PREFIX}${pageId}`);
    if (raw === 'table' || raw === 'kanban') return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredListViewMode(pageId: string, mode: ListViewMode): void {
  const store = getLocalStorage();
  if (!store) return;
  try {
    store.setItem(`${STORAGE_PREFIX}${pageId}`, mode);
  } catch {
    /* ignore */
  }
}

/** Persist table/kanban preference per page in localStorage. */
export function useListViewMode(
  pageId: string,
  fallback: ListViewMode = 'kanban',
): [ListViewMode, (mode: ListViewMode) => void] {
  const [mode, setMode] = React.useState<ListViewMode>(() =>
    readStoredListViewMode(pageId, fallback),
  );

  const onChange = React.useCallback(
    (next: ListViewMode) => {
      setMode(next);
      writeStoredListViewMode(pageId, next);
    },
    [pageId],
  );

  return [mode, onChange];
}
