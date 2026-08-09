import React from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: number;
  label: string;
  sublabel?: string;
  legend?: Array<{ label: string; color: string }>;
  className?: string;
};

/**
 * Compact circular progress for dense dashboard boards.
 */
export const DashboardProgressGauge: React.FC<Props> = ({
  value,
  label,
  sublabel,
  legend,
  className,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  const tone =
    clamped >= 80 ? 'rgb(var(--color-success))' : clamped >= 55 ? 'rgb(var(--color-warning))' : 'rgb(var(--color-danger))';

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-[var(--color-text)]">{clamped}%</span>
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] mt-0.5 px-2 text-center leading-tight">
            {label}
          </span>
        </div>
      </div>
      {sublabel ? (
        <p className="text-[11px] text-[var(--color-text-muted)] font-medium text-center">{sublabel}</p>
      ) : null}
      {legend && legend.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] font-medium">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
