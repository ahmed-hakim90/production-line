/**
 * HR Config Service — Modular CRUD with versioning & snapshot
 *
 * Each config module is a single document in hr_config_modules/{moduleName}.
 * Every update increments configVersion and logs the change.
 * Snapshot captures all module versions at payroll generation time.
 */
import {
  getDoc,
  setDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { hrConfigModuleDocRef, hrConfigModulesRef } from './collections';
import { HR_CONFIG_DEFAULTS, withLeaveReasonDefaults } from './defaults';
import { hrConfigAuditService } from './configAudit';
import {
  HR_CONFIG_MODULES,
  type HRConfigModuleName,
  type HRConfigMap,
  type ConfigMetadata,
  type HRConfigVersionSnapshot,
} from './types';

type ConfigWithoutMeta<T> = Omit<T, keyof ConfigMetadata>;

function applyModuleDefaults<K extends HRConfigModuleName>(
  moduleName: K,
  data: Partial<HRConfigMap[K]>,
): HRConfigMap[K] {
  const merged = {
    ...HR_CONFIG_DEFAULTS[moduleName],
    ...data,
  };

  if (moduleName === 'leave') {
    return withLeaveReasonDefaults(merged as Partial<HRConfigMap['leave']>) as HRConfigMap[K];
  }

  return merged as HRConfigMap[K];
}

function markConfiguredFields<K extends HRConfigModuleName>(
  moduleName: K,
  data: Partial<ConfigWithoutMeta<HRConfigMap[K]>>,
): Partial<ConfigWithoutMeta<HRConfigMap[K]>> {
  if (moduleName === 'leave' && Object.prototype.hasOwnProperty.call(data, 'leaveReasons')) {
    return {
      ...data,
      leaveReasonsConfigured: true,
    } as Partial<ConfigWithoutMeta<HRConfigMap[K]>>;
  }

  return data;
}

/** Detect which top-level fields changed between two objects */
function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (['configVersion', 'updatedAt', 'updatedBy'].includes(key)) continue;
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Get a single config module. Returns defaults if the document doesn't exist.
 */
export async function getConfigModule<K extends HRConfigModuleName>(
  moduleName: K,
): Promise<HRConfigMap[K]> {
  if (!isConfigured) {
    return applyModuleDefaults(moduleName, {
      configVersion: 0,
      updatedAt: null,
      updatedBy: '',
    } as Partial<HRConfigMap[K]>);
  }

  const snap = await getDoc(hrConfigModuleDocRef(moduleName));
  if (!snap.exists()) {
    return applyModuleDefaults(moduleName, {
      configVersion: 0,
      updatedAt: null,
      updatedBy: '',
    } as Partial<HRConfigMap[K]>);
  }

  return applyModuleDefaults(moduleName, snap.data() as Partial<HRConfigMap[K]>);
}

/**
 * Get all config modules at once.
 */
export async function getAllConfigModules(): Promise<HRConfigMap> {
  const results = await Promise.all(
    HR_CONFIG_MODULES.map(async (name) => {
      const config = await getConfigModule(name);
      return [name, config] as const;
    }),
  );
  return Object.fromEntries(results) as unknown as HRConfigMap;
}

/**
 * Update a config module.
 * - Increments configVersion
 * - Detects changed fields
 * - Writes audit log
 */
export async function updateConfigModule<K extends HRConfigModuleName>(
  moduleName: K,
  data: Partial<ConfigWithoutMeta<HRConfigMap[K]>>,
  performedBy: string,
): Promise<{ newVersion: number }> {
  if (!isConfigured) throw new Error('Firebase not configured');

  const current = await getConfigModule(moduleName);
  const dataWithMarkers = markConfiguredFields(moduleName, data);
  const previousVersion = current.configVersion;
  const newVersion = previousVersion + 1;

  const changedFields = diffFields(
    current as unknown as Record<string, unknown>,
    dataWithMarkers as unknown as Record<string, unknown>,
  );

  if (changedFields.length === 0) {
    return { newVersion: previousVersion };
  }

  const merged = {
    ...HR_CONFIG_DEFAULTS[moduleName],
    ...current,
    ...dataWithMarkers,
    tenantId: getCurrentTenantId(),
    configVersion: newVersion,
    updatedAt: serverTimestamp(),
    updatedBy: performedBy,
  };

  await setDoc(hrConfigModuleDocRef(moduleName), merged);

  await hrConfigAuditService.log(
    moduleName,
    'update',
    previousVersion,
    newVersion,
    changedFields,
    performedBy,
    `تحديث إعدادات ${moduleName} — الحقول: ${changedFields.join(', ')}`,
  );

  return { newVersion };
}

/**
 * Reset a config module to defaults.
 */
export async function resetConfigModule<K extends HRConfigModuleName>(
  moduleName: K,
  performedBy: string,
): Promise<{ newVersion: number }> {
  if (!isConfigured) throw new Error('Firebase not configured');

  const current = await getConfigModule(moduleName);
  const previousVersion = current.configVersion;
  const newVersion = previousVersion + 1;

  const defaults = HR_CONFIG_DEFAULTS[moduleName];
  const allFields = Object.keys(defaults);

  const merged = {
    ...defaults,
    tenantId: getCurrentTenantId(),
    configVersion: newVersion,
    updatedAt: serverTimestamp(),
    updatedBy: performedBy,
  };

  await setDoc(hrConfigModuleDocRef(moduleName), merged);

  await hrConfigAuditService.log(
    moduleName,
    'reset',
    previousVersion,
    newVersion,
    allFields,
    performedBy,
    `إعادة تعيين إعدادات ${moduleName} إلى القيم الافتراضية`,
  );

  return { newVersion };
}

/**
 * Capture a snapshot of all config versions.
 * Used when generating/finalizing payroll to freeze the config state.
 */
export async function captureConfigVersionSnapshot(): Promise<HRConfigVersionSnapshot> {
  const allConfigs = await getAllConfigModules();

  const versions = {} as Record<HRConfigModuleName, number>;
  for (const moduleName of HR_CONFIG_MODULES) {
    versions[moduleName] = allConfigs[moduleName].configVersion;
  }

  return {
    capturedAt: serverTimestamp(),
    versions,
  };
}

/**
 * Initialize all config modules with defaults if they don't exist.
 * Safe to call multiple times — only writes missing modules.
 */
export async function initializeConfigModules(performedBy: string): Promise<void> {
  if (!isConfigured) return;

  for (const moduleName of HR_CONFIG_MODULES) {
    const snap = await getDoc(hrConfigModuleDocRef(moduleName));
    if (!snap.exists()) {
      await setDoc(hrConfigModuleDocRef(moduleName), {
        ...HR_CONFIG_DEFAULTS[moduleName],
        tenantId: getCurrentTenantId(),
        configVersion: 1,
        updatedAt: serverTimestamp(),
        updatedBy: performedBy,
      });
    }
  }
}
