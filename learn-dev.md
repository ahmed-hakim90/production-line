# 📘 شرح بناء النظام — دليل المطور

## الصورة الكبيرة

النظام عبارة عن **3 طبقات** فوق بعض:

```
┌─────────────────────────────────────────┐
│  1. الشاشات (Pages)  ← اللي المستخدم بيشوفه
├─────────────────────────────────────────┤
│  2. المتجر (Store)    ← المخ — بيدير كل حاجة
├─────────────────────────────────────────┤
│  3. الخدمات (Services) ← بتكلم Firebase
└─────────────────────────────────────────┘
```

كل واحدة مش بتعرف تفاصيل التانية. الشاشة مش بتكلم Firebase مباشرة — بتقول للـ Store "عايز أعمل كذا"، والـ Store بيكلم الـ Service.

---

## 1. المصادقة (Authentication) — إزاي المستخدم بيدخل؟

### المشكلة

عايز المستخدم يسجل بإيميل وباسورد، ولو مش مسجل ميشوفش أي حاجة.

### الحل — 3 ملفات

**الملف الأول: `services/firebase.ts`** — بيكلم Firebase Auth

```typescript
// دي functions جاهزة من Firebase — أنا بس بعمل wrapper ليها
export const signInWithEmail = async (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const createUserWithEmail = async (email, password) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signOut = async () => {
  await firebaseSignOut(auth);
};
```

ده مجرد "مترجم" بين التطبيق بتاعنا و Firebase. لو يوم قررت تغير Firebase بحاجة تانية، بتغير الملف ده بس.

**الملف التاني: `store/useAppStore.ts`** — المنطق

```typescript
login: async (email, password) => {
  // 1. سجل دخول في Firebase Auth
  const cred = await signInWithEmail(email, password);

  // 2. هات بيانات المستخدم من Firestore
  const userDoc = await userService.get(cred.user.uid);

  // 3. لو مفيش بيانات → ارفض
  if (!userDoc) { /* اعرض خطأ */ return; }

  // 4. لو الحساب معطل → ارفض
  if (!userDoc.isActive) { /* اعرض خطأ */ return; }

  // 5. حدد الدور والصلاحيات
  const role = roles.find(r => r.id === userDoc.roleId);
  set({ isAuthenticated: true, userPermissions: role.permissions });

  // 6. حمّل بيانات التطبيق
  await loadAppData();
}
```

لاحظ: Firebase Auth بيتعامل مع الإيميل والباسورد بس. بيانات المستخدم (الاسم، الدور، مفعل ولا لأ) في **Firestore collection** اسمها `users`.

**الملف التالت: `pages/Login.tsx`** — الشاشة

```typescript
const handleLogin = async (e) => {
  e.preventDefault();
  await login(email, password);  // ← بيستدعي الـ store action
};
```

الشاشة مش بتعرف أي تفاصيل — بتقول `login(email, password)` وخلاص. الـ Store بيعمل كل حاجة ورا الكواليس.

**الحماية — إزاي بمنع الدخول بدون تسجيل؟**

في `App.tsx`:

```typescript
<Route path="/*" element={
  !isAuthenticated ? <Navigate to="/login" /> : <Layout>...</Layout>
} />
```

يعني: لو `isAuthenticated = false` → روح صفحة Login. بس كده.

و `ProtectedRoute` بيعمل طبقة تانية:

```typescript
if (!isAuthenticated) return <Navigate to="/login" />;
if (!can(permission)) return <Navigate to="/" />;
return <>{children}</>;
```

لو مسجل بس مالوش صلاحية → يروح الـ Dashboard. لو مش مسجل أصلاً → يروح Login.

---

## 2. الصلاحيات (Permissions) — إزاي بتحكم مين يشوف إيه؟

### المشكلة

عندك 4 أنواع مستخدمين، كل واحد يشوف حاجات مختلفة ويعمل حاجات مختلفة.

### الحل — Permission Map

كل دور عبارة عن **object** فيه كل الصلاحيات:

```typescript
// دور المشرف — مثال من Firestore
{
  name: "مشرف",
  permissions: {
    "dashboard.view": true,
    "reports.view": true,
    "reports.create": true,
    "reports.edit": false,    // ← مش مسموح
    "reports.delete": false,  // ← مش مسموح
    "users.view": false,      // ← مش مسموح
    // ... باقي الصلاحيات
  }
}
```

لما المستخدم يسجل دخول، الـ Store بيحط الـ `permissions` في الـ state:

```typescript
set({ userPermissions: role.permissions });
```

**الـ Hook — `usePermission()`**

```typescript
export function usePermission() {
  const permissions = useAppStore(s => s.userPermissions);

  const can = (permission) => permissions[permission] === true;

  return {
    can,                                          // can('reports.edit')
    canCreateReport: can('reports.create'),        // true/false
    canEditReport: can('reports.edit'),
    canDeleteReport: can('reports.delete'),
    canManageUsers: can('users.create') || can('users.edit'),
  };
}
```

