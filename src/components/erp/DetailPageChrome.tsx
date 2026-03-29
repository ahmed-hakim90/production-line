import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Page background (light gray) vs white cards */
export const PAGE_BG = "bg-slate-100 dark:bg-background";

/** Primary surface cards on the page */
export const SURFACE_CARD =
  "border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card dark:shadow-sm";

/** Collapsible section header row */
export const COLLAPSE_HEADER =
  "border-b border-slate-200 bg-white hover:bg-slate-50/90 dark:border-border dark:bg-card dark:hover:bg-muted/40";

/** Nested KPI / metric tiles inside a white card */
export const NESTED_TILE =
  "rounded-lg border border-slate-200/90 bg-slate-50 dark:border-border dark:bg-muted/35";

/** Inputs/selects on a panel */
export const FIELD_ON_PANEL = "border-slate-200 bg-white dark:border-input dark:bg-background";

export function SectionSkeleton({ rows = 4, height = 16 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton key={idx} className="w-full rounded-md" style={{ height }} />
      ))}
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
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{title}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-slate-500 transition-transform dark:text-muted-foreground",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-slate-100 bg-white p-4 pt-3 dark:border-border/60 dark:bg-card">{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
