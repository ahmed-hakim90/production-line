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
  const size = 128;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  const tone =
    clamped >= 80
      ? 'rgb(var(--color-success))'
      : clamped >= 55
        ? 'rgb(var(--color-warning))'
        : 'rgb(var(--color-danger))';

  return (
    <div className={cn('ops-dash-gauge', className)}>
      <div className="ops-dash-gauge__ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--color-border) 85%, transparent)"
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
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="ops-dash-gauge__center">
          <span className="ops-dash-gauge__value">{clamped}%</span>
          <span className="ops-dash-gauge__label">{label}</span>
        </div>
      </div>
      {sublabel ? <p className="ops-dash-gauge__sub">{sublabel}</p> : null}
      {legend && legend.length > 0 ? (
        <ul className="ops-dash-gauge__legend">
          {legend.map((item) => (
            <li key={item.label} className="ops-dash-gauge__legend-item">
              <span className="ops-dash-gauge__dot" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
