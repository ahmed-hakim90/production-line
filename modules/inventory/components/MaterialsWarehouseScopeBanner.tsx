import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';

type Props = {
  scoped: boolean;
  routingConfigured: boolean;
  settingsPath?: string;
};

/** Empty-state when materials_warehouse role has no decomposed/raw routing IDs. */
export const MaterialsWarehouseScopeBanner: React.FC<Props> = ({
  scoped,
  routingConfigured,
  settingsPath = '/settings/production',
}) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  if (!scoped || routingConfigured) return null;

  return (
    <div className="rounded-lg border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-4 py-3 text-sm font-medium text-[rgb(var(--color-warning))]">
      حدّد مخزن المستلزمات من توجيه المخازن (المفكك و/أو المواد الخام) قبل العمل على هذه الشاشة.{' '}
      <Link
        to={withTenantPath(tenantSlug, settingsPath)}
        className="font-bold text-[rgb(var(--color-primary))] underline underline-offset-2"
      >
        فتح الإعدادات
      </Link>
    </div>
  );
};
