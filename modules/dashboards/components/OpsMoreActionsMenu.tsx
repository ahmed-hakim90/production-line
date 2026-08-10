import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  BarChart,
  Bell,
  Check,
  Circle,
  Download,
  Factory,
  FileDown,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Wallet,
  Warehouse,
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
import type { PageHeaderAction } from '@/components/PageHeader';

const ICON_MAP: Record<string, LucideIcon> = {
  add: Plus,
  add_circle: Plus,
  analytics: BarChart,
  assignment: FileDown,
  auto_fix_high: RefreshCw,
  badge: Package,
  bar_chart: BarChart,
  call_split: ArrowLeftRight,
  check: Check,
  compare_arrows: ArrowLeftRight,
  delete: Trash2,
  delete_sweep: Trash2,
  download: Download,
  edit: Pencil,
  factory: Factory,
  fact_check: Check,
  file_download: FileDown,
  grid_view: LayoutGrid,
  groups: User,
  handyman: Factory,
  inventory: Package,
  inventory_2: Package,
  landmark: Landmark,
  layout_dashboard: LayoutDashboard,
  link_off: TriangleAlert,
  local_shipping: Package,
  more_horiz: MoreHorizontal,
  notifications_active: Bell,
  package: Package,
  package_2: Package,
  payments: Wallet,
  picture_as_pdf: FileDown,
  precision_manufacturing: Factory,
  price_check: Wallet,
  print: Printer,
  receipt_long: FileDown,
  refresh: RefreshCw,
  report: TriangleAlert,
  request_quote: Wallet,
  restart_alt: RefreshCw,
  save: Save,
  search: Search,
  sell: Wallet,
  settings: Settings,
  share: ArrowLeftRight,
  swap_horiz: ArrowLeftRight,
  sync: RefreshCw,
  table_chart: LayoutGrid,
  table_view: LayoutGrid,
  truck: Package,
  upload: Upload,
  upload_file: Upload,
  user: User,
  verified: Check,
  view_column: LayoutGrid,
  view_in_ar: Package,
  wallet: Wallet,
  warehouse: Warehouse,
  warning: TriangleAlert,
};

function renderActionIcon(icon?: string, className?: string, size = 16) {
  if (!icon) return null;
  const Lucide = ICON_MAP[icon];
  if (Lucide) return <Lucide size={size} className={className} />;
  return <Circle size={size} className={className} />;
}

export type OpsMoreAction = PageHeaderAction;

export interface OpsMoreActionsMenuProps {
  items: OpsMoreAction[];
}

export const OpsMoreActionsMenu: React.FC<OpsMoreActionsMenuProps> = ({ items }) => {
  const { t } = useTranslation();
  const visibleItems = items.filter((action) => !action.hidden);
  if (visibleItems.length === 0) return null;

  const groups: { label: string; items: OpsMoreAction[] }[] = [];
  for (const action of visibleItems) {
    const groupLabel = action.group ?? '';
    const existing = groups.find((group) => group.label === groupLabel);
    if (existing) existing.items.push(action);
    else groups.push({ label: groupLabel, items: [action] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="btn btn-secondary"
          title={t('pageHeader.moreActions')}
          aria-label={t('pageHeader.moreActions')}
          iconName="more_horiz"
          tone="neutral"
          solid={false}
          bare
        >
          {t('pageHeader.more')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {groups.map((group, groupIndex) => (
          <React.Fragment key={`${group.label}-${groupIndex}`}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            {group.label ? <DropdownMenuLabel>{group.label}</DropdownMenuLabel> : null}
            <DropdownMenuGroup>
              {group.items.map((action, actionIndex) => (
                <DropdownMenuItem
                  key={`${action.label}-${actionIndex}`}
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
  );
};
