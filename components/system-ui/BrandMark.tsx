import React from 'react';

type BrandMarkProps = {
  size?: number;
  className?: string;
  /** Decorative when parent already names the product */
  decorative?: boolean;
};

/** Shared ForgeOps mark — SVG for crisp UI; PNG fallbacks live under /icons for PWA. */
export function BrandMark({ size = 40, className = '', decorative = true }: BrandMarkProps) {
  return (
    <img
      src="/icons/forgeops-app-icon.svg"
      alt={decorative ? '' : 'ForgeOps'}
      width={size}
      height={size}
      className={['brand-mark', className].filter(Boolean).join(' ')}
      decoding="async"
      draggable={false}
    />
  );
}
