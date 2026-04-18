import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
  UserCredential,
} from 'firebase/auth';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;
let functionsClient: Functions;

/** True when IndexedDB persistence (multi-tab) initialized successfully. */
export let firestoreOfflinePersistenceEnabled = false;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    firestoreOfflinePersistenceEnabled = true;
  } catch (err) {
    console.warn(
      'Firestore: persistent cache unavailable, using default instance.',
      err,
    );
    db = getFirestore(app);
  }
  auth = getAuth(app);
  storage = getStorage(app);
  functionsClient = getFunctions(app, 'us-central1');
} else {
  console.warn('⚠ Firebase not configured. Add VITE_FIREBASE_* variables to .env.local');
}

export { db, auth, storage, isConfigured };

const normalizeCallableError = (error: any): Error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();

  if (code.includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (code.includes('permission-denied')) {
    return new Error('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
  }
  if (code.includes('failed-precondition')) {
    return new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
  }
  if (code.includes('resource-exhausted')) {
    return new Error(message || 'العملية تتجاوز الحد المسموح.');
  }
  if (code.includes('not-found')) {
    return new Error('الخدمة غير متاحة حاليًا. تأكد من نشر Cloud Functions.');
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return new Error('تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
  }
  /** يظهر غالبًا عند فشل الشبكة أو CORS أو استجابة ليست من callable سليم (دالة غير منشورة، 404، إلخ). */
  if (
    message.toLowerCase() === 'internal' ||
    code === 'functions/internal' ||
    message.includes('Failed to fetch')
  ) {
    return new Error(
      'تعذر استدعاء الخادم. إن ظهرت رسالة CORS: غالبًا الدالة غير منشورة أو Secret BOSTA_API_KEY غير مُنشأ في المشروع. نفّذ: firebase functions:secrets:set BOSTA_API_KEY ثم firebase deploy --only functions',
    );
  }
  if (message) {
    return new Error(message);
  }
  return new Error('حدث خطأ غير متوقع أثناء التواصل مع الخادم.');
};

export const signInWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

export const createUserWithEmail = async (
  email: string,
  password: string,
  userData?: {
    displayName: string;
    roleId: string;
    createdBy: string;
    tenantId: string;
    isActive?: boolean;
  },
): Promise<{ uid: string }> => {
  if (!isConfigured) throw new Error('Firebase not configured');

  const appName = `userCreation_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    if (userData) {
      const {
        getFirestore: getFs,
        doc: fsDoc,
        setDoc: fsSetDoc,
        serverTimestamp: fsTs,
      } = await import('firebase/firestore');
      const secondaryDb = getFs(secondaryApp);
      await fsSetDoc(fsDoc(secondaryDb, 'users', uid), {
        email,
        displayName: userData.displayName,
        roleId: userData.roleId,
        tenantId: userData.tenantId,
        isActive: userData.isActive ?? true,
        createdBy: userData.createdBy,
        createdAt: fsTs(),
      });
    }

    await firebaseSignOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return { uid };
  } catch (err) {
    await firebaseSignOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
    throw err;
  }
};

export const registerWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signOut = async (): Promise<void> => {
  if (!isConfigured || !auth) return;
  await firebaseSignOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  await sendPasswordResetEmail(auth, email);
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const deleteUserHard = async (targetUid: string): Promise<void> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ targetUid: string }, { ok: boolean }>(
    functionsClient,
    'adminDeleteUserHard',
  );
  try {
    await callable({ targetUid });
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const updateUserCredentialsHard = async (input: {
  targetUid: string;
  email?: string;
  password?: string;
}): Promise<void> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { targetUid: string; email?: string; password?: string },
    { ok: boolean }
  >(functionsClient, 'adminUpdateUserCredentials');
  try {
    await callable(input);
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const runAssetDepreciationCallable = async (input?: { period?: string }): Promise<{
  period: string;
  processedAssets: number;
  createdEntries: number;
  skippedEntries: number;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { period?: string } | undefined,
    { period: string; processedAssets: number; createdEntries: number; skippedEntries: number }
  >(functionsClient, 'runAssetDepreciationJob');
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const runMonthlyOverheadAllocationCallable = async (input: { month: string }): Promise<{
  ok: boolean;
  month: string;
  totalDirect: number;
  totalIndirect: number;
  totalCost: number;
  orderCount: number;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { month: string },
    { ok: boolean; month: string; totalDirect: number; totalIndirect: number; totalCost: number; orderCount: number }
  >(functionsClient, 'runMonthlyOverheadAllocation');
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const calculateMonthlyCostVarianceCallable = async (input: { month: string }): Promise<{
  ok: boolean;
  month: string;
  flagged: number;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ month: string }, { ok: boolean; month: string; flagged: number }>(
    functionsClient,
    'calculateMonthlyCostVariance',
  );
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type ResolveTenantSlugResult = {
  exists: boolean;
  tenantId?: string;
  status?: string;
  pendingRegistration?: boolean;
};

export type PublicRepairTrackResult =
  | { found: false; reason: 'tenant_not_found' | 'tenant_not_active' | 'not_found' }
  | {
      found: true;
      job: {
        receiptNo: string;
        customerName: string;
        deviceBrand: string;
        deviceModel: string;
        status: string;
        updatedAtMs: number;
      };
    };

/** Pre-login: resolves company slug via Cloud Function (Firestore tenant_slugs is auth-only). */
export const resolveTenantSlugCallable = async (slug: string): Promise<ResolveTenantSlugResult> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ slug: string }, ResolveTenantSlugResult>(
    functionsClient,
    'resolveTenantSlug',
  );
  try {
    const result = await callable({ slug: slug.trim().toLowerCase() });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const trackRepairJobPublicCallable = async (input: {
  tenantSlug: string;
  receiptNo: string;
  phone: string;
}): Promise<PublicRepairTrackResult> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { tenantSlug: string; receiptNo: string; phone: string },
    PublicRepairTrackResult
  >(functionsClient, 'trackRepairJobPublic');
  try {
    const result = await callable({
      tenantSlug: input.tenantSlug.trim().toLowerCase(),
      receiptNo: input.receiptNo.trim(),
      phone: input.phone.trim(),
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

const functionsUsCentral1HttpBase = (): string => {
  const pid = firebaseConfig.projectId;
  if (!pid) throw new Error('Firebase not configured');
  return `https://us-central1-${pid}.cloudfunctions.net`;
};

/**
 * استدعاء دالة HTTP في نفس المشروع مع Bearer ID token — يتفادى مشاكل callable/CORS مع بعض إعدادات Cloud Run.
 */
async function callAuthenticatedCloudFunctionJson<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  const idToken = await user.getIdToken();
  const url = `${functionsUsCentral1HttpBase()}/${functionName}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes('Failed to fetch') || m.includes('NetworkError')) {
      throw new Error(
        'تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة، أو تأكد من نشر الدوال (getBostaDeliveriesCreatedCountHttp).',
      );
    }
    throw new Error(m);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text ? text.slice(0, 200) : `استجابة غير صالحة (${res.status})`);
  }
  if (!res.ok) {
    const errObj = parsed as { error?: { code?: string; message?: string } };
    const code = errObj.error?.code ? `functions/${errObj.error.code}` : 'functions/internal';
    const message = String(errObj.error?.message || '').trim();
    throw normalizeCallableError({ code, message: message || `HTTP ${res.status}` });
  }
  return parsed as T;
}

/** Bosta: count deliveries created in the same local date range as the online KPI date picker. */
export const getBostaDeliveriesCreatedCountCallable = async (input: {
  rangeFrom: string;
  rangeTo: string;
}): Promise<{ count: number; rangeFrom: string; rangeTo: string }> => {
  return callAuthenticatedCloudFunctionJson<{ count: number; rangeFrom: string; rangeTo: string }>(
    'getBostaDeliveriesCreatedCountHttp',
    { rangeFrom: input.rangeFrom, rangeTo: input.rangeTo },
  );
};

export type BostaApiDeliveryRow = {
  trackingNumber: string;
  createdAtMs: number;
  stateLabel: string | null;
};

/** Bosta: list deliveries created in range (for dashboard merge with Firestore). */
export const listBostaDeliveriesForRangeCallable = async (input: {
  rangeFrom: string;
  rangeTo: string;
}): Promise<{
  items: BostaApiDeliveryRow[];
  truncated: boolean;
  rangeFrom: string;
  rangeTo: string;
}> => {
  return callAuthenticatedCloudFunctionJson<{
    items: BostaApiDeliveryRow[];
    truncated: boolean;
    rangeFrom: string;
    rangeTo: string;
  }>('listBostaDeliveriesForRangeHttp', { rangeFrom: input.rangeFrom, rangeTo: input.rangeTo });
};

/** Bosta: refresh cached tracking state on shipment docs (server-side). */
export const syncBostaOnlineDispatchStatusesCallable = async (input?: {
  limit?: number;
  /** يكمل من مؤشر الصفحات (نفس المزامنة المجدولة) بدل أحدث الطلبات فقط. */
  advancePaginationCursor?: boolean;
}): Promise<{ processed: number; tenantId: string }> => {
  const payload: Record<string, unknown> = {};
  if (input?.limit !== undefined) payload.limit = input.limit;
  if (input?.advancePaginationCursor === true) payload.advancePaginationCursor = true;
  return callAuthenticatedCloudFunctionJson<{ processed: number; tenantId: string }>(
    'syncBostaOnlineDispatchStatusesHttp',
    payload,
  );
};

/** مزامنة حالة بوسطة لشحنات محددة بالمعرف (حتى ٢٥٠ لكل طلب) — مثلاً كل الشحنات ضمن نطاق التاريخ في لوحة الأونلاين. */
export const syncBostaOnlineDispatchByDocIdsCallable = async (input: {
  docIds: string[];
}): Promise<{ processed: number; skipped: number; tenantId: string }> => {
  return callAuthenticatedCloudFunctionJson<{ processed: number; skipped: number; tenantId: string }>(
    'syncBostaOnlineDispatchByDocIdsHttp',
    { docIds: input.docIds },
  );
};

export type TenantFirestoreFootprint = {
  tenantId: string;
  slug: string;
  name: string;
  status: string;
  userCount: number;
  collectionsWithData: number;
  totalDocuments: number;
  perCollection: Record<string, number>;
  failedCollections: string[];
  estimatedStorageBytes: number;
  avgDocBytesAssumption: number;
  usageNoteAr: string;
};

/** Super-admin: per-tenant Firestore document counts (Cloud Function + Admin SDK). */
export const getTenantFirestoreFootprintCallable = async (
  tenantId: string,
): Promise<TenantFirestoreFootprint> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ tenantId: string }, TenantFirestoreFootprint>(
    functionsClient,
    'getTenantFirestoreFootprint',
  );
  try {
    const result = await callable({ tenantId: tenantId.trim() });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

/** Full JSON backup for one tenant (same shape as Settings → backup export). */
export type SuperAdminTenantBackupFile = {
  metadata: {
    version: string;
    createdAt: string;
    type: 'full';
    collectionsIncluded: string[];
    documentCounts: Record<string, number>;
    totalDocuments: number;
    createdBy: string;
    tenantId: string;
  };
  collections: Record<string, Record<string, unknown>[]>;
  collectionGroups?: Record<string, Record<string, unknown>[]>;
};

export const exportTenantBackupCallable = async (
  tenantId: string,
): Promise<SuperAdminTenantBackupFile> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ tenantId: string }, { backup: SuperAdminTenantBackupFile }>(
    functionsClient,
    'exportTenantBackup',
  );
  try {
    const result = await callable({ tenantId: tenantId.trim() });
    return result.data.backup;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const adminDeleteTenantCascadeCallable = async (
  tenantId: string,
  confirmPhrase: string,
): Promise<{ ok: boolean; deletedFirestoreDocs: number; deletedAuthUsers: number }> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { tenantId: string; confirmPhrase: string },
    { ok: boolean; deletedFirestoreDocs: number; deletedAuthUsers: number }
  >(functionsClient, 'adminDeleteTenantCascade');
  try {
    const result = await callable({
      tenantId: tenantId.trim(),
      confirmPhrase: confirmPhrase.trim(),
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const deleteRepairBranchCascadeCallable = async (
  branchId: string,
): Promise<{
  ok: boolean;
  branchId: string;
  branchName: string;
  deletedFirestoreDocs: number;
  deletedCounts: Record<string, number>;
  unlinkedCounts?: Record<string, number>;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { branchId: string },
    {
      ok: boolean;
      branchId: string;
      branchName: string;
      deletedFirestoreDocs: number;
      deletedCounts: Record<string, number>;
      unlinkedCounts?: Record<string, number>;
    }
  >(functionsClient, 'deleteRepairBranchCascade');
  try {
    const result = await callable({ branchId: branchId.trim() });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type ImportCustomerDepositsPackMode = 'merge' | 'replace_module';

export const importCustomerDepositsPackCallable = async (
  pack: Record<string, unknown>,
  mode: ImportCustomerDepositsPackMode,
): Promise<{
  ok: true;
  mode: ImportCustomerDepositsPackMode;
  written: {
    customers: number;
    companyBankAccounts: number;
    entries: number;
    adjustments: number;
  };
  deletedBefore?: number;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { pack: Record<string, unknown>; mode: ImportCustomerDepositsPackMode },
    {
      ok: true;
      mode: ImportCustomerDepositsPackMode;
      written: {
        customers: number;
        companyBankAccounts: number;
        entries: number;
        adjustments: number;
      };
      deletedBefore?: number;
    }
  >(functionsClient, 'importCustomerDepositsPack');
  try {
    const result = await callable({ pack, mode });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

/** Super-admin: restore backup JSON via Admin SDK (bypasses client Firestore rules). */
export type ImportTenantBackupMode = 'merge' | 'replace' | 'full_reset';

export const importTenantBackupCallable = async (
  backup: Record<string, unknown>,
  mode: ImportTenantBackupMode,
  tenantIdForHistory?: string,
): Promise<{ success: true; restored: number }> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { backup: Record<string, unknown>; mode: ImportTenantBackupMode; tenantIdForHistory?: string },
    { success: true; restored: number }
  >(functionsClient, 'importTenantBackup');
  try {
    const result = await callable({
      backup,
      mode,
      tenantIdForHistory: tenantIdForHistory?.trim(),
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};
