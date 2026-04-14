const escapeCsvCell = (value: string | number | null | undefined): string => {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** UTF-8 with BOM for Excel Arabic compatibility. */
export const downloadUtf8Csv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
};
