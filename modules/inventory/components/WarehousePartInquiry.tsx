import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { withTenantPath } from '@/lib/tenantPaths';
import { Button } from './UI';
import {
  resolveWarehouseScanLookup,
  type WarehouseScanCatalogItem,
  type WarehouseScanItemHit,
  type WarehouseScanLocationHit,
} from '../lib/warehouseScanLookup';
import type { BarcodeLabelEngineMode } from '../lib/barcodeLabelEngine';
import type { StockItemBalance, StockLocationBalance, WarehouseLocation } from '../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

export type WarehouseLabelEngineSeed = {
  mode: BarcodeLabelEngineMode;
  itemId?: string;
  locationId?: string;
  locationIds?: string[];
  copies?: number;
};

type Props = {
  warehouseId: string;
  warehouseName?: string;
  balances: StockItemBalance[];
  locationBalances: StockLocationBalance[];
  locations: WarehouseLocation[];
  catalogItems?: WarehouseScanCatalogItem[];
  onOpenLabelEngine?: (seed: WarehouseLabelEngineSeed) => void;
  loading?: boolean;
};

export function WarehousePartInquiry({
  warehouseId,
  balances,
  locationBalances,
  locations,
  catalogItems = [],
  onOpenLabelEngine,
  loading = false,
}: Props) {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [query, setQuery] = useState('');
  const [exactToken, setExactToken] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerHostId = useRef(`warehouse-scan-${Math.random().toString(36).slice(2, 9)}`).current;
  const inputRef = useRef<HTMLInputElement>(null);
  const gunBufferRef = useRef('');
  const gunTimerRef = useRef<number | null>(null);

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

  const commitExact = useCallback((raw: string, announce = false) => {
    const value = String(raw || '').trim();
    setQuery(value);
    setExactToken(value || null);
    if (!announce || !value) return;
    const lookup = resolveWarehouseScanLookup({
      query: value,
      exact: true,
      balances,
      locationBalances,
      locations,
      catalogItems,
    });
    if (lookup.status === 'not_found') {
      toast.error(`تم قراءة «${value}» — غير موجود في هذا المخزن.`);
      return;
    }
    toast.success(`تم قراءة «${value}».`);
  }, [balances, catalogItems, locationBalances, locations]);

  useEffect(() => {
    if (!cameraOpen) {
      inputRef.current?.focus();
      return;
    }
    let cancelled = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    void import('html5-qrcode').then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (cancelled) return;
      try {
        const instance = new Html5Qrcode(scannerHostId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
          ],
          useBarCodeDetectorIfSupported: true,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scanner = instance;
        const config = {
          fps: 12,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
            width: Math.max(160, Math.floor(viewfinderWidth * 0.88)),
            height: Math.max(72, Math.floor(viewfinderHeight * 0.42)),
          }),
        };
        const onDecoded = (decoded: string) => {
          if (cancelled) return;
          commitExact(decoded, true);
          setCameraOpen(false);
        };
        try {
          await instance.start({ facingMode: 'environment' }, config, onDecoded, () => undefined);
        } catch {
          await instance.start({ facingMode: 'user' }, config, onDecoded, () => undefined);
        }
        if (!cancelled) setCameraError(null);
      } catch {
        if (!cancelled) setCameraError('تعذر فتح الكاميرا. استخدم مسدس الباركود أو اكتب الكود يدوياً.');
      }
    });

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.stop().then(() => scanner?.clear()).catch(() => undefined);
      }
    };
  }, [cameraOpen, commitExact, scannerHostId]);

  useEffect(() => {
    const flushGun = () => {
      const code = gunBufferRef.current.trim();
      gunBufferRef.current = '';
      if (code.length < 2) return;
      commitExact(code, true);
      setCameraOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toUpperCase();
      const inOtherField =
        (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable))
        && target !== inputRef.current;
      if (inOtherField) return;

      if (event.key === 'Enter') {
        if (gunBufferRef.current.trim()) {
          event.preventDefault();
          flushGun();
        }
        return;
      }
      if (event.key.length !== 1) return;
      if (target === inputRef.current) return;
      gunBufferRef.current += event.key;
      if (gunTimerRef.current) window.clearTimeout(gunTimerRef.current);
      gunTimerRef.current = window.setTimeout(flushGun, 80);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (gunTimerRef.current) window.clearTimeout(gunTimerRef.current);
    };
  }, [commitExact]);

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
          {onOpenLabelEngine ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onOpenLabelEngine({ mode: 'items', itemId: hit.itemId, copies: 1 })}
            >
              طباعة ملصق باركود
            </Button>
          ) : null}
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
        {onOpenLabelEngine ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onOpenLabelEngine({ mode: 'locations', locationId: hit.locationId, copies: 1 })}
          >
            طباعة ملصق اللوكيشن
          </Button>
        ) : null}
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
    <OpsDashPanel
      title="استعلام قطعة / لوكيشن — بحث أو مسح"
      accent="inventory"
      loading={loading}
      loadingLabel="جاري تحميل أرصدة المخزن…"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
          مسدس الباركود: اضغط الخانة ثم امسح. الكاميرا تقرأ QR أوضح من الباركود الخطي الصغير.
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={query}
            onChange={(event) => {
              setExactToken(null);
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitExact(query, true);
              }
            }}
            placeholder={loading ? 'جاري تحميل أرصدة المخزن…' : 'امسح الباركود أو اكتب الكود / الاسم'}
            className="min-w-[16rem] flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            autoComplete="off"
            autoFocus
            disabled={loading}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
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
            <p className="text-xs text-[var(--color-text-muted)]">
              قرّب QR من الكاميرا وثبّت الصورة. الفوكس وهو بيتحرك على ملصق صغير طبيعي. الباركود الخطي أنسبه للمسدس.
            </p>
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
    </OpsDashPanel>
  );
}
