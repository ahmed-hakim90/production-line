import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { useReactToPrint } from 'react-to-print';
import { toast } from '../../components/Toast';
import { PrintOffscreenHost } from '@/src/components/erp/PrintOffscreenHost';
import type { PrintTemplateSettings } from '../../types';
import { buildGlobalPrintPageStyle, printAfterPaint, resolvePrintEnginePageStyle } from './printPageStyle';

export type PrintEngineJobOptions = {
  documentTitle?: string;
  printSettings?: PrintTemplateSettings;
  /** When set, replaces the global @page style (thermal barcode labels). */
  pageStyle?: string;
  ignoreGlobalStyles?: boolean;
  onAfterPrint?: () => void;
};

export type PrintEngineApi = {
  /** Print an already-mounted engine document (legacy page refs). */
  printFromRef: (
    contentRef: RefObject<HTMLElement | null>,
    options?: PrintEngineJobOptions,
  ) => void;
  /** Mount the document in the single engine host, then print. */
  printDocument: (
    options: PrintEngineJobOptions & {
      render: (ref: Ref<HTMLDivElement>) => ReactNode;
    },
  ) => void;
};

const PrintEngineContext = createContext<PrintEngineApi | null>(null);

type InternalJob = PrintEngineJobOptions & {
  nonce: number;
  source: 'ref' | 'render';
};

export function PrintEngineProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<InternalJob | null>(null);
  const [onDemand, setOnDemand] = useState<ReactNode>(null);
  const nonceRef = useRef(0);
  const sourceNodeRef = useRef<HTMLElement | null>(null);
  const onDemandRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const afterPrintRef = useRef<(() => void) | undefined>(undefined);
  const pendingRef = useRef(false);

  const pageStyle = useMemo(
    () => (job ? resolvePrintEnginePageStyle(job) : buildGlobalPrintPageStyle()),
    [job],
  );

  const clearJob = useCallback(() => {
    pendingRef.current = false;
    sourceNodeRef.current = null;
    contentRef.current = null;
    afterPrintRef.current = undefined;
    setOnDemand(null);
    setJob(null);
  }, []);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: job?.documentTitle,
    pageStyle,
    ignoreGlobalStyles: job?.ignoreGlobalStyles === true,
    onAfterPrint: () => {
      afterPrintRef.current?.();
      clearJob();
    },
  });

  useLayoutEffect(() => {
    if (!job || !pendingRef.current) return;
    contentRef.current = job.source === 'render' ? onDemandRef.current : sourceNodeRef.current;
    if (!contentRef.current) {
      toast.error('تعذر تجهيز مستند الطباعة.');
      clearJob();
      return;
    }
    pendingRef.current = false;
    printAfterPaint(() => {
      handlePrint();
    });
  }, [job, handlePrint, clearJob, onDemand]);

  const printFromRef = useCallback(
    (ref: RefObject<HTMLElement | null>, options?: PrintEngineJobOptions) => {
      const node = ref.current;
      if (!node) {
        toast.error('تعذر تجهيز مستند الطباعة.');
        return;
      }
      nonceRef.current += 1;
      sourceNodeRef.current = node;
      afterPrintRef.current = options?.onAfterPrint;
      pendingRef.current = true;
      setOnDemand(null);
      setJob({
        ...options,
        nonce: nonceRef.current,
        source: 'ref',
      });
    },
    [],
  );

  const printDocument = useCallback(
    (
      options: PrintEngineJobOptions & {
        render: (ref: Ref<HTMLDivElement>) => ReactNode;
      },
    ) => {
      nonceRef.current += 1;
      afterPrintRef.current = options.onAfterPrint;
      pendingRef.current = true;
      sourceNodeRef.current = null;
      setOnDemand(options.render(onDemandRef));
      setJob({
        documentTitle: options.documentTitle,
        printSettings: options.printSettings,
        pageStyle: options.pageStyle,
        ignoreGlobalStyles: options.ignoreGlobalStyles,
        nonce: nonceRef.current,
        source: 'render',
      });
    },
    [],
  );

  const api = useMemo<PrintEngineApi>(
    () => ({ printFromRef, printDocument }),
    [printFromRef, printDocument],
  );

  return (
    <PrintEngineContext.Provider value={api}>
      {children}
      <PrintOffscreenHost>
        {onDemand}
      </PrintOffscreenHost>
    </PrintEngineContext.Provider>
  );
}

export function useOptionalPrintEngine(): PrintEngineApi | null {
  return useContext(PrintEngineContext);
}

export function usePrintEngine(): PrintEngineApi {
  const engine = useContext(PrintEngineContext);
  if (!engine) {
    throw new Error('usePrintEngine must be used inside PrintEngineProvider');
  }
  return engine;
}
