import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../UI';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { MODAL_SHELL_Z_CLASS } from '@/lib/overlayStack';

type ModalShellProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
  zIndexClassName?: string;
};

export const ModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-2xl',
  zIndexClassName = MODAL_SHELL_Z_CLASS,
}) => (
  <ManagedModalPortal>
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[92dvh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-t-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <h3 className="min-w-0 truncate font-bold text-[var(--color-text)]">{title}</h3>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="إغلاق">
            <X size={16} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--color-card)] p-4 text-[var(--color-text)]">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  </ManagedModalPortal>
);
