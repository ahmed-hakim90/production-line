export type CustodyQuantities = {
  receivedQuantity: number;
  unrepairableQuantity?: number;
  custodyHandedOverQuantity?: number;
  unrepairableHandedOverQuantity?: number;
};

const qty = (value: unknown): number => Math.max(0, Math.round(Number(value) || 0));

/** Replacements are deliberately excluded from both customer-device stock equations. */
export function computeCustomerDeviceBalances(input: CustodyQuantities) {
  const received = qty(input.receivedQuantity);
  const unrepairable = qty(input.unrepairableQuantity);
  const custodyHandedOver = qty(input.custodyHandedOverQuantity);
  const unrepairableHandedOver = qty(input.unrepairableHandedOverQuantity);
  const custody = received - unrepairable - custodyHandedOver;
  const unrepairableStock = unrepairable - unrepairableHandedOver;
  return { custody, unrepairableStock, valid: custody >= 0 && unrepairableStock >= 0 };
}

export function canCorrectUnrepairableQuantity(input: CustodyQuantities, nextUnrepairable: number): boolean {
  const next = qty(nextUnrepairable);
  return next >= qty(input.unrepairableHandedOverQuantity)
    && next + qty(input.custodyHandedOverQuantity) <= qty(input.receivedQuantity);
}

export type PortalScannedLine = {
  productId: string;
  name: string;
  code: string;
  barcode: string;
  quantity: number;
  note: string;
};

export function mergePortalScannedLine(lines: PortalScannedLine[], scanned: Omit<PortalScannedLine, 'quantity' | 'note'>) {
  const existing = lines.find((line) => line.productId === scanned.productId);
  if (existing) {
    return lines.map((line) => line.productId === scanned.productId ? { ...line, quantity: qty(line.quantity) + 1 } : line);
  }
  return [...lines, { ...scanned, quantity: 1, note: '' }];
}
