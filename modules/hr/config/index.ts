// ─── HR Config Module — Public API ──────────────────────────────────────────

// Types
export type {
  HRConfigModuleName,
  ConfigMetadata,
  GeneralConfig,
  AttendanceConfig,
  OvertimeConfig,
  LeaveConfig,
  LeaveSalaryImpact,
  LeaveTypeDefinition,
  LoanConfig,
  PayrollSettingsConfig,
  ApprovalConfig,
  TransportZone,
  TransportConfig,
  HRConfigMap,
  HRConfigVersionSnapshot,
  HRConfigAuditAction,
  FirestoreHRConfigAuditLog,
  HRConfigTabMeta,
} from './types';

export { HR_CONFIG_MODULES, HR_CONFIG_TABS } from './types';

// Defaults
export { HR_CONFIG_DEFAULTS } from './defaults';

// Collections
export {
  HR_CONFIG_COLLECTIONS,
  hrConfigModulesRef,
  hrConfigModuleDocRef,
  hrConfigAuditLogsRef,
} from './collections';

// Service
export {
  getConfigModule,
  getAllConfigModules,
  updateConfigModule,
  resetConfigModule,
  captureConfigVersionSnapshot,
  initializeConfigModules,
} from './configService';

// Audit
export { hrConfigAuditService } from './configAudit';
