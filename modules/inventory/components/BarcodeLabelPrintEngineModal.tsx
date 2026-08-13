import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, SearchableSelect } from './UI';
import type { PrintTemplateSettings } from '../../../types';
import { useManagedPrint } from '../../../utils/printManager';
import { ItemBarcodeLabelPrint } from './ItemBarcodeLabelPrint';
import { LocationBarcodeLabelPrint } from './LocationBarcodeLabelPrint';
import {
  BARCODE_LABEL_SIZE_PRESETS,
  DEFAULT_BARCODE_LABEL_SIZE_ID,
  DEFAULT_THERMAL_GAP_MM,
  barcodeLabelFieldDefs,
  buildBarcodeLabelPageStyle,
  buildItemBarcodeLabels,
  buildLocationBarcodeLabels,
  clampThermalGapMm,
  clampThermalLabelMm,
  defaultBarcodeLabelFields,
  expandLabelCopies,
  formatDriverStockSize,
  resolveBarcodeLabelSize,
  withBarcodeLabelFieldOverrides,
  type BarcodeLabelEngineMode,
  type BarcodeLabelItemOption,
  type BarcodeLabelLocationOption,
  type BarcodeLabelSizeId,
} from '../lib/barcodeLabelEngine';

const PREVIEW_CAP = 24;
const SIZE_STORAGE_KEY = 'forgeops.barcodeLabel.printSize';

type StoredLabelSize = {
  sizeId: BarcodeLabelSizeId;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
};

function readStoredLabelSize(): StoredLabelSize | null {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLabelSize;
    if (!parsed?.sizeId) return null;
    if (!BARCODE_LABEL_SIZE_PRESETS.some((row) => row.id === parsed.sizeId)) return null;
    return {
      sizeId: parsed.sizeId,
      widthMm: clampThermalLabelMm(Number(parsed.widthMm), 40),
      heightMm: clampThermalLabelMm(Number(parsed.heightMm), 30),
      gapMm: clampThermalGapMm(parsed.gapMm ?? DEFAULT_THERMAL_GAP_MM),
    };
  } catch {
    return null;
  }
}

