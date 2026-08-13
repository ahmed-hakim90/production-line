import type { CSSProperties, ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Code128Barcode } from './Code128Barcode';
import {
  formatBarcodeLabelDisplayCode,
  type BarcodeLabelSizePreset,
} from '../lib/barcodeLabelEngine';

function normalizeLabelText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '');
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
 * Compact centered thermal label for Xprinter:
 * [border] warehouse → location → barcode + QR (tight, no empty middle).
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

  const qrPx = compact ? 32 : Math.min(44, Math.floor(size.heightMm * 1.0));
  const barHeight = compact ? 20 : Math.min(32, Math.floor(size.heightMm * 0.48));
  const barWidth = compact ? 1.1 : 1.2;
  const pad = compact ? '1.2mm' : '1.8mm';

  const pageStyle: CSSProperties = {
    width: `${size.widthMm}mm`,
    height: `${size.heightMm}mm`,
    boxSizing: 'border-box',
    padding: pad,
    overflow: 'hidden',
    background: '#fff',
    color: '#0b1220',
    pageBreakAfter: isLast ? 'auto' : 'always',
    breakAfter: isLast ? 'auto' : 'page',
  };

  const frameStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: '0.35mm solid #0f172a',
    borderRadius: compact ? '0.6mm' : '1mm',
    padding: compact ? '1.1mm 1.3mm' : '1.6mm',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: compact ? '1.1mm' : '1.6mm',
  };

  return (
    <div style={pageStyle}>
      <div style={frameStyle}>
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compact ? 1 : 2,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontSize: compact ? 7.5 : 9,
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
                fontSize: compact ? 7 : 8.5,
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
                fontSize: compact ? 12.5 : 15,
                letterSpacing: '0.03em',
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
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row-reverse',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compact ? 3 : 5,
            }}
          >
            {showQr ? (
              <div style={{ flexShrink: 0, lineHeight: 0 }}>
                <QRCodeSVG value={value} size={qrPx} includeMargin={false} level="M" />
              </div>
            ) : null}
            {showLinear ? (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <Code128Barcode
                  value={value}
                  height={barHeight}
                  width={barWidth}
                  displayValue={false}
                  margin={0}
                  className="max-w-full"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
