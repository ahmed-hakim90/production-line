import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { resolvePrintFont } from '@/utils/print/printFont';
import { Code128Barcode } from './Code128Barcode';
import { ThermalBarcodeLabelCard } from './ThermalBarcodeLabelCard';
import {
  resolveBarcodeLabelLayout,
  resolveBarcodeLabelSize,
  type BarcodeLabelCustomMm,
  type BarcodeLabelLayout,
  type BarcodeLabelSizeId,
} from '../lib/barcodeLabelEngine';

export type ItemBarcodeLabel = {
  itemCode: string;
  itemName: string;
  /** Value encoded in QR + Code128 (barcode or item code). */
  barcodeValue: string;
  warehouseName?: string;
};

type Props = {
  labels: ItemBarcodeLabel[];
  printSettings?: PrintTemplateSettings;
  printedAt?: string;
  /** A4 grid or thermal single-label page (Xprinter). */
  labelSizeId?: BarcodeLabelSizeId | string;
  labelCustomMm?: BarcodeLabelCustomMm;
  gapMm?: number;
  layout?: Partial<BarcodeLabelLayout> | null;
};

export const ItemBarcodeLabelPrint = React.forwardRef<HTMLDivElement, Props>(
  ({ labels, printSettings, printedAt, labelSizeId, labelCustomMm, gapMm, layout }, ref) => {
    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'itemBarcodeLabel');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const when = printedAt || new Date().toLocaleString('ar-EG');
    const size = resolveBarcodeLabelSize(labelSizeId, labelCustomMm);
    const thermal = size.layout === 'thermal';
    const labelLayout = resolveBarcodeLabelLayout(layout);
    const showName = doc.isFieldVisible('itemName');
    const showCode = doc.isFieldVisible('itemCode');
    const showWarehouse = doc.isFieldVisible('warehouse');
    const showQr = doc.isFieldVisible('qrCode');
    const showLinear = doc.isFieldVisible('code128');

    if (thermal) {
      return (
        <div ref={ref} dir="rtl" style={{ fontFamily: font.fontFamily, color: '#0b1220', background: '#fff' }}>
          {labels.map((label, index) => {
            const value = String(label.barcodeValue || label.itemCode || '').trim();
            return (
              <ThermalBarcodeLabelCard
                key={`${value}-${index}`}
                size={size}
                eyebrow={showWarehouse ? label.warehouseName : undefined}
                subtitle={showName ? label.itemName : undefined}
                heroCode={showCode ? (label.itemCode || value) : undefined}
                scanValue={value}
                showQr={showQr}
                showLinear={showLinear}
                isLast={index === labels.length - 1}
                gapMm={gapMm}
                layout={labelLayout}
              />
            );
          })}
        </div>
      );
    }

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
          <span>{doc.headerText || 'ملصقات باركود الأصناف'}</span>
          <span>{when}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${size.columns}, 1fr)`,
            gap: '6mm',
          }}
        >
          {labels.map((label, index) => {
            const value = String(label.barcodeValue || label.itemCode || '').trim();
            return (
              <div
                key={`${value}-${index}`}
                style={{
                  border: `1.5px solid ${accent}`,
                  borderRadius: 10,
                  padding: '4.5mm',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                  minHeight: '44mm',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div>
                  {showWarehouse && label.warehouseName ? (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      {label.warehouseName}
                    </div>
                  ) : null}
                  {showName ? (
                    <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 2, lineHeight: 1.2, color: '#000' }}>
                      {label.itemName || '—'}
                    </div>
                  ) : null}
                  {showCode ? (
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 800 }}>
                      {label.itemCode || '—'}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 10 }}>
                  {showQr && value ? (
                    <QRCodeSVG value={value} size={72} includeMargin={false} level="M" />
                  ) : null}
                  {showLinear && value ? (
                    <div style={{ flex: 1, width: showQr ? undefined : '100%', textAlign: 'start', overflow: 'hidden', height: showQr ? 44 : 64 }}>
                      <Code128Barcode value={value} height={showQr ? 44 : 64} width={1.35} displayValue={false} margin={0} fillWidth={!showQr} />
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

ItemBarcodeLabelPrint.displayName = 'ItemBarcodeLabelPrint';
