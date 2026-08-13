import type { CSSProperties, ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Code128Barcode } from './Code128Barcode';
import {
  DEFAULT_THERMAL_GAP_MM,
  THERMAL_BARCODE_FACE_CLASS,
  THERMAL_BARCODE_LABEL_CLASS,
  clampThermalGapMm,
  formatBarcodeLabelDisplayCode,
  thermalPageHeightMm,
  type BarcodeLabelSizePreset,
} from '../lib/barcodeLabelEngine';

function normalizeLabelText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '');
}

function mmToPx(mm: number): number {
  return Math.max(8, Math.round((mm * 96) / 25.4));
}

type ThermalBarcodeLabelCardProps = {
  size: BarcodeLabelSizePreset;
  /** Centered warehouse / title */
  eyebrow?: string;
  /** Optional line between title and hero (skipped if same as hero) */
  subtitle?: string;
  /** Large centered location/item code — shown once */
  heroCode?: string;
  /** Value encoded in QR + Code128 */
  scanValue: string;
  showQr?: boolean;
  showLinear?: boolean;
  isLast?: boolean;
  /** Die-cut gap after the printable face (keeps multi-copy alignment). */
  gapMm?: number;
  children?: ReactNode;
};

/**
 * Compact thermal sticker for Xprinter:
 * one CSS page = printable face + die-cut gap (pitch). No outer frame
 * (thin borders dither into a dashed line at 203 DPI).
 */
export function ThermalBarcodeLabelCard({
  size,
  eyebrow,
  subtitle,
  heroCode,
  scanValue,
  showQr = false,
  showLinear = true,
  isLast = false,
  gapMm = DEFAULT_THERMAL_GAP_MM,
  children,
}: ThermalBarcodeLabelCardProps) {
  const compact = size.heightMm <= 30;
  const value = String(scanValue || '').trim();
  const displayCode = formatBarcodeLabelDisplayCode(heroCode || value);
  const safeSubtitle = subtitle
    && normalizeLabelText(subtitle) !== normalizeLabelText(displayCode)
    && normalizeLabelText(subtitle) !== normalizeLabelText(eyebrow || '')
    ? subtitle
    : undefined;

  const gap = clampThermalGapMm(gapMm);
  const pageHeightMm = thermalPageHeightMm(size.heightMm, gap);
  const insetMm = compact ? 1 : 1.6;
  const barcodeOnly = Boolean(showLinear && !showQr);
  const qrMm = compact
    ? Math.min(10.5, Math.max(6.5, size.heightMm * 0.34))
    : Math.min(12, size.heightMm * 0.3);
  const barMm = barcodeOnly
    ? Math.max(12, size.heightMm * 0.52)
    : (compact ? 6 : Math.min(9, size.heightMm * 0.24));
  const warehousePt = compact ? '3.4mm' : '4.2mm';
  const locationPt = compact ? '5.8mm' : '7mm';
  const qrPx = mmToPx(qrMm);
  const barHeightPx = mmToPx(barMm);

  const pageStyle: CSSProperties = {
    width: `${size.widthMm}mm`,
    height: `${pageHeightMm}mm`,
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    background: '#fff',
    color: '#0b1220',
    pageBreakAfter: isLast ? 'auto' : 'always',
    breakAfter: isLast ? 'auto' : 'page',
    pageBreakInside: 'avoid',
    breakInside: 'avoid',
  };

  const faceStyle: CSSProperties = {
    width: `${size.widthMm}mm`,
    height: `${size.heightMm}mm`,
    boxSizing: 'border-box',
    padding: `${insetMm}mm`,
    overflow: 'hidden',
    background: '#fff',
  };

  const innerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: barcodeOnly ? 'space-between' : 'center',
    gap: compact ? '1mm' : '1.6mm',
    overflow: 'hidden',
    minHeight: 0,
  };

  return (
    <div className={THERMAL_BARCODE_LABEL_CLASS} style={pageStyle}>
      <div className={THERMAL_BARCODE_FACE_CLASS} style={faceStyle}>
        <div style={innerStyle}>
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: compact ? '0.6mm' : '1mm',
            flexShrink: 0,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontSize: warehousePt,
                fontWeight: 800,
                lineHeight: 1.15,
                color: '#0f172a',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {eyebrow}
            </div>
          ) : null}

          {safeSubtitle ? (
            <div
              style={{
                fontSize: compact ? '2.6mm' : '3.2mm',
                fontWeight: 600,
                lineHeight: 1.1,
                color: '#334155',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {safeSubtitle}
            </div>
          ) : null}

          {displayCode ? (
            <div
              style={{
                fontWeight: 900,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: locationPt,
                letterSpacing: '0.02em',
                lineHeight: 1,
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayCode}
            </div>
          ) : null}

          {children}
        </div>

        {(showQr || showLinear) && value ? (
          <div
            dir="ltr"
            style={{
              width: '100%',
              flex: barcodeOnly ? 1 : undefined,
              minHeight: barcodeOnly ? `${barMm}mm` : 0,
              display: 'flex',
              flexDirection: barcodeOnly ? 'column' : 'row',
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: compact ? '1.2mm' : '2mm',
              overflow: 'hidden',
            }}
          >
            {showLinear ? (
              <div
                style={{
                  flex: 1,
                  width: '100%',
                  minWidth: 0,
                  minHeight: barcodeOnly ? 0 : `${barMm}mm`,
                  height: barcodeOnly ? '100%' : `${barMm}mm`,
                  display: 'flex',
                  alignItems: 'stretch',
                  overflow: 'hidden',
                }}
              >
                <Code128Barcode
                  value={value}
                  height={barHeightPx}
                  width={compact ? 1.2 : 1.35}
                  displayValue={false}
                  margin={0}
                  fillWidth={barcodeOnly}
                />
              </div>
            ) : null}
            {showQr ? (
              <div
                style={{
                  flexShrink: 0,
                  width: `${qrMm}mm`,
                  height: `${qrMm}mm`,
                  lineHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <QRCodeSVG
                  value={value}
                  size={qrPx}
                  includeMargin={false}
                  level="M"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
