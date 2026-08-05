import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ModalShellProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
};

export const RepairModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-2xl',
}) => (
  <div
    className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    onClick={onClose}
    role="presentation"
  >
    <div
      className={`bg-[var(--color-card)] rounded-xl shadow-2xl w-full ${maxWidthClassName} border border-[var(--color-border)] max-h-[90vh] flex flex-col overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="font-bold text-[var(--color-text)]">{title}</h3>
        <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="إغلاق">
          <X size={16} />
        </Button>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-3 text-[var(--color-text)]">{children}</div>
      {footer ? (
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex flex-wrap gap-2 justify-end">
          {footer}
        </div>
      ) : null}
    </div>
  </div>
);
