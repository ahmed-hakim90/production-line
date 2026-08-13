import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '../../../utils/printManager';
import { Button } from './UI';
import { ItemBarcodeLabelPrint, type ItemBarcodeLabel } from './ItemBarcodeLabelPrint';
import { LocationBarcodeLabelPrint, type LocationBarcodeLabel } from './LocationBarcodeLabelPrint';
import {
  resolveItemLabelCode,
  resolveWarehouseScanLookup,
  type WarehouseScanCatalogItem,
  type WarehouseScanItemHit,
  type WarehouseScanLocationHit,
} from '../lib/warehouseScanLookup';
import type { StockItemBalance, StockLocationBalance, WarehouseLocation } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

type Props = {
  warehouseId: string;
  warehouseName?: string;
  balances: StockItemBalance[];
  locationBalances: StockLocationBalance[];
  locations: WarehouseLocation[];
  catalogItems?: WarehouseScanCatalogItem[];
};

export function WarehousePartInquiry({
  warehouseId,
  warehouseName,
  balances,
  locationBalances,
  locations,
  catalogItems = [],
}: Props) {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const printSettings = useAppStore((s) => s.systemSettings?.printTemplate);
  const [query, setQuery] = useState('');
  const [exactToken, setExactToken] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [itemLabels, setItemLabels] = useState<ItemBarcodeLabel[]>([]);
  const [locationLabels, setLocationLabels] = useState<LocationBarcodeLabel[]>([]);
  const scannerHostId = useRef(`warehouse-scan-${Math.random().toString(36).slice(2, 9)}`).current;
  const itemPrintRef = useRef<HTMLDivElement>(null);
  const locationPrintRef = useRef<HTMLDivElement>(null);

  const handleItemPrint = useManagedPrint({
    contentRef: itemPrintRef,
    printSettings,
    documentTitle: 'ملصق باركود صنف',
  });
  const handleLocationPrint = useManagedPrint({
    contentRef: locationPrintRef,
    printSettings,
    documentTitle: 'ملصق باركود لوكيشن',
  });

  const debounced = useDebouncedValue(query.trim(), 250);

  const result = useMemo(() => {
    const exact = exactToken != null && exactToken === query.trim();
    return resolveWarehouseScanLookup({
      query: exact ? exactToken : debounced,
      exact,
      balances,
      locationBalances,
      locations,
      catalogItems,
    });
  }, [balances, catalogItems, debounced, exactToken, locationBalances, locations, query]);

  const commitExact = useCallback((raw: string) => {
    const value = String(raw || '').trim();
    setQuery(value);
    setExactToken(value || null);
  }, []);

  const printItemHit = useCallback(
    (hit: WarehouseScanItemHit) => {
      const barcodeValue = resolveItemLabelCode(hit);
      if (!barcodeValue) return;
      setItemLabels([
        {
          itemCode: hit.itemCode,
          itemName: hit.itemName,
          barcodeValue,
          warehouseName,
        },
      ]);
      window.setTimeout(() => handleItemPrint(), 50);
    },
    [handleItemPrint, warehouseName],
  );

  const printLocationHit = useCallback(
    (hit: WarehouseScanLocationHit) => {
      if (!hit.locationCode) return;
      setLocationLabels([
        {
          locationCode: hit.locationCode,
          rackName: hit.rackName,
          shelf: hit.shelf,
          warehouseName,
        },
      ]);
      window.setTimeout(() => handleLocationPrint(), 50);
    },
    [handleLocationPrint, warehouseName],
  );

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    void import('html5-qrcode').then(async ({ Html5Qrcode }) => {
      if (cancelled) return;
      try {
        const instance = new Html5Qrcode(scannerHostId);
        scanner = instance;
        await instance.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            commitExact(decoded);
            setCameraOpen(false);
          },
          () => undefined,
        );
        setCameraError(null);
      } catch {
        if (!cancelled) setCameraError('تعذر فتح الكاميرا. استخدم المسدس أو اكتب الكود يدوياً.');
      }
    });

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.stop().then(() => scanner?.clear()).catch(() => undefined);
      }
    };
  }, [cameraOpen, commitExact, scannerHostId]);

  const itemCardPath = (hit: WarehouseScanItemHit) =>
    withTenantPath(
      tenantSlug,
      `/inventory/item-card?itemType=${encodeURIComponent(hit.itemType)}&itemId=${encodeURIComponent(hit.itemId)}&warehouseId=${encodeURIComponent(warehouseId)}`,
    );

  const renderItemHit = (hit: WarehouseScanItemHit, key: string) => {
    const qty = Number(hit.quantity || 0);
    return (
      <div key={key} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold text-[var(--color-text)]">{hit.itemName}</p>
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {hit.itemCode || '—'}
              {hit.barcode ? ` · باركود ${hit.barcode}` : ''}
            </p>
          </div>
          <div className="text-end">
            <p className="text-lg font-black tabular-nums">{fmt(qty)}</p>
            {hit.catalogOnly ? (
              <p className="text-xs font-bold text-[rgb(var(--color-warning))]">في الماستر بدون رصيد</p>
            ) : qty > 0 ? (
              <p className="text-xs font-bold text-[rgb(var(--color-success))]">موجودة</p>
            ) : (
              <p className="text-xs font-bold text-[rgb(var(--color-warning))]">الرصيد صفر</p>
            )}
          </div>
        </div>

        {hit.locations.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="py-1 text-start">اللوكيشن</th>
                <th className="py-1 text-start">الراك</th>
                <th className="py-1 text-start">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {hit.locations.map((loc) => (
                <tr key={`${loc.locationId}-${loc.locationCode}`} className="border-t border-[var(--color-border)]/40">
                  <td className="py-1 font-mono">{loc.locationCode || '—'}</td>
                  <td className="py-1">{loc.rackName || '—'}</td>
                  <td className="py-1 tabular-nums">{fmt(loc.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">لا يوجد تفصيل مواقع لهذه القطعة في هذا المخزن.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Link className="text-xs font-bold text-primary underline" to={itemCardPath(hit)}>
            كارت الصنف
          </Link>
          <Button type="button" size="sm" variant="secondary" onClick={() => printItemHit(hit)}>
            طباعة ملصق باركود
          </Button>
        </div>
      </div>
    );
  };

  const renderLocationHit = (hit: WarehouseScanLocationHit) => (
    <div className="mt-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-[var(--color-text)]">لوكيشن {hit.locationCode}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {[hit.rackName, hit.shelf].filter(Boolean).join(' · ') || '—'}
            {hit.isActive ? '' : ' · موقوف'}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => printLocationHit(hit)}>
          طباعة ملصق اللوكيشن
        </Button>
      </div>
      {hit.contents.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">لا توجد بضاعة في هذا اللوكيشن.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)]">
              <th className="py-1 text-start">الصنف</th>
              <th className="py-1 text-start">الكود</th>
              <th className="py-1 text-start">الكمية</th>
            </tr>
          </thead>
          <tbody>
            {hit.contents.map((row) => (
              <tr key={`${row.itemType}-${row.itemId}`} className="border-t border-[var(--color-border)]/40">
                <td className="py-1.5 font-semibold">{row.itemName}</td>
                <td className="py-1.5 font-mono text-xs">{row.itemCode || '—'}</td>
                <td className="py-1.5 tabular-nums">{fmt(row.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <OpsDashPanel title="استعلام قطعة / لوكيشن — بحث أو مسح" accent="inventory">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
          امسح باركود القطعة أو اللوكيشن — أو ابحث بالاسم/الكود
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setExactToken(null);
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitExact(query);
              }
            }}
            placeholder="مثال: SP-2477 أو CENTRAL-A1-1"
            className="min-w-[16rem] flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setCameraError(null);
              setCameraOpen((open) => !open);
            }}
          >
            {cameraOpen ? 'إغلاق الكاميرا' : 'كاميرا'}
          </Button>
        </div>
      </label>

      {cameraOpen ? (
        <div className="mt-3 space-y-2">
          <div id={scannerHostId} className="min-h-56 overflow-hidden rounded-[var(--border-radius-lg)] border border-[var(--color-border)]" />
          {cameraError ? (
            <p className="text-sm font-semibold text-[rgb(var(--color-danger))]">{cameraError}</p>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">وجّه الكاميرا لباركود القطعة أو اللوكيشن.</p>
          )}
        </div>
      ) : null}

      {result.status === 'empty' && query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">اكتب حرفين على الأقل أو امسح الباركود ثم Enter.</p>
      ) : null}

      {result.status === 'not_found' ? (
        <p className="mt-3 text-sm font-semibold text-[rgb(var(--color-danger))]">
          غير موجودة في هذا المخزن بهذا الكود أو الاسم.
        </p>
      ) : null}

      {result.status === 'location' ? renderLocationHit(result.hit) : null}

      {result.status === 'item' ? (
        <div className="mt-3 space-y-2">{renderItemHit(result.hit, `${result.hit.itemType}-${result.hit.itemId}`)}</div>
      ) : null}

      {result.status === 'matches' ? (
        <div className="mt-3 space-y-2">
          {result.items.map((hit) => renderItemHit(hit, `${hit.itemType}-${hit.itemId}`))}
        </div>
      ) : null}

      {result.status === 'catalog_only' ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-[rgb(var(--color-warning))]">
            القطعة في الماستر لكن بدون رصيد في هذا المخزن:
          </p>
          {result.items.map((hit) => renderItemHit(hit, `cat-${hit.itemId}`))}
        </div>
      ) : null}

      <div className="hidden">
        <ItemBarcodeLabelPrint ref={itemPrintRef} labels={itemLabels} printSettings={printSettings} />
        <LocationBarcodeLabelPrint ref={locationPrintRef} labels={locationLabels} printSettings={printSettings} />
      </div>
    </OpsDashPanel>
  );
}
