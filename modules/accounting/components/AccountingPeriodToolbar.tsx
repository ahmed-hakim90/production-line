import React from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountOption = { code: string; name: string };

type AccountingPeriodToolbarProps = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  accountCode?: string;
  onAccountChange?: (value: string) => void;
  accounts?: AccountOption[];
  onPrint?: () => void;
  onExport?: () => void;
};

export const AccountingPeriodToolbar: React.FC<
  AccountingPeriodToolbarProps
> = ({
  from,
  to,
  onFromChange,
  onToChange,
  onRefresh,
  refreshing,
  accountCode,
  onAccountChange,
  accounts,
  onPrint,
  onExport,
}) => (
  <div className="flex flex-wrap items-end gap-3 print:hidden">
    <div>
      <Label>من</Label>
      <Input
        type="date"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
      />
    </div>
    <div>
      <Label>إلى</Label>
      <Input
        type="date"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
      />
    </div>
    {accounts && onAccountChange ? (
      <div className="min-w-72">
        <Label>الحساب</Label>
        <Select
          value={accountCode || undefined}
          onValueChange={onAccountChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر الحساب" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((row) => (
              <SelectItem key={row.code} value={row.code}>
                {row.code} — {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null}
    <div className="flex flex-wrap gap-2">
      {onRefresh ? (
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className="ms-1 h-4 w-4" />
          تحديث
        </Button>
      ) : null}
      {onPrint ? (
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="ms-1 h-4 w-4" />
          طباعة
        </Button>
      ) : null}
      {onExport ? (
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="ms-1 h-4 w-4" />
          Excel/CSV
        </Button>
      ) : null}
    </div>
  </div>
);
