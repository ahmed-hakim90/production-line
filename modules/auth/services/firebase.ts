import { getApp, getApps, initializeApp, FirebaseApp } from "firebase/app";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
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
} from "firebase/auth";
import { getFunctions, httpsCallable, Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured =
  !!firebaseConfig.apiKey && firebaseConfig.apiKey !== "undefined";

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;
let functionsClient: Functions;

/** True when IndexedDB persistence (single-tab) initialized successfully. */
export let firestoreOfflinePersistenceEnabled = false;

/**
 * Keys written by `WebStorageSharedClientState` (multi-tab manager) into
 * `localStorage`. Once the app switches to single-tab persistence, no new
 * entries are produced, but legacy entries can still occupy the ~5 MB origin
 * quota and trip Firestore's INTERNAL ASSERTION (b815) on `setItem`.
 */
const FIRESTORE_LS_PREFIXES = [
  "firestore_clients_",
  "firestore_targets_",
  "firestore_mutations_",
  "firestore_online_state",
  "firestore_sequence_number_",
];

const purgeLeakedFirestoreLocalStorage = (): void => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && FIRESTORE_LS_PREFIXES.some((p) => k.startsWith(p))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => {
      try {
        ls.removeItem(k);
      } catch {
        /* ignore individual key removal failures */
      }
    });
  } catch {
    /* localStorage unavailable (private mode, disabled storage) — safe to skip */
  }
};

if (isConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  purgeLeakedFirestoreLocalStorage();
  try {
    db = initializeFirestore(app, {
      // Force long-polling to avoid Chromium QUIC/WebChannel Listen failures
      // (ERR_QUIC_PROTOCOL_ERROR / QUIC_TOO_MANY_RTOS) on flaky networks.
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    });
    firestoreOfflinePersistenceEnabled = true;
  } catch (err) {
    console.warn(
      "Firestore: persistent cache unavailable or already initialized; reusing the active instance.",
      err,
    );
    // initializeFirestore may register the instance before persistence ownership
    // fails (and HMR always reloads this module against an existing instance).
    // Reuse it instead of trying a second incompatible initialization.
    try {
      db = getFirestore(app);
    } catch {
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache(),
      });
    }
    firestoreOfflinePersistenceEnabled = false;
  }
  auth = getAuth(app);
  storage = getStorage(app);
  functionsClient = getFunctions(app, "us-central1");
} else {
  console.warn(
    "⚠ Firebase not configured. Add VITE_FIREBASE_* variables to .env.local",
  );
}

export { db, auth, storage, functionsClient, isConfigured };

/** Firebase SDK default / transport messages — not business copy from our handlers. */
const isGenericCallableMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  if (!lower) return true;
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) return true;
  if (lower.startsWith("functions/")) return true;
  return [
    "internal",
    "not-found",
    "not found",
    "unauthenticated",
    "permission-denied",
    "permission denied",
    "failed-precondition",
    "resource-exhausted",
    "unavailable",
    "deadline-exceeded",
    "invalid-argument",
    "already-exists",
    "aborted",
    "out-of-range",
    "unimplemented",
    "data-loss",
    "unknown",
    "cancelled",
    "ok",
    "not_found",
    "permission_denied",
    "failed_precondition",
    "resource_exhausted",
    "deadline_exceeded",
    "invalid_argument",
    "already_exists",
    "out_of_range",
    "data_loss",
  ].includes(lower);
};

