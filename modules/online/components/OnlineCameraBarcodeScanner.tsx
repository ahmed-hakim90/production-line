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
  /** If start() is still resolving, state may be NOT_STARTED while getUserMedia already opened — stop() throws; close stream via renderedCamera. */
  const closeRenderedCameraIfAny = () => {
    const rc = (html5 as unknown as { renderedCamera?: { close: () => Promise<void> } }).renderedCamera;
    if (rc && typeof rc.close === 'function') {
      void rc.close().then(clearSafe, clearSafe);
    } else {
      clearSafe();
    }
  };
  try {
    void html5.stop().then(clearSafe, clearSafe);
  } catch {
    closeRenderedCameraIfAny();
  }
}

const DEFAULT_FPS = 10;

function defaultQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  const w = Math.min(280, Math.floor(viewfinderWidth * 0.85));
  const h = Math.min(200, Math.floor(viewfinderHeight * 0.45));
  return { width: Math.max(200, w), height: Math.max(120, h) };
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
  /** Frames per second for html5-qrcode (default 10). */
  fps?: number;
  /** Custom scan region; defaults match previous hard-coded qrbox. */
  qrbox?: (viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number };
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
  fps = DEFAULT_FPS,
  qrbox,
}) => {
  const reactId = useId().replace(/:/g, '_');
  const elementId = `hq-scan-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;
  const onScannerErrorRef = useRef(onScannerError);
  onScannerErrorRef.current = onScannerError;
  const qrboxRef = useRef(qrbox ?? defaultQrbox);
  qrboxRef.current = qrbox ?? defaultQrbox;

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
    const fpsClamped = Math.min(30, Math.max(1, Math.round(fps)));
    void html5
      .start(
        { facingMode: 'environment' },
        {
          fps: fpsClamped,
          /** Scan box sized for a capped preview (see container max-height). */
          qrbox: (viewfinderWidth, viewfinderHeight) =>
            qrboxRef.current(viewfinderWidth, viewfinderHeight),
        },
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
  }, [active, disabled, elementId, fps]);

  /** Keep the host #elementId in the DOM while tearing down so html5-qrcode can stop tracks; hiding avoids `return null` removing the node before useEffect cleanup. */
  return (
    <div className={cn('space-y-2', className, !active && 'hidden')}>
      <p className={cn('text-xs text-[var(--color-text-muted)]', !active && 'sr-only')}>{hint}</p>
      <div
        id={elementId}
        className={cn(
          'relative w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-black',
          /* Cap height on phones: full sensor stream is often very tall */
          'max-h-[min(58dvh,380px)] min-h-[200px] sm:max-h-[min(52dvh,420px)]',
          '[&_video]:mx-auto [&_video]:block [&_video]:max-h-[min(58dvh,380px)] [&_video]:w-full [&_video]:object-contain sm:[&_video]:max-h-[min(52dvh,420px)]',
          '[&_canvas]:max-h-[inherit]',
        )}
        aria-hidden={!active}
      />
    </div>
  );
};
