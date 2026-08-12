import type { CSSProperties, ReactNode } from 'react'

const hostStyle: CSSProperties = {
  position: 'fixed',
  left: '-140vw',
  top: 0,
  zIndex: -1,
  width: 'max-content',
  overflow: 'visible',
  pointerEvents: 'none',
}

/**
 * Host for react-to-print sources.
 * Must stay laid out (not `display: none`) so logo/header/flex measure correctly in the print iframe.
 */
export function PrintOffscreenHost({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="print-offscreen-host" style={hostStyle}>
      {children}
    </div>
  )
}
