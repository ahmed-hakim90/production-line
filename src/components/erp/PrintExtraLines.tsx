import type { CSSProperties } from 'react';
import { PRINT_SURFACE } from '@/utils/print/printSurface';

/** Shared strip for tenant custom print lines (settings → documents.*.customLines). */
export function PrintExtraLines({
  lines,
  dense = false,
  style,
}: {
  lines: string[];
  dense?: boolean;
  style?: CSSProperties;
}) {
  if (!lines.length) return null;
  return (
    <div
      style={{
        marginBottom: dense ? '2mm' : 12,
        padding: dense ? '1.5mm 2mm' : '8px 12px',
        borderRadius: 8,
        border: `1px solid ${PRINT_SURFACE.border}`,
        background: PRINT_SURFACE.bg,
        ...style,
      }}
    >
      {lines.map((line, index) => (
        <p
          key={`${index}-${line.slice(0, 24)}`}
          style={{
            margin: index === 0 ? 0 : '0.35rem 0 0',
            fontSize: dense ? '8pt' : '11px',
            fontWeight: 700,
            letterSpacing: 'normal',
            lineHeight: 1.45,
            color: PRINT_SURFACE.text,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
