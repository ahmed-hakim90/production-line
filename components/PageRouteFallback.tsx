import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PageContentSkeleton, type PageSkeletonVariant } from '@/src/shared/ui/skeletons';
import { resolvePageSkeletonVariant } from '@/lib/routeSkeletonMap';
import { routeSkeletonMap } from '@/lib/routeSkeletonRegistry';

export interface PageRouteFallbackProps {
  variant?: PageSkeletonVariant;
}

/** Shown while lazy route chunks load (inside Layout or auth shells). */
export const PageRouteFallback: React.FC<PageRouteFallbackProps> = ({ variant: variantOverride }) => {
  const { pathname } = useLocation();
  const variant = useMemo(
    () => resolvePageSkeletonVariant(pathname, routeSkeletonMap, variantOverride),
    [pathname, variantOverride],
  );

  return <PageContentSkeleton variant={variant} />;
};
