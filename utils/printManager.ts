import { useCallback } from 'react';
import type { RefObject } from 'react';
import { toast } from '../components/Toast';
import type { PrintTemplateSettings } from '../types';
import { useOptionalPrintEngine } from './print/PrintEngineHost';

export { buildGlobalPrintPageStyle, commitAndPrint, printAfterPaint, resolvePrintEnginePageStyle } from './print/printPageStyle';
export { PrintEngineProvider, usePrintEngine } from './print/PrintEngineHost';
export type { PrintEngineApi, PrintEngineJobOptions } from './print/PrintEngineHost';

interface UseManagedPrintOptions {
  contentRef: RefObject<HTMLElement | null>;
  printSettings?: PrintTemplateSettings;
  documentTitle?: string;
  onAfterPrint?: () => void;
  /** When set, replaces the global @page style (e.g. thermal barcode label sizes). */
  pageStyle?: string;
  /**
   * Skip copying app stylesheets into the print iframe.
   * Required for thermal labels: App.css / index.css force `@page { size: A4; margin: 10mm }`
   * which overrides 40×30mm and prints one design across several stickers.
   */
  ignoreGlobalStyles?: boolean;
}

/**
 * Print through the single PrintEngine host. No local react-to-print instance.
 */
export const useManagedPrint = ({
  contentRef,
  printSettings,
  documentTitle,
  onAfterPrint,
  pageStyle,
  ignoreGlobalStyles = false,
}: UseManagedPrintOptions) => {
  const engine = useOptionalPrintEngine();

  return useCallback(() => {
    if (!engine) {
      toast.error('تعذر تجهيز مستند الطباعة.');
      return;
    }
    engine.printFromRef(contentRef, {
      documentTitle,
      printSettings,
      pageStyle,
      ignoreGlobalStyles,
      onAfterPrint,
    });
  }, [
    engine,
    contentRef,
    documentTitle,
    printSettings,
    pageStyle,
    ignoreGlobalStyles,
    onAfterPrint,
  ]);
};
