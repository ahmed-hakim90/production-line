# 🏭 HAKIMO — نظام إدارة الإنتاج

نظام ERP داخلي لإدارة وتتبع خطوط الإنتاج، تقارير التشغيل، المستخدمين والصلاحيات، وتحليل الأداء.

تم تطويره باستخدام **React 19 + Firebase + Zustand** مع نظام مصادقة وصلاحيات ديناميكي.

---
![React](https://img.shields.io/badge/React-19-blue)
![Firebase](https://img.shields.io/badge/Firebase-12-orange)
![Zustand](https://img.shields.io/badge/Zustand-5-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Version](https://img.shields.io/badge/version-4.0.99-green)

## 🚀 نظرة عامة

| الميزة | الوصف |
|--------|-------|
| المصادقة | تسجيل دخول بالبريد الإلكتروني وكلمة المرور (Firebase Auth) |
| الصلاحيات | نظام RBAC ديناميكي — 4 أدوار افتراضية + أدوار مخصصة |
| المستخدمون | صفحة `/system/users` لإدارة المستخدمين (إنشاء/ربط موظف/تعطيل/حذف نهائي/استيراد/تصدير) |
| خطوط الإنتاج | إدارة ومتابعة 16+ خط إنتاج مع حالة لحظية |
| المنتجات | إدارة المنتجات مع المخزون والرصيد الافتتاحي |
| التقارير | تسجيل تقارير إنتاج يومية + طباعة + تصدير + مشاركة |
| الإدخال السريع | فورم سريع للمشرفين: إدخال → حفظ → طباعة → واتساب |
| سجل النشاط | تسجيل تلقائي لكل العمليات (دخول، إنشاء، تعديل، حذف) |
| Dashboard | لوحة تحكم تحليلية مع KPIs ورسوم بيانية لحظية |
| الموارد البشرية | حضور، إجازات، سُلف، رواتب، هيكل تنظيمي |
| محرك الموافقات | سلسلة موافقات مؤسسية + تفويض + تصعيد تلقائي |
| الطباعة | طباعة مباشرة + PDF + صورة + مشاركة واتساب |

---

## 🔐 نظام المصادقة (Authentication)

### تسجيل الدخول
- **البريد الإلكتروني + كلمة المرور** عبر Firebase Auth
- حماية كل الصفحات — redirect تلقائي لـ `/login` لغير المسجلين
- التحقق من حالة الحساب (`isActive`) — الحسابات المعطلة لا يمكنها الدخول
- جلسة مستمرة (persistent session) — لا حاجة لإعادة الدخول بعد إغلاق المتصفح

### إنشاء حساب
- صفحة Login فيها **"إنشاء حساب جديد"** — متاح لأي شخص
- الحساب الجديد يحصل على دور **"مشرف"** (أقل صلاحيات) تلقائياً
- المدير يغير الدور من صفحة "فريق العمل" بعد ذلك
- الحقول المطلوبة: الاسم الكامل + البريد الإلكتروني + كلمة المرور

### إدارة الحسابات (للمدير)
- إنشاء حسابات دخول لأعضاء فريق العمل من صفحة "فريق العمل"
- تفعيل / تعطيل الحسابات
- إعادة تعيين كلمة المرور عبر البريد
- تغيير الدور والصلاحيات

### التوجيه بعد تسجيل الدخول
- التطبيق يحفظ المسار المطلوب قبل تسجيل الدخول تلقائيًا
- بعد نجاح تسجيل الدخول يتم إعادة التوجيه لنفس الصفحة (إن كانت صالحة)
- في حالة عدم وجود مسار محفوظ يتم التحويل لصفحة البداية المناسبة حسب الدور

---

## 👥 نظام الأدوار والصلاحيات (RBAC)

النظام يستخدم **صلاحيات ديناميكية** مخزنة في Firestore — يمكن إنشاء أدوار مخصصة وتعديل صلاحياتها من لوحة التحكم.

### الأدوار الافتراضية

#### 1. مشرف (Supervisor)
- عرض لوحة التحكم
- إنشاء تقارير إنتاج
- استخدام الإدخال السريع
- طباعة وتصدير

#### 2. مشرف صالة (Hall Supervisor)
- كل صلاحيات المشرف
- تعديل التقارير
- تعديل حالة الخطوط
- عرض جميع الصفحات

#### 3. مسؤول مصنع (Factory Manager) — قراءة فقط
- عرض جميع الصفحات
- طباعة وتصدير
- لا يمكنه إنشاء أو تعديل أو حذف أي بيانات

#### 4. مدير النظام (Admin) — كامل الصلاحيات
- كل الصلاحيات بدون استثناء
- إدارة المستخدمين (إنشاء / تعطيل / تغيير أدوار)
- إدارة الأدوار والصلاحيات
- حذف التقارير
- عرض سجل النشاط

### جدول الصلاحيات التفصيلي

| الصلاحية | مشرف | مشرف صالة | مسؤول مصنع | مدير النظام |
|----------|:----:|:---------:|:----------:|:-----------:|
| عرض لوحة التحكم | ✅ | ✅ | ✅ | ✅ |
| عرض المنتجات | ❌ | ✅ | ✅ | ✅ |
| عرض خطوط الإنتاج | ❌ | ✅ | ✅ | ✅ |
| عرض فريق العمل | ❌ | ✅ | ✅ | ✅ |
| إنشاء تقرير | ✅ | ✅ | ❌ | ✅ |
| تعديل تقرير | ❌ | ✅ | ❌ | ✅ |
| حذف تقرير | ❌ | ❌ | ❌ | ✅ |
| الإدخال السريع | ✅ | ✅ | ❌ | ✅ |
| إدارة المستخدمين | ❌ | ❌ | ❌ | ✅ |
| إدارة الأدوار | ❌ | ❌ | ❌ | ✅ |
| سجل النشاط | ❌ | ❌ | ❌ | ✅ |
| طباعة | ✅ | ✅ | ✅ | ✅ |
| تصدير | ✅ | ✅ | ✅ | ✅ |

### نظام Permission Guards

```typescript
const { can, canCreateReport, canEditReport, canDeleteReport, canManageUsers } = usePermission();

// في الكومبوننت:
{canCreateReport && <Button>إنشاء تقرير</Button>}
{canManageUsers && <Button>إدارة المستخدمين</Button>}
{can('reports.view') && <Link to="/reports">التقارير</Link>}
```

كل الصلاحيات الموجودة في النظام:

| المجموعة | الصلاحيات |
|----------|----------|
| لوحة التحكم | `dashboard.view` |
| المنتجات | `products.view` · `products.create` · `products.edit` · `products.delete` |
| خطوط الإنتاج | `lines.view` · `lines.create` · `lines.edit` · `lines.delete` |
| الموظفين | `employees.view` · `employees.create` · `employees.edit` · `employees.delete` |
| التقارير | `reports.view` · `reports.create` · `reports.edit` · `reports.delete` |
| حالة الخطوط | `lineStatus.view` · `lineStatus.edit` |
| إعدادات المنتج-الخط | `lineProductConfig.view` |
| الإعدادات | `settings.view` · `settings.edit` |
| إدارة الأدوار | `roles.view` · `roles.manage` |
| إدارة المستخدمين | `users.manage` |
| سجل النشاط | `activityLog.view` |
| الإدخال السريع | `quickAction.view` |
| خاص | `print` · `export` |

---

## 📜 سجل النشاط (Activity Log)

يسجل النظام تلقائياً كل العمليات:

| الحدث | الوصف |
|-------|-------|
| `LOGIN` | تسجيل دخول مستخدم |
| `LOGOUT` | تسجيل خروج |
| `CREATE_REPORT` | إنشاء تقرير إنتاج جديد |
| `UPDATE_REPORT` | تعديل تقرير إنتاج |
| `DELETE_REPORT` | حذف تقرير إنتاج |
| `CREATE_USER` | إنشاء حساب مستخدم جديد |
| `UPDATE_USER_ROLE` | تغيير دور مستخدم |
| `TOGGLE_USER_ACTIVE` | تفعيل / تعطيل حساب مستخدم |

- التسجيل تلقائي بالكامل من الـ Store — لا حاجة لاستدعاء يدوي
- صفحة `/activity-log` (للمدير فقط) مع **pagination**
- كل سجل يحتوي: المستخدم، البريد، نوع العملية، الوصف، التوقيت، بيانات إضافية

---

## ⚡ صفحة الإدخال السريع (Quick Action)

صفحة مخصصة للمشرفين لإدخال بيانات الإنتاج بسرعة:

**الحقول:**
- خط الإنتاج
- المنتج
- الكمية المنتجة
- الهالك
- عدد العمال
- ساعات العمل

**الأزرار بعد الحفظ:**
- 🖨️ **طباعة** — فتح نافذة طباعة
- 🖼️ **تصدير كصورة** — تحميل PNG باستخدام `html2canvas`
- 📱 **مشاركة عبر WhatsApp** — Web Share API أو تحميل + فتح واتساب
- ➕ **تقرير جديد** — مسح الفورم والبدء من جديد

---

## 🗂️ هيكل المشروع

```
├── App.tsx                         # تجميع routes + auth gate + layout mounting
├── components/
│   ├── Layout.tsx                  # App shell (sidebar + topbar + footer)
│   └── ProtectedRoute.tsx          # Guard للصلاحيات على مستوى الـ route
│
├── modules/
│   ├── auth/                       # login / setup / pending + auth services
│   ├── dashboards/                 # admin/factory/employee dashboards
│   ├── production/                 # products, lines, work orders, scanner, plans
│   ├── quality/                    # inspections, CAPA, rework, quality reports
│   ├── hr/                         # employees, attendance, payroll, approvals
│   ├── costs/                      # cost centers, allocations, monthly costs
│   ├── system/                     # roles, activity log, system settings
│   └── shared/                     # shared UI/hooks/routes/types بين الوحدات
│
├── services/                       # خدمات cross-module (firebase, users, logs...)
├── shared/events/                  # event bus + system events + listeners
├── store/useAppStore.ts            # Zustand store (auth + RBAC + orchestration)
├── utils/                          # calculations + permissions + export helpers
├── types.ts                        # domain & firestore types
├── firestore.rules                 # Firestore security rules
├── storage.rules                   # Storage security rules
└── scripts/                        # automation scripts (version/changelog)
```

---

## 🧭 نظام المسارات (Modular Routing)

يتم تعريف المسارات داخل كل Module في ملف `routes/index.ts` ثم تجميعها مركزيًا في `App.tsx`:

- `AUTH_PUBLIC_ROUTES` للمسارات العامة (`/login`, `/setup`, `/pending`)
- `DASHBOARD_ROUTES`, `PRODUCTION_ROUTES`, `QUALITY_ROUTES`, `HR_ROUTES`, `COST_ROUTES`, `SYSTEM_ROUTES`
- كل مسار محمي بصلاحية محددة عبر `ProtectedRoute`
- صفحة الجذر `/` تعيد التوجيه تلقائيًا لواجهة البداية المناسبة حسب صلاحيات المستخدم

هذا الأسلوب يسهل إضافة وحدة جديدة بدون تعديل كبير في هيكل التطبيق.

---

## 🔥 Firestore Collections

| Collection | الوصف | الحقول الرئيسية |
|------------|-------|----------------|
| `roles` | تعريف الأدوار والصلاحيات | `name`, `color`, `permissions` |
| `users` | بيانات المستخدمين (مرتبط بـ Firebase Auth) | `email`, `displayName`, `roleId`, `isActive`, `createdAt` |
| `products` | المنتجات | `name`, `model`, `code`, `openingBalance` |
| `production_lines` | خطوط الإنتاج | `name`, `dailyWorkingHours`, `maxWorkers`, `status` |
| `employees` | الموظفين | `name`, `departmentId`, `jobPositionId`, `isActive`, `baseSalary` |
| `production_reports` | تقارير الإنتاج | `date`, `lineId`, `productId`, `employeeId`, `quantities...` |
| `line_status` | حالة الخطوط (لحظي) | `lineId`, `currentProductId`, `targetTodayQty` |
| `line_product_config` | إعدادات زمن التجميع | `lineId`, `productId`, `standardAssemblyTime` |
| `activity_logs` | سجل النشاط | `userId`, `userEmail`, `action`, `description`, `timestamp` |

---

## 🛡️ Firestore Security Rules

```
✅ isAuthenticated()     — أي مستخدم مسجل دخول
✅ isActiveUser()        — مستخدم مسجل + حسابه مفعل
✅ hasPermission(perm)   — مستخدم مفعل + لديه صلاحية محددة
✅ isAdmin()             — مستخدم لديه صلاحية roles.manage
✅ isBootstrap()         — مستخدم جديد بدون user document (إعداد أولي)
```

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `roles` | `isAuthenticated` | `isAdmin` or `isBootstrap` | `isAdmin` | `isAdmin` |
| `users` | owner or `isAdmin` | owner or `isAdmin` | owner or `isAdmin` | `isAdmin` |
| `products` | `isActiveUser` | `products.create` | `products.edit` | `isAdmin` |
| `production_lines` | `isActiveUser` | `lines.create` | `lines.edit` | `isAdmin` |
| `employees` | `isActiveUser` | `employees.create` | `employees.edit` | `isAdmin` |
| `production_reports` | `isActiveUser` | `reports.create` | `reports.edit` | `isAdmin` |
| `activity_logs` | `activityLog.view` | `isAuthenticated` | `isAdmin` | `isAdmin` |

> **ملاحظة:** الحذف في كل الـ collections محصور على المدير فقط (`isAdmin`).

---

## 📊 معادلات الحسابات

| المقياس | المعادلة |
|---------|---------|
| متوسط زمن التجميع | `sum(workers × hours) / sum(quantityProduced)` |
| الكفاءة | `standardAssemblyTime / actualAssemblyTime` |
| نسبة الهالك | `quantityWaste / (quantityProduced + quantityWaste)` |
| الطاقة اليومية | `(maxWorkers × dailyWorkingHours) / avgAssemblyTime` |
| متوسط الإنتاج اليومي | `totalProduced / uniqueWorkDays` |

جميع الحسابات تتم ديناميكيًا ولا يتم تخزين أرقام مشتقة في قاعدة البيانات.

---

## 📦 المكتبات

| المكتبة | الإصدار | الاستخدام |
|---------|---------|----------|
| `react` + `react-dom` | 19.2.4 | واجهة المستخدم |
| `vite` | 6.2.0 | أداة البناء والتشغيل |
| `tailwindcss` | CDN | التنسيق (RTL) |
| `zustand` | 5.0.11 | إدارة الحالة |
| `firebase` | 12.9.0 | قاعدة البيانات + المصادقة |
| `react-router-dom` | 7.13.0 | التنقل (HashRouter) |
| `recharts` | 3.7.0 | الرسوم البيانية |
| `react-to-print` | 3.2.0 | الطباعة |
| `xlsx` + `file-saver` | 0.18.5 | تصدير Excel |
| `jspdf` + `html2canvas` | 4.1.0 / 1.4.1 | تصدير PDF + صور |
| `typescript` | 5.8.2 | Type safety |

---

## ⚙️ التشغيل المحلي

**المتطلبات:** Node.js 20+ (متوافق مع Firebase Functions في هذا المشروع)

### 1. تثبيت المكتبات

```bash
npm install
```

### 2. إعداد Firebase

أنشئ ملف `.env.local` في جذر المشروع:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_VAPID_KEY=your_web_push_vapid_key
```

### 3. إعداد Firebase Console

1. فعّل **Authentication** → **Email/Password** في Firebase Console
2. انشر **Firestore Security Rules** من ملف `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. انشر **Firebase Storage Rules** من ملف `storage.rules`:
   ```bash
   firebase deploy --only storage
   ```

### 4. تشغيل السيرفر المحلي

```bash
npm run dev
```

### 5. إنشاء أول حساب

1. افتح التطبيق → صفحة تسجيل الدخول
2. اضغط **"إنشاء حساب جديد"**
3. أدخل الاسم + البريد + كلمة المرور
4. الحساب الأول يحصل على دور "مشرف" — غيّره لـ "مدير النظام" من Firestore Console أو أنشئ حساب المدير من صفحة فريق العمل

### 6. بناء نسخة الإنتاج

```bash
npm run build
```

### 7. سكربتات مساعدة

```bash
npm run version:auto     # تحديث رقم الإصدار تلقائيًا
npm run changelog:auto   # توليد CHANGELOG تلقائيًا
```

---

## 🚀 النشر للإنتاج (Firebase)

### 1) تجهيز وبناء المشروع

```bash
npm install
npm --prefix functions install
npm run build
npm --prefix functions run build
```

### 2) تسجيل الدخول واختيار المشروع

```bash
firebase login
firebase use sokany-production
```

### 3) نشر الواجهة + Functions + قواعد/فهارس Firestore

> في PowerShell لازم وضع targets بين quotes:

```bash
firebase deploy --only "hosting,functions,firestore:rules,firestore:indexes"
```

بديل على دفعات:

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only "firestore:rules,firestore:indexes"
```

---

## 🔔 إعداد الإشعارات (Web Push + FCM)

### المتطلبات
- تفعيل Firebase Cloud Messaging من Firebase Console.
- إنشاء Web Push key واستخدامه في `VITE_FIREBASE_VAPID_KEY`.
- تشغيل التطبيق على HTTPS (Firebase Hosting موصى به).
- قبول المستخدم لإذن الإشعارات من المتصفح.
- مشروع Firebase على Blaze plan لتشغيل Scheduled Functions.

### كيف تعمل في النظام
- `public/firebase-messaging-sw.js` يستقبل إشعارات الخلفية.
- يتم حفظ توكنات الأجهزة في `user_devices`.
- عند إنشاء مستند جديد في `notifications` يتم إرسال Push تلقائيًا عبر Cloud Function.

### اختبار سريع بعد النشر
1. سجّل الدخول بمستخدم فعّال وافق على إذن الإشعارات.
2. تأكد أن مستند الجهاز ظهر في `user_devices` وقيمته `enabled: true`.
3. أنشئ إشعارًا في `notifications` لموظف مستلم.
4. تحقق من ظهور إشعار داخل التطبيق + Push في المتصفح (foreground/background).

---

## 🚀 ملاحظات الأداء

- استعلامات Firestore مفلترة بالتاريخ — لا يتم تحميل كل السجلات
- `onSnapshot` مستخدم فقط في Dashboard و Line Status
- Loading Skeletons لتجربة مستخدم سلسة أثناء التحميل
- مقارنة سطحية (shallow) في Zustand لتجنب إعادة الرسم غير الضرورية
- الترتيب يتم في الذاكرة لتجنب الحاجة لـ Composite Indexes في Firestore
- يمكن إنشاء أكثر من تقرير لنفس الخط في نفس اليوم

---

## 🏗️ البنية المعمارية

```
┌──────────────────────────────────────────────────────────┐
│                    React App (Vite)                       │
│                                                          │
│  ┌─────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  Pages   │──▶│  Zustand     │──▶│  Firebase        │  │
│  │  (UI)    │   │  Store       │   │  Services        │  │
│  └─────────┘   │              │   │                  │  │
│       │        │  • Auth      │   │  • Firestore     │  │
│       │        │  • RBAC      │   │  • Auth          │  │
│       ▼        │  • Data      │   │  • Activity Log  │  │
│  ┌─────────┐   │  • Logging   │   └──────────────────┘  │
│  │  Utils   │   └──────────────┘                         │
│  │          │                                            │
│  │ • perms  │   ┌──────────────┐   ┌──────────────────┐  │
│  │ • calc   │   │  Components  │   │  Firestore Rules │  │
│  │ • export │   │  • Layout    │   │  (Server-side)   │  │
│  └─────────┘   │  • Protected │   └──────────────────┘  │
│                │  • UI        │                          │
│                └──────────────┘                          │
└──────────────────────────────────────────────────────────┘
```

**تدفق المصادقة:**

```
Login Page → Firebase Auth → Fetch User Doc → Check isActive
    → Resolve Role → Apply Permissions → Load App Data → Dashboard
```

**تدفق إنشاء حساب:**

```
Register → Firebase Auth (create) → Seed Roles → Create User Doc
    → Assign Default Role (مشرف) → Load App Data → Dashboard
```

---

## 🏢 وحدة الموارد البشرية (HR Module)

### البنية

```
modules/hr/
├── approval/          — محرك الموافقات المؤسسي (Enterprise Approval Engine)
│   ├── types.ts       — أنواع البيانات
│   ├── approvalBuilder.ts    — بناء سلاسل الموافقات (snapshot-based)
│   ├── approvalEngine.ts     — العمليات الأساسية (CRUD + workflow)
│   ├── approvalValidation.ts — التحقق + RBAC
│   ├── approvalDelegation.ts — خدمة التفويضات
│   ├── approvalEscalation.ts — التصعيد التلقائي
│   └── approvalAudit.ts      — سجل المراجعة
├── config/            — إعدادات HR المركزية (8 وحدات)
├── payroll/           — نظام الرواتب (استراتيجيات: شهري/يومي/بالساعة)
├── pages/             — صفحات HR
└── utils/             — أدوات مساعدة (payslipGenerator)
```

### الصفحات

| الصفحة | المسار | الصلاحية |
|--------|--------|----------|
| سجل الحضور | `/attendance` | `attendance.view` |
| استيراد الحضور | `/attendance/import` | `attendance.import` |
| الإجازات | `/leave-requests` | `leave.view` |
| السُلف | `/loan-requests` | `loan.view` |
| مركز الموافقات | `/approval-center` | `approval.view` |
| التفويضات | `/delegations` | `approval.delegate` |
| كشف الرواتب | `/payroll` | `payroll.view` |
| الهيكل التنظيمي | `/organization` | `hrSettings.view` |
| إعدادات HR | `/hr-settings` | `hrSettings.view` |

---

## 👨‍💻 المطور

**Ahmed Abdel Hakim Said**

---

<div align="center">

**HAKIMO — نظام إنتاج متكامل** 🏭

الإصدار 4.0.51 — مع مصادقة + صلاحيات + HR + رواتب + موافقات مؤسسية

</div>
