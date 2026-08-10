import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { formatNumber } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { toast } from 'sonner';
import { catalogProductService } from '../services/catalogProductService';
import { categoryService, isProductCategoryRow } from '../services/categoryService';
import { loadProductIdsWithBomCoverage } from '../services/catalogDashboardService';
import {
  computeCatalogDashboardMetrics,
  type CatalogDashboardMetrics,
} from '../lib/catalogDashboardMetrics';
import { catalogMaterialsPath, catalogProductsPath } from '../lib/catalogDrilldown';

const CHART_TICK = { fontSize: 11, fill: 'var(--color-text-muted)' } as const;
const GRID_STROKE = 'var(--color-border)';

const EMPTY_METRICS = computeCatalogDashboardMetrics({});

function HeroLink({
  to,
  children,
  enabled,
}: {
  to: string;
  children: React.ReactNode;
  enabled: boolean;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Link to={to} className="hover:underline">
      {children}
    </Link>
  );
}

export const CatalogDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canProducts = can('products.view');
  const canCategories = can('catalog.categories.view');
  const canMaterials = can('materials.view');
  const canMaterialCategories = can('materials.manage');
  const canCreateProduct = can('products.create');
  const canCreateMaterial = can('materials.manage');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<CatalogDashboardMetrics>(EMPTY_METRICS);

  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    try {
      const [productsSettled, categoriesSettled, materialsSettled, materialCatsSettled, bomSettled] =
        await Promise.allSettled([
          canProducts ? catalogProductService.getAll() : Promise.resolve([]),
          canCategories || canProducts
            ? categoryService.getAll().then((rows) => rows.filter(isProductCategoryRow))
            : Promise.resolve([]),
          canMaterials
            ? import('../../manufacturing/services/materialService').then(({ materialService }) =>
                materialService.getAll(),
              )
            : Promise.resolve([]),
          canMaterials || canMaterialCategories
            ? import('../../manufacturing/services/materialCategoryService').then(
                ({ materialCategoryService }) => materialCategoryService.getAll(),
              )
            : Promise.resolve([]),
          canProducts ? loadProductIdsWithBomCoverage() : Promise.resolve(new Set<string>()),
        ]);

      const products = productsSettled.status === 'fulfilled' ? productsSettled.value : [];
      const productCategories =
        categoriesSettled.status === 'fulfilled' ? categoriesSettled.value : [];
      const materials = materialsSettled.status === 'fulfilled' ? materialsSettled.value : [];
      const materialCategories =
        materialCatsSettled.status === 'fulfilled' ? materialCatsSettled.value : [];
      const productIdsWithBom =
        bomSettled.status === 'fulfilled' ? bomSettled.value : new Set<string>();

      const failed = [
        productsSettled,
        categoriesSettled,
        materialsSettled,
        materialCatsSettled,
        bomSettled,
      ].some((r) => r.status === 'rejected');
      if (failed) {
        toast.error('تعذر تحميل بعض مؤشرات الكتالوج.');
      }

      setMetrics(
        computeCatalogDashboardMetrics({
          products,
          productCategories,
          materials,
          materialCategories,
          productIdsWithBom,
        }),
      );
    } catch {
      toast.error('تعذر تحميل لوحة الكتالوج.');
      setMetrics(EMPTY_METRICS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canProducts, canCategories, canMaterials, canMaterialCategories]);

  useEffect(() => {
    void load();
  }, [load]);

  const hero = useMemo(
    () => [
      {
        key: 'products',
        label: 'المنتجات',
        value: loading ? (
          '…'
        ) : (
          <HeroLink to={tenantPath(catalogProductsPath())} enabled={canProducts}>
            {formatNumber(metrics.productTotal)}
          </HeroLink>
        ),
        meta: canProducts
          ? `تصنيع ${formatNumber(metrics.manufacturedCount)} · قطع ${formatNumber(metrics.spareOnlyCount)}`
          : undefined,
        accent: true as const,
      },
      {
        key: 'categories',
        label: 'فئات المنتجات',
        value: loading ? (
          '…'
        ) : (
          <HeroLink to={tenantPath('/catalog/categories')} enabled={canCategories}>
            {formatNumber(metrics.productCategoryActive)}
          </HeroLink>
        ),
        meta: `إجمالي ${formatNumber(metrics.productCategoryTotal)}`,
      },
      {
        key: 'materials',
        label: 'المواد التصنيعية',
        value: loading ? (
          '…'
        ) : (
          <HeroLink to={tenantPath(catalogMaterialsPath())} enabled={canMaterials}>
            {formatNumber(metrics.materialActive)}
          </HeroLink>
        ),
        meta: canMaterials
          ? `إجمالي ${formatNumber(metrics.materialTotal)} · للصيانة ${formatNumber(metrics.materialsSpareEligible)}`
          : undefined,
      },
      {
        key: 'bom',
        label: 'منتجات بلا BOM',
        value: loading ? (
          '…'
        ) : (
          <HeroLink
            to={tenantPath(catalogProductsPath({ manufactured: 'yes', gap: 'no_bom' }))}
            enabled={canProducts}
          >
            {formatNumber(metrics.manufacturedWithoutBom)}
          </HeroLink>
        ),
        meta: canProducts
          ? `بمكونات ${formatNumber(metrics.manufacturedWithBom)}`
          : undefined,
        toneClassName:
          !loading && metrics.manufacturedWithoutBom > 0
            ? 'ops-dash-kpi-card--tone-rose'
            : undefined,
      },
      {
        key: 'gaps',
        label: 'فجوات الماستر',
        value: loading ? (
          '…'
        ) : (
          <HeroLink
            to={tenantPath(catalogProductsPath({ gap: 'no_category' }))}
            enabled={canProducts}
          >
            {formatNumber(
              metrics.productsWithoutCategory +
                metrics.materialsWithoutCategory +
                metrics.materialsWithoutCost,
            )}
          </HeroLink>
        ),
        meta: canProducts
          ? `منتجات بلا فئة ${formatNumber(metrics.productsWithoutCategory)}`
          : undefined,
      },
    ],
    [loading, metrics, canProducts, canMaterials, canCategories, tenantPath],
  );

  const categoryBars = useMemo(
    () =>
      metrics.topProductCategories.map((row) => ({
        name: row.name.length > 14 ? `${row.name.slice(0, 14)}…` : row.name,
        value: row.count,
        drillKey: row.key,
      })),
    [metrics.topProductCategories],
  );

  const materialBars = useMemo(
    () =>
      metrics.materialTypeBars.map((row) => ({
        name: row.name,
        value: row.count,
        drillKey: row.key,
      })),
    [metrics.materialTypeBars],
  );

  if (loading && metrics.productTotal === 0 && metrics.materialTotal === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={5} />;
  }

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة الكتالوج"
      hero={hero}
      onRefresh={() => {
        void load({ soft: true });
      }}
      refreshing={loading || refreshing}
      secondarySummary="اختصارات الكتالوج"
      secondary={(
        <div className="flex flex-wrap gap-2">
          {canProducts && (
            <Link to={tenantPath(catalogProductsPath())}>
              <PrimaryButton iconName="inventory_2" tone="execute">المنتجات</PrimaryButton>
            </Link>
          )}
          {canCreateProduct && (
            <Link to={tenantPath(catalogProductsPath({ action: 'create' }))}>
              <GhostButton iconName="add" tone="edit">منتج جديد</GhostButton>
            </Link>
          )}
          {canCategories && (
            <Link to={tenantPath('/catalog/categories')}>
              <GhostButton iconName="category" tone="view">فئات المنتجات</GhostButton>
            </Link>
          )}
          {canMaterials && (
            <Link to={tenantPath(catalogMaterialsPath())}>
              <GhostButton iconName="precision_manufacturing" tone="share">المواد التصنيعية</GhostButton>
            </Link>
          )}
          {canCreateMaterial && (
            <Link to={tenantPath(catalogMaterialsPath({ action: 'create' }))}>
              <GhostButton iconName="add_circle" tone="edit">مادة جديدة</GhostButton>
            </Link>
          )}
          {canMaterialCategories && (
            <Link to={tenantPath('/manufacturing/material-categories')}>
              <GhostButton iconName="account_tree" tone="print">فئات المواد</GhostButton>
            </Link>
          )}
          {can('planning.materialRequirements.view') && (
            <Link to={tenantPath('/manufacturing/planning-run')}>
              <GhostButton iconName="schema" tone="export">تشغيل تخطيط المواد</GhostButton>
            </Link>
          )}
        </div>
      )}
      dir="rtl"
    >
      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        {canProducts ? (
          <Link to={tenantPath(catalogProductsPath({ gap: 'no_barcode' }))} className="ops-module-charts__qty hover:opacity-90">
            <p className="ops-module-charts__qty-label">منتجات بلا باركود</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.productsWithoutBarcode)}</p>
          </Link>
        ) : (
          <div className="ops-module-charts__qty">
            <p className="ops-module-charts__qty-label">منتجات بلا باركود</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.productsWithoutBarcode)}</p>
          </div>
        )}
        {canProducts ? (
          <Link to={tenantPath(catalogProductsPath({ gap: 'no_price' }))} className="ops-module-charts__qty hover:opacity-90">
            <p className="ops-module-charts__qty-label">منتجات بلا سعر بيع</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.productsWithoutPrice)}</p>
          </Link>
        ) : (
          <div className="ops-module-charts__qty">
            <p className="ops-module-charts__qty-label">منتجات بلا سعر بيع</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.productsWithoutPrice)}</p>
          </div>
        )}
        {canMaterials ? (
          <Link to={tenantPath(catalogMaterialsPath({ gap: 'no_category' }))} className="ops-module-charts__qty hover:opacity-90">
            <p className="ops-module-charts__qty-label">مواد بلا فئة</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.materialsWithoutCategory)}</p>
          </Link>
        ) : (
          <div className="ops-module-charts__qty">
            <p className="ops-module-charts__qty-label">مواد بلا فئة</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.materialsWithoutCategory)}</p>
          </div>
        )}
        {canMaterials ? (
          <Link to={tenantPath(catalogMaterialsPath({ gap: 'no_cost' }))} className="ops-module-charts__qty hover:opacity-90">
            <p className="ops-module-charts__qty-label">مواد بلا تكلفة شراء</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.materialsWithoutCost)}</p>
          </Link>
        ) : (
          <div className="ops-module-charts__qty">
            <p className="ops-module-charts__qty-label">مواد بلا تكلفة شراء</p>
            <p className="ops-module-charts__qty-value">{formatNumber(metrics.materialsWithoutCost)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsDashPanel title="توزيع المنتجات حسب الفئة" accent="plans">
          <div className="ops-module-charts__chart" dir="ltr">
            {categoryBars.length === 0 ? (
              <p className="ops-module-charts__hint px-2 pt-4 text-right" dir="rtl">
                لا توجد منتجات لعرض التوزيع.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBars} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={CHART_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={96} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Bar
                    dataKey="value"
                    name="العدد"
                    fill="var(--chart-5)"
                    radius={[0, 8, 8, 0]}
                    barSize={12}
                    cursor={canProducts ? 'pointer' : 'default'}
                    onClick={(data) => {
                      if (!canProducts) return;
                      const payload = data?.payload as { drillKey?: string } | undefined;
                      const key = String(payload?.drillKey || '').trim();
                      if (!key) return;
                      if (key === '__none__') {
                        navigate(tenantPath(catalogProductsPath({ gap: 'no_category' })));
                        return;
                      }
                      navigate(tenantPath(catalogProductsPath({ category: key })));
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </OpsDashPanel>

        <OpsDashPanel title="أنواع المواد التصنيعية" accent="inventory">
          <div className="ops-module-charts__chart" dir="ltr">
            {!canMaterials ? (
              <p className="ops-module-charts__hint px-2 pt-4 text-right" dir="rtl">
                تحتاج صلاحية عرض المواد لرؤية هذا المؤشر.
              </p>
            ) : materialBars.length === 0 ? (
              <p className="ops-module-charts__hint px-2 pt-4 text-right" dir="rtl">
                لا توجد مواد تصنيعية مسجّلة.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={materialBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={CHART_TICK} width={32} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Bar
                    dataKey="value"
                    name="العدد"
                    fill="var(--chart-7)"
                    radius={[8, 8, 0, 0]}
                    barSize={20}
                    cursor={canMaterials ? 'pointer' : 'default'}
                    onClick={(data) => {
                      if (!canMaterials) return;
                      const payload = data?.payload as { drillKey?: string } | undefined;
                      const type = String(payload?.drillKey || '').trim();
                      if (!type) return;
                      navigate(tenantPath(catalogMaterialsPath({ type })));
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </OpsDashPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsDashPanel title="جاهزية المنتجات">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">تصنيع داخلي</span>
              {canProducts ? (
                <Link to={tenantPath(catalogProductsPath({ manufactured: 'yes' }))} className="font-bold tabular-nums text-primary hover:underline">
                  {formatNumber(metrics.manufacturedCount)}
                </Link>
              ) : (
                <strong className="tabular-nums">{formatNumber(metrics.manufacturedCount)}</strong>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">قطع صيانة فقط</span>
              {canProducts ? (
                <Link to={tenantPath(catalogProductsPath({ manufactured: 'no' }))} className="font-bold tabular-nums text-primary hover:underline">
                  {formatNumber(metrics.spareOnlyCount)}
                </Link>
              ) : (
                <strong className="tabular-nums">{formatNumber(metrics.spareOnlyCount)}</strong>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">بمكونات / BOM</span>
              <strong className="tabular-nums">{formatNumber(metrics.manufacturedWithBom)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">تصنيع بلا BOM</span>
              {canProducts ? (
                <Link
                  to={tenantPath(catalogProductsPath({ manufactured: 'yes', gap: 'no_bom' }))}
                  className="font-bold tabular-nums text-[rgb(var(--color-warning))] hover:underline"
                >
                  {formatNumber(metrics.manufacturedWithoutBom)}
                </Link>
              ) : (
                <strong className="tabular-nums text-[rgb(var(--color-warning))]">
                  {formatNumber(metrics.manufacturedWithoutBom)}
                </strong>
              )}
            </div>
            {canProducts && metrics.manufacturedWithoutBom > 0 ? (
              <Link
                to={tenantPath(catalogProductsPath({ manufactured: 'yes', gap: 'no_bom' }))}
                className="inline-flex text-sm font-medium text-primary hover:underline"
              >
                فتح المنتجات لاستكمال المكونات
              </Link>
            ) : null}
          </div>
        </OpsDashPanel>

        <OpsDashPanel title="جاهزية المواد والفئات">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">فئات منتجات نشطة</span>
              <strong className="tabular-nums">{formatNumber(metrics.productCategoryActive)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">فئات مواد نشطة</span>
              <strong className="tabular-nums">{formatNumber(metrics.materialCategoryActive)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">مواد بلا فئة</span>
              {canMaterials ? (
                <Link to={tenantPath(catalogMaterialsPath({ gap: 'no_category' }))} className="font-bold tabular-nums text-primary hover:underline">
                  {formatNumber(metrics.materialsWithoutCategory)}
                </Link>
              ) : (
                <strong className="tabular-nums">{formatNumber(metrics.materialsWithoutCategory)}</strong>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">مواد بلا تكلفة شراء</span>
              {canMaterials ? (
                <Link to={tenantPath(catalogMaterialsPath({ gap: 'no_cost' }))} className="font-bold tabular-nums text-primary hover:underline">
                  {formatNumber(metrics.materialsWithoutCost)}
                </Link>
              ) : (
                <strong className="tabular-nums">{formatNumber(metrics.materialsWithoutCost)}</strong>
              )}
            </div>
            {canMaterials ? (
              <Link
                to={tenantPath(catalogMaterialsPath())}
                className="inline-flex text-sm font-medium text-primary hover:underline"
              >
                فتح المواد التصنيعية
              </Link>
            ) : null}
          </div>
        </OpsDashPanel>
      </div>
    </DomainHomeShell>
  );
};
