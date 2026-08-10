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
    'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70',
  reject:
    'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70',
  execute:
    'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70',
  delete:
    'border-rose-400 bg-rose-100 text-rose-800 hover:bg-rose-200 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/80',
  submit:
    'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70',
  print:
    'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/70',
  view:
    'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70',
  edit:
    'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70',
  share:
    'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/70',
  export:
    'border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-950/70',
  save:
    'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70',
  undo:
    'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/70',
  neutral:
    'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] dark:hover:bg-slate-900/50',
};

/** Solid (filled) variants for primary CTAs — same hue family as soft tones. */
const TONE_SOLID_CLASS: Record<TableIconActionTone, string> = {
  approve:
    'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500',
  reject:
    'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500',
  execute:
    'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500',
  delete:
    'border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-600 dark:bg-rose-700 dark:hover:bg-rose-600',
  submit:
    'border-sky-600 bg-sky-600 text-white hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-600 dark:hover:bg-sky-500',
  print:
    'border-slate-700 bg-slate-700 text-white hover:bg-slate-800 dark:border-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500',
  view:
    'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500',
  edit:
    'border-amber-600 bg-amber-600 text-white hover:bg-amber-700 dark:border-amber-500 dark:bg-amber-600 dark:hover:bg-amber-500',
  share:
    'border-teal-600 bg-teal-600 text-white hover:bg-teal-700 dark:border-teal-500 dark:bg-teal-600 dark:hover:bg-teal-500',
  export:
    'border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-700 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500',
  save:
    'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 dark:border-violet-500 dark:bg-violet-600 dark:hover:bg-violet-500',
  undo:
    'border-orange-600 bg-orange-600 text-white hover:bg-orange-700 dark:border-orange-500 dark:bg-orange-600 dark:hover:bg-orange-500',
  neutral:
    'border-slate-600 bg-slate-600 text-white hover:bg-slate-700 dark:border-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500',
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
  'inline-flex items-center justify-center p-2 rounded-[var(--border-radius-base)] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const LABELED_BASE =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[var(--border-radius-base)] border text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

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
