import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Distinct visual tone per action across the ERP (tables, toolbars, forms). */
export type TableIconActionTone =
  | 'approve'
  | 'reject'
  | 'execute'
  | 'delete'
  | 'submit'
  | 'print'
  | 'view'
  | 'edit'
  | 'share'
  | 'export'
  | 'save'
  | 'undo'
  | 'neutral';

export type TableIconActionKind =
  | 'approve'
  | 'reject'
  | 'execute'
  | 'delete'
  | 'submit'
  | 'print'
  | 'view'
  | 'edit'
  | 'share'
  | 'export'
  | 'save'
  | 'undo'
  | 'refresh'
  | 'movement'
  | 'receive'
  | 'transfer'
  | 'issue'
  | 'counts'
  | 'exceptions'
  | 'analytics'
  | 'settings'
  | 'create'
  | 'open';

const TONE_CLASS: Record<TableIconActionTone, string> = {
  approve:
    'border-[rgb(var(--color-success)/0.35)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] hover:bg-[rgb(var(--color-success)/0.15)] dark:border-[rgb(var(--color-success)/0.25)] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))] dark:hover:bg-[rgb(var(--color-success)/0.2)]',
  reject:
    'border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.15)] dark:border-[rgb(var(--color-danger)/0.25)] dark:bg-[rgb(var(--color-danger)/0.2)] dark:text-[rgb(var(--color-danger))] dark:hover:bg-[rgb(var(--color-danger)/0.2)]',
  execute:
    'border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.15)] dark:border-[rgb(var(--color-primary)/0.25)] dark:bg-[rgb(var(--color-primary)/0.2)] dark:text-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.2)]',
  delete:
    'border-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.15)] dark:border-[rgb(var(--color-danger)/0.25)] dark:bg-[rgb(var(--color-danger)/0.2)] dark:text-[rgb(var(--color-danger))] dark:hover:bg-[rgb(var(--color-danger)/0.2)]',
  submit:
    'border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.15)] dark:border-[rgb(var(--color-primary)/0.25)] dark:bg-[rgb(var(--color-primary)/0.2)] dark:text-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.2)]',
  print:
    'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] dark:border-[var(--color-border)] dark:bg-[var(--color-surface-hover)] dark:text-[var(--color-text-muted)] dark:hover:bg-[var(--color-surface-hover)]',
  view:
    'border-[rgb(var(--color-primary)/0.35)] bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.15)] dark:border-[rgb(var(--color-primary)/0.25)] dark:bg-[rgb(var(--color-primary)/0.2)] dark:text-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.2)]',
  edit:
    'border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] hover:bg-[rgb(var(--color-warning)/0.15)] dark:border-[rgb(var(--color-warning)/0.25)] dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))] dark:hover:bg-[rgb(var(--color-warning)/0.2)]',
  share:
    'border-[rgb(var(--color-success)/0.35)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] hover:bg-[rgb(var(--color-success)/0.15)] dark:border-[rgb(var(--color-success)/0.25)] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))] dark:hover:bg-[rgb(var(--color-success)/0.2)]',
  export:
    'border-[rgb(var(--color-secondary)/0.35)] bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] hover:bg-[rgb(var(--color-secondary)/0.15)] dark:border-[rgb(var(--color-secondary)/0.25)] dark:bg-[rgb(var(--color-secondary)/0.2)] dark:text-[rgb(var(--color-secondary))] dark:hover:bg-[rgb(var(--color-secondary)/0.2)]',
  save:
    'border-[rgb(var(--color-secondary)/0.35)] bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] hover:bg-[rgb(var(--color-secondary)/0.15)] dark:border-[rgb(var(--color-secondary)/0.25)] dark:bg-[rgb(var(--color-secondary)/0.2)] dark:text-[rgb(var(--color-secondary))] dark:hover:bg-[rgb(var(--color-secondary)/0.2)]',
  undo:
    'border-[rgb(var(--color-warning)/0.35)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] hover:bg-[rgb(var(--color-warning)/0.15)] dark:border-[rgb(var(--color-warning)/0.25)] dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))] dark:hover:bg-[rgb(var(--color-warning)/0.2)]',
  neutral:
    'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] dark:hover:bg-[var(--color-surface-hover)]',
};

