/** Print-iframe safe colors — never depend on live-page CSS variables. */
export const PRINT_SURFACE = {
  card: '#ffffff',
  bg: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  divider: '#e2e8f0',
} as const

/**
 * Self-contained chrome for cloned print iframes.
 * react-to-print often fails to copy Tailwind (adopted stylesheets / relative CSS).
 * These rules keep أمر شغل / الجرد / every .print-root matching the engine preview.
 */
export const PRINT_ENGINE_IFRAME_CSS = `
.print-root, .print-report, .arabic-export-root {
  font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif;
  color: ${PRINT_SURFACE.text};
  background: ${PRINT_SURFACE.card};
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-root *, .print-report *, .arabic-export-root * {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-brand-header {
  display: flex !important;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom-width: 2px;
  border-bottom-style: solid;
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.print-brand-identity {
  display: flex !important;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.print-brand-logo {
  flex-shrink: 0;
  display: flex !important;
  align-items: center;
  justify-content: center;
  height: 56px;
  max-width: 11rem;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #dbeafe;
  background: #ffffff;
}
.print-brand-logo img {
  width: auto;
  max-height: 48px;
  max-width: 10.5rem;
  object-fit: contain;
  object-position: right;
}
.print-brand-initials {
  flex-shrink: 0;
  display: flex !important;
  align-items: center;
  justify-content: center;
  height: 56px;
  width: 56px;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 800;
}
.print-brand-name {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
  color: ${PRINT_SURFACE.text};
  word-break: break-word;
}
.print-brand-meta {
  display: flex !important;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  max-width: 42%;
  padding-top: 2px;
}
.print-meta-grid, .print-kpi-grid, .print-sign-grid {
  display: grid !important;
}
.print-meta-grid {
  margin-bottom: 16px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid ${PRINT_SURFACE.border};
}
.print-meta-cell {
  padding: 8px 12px;
  background: ${PRINT_SURFACE.bg};
  border-inline-end: 1px solid ${PRINT_SURFACE.border};
}
.print-meta-cell:last-child { border-inline-end: none; }
.print-meta-label {
  margin: 0 0 4px;
  font-size: 9px;
  font-weight: 700;
  color: ${PRINT_SURFACE.muted};
}
.print-meta-value {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  color: ${PRINT_SURFACE.text};
  word-break: break-word;
}
.print-kpi-grid {
  gap: 8px;
  margin-bottom: 16px;
}
.print-kpi-card {
  display: flex !important;
  flex-direction: row;
  min-height: 5.25rem;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid ${PRINT_SURFACE.border};
  background: ${PRINT_SURFACE.bg};
}
.print-kpi-strip {
  width: 3px;
  flex-shrink: 0;
  align-self: stretch;
}
.print-kpi-body {
  flex: 1;
  min-width: 0;
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  text-align: center;
}
.print-section-head {
  display: flex !important;
  align-items: center;
  gap: 8px;
  margin: 12px 0 8px;
}
.print-section-bar {
  width: 3px;
  height: 12px;
  border-radius: 999px;
  flex-shrink: 0;
}
.print-section-title {
  margin: 0;
  font-size: 9px;
  font-weight: 800;
  color: ${PRINT_SURFACE.muted};
}
.print-kv-block {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid ${PRINT_SURFACE.border};
  background: ${PRINT_SURFACE.card};
}
.print-kv-row {
  display: grid !important;
  grid-template-columns: 38% 1fr;
  gap: 12px;
  padding: 10px 12px;
  align-items: start;
  border-bottom: 1px solid ${PRINT_SURFACE.border};
}
.print-kv-row:last-child { border-bottom: none; }
.print-kv-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: ${PRINT_SURFACE.muted};
}
.print-kv-value {
  font-size: 13px;
  font-weight: 700;
  color: ${PRINT_SURFACE.text};
  min-width: 0;
}
.print-info-grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 16px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid ${PRINT_SURFACE.border};
}
.print-info-cell {
  min-width: 0;
  padding: 10px 12px;
  text-align: right;
}
.print-product-head {
  display: flex !important;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.print-progress-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: #e2e8f0;
}
.print-progress-fill {
  height: 100%;
  border-radius: 999px;
}
.print-sign-grid {
  gap: 20px;
  margin-top: 24px;
}
.print-sign-slot {
  display: flex !important;
  flex-direction: column;
  align-items: center;
}
.print-root table, .print-report table {
  width: 100%;
  border-collapse: collapse;
  text-align: right;
}
.print-root table th, .print-report table th,
.print-root table td, .print-report table td {
  border: 1px solid ${PRINT_SURFACE.border};
  padding: 8px;
}
`
