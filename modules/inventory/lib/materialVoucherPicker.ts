import { materialScanKeys } from '../../manufacturing/lib/materialScanKeys';
import type { Material } from '../../manufacturing/types';
import type { VoucherItemComboboxOption } from '../components/VoucherItemCombobox';
import type { TransferItemOption } from '../utils/transferFormShared';

export function materialToVoucherCatalogItem(material: Material): TransferItemOption | null {
  const id = String(material.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: material.name,
    code: material.code || '',
    barcode: String(material.barcode || '').trim() || undefined,
    minStock: Number(material.minStock || 0),
    stockItemType: 'material',
  };
}

export function buildMaterialVoucherPicker(
  materials: Material[],
  formatLabel: (material: Material) => string = (material) =>
    `${material.name}${material.code ? ` (${material.code})` : ''}`,
): { catalog: TransferItemOption[]; options: VoucherItemComboboxOption[] } {
  const catalog: TransferItemOption[] = [];
  const options: VoucherItemComboboxOption[] = [];
  for (const material of materials) {
    const item = materialToVoucherCatalogItem(material);
    if (!item) continue;
    const scanKeys = materialScanKeys(material);
    catalog.push({ ...item, scanKeys });
    options.push({
      value: item.id,
      label: formatLabel(material),
      searchText: scanKeys.join(' '),
    });
  }
  return { catalog, options };
}

export type CodeVoucherPickerItem = {
  value: string;
  label: string;
  name?: string;
  code?: string | null;
  barcode?: string | null;
  scanKeys?: string[] | null;
  stockItemType?: TransferItemOption['stockItemType'];
};

export function buildCodeVoucherPicker(
  items: CodeVoucherPickerItem[],
): { catalog: TransferItemOption[]; options: VoucherItemComboboxOption[] } {
  const catalog: TransferItemOption[] = [];
  const options: VoucherItemComboboxOption[] = [];
  for (const item of items) {
    const id = String(item.value || '').trim();
    if (!id) continue;
    const scanKeys = materialScanKeys({
      code: item.code,
      barcode: item.barcode,
      scanKeys: item.scanKeys,
    });
    catalog.push({
      id,
      name: item.name || item.label,
      code: String(item.code || '').trim(),
      barcode: String(item.barcode || '').trim() || undefined,
      scanKeys,
      minStock: 0,
      stockItemType: item.stockItemType || 'material',
    });
    options.push({
      value: id,
      label: item.label,
      searchText: scanKeys.join(' '),
    });
  }
  return { catalog, options };
}
