import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  margin?: number;
  className?: string;
  /** Stretch bars to the container width (when QR is off). */
  fillWidth?: boolean;
};

/** Linear Code128 barcode for warehouse labels (gun-scanner friendly). */
export function Code128Barcode({
  value,
  height = 36,
  width = 1.4,
  displayValue = true,
  margin = 2,
  className,
  fillWidth = false,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const code = String(value || '').trim();

  useEffect(() => {
    if (!ref.current || !code) return;
    try {
      JsBarcode(ref.current, code, {
        format: 'CODE128',
        displayValue,
        fontSize: 11,
        height,
        width,
        margin,
        textMargin: displayValue ? 2 : 0,
      });
      const svg = ref.current;
      const svgWidth = svg.getAttribute('width');
      const svgHeight = svg.getAttribute('height');
      if (svgWidth && svgHeight) {
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        svg.setAttribute('preserveAspectRatio', fillWidth ? 'none' : 'xMidYMid meet');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    } catch {
      // Invalid characters for Code128 — leave empty svg
      while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild);
    }
  }, [code, height, width, displayValue, margin, fillWidth]);

  if (!code) return null;
  return (
    <svg
      ref={ref}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        height: fillWidth ? '100%' : height,
      }}
    />
  );
}
