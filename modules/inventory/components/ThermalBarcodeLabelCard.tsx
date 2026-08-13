import type { CSSProperties, ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Code128Barcode } from './Code128Barcode';
import {
  THERMAL_BARCODE_LABEL_CLASS,
  formatBarcodeLabelDisplayCode,
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
  children?: ReactNode;
};

/**
 * Compact thermal sticker for Xprinter:
 * one CSS page = one physical label. No outer frame (thin borders dither
 * into a dashed line at 203 DPI and shift when @page size is wrong).
 */
export function ThermalBarcodeLabelCard({
  size,
  eyebrow,
  subtitle,
  heroCode,
  scanValue,
  showQr = true,
  showLinear = true,
  isLast = false,
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

  const insetMm = compact ? 1.4 : 2;
  const qrMm = compact ? 7 : Math.min(11, size.heightMm * 0.28);
  const barMm = compact ? 5.6 : Math.min(8.5, size.heightMm * 0.22);
  const qrPx = mmToPx(qrMm);
  const barHeightPx = mmToPx(barMm);

  const pageStyle: CSSProperties = {
    width: `${size.widthMm}mm`,
    height: `${size.heightMm}mm`,
    boxSizing: 'border-box',
    padding: `${insetMm}mm`,
    overflow: 'hidden',
    background: '#fff',
    color: '#0b1220',
    pageBreakAfter: isLast ? 'auto' : 'always',
    breakAfter: isLast ? 'auto' : 'page',
    pageBreakInside: 'avoid',
    breakInside: 'avoid',
  };

  const innerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: compact ? '0.8mm' : '1.4mm',
    overflow: 'hidden',
    minHeight: 0,
  };

  return (
    <div className={THERMAL_BARCODE_LABEL_CLASS} style={pageStyle}>
      <div style={innerStyle}>
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compact ? 1 : 2,
            flexShrink: 0,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontSize: compact ? 7 : 8.5,
                fontWeight: 800,
                lineHeight: 1.1,
                color: '#334155',
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
                fontSize: compact ? 6.5 : 8,
                fontWeight: 600,
                lineHeight: 1.1,
                color: '#475569',
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
                fontSize: compact ? 13 : 16,
                letterSpacing: '0.04em',
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
              minHeight: 0,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compact ? '1.2mm' : '2mm',
              overflow: 'hidden',
            }}
          >
            {showLinear ? (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: `${barMm}mm`,
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <Code128Barcode
                  value={value}
                  height={barHeightPx}
                  width={compact ? 1.05 : 1.2}
                  displayValue={false}
                  margin={0}
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
  );
}
