import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { resolveImageExportPalette } from '@/utils/imageExportTheme'
import { resolvePrintAccentHex } from '@/utils/printTheme'

export type PrintBrandHeaderProps = {
  companyName: string
  documentType: string
  printDate: string
  logoUrl?: string
  brandAccent?: string
  dense?: boolean
  className?: string
}

/** First 1–2 chars for logo fallback when tenant has no logoUrl. */
export function companyPrintInitials(companyName: string): string {
  const cleaned = String(companyName || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!cleaned) return '—'
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0] || ''
    const b = parts[1]?.[0] || ''
    return `${a}${b}` || cleaned.slice(0, 2)
  }
  return cleaned.slice(0, 2)
}

/**
 * Shared tenant print header — company logo/name dominant; document type as accent badge.
 * Layout is inline-styled so cloned print iframes match the engine preview without Tailwind.
 */
export function PrintBrandHeader({
  companyName,
  documentType,
  printDate,
  logoUrl,
  brandAccent,
  dense = false,
  className,
}: PrintBrandHeaderProps) {
  const palette = resolveImageExportPalette(resolvePrintAccentHex(brandAccent))
  const accent = palette.primary
  const initials = companyPrintInitials(companyName)
  const logoBox: CSSProperties = dense
    ? { height: 44, maxWidth: '9rem', padding: '0 6px' }
    : { height: 56, maxWidth: '11rem', padding: '0 8px' }
  const imgStyle: CSSProperties = dense
    ? { maxHeight: 36, maxWidth: '8.5rem', width: 'auto', objectFit: 'contain', objectPosition: 'right' }
    : { maxHeight: 48, maxWidth: '10.5rem', width: 'auto', objectFit: 'contain', objectPosition: 'right' }

  return (
    <header
      className={cn('print-brand-header', className)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: `2px solid ${accent}`,
        paddingBottom: dense ? 10 : 12,
        marginBottom: dense ? 12 : 16,
      }}
    >
      <div
        className="print-brand-identity"
        style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}
      >
        {logoUrl ? (
          <div
            className="print-brand-logo"
            style={{
              ...logoBox,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: `1px solid ${palette.primarySoft}`,
              background: '#ffffff',
            }}
          >
            <img src={logoUrl} alt="" style={imgStyle} />
          </div>
        ) : (
          <div
            className="print-brand-initials"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: dense ? 44 : 56,
              width: dense ? 44 : 56,
              borderRadius: 6,
              fontSize: dense ? 13 : 16,
              fontWeight: 800,
              background: palette.badgeBg,
              color: palette.badgeText,
              border: `1px solid ${palette.primarySoft}`,
              letterSpacing: 'normal',
            }}
            aria-hidden
          >
            {initials}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            className="print-brand-name"
            style={{
              margin: 0,
              fontSize: dense ? 15 : 18,
              fontWeight: 800,
              lineHeight: 1.35,
              color: '#0f172a',
              letterSpacing: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {companyName}
          </h1>
        </div>
      </div>
      <div
        className="print-brand-meta"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          flexShrink: 0,
          maxWidth: '42%',
          paddingTop: 2,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: dense ? 11 : 12,
            fontWeight: 800,
            lineHeight: 1.35,
            padding: dense ? '4px 8px' : '5px 10px',
            borderRadius: 6,
            background: palette.badgeBg,
            color: palette.badgeText,
            letterSpacing: 'normal',
            textAlign: 'center',
          }}
        >
          {documentType}
        </span>
        <span
          style={{
            fontSize: dense ? 10 : 11,
            color: '#64748b',
            letterSpacing: 'normal',
          }}
        >
          {printDate}
        </span>
      </div>
    </header>
  )
}
