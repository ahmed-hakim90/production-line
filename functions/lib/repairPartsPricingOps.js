import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './adminApp.js';
import { normalizeRepairSalePrice } from './repairSalePrice.js';
const db = getDb();
const MAX_UPDATES_PER_REQUEST = 200;
const MAX_PRICE = 1_000_000_000;
const ALLOWED_UPDATE_KEYS = new Set(['materialId', 'code', 'current', 'next']);
const ALLOWED_PRICE_KEYS = new Set(['consumer', 'trader', 'cost']);
const loadActor = async (request) => {
    const uid = String(request.auth?.uid || '').trim();
    if (!uid)
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists || userSnap.data()?.isActive === false) {
        throw new HttpsError('permission-denied', 'الحساب غير صالح أو غير نشط.');
    }
    const user = userSnap.data();
    const tenantId = String(user.tenantId || '').trim();
    if (!tenantId)
        throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
    let permissions = {};
    const roleId = String(user.roleId || '').trim();
    if (roleId) {
        const roleSnap = await db.collection('roles').doc(roleId).get();
        if (!roleSnap.exists || String(roleSnap.data()?.tenantId || '') !== tenantId) {
            throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
        }
        permissions = (roleSnap.data()?.permissions || {});
    }
    return {
        uid,
        tenantId,
        displayName: String(user.displayName || user.name || user.email || uid),
        isSuperAdmin: user.isSuperAdmin === true,
        permissions,
    };
};
const strictPriceValues = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpsError('invalid-argument', `${label} غير صالح.`);
    }
    const raw = value;
    if (Object.keys(raw).some((key) => !ALLOWED_PRICE_KEYS.has(key))) {
        throw new HttpsError('invalid-argument', `${label} يحتوي على حقول غير مسموحة.`);
    }
    const parse = (key) => {
        if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || Number(raw[key]) < 0) {
            throw new HttpsError('invalid-argument', `${label} يحتوي على سعر غير صالح.`);
        }
        const normalized = normalizeRepairSalePrice(raw[key]);
        if (normalized > MAX_PRICE) {
            throw new HttpsError('invalid-argument', `${label} يحتوي على سعر يتجاوز الحد المسموح.`);
        }
        return normalized;
    };
    return { consumer: parse('consumer'), trader: parse('trader'), cost: parse('cost') };
};
export const normalizeRepairPartsPricingUpdates = (value) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_UPDATES_PER_REQUEST) {
        throw new HttpsError('invalid-argument', `يجب إرسال من 1 إلى ${MAX_UPDATES_PER_REQUEST} تحديث في الطلب الواحد.`);
    }
    const seen = new Set();
    return value.map((rawValue) => {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
            throw new HttpsError('invalid-argument', 'بيانات تحديث التسعير غير صالحة.');
        }
        const raw = rawValue;
        if (Object.keys(raw).some((key) => !ALLOWED_UPDATE_KEYS.has(key))) {
            throw new HttpsError('invalid-argument', 'تحديث التسعير يحتوي على حقول غير مسموحة.');
        }
        const materialId = String(raw.materialId || '').trim();
        const code = String(raw.code || '').trim().toUpperCase();
        if (!materialId || materialId.length > 200 || materialId.includes('/') || !code || code.length > 100) {
            throw new HttpsError('invalid-argument', 'معرف المادة أو الكود غير صالح.');
        }
        if (seen.has(materialId)) {
            throw new HttpsError('invalid-argument', 'لا يمكن تكرار المادة في نفس طلب التسعير.');
        }
        seen.add(materialId);
        return {
            materialId,
            code,
            current: strictPriceValues(raw.current, 'الأسعار الحالية'),
            next: strictPriceValues(raw.next, 'الأسعار الجديدة'),
        };
    });
};
const pricesFromMaterial = (material) => ({
    consumer: normalizeRepairSalePrice(material.defaultSalePrice),
    trader: normalizeRepairSalePrice(material.traderSalePrice),
    cost: normalizeRepairSalePrice(material.purchaseCost),
});
const samePrices = (left, right) => (left.consumer === right.consumer
    && left.trader === right.trader
    && left.cost === right.cost);
export const canManageRepairPartsPricing = (actor) => actor.isSuperAdmin || actor.permissions['repair.pricing.manage'] === true;
export const validateRepairPartsPricingMaterial = (material, update, tenantId) => {
    if (String(material.tenantId || '').trim() !== tenantId) {
        throw new HttpsError('permission-denied', 'لا يمكن تحديث مواد شركة أخرى.');
    }
    const storedCode = String(material.code || '').trim().toUpperCase();
    if (storedCode !== update.code
        || !storedCode
        || material.type !== 'raw_material'
        || material.isActive === false
        || material.availableForSpareParts === false) {
        throw new HttpsError('failed-precondition', `المادة ${update.code} غير صالحة لشاشة تسعير قطع الغيار.`);
    }
    const storedPrices = pricesFromMaterial(material);
    if (!samePrices(storedPrices, update.current)) {
        throw new HttpsError('failed-precondition', `تم تعديل أسعار ${update.code} بعد تحميل الملف. حدّث الصفحة وأعد المحاولة.`);
    }
    return storedPrices;
};
export const updateRepairPartsPricingHandler = async (request) => {
    const actor = await loadActor(request);
    if (!canManageRepairPartsPricing(actor)) {
        throw new HttpsError('permission-denied', 'ليس لديك صلاحية تسعير قطع الغيار.');
    }
    const data = request.data && typeof request.data === 'object'
        ? request.data
        : {};
    if (Object.keys(data).some((key) => key !== 'updates')) {
        throw new HttpsError('invalid-argument', 'الطلب يحتوي على حقول غير مسموحة.');
    }
    const updates = normalizeRepairPartsPricingUpdates(data.updates);
    const updatedCount = await db.runTransaction(async (tx) => {
        const refs = updates.map((update) => db.collection('materials').doc(update.materialId));
        const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
        const validated = snapshots.map((snapshot, index) => {
            const update = updates[index];
            if (!snapshot.exists)
                throw new HttpsError('not-found', `المادة ${update.code} غير موجودة.`);
            const material = snapshot.data();
            const storedPrices = validateRepairPartsPricingMaterial(material, update, actor.tenantId);
            return { update, storedPrices };
        });
        let changed = 0;
        validated.forEach(({ update, storedPrices }, index) => {
            if (samePrices(storedPrices, update.next))
                return;
            changed += 1;
            const materialRef = refs[index];
            tx.update(materialRef, {
                defaultSalePrice: update.next.consumer,
                traderSalePrice: update.next.trader,
                purchaseCost: update.next.cost,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: actor.uid,
            });
            const auditRef = db.collection('repair_parts_pricing_audit').doc();
            tx.set(auditRef, {
                tenantId: actor.tenantId,
                materialId: update.materialId,
                materialCode: update.code,
                previousPrices: storedPrices,
                nextPrices: update.next,
                actorId: actor.uid,
                actorName: actor.displayName,
                createdAt: FieldValue.serverTimestamp(),
            });
        });
        return changed;
    });
    return { ok: true, updatedCount };
};
