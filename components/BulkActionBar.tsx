import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Download,
  Eye,
  Pencil,
  Trash2,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePermission } from '../utils/permissions';
import type { Permission } from '../utils/permissions';

export interface BulkAction {
  label: string;
  icon?: string;
  action: () => void;
  permission?: Permission;
  variant?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}

const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  check: CheckSquare,
  visibility: Eye,
  edit: Pencil,
  delete: Trash2,
  download: Download,
  how_to_reg: UserCheck,
};

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  actions,
  onClear,
}) => {
  const { t } = useTranslation();
  const { can } = usePermission();

  if (selectedCount === 0) return null;

  const visibleActions = actions.filter(
    (a) => !a.permission || can(a.permission),
  );

  const variantStyles: Record<string, string> = {
    primary:
      'bg-primary text-white hover:bg-primary/90 shadow-primary/20',
    danger:
      'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20',
    default:
      'bg-white text-[var(--color-text)] hover:bg-[#f8f9fa] dark:hover:bg-slate-600 border border-[var(--color-border)]',
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-[var(--border-radius-lg)] px-4 py-3 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center">
          <CheckSquare size={18} className="text-primary" />
        </div>
        <span className="text-sm font-bold text-primary">
          {t('bulkActions.selectedCount', { count: selectedCount })}
        </span>
      </div>

      <div className="h-6 w-px bg-primary/20 hidden sm:block" />

      <div className="flex items-center gap-2 flex-wrap flex-1">
        {visibleActions.map((action, i) => (
          <button
            key={i}
            onClick={action.action}
            disabled={action.disabled}
            className={`px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              variantStyles[action.variant || 'default']
            }`}
          >
            {action.icon && (() => {
              const Icon = ACTION_ICON_MAP[action.icon];
              return Icon ? <Icon size={14} /> : null;
            })()}
            {action.label}
          </button>
        ))}
      </div>

      <button
        onClick={onClear}
        className="p-1.5 text-[var(--color-text-muted)] hover:text-slate-600 dark:hover:text-[var(--color-text-muted)] hover:bg-[#e8eaed]/50/50 rounded-[var(--border-radius-base)] transition-all shrink-0"
        title={t('bulkActions.clearSelection')}
      >
        <X size={18} />
      </button>
    </div>
  );
};
