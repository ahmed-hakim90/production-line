import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { MODAL_SHELL_Z_CLASS } from '@/lib/overlayStack';

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
  <ManagedModalPortal>
    <div
      className={`fixed inset-0 ${MODAL_SHELL_Z_CLASS} flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-xl ${maxWidthClassName}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-3 sm:px-4">
          <h3 className="min-w-0 truncate font-bold text-[var(--color-text)]">{title}</h3>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="إغلاق">
            <X size={16} />
          </Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[var(--color-text)] sm:p-4">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse flex-wrap gap-2 border-t border-[var(--color-border)] px-3 py-3 sm:flex-row sm:justify-end sm:px-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  </ManagedModalPortal>
);
