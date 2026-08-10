import type { CSSProperties } from 'react';

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
      className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
      style={{
        marginBottom: dense ? '2mm' : undefined,
        padding: dense ? '1.5mm 2mm' : undefined,
        ...style,
      }}
    >
      {lines.map((line, index) => (
        <p
          key={`${index}-${line.slice(0, 24)}`}
          className="font-bold text-[var(--color-text)]"
          style={{
            margin: index === 0 ? 0 : '0.35rem 0 0',
            fontSize: dense ? '8pt' : '11px',
            letterSpacing: 'normal',
            lineHeight: 1.45,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
