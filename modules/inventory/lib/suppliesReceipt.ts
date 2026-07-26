import type { SuppliesReceiptLine, SuppliesReceiptProductGroup } from '../types';

/** Suggested inbound qty from BOM — no waste deduction (unlike reverse disassembly). */
export function suggestedReceiptQty(qtyPerUnit: number, productQty: number): number {
  const per = Number(qtyPerUnit || 0);
  const qty = Number(productQty || 0);
  if (!(per > 0) || !(qty > 0)) return 0;
  return per * qty;
}

export function lineDedupeKey(line: Pick<SuppliesReceiptLine, 'itemType' | 'itemId' | 'locationId'>): string {
  return `${line.itemType}__${line.itemId}__${line.locationId || ''}`;
}

export function assertNoDuplicateLines(
  lines: Array<Pick<SuppliesReceiptLine, 'itemType' | 'itemId' | 'locationId' | 'itemName'>>,
  scopeLabel: string,
): void {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = lineDedupeKey(line);
    if (seen.has(key)) {
      throw new Error(`تكرار المكون "${line.itemName || line.itemId}" في ${scopeLabel}.`);
    }
    seen.add(key);
  }
}

export function assertPositiveLines(
  lines: Array<Pick<SuppliesReceiptLine, 'quantity' | 'itemName'>>,
  scopeLabel: string,
): void {
  for (const line of lines) {
    if (!(Number(line.quantity) > 0)) {
      throw new Error(`كمية المكون "${line.itemName || ''}" في ${scopeLabel} يجب أن تكون أكبر من صفر.`);
    }
  }
}

export function assertLocationsWhenRequired(
  lines: Array<Pick<SuppliesReceiptLine, 'locationId' | 'itemName'>>,
  locationsRequired: boolean,
  scopeLabel: string,
): void {
  if (!locationsRequired) return;
  for (const line of lines) {
    if (!line.locationId) {
      throw new Error(`حدد لوكيشن للمكون "${line.itemName || ''}" في ${scopeLabel}.`);
    }
  }
}

export function collectExecutableLines(input: {
  groups: SuppliesReceiptProductGroup[];
  standaloneLines: SuppliesReceiptLine[];
}): SuppliesReceiptLine[] {
  const fromGroups = input.groups.flatMap((group) => group.lines || []);
  return [...fromGroups, ...(input.standaloneLines || [])].filter((line) => Number(line.quantity) > 0);
}

export function validateSuppliesReceiptDraft(input: {
  warehouseId: string;
  groups: SuppliesReceiptProductGroup[];
  standaloneLines: SuppliesReceiptLine[];
  locationsRequired?: boolean;
}): void {
  if (!input.warehouseId) throw new Error('حدد مخزن الاستلام.');
  const groups = input.groups || [];
  const standalone = input.standaloneLines || [];
  if (!groups.length && !standalone.length) {
    throw new Error('أضف منتجاً مفككاً أو مكوناً واحداً على الأقل.');
  }

  for (const group of groups) {
    if (!group.productId) throw new Error('حدد المنتج المفكك.');
    if (!(Number(group.quantity) > 0)) {
      throw new Error(`كمية المنتج "${group.productName || group.productId}" يجب أن تكون أكبر من صفر.`);
    }
    if (!group.lines?.length) {
      throw new Error(`المنتج "${group.productName || group.productId}" لا يحتوي على مكونات.`);
    }
    const scope = `مجموعة ${group.productName || group.productCode || group.productId}`;
    assertPositiveLines(group.lines, scope);
    assertNoDuplicateLines(group.lines, scope);
    assertLocationsWhenRequired(group.lines, Boolean(input.locationsRequired), scope);
  }

  if (standalone.length) {
    assertPositiveLines(standalone, 'المكونات المستقلة');
    assertNoDuplicateLines(standalone, 'المكونات المستقلة');
    assertLocationsWhenRequired(standalone, Boolean(input.locationsRequired), 'المكونات المستقلة');
  }

  const executable = collectExecutableLines({ groups, standaloneLines: standalone });
  if (!executable.length) throw new Error('لا توجد كميات موجبة لإدخالها.');
}
