import React from 'react';

/** Shown while lazy route chunks load (inside Layout or auth shells). */
export const PageRouteFallback: React.FC = () => (
  <div className="flex min-h-[40vh] w-full items-center justify-center py-12">
    <div className="erp-loading-dots">
      <span />
      <span />
      <span />
    </div>
  </div>
);
