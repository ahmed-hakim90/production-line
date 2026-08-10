import React, { useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/UI';
import type { PrintTemplateSettings } from '../../../types';
import { useManagedPrint } from '../../../utils/printManager';
import {
  ProductBomCountCardPrint,
  type ProductBomCountCard,
} from './ProductBomCountCardPrint';

export type ProductBomCountCardPreviewModalProps = {
  open: boolean;
  cards: ProductBomCountCard[];
  printSettings?: PrintTemplateSettings;
  loading?: boolean;
  warningText?: string | null;
  onClose: () => void;
};

export const ProductBomCountCardPreviewModal: React.FC<ProductBomCountCardPreviewModalProps> = ({
  open,
  cards,
  printSettings,
  loading = false,
  warningText,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings,
    documentTitle:
      cards.length === 1
        ? `كارت جرد — ${cards[0]?.productName || 'منتج'}`
        : `كروت جرد أصناف (${cards.length})`,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:w-[95vw] sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[var(--color-text)]">معاينة كارت جرد الصنف</p>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
              {loading
                ? 'جاري تحميل المكونات والأرصدة…'
                : cards.length === 1
                  ? `${cards[0].productName}${cards[0].warehouseName ? ` — ${cards[0].warehouseName}` : ''}`
                  : `${cards.length} منتج جاهز للمعاينة/الطباعة`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        {warningText && (
          <div className="shrink-0 border-b border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-5 py-2.5 text-xs font-bold text-[rgb(var(--color-warning))]">
            {warningText}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 sm:p-5" style={{ background: 'var(--color-bg)' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[var(--color-text-muted)]">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm font-bold">تحميل كارت الجرد…</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="py-16 text-center text-sm font-bold text-[var(--color-text-muted)]">
              لا توجد بيانات للعرض.
            </div>
          ) : (
            <div className="mx-auto w-fit">
              <ProductBomCountCardPrint
                ref={printRef}
                cards={cards}
                printSettings={printSettings}
                showStock
              />
            </div>
          )}
        </div>

        <div
          className="px-5 py-3.5 border-t border-[var(--color-border)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0"
          style={{ background: 'var(--color-bg)' }}
        >
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-full sm:w-auto"
            disabled={loading || cards.length === 0}
            onClick={() => handlePrint()}
          >
            طباعة الآن
          </Button>
        </div>
      </div>
    </div>
  );
};
