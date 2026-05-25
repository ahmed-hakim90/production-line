import React from 'react';
import { PageContentSkeleton, type PageContentSkeletonProps } from './pageSkeletons';

export interface PageLoadingGateProps extends PageContentSkeletonProps {
  loading: boolean;
  children: React.ReactNode;
}

/** Full-page skeleton while data loads; renders children when ready. */
export function PageLoadingGate({ loading, children, ...skeletonProps }: PageLoadingGateProps) {
  if (loading) {
    return <PageContentSkeleton {...skeletonProps} />;
  }
  return <>{children}</>;
}
