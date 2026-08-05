import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '../../../store/useAppStore';
import { useMaterialsWarehouseScope } from '../../inventory/hooks/useMaterialsWarehouseScope';
import { resolveWarehouseOperatorHomePath } from '../../inventory/lib/warehouseOperatorHome';
import { warehouseService } from '../../inventory/services/warehouseService';
import { WAREHOUSE_ROLE_LABELS } from '../../inventory/lib/stockLabels';
import type { Warehouse } from '../../inventory/types';

/**
 * Home shell for warehouse operators (مسؤول مخزن).
 * Redirects to the bound warehouse workspace, materials control, or inventory board.
 */
export const WarehouseManagerHome: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const {
    scoped,
    warehouseId,
    warehouseIds,
    isMaterialsWarehouseRole,
    filterWarehouses,
  } = useMaterialsWarehouseScope();

  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void warehouseService.getActiveWarehouses()
      .then((rows) => {
        if (!cancelled) setWarehouses(filterWarehouses(rows));
      })
      .catch((error: any) => {
        if (!cancelled) {
          setLoadError(error?.message || 'تعذر تحميل المخازن.');
          setWarehouses([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filterWarehouses]);

  const boundWarehouse = useMemo(() => {
    if (!warehouseId || !warehouses) return null;
    return warehouses.find((w) => w.id === warehouseId) || null;
  }, [warehouseId, warehouses]);

  const homePath = useMemo(
    () => resolveWarehouseOperatorHomePath({
      boundWarehouseId: warehouseId || null,
      boundWarehouseRole: boundWarehouse?.warehouseRole,
      isMaterialsWarehouseRole,
    }),
    [boundWarehouse?.warehouseRole, isMaterialsWarehouseRole, warehouseId],
  );

  // Fast path: known bound id → workspace immediately (no wait for full list).
  // Role may be unknown yet; after list loads, maintenance centers use repair path via homePath.
  if (warehouseId && warehouses && boundWarehouse) {
    return <Navigate to={withTenantPath(tenantSlug, homePath)} replace />;
  }
  if (warehouseId && warehouses === null) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }
  if (warehouseId && !boundWarehouse) {
    // Bound id exists but not in filtered list — still open inventory workspace.
    return <Navigate to={withTenantPath(tenantSlug, `/inventory/warehouses/${warehouseId}`)} replace />;
  }

  if (warehouses === null) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  // Materials role without explicit bind → supplies control board.
  if (isMaterialsWarehouseRole) {
    return <Navigate to={withTenantPath(tenantSlug, '/inventory/raw-materials/control')} replace />;
  }

  // Single scoped warehouse discovered from list.
  if (scoped && warehouseIds.length === 1 && warehouseIds[0]) {
    const only = warehouses.find((w) => w.id === warehouseIds[0]);
    const path = resolveWarehouseOperatorHomePath({
      boundWarehouseId: warehouseIds[0],
      boundWarehouseRole: only?.warehouseRole,
      isMaterialsWarehouseRole,
    });
    return (
      <Navigate
        to={withTenantPath(tenantSlug, path)}
        replace
      />
    );
  }

  if (!scoped) {
    return <Navigate to={withTenantPath(tenantSlug, '/inventory')} replace />;
  }

  // Scoped to multiple / none configured — show chooser.
  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={`مرحباً${userDisplayName ? `، ${userDisplayName}` : ''}`}
        subtitle="لوحة مسؤول المخزن — اختر مساحة المخزن للمتابعة."
      />
      {loadError ? (
        <p className="text-sm text-rose-700">{loadError}</p>
      ) : null}
      {warehouses.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          لا توجد مخازن في نطاقك. اطلب من الإدارة ربط حسابك بمخزن أو ضبط توجيه المستلزمات.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Link
              key={w.id}
              to={withTenantPath(
                tenantSlug,
                resolveWarehouseOperatorHomePath({
                  boundWarehouseId: w.id,
                  boundWarehouseRole: w.warehouseRole,
                }),
              )}
              className="rounded-xl border border-[var(--color-border)] p-4 hover:bg-[var(--color-surface-hover)]"
            >
              <div className="font-bold text-sm">{w.name}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {WAREHOUSE_ROLE_LABELS[w.warehouseRole || 'general']} · {w.code}
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--color-text-muted)]">
        المسار الافتراضي المحسوب: <span dir="ltr">{homePath}</span>
      </p>
    </div>
  );
};