**الاستخدام في أي صفحة:**

```typescript
const { canCreateReport, canEditReport } = usePermission();

// الزرار بيظهر بس لو عنده الصلاحية
{canCreateReport && <Button>إنشاء تقرير</Button>}
{canEditReport && <Button>تعديل</Button>}
```

**ليه كده؟** عشان مفيش permission check جوه JSX مباشرة. مفيش:

```typescript
// ❌ ده غلط — منطق مباشر في الواجهة
{userPermissions['reports.create'] === true && <Button>...</Button>}

// ✅ ده صح — اسم واضح ومركزي
{canCreateReport && <Button>...</Button>}
```

نضيف وواضح. ولو عايز تغير شرط الصلاحية بتغيره في مكان واحد.

---

## 3. الـ Store (Zustand) — المخ

### المشكلة

كل الصفحات محتاجة نفس البيانات (المنتجات، الخطوط، المستخدمين). ومحتاج مكان مركزي يدير المصادقة والصلاحيات.

### الحل — Store واحد فيه كل حاجة

```typescript
const useAppStore = create((set, get) => ({
  // ── البيانات ──
  products: [],
  productionLines: [],
  supervisors: [],

  // ── حالة المستخدم ──
  isAuthenticated: false,
  uid: null,
  userPermissions: {},

  // ── الأوامر (Actions) ──
  login: async (email, password) => { ... },
  logout: async () => { ... },
  createReport: async (data) => { ... },
}));
```

**إزاي الـ Store بيشتغل؟**

```
[صفحة] → تستدعي action → [Store] → يستدعي service → [Firebase]
                                ↓
                          يحدّث الـ state
                                ↓
                    [كل الصفحات] تتحدث تلقائياً
```

**مثال: لما المشرف ينشئ تقرير**

```typescript
createReport: async (data) => {
  // 1. احفظ في Firebase
  const id = await reportService.create(data);

  // 2. حدّث البيانات المحلية
  const [todayReports, monthlyReports] = await Promise.all([...]);
  set({ todayReports, monthlyReports });

  // 3. أعد حساب بيانات العرض
  get()._rebuildProducts();
  get()._rebuildLines();

  // 4. سجّل في Activity Log (تلقائي)
  get()._logActivity('CREATE_REPORT', 'إنشاء تقرير إنتاج جديد');

  return id;
}
```

لاحظ: **الـ Activity Log تلقائي** — الصفحة بتقول `createReport(data)` بس، والـ Store بيسجل النشاط لوحده.

### `set` و `get` — أهم حاجتين في Zustand

```typescript
set({ products: [...] })   // ← غيّر البيانات → كل الصفحات تتحدث
get().userEmail            // ← اقرأ البيانات الحالية جوه action
```

---

## 4. الخدمات (Services) — الطبقة اللي بتكلم Firebase

### المشكلة

مش عايز كل ملف يكتب كود Firebase من الأول. عايز مكان مركزي لكل collection.

### الحل — Service لكل collection

```typescript
// services/userService.ts
export const userService = {
  async get(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async getAll() {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async set(uid, data) {
    await setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() });
  },

  async toggleActive(uid, isActive) {
    await updateDoc(doc(db, 'users', uid), { isActive });
  },
};
```

**كل service نفس الشكل:** `get`, `getAll`, `create`, `update`, `delete`.

ده بيخلي الكود متوقع وسهل الصيانة — أي حد يفتح أي service يعرف يقرأها فوراً.

---

## 5. Activity Log — إزاي بيسجل تلقائي؟

### المشكلة

عايز كل عملية تتسجل بدون ما الصفحات تعمل أي حاجة إضافية.

### الحل — helper في الـ Store

```typescript
// في Store — internal helper
_logActivity: (action, description, metadata) => {
  const { uid, userEmail } = get();
  if (uid && userEmail) {
    activityLogService.log(uid, userEmail, action, description, metadata);
  }
},
```

وبستخدمه جوه كل action:

```typescript
createReport: async (data) => {
  const id = await reportService.create(data);
  get()._logActivity('CREATE_REPORT', 'إنشاء تقرير جديد', { reportId: id });
},

deleteReport: async (id) => {
  await reportService.delete(id);
  get()._logActivity('DELETE_REPORT', 'حذف تقرير', { reportId: id });
},

login: async (email, password) => {
  // بعد نجاح الدخول
  activityLogService.log(uid, email, 'LOGIN', 'تسجيل دخول');
},
```

**الصفحة مش بتعمل أي logging** — كل حاجة في الـ Store.

### صفحة عرض السجل — مع Pagination

