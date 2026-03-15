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
    <header className={cn("erp-page-head", className)}>
      {(breadcrumbs?.length ?? 0) > 0 && (
        <nav className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {breadcrumbs?.map((b, i) => (
            <span key={`${b.label}-${i}`} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">›</span>}
              {b.href ? (
                <a href={b.href} className="hover:text-foreground">
                  {b.label}
                </a>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <h1 className="text-lg font-medium text-[#0F172A]">{title}</h1>
          </div>
          {subtitle && <p className="mt-1 text-sm font-normal text-[#64748B]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
