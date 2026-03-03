/**
 * ERPNext-style Page Header Component
 *
 * Usage:
 *   <PageHeader
 *     title="تقارير الإنتاج"
 *     subtitle="إنشاء ومراجعة تقارير الإنتاج"
 *     icon="bar_chart"
 *     iconColor="text-primary"
 *     primaryAction={{ label: 'إنشاء', icon: 'add', onClick: handleCreate }}
 *     moreActions={[
 *       { label: 'تصدير Excel', icon: 'download', onClick: handleExport, group: 'تصدير' },
 *       { label: 'طباعة', icon: 'print', onClick: handlePrint, group: 'تصدير' },
 *     ]}
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';

export interface PageHeaderAction {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  group?: string;   // shows a separator + group label
  danger?: boolean;
  hidden?: boolean;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  /** Primary (green/primary) button shown always */
  primaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
    disabled?: boolean;
    dataModalKey?: string;
  };
  /** Second visible button (outline) */
  secondaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Items collapsed into "⋮ المزيد" dropdown */
  moreActions?: PageHeaderAction[];
  /** Custom content appended after all buttons */
  extra?: React.ReactNode;
  loading?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor = 'text-[rgb(var(--color-primary))]',
  primaryAction,
  secondaryAction,
  moreActions,
  extra,
  loading,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const visibleMoreActions = moreActions?.filter((a) => !a.hidden) ?? [];

  // Build groups for the dropdown
  const groups: { label: string; items: PageHeaderAction[] }[] = [];
  for (const action of visibleMoreActions) {
    const groupLabel = action.group ?? '';
    const existing = groups.find((g) => g.label === groupLabel);
    if (existing) existing.items.push(action);
    else groups.push({ label: groupLabel, items: [action] });
  }

  return (
    <div className="erp-page-head">
      {/* Left: title + optional icon */}
      <div className="erp-page-title-block">
        <h2 className="page-title">
          {icon && (
            <span className={`material-icons-round ${iconColor}`} style={{ fontSize: 20, verticalAlign: 'middle', marginInlineEnd: 6 }}>{icon}</span>
          )}
          {title}
        </h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {/* Right: actions */}
      <div className="erp-page-actions">
        {loading && (
          <span className="text-[12px] text-[var(--color-text-muted)] flex items-center gap-1">
            <span className="material-icons-round text-[14px] animate-spin">sync</span>
          </span>
        )}

        {extra}

        {/* Secondary visible button */}
        {secondaryAction && (
          <button
            className="btn btn-secondary"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.icon && (
              <span className="material-icons-round" style={{ fontSize: 16 }}>{secondaryAction.icon}</span>
            )}
            <span className="hidden sm:inline">{secondaryAction.label}</span>
          </button>
        )}

        {/* Primary button */}
        {primaryAction && (
          <button
            className="btn btn-primary"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            data-modal-key={primaryAction.dataModalKey}
          >
            {primaryAction.icon && (
              <span className="material-icons-round" style={{ fontSize: 16 }}>{primaryAction.icon}</span>
            )}
            {primaryAction.label}
          </button>
        )}

        {/* More actions dropdown */}
        {visibleMoreActions.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              className="btn btn-secondary"
              onClick={() => setMenuOpen((p) => !p)}
              title="المزيد من الإجراءات"
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>more_horiz</span>
            </button>

            {menuOpen && (
              <div
                className="absolute left-0 top-10 z-30 erp-dropdown"
                style={{ minWidth: 200 }}
              >
                {groups.map((group, gi) => (
                  <div key={gi}>
                    {group.label && (
                      <div className={`px-3 py-1.5 text-[10.5px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide${gi > 0 ? ' border-t border-[var(--color-border)] mt-1' : ''}`}>
                        {group.label}
                      </div>
                    )}
                    {gi > 0 && !group.label && <div className="border-t border-[var(--color-border)] my-1" />}
                    {group.items.map((action, ai) => (
                      <button
                        key={ai}
                        className={`erp-dropdown-item${action.danger ? ' text-rose-600' : ''}`}
                        onClick={() => { action.onClick(); setMenuOpen(false); }}
                        disabled={action.disabled}
                      >
                        {action.icon && (
                          <span className={`material-icons-round text-[16px] ${action.danger ? 'text-rose-500' : 'text-[var(--color-text-muted)]'}`}>
                            {action.icon}
                          </span>
                        )}
                        {action.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