const normalizeCallableError = (error: any): Error => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").trim();

  // Prefer Arabic / server business messages from HttpsError over generic code labels.
  if (message && !isGenericCallableMessage(message)) {
    return new Error(message);
  }

  if (code.includes("unauthenticated")) {
    return new Error("يجب تسجيل الدخول أولًا ثم إعادة المحاولة.");
  }
  if (code.includes("permission-denied")) {
    return new Error("ليس لديك صلاحية لتنفيذ هذا الإجراء.");
  }
  if (code.includes("failed-precondition")) {
    return new Error("لا يمكن تنفيذ العملية في الحالة الحالية.");
  }
  if (code.includes("resource-exhausted")) {
    return new Error("العملية تتجاوز الحد المسموح.");
  }
  if (code.includes("not-found")) {
    return new Error("الخدمة غير متاحة حاليًا. تأكد من نشر Cloud Functions.");
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return new Error(
      "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    );
  }
  /** يظهر غالبًا عند فشل الشبكة أو CORS أو استجابة ليست من callable سليم (دالة غير منشورة، 404، إلخ). */
  if (
    message.toLowerCase() === "internal" ||
    code === "functions/internal" ||
    message.includes("Failed to fetch")
  ) {
    return new Error(
      "تعذر استدعاء الخادم. إن ظهرت رسالة CORS: غالبًا الدالة غير منشورة أو غير متاحة. تأكد من نشر Cloud Functions ثم أعد المحاولة.",
    );
  }
  if (message) {
    return new Error(message);
  }
  return new Error("حدث خطأ غير متوقع أثناء التواصل مع الخادم.");
};

export const signInWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error("Firebase not configured");
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Privileged user create (Auth + users doc with role/isActive) via Admin SDK.
 * Do not write privileged fields from the client — Firestore self-create is pending-only.
 */
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
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");

  if (!userData) {
    throw new Error("إنشاء المستخدم يتطلب بيانات الدور عبر الخادم.");
  }

  const callable = httpsCallable<
    {
      email: string;
      password: string;
      displayName: string;
      roleId: string;
      isActive?: boolean;
      tenantId?: string;
    },
    { ok: boolean; uid: string }
  >(functionsClient, "adminCreateUser");

  try {
    const result = await callable({
      email,
      password,
      displayName: userData.displayName,
      roleId: userData.roleId,
      isActive: userData.isActive ?? true,
      tenantId: userData.tenantId,
    });
    const uid = String(result.data?.uid || "").trim();
    if (!uid) throw new Error("تعذر إنشاء المستخدم.");
    return { uid };
  } catch (error: unknown) {
    throw normalizeCallableError(error);
  }
};

/** First tenant admin after Auth sign-up on Setup (Admin SDK writes privileged fields). */
export const bootstrapTenantAdminAccount = async (input: {
  displayName: string;
  tenantId: string;
  email?: string;
}): Promise<{ uid: string; roleId: string }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { displayName: string; tenantId: string; email?: string },
    { ok: boolean; uid: string; roleId: string }
  >(functionsClient, "bootstrapTenantAdmin");
  try {
    const result = await callable(input);
    return {
      uid: String(result.data?.uid || "").trim(),
      roleId: String(result.data?.roleId || "").trim(),
    };
  } catch (error: unknown) {
    throw normalizeCallableError(error);
  }
};

export const registerWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error("Firebase not configured");
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signOut = async (): Promise<void> => {
  if (!isConfigured || !auth) return;
  await firebaseSignOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  if (!isConfigured || !auth) throw new Error("Firebase not configured");
  await sendPasswordResetEmail(auth, email);
};

