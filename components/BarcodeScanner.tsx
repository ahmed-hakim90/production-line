import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    const elementId = 'barcode-scanner-view';
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScan(decodedText.trim());
          scanner.stop().catch(() => {});
          onClose();
        },
        () => {}
      )
      .catch((err) => {
        console.error('Camera error:', err);
        setError('لم يتم العثور على كاميرا أو تم رفض الإذن');
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-bold text-base">مسح الباركود بالكاميرا</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="text-center py-8">
              <span className="material-icons-round text-4xl text-rose-400 mb-3 block">videocam_off</span>
              <p className="text-sm text-rose-600 font-medium">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-[#f0f2f5] rounded-[var(--border-radius-base)] text-sm font-bold hover:bg-[#e8eaed] transition-colors"
              >
                إغلاق
              </button>
            </div>
          ) : (
            <>
              <div id="barcode-scanner-view" className="rounded-[var(--border-radius-lg)] overflow-hidden" />
              <p className="text-xs text-[var(--color-text-muted)] text-center mt-3 font-medium">
                وجّه الكاميرا نحو باركود الموظف
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
