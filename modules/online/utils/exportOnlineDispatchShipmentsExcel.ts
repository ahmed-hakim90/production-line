import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { OnlineDispatchShipment } from '../../../types';
import { ONLINE_DISPATCH_STATUS_LABEL } from '../components/OnlineDispatchStatusBadge';
import { onlineDispatchTsToMs } from '../services/onlineDispatchService';
import { onlineDispatchCreatorUid } from './onlineDispatchActorUids';

type ExportRow = OnlineDispatchShipment & { id: string };

function formatTs(ts: unknown): string {
  const ms = onlineDispatchTsToMs(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function labelFor(uid: string | undefined, userLabels: Record<string, string>): string {
  if (!uid) return '—';
  return userLabels[uid] ?? '…';
}

export type OnlineDispatchExportExcelRow = {
  الباركود: string;
  الحالة: string;
  'تاريخ الإنشاء': string;
  المنشئ: string;
  'تسليم المخزن — الوقت': string;
  'تسليم المخزن — المستخدم': string;
  'تسليم البوسطة — الوقت': string;
  'تسليم البوسطة — المستخدم': string;
  'إلغاء من التسليم — الوقت': string;
  'إلغاء من التسليم — المستخدم': string;
  ملاحظات: string;
};

function toSheetRows(rows: ExportRow[], userLabels: Record<string, string>): OnlineDispatchExportExcelRow[] {
  return rows.map((r) => ({
    الباركود: r.barcode,
    الحالة: ONLINE_DISPATCH_STATUS_LABEL[r.status] ?? r.status,
    'تاريخ الإنشاء': formatTs(r.createdAt),
    المنشئ: labelFor(onlineDispatchCreatorUid(r), userLabels),
    'تسليم المخزن — الوقت': formatTs(r.handedToWarehouseAt),
    'تسليم المخزن — المستخدم': labelFor(r.handedToWarehouseByUid, userLabels),
    'تسليم البوسطة — الوقت': formatTs(r.handedToPostAt),
    'تسليم البوسطة — المستخدم': labelFor(r.handedToPostByUid, userLabels),
    'إلغاء من التسليم — الوقت': formatTs(r.cancelledAt),
    'إلغاء من التسليم — المستخدم': labelFor(r.cancelledByUid, userLabels),
    ملاحظات: (r.notes ?? '').trim() || '—',
  }));
}

function defaultFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `online-dispatch-shipments_${stamp}.xlsx`;
}

/**
 * Downloads an .xlsx of online dispatch rows with Arabic headers.
 * Pass `userLabels` from `useFirestoreUserLabels` for all UIDs appearing in `rows`.
 */
export function exportOnlineDispatchShipmentsExcel(
  rows: ExportRow[],
  userLabels: Record<string, string>,
  fileName: string = defaultFileName(),
): void {
  if (rows.length === 0) return;
  const sheetRows = toSheetRows(rows, userLabels);
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'شحنات');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), fileName);
}

/** Collect every UID needed to resolve labels for an export row set. */
export function collectOnlineDispatchExportUids(rows: ExportRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const c = onlineDispatchCreatorUid(r);
    if (c) s.add(c);
    if (r.handedToWarehouseByUid) s.add(r.handedToWarehouseByUid);
    if (r.handedToPostByUid) s.add(r.handedToPostByUid);
    if (r.cancelledByUid) s.add(r.cancelledByUid);
    if (r.lastStatusByUid) s.add(r.lastStatusByUid);
  }
  return [...s];
}
