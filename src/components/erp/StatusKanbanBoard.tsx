import React, { useMemo } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusKanbanColumn = {
  id: string;
  label: string;
  /** Accent color for count badge (css color) */
  accentColor?: string;
};

export type StatusKanbanItem = {
  id: string;
  status: string;
};

export type StatusKanbanBoardProps<T extends StatusKanbanItem> = {
  columns: StatusKanbanColumn[];
  items: T[];
  /** Map item.status → column id when enums/legacy differ */
  resolveColumnId?: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  /** Enable drag between columns */
  draggable?: boolean;
  onMove?: (itemId: string, toStatus: string) => void | Promise<void>;
  emptyColumnLabel?: string;
  loading?: boolean;
  className?: string;
  /** Called when a card is activated (click / Enter). Prefer stopPropagation on inner links. */
  onCardClick?: (item: T) => void;
};

function DraggableKanbanCard({
  id,
  draggable,
  onClick,
  children,
}: {
  id: string;
  draggable: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: !draggable,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-xl border border-border/80 bg-background p-2.5 shadow-sm',
        draggable && 'touch-none cursor-grab active:cursor-grabbing',
        !draggable && onClick && 'cursor-pointer hover:bg-muted/30',
      )}
      onClick={
        onClick
          ? () => {
              if (isDragging) return;
              onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function KanbanColumn<T extends StatusKanbanItem>({
  column,
  items,
  emptyColumnLabel,
  draggable,
  renderCard,
  onCardClick,
}: {
  column: StatusKanbanColumn;
  items: T[];
  emptyColumnLabel: string;
  draggable: boolean;
  renderCard: (item: T) => React.ReactNode;
  onCardClick?: (item: T) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !draggable });
  const color = column.accentColor || 'rgb(var(--color-primary))';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[220px] max-w-[280px] flex-shrink-0 rounded-xl border bg-muted/20 p-2',
        isOver && 'ring-2 ring-primary/40',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <span className="truncate text-sm font-semibold" title={column.label}>
          {column.label}
        </span>
        <Badge
          variant="outline"
          className="tabular-nums"
          style={{
            color,
            borderColor: `${color}55`,
            backgroundColor: `${color}18`,
          }}
        >
          {items.length}
        </Badge>
      </div>
      <div className="min-h-[120px] space-y-2">
        {items.map((item) => (
          <DraggableKanbanCard
            key={item.id}
            id={item.id}
            draggable={draggable}
            onClick={onCardClick ? () => onCardClick(item) : undefined}
          >
            {renderCard(item)}
          </DraggableKanbanCard>
        ))}
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-2 py-6 text-center text-xs text-muted-foreground">
            {emptyColumnLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Generic status kanban for ERP queues (repair jobs, complaints, requests, …).
 * Optional drag moves call `onMove(itemId, columnId)` — callers enforce permissions/transitions.
 */
export function StatusKanbanBoard<T extends StatusKanbanItem>({
  columns,
  items,
  resolveColumnId,
  renderCard,
  draggable = false,
  onMove,
  emptyColumnLabel = 'لا عناصر',
  loading = false,
  className,
  onCardClick,
}: StatusKanbanBoardProps<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const groups = useMemo(() => {
    const g: Record<string, T[]> = {};
    columns.forEach((col) => {
      g[col.id] = [];
    });
    const fallback = columns[0]?.id;
    const known = new Set(columns.map((c) => c.id));
    items.forEach((item) => {
      const raw = resolveColumnId ? resolveColumnId(item) : item.status;
      const key = known.has(raw) ? raw : fallback;
      if (!key) return;
      if (!g[key]) g[key] = [];
      g[key].push(item);
    });
    return g;
  }, [columns, items, resolveColumnId]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!draggable || !onMove) return;
    const itemId = String(event.active.id || '');
    const overId = event.over?.id != null ? String(event.over.id) : '';
    if (!itemId || !overId) return;
    const current = items.find((row) => row.id === itemId);
    if (!current) return;
    const currentCol = resolveColumnId ? resolveColumnId(current) : current.status;
    if (currentCol === overId) return;
    void onMove(itemId, overId);
  };

  if (loading) {
    return (
      <div className={cn('py-10 text-center text-sm text-muted-foreground', className)} role="status" aria-live="polite">
        جاري التحميل...
      </div>
    );
  }

  const board = (
    <div className={cn('flex min-h-[320px] items-start gap-3 overflow-x-auto pb-1', className)}>
      {columns.map((col) => (
        <KanbanColumn
          key={col.id}
          column={col}
          items={groups[col.id] || []}
          emptyColumnLabel={emptyColumnLabel}
          draggable={draggable}
          renderCard={renderCard}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );

  if (!draggable) return board;

  return (
    <DndContext sensors={sensors} onDragEnd={(ev) => void handleDragEnd(ev)}>
      {board}
    </DndContext>
  );
}
