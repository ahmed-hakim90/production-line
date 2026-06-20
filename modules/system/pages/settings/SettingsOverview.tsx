import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../../components/PageHeader';
import { withTenantPath } from '../../../../lib/tenantPaths';
import { usePermission } from '../../../../utils/permissions';
import { Card } from '../../components/UI';
import { CurrentRoleCard } from '../../components/settings/CurrentRoleCard';
import { SystemStatusCards } from '../../components/settings/SystemStatusCards';
import { SETTINGS_SECTIONS } from '../../settings/settingsSections';

export const SettingsOverview: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { can } = usePermission();
  const isAdmin = can('roles.manage');
  const visibleSections = SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin);

  return (
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title="الإعدادات"
        subtitle="مركز إعدادات النظام، الهوية، الإنتاج، التقارير، وأدوات الإدارة."
        backAction={false}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleSections.map((section) => (
          <Link key={section.key} to={withTenantPath(tenantSlug, section.path)} className="block h-full">
            <Card className="h-full bg-[var(--color-card)] border-[var(--color-border)] rounded-xl shadow-none hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="material-icons-round">{section.icon}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--color-text)]">{section.label}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1 leading-6">{section.subtitle}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <SystemStatusCards />
      <CurrentRoleCard />
    </div>
  );
};
