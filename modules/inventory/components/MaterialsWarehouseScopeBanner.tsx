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
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
      حدّد مخزن المستلزمات من توجيه المخازن (المفكك و/أو المواد الخام) قبل العمل على هذه الشاشة.{' '}
      <Link
        to={withTenantPath(tenantSlug, settingsPath)}
        className="font-bold text-indigo-700 underline underline-offset-2"
      >
        فتح الإعدادات
      </Link>
    </div>
  );
};
