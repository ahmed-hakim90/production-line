import {
  REPAIR_JOB_STATUS_COLORS,
  REPAIR_JOB_STATUS_LABELS,
} from '../types';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalize #RGB / #RRGGBB; returns null when invalid. */
export function normalizeRepairStatusHex(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!HEX_RE.test(value)) return null;
  if (value.length === 4) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value.toLowerCase();
}

export type RepairStatusChipStyle = {
  color: string;
  borderColor: string;
  backgroundColor: string;
};

/** Soft bordered chip colors from a status hex (ERP StatusBadge look). */
export function repairStatusChipStyle(hex: string | null | undefined): RepairStatusChipStyle {
  const color = normalizeRepairStatusHex(hex) || '#64748b';
  return {
    color,
    borderColor: `${color}4d`,
    backgroundColor: `${color}1a`,
  };
}

export type RepairStatusChipResolved = {
  label: string;
  color: string;
  style: RepairStatusChipStyle;
};

/**
 * Resolve job-status chip label/color from settings statusMap with type fallbacks.
 * Settings values win when present and valid.
 */
export function resolveRepairStatusChip(
  status: string,
  statusMap?: Record<string, { label?: string; color?: string } | undefined> | null,
): RepairStatusChipResolved {
  const raw = String(status || '').trim();
  const key = mapLegacyRepairStatus(raw);
  const fromMap = statusMap?.[key] || statusMap?.[raw];
  const label =
    String(fromMap?.label || '').trim() ||
    REPAIR_JOB_STATUS_LABELS[key] ||
    REPAIR_JOB_STATUS_LABELS[raw] ||
    key ||
    '—';
  const color =
    normalizeRepairStatusHex(fromMap?.color) ||
    normalizeRepairStatusHex(REPAIR_JOB_STATUS_COLORS[key]) ||
    normalizeRepairStatusHex(REPAIR_JOB_STATUS_COLORS[raw]) ||
    '#64748b';
  return { label, color, style: repairStatusChipStyle(color) };
}
