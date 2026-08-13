import type { CSSProperties, ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Code128Barcode } from './Code128Barcode';
import {
  DEFAULT_THERMAL_GAP_MM,
  THERMAL_BARCODE_FACE_CLASS,
  THERMAL_BARCODE_LABEL_CLASS,
  clampThermalGapMm,
  formatBarcodeLabelDisplayCode,
  mmToCssPx,
  resolveBarcodeLabelLayout,
  resolveThermalBarcodeBox,
  thermalPageHeightMm,
  type BarcodeLabelLayout,
  type BarcodeLabelSizePreset,
} from '../lib/barcodeLabelEngine';

function normalizeLabelText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '');
}

function mmToPx(mm: number): number {
  return Math.round(mmToCssPx(mm));
}

const INK: CSSProperties = {
  color: '#000',
  WebkitTextStroke: '0.35px #000',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

type ThermalBarcodeLabelCardProps = {
  size: BarcodeLabelSizePreset;
  /** Centered warehouse / title */
  eyebrow?: string;
  /** Spare-part / item name — the bold readable line */
  subtitle?: string;
  /** Large centered location/item code — only when the field is enabled */
  heroCode?: string;
  /** Value encoded in QR + Code128 */
  scanValue: string;
  showQr?: boolean;
  showLinear?: boolean;
  isLast?: boolean;
  /** Die-cut gap after the printable face (keeps multi-copy alignment). */
  gapMm?: number;
  /** Operator-controlled type and barcode sizes. Hidden fields do not stretch barcode height. */
  layout?: Partial<BarcodeLabelLayout> | null;
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
  layout: layoutInput,
  children,
}: ThermalBarcodeLabelCardProps) {
  const compact = size.heightMm <= 30;
  const value = String(scanValue || '').trim();
  const displayCode = heroCode ? formatBarcodeLabelDisplayCode(heroCode) : '';
  const safeSubtitle = subtitle
    && normalizeLabelText(subtitle) !== normalizeLabelText(displayCode)
    && normalizeLabelText(subtitle) !== normalizeLabelText(eyebrow || '')
    ? subtitle
    : undefined;

  const layout = resolveBarcodeLabelLayout(layoutInput);
  const gap = clampThermalGapMm(gapMm);
  const pageHeightMm = thermalPageHeightMm(size.heightMm, gap);
  const insetMm = compact ? 0.9 : 1.4;
  const qrMm = compact
    ? Math.min(10.5, Math.max(6.5, size.heightMm * 0.34))
    : Math.min(12, size.heightMm * 0.3);

  const warehousePt = `${layout.warehouseMm}mm`;
  const namePt = `${layout.nameMm}mm`;
  const codePt = `${layout.codeMm}mm`;
  const lineGapMm = compact ? 0.45 : 0.7;
  const textLines = [eyebrow, safeSubtitle, displayCode].filter(Boolean).length;
  const textBlockMm = (eyebrow ? layout.warehouseMm * 1.15 : 0)
    + (safeSubtitle ? layout.nameMm * 1.1 * 2 : 0)
    + (displayCode ? layout.codeMm * 1.2 : 0)
    + (textLines > 1 ? (textLines - 1) * lineGapMm : 0)
    + (children ? 2 : 0);
  const barcodeBox = resolveThermalBarcodeBox({
    labelWidthMm: size.widthMm,
    labelHeightMm: size.heightMm,
    insetMm,
    layout,
    textBlockMm,
    showQr,
  });
  const barMm = barcodeBox.heightMm;
  const barcodeWidthMm = barcodeBox.widthMm;
  const barcodeRowWidthMm = barcodeBox.rowWidthMm;
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
    color: '#000',
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
    justifyContent: 'space-between',
    gap: `${lineGapMm}mm`,
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
            gap: `${lineGapMm}mm`,
            flexShrink: 0,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                ...INK,
                fontSize: warehousePt,
                fontWeight: 900,
                lineHeight: 1.1,
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
                ...INK,
                fontSize: namePt,
                fontWeight: 900,
                lineHeight: 1.05,
                maxWidth: '100%',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
              }}
            >
              {safeSubtitle}
            </div>
          ) : null}

          {displayCode ? (
            <div
              style={{
                ...INK,
                fontWeight: 900,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: codePt,
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
              width: `${barcodeRowWidthMm}mm`,
              maxWidth: '100%',
              alignSelf: 'center',
              flex: '0 0 auto',
              height: `${barMm}mm`,
              minHeight: `${barMm}mm`,
              maxHeight: `${barMm}mm`,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
              justifyContent: 'stretch',
              gap: showQr ? (compact ? '1mm' : '1.6mm') : 0,
              overflow: 'hidden',
            }}
          >
            {showLinear ? (
              <div
                style={{
                  flex: '1 1 auto',
                  width: '100%',
                  minWidth: 0,
                  height: `${barMm}mm`,
                  overflow: 'hidden',
                  lineHeight: 0,
                }}
              >
                <Code128Barcode
                  value={value}
                  height={barHeightPx}
                  width={1.4}
                  displayValue={false}
                  margin={0}
                  fillWidth
                  fillWidthMm={barcodeWidthMm}
                  fillHeightMm={barMm}
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