```typescript
// services/activityLogService.ts
async getPaginated(pageSize, cursor?) {
  let q = query(
    collection(db, 'activity_logs'),
    orderBy('timestamp', 'desc'),
    firestoreLimit(pageSize + 1),  // واحد زيادة عشان أعرف لو في صفحة تانية
  );

  if (cursor) {
    q = query(..., startAfter(cursor), ...);  // ابدأ بعد آخر عنصر
  }

  const docs = await getDocs(q);
  const hasMore = docs.length > pageSize;  // لو جاب أكتر = في صفحة تانية
  return { logs, lastDoc, hasMore };
}
```

الـ `cursor` هو آخر document — Firestore بيستخدمه عشان يعرف يبدأ الصفحة الجاية منين.

---

## 6. Firestore Rules — الحماية من السيرفر

### المشكلة

الصلاحيات في الـ Frontend ممكن تتخطى (أي حد يفتح Console ويبعت requests). محتاج حماية من جهة Firebase نفسه.

### الحل — Rules بتعكس نفس المنطق

```javascript
function hasPermission(perm) {
  // 1. المستخدم مسجل دخول؟
  // 2. حسابه مفعل؟
  // 3. دوره فيه الصلاحية دي؟
  return isActiveUser() && getRoleDoc().permissions[perm] == true;
}

match /production_reports/{docId} {
  allow read: if isActiveUser();
  allow create: if hasPermission('reports.create');
  allow update: if hasPermission('reports.edit');
  allow delete: if isAdmin();  // المدير بس يقدر يحذف
}
```

يعني حتى لو حد فتح Browser Console وحاول يحذف تقرير — Firebase هيرفض.

**مشكلة الـ Bootstrap:** أول مستخدم مالوش user doc في Firestore — إزاي هيقرأ الـ roles؟

```javascript
function isBootstrap() {
  return isAuthenticated() && !userDocExists();
}

match /roles/{roleId} {
  allow read: if isAuthenticated();           // أي مسجل يقرأ
  allow create: if isAdmin() || isBootstrap();  // أول مرة مسموح
}
```

### الحماية مزدوجة — ليه؟

```
Frontend:  { canDeleteReport && <Button>حذف</Button> }    ← إخفاء الزرار
Backend:   allow delete: if isAdmin();                     ← رفض الطلب
```

الأولى عشان تجربة المستخدم (مش يشوف حاجة مش من حقه).
التانية عشان الأمان الحقيقي (حتى لو تخطى الأولى).

---

## 7. الربط بين فريق العمل والحسابات

### المشكلة

عندك `supervisors` collection (فريق العمل) و `users` collection (حسابات الدخول). هما نفس الناس!

### الحل — ربط بحقل `userId`

```typescript
// في مستند supervisor في Firestore
{
  name: "أحمد محمد",
  role: "supervisor",
  isActive: true,
  userId: "abc123...",        // ← ده Firebase Auth UID
  email: "ahmed@company.com"
}
```

في صفحة فريق العمل، بجيب الاتنين وبربطهم:

```typescript
// 1. أجيب كل الـ users
const allUsers = await userService.getAll();
const usersMap = {};
allUsers.forEach(u => { usersMap[u.id] = u; });

// 2. لكل supervisor → دوّر على الـ user المرتبط بيه
supervisors.forEach(sup => {
  const raw = rawSupervisors.find(s => s.id === sup.id);
  if (raw?.userId && usersMap[raw.userId]) {
    supervisorUserMap[sup.id] = usersMap[raw.userId];  // لقيته!
  }
});
```

كده كل كارت في صفحة فريق العمل بيعرف:

- هل الشخص ده عنده حساب دخول ولا لأ
- إيه الإيميل بتاعه
- إيه دوره في النظام
- يقدر يعرض "إنشاء حساب" لو مالوش

---

## 8. إنشاء حساب لمستخدم موجود — المشكلة والحل

### المشكلة

Firebase Auth Client SDK لما بتعمل `createUserWithEmailAndPassword` بيسجل دخولك كالمستخدم الجديد! يعني المدير بيتسجل خروج!

### الحل — Re-auth

```typescript
const handleCreateAccount = async () => {
  // 1. أنشئ حساب (ده بيسجل دخول كالمستخدم الجديد)
  const newUid = await createUser(email, password, name, roleId);

  // 2. اربط الـ supervisor بالحساب الجديد
  await supervisorService.update(supervisorId, { userId: newUid, email });

  // 3. اطلب من المدير يدخل باسورده تاني
  setShowReAuth(true);
};

const handleReAuth = async () => {
  await login(currentEmail, reAuthPassword);  // المدير يرجع يسجل دخول
};
```

ده limitation في Firebase Client SDK. الحل البديل هو استخدام Firebase Admin SDK (سيرفر) — لكن في تطبيق client-only ده أبسط حل.

