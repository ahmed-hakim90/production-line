export interface NamedCatalogSignature {
  title: string;
  name: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Catalog names are compared without case so «خدش» and «خدش» cannot be stored twice. */
export function namedCatalogKey(name: string): string {
  return name.toLocaleLowerCase('ar');
}

export function normalizeNamedCatalogLabel(value: unknown, emptyMessage: string, maxLength = 120): string {
  const name = String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error(emptyMessage);
  if (name.length > maxLength) throw new Error(`يجب ألا يتجاوز الاسم ${maxLength} حرفًا.`);
  return name;
}

export function normalizeReturnSignatures(value: unknown): NamedCatalogSignature[] {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows.slice(0, 8).map((row) => {
    const signature = row && typeof row === 'object' ? row as { title?: unknown; name?: unknown } : {};
    return {
      title: String(signature.title ?? '').trim().slice(0, 80),
      name: String(signature.name ?? '').trim().slice(0, 80),
    };
  }).filter((signature) => signature.title || signature.name);
  return cleaned.length > 0 ? cleaned : [
    { title: 'توقيع مشرف الفرز الأول', name: '' },
    { title: 'توقيع مشرف الفرز الثاني', name: '' },
  ];
}

export function normalizeSecondSortReturn(input: {
  reportDate: string;
  productId: string;
  productName: string;
  quantity: unknown;
  notes: unknown;
  signatures: unknown;
}): {
  reportDate: string;
  productId: string;
  productName: string;
  quantity: number;
  notes: string;
  signatures: NamedCatalogSignature[];
} {
  const reportDate = String(input.reportDate || '');
  const parsed = ISO_DATE.test(reportDate) ? new Date(`${reportDate}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== reportDate) {
    throw new Error('تاريخ التقرير غير صالح.');
  }
  const productId = String(input.productId || '').trim();
  const productName = String(input.productName || '').trim();
  if (!productId || !productName) throw new Error('يرجى اختيار منتج صحيح من القائمة.');
  const quantityText = typeof input.quantity === 'string' ? input.quantity.trim() : input.quantity;
  const quantity = typeof quantityText === 'number'
    ? quantityText
    : typeof quantityText === 'string' && /^\d+$/.test(quantityText)
      ? Number(quantityText)
      : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('الكمية يجب أن تكون عددًا صحيحًا غير سالب.');
  }
  const notes = String(input.notes ?? '').trim();
  if (notes.length > 1000) throw new Error('الملاحظات يجب ألا تتجاوز 1000 حرف.');
  return {
    reportDate,
    productId,
    productName,
    quantity,
    notes,
    signatures: normalizeReturnSignatures(input.signatures),
  };
}
