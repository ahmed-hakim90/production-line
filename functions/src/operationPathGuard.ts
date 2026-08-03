import { HttpsError } from 'firebase-functions/v2/https';

type OperationPathControl = {
  enabled?: boolean;
  paths?: Record<string, boolean>;
};

type OperationPathSettings = {
  operations?: Record<string, OperationPathControl>;
};

const resolveOperationPathSettings = (input: unknown): OperationPathSettings => {
  const source = input && typeof input === 'object'
    ? input as { operationPaths?: unknown; operations?: unknown }
    : {};
  const root = source.operationPaths && typeof source.operationPaths === 'object'
    ? source.operationPaths as { operations?: unknown }
    : source;
  const operationRows = root.operations && typeof root.operations === 'object'
    ? root.operations as Record<string, unknown>
    : {};
  const operations: Record<string, OperationPathControl> = {};

  Object.entries(operationRows).forEach(([operationKey, rawControl]) => {
    if (!rawControl || typeof rawControl !== 'object') return;
    const control = rawControl as { enabled?: unknown; paths?: unknown };
    const paths: Record<string, boolean> = {};
    if (control.paths && typeof control.paths === 'object') {
      Object.entries(control.paths as Record<string, unknown>).forEach(([pathKey, value]) => {
        if (typeof value === 'boolean') paths[pathKey] = value;
      });
    }
    operations[operationKey] = {
      ...(typeof control.enabled === 'boolean' ? { enabled: control.enabled } : {}),
      ...(Object.keys(paths).length > 0 ? { paths } : {}),
    };
  });

  return { operations };
};

/** Fail-open default: missing config keeps the path enabled (matches client). */
export const isOperationPathEnabledServer = (
  settingsDoc: unknown,
  operationKey: string,
  pathKey?: string,
): boolean => {
  const control = resolveOperationPathSettings(settingsDoc).operations?.[operationKey];
  if (control?.enabled === false) return false;
  if (pathKey && control?.paths?.[pathKey] === false) return false;
  return true;
};

export const assertOperationPathEnabledServer = (
  settingsDoc: unknown,
  operationKey: string,
  pathKey?: string,
): void => {
  if (!isOperationPathEnabledServer(settingsDoc, operationKey, pathKey)) {
    throw new HttpsError(
      'failed-precondition',
      'هذا المسار متوقف من إعدادات النظام. استخدم مسارًا مفعّلًا أو راجع مسؤول النظام.',
    );
  }
};