/** Solid (filled) variants for primary CTAs — same hue family as soft tones. */
const TONE_SOLID_CLASS: Record<TableIconActionTone, string> = {
  approve:
    'border-[rgb(var(--color-success))] bg-[rgb(var(--color-success))] text-white hover:bg-[rgb(var(--color-success)/0.9)] dark:border-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success))] dark:hover:bg-[rgb(var(--color-success)/0.1)]0',
  reject:
    'border-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger))] text-white hover:bg-[rgb(var(--color-danger)/0.9)] dark:border-[rgb(var(--color-danger))] dark:bg-[rgb(var(--color-danger))] dark:hover:bg-[rgb(var(--color-danger)/0.1)]0',
  execute:
    'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)] dark:border-[rgb(var(--color-primary))] dark:bg-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.1)]0',
  delete:
    'border-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger))] text-white hover:bg-[rgb(var(--color-danger))] dark:border-[rgb(var(--color-danger))] dark:bg-[rgb(var(--color-danger))] dark:hover:bg-[rgb(var(--color-danger)/0.9)]',
  submit:
    'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)] dark:border-[rgb(var(--color-primary))] dark:bg-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.1)]0',
  print:
    'border-[var(--color-border)] bg-[var(--color-text)] text-white hover:bg-[var(--color-text)] dark:border-[var(--color-border)] dark:bg-[var(--color-border)] dark:hover:bg-[var(--color-text-muted)]',
  view:
    'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-white hover:bg-[rgb(var(--color-primary)/0.9)] dark:border-[rgb(var(--color-primary))] dark:bg-[rgb(var(--color-primary))] dark:hover:bg-[rgb(var(--color-primary)/0.1)]0',
  edit:
    'border-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning))] text-white hover:bg-[rgb(var(--color-warning)/0.9)] dark:border-[rgb(var(--color-warning))] dark:bg-[rgb(var(--color-warning))] dark:hover:bg-[rgb(var(--color-warning)/0.1)]0',
  share:
    'border-[rgb(var(--color-success))] bg-[rgb(var(--color-success))] text-white hover:bg-[rgb(var(--color-success)/0.9)] dark:border-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success))] dark:hover:bg-[rgb(var(--color-success)/0.1)]0',
  export:
    'border-[rgb(var(--color-secondary))] bg-[rgb(var(--color-secondary))] text-white hover:bg-[rgb(var(--color-secondary)/0.9)] dark:border-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary))] dark:hover:bg-[rgb(var(--color-secondary)/0.1)]0',
  save:
    'border-[rgb(var(--color-secondary))] bg-[rgb(var(--color-secondary))] text-white hover:bg-[rgb(var(--color-secondary)/0.9)] dark:border-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary))] dark:hover:bg-[rgb(var(--color-secondary)/0.1)]0',
  undo:
    'border-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning))] text-white hover:bg-[rgb(var(--color-warning)/0.9)] dark:border-[rgb(var(--color-warning))] dark:bg-[rgb(var(--color-warning))] dark:hover:bg-[rgb(var(--color-warning)/0.1)]0',
  neutral:
    'border-[var(--color-border)] bg-[var(--color-text-muted)] text-white hover:bg-[var(--color-text)] dark:border-[var(--color-border)] dark:bg-[var(--color-border)] dark:hover:bg-[var(--color-text-muted)]',
};

export const ACTION_PRESET: Record<
  TableIconActionKind,
  { icon: string; tone: TableIconActionTone; title: string }
