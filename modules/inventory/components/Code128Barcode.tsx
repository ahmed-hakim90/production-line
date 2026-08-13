import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  className?: string;
};

/** Linear Code128 barcode for warehouse labels (gun-scanner friendly). */
export function Code128Barcode({
  value,
  height = 36,
  width = 1.4,
  displayValue = true,
  className,
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
        margin: 2,
        textMargin: 2,
      });
    } catch {
      // Invalid characters for Code128 — leave empty svg
      while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild);
    }
  }, [code, height, width, displayValue]);

  if (!code) return null;
  return <svg ref={ref} className={className} />;
}