function writeStoredLabelSize(value: StoredLabelSize): void {
  try {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export type BarcodeLabelPrintEngineModalProps = {
  open: boolean;
  onClose: () => void;
  warehouseName?: string;
  printSettings?: PrintTemplateSettings;
  items: BarcodeLabelItemOption[];
  locations: BarcodeLabelLocationOption[];
  initialMode?: BarcodeLabelEngineMode;
  initialItemId?: string;
  initialLocationId?: string;
  /** When set, limit the location list to these ids and default to print-all within that set. */
  initialLocationIds?: string[];
  initialCopies?: number;
};

export const BarcodeLabelPrintEngineModal: React.FC<BarcodeLabelPrintEngineModalProps> = ({
  open,
  onClose,
  warehouseName,
  printSettings,
  items,
  locations,
  initialMode = 'items',
  initialItemId = '',
  initialLocationId = '',
  initialLocationIds,
  initialCopies = 1,
}) => {
  const [mode, setMode] = useState<BarcodeLabelEngineMode>(initialMode);
  const [itemId, setItemId] = useState(initialItemId);
  const [locationId, setLocationId] = useState(initialLocationId);
  const [printAllItems, setPrintAllItems] = useState(false);
  const [printAllLocations, setPrintAllLocations] = useState(false);
  const [copies, setCopies] = useState(Math.max(1, initialCopies));
  const [labelSizeId, setLabelSizeId] = useState<BarcodeLabelSizeId>(DEFAULT_BARCODE_LABEL_SIZE_ID);
  const [customWidthMm, setCustomWidthMm] = useState(40);
  const [customHeightMm, setCustomHeightMm] = useState(30);
  const [gapMm, setGapMm] = useState(DEFAULT_THERMAL_GAP_MM);
  const [itemFields, setItemFields] = useState(() => defaultBarcodeLabelFields('itemBarcodeLabel', printSettings));
  const [locationFields, setLocationFields] = useState(() =>
    defaultBarcodeLabelFields('locationBarcodeLabel', printSettings),
  );

  const itemPrintRef = useRef<HTMLDivElement>(null);
  const locationPrintRef = useRef<HTMLDivElement>(null);
  const labelCustomMm = useMemo(
    () => ({ widthMm: customWidthMm, heightMm: customHeightMm }),
    [customWidthMm, customHeightMm],
  );
  const labelSize = useMemo(
    () => resolveBarcodeLabelSize(labelSizeId, labelCustomMm),
    [labelCustomMm, labelSizeId],
  );
  const labelPageStyle = useMemo(
    () => buildBarcodeLabelPageStyle(labelSizeId, labelCustomMm, gapMm),
    [gapMm, labelCustomMm, labelSizeId],
  );
  const driverStock = formatDriverStockSize(labelSize.widthMm, labelSize.heightMm);

  const effectiveItemSettings = useMemo(
    () => withBarcodeLabelFieldOverrides(printSettings, 'itemBarcodeLabel', itemFields),
    [itemFields, printSettings],
  );
  const effectiveLocationSettings = useMemo(
    () => withBarcodeLabelFieldOverrides(printSettings, 'locationBarcodeLabel', locationFields),
    [locationFields, printSettings],
  );

  const handleItemPrint = useManagedPrint({
    contentRef: itemPrintRef,
    printSettings: effectiveItemSettings,
    documentTitle: 'ملصقات باركود الأصناف',
    pageStyle: labelPageStyle,
    ignoreGlobalStyles: true,
  });
  const handleLocationPrint = useManagedPrint({
    contentRef: locationPrintRef,
    printSettings: effectiveLocationSettings,
    documentTitle: 'ملصقات باركود اللوكيشن',
    pageStyle: labelPageStyle,
    ignoreGlobalStyles: true,
  });

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setItemId(initialItemId);
    setLocationId(initialLocationId);
    setCopies(Math.max(1, Math.min(200, Number(initialCopies) || 1)));
    const stored = readStoredLabelSize();
    setLabelSizeId(stored?.sizeId || DEFAULT_BARCODE_LABEL_SIZE_ID);
    setCustomWidthMm(stored?.widthMm || 40);
    setCustomHeightMm(stored?.heightMm || 30);
    setGapMm(stored?.gapMm ?? DEFAULT_THERMAL_GAP_MM);
    setPrintAllItems(!initialItemId && initialMode === 'items');
    const scopedLocs = Array.isArray(initialLocationIds) && initialLocationIds.length > 0;
    setPrintAllLocations(scopedLocs || (!initialLocationId && initialMode === 'locations'));
    setItemFields(defaultBarcodeLabelFields('itemBarcodeLabel', printSettings));
    setLocationFields(defaultBarcodeLabelFields('locationBarcodeLabel', printSettings));
  }, [open, initialMode, initialItemId, initialLocationId, initialLocationIds, initialCopies, printSettings]);

  const effectiveLocations = useMemo(() => {
    if (!Array.isArray(initialLocationIds) || initialLocationIds.length === 0) return locations;
    const allow = new Set(initialLocationIds.map(String));
    return locations.filter((loc) => allow.has(String(loc.id)));
  }, [initialLocationIds, locations]);

  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        value: item.id,
        label: item.code ? `${item.name} (${item.code})` : item.name,
      })),
    [items],
  );

  const locationOptions = useMemo(
    () =>
      effectiveLocations.map((loc) => ({
        value: loc.id,
        label: loc.rackName ? `${loc.code} — ${loc.rackName}` : loc.code,
      })),
    [effectiveLocations],
  );

  const selectedItems = useMemo(() => {
    if (printAllItems) return items;
    const one = items.find((row) => row.id === itemId);
    return one ? [one] : [];
  }, [items, itemId, printAllItems]);

  const selectedLocations = useMemo(() => {
    if (printAllLocations) return effectiveLocations;
    const one = effectiveLocations.find((row) => row.id === locationId);
    return one ? [one] : [];
  }, [effectiveLocations, locationId, printAllLocations]);

  const itemLabels = useMemo(
    () =>
      expandLabelCopies(
        buildItemBarcodeLabels({ items: selectedItems, warehouseName }),
        copies,
      ),
    [copies, selectedItems, warehouseName],
  );

  const locationLabels = useMemo(
    () =>
      expandLabelCopies(
        buildLocationBarcodeLabels({ locations: selectedLocations, warehouseName }),
        copies,
      ),
    [copies, selectedLocations, warehouseName],
  );

  const previewItemLabels = itemLabels.slice(0, PREVIEW_CAP);
  const previewLocationLabels = locationLabels.slice(0, PREVIEW_CAP);
  const activeCount = mode === 'items' ? itemLabels.length : locationLabels.length;
  const fieldDefs = mode === 'items'
    ? barcodeLabelFieldDefs('itemBarcodeLabel')
    : barcodeLabelFieldDefs('locationBarcodeLabel');
  const fieldState = mode === 'items' ? itemFields : locationFields;
  const setFieldState = mode === 'items' ? setItemFields : setLocationFields;

  const runPrint = () => {
    if (mode === 'items') {
      if (itemLabels.length === 0) {
        toast.error('اختر صنفاً واحداً على الأقل للطباعة.');
        return;
      }
      if (itemLabels.length > 100 && !window.confirm(`سيتم طباعة ${itemLabels.length} ملصق. متابعة؟`)) {
        return;
      }
      handleItemPrint();
      return;
    }
    if (locationLabels.length === 0) {
      toast.error('اختر لوكيشن واحد على الأقل للطباعة.');
      return;
    }
    if (locationLabels.length > 100 && !window.confirm(`سيتم طباعة ${locationLabels.length} ملصق. متابعة؟`)) {
      return;
    }
    handleLocationPrint();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:w-[96vw] sm:rounded-[var(--border-radius-xl)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[var(--color-text)]">محرك طباعة ملصقات الباركود</p>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
              {warehouseName || 'المخزن'} · معاينة ثم طباعة · {activeCount} ملصق
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)]"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4 overflow-auto border-b border-[var(--color-border)] p-4 lg:border-b-0 lg:border-l">
            <div className="flex gap-1 rounded-[var(--border-radius-lg)] bg-[var(--color-bg)] p-1">
              <button
                type="button"
                className={`flex-1 rounded-[var(--border-radius-md)] px-2 py-1.5 text-xs font-bold ${
                  mode === 'items'
                    ? 'bg-[var(--color-card)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-muted)]'
                }`}
                onClick={() => setMode('items')}
              >
                أصناف
              </button>
              <button
                type="button"
                className={`flex-1 rounded-[var(--border-radius-md)] px-2 py-1.5 text-xs font-bold ${
                  mode === 'locations'
                    ? 'bg-[var(--color-card)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-muted)]'
                }`}
                onClick={() => setMode('locations')}
              >
                لوكيشنات
              </button>
            </div>

            {mode === 'items' ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={printAllItems}
                    onChange={(event) => {
                      setPrintAllItems(event.target.checked);
                      if (event.target.checked) setItemId('');
                    }}
                  />
                  كل الأصناف في القائمة ({items.length})
                </label>
                {!printAllItems ? (
                  <label className="block space-y-1 text-sm font-semibold">
                    <span>اختر الصنف</span>
                    <SearchableSelect
                      options={itemOptions}
                      value={itemId}
                      onChange={setItemId}
                      placeholder="ابحث بالاسم أو الكود…"
                    />
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={printAllLocations}
                    onChange={(event) => {
                      setPrintAllLocations(event.target.checked);
                      if (event.target.checked) setLocationId('');
                    }}
                  />
                  كل اللوكيشنات ({effectiveLocations.length})
                </label>
                {!printAllLocations ? (
                  <label className="block space-y-1 text-sm font-semibold">
                    <span>اختر اللوكيشن</span>
                    <SearchableSelect
                      options={locationOptions}
                      value={locationId}
                      onChange={setLocationId}
                      placeholder="ابحث بكود اللوكيشن…"
                    />
                  </label>
                ) : null}
              </div>
            )}

            <div className="space-y-2">
              <label className="block space-y-1 text-sm font-semibold">
                <span>مقاس الاستيكر الفعلي</span>
                <select
                  value={labelSizeId}
                  onChange={(event) => {
                    const next = event.target.value as BarcodeLabelSizeId;
                    setLabelSizeId(next);
                    const preset = resolveBarcodeLabelSize(next, labelCustomMm);
                    writeStoredLabelSize({
                      sizeId: next,
                      widthMm: preset.widthMm,
                      heightMm: preset.heightMm,
                      gapMm,
                    });
                  }}
                  className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                >
                  {BARCODE_LABEL_SIZE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.labelAr}
                    </option>
                  ))}
                </select>
              </label>
              {labelSizeId === 'custom' ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1 text-xs font-semibold">
                    <span>العرض مم</span>
                    <input
                      type="number"
                      min={15}
                      max={120}
                      value={customWidthMm}
                      onChange={(event) => {
                        const widthMm = clampThermalLabelMm(Number(event.target.value), 40);
                        setCustomWidthMm(widthMm);
                        writeStoredLabelSize({ sizeId: 'custom', widthMm, heightMm: customHeightMm, gapMm });
                      }}
                      className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">
                    <span>الارتفاع مم</span>
                    <input
                      type="number"
                      min={15}
                      max={120}
                      value={customHeightMm}
                      onChange={(event) => {
                        const heightMm = clampThermalLabelMm(Number(event.target.value), 30);
                        setCustomHeightMm(heightMm);
                        writeStoredLabelSize({ sizeId: 'custom', widthMm: customWidthMm, heightMm, gapMm });
                      }}
                      className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                </div>
              ) : null}
              {labelSize.thermal ? (
                <label className="block space-y-1 text-xs font-semibold">
                  <span>الفراغ بين الملصقات (مم)</span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.5}
                    value={gapMm}
                    onChange={(event) => {
                      const nextGap = clampThermalGapMm(Number(event.target.value));
                      setGapMm(nextGap);
                      writeStoredLabelSize({
                        sizeId: labelSizeId,
                        widthMm: labelSize.widthMm,
                        heightMm: labelSize.heightMm,
                        gapMm: nextGap,
                      });
                    }}
                    className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums"
                  />
                  <span className="block font-normal text-[var(--color-text-muted)]">
                    الرول فيه مسافة بين الاستيكر والتاني. لو النسخ بعد الأولى بتزحف، زوّد 1–2 مم. لو فيه ملصقات فاضية زيادة، قلّل أو خلّيه 0.
                  </span>
                </label>
              ) : null}
              {labelSize.thermal ? (
                <div className="space-y-1.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs leading-5 text-[var(--color-text)]">
                  <p className="font-bold">الطباعة من المتصفح — المقاس لازم يتطابق:</p>
                  <ol className="list-decimal space-y-1 pr-4 font-medium text-[var(--color-text-muted)]">
                    <li>هنا في النظام: {labelSize.widthMm}×{labelSize.heightMm} مم</li>
                    <li>
                      درايفر الطابعة → Page Setup → Stock:
                      {' '}
                      <span className="font-black text-[var(--color-text)]">{driverStock}</span>
                    </li>
                    <li>
                      في نافذة كروم اختَر
                      {' '}
                      <span className="font-black text-[var(--color-text)]">Print using system dialog</span>
                      {' '}
                      (Ctrl+Shift+P) عشان يستخدم Stock بتاع الطابعة مش مقياس Fit بتاع كروم
                    </li>
                  </ol>
                  <p className="font-semibold text-[rgb(var(--color-warning))]">
                    حوار كروم العادي بيكبّر الصفحة على مقاس الورق الافتراضي (زي 3×4 بوصة) ويتقطع الاستيكر. الموقع مش يقدر يفتح حوار الويندوز لوحده.
                  </p>
                </div>
              ) : (
                <p className="text-xs font-normal text-[var(--color-text-muted)]">للطباعة على طابعة عادية A4.</p>
              )}
            </div>

            <label className="block space-y-1 text-sm font-semibold">
              <span>عدد النسخ لكل ملصق</span>
              <input
                type="number"
                min={1}
                max={200}
                value={copies}
                onChange={(event) => setCopies(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
                className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums"
              />
              <span className="block text-xs font-normal text-[var(--color-text-muted)]">
                مثال: صنف واحد × 5 نسخ = 5 ملصقات متطابقة
              </span>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-bold text-[var(--color-text)]">ماذا يظهر على الملصق؟</p>
              <div className="space-y-1.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                {fieldDefs.map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={fieldState[field.key] !== false}
                      onChange={(event) => {
                        setFieldState((prev) => ({
                          ...prev,
                          [field.key]: event.target.checked,
                        }));
                      }}
                    />
                    <span>{field.labelAr}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                التحكم هنا للجلسة الحالية فقط. الإعدادات العامة تبقى من إعدادات الطباعة.
              </p>
            </div>
          </aside>

          <div className="min-h-0 overflow-auto p-3 sm:p-5" style={{ background: 'var(--color-bg)' }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">معاينة مباشرة</p>
              {activeCount > PREVIEW_CAP ? (
                <p className="text-xs font-semibold text-[rgb(var(--color-warning))]">
                  المعاينة تعرض أول {PREVIEW_CAP} من {activeCount} ملصق
                </p>
              ) : null}
            </div>

            {mode === 'items' ? (
              itemLabels.length === 0 ? (
                <div className="py-16 text-center text-sm font-bold text-[var(--color-text-muted)]">
                  اختر صنفاً لعرض المعاينة.
                </div>
              ) : (
                <div className="mx-auto w-fit origin-top scale-[0.72] sm:scale-[0.85]">
                  <ItemBarcodeLabelPrint
                    labels={previewItemLabels}
                    printSettings={effectiveItemSettings}
                    labelSizeId={labelSizeId}
                    labelCustomMm={labelCustomMm}
                    gapMm={gapMm}
                  />
                </div>
              )
            ) : locationLabels.length === 0 ? (
              <div className="py-16 text-center text-sm font-bold text-[var(--color-text-muted)]">
                اختر لوكيشن لعرض المعاينة.
              </div>
            ) : (
              <div className="mx-auto w-fit origin-top scale-[0.72] sm:scale-[0.85]">
                <LocationBarcodeLabelPrint
                  labels={previewLocationLabels}
                  printSettings={effectiveLocationSettings}
                  labelSizeId={labelSizeId}
                  labelCustomMm={labelCustomMm}
                  gapMm={gapMm}
                />
              </div>
            )}

            <div className="fixed -left-[10000px] top-0" aria-hidden>
              <ItemBarcodeLabelPrint
                ref={itemPrintRef}
                labels={itemLabels}
                printSettings={effectiveItemSettings}
                labelSizeId={labelSizeId}
                labelCustomMm={labelCustomMm}
                gapMm={gapMm}
              />
              <LocationBarcodeLabelPrint
                ref={locationPrintRef}
                labels={locationLabels}
                printSettings={effectiveLocationSettings}
                labelSizeId={labelSizeId}
                labelCustomMm={labelCustomMm}
                gapMm={gapMm}
              />
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--color-border)] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end"
          style={{ background: 'var(--color-bg)' }}
        >
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-full sm:w-auto"
            disabled={activeCount === 0}
            onClick={runPrint}
          >
            <Printer className="size-4" />
            طباعة {activeCount > 0 ? `(${activeCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
};
