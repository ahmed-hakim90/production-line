import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import { Code128Barcode } from './Code128Barcode';

export type LocationBarcodeLabel = {
  locationCode: string;
  rackName?: string;
  shelf?: string;
  warehouseName?: string;
};

type Props = {
  labels: LocationBarcodeLabel[];
  printSettings?: PrintTemplateSettings;
  printedAt?: string;
};

export const LocationBarcodeLabelPrint = React.forwardRef<HTMLDivElement, Props>(
  ({ labels, printSettings, printedAt }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'locationBarcodeLabel');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const when = printedAt || new Date().toLocaleString('ar-EG');
    const showCode = doc.isFieldVisible('locationCode');
    const showRack = doc.isFieldVisible('rack');
    const showWarehouse = doc.isFieldVisible('warehouse');
    const showQr = doc.isFieldVisible('qrCode');
    const showLinear = doc.isFieldVisible('code128');

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '8mm',
          fontFamily: font.fontFamily,
          fontSize: font.fontSize,
          color: '#0f172a',
          background: '#fff',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 10, color: '#64748b' }}>
          <span>{doc.headerText || 'ملصقات باركود اللوكيشن'}</span>
          <span>{when}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6mm',
          }}
        >
          {labels.map((label, index) => {
            const value = String(label.locationCode || '').trim();
            return (
              <div
                key={`${value}-${index}`}
                style={{
                  border: `1.5px solid ${accent}`,
                  borderRadius: 8,
                  padding: '4mm',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  minHeight: '42mm',
                }}
              >
                {showWarehouse && label.warehouseName ? (
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{label.warehouseName}</div>
                ) : null}
                {showRack && (label.rackName || label.shelf) ? (
                  <div style={{ fontSize: 11, marginBottom: 2 }}>
                    {[label.rackName, label.shelf].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
                {showCode ? (
                  <div style={{ fontWeight: 800, fontFamily: 'ui-monospace, monospace', fontSize: 14, marginBottom: 6 }}>
                    {value || '—'}
                  </div>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  {showQr && value ? (
                    <QRCodeSVG value={value} size={64} includeMargin={false} level="M" />
                  ) : null}
                  {showLinear && value ? (
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <Code128Barcode value={value} height={40} width={1.3} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {doc.customLines.length > 0 ? (
          <div style={{ marginTop: 12, fontSize: 10, color: '#64748b' }}>
            {doc.customLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
        {doc.footerText?.trim() ? (
          <div style={{ marginTop: 8, fontSize: 9, color: '#94a3b8' }}>{doc.footerText}</div>
        ) : null}
      </div>
    );
  },
);

LocationBarcodeLabelPrint.displayName = 'LocationBarcodeLabelPrint';
