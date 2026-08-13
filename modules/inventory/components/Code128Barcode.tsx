import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { mmToCssPx, scaleJsBarcodeModuleWidth } from '../lib/barcodeLabelEngine';

type Props = {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  margin?: number;
  className?: string;
  /** Stretch bars to the container width (when QR is off). */
  fillWidth?: boolean;
  /** Explicit sticker size so print/preview is not stuck at JsBarcode's intrinsic px width. */
  fillWidthMm?: number;
  fillHeightMm?: number;
};

function paintCode128(
  svg: SVGSVGElement,
  code: string,
  options: {
    displayValue: boolean;
    fontSize: number;
    height: number;
    width: number;
    margin: number;
  },
): void {
  JsBarcode(svg, code, {
    format: 'CODE128',
    displayValue: options.displayValue,
    fontSize: options.fontSize,
    height: options.height,
    width: options.width,
    margin: options.margin,
    textMargin: options.displayValue ? 2 : 0,
  });
}

/** Linear Code128 barcode for warehouse labels (gun-scanner friendly). */
export function Code128Barcode({
  value,
  height = 36,
  width = 1.4,
  displayValue = true,
  margin = 2,
  className,
  fillWidth = false,
  fillWidthMm,
  fillHeightMm,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<SVGSVGElement>(null);
  const code = String(value || '').trim();

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !code) return;
    try {
      const targetHeightPx = fillHeightMm ? mmToCssPx(fillHeightMm) : height;
      const targetWidthPx = fillWidthMm
        ? mmToCssPx(fillWidthMm)
        : (wrapRef.current?.clientWidth || 0);

      paintCode128(svg, code, {
        displayValue,
        fontSize: 11,
        height: targetHeightPx,
        width,
        margin,
      });

      if (fillWidth) {
        const generatedWidth = Number(svg.getAttribute('width'));
        if (targetWidthPx > 0 && generatedWidth > 0) {
          paintCode128(svg, code, {
            displayValue,
            fontSize: 11,
            height: targetHeightPx,
            width: scaleJsBarcodeModuleWidth(generatedWidth, targetWidthPx, width),
            margin,
          });
        }
      }

      const svgWidth = svg.getAttribute('width');
      const svgHeight = svg.getAttribute('height');
      if (svgWidth && svgHeight) {
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        svg.setAttribute('preserveAspectRatio', fillWidth ? 'none' : 'xMidYMid meet');
        if (fillWidth && fillWidthMm && fillHeightMm) {
          svg.setAttribute('width', `${fillWidthMm}mm`);
          svg.setAttribute('height', `${fillHeightMm}mm`);
        } else if (fillWidth) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
        } else {
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }
      }
    } catch {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }
  }, [code, height, width, displayValue, margin, fillWidth, fillWidthMm, fillHeightMm]);

  if (!code) return null;

  return (
    <div
      ref={wrapRef}
      style={{
        display: 'block',
        width: fillWidthMm ? `${fillWidthMm}mm` : '100%',
        minWidth: fillWidth ? '100%' : undefined,
        height: fillWidth
          ? (fillHeightMm ? `${fillHeightMm}mm` : '100%')
          : undefined,
        lineHeight: 0,
        overflow: 'hidden',
      }}
    >
      <svg
        ref={ref}
        className={className}
        preserveAspectRatio={fillWidth ? 'none' : 'xMidYMid meet'}
        style={{
          display: 'block',
          width: '100%',
          minWidth: fillWidth ? '100%' : undefined,
          height: fillWidth ? '100%' : height,
        }}
      />
    </div>
  );
}
