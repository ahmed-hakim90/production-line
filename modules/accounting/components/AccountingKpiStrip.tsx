import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatAccountingMoney } from "../lib/accountingUi";

export type AccountingKpiItem = {
  label: string;
  value: number;
  tone?: "default" | "blue" | "amber" | "emerald" | "rose" | "violet";
  suffix?: string;
  /** Default money (2 decimals). Use `integer` for counts. */
  format?: "money" | "integer";
};

const TONE_CLASS: Record<NonNullable<AccountingKpiItem["tone"]>, string> = {
  default: "text-foreground",
  blue: "text-blue-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  violet: "text-violet-700",
};

export const AccountingKpiStrip: React.FC<{ items: AccountingKpiItem[] }> = ({
  items,
}) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {items.map((item) => (
      <Card key={item.label} className="shadow-none">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${TONE_CLASS[item.tone || "default"]}`}
          >
            {item.format === "integer"
              ? Number(item.value || 0).toLocaleString("ar-EG")
              : formatAccountingMoney(item.value)}
            {item.suffix ? (
              <span className="ms-1 text-xs font-medium text-muted-foreground">
                {item.suffix}
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>
    ))}
  </div>
);
