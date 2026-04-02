import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "erp-page-head !flex-col !items-stretch",
        (breadcrumbs?.length ?? 0) > 0 ? "gap-2" : "gap-0",
        className
      )}
    >
      {(breadcrumbs?.length ?? 0) > 0 && (
        <nav className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
          {breadcrumbs?.map((b, i) => (
            <span key={`${b.label}-${i}`} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">›</span>}
              {b.href ? (
                <a href={b.href} className="hover:text-[var(--color-text)]">
                  {b.label}
                </a>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        <div className="erp-page-title-block min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] shadow-[var(--shadow-desk-header)]">
                {icon}
              </span>
            )}
            <h1 className="page-title">{title}</h1>
          </div>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="erp-page-actions">{actions}</div>}
      </div>
    </header>
  )
}
