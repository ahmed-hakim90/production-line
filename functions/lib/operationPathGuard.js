import { HttpsError } from 'firebase-functions/v2/https';
const resolveOperationPathSettings = (input) => {
    const source = input && typeof input === 'object'
        ? input
        : {};
    const root = source.operationPaths && typeof source.operationPaths === 'object'
        ? source.operationPaths
        : source;
    const operationRows = root.operations && typeof root.operations === 'object'
        ? root.operations
        : {};
    const operations = {};
    Object.entries(operationRows).forEach(([operationKey, rawControl]) => {
        if (!rawControl || typeof rawControl !== 'object')
            return;
        const control = rawControl;
        const paths = {};
        if (control.paths && typeof control.paths === 'object') {
            Object.entries(control.paths).forEach(([pathKey, value]) => {
                if (typeof value === 'boolean')
                    paths[pathKey] = value;
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
export const isOperationPathEnabledServer = (settingsDoc, operationKey, pathKey) => {
    const control = resolveOperationPathSettings(settingsDoc).operations?.[operationKey];
    if (control?.enabled === false)
        return false;
    if (pathKey && control?.paths?.[pathKey] === false)
        return false;
    return true;
};
export const assertOperationPathEnabledServer = (settingsDoc, operationKey, pathKey) => {
    if (!isOperationPathEnabledServer(settingsDoc, operationKey, pathKey)) {
        throw new HttpsError('failed-precondition', 'هذا المسار متوقف من إعدادات النظام. استخدم مسارًا مفعّلًا أو راجع مسؤول النظام.');
    }
};