> = {
  approve: { icon: 'check_circle', tone: 'approve', title: 'اعتماد' },
  reject: { icon: 'cancel', tone: 'reject', title: 'رفض' },
  execute: { icon: 'play_circle', tone: 'execute', title: 'تنفيذ' },
  delete: { icon: 'delete', tone: 'delete', title: 'حذف' },
  submit: { icon: 'send', tone: 'submit', title: 'تقديم' },
  print: { icon: 'print', tone: 'print', title: 'طباعة' },
  view: { icon: 'visibility', tone: 'view', title: 'عرض' },
  edit: { icon: 'edit', tone: 'edit', title: 'تعديل' },
  share: { icon: 'share', tone: 'share', title: 'مشاركة' },
  export: { icon: 'download', tone: 'export', title: 'تصدير' },
  save: { icon: 'save', tone: 'save', title: 'حفظ' },
  undo: { icon: 'undo', tone: 'undo', title: 'تراجع' },
  refresh: { icon: 'refresh', tone: 'neutral', title: 'تحديث' },
  movement: { icon: 'swap_horiz', tone: 'execute', title: 'حركة مخزون' },
  receive: { icon: 'inventory_2', tone: 'share', title: 'استلام' },
  transfer: { icon: 'sync_alt', tone: 'export', title: 'تحويل' },
  issue: { icon: 'precision_manufacturing', tone: 'edit', title: 'صرف إنتاج' },
  counts: { icon: 'checklist', tone: 'save', title: 'الجرد' },
  exceptions: { icon: 'warning_amber', tone: 'undo', title: 'الاستثناءات' },
  analytics: { icon: 'analytics', tone: 'view', title: 'التحليلات' },
  settings: { icon: 'settings', tone: 'print', title: 'إعدادات' },
  create: { icon: 'add_circle', tone: 'submit', title: 'إنشاء' },
  open: { icon: 'open_in_new', tone: 'view', title: 'فتح' },
};

const ICON_ONLY_BASE =
  'inline-flex items-center justify-center h-[var(--control-height)] w-[var(--control-height)] rounded-[var(--border-radius-base)] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed [font-size:var(--font-size-sm)]';

const LABELED_BASE =
  'inline-flex items-center justify-center gap-1.5 h-[var(--control-height)] px-3.5 rounded-[var(--border-radius-base)] border [font-size:var(--font-size-sm)] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  action?: TableIconActionKind;
  tone?: TableIconActionTone;
  icon?: string;
  loading?: boolean;
};

export function TableIconAction({
  action,
  tone,
  icon,
  title,
  loading = false,
  className,
  type = 'button',
  disabled,
  'aria-label': ariaLabel,
  ...rest
}: Props) {
  const preset = action ? ACTION_PRESET[action] : undefined;
  const resolvedTone = tone ?? preset?.tone ?? 'neutral';
  const resolvedIcon = loading ? 'refresh' : icon ?? preset?.icon ?? 'more_horiz';
  const resolvedTitle = title ?? preset?.title;
  const resolvedAria = ariaLabel ?? resolvedTitle;

  return (
    <button
      type={type}
      title={resolvedTitle}
      aria-label={resolvedAria}
      disabled={disabled || loading}
      className={cn(ICON_ONLY_BASE, TONE_CLASS[resolvedTone], className)}
      {...rest}
    >
      <span
        className={cn('material-icons-round text-sm', loading && 'animate-spin')}
        aria-hidden
      >
        {resolvedIcon}
      </span>
    </button>
  );
}

export function tableIconActionToneClass(
  tone: TableIconActionTone,
  solid = false,
): string {
  return solid ? TONE_SOLID_CLASS[tone] : TONE_CLASS[tone];
}

export { TONE_CLASS, TONE_SOLID_CLASS };

type ToneActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Named preset — optional if both `icon` and `tone` are provided. */
  action?: TableIconActionKind;
  tone?: TableIconActionTone;
  icon?: string;
  loading?: boolean;
  /** Filled solid background (primary CTA). Default soft tint. */
  solid?: boolean;
  children: ReactNode;
};

/** Labeled button with distinctive tone + Material icon — for toolbars, forms, and table actions. */
export function ToneActionButton({
  action,
  tone,
  icon,
  loading = false,
  solid = false,
  children,
  className,
  type = 'button',
  disabled,
  title,
  ...rest
}: ToneActionButtonProps) {
  const preset = action ? ACTION_PRESET[action] : undefined;
  const resolvedTone = tone ?? preset?.tone ?? 'neutral';
  const resolvedIcon = loading ? 'refresh' : icon ?? preset?.icon ?? 'chevron_left';

  return (
    <button
      type={type}
      title={title ?? preset?.title}
      disabled={disabled || loading}
      className={cn(
        LABELED_BASE,
        solid ? TONE_SOLID_CLASS[resolvedTone] : TONE_CLASS[resolvedTone],
        className,
      )}
      {...rest}
    >
      <span
        className={cn('material-icons-round text-sm', loading && 'animate-spin')}
        aria-hidden
      >
        {resolvedIcon}
      </span>
      {children}
    </button>
  );
}
