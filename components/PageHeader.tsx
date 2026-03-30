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
import React, { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tenantHomePath } from '@/lib/tenantPaths';
import {
  Check,
  Download,
  Factory,
  FileDown,
  Loader2,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  Circle,
  Pencil,
  Package,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePageBackSetter } from '@/src/shared/ui/layout/PageBackContext';

const ICON_MAP: Record<string, LucideIcon> = {
  add: Plus,
  check: Check,
  delete: Trash2,
  download: Download,
  factory: Factory,
  file_download: FileDown,
  edit: Pencil,
  more_horiz: MoreHorizontal,
  package: Package,
  print: Printer,
  refresh: RefreshCw,
  save: Save,
  search: Search,
  settings: Settings,
  upload: Upload,
  user: User,
};

function renderActionIcon(icon?: string, className?: string, size = 16) {
  if (!icon) return null;
  const Lucide = ICON_MAP[icon];
  if (Lucide) return <Lucide size={size} className={className} />;
  return <Circle size={size} className={className} />;
}

export interface PageHeaderAction {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  group?: string;   // shows a separator + group label
  danger?: boolean;
  hidden?: boolean;
  dataModalKey?: string;
}

type BackActionConfig = {
  label?: string;
  to?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  /** Back navigation action (defaults to enabled) */
  backAction?: boolean | BackActionConfig;
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
  backAction = true,
  primaryAction,
  secondaryAction,
  moreActions,
  extra,
  loading,
}) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const setPageBack = usePageBackSetter();
  const visibleMoreActions = moreActions?.filter((a) => !a.hidden) ?? [];

  // Build groups for the dropdown
  const groups: { label: string; items: PageHeaderAction[] }[] = [];
  for (const action of visibleMoreActions) {
    const groupLabel = action.group ?? '';
    const existing = groups.find((g) => g.label === groupLabel);
    if (existing) existing.items.push(action);
    else groups.push({ label: groupLabel, items: [action] });
  }

  const backConfig: BackActionConfig | null = (typeof backAction === 'object' && backAction !== null)
    ? backAction
    : null;

  const handleBack = useCallback(() => {
    if (!backAction) return;
    if (backConfig?.onClick) {
      backConfig.onClick();
      return;
    }
    if (backConfig?.to) {
      const target = backConfig.to.startsWith('#')
        ? backConfig.to.slice(1)
        : backConfig.to;
      navigate(target);
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(tenantHomePath(tenantSlug));
  }, [backAction, backConfig, navigate, tenantSlug]);

  const backDisabled = backConfig?.disabled ?? false;
  const backLabel = backConfig?.label || 'رجوع';

  useEffect(() => {
    if (!setPageBack) return;
    if (!backAction) {
      setPageBack(null);
      return;
    }
    setPageBack({ label: backLabel, disabled: backDisabled, onClick: handleBack });
    return () => setPageBack(null);
  }, [backAction, backDisabled, backLabel, handleBack, setPageBack]);

  return (
    <div className="erp-page-head">
      {/* Left: title + optional icon */}
      <div className="erp-page-title-block">
        <h2 className="page-title">
          {icon && (
            <span style={{ verticalAlign: 'middle', marginInlineEnd: 6, display: 'inline-flex' }}>
              {renderActionIcon(icon, iconColor, 20)}
            </span>
          )}
          {title}
        </h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {/* Right: actions — back control lives in Topbar (icon only) */}
      <div className="erp-page-actions">
        {loading && (
          <span className="text-[12px] text-[var(--color-text-muted)] flex items-center gap-1">
            <Loader2 size={14} className="animate-spin" />
          </span>
        )}

        {extra}

        {/* Secondary visible button */}
        {secondaryAction && (
          <Button
            type="button"
            variant="outline"
            className="btn btn-secondary"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {renderActionIcon(secondaryAction.icon)}
            <span className="hidden sm:inline">{secondaryAction.label}</span>
          </Button>
        )}

        {/* Primary button */}
        {primaryAction && (
          <Button
            type="button"
            className="btn btn-primary bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)]"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            data-modal-key={primaryAction.dataModalKey}
          >
            {renderActionIcon(primaryAction.icon)}
            {primaryAction.label}
          </Button>
        )}

        {/* More actions dropdown */}
        {visibleMoreActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="btn btn-secondary" title="المزيد من الإجراءات">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              {groups.map((group, gi) => (
                <React.Fragment key={`${group.label}-${gi}`}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
                  <DropdownMenuGroup>
                    {group.items.map((action, ai) => (
                      <DropdownMenuItem
                        key={`${action.label}-${ai}`}
                        className={action.danger ? 'text-rose-600 focus:text-rose-700' : undefined}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        data-modal-key={action.dataModalKey}
                      >
                        {renderActionIcon(
                          action.icon,
                          action.danger ? 'text-rose-500' : 'text-[var(--color-text-muted)]',
                        )}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};
