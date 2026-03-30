/**
 * Tenant registry: slugs, active tenants, registration & super-admin approval.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import type { FirestoreTenant, PendingTenant, TenantSlugDoc } from '../types';
import { setCurrentTenant } from '../lib/currentTenant';
import { auth, db, isConfigured, resolveTenantSlugCallable } from './firebase';
import { roleService } from '../modules/system/services/roleService';

const TENANTS = 'tenants';
const TENANT_SLUGS = 'tenant_slugs';
const PENDING = 'pending_tenants';
const USERS = 'users';

const slugPattern = /^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/;

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Live input: lowercase, allowed chars only, collapse hyphens, trim edges. */
export function sanitizeTenantSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Client-side check aligned with `slugPattern` before Firebase — returns Arabic message or null. */
export function getTenantSlugValidationError(raw: string): string | null {
  const slug = normalizeSlug(sanitizeTenantSlugInput(raw));
  if (!slug) return 'يرجى إدخال معرّف للشركة في الرابط.';
  if (!slugPattern.test(slug)) {
    return 'معرّف الرابط غير صالح: أحرف إنجليزية صغيرة وأرقام وشرطات فقط، دون شرطة في البداية أو النهاية، وبطول مناسب.';
  }
  return null;
}

export const tenantService = {
  async resolveSlug(slug: string): Promise<{
    exists: boolean;
    tenantId?: string;
    status?: string;
    pendingRegistration?: boolean;
  }> {
    if (!isConfigured) return { exists: false };
    return resolveTenantSlugCallable(normalizeSlug(slug));
  },

  /** When authenticated: direct read (rules allow). */
  async getBySlugFirestore(slug: string): Promise<{ tenantId: string } | null> {
    if (!isConfigured) return null;
    const s = normalizeSlug(slug);
    const snap = await getDoc(doc(db, TENANT_SLUGS, s));
    if (!snap.exists()) return null;
    const data = snap.data() as TenantSlugDoc;
    if (!data?.tenantId) return null;
    return { tenantId: data.tenantId };
  },

  async getById(tenantId: string): Promise<(FirestoreTenant & { id: string }) | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, TENANTS, tenantId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as FirestoreTenant) };
  },

  /** Super-admin: all registered companies (requires `isSuperAdmin` in rules). */
  async listAllTenants(): Promise<(FirestoreTenant & { id: string })[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(collection(db, TENANTS));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as FirestoreTenant) }));
  },

  async create(input: {
    slug: string;
    name: string;
    phone?: string;
    address?: string;
    status?: FirestoreTenant['status'];
  }): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const slug = normalizeSlug(input.slug);
    if (!slugPattern.test(slug)) throw new Error('معرّف الشركة غير صالح');

    const tenantRef = doc(collection(db, TENANTS));
    const batch = writeBatch(db);
    batch.set(tenantRef, {
      slug,
      name: input.name,
      phone: input.phone ?? '',
      address: input.address ?? '',
      status: input.status ?? 'active',
      createdAt: serverTimestamp(),
    } as FirestoreTenant);
    batch.set(doc(db, TENANT_SLUGS, slug), { tenantId: tenantRef.id } as TenantSlugDoc);
    await batch.commit();
    return tenantRef.id;
  },

  async registerCompany(data: {
    slug: string;
    name: string;
    phone?: string;
    address?: string;
    adminEmail: string;
    adminDisplayName: string;
    password: string;
  }): Promise<void> {
    if (!isConfigured || !auth) throw new Error('Firebase not configured');
    const slug = normalizeSlug(data.slug);
    if (!slugPattern.test(slug)) throw new Error('معرّف الشركة غير صالح');

    const taken = await this.resolveSlug(slug);
    if (taken.exists) {
      throw new Error('معرّف الشركة مستخدم أو قيد المراجعة مسبقاً');
    }

    const cred = await createUserWithEmailAndPassword(auth, data.adminEmail, data.password);
    const uid = cred.user.uid;

    const pendingRef = doc(collection(db, PENDING));
    const userRef = doc(db, USERS, uid);
    const batch = writeBatch(db);
    batch.set(pendingRef, {
      slug,
      name: data.name,
      phone: data.phone ?? '',
      address: data.address ?? '',
      adminEmail: data.adminEmail,
      adminDisplayName: data.adminDisplayName,
      adminUid: uid,
      requestedAt: serverTimestamp(),
      status: 'pending',
    } satisfies Omit<PendingTenant, 'id'>);
    batch.set(userRef, {
      email: data.adminEmail,
      displayName: data.adminDisplayName,
      roleId: '',
      tenantId: pendingRef.id,
      isActive: false,
      createdBy: 'register_company',
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      try {
        await deleteUser(cred.user);
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }

    await cred.user.getIdToken(true);
  },

  async approveTenant(pendingTenantId: string, superAdminUid: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const pendingRef = doc(db, PENDING, pendingTenantId);
    const pendingSnap = await getDoc(pendingRef);
    if (!pendingSnap.exists()) throw new Error('طلب غير موجود');
    const p = pendingSnap.data() as PendingTenant;
    if (p.status !== 'pending') throw new Error('تمت معالجة هذا الطلب مسبقاً');

    const adminUid = String(p.adminUid || '').trim();
    if (!adminUid) throw new Error('لا يوجد مسؤول مرتبط بالطلب');

    const slug = normalizeSlug(p.slug);
    const slugDoc = await getDoc(doc(db, TENANT_SLUGS, slug));
    if (slugDoc.exists()) throw new Error('معرّف الشركة محجوز');

    const tenantRef = doc(collection(db, TENANTS));
    const newTenantId = tenantRef.id;

    const batch = writeBatch(db);
    batch.set(tenantRef, {
      slug,
      name: p.name,
      phone: p.phone ?? '',
      address: p.address ?? '',
      status: 'active',
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp(),
      approvedBy: superAdminUid,
    } as FirestoreTenant);
    batch.set(doc(db, TENANT_SLUGS, slug), { tenantId: newTenantId } as TenantSlugDoc);
    batch.update(pendingRef, { status: 'approved' });
    /* set+merge: works if admin user doc was missing (Auth-only after failed register) or exists */
    batch.set(
      doc(db, USERS, adminUid),
      {
        email: p.adminEmail,
        displayName: p.adminDisplayName,
        tenantId: newTenantId,
        isActive: true,
        roleId: '',
        createdBy: 'approve_tenant',
      },
      { merge: true },
    );
    await batch.commit();

    setCurrentTenant(newTenantId);
    await roleService.seedIfEmpty();
    const roles = await roleService.getAll();
    const adminRole = roles.find((r) => r.roleKey === 'admin') ?? roles[0];
    if (!adminRole?.id) throw new Error('فشل إنشاء الأدوار');

    await updateDoc(doc(db, USERS, adminUid), { roleId: adminRole.id });
  },

  async listPendingTenants(): Promise<(PendingTenant & { id: string })[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(
      query(collection(db, PENDING), where('status', '==', 'pending')),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PendingTenant) }));
  },
};
