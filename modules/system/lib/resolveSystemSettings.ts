import type {
  AttendanceIntegrationSettings,
  OperationPathSettings,
  PlanSettings,
  ProductionWorkerSettings,
  RepairSettings,
  SystemSettings,
} from '../../../types';
import {
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_SYSTEM_SETTINGS,
} from '../../../utils/dashboardConfig';
import { resolveOperationPathSettings } from './operationPathSettings';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Shallow-merge one nested settings object onto defaults (ignores null/non-objects). */
function mergeObjectLayer<T extends Record<string, unknown>>(
  defaults: T,
  patch: unknown,
): T {
  if (!isPlainObject(patch)) return { ...defaults };
  return { ...defaults, ...patch } as T;
}

export function resolvePlanSettings(
  input: Partial<PlanSettings> | null | undefined,
): PlanSettings {
  const raw = isPlainObject(input) ? (input as Partial<PlanSettings>) : {};
  return {
    ...DEFAULT_PLAN_SETTINGS,
    ...raw,
    inventoryRouting: mergeObjectLayer(
      DEFAULT_PLAN_SETTINGS.inventoryRouting as Record<string, unknown>,
      raw.inventoryRouting,
    ) as PlanSettings['inventoryRouting'],
    reportBehavior: mergeObjectLayer(
      (DEFAULT_PLAN_SETTINGS.reportBehavior ?? {}) as Record<string, unknown>,
      raw.reportBehavior,
    ) as PlanSettings['reportBehavior'],
  };
}

function resolveAttendanceIntegration(
  input: Partial<AttendanceIntegrationSettings> | null | undefined,
): AttendanceIntegrationSettings {
  const defaults = DEFAULT_SYSTEM_SETTINGS.attendanceIntegration!;
  return mergeObjectLayer(
    defaults as unknown as Record<string, unknown>,
    input,
  ) as unknown as AttendanceIntegrationSettings;
}

function resolveRepairSettings(
  input: Partial<RepairSettings> | null | undefined,
): RepairSettings {
  const defaults = DEFAULT_SYSTEM_SETTINGS.repairSettings ?? {};
  const raw = isPlainObject(input) ? (input as Partial<RepairSettings>) : {};
  const defaultTreasury = defaults.treasury ?? {};
  const rawTreasury = isPlainObject(raw.treasury) ? raw.treasury : {};
  return {
    ...defaults,
    ...raw,
    access: mergeObjectLayer(
      (defaults.access ?? {}) as Record<string, unknown>,
      raw.access,
    ) as RepairSettings['access'],
    workflow: mergeObjectLayer(
      (defaults.workflow ?? {}) as Record<string, unknown>,
      raw.workflow,
    ) as RepairSettings['workflow'],
    defaults: mergeObjectLayer(
      (defaults.defaults ?? {}) as Record<string, unknown>,
      raw.defaults,
    ) as RepairSettings['defaults'],
    treasury: {
      ...defaultTreasury,
      ...rawTreasury,
      autoClose: mergeObjectLayer(
        (defaultTreasury.autoClose ?? {}) as Record<string, unknown>,
        rawTreasury.autoClose,
      ) as NonNullable<RepairSettings['treasury']>['autoClose'],
    },
  };
}

function resolveProductionWorkerSettings(
  input: Partial<ProductionWorkerSettings> | null | undefined,
): ProductionWorkerSettings {
  const defaults = DEFAULT_SYSTEM_SETTINGS.productionWorkerSettings!;
  const raw = isPlainObject(input) ? (input as Partial<ProductionWorkerSettings>) : {};
  return {
    ...defaults,
    ...raw,
    performance: mergeObjectLayer(
      defaults.performance as unknown as Record<string, unknown>,
      raw.performance,
    ) as unknown as ProductionWorkerSettings['performance'],
    bonus: mergeObjectLayer(
      defaults.bonus as unknown as Record<string, unknown>,
      raw.bonus,
    ) as unknown as ProductionWorkerSettings['bonus'],
    supervisorBonus: mergeObjectLayer(
      defaults.supervisorBonus as unknown as Record<string, unknown>,
      raw.supervisorBonus,
    ) as unknown as ProductionWorkerSettings['supervisorBonus'],
  };
}

function resolveOperationPaths(
  input: OperationPathSettings | null | undefined,
): OperationPathSettings {
  return resolveOperationPathSettings(input ?? DEFAULT_SYSTEM_SETTINGS.operationPaths);
}

/**
 * Deep-merge Partial/null SystemSettings with DEFAULT_SYSTEM_SETTINGS /
 * DEFAULT_PLAN_SETTINGS so nested inventoryRouting, reportBehavior, and other
 * settings objects never lose default keys on load/save.
 */
export function resolveSystemSettings(
  input: Partial<SystemSettings> | null | undefined,
): SystemSettings {
  if (input == null) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      planSettings: resolvePlanSettings(DEFAULT_SYSTEM_SETTINGS.planSettings),
      attendanceIntegration: resolveAttendanceIntegration(
        DEFAULT_SYSTEM_SETTINGS.attendanceIntegration,
      ),
      repairSettings: resolveRepairSettings(DEFAULT_SYSTEM_SETTINGS.repairSettings),
      operationPaths: resolveOperationPaths(DEFAULT_SYSTEM_SETTINGS.operationPaths),
      productionWorkerSettings: resolveProductionWorkerSettings(
        DEFAULT_SYSTEM_SETTINGS.productionWorkerSettings,
      ),
    };
  }

  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...input,
    planSettings: resolvePlanSettings(input.planSettings),
    attendanceIntegration: resolveAttendanceIntegration(input.attendanceIntegration),
    repairSettings: resolveRepairSettings(input.repairSettings),
    operationPaths: resolveOperationPaths(input.operationPaths),
    productionWorkerSettings: resolveProductionWorkerSettings(input.productionWorkerSettings),
  };
}
