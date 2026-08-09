import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { withTenantPath } from '../../../../lib/tenantPaths';
import { usePermission } from '../../../../utils/permissions';
import { CurrentRoleCard } from '../../components/settings/CurrentRoleCard';
import { SystemStatusCards } from '../../components/settings/SystemStatusCards';
import { SETTINGS_SECTIONS } from '../../settings/settingsSections';

export const SettingsOverview: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { can } = usePermission();
  const isAdmin = can('roles.manage');
  const visibleSections = SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin);

  return (
    <ModuleOpsPageShell
      eyebrow="النظام"
      rangeLabel="مركز إعدادات النظام، الهوية، الإنتاج، التقارير، وأدوات الإدارة"
    >
      <OpsDashPanel title="أقسام الإعدادات" accent="quality">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleSections.map((section) => (
            <Link key={section.key} to={withTenantPath(tenantSlug, section.path)} className="block h-full">
              <div className="h-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-icons-round">{section.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-[var(--color-text)]">{section.label}</h3>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1 leading-6">{section.subtitle}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </OpsDashPanel>

      <SystemStatusCards />
      <CurrentRoleCard />
    </ModuleOpsPageShell>
  );
};
