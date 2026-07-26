/**
 * Minimal Firestore client over the REST API with an admin-SDK-like surface.
 *
 * Purpose: let local admin scripts run with the operator's own `firebase login`
 * session when no service account / ADC is configured. It uses the developer's
 * OAuth access token, so it inherits that human's IAM permissions and BYPASSES
 * Firestore security rules — keep it in `scripts/` only, never in app code.
 *
 * Supported subset (mirrors firebase-admin usage in cleanup scripts):
 *   db.collection(name).where(field, '==', value).orderBy(FieldPath.documentId()).limit(n).startAfter(snap).get()
 *   db.collection(name).doc(id) / db.doc(path) -> ref.get()
 *   db.batch() -> set(ref, data, { merge }) | update(ref, patch) | delete(ref) | commit()
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIRESTORE_HOST = 'https://firestore.googleapis.com/v1';
const DEFAULT_PAGE_SIZE = 300;
const TOKEN_SKEW_MS = 5 * 60 * 1000;
const MAX_COMMIT_WRITES = 500;

export const DOCUMENT_ID_FIELD = '__name__';

function configstorePath() {
  return join(process.env.HOME || '', '.config/configstore/firebase-tools.json');
}

function readStoredToken() {
  const path = configstorePath();
  if (!existsSync(path)) return null;
  try {
    const tokens = JSON.parse(readFileSync(path, 'utf8'))?.tokens;
    if (!tokens?.access_token) return null;
    return { accessToken: tokens.access_token, expiresAt: Number(tokens.expires_at) || 0 };
  } catch {
    return null;
  }
}

/**
 * Delegate refresh to the Firebase CLI so no OAuth client secret lives here:
 * any authenticated command rewrites a fresh access token into the configstore.
 */
function refreshTokenViaCli() {
  execFileSync('firebase', ['projects:list', '--json'], { stdio: 'ignore' });
}

export function hasFirebaseToolsLogin() {
  return Boolean(readStoredToken());
}

export function loadFirebaseToolsAccessToken() {
  let stored = readStoredToken();
  if (!stored) {
    throw new Error('No Firebase CLI session found. Run: firebase login');
  }
  if (stored.expiresAt <= Date.now() + TOKEN_SKEW_MS) {
    refreshTokenViaCli();
    stored = readStoredToken();
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new Error('Could not refresh Firebase CLI credentials. Run: firebase login --reauth');
    }
  }
  return stored.accessToken;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  }
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      if (!Number.isFinite(value)) return { doubleValue: value };
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case 'object':
      return { mapValue: { fields: encodeFields(value) } };
    default:
      throw new Error(`Unsupported Firestore value type: ${typeof value}`);
  }
}

function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return fields;
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map((item) => decodeValue(item));
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

function toTimestampLike(iso) {
  if (!iso) return undefined;
  const date = new Date(iso);
  return { toDate: () => date };
}

class RestDocumentReference {
  constructor(client, path) {
    this.client = client;
    this.path = path;
    this.id = path.slice(path.lastIndexOf('/') + 1);
  }

  get name() {
    return `${this.client.documentsRoot}/${this.path}`;
  }

  async get() {
    return this.client.getDocument(this);
  }
}

class RestDocumentSnapshot {
  constructor(client, document) {
    this.client = client;
    this.exists = Boolean(document);
    this._fields = document?.fields || {};
    const name = document?.name || '';
    const path = name ? name.slice(client.documentsRoot.length + 1) : '';
    this.ref = path ? new RestDocumentReference(client, path) : null;
    this.id = this.ref?.id || '';
    this.createTime = toTimestampLike(document?.createTime);
    this.updateTime = toTimestampLike(document?.updateTime);
  }

  data() {
    return this.exists ? decodeFields(this._fields) : undefined;
  }
}

class RestQuery {
  constructor(client, collectionId, state = {}) {
    this.client = client;
    this.collectionId = collectionId;
    this.state = { filters: [], orderByDocumentId: false, limit: 0, startAfterName: '', ...state };
  }

  _next(patch) {
    return new RestQuery(this.client, this.collectionId, { ...this.state, ...patch });
  }

  where(fieldPath, op, value) {
    if (op !== '==') throw new Error(`Unsupported query operator: ${op}`);
    return this._next({ filters: [...this.state.filters, { fieldPath, value }] });
  }

  orderBy(fieldPath) {
    if (fieldPath !== DOCUMENT_ID_FIELD) {
      throw new Error('Only documentId ordering is supported by the REST shim');
    }
    return this._next({ orderByDocumentId: true });
  }

  limit(count) {
    return this._next({ limit: count });
  }

  startAfter(snapshotOrName) {
    const name =
      typeof snapshotOrName === 'string' ? snapshotOrName : snapshotOrName?.ref?.name || '';
    if (!name) throw new Error('startAfter requires a document snapshot');
    return this._next({ startAfterName: name });
  }