export const onAuthChange = (
  callback: (user: User | null) => void,
): (() => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const deleteUserHard = async (targetUid: string): Promise<void> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<{ targetUid: string }, { ok: boolean }>(
    functionsClient,
    "adminDeleteUserHard",
  );
  try {
    await callable({ targetUid });
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

/** Additive built-in role permission sync (Admin SDK). Safe for any active tenant user. */
export const syncBuiltInRolePermissionGrants = async (): Promise<{
  patchedRoles: number;
  grantedKeys: number;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    Record<string, never>,
    { ok: boolean; patchedRoles: number; grantedKeys: number }
  >(functionsClient, "syncBuiltInRolePermissionGrants");
  try {
    const result = await callable({});
    return {
      patchedRoles: Number(result.data?.patchedRoles || 0),
      grantedKeys: Number(result.data?.grantedKeys || 0),
    };
  } catch (error: unknown) {
    throw normalizeCallableError(error);
  }
};

export const updateUserCredentialsHard = async (input: {
  targetUid: string;
  email?: string;
  password?: string;
}): Promise<void> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { targetUid: string; email?: string; password?: string },
    { ok: boolean }
  >(functionsClient, "adminUpdateUserCredentials");
  try {
    await callable(input);
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const runAssetDepreciationCallable = async (input?: {
  period?: string;
}): Promise<{
  period: string;
  processedAssets: number;
  createdEntries: number;
  skippedEntries: number;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { period?: string } | undefined,
    {
      period: string;
      processedAssets: number;
      createdEntries: number;
      skippedEntries: number;
    }
  >(functionsClient, "runAssetDepreciationJob");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const runMonthlyOverheadAllocationCallable = async (input: {
  month: string;
}): Promise<{
  ok: boolean;
  month: string;
  totalDirect: number;
  totalIndirect: number;
  totalCost: number;
  orderCount: number;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { month: string },
    {
      ok: boolean;
      month: string;
      totalDirect: number;
      totalIndirect: number;
      totalCost: number;
      orderCount: number;
    }
  >(functionsClient, "runMonthlyOverheadAllocation");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const calculateMonthlyCostVarianceCallable = async (input: {
  month: string;
}): Promise<{
  ok: boolean;
  month: string;
  flagged: number;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { month: string },
    { ok: boolean; month: string; flagged: number }
  >(functionsClient, "calculateMonthlyCostVariance");
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

export type PublicRepairTrackJobProduct = {
  name: string;
  quantity: number;
};

export type PublicRepairTrackStatusHistoryItem = {
  status: string;
  atMs: number;
};

export type PublicRepairTrackResult =
  | {
      found: false;
      reason: "tenant_not_found" | "tenant_not_active" | "not_found";
    }
  | {
      found: true;
      job: {
        receiptNo: string;
        customerName: string;
        deviceBrand: string;
        deviceModel: string;
        status: string;
        statusLabel: string;
        updatedAtMs: number;
        dueAtMs?: number;
        jobProducts?: PublicRepairTrackJobProduct[];
        statusHistory?: PublicRepairTrackStatusHistoryItem[];
      };
    };

/** Pre-login: resolves company slug via Cloud Function (Firestore tenant_slugs is auth-only). */
export const resolveTenantSlugCallable = async (
  slug: string,
): Promise<ResolveTenantSlugResult> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<{ slug: string }, ResolveTenantSlugResult>(
    functionsClient,
    "resolveTenantSlug",
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
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantSlug: string; receiptNo: string; phone: string },
    PublicRepairTrackResult
  >(functionsClient, "trackRepairJobPublic");
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

export type CustomerPortalHomeResult = {
  ok: true;
  customer: { id: string; code: string; name: string; type: string; phone: string; address: string };
  requests: Array<Record<string, any>>;
  jobs: Array<Record<string, any>>;
  replacements: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
};

export const customerPortalLoginCallable = async (input: {
  tenantSlug: string;
  customerCode: string;
  pin: string;
}): Promise<{ ok: true; sessionToken: string; expiresAtMs: number }> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<typeof input, { ok: true; sessionToken: string; expiresAtMs: number }>(
    functionsClient,
    'customerPortalLogin',
  );
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const getCustomerPortalHomeCallable = async (sessionToken: string): Promise<CustomerPortalHomeResult> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ sessionToken: string }, CustomerPortalHomeResult>(functionsClient, 'getCustomerPortalHome');
  try {
    return (await callable({ sessionToken })).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const lookupPortalProductCallable = async (input: { sessionToken: string; barcode: string }) => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<typeof input, { ok: true; product: { id: string; name: string; code: string; barcode: string } }>(
    functionsClient,
    'lookupPortalProduct',
  );
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const createCustomerServiceRequestCallable = async (input: {
  sessionToken: string;
  lines: Array<{ barcode: string; quantity: number; note?: string }>;
}) => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<typeof input, { ok: true; requestId: string; requestNo: string }>(
    functionsClient,
    'createCustomerServiceRequest',
  );
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const mutateRepairCustomerOpsCallable = async <T extends Record<string, unknown> = Record<string, unknown>>(
  input: Record<string, unknown>,
): Promise<T & { ok: true }> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<Record<string, unknown>, T & { ok: true }>(functionsClient, 'mutateRepairCustomerOps');
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type PublicRepairApprovalEstimate = {
  receiptNo: string;
  customerName: string;
  customerPhone: string;
  deviceBrand: string;
  deviceModel: string;
  deviceType: string;
  problemDescription: string;
  approvalStatus: string;
  laborCost: number;
  serviceOnlyCost: number;
  partsCost: number;
  productsCost: number;
  warrantyProductsCost?: number;
  billableProductsCost?: number;
  estimatedTotal: number;
  grossAmount: number;
  discountAmount: number;
  revision: number;
  authorizationNo: string;
  parts: Array<{
    partName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    inWarranty?: boolean;
    warrantyLabel?: string;
  }>;
  products: Array<{
    name: string;
    quantity: number;
    lineCost: number;
    inWarranty?: boolean;
    warrantyLabel?: string;
  }>;
};

export const getRepairApprovalPublicCallable = async (input: {
  tenantSlug: string;
  jobId: string;
  token: string;
}): Promise<{ ok: true; estimate: PublicRepairApprovalEstimate }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantSlug: string; jobId: string; token: string },
    { ok: true; estimate: PublicRepairApprovalEstimate }
  >(functionsClient, "getRepairApprovalPublic");
  try {
    const result = await callable({
      tenantSlug: input.tenantSlug.trim().toLowerCase(),
      jobId: input.jobId.trim(),
      token: input.token.trim(),
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const submitRepairApprovalPublicCallable = async (input: {
  tenantSlug: string;
  jobId: string;
  token: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<{ ok: true; status: string }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    {
      tenantSlug: string;
      jobId: string;
      token: string;
      decision: "approved" | "rejected";
      note?: string;
    },
    { ok: true; status: string }
  >(functionsClient, "submitRepairApprovalPublic");
  try {
    const result = await callable({
      tenantSlug: input.tenantSlug.trim().toLowerCase(),
      jobId: input.jobId.trim(),
      token: input.token.trim(),
      decision: input.decision,
      note: input.note?.trim(),
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const deliverRepairJobAndCollectCallable = async (input: {
  jobId: string;
  warranty?: string;
}): Promise<{
  ok: true;
  jobId: string;
  finalCost: number;
  collectedAmount: number;
  treasuryEntryCreated: boolean;
  deliveryAuthorizationNo?: string;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { jobId: string; warranty?: string },
    {
      ok: true;
      jobId: string;
      finalCost: number;
      collectedAmount: number;
      treasuryEntryCreated: boolean;
      deliveryAuthorizationNo?: string;
    }
  >(functionsClient, "deliverRepairJobAndCollect");
  try {
    const result = await callable({
      jobId: input.jobId.trim(),
      warranty: input.warranty,
    });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type MutateRepairPaymentInput = {
  operation:
    | "prepare"
    | "resolve_approval"
    | "request_credit"
    | "collect"
    | "collect_receivable"
    | "reverse_payment"
    | "deliver"
    | "request_customer_approval";
  jobId?: string;
  authorizationId?: string;
  approvalId?: string;
  paymentId?: string;
  requestId?: string;
  discountType?: "none" | "amount" | "percent";
  discountValue?: number;
  amount?: number;
  method?: "cash" | "card" | "bank_transfer";
  decision?: "approved" | "rejected";
  reason?: string;
  note?: string;
  warranty?: string;
};

export const mutateRepairPaymentCallable = async (
  input: MutateRepairPaymentInput,
): Promise<Record<string, unknown> & { ok: true }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    MutateRepairPaymentInput,
    Record<string, unknown> & { ok: true }
  >(functionsClient, "mutateRepairPayment");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type MutateRepairTreasuryInput = {
  operation:
    | "post_manual_entry"
    | "submit_settlement"
    | "approve_settlement"
    | "reject_settlement";
  requestId?: string;
  settlementId?: string;
  branchId?: string;
  fromBranchId?: string;
  entryType?: "INCOME" | "EXPENSE" | "TRANSFER_OUT" | "TRANSFER_IN";
  amount?: number;
  countedAmount?: number;
  expectedAmount?: number;
  note?: string;
  varianceReason?: string;
  reason?: string;
  rejectionReason?: string;
  paymentMethod?: "cash" | "card" | "bank_transfer";
  expenseType?: string;
};

export const mutateRepairTreasuryCallable = async (
  input: MutateRepairTreasuryInput,
): Promise<Record<string, unknown> & { ok: true; entryId?: string; journalEntryId?: string }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    MutateRepairTreasuryInput,
    Record<string, unknown> & { ok: true; entryId?: string; journalEntryId?: string }
  >(functionsClient, "mutateRepairTreasury");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const mutateRepairServiceCatalogCallable = async (
  input: {
    operation: "get" | "save";
    services?: Array<{ id: string; name: string; price: number; internalCost: number; enabled: boolean }>;
  },
): Promise<Record<string, unknown> & { ok: true }> => {
  if (!isConfigured || !functionsClient) throw new Error("Firebase not configured");
  const callable = httpsCallable<typeof input, Record<string, unknown> & { ok: true }>(
    functionsClient,
    "mutateRepairServiceCatalog",
  );
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type RepairPartsPricingUpdateInput = {
  materialId: string;
  code: string;
  current: { consumer: number; trader: number; cost: number };
  next: { consumer: number; trader: number; cost: number };
};

export const updateRepairPartsPricingCallable = async (
  updates: RepairPartsPricingUpdateInput[],
): Promise<{ ok: true; updatedCount: number }> => {
  if (!isConfigured || !functionsClient) throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { updates: RepairPartsPricingUpdateInput[] },
    { ok: true; updatedCount: number }
  >(functionsClient, "updateRepairPartsPricing");
  try {
    return (await callable({ updates })).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type MutateAccountingInput = Record<string, unknown> & {
  operation:
    | "seed_defaults"
    | "upsert_account"
    | "save_settings"
    | "upsert_cost_center"
    | "set_period"
    | "post_journal"
    | "reverse_journal"
    | "readiness"
    | "link_repair_branch"
    | "inventory_valuation";
};

export const mutateAccountingCallable = async (
  input: MutateAccountingInput,
): Promise<Record<string, unknown> & { ok: true }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    MutateAccountingInput,
    Record<string, unknown> & { ok: true }
  >(functionsClient, "mutateAccounting");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type RepairTechnicianOperationInput = {
  operation: "list" | "get" | "save" | "status" | "add_photo" | "catalog" | "claim_qr";
  jobId?: string;
  jobProducts?: Array<Record<string, unknown>>;
  isServiceOnly?: boolean;
  status?: string;
  reason?: string;
  reasonCode?: string;
  url?: string;
};

export const repairTechnicianOpsCallable = async (
  input: RepairTechnicianOperationInput,
): Promise<Record<string, unknown> & { ok: true }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    RepairTechnicianOperationInput,
    Record<string, unknown> & { ok: true }
  >(functionsClient, "repairTechnicianOps");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export type MutateRepairSalesInvoiceInput = {
  operation: "prepare" | "resolve_discount" | "post" | "cancel";
  id?: string;
  branchId?: string;
  repairJobId?: string;
  lines?: Array<{
    partId: string;
    quantity: number;
  }>;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  cancelReason?: string;
  discountType?: "none" | "amount" | "percent";
  discountValue?: number;
  approve?: boolean;
  rejectionReason?: string;
  paymentMethod?: "cash" | "card" | "bank_transfer" | "credit";
};

export type MutateSparePartsPurchaseInvoiceInput = {
  operation: "post";
  requestId: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  notes?: string;
  lines: Array<{ materialId: string; quantity: number; unitPrice: number }>;
};

export const mutateSparePartsPurchaseInvoiceCallable = async (
  input: MutateSparePartsPurchaseInvoiceInput,
): Promise<Record<string, unknown> & { ok: true; invoiceId?: string; invoiceNo?: string }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    MutateSparePartsPurchaseInvoiceInput,
    Record<string, unknown> & { ok: true; invoiceId?: string; invoiceNo?: string }
  >(functionsClient, "mutateSparePartsPurchaseInvoice");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const mutateRepairSalesInvoiceCallable = async (
  input: MutateRepairSalesInvoiceInput,
): Promise<{
  ok: true;
  operation: string;
  id: string;
  invoiceNo: string;
  total: number;
  revision: number;
  status?: string;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    MutateRepairSalesInvoiceInput,
    {
      ok: true;
      operation: string;
      id: string;
      invoiceNo: string;
      total: number;
      revision: number;
    }
  >(functionsClient, "mutateRepairSalesInvoice");
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const getCustomerFinancialAnalyticsCallable = async <T>(input: {
  customerId: string;
  from?: string;
  to?: string;
}): Promise<T> => {
  if (!isConfigured || !functionsClient) throw new Error("Firebase not configured");
  const callable = httpsCallable<typeof input, T>(functionsClient, "getCustomerFinancialAnalytics");
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const createInventoryCountSessionCallable = async (input: {
  warehouseId: string;
  warehouseName: string;
  note?: string;
  lines: Array<{ itemType: 'finished_good' | 'raw_material' | 'material' | 'semi_finished' | 'consumable' | 'packaging'; itemId: string; expectedQty: number; countedQty: number }>;
}): Promise<{ ok: true; id: string; importedRows: number; changedRows: number }> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<typeof input, { ok: true; id: string; importedRows: number; changedRows: number }>(
    functionsClient,
    'createInventoryCountSession',
  );
  try {
    return (await callable(input)).data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
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
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantId: string },
    TenantFirestoreFootprint
  >(functionsClient, "getTenantFirestoreFootprint");
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
    type: "full";
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
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantId: string },
    { backup: SuperAdminTenantBackupFile }
  >(functionsClient, "exportTenantBackup");
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
): Promise<{
  ok: boolean;
  deletedFirestoreDocs: number;
  deletedAuthUsers: number;
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantId: string; confirmPhrase: string },
    { ok: boolean; deletedFirestoreDocs: number; deletedAuthUsers: number }
  >(functionsClient, "adminDeleteTenantCascade");
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
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
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
  >(functionsClient, "deleteRepairBranchCascade");
  try {
    const result = await callable({ branchId: branchId.trim() });
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

/** Test-data wipe: purge repair jobs + related ops; keep branches/parts/customers/stock balances. */
export const purgeRepairOperationalDataCallable = async (input: {
  tenantId: string;
  confirmPhrase: string;
}): Promise<{
  ok: boolean;
  tenantId: string;
  deletedFirestoreDocs: number;
  deletedCounts: Record<string, number>;
  kept: string[];
}> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    { tenantId: string; confirmPhrase: string },
    {
      ok: boolean;
      tenantId: string;
      deletedFirestoreDocs: number;
      deletedCounts: Record<string, number>;
      kept: string[];
    }
  >(functionsClient, "purgeRepairOperationalData");
  try {
    const result = await callable({
      tenantId: String(input.tenantId || "").trim(),
      confirmPhrase: String(input.confirmPhrase || "").trim(),
    });
    return result.data;
  } catch (error: unknown) {
    throw normalizeCallableError(error);
  }
};

/** Super-admin: restore backup JSON via Admin SDK (bypasses client Firestore rules). */
export type ImportTenantBackupMode = "merge" | "replace" | "full_reset";

export const importTenantBackupCallable = async (
  backup: Record<string, unknown>,
  mode: ImportTenantBackupMode,
  tenantIdForHistory?: string,
): Promise<{ success: true; restored: number }> => {
  if (!isConfigured || !functionsClient)
    throw new Error("Firebase not configured");
  const callable = httpsCallable<
    {
      backup: Record<string, unknown>;
      mode: ImportTenantBackupMode;
      tenantIdForHistory?: string;
    },
    { success: true; restored: number }
  >(functionsClient, "importTenantBackup");
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
