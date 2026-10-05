import React from 'react';
import { PRODUCT_BRAND } from '@/lib/productBrand';

type BrandMarkProps = {
  size?: number;
  className?: string;
  /** Decorative when parent already names the product */
  decorative?: boolean;
};

/** Shared El Maghraby emblem — PNG square icons for PWA live under /icons. */
export function BrandMark({ size = 40, className = '', decorative = true }: BrandMarkProps) {
  return (
    <img
      src={PRODUCT_BRAND.emblemSrc}
      alt={decorative ? '' : 'المغربي EL MAGHRABY'}
      width={size}
      height={size}
      className={['brand-mark', className].filter(Boolean).join(' ')}
      decoding="async"
      draggable={false}
    />
  );
}
