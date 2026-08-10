import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Page background (light gray) vs white cards */
export const PAGE_BG = "bg-[var(--color-bg)] dark:bg-background";

/** Primary surface cards on the page */
export const SURFACE_CARD =
  "border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-desk-card)] dark:border-border dark:bg-card dark:shadow-sm";

/** Collapsible section header row */
export const COLLAPSE_HEADER =
  "border-b border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-surface-hover)]/90 dark:border-border dark:bg-card dark:hover:bg-muted/40";

/** Nested KPI / metric tiles inside a white card */
export const NESTED_TILE =
  "rounded-lg border border-[var(--color-border)]/90 bg-[var(--color-bg)] dark:border-border dark:bg-muted/35";

/** Inputs/selects on a panel */
export const FIELD_ON_PANEL = "border-[var(--color-border)] bg-[var(--color-card)] dark:border-input dark:bg-background";

export function SectionSkeleton({ rows = 4, height = 16 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton key={idx} className="w-full rounded-md" style={{ height }} />
      ))}
    </div>
  );
}

/** Outer wrapper: RTL, page background, padding — use with `DetailPageStickyHeader` for detail pages */
export function DetailPageShell({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-h-screen space-y-4 p-4 md:p-6", PAGE_BG, className)} {...props}>
      {children}
    </div>
  );
}

/** Sticky top bar (header + optional filter card) with backdrop blur */
export function DetailPageStickyHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sticky top-0 z-10 space-y-3 pb-2 pt-0 backdrop-blur-sm", PAGE_BG, className)}>
      {children}
    </div>
  );
}

export function DetailCollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn("overflow-hidden", SURFACE_CARD)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 px-4 py-3 text-right transition-colors",
              COLLAPSE_HEADER,
            )}
          >
            <span className="text-sm font-semibold text-[var(--color-text)] dark:text-foreground">{title}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-[var(--color-text-muted)] transition-transform dark:text-muted-foreground",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4 pt-3 dark:border-border/60 dark:bg-card">{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
