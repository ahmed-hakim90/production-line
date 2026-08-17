# ADR-010: Single print engine host

## Status

Accepted.

## Context

Print lived on each page: local `useReactToPrint`, off-screen trees (`opacity: 0` / `hidden`), and on mobile a separate `exportToPDF` (html2canvas) path. إضافة / صرف / تموين therefore did not match `/settings/reports` preview chrome.

## Decision

1. One `PrintEngineProvider` in `App.tsx` owns the only `react-to-print` instance.
2. Pages print via `useManagedPrint` (existing refs) or `printDocument({ render })` (on-demand mount in `PrintOffscreenHost`).
3. Browser print is the print path. html2canvas/`exportToPDF` stays for WhatsApp/PNG/PDF *export*, not for طباعة.
4. Document layouts stay in module print components; they must use `FactoryPrintShell` + `resolvePrintDocumentConfig`.

## Rejected alternatives

- Keep per-page `useReactToPrint` and only unify CSS — still allowed hidden/broken hosts and mobile PDF screenshots.
- A print job union of every `PrintDocumentTypeId` payload — too large for this slice; `render(ref)` covers all types without a payload mega-type.

## Consequences

- Print iframe CSS (`PRINT_ENGINE_IFRAME_CSS`) and `@page` always come from `buildGlobalPrintPageStyle` unless a job passes `pageStyle` (thermal barcode labels).
- Pages outside `PrintEngineProvider` cannot print (`useManagedPrint` toasts; `usePrintEngine` throws).
- Inventory and repair voucher/count prints, work orders, payslips, catalog product detail, supervisor reports, accounting reports, quality reports, production reports, and repair job/payment/treasury prints mount on demand via `printDocument`.
- Local `PrintOffscreenHost` is reserved for PDF/image capture (quick transfer export) and the engine host itself.
- On-screen print previews (settings, barcode labels, BOM count card, product drawer, sales invoice preview) keep `useManagedPrint` → `printFromRef` because the document is already visible.
- Dual-use pages may still mount a capture tree for PDF/WhatsApp **export**; browser **طباعة** uses `printDocument`.
