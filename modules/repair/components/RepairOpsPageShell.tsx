/**
 * Backward-compatible aliases for the shared ModuleOpsPageShell.
 * Prefer importing from `@/modules/dashboards/components` for new pages.
 */
export {
  ModuleOpsPageShell as RepairOpsPageShell,
  type ModuleOpsHeroKpi as RepairOpsHeroKpi,
} from '@/modules/dashboards/components/ModuleOpsPageShell';

export { ModuleOpsPageShell as default } from '@/modules/dashboards/components/ModuleOpsPageShell';
