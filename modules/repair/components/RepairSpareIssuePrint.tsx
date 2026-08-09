import React from 'react';
import { REPAIR_SPARE_ISSUE_STATUS_LABELS } from '../lib/repairSpareIssue';
import { normalizeRepairSpareIssueAllocations } from '../lib/repairSpareIssueAllocation';
import type { RepairSpareIssue } from '../types';

const formatQty = (value: number, digits = 3) =>
  new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const formatPrintDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-EG');
};

type Props = {
  issue: RepairSpareIssue | null;
  paperSize?: 'a4' | 'a5';
};

export const RepairSpareIssuePrint = React.forwardRef<HTMLDivElement, Props>(
  ({ issue, paperSize = 'a4' }, ref) => {
    if (!issue) return <div ref={ref} />;
    const isA5 = paperSize === 'a5';
    const cell: React.CSSProperties = {
      border: '1px solid #cbd5e1',
      padding: '5.5px 6.5px',
      verticalAlign: 'top',
    };
    const headCell: React.CSSProperties = {
      ...cell,
      background: '#0f172a',
      color: '#fff',
      fontWeight: 800,
      textAlign: 'center',
    };
    const numericCell: React.CSSProperties = {
      ...cell,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    };
    const avoidBreak: React.CSSProperties = { breakInside: 'avoid', pageBreakInside: 'avoid' };
    const infoBox: React.CSSProperties = {
      border: '1px solid #cbd5e1',
      borderRadius: 7,
      padding: '6px 8px',
      minHeight: 40,
    };
    const infoLabel: React.CSSProperties = { margin: 0, color: '#64748b', fontSize: 9.5, fontWeight: 800 };
    const infoValue: React.CSSProperties = {
      margin: '2px 0 0',
      color: '#0f172a',
      fontSize: 11.5,
      fontWeight: 900,
      overflowWrap: 'anywhere',
      lineHeight: 1.35,
    };
    const totalQty = (issue.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          width: '190mm',
          minHeight: isA5 ? '128mm' : '270mm',
          boxSizing: 'border-box',
          background: '#fff',
          color: '#0f172a',
          padding: '7mm 9mm',
          fontFamily: '"Cairo", "Tahoma", "Arial", sans-serif',
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            borderBottom: '2px solid #0f172a',
            paddingBottom: 8,
            marginBottom: 8,
          }}
        >
          <div>
            <p style={{ margin: 0, color: '#64748b', fontSize: 10.5, fontWeight: 800 }}>صيانة — قطع الغيار</p>
            <h1 style={{ margin: '1px 0', color: '#0f172a', fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
              سند صرف قطع غيار
            </h1>
            <p
              style={{
                margin: 0,
                direction: 'ltr',
                textAlign: 'right',
                fontFamily: 'monospace',
                fontSize: 12.5,
                fontWeight: 800,
              }}
            >
              {issue.referenceNo}
            </p>
          </div>
          <div style={{ width: 210, border: '1px solid #cbd5e1', borderRadius: 7, overflow: 'hidden', fontSize: 10 }}>
            {[
              ['الحالة', REPAIR_SPARE_ISSUE_STATUS_LABELS[issue.status] || issue.status],
              ['التاريخ', formatPrintDate(issue.createdAt)],
              ['المخزن', issue.warehouseName || issue.warehouseId],
            ].map(([label, value], index) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '66px 1fr',
                  borderBottom: index === 2 ? 'none' : '1px solid #e2e8f0',
                }}
              >
                <span style={{ background: '#f1f5f9', padding: '4px 6px', fontWeight: 800 }}>{label}</span>
                <span style={{ padding: '4px 6px', overflowWrap: 'anywhere' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 7, marginBottom: 8 }}>
          {[
            ['الفرع', issue.branchName || '—'],
            ['طلب الصيانة', issue.jobCode || issue.jobId || '—'],
            ['إجمالي الكمية', formatQty(totalQty)],
          ].map(([label, value]) => (
            <div key={label} style={infoBox}>
              <p style={infoLabel}>{label}</p>
              <p style={infoValue}>{value}</p>
            </div>
          ))}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10 }}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '36%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...headCell, textAlign: 'right' }}>اللوكيشن</th>
              <th style={{ ...headCell, textAlign: 'right' }}>القطعة</th>
              <th style={headCell}>الكمية</th>
              <th style={headCell}>الوحدة</th>
            </tr>
          </thead>
          <tbody>
            {(issue.lines || []).map((line) => {
              const allocations = normalizeRepairSpareIssueAllocations(line);
              const locationLabel = allocations.length > 0
                ? allocations
                  .map((a) => {
                    const rackShelf = [a.rack, a.shelf].filter(Boolean).join(' / ');
                    return `${a.locationCode}${rackShelf ? ` (${rackShelf})` : ''}: ${formatQty(a.quantity)}`;
                  })
                  .join('، ')
                : '—';
              return (
                <tr key={line.lineId || `${line.itemId}-${line.locationId || ''}`}>
                  <td style={{ ...cell, fontSize: 9.5, overflowWrap: 'anywhere' }}>{locationLabel}</td>
                  <td style={{ ...cell, fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {line.itemName}
                    {line.itemCode ? ` (${line.itemCode})` : ''}
                  </td>
                  <td style={{ ...numericCell, fontWeight: 900 }}>{formatQty(line.quantity)}</td>
                  <td style={numericCell}>{line.unit || 'piece'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ ...avoidBreak, marginTop: 10 }}>
          {issue.note?.trim() ? (
            <div style={{ ...infoBox, marginBottom: 12 }}>
              <p style={infoLabel}>ملاحظات</p>
              <p style={infoValue}>{issue.note}</p>
            </div>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 34,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {['أمين المخزن', 'مستلم الصيانة', 'اعتماد الإدارة'].map((label) => (
              <div key={label} style={{ borderTop: '1.5px solid #0f172a', paddingTop: 5 }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

RepairSpareIssuePrint.displayName = 'RepairSpareIssuePrint';
