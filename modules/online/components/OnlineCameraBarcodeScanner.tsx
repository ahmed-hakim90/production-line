import React, { useEffect, useId, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { cn } from '@/lib/utils';

/** html5-qrcode throws synchronously from stop() if the camera never started or already stopped (e.g. React Strict Mode). */
function disposeHtml5Scanner(html5: Html5Qrcode | null) {
  if (!html5) return;
  const clearSafe = () => {
    try {
      html5.clear();
    } catch {
      /* ignore */
    }
  };
  try {
    void html5.stop().then(clearSafe, clearSafe);
  } catch {
    clearSafe();
  }
}

export type OnlineCameraBarcodeScannerProps = {
  active: boolean;
  /** Called when a code is read; keep stable or use ref inside parent for scan cooldown */
  onDecoded: (text: string) => void;
  onScannerError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
  /** Shown when camera is active */
  hint?: string;
};

/**
 * Live camera scanner using html5-qrcode (QR + common 1D/2D formats when supported).
 */
export const OnlineCameraBarcodeScanner: React.FC<OnlineCameraBarcodeScannerProps> = ({
  active,
  onDecoded,
  onScannerError,
  disabled,
  className,
  hint = 'وجّه الكاميرا نحو الباركود أو رمز QR',
}) => {
  const reactId = useId().replace(/:/g, '_');
  const elementId = `hq-scan-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;
  const onScannerErrorRef = useRef(onScannerError);
  onScannerErrorRef.current = onScannerError;

  useEffect(() => {
    if (!active || disabled) {
      const s = scannerRef.current;
      scannerRef.current = null;
      disposeHtml5Scanner(s);
      return;
    }

    const html5 = new Html5Qrcode(elementId, {
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    });
    scannerRef.current = html5;

    let cancelled = false;
    void html5
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 200 } },
        (decodedText) => {
          if (cancelled) return;
          onDecodedRef.current(decodedText);
        },
        () => {
          /* frames without detection — ignore */
        },
      )
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'تعذر تشغيل الكاميرا — تأكد من الإذن واستخدام HTTPS';
        onScannerErrorRef.current?.(msg);
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      disposeHtml5Scanner(html5);
    };
  }, [active, disabled, elementId]);

  if (!active) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      <div
        id={elementId}
        className="w-full min-h-[220px] rounded-lg overflow-hidden border border-[var(--color-border)] bg-black/5"
      />
    </div>
  );
};
