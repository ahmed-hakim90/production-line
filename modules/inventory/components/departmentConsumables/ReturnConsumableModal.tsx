import React from 'react';
import { Button } from '../../components/UI';
import type { DepartmentConsumableIssue } from '../../types';
import { departmentConsumableLineKey } from '../../lib/departmentConsumableIssue';
import { ModalShell } from './ModalShell';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type Props = {
  issue: DepartmentConsumableIssue | null;
  qtyByLine: Record<string, number>;
  onChangeQty: (lineKey: string, quantity: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
};

export const ReturnConsumableModal: React.FC<Props> = ({
  issue,
  qtyByLine,
  onChangeQty,
  onClose,
  onConfirm,
  busy,
}) => {
  if (!issue) return null;

  return (
    <ModalShell
      title={`مرتجع لسند ${issue.referenceNo}`}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>إغلاق</Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>تأكيد المرتجع</Button>
        </>
      )}
    >
      {(issue.lines || []).map((line) => {
        const lineKey = departmentConsumableLineKey(line);
        const remaining = Number(line.quantity || 0) - Number(line.returnedQty || 0);
        return (
          <label key={lineKey} className="block text-sm space-y-1">
            <span className="font-bold">
              {line.itemName} — المتاح للإرجاع: {fmt(remaining)} {line.unit}
            </span>
            {line.locationCode && (
              <span className="block text-xs text-[var(--color-text-muted)]">
                الرف: {line.locationCode}
              </span>
            )}
            <input
              type="number"
              min={0}
              max={remaining}
              step="any"
              className="w-full border rounded-lg px-3 py-2"
              value={qtyByLine[lineKey] || ''}
              onChange={(e) => onChangeQty(lineKey, Number(e.target.value))}
            />
          </label>
        );
      })}
    </ModalShell>
  );
};
