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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-5xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--color-text)]">معاينة كارت جرد الصنف</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
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
            className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
            title="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        {warningText && (
          <div className="px-5 py-2.5 border-b border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] text-xs font-bold">
            {warningText}
          </div>
        )}

        <div className="p-3 sm:p-5 overflow-auto flex-1" style={{ background: 'var(--color-bg)' }}>
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