---

## 9. Types — ليه TypeScript؟

### المشكلة

بدون types، ممكن تبعت `supervisorId` مكان `productId` ومتعرفش غير لما التطبيق يقع.

### الحل — interface لكل حاجة

```typescript
// ده شكل المستند في Firestore
export interface FirestoreUser {
  id?: string;
  email: string;
  displayName: string;
  roleId: string;
  isActive: boolean;
  createdAt?: any;
  createdBy?: string;
}

// ده شكل التقرير
export interface ProductionReport {
  id?: string;
  supervisorId: string;
  productId: string;
  lineId: string;
  date: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
}
```

الفايدة:

```typescript
// TypeScript هيقولك إن في غلط قبل ما تشغل التطبيق
const report: ProductionReport = {
  supervisorId: 123,  // ❌ Error: number مش string
  date: new Date(),   // ❌ Error: Date مش string
};
```

---

## 10. التصدير والمشاركة — إزاي بتطبع وتبعت واتساب؟

### html2canvas — تحويل HTML لصورة

```typescript
import html2canvas from 'html2canvas';

const handleExportImage = async () => {
  // 1. حوّل الـ div لـ canvas (صورة)
  const canvas = await html2canvas(reportRef.current, {
    scale: 2,               // جودة عالية
    backgroundColor: '#fff', // خلفية بيضا
  });

  // 2. حوّل الـ canvas لـ URL
  const url = canvas.toDataURL('image/png');

  // 3. حمّل كملف
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report.png';
  a.click();
};
```

### مشاركة واتساب — Web Share API

```typescript
const handleShareWhatsApp = async () => {
  const canvas = await html2canvas(element);

  // لو الجهاز يدعم Web Share (موبايل غالباً)
  if (navigator.share && navigator.canShare) {
    const blob = await canvas.toBlob(...);
    const file = new File([blob], 'report.png', { type: 'image/png' });
    await navigator.share({ title: 'تقرير', files: [file] });
    return;
  }

  // Fallback: حمّل الصورة + افتح واتساب
  downloadImage(canvas);
  window.open('https://wa.me/?text=تقرير إنتاج', '_blank');
};
```

---

## ملخص — القواعد اللي مشيت عليها

| القاعدة | التطبيق |
|---------|---------|
| الشاشة مش بتكلم Firebase مباشرة | كل حاجة عن طريق الـ Store |
| مفيش permission check في JSX | استخدم `canCreateReport` مش `permissions['reports.create']` |
| الـ Activity Log تلقائي | الـ Store بيسجل — مش الصفحة |
| كل collection ليها service | `userService`, `reportService`, ... |
| الحماية مزدوجة | Frontend (hide UI) + Backend (Firestore Rules) |
| مفيش logic مكرر | permission check في مكان واحد (`usePermission`) |
| TypeScript لكل حاجة | interfaces واضحة لكل document |
| الشاشة بسيطة | بتستدعي action واحد — الـ Store بيعمل الباقي |

---

## تدفق العمليات — من أول ما المستخدم يفتح التطبيق

```
1. يفتح التطبيق
   ↓
2. App.tsx → onAuthChange → في مستخدم مسجل؟
   ↓ لأ                    ↓ أيوه
3. يروح /login             4. initializeApp()
   ↓                          ↓
5. يدخل إيميل + باسورد     6. هات user doc → check isActive → resolve role
   ↓                          ↓
7. login() في Store         8. loadAppData() → products, lines, reports...
   ↓                          ↓
8. نفس الخطوة 6             9. Dashboard يظهر بالبيانات
```

```
لما المشرف ينشئ تقرير:
1. الصفحة: createReport(data)
2. Store: reportService.create(data) → Firebase
3. Store: refresh today + monthly reports
4. Store: rebuild products + lines (حسابات)
5. Store: _logActivity('CREATE_REPORT', ...)
6. كل الصفحات تتحدث تلقائي (Zustand reactivity)
```

---

## أهم نصيحة

**لو عايز تضيف feature جديدة:**

1. **أضف الـ type** في `types.ts`
2. **أضف الـ service** في `services/`
3. **أضف الـ action** في `store/useAppStore.ts`
4. **أضف الـ permission** في `utils/permissions.ts`
5. **أضف الصفحة** في `pages/`
6. **أضف الـ route** في `App.tsx`
7. **أضف الـ sidebar item** في `permissions.ts` → `SIDEBAR_ITEMS`
8. **حدّث الـ Firestore Rules** في `firestore.rules`

دايماً نفس الترتيب. دايماً نفس البنية. ده اللي بيخلي المشروع يكبر من غير ما يبقى فوضى.

> **عايز تشوف مثال عملي على إضافة موديول جديد وربطه بالإنتاج؟** شوف ملف `add_module.md`