  buildStructuredQuery() {
    const filters = this.state.filters.map((filter) => ({
      fieldFilter: {
        field: { fieldPath: filter.fieldPath },
        op: 'EQUAL',
        value: encodeValue(filter.value),
      },
    }));

    const structuredQuery = {
      from: [{ collectionId: this.collectionId }],
      orderBy: [{ field: { fieldPath: DOCUMENT_ID_FIELD }, direction: 'ASCENDING' }],
    };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) {
      structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
    }
    if (this.state.limit > 0) structuredQuery.limit = this.state.limit;
    if (this.state.startAfterName) {
      structuredQuery.startAt = {
        values: [{ referenceValue: this.state.startAfterName }],
        before: false,
      };
    }
    return structuredQuery;
  }

  async get() {
    const rows = await this.client.runQuery(this.buildStructuredQuery());
    const docs = rows
      .filter((row) => row.document)
      .map((row) => new RestDocumentSnapshot(this.client, row.document));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class RestCollectionReference extends RestQuery {
  constructor(client, collectionId) {
    super(client, collectionId);
  }

  doc(id) {
    const safeId = String(id || '').trim();
    if (!safeId || safeId.includes('/')) {
      throw new Error(`Invalid document id: ${String(id)}`);
    }
    return new RestDocumentReference(this.client, `${this.collectionId}/${safeId}`);
  }
}

class RestWriteBatch {
  constructor(client) {
    this.client = client;
    this.writes = [];
  }

  set(ref, data, options = {}) {
    const fields = encodeFields(data);
    const write = { update: { name: ref.name, fields } };
    if (options.merge) write.updateMask = { fieldPaths: Object.keys(fields) };
    this.writes.push(write);
    return this;
  }

  update(ref, patch) {
    const fields = encodeFields(patch);
    this.writes.push({
      update: { name: ref.name, fields },
      updateMask: { fieldPaths: Object.keys(fields) },
      currentDocument: { exists: true },
    });
    return this;
  }

  delete(ref) {
    this.writes.push({ delete: ref.name });
    return this;
  }

  async commit() {
    if (this.writes.length === 0) return;
    if (this.writes.length > MAX_COMMIT_WRITES) {
      throw new Error(`Batch too large: ${this.writes.length} writes (max ${MAX_COMMIT_WRITES})`);
    }
    await this.client.commit(this.writes);
    this.writes = [];
  }
}

class RestFirestore {
  constructor({ projectId, getAccessToken, databaseId = '(default)' }) {
    if (!projectId) throw new Error('projectId is required');
    this.projectId = projectId;
    this.databaseId = databaseId;
    this.getAccessToken = getAccessToken;
    this.documentsRoot = `projects/${projectId}/databases/${databaseId}/documents`;
  }

  collection(collectionId) {
    return new RestCollectionReference(this, collectionId);
  }

  doc(path) {
    const clean = String(path || '').replace(/^\/+/, '');
    if (!clean || clean.split('/').length % 2 !== 0) {
      throw new Error(`Invalid document path: ${String(path)}`);
    }
    return new RestDocumentReference(this, clean);
  }

  batch() {
    return new RestWriteBatch(this);
  }

  async _request(url, init) {
    const token = await this.getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      // Google error payloads never contain the bearer token; safe to surface locally.
      throw new Error(`Firestore REST ${res.status}: ${body.slice(0, 400)}`);
    }
    return res.json();
  }

  async runQuery(structuredQuery) {
    const url = `${FIRESTORE_HOST}/${this.documentsRoot}:runQuery`;
    const data = await this._request(url, {
      method: 'POST',
      body: JSON.stringify({ structuredQuery }),
    });
    return Array.isArray(data) ? data : [];
  }

  async getDocument(ref) {
    const url = `${FIRESTORE_HOST}/${ref.name}`;
    const token = await this.getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return new RestDocumentSnapshot(this, null);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Firestore REST ${res.status}: ${body.slice(0, 400)}`);
    }
    return new RestDocumentSnapshot(this, await res.json());
  }

  async commit(writes) {
    const url = `${FIRESTORE_HOST}/${this.documentsRoot}:commit`;
    await this._request(url, { method: 'POST', body: JSON.stringify({ writes }) });
  }
}

export function createRestFirestore({ projectId, databaseId }) {
  let cachedToken = '';
  let cachedAt = 0;
  const getAccessToken = async () => {
    if (!cachedToken || Date.now() - cachedAt > 30 * 60 * 1000) {
      cachedToken = loadFirebaseToolsAccessToken();
      cachedAt = Date.now();
    }
    return cachedToken;
  };
  return new RestFirestore({ projectId, databaseId, getAccessToken });
}

export const REST_PAGE_SIZE = DEFAULT_PAGE_SIZE;
