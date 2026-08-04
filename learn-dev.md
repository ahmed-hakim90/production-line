# دليل المشروع الكامل — من الصفر لفهم كل سطر

> هذا الملف يفترض أنك **لم تدرس React من قبل**. يشرح كل مفهوم بشكل عملي من كود المشروع نفسه.

---

## الجزء الأول: أساسيات React (اللي محتاجها عشان تفهم المشروع)

### 1. إيه هو React؟

React مكتبة JavaScript لبناء واجهات المستخدم. بدل ما تكتب HTML عادي وتتحكم فيه بـ JavaScript، في React بتكتب **components** — قطع صغيرة كل واحدة مسؤولة عن جزء من الصفحة.

### 2. JSX — HTML جوه JavaScript

```tsx
// ده مش HTML عادي — ده JSX
const MyButton = () => {
  return <button className="bg-blue-500 text-white">اضغط هنا</button>;
};
```

JSX شكلها HTML بس هي JavaScript في الحقيقة. الفروقات المهمة:
- `class` بتبقى `className`
- `for` بتبقى `htmlFor`
- كل حاجة لازم تتقفل `<img />` مش `<img>`
- تقدر تحط JavaScript جوه `{}`:

```tsx
const name = "حكيم";
return <h1>مرحباً {name}</h1>;  // → مرحباً حكيم
```

### 3. Component — لبنة البناء

كل حاجة في React عبارة عن component. الـ component ده function بترجع JSX:

```tsx
// component بسيط — مثال من المشروع: components/UI.tsx
export const Card = ({ children, title }) => (
  <div className="bg-white rounded-xl border shadow-sm">
    {title && (
      <div className="px-6 py-4 border-b">
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);
```

واستخدامه:

```tsx
<Card title="حالة النظام">
  <p>محتوى الكارت هنا</p>
</Card>
```

### 4. Props — البيانات اللي بتتبعت للـ Component

لما بتستخدم component، بتبعت له بيانات اسمها **props**:

```tsx
// تعريف
const Badge = ({ children, variant = 'neutral' }) => {
  const styles = {
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-rose-100 text-rose-700',
    neutral: 'bg-slate-100 text-slate-600',
  };
  return <span className={styles[variant]}>{children}</span>;
};

// استخدام
<Badge variant="success">متصل</Badge>    // → أخضر
<Badge variant="danger">غير متصل</Badge>  // → أحمر
<Badge>عادي</Badge>                       // → رمادي (الـ default)
```

- `children` → اللي بتحطه **جوه** الـ tag
- `variant` → **attribute** بتبعته
- `= 'neutral'` → **قيمة افتراضية** لو محددتش

### 5. useState — الذاكرة المؤقتة

لما عايز الـ component "يفتكر" حاجة (مثلاً: هل القائمة مفتوحة ولا لأ):

```tsx
import { useState } from 'react';

const MyComponent = () => {
  const [count, setCount] = useState(0);
  //      ↑         ↑              ↑
  //   القيمة   دالة التغيير   القيمة الأولية

  return (
    <div>
      <p>العدد: {count}</p>
      <button onClick={() => setCount(count + 1)}>زيادة</button>
      <button onClick={() => setCount(0)}>إعادة تعيين</button>
    </div>
  );
};
```

**قاعدة مهمة:** لما تستدعي `setCount`، React بيعيد رسم الـ component بالقيمة الجديدة.

مثال من المشروع (Settings.tsx):

```tsx
const [activeTab, setActiveTab] = useState('general');
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState('');
```

### 6. useEffect — عمل حاجة لما يحصل تغيير

```tsx
import { useEffect } from 'react';

// يشتغل مرة واحدة لما الـ component يظهر
useEffect(() => {
  console.log('الصفحة اتفتحت');
}, []);  // ← المصفوفة الفاضية = مرة واحدة بس

// يشتغل كل ما activeTab يتغير
useEffect(() => {
  console.log('التاب اتغير لـ', activeTab);
}, [activeTab]);  // ← بيراقب activeTab

// cleanup — يشتغل لما الـ component يتشال
useEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000);
  return () => clearInterval(timer);  // ← ده الـ cleanup
}, []);
```

مثال من المشروع (App.tsx):

```tsx
useEffect(() => {
  // لما التطبيق يفتح — اسمع على تغييرات المصادقة
  const unsub = onAuthChange((user) => {
    if (user) initializeApp();
  });
  return () => unsub();  // لما التطبيق يتقفل — ألغي الاستماع
}, []);
```

### 7. useCallback — تثبيت دالة

```tsx
// بدون useCallback — الدالة بتتعمل من جديد كل مرة الـ component يتعاد رسمه
const handleSave = () => { ... };

// مع useCallback — الدالة ثابتة ومش بتتغير إلا لما المتغيرات المحددة تتغير
const handleSave = useCallback(() => {
  // كود الحفظ
}, [systemSettings, localWidgets]);  // ← بتتغير بس لما دول يتغيروا
```

ده مهم عشان الأداء — لو الدالة بتتبعت كـ prop لـ component تاني.

### 8. useRef — مرجع ثابت

```tsx
const inputRef = useRef(null);

// بعدين تقدر تتحكم في الـ input مباشرة
<input ref={inputRef} type="file" className="hidden" />
<button onClick={() => inputRef.current?.click()}>اختر ملف</button>
```

`useRef` بيعطيك مرجع لعنصر HTML — زي `document.getElementById` بس بطريقة React.

### 9. الـ Conditional Rendering — عرض حسب الشرط

```tsx
// الطريقة الأولى: && (لو الشرط true → اعرض)
{isAdmin && <Button>حذف</Button>}

// الطريقة الثانية: ternary (لو/وإلا)
{loading ? <Spinner /> : <Content />}

// الطريقة الثالثة: متعددة
{status === 'success' && <SuccessMessage />}
{status === 'error' && <ErrorMessage />}
```

### 10. الـ Lists — عرض مصفوفة

```tsx
const products = ['منتج A', 'منتج B', 'منتج C'];

return (
  <ul>
    {products.map((product, index) => (
      <li key={index}>{product}</li>
    ))}
  </ul>
);
```

**`key`** إجباري — React بيستخدمه يعرف أنهي عنصر اتغير.

### 11. TypeScript — إيه الأنواع دي؟

TypeScript = JavaScript + أنواع بيانات. بيمنع الأخطاء قبل ما تشغل الكود:

```tsx
// تعريف شكل البيانات
interface ProductionReport {
  id?: string;           // string اختياري (?) يعني ممكن مايبقاش موجود
  employeeId: string;    // string إجباري
  quantityProduced: number;
  date: string;
}

// لو حاولت تبعت رقم مكان string — TypeScript هيقولك غلط
const report: ProductionReport = {
  employeeId: 123,  // ❌ Error!
  date: "2026-02-21", // ✅
};

// في component
const MyComponent: React.FC<{ title: string; count: number }> = ({ title, count }) => {
  return <h1>{title}: {count}</h1>;
};
```

---

## الجزء الثاني: بنية المشروع — الصورة الكبيرة

### هيكل الملفات

```
📁 pro-tech-erp-production-management/
├── 📄 index.html          ← نقطة البداية (الصفحة الوحيدة)
├── 📄 index.tsx            ← نقطة دخول React
├── 📄 App.tsx              ← المكون الجذر + التوجيه (Routing)
├── 📄 App.css              ← الخط الأساسي
├── 📄 types.ts             ← كل أنواع البيانات (TypeScript interfaces)
├── 📄 vite.config.ts       ← إعدادات أداة البناء
│
├── 📁 pages/               ← صفحات التطبيق (23 صفحة)
│   ├── Login.tsx           ← تسجيل الدخول
│   ├── Dashboard.tsx       ← لوحة التحكم الرئيسية
│   ├── AdminDashboard.tsx  ← لوحة مدير النظام
│   ├── Products.tsx        ← قائمة المنتجات
│   ├── ProductDetails.tsx  ← تفاصيل منتج
│   ├── Lines.tsx           ← خطوط الإنتاج
│   ├── LineDetails.tsx     ← تفاصيل خط
│   ├── Reports.tsx         ← التقارير
│   ├── Settings.tsx        ← الإعدادات العامة
│   ├── ProductionPlans.tsx ← خطط الإنتاج
│   ├── CostCenters.tsx     ← مراكز التكلفة
│   └── ... (باقي الصفحات)
│
├── 📁 components/          ← مكونات مشتركة (5 ملفات)
│   ├── UI.tsx              ← Card, Badge, Button, KPIBox, SearchableSelect
│   ├── Layout.tsx          ← الهيكل العام (Sidebar + Header + Footer)
│   ├── ProtectedRoute.tsx  ← حماية الصفحات بالصلاحيات
│   ├── ProductionReportPrint.tsx ← قالب الطباعة
│   └── EmployeeDashboardWidget.tsx  ← مكون لوحة الموظف
│
├── 📁 modules/hr/          ← وحدة الموارد البشرية
│   ├── 📁 approval/        ← محرك الموافقات المؤسسي
│   ├── 📁 config/          ← إعدادات HR المركزية
│   ├── 📁 payroll/         ← نظام الرواتب
│   ├── 📁 pages/           ← صفحات HR
│   │   ├── ApprovalCenter.tsx     ← مركز الموافقات
│   │   ├── AttendanceImport.tsx   ← استيراد الحضور
│   │   ├── AttendanceList.tsx     ← سجل الحضور
│   │   ├── DelegationManagement.tsx ← إدارة التفويضات
│   │   ├── HRSettings.tsx         ← إعدادات HR المتقدمة
│   │   ├── LeaveRequests.tsx      ← الإجازات
│   │   ├── LoanRequests.tsx       ← السُلف
│   │   ├── Organization.tsx       ← الهيكل التنظيمي
│   │   └── Payroll.tsx            ← كشف الرواتب
│   └── 📁 utils/           ← أدوات HR (payslipGenerator)
│
├── 📁 services/            ← التواصل مع Firebase
│   ├── firebase.ts         ← إعداد Firebase
│   ├── productService.ts   ← CRUD المنتجات
│   ├── lineService.ts      ← CRUD خطوط الإنتاج
│   ├── reportService.ts    ← CRUD التقارير
│   ├── userService.ts      ← CRUD المستخدمين
│   ├── backupService.ts    ← النسخ الاحتياطي
│   └── ... (باقي الخدمات)
│
├── 📁 store/               ← إدارة الحالة (ملف واحد)
│   └── useAppStore.ts      ← المخ — Zustand store
│
└── 📁 utils/               ← أدوات مساعدة (10 ملفات)
    ├── calculations.ts     ← حسابات الإنتاج والكفاءة
    ├── costCalculations.ts ← حسابات التكاليف
    ├── permissions.ts      ← نظام الصلاحيات
    ├── dashboardConfig.ts  ← إعدادات لوحات التحكم
    ├── themeEngine.ts      ← محرك المظهر (CSS variables)
    ├── exportExcel.ts      ← تصدير Excel
    ├── reportExport.ts     ← تصدير PDF + مشاركة واتساب
    └── ... (باقي الأدوات)
```

### الـ 3 طبقات

```
┌─────────────────────────────────────────────────────┐
│  الطبقة 1: الشاشات (Pages) + المكونات (Components)  │
│  ← اللي المستخدم بيشوفه ويتفاعل معاه               │
├─────────────────────────────────────────────────────┤
│  الطبقة 2: المتجر (Store = useAppStore.ts)           │
│  ← المخ — بيدير البيانات والمنطق                    │
├─────────────────────────────────────────────────────┤
│  الطبقة 3: الخدمات (Services)                        │
│  ← بتكلم Firebase (قاعدة البيانات)                  │
└─────────────────────────────────────────────────────┘
```

**القاعدة:** الشاشة مش بتكلم Firebase مباشرة. بتقول للـ Store "عايز أعمل كذا"، والـ Store بيكلم الـ Service.

```
[صفحة Products] → createProduct(data) → [Store] → productService.create(data) → [Firebase]
                                            ↓
                                      يحدّث الـ state
                                            ↓
                                  كل الصفحات تتحدث تلقائياً
```

---

## الجزء الثالث: تدفق التطبيق — من الفتح للاستخدام

### 1. نقطة البداية: `index.html`

```html
<html dir="rtl" lang="ar">
  <!-- Tailwind CSS من CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Cairo..." />

  <!-- Material Icons -->
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" />

  <!-- Tailwind Config — الألوان والخطوط -->
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            primary: "rgb(var(--color-primary) / <alpha-value>)",
          }
        }
      }
    };
  </script>

  <!-- CSS Variables — بيتغيروا بمحرك المظهر -->
  <style>
    :root {
      --color-primary: 36 48 143;
      --font-family-base: 'Cairo', 'Noto Sans Arabic', sans-serif;
    }
  </style>

  <div id="root"></div>           <!-- React بيرسم هنا -->
  <script src="/index.tsx"></script> <!-- نقطة الدخول -->
</html>
```

### 2. نقطة دخول React: `index.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

ببساطة: "خد مكون `App` وارسمه جوه الـ `#root` div".

### 3. المكون الجذر: `App.tsx`

```tsx
const App = () => {
  // بيقرأ الحالة من المتجر
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isPendingApproval = useAppStore((s) => s.isPendingApproval);
  const loading = useAppStore((s) => s.loading);

  // أول ما التطبيق يفتح — يسمع على تغييرات المصادقة
  useEffect(() => {
    const unsub = onAuthChange((user) => {
      if (user) initializeApp();  // لو في مستخدم → حمّل البيانات
    });
    return () => unsub();
  }, []);

  // لو لسه بيحمّل → شاشة تحميل
  if (loading) return <LoadingScreen />;

  // التوجيه (Routing)
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Redirect /> : <Login />} />
        <Route path="/*" element={
          !isAuthenticated ? <Navigate to="/login" />
            : <Layout>
                <Routes>
                  <Route path="/" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
                  <Route path="/products" element={<ProtectedRoute permission="products.view"><Products /></ProtectedRoute>} />
                  {/* ... باقي الصفحات */}
                </Routes>
              </Layout>
        } />
      </Routes>
    </HashRouter>
  );
};
```

**التدفق:**
1. التطبيق يفتح → `onAuthChange` يفحص هل في مستخدم مسجل
2. لو مسجل → `initializeApp()` → يحمّل كل البيانات
3. لو مش مسجل → يوجه لـ `/login`
4. بعد التسجيل → يوجه للـ Dashboard المناسب حسب الدور

### 4. التوجيه (Routing) — `react-router-dom`

```tsx
// HashRouter = يستخدم # في الرابط: example.com/#/products
<HashRouter>
  <Routes>
    {/* /login → صفحة تسجيل الدخول */}
    <Route path="/login" element={<Login />} />

    {/* /products → صفحة المنتجات (محمية) */}
    <Route path="/products" element={
      <ProtectedRoute permission="products.view">
        <Products />
      </ProtectedRoute>
    } />

    {/* /products/:id → تفاصيل منتج معين */}
    {/* :id = معامل ديناميكي — يمكن أن يكون أي قيمة */}
    <Route path="/products/:id" element={<ProductDetails />} />
  </Routes>
</HashRouter>
```

في صفحة التفاصيل بتاخد الـ id كده:

```tsx
import { useParams } from 'react-router-dom';

const ProductDetails = () => {
  const { id } = useParams();  // لو الرابط /products/abc123 → id = "abc123"
  // ...
};
```

وللتنقل:

```tsx
import { useNavigate, NavLink } from 'react-router-dom';

// بالكود
const navigate = useNavigate();
navigate('/products');          // روح لصفحة المنتجات
navigate(`/products/${id}`);    // روح لتفاصيل منتج

// بالرابط
<NavLink to="/products">المنتجات</NavLink>
```

### 5. الحماية: `ProtectedRoute.tsx`

```tsx
export const ProtectedRoute = ({ permission, children }) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { can } = usePermission();

  if (!isAuthenticated) return <Navigate to="/login" />;    // مش مسجل → Login
  if (!can(permission)) return <Navigate to="/" />;         // مالوش صلاحية → Home
  return <>{children}</>;                                   // كله تمام → اعرض الصفحة
};
```

### 6. الهيكل العام: `Layout.tsx`

```
┌───────────────────────────────────────────────────┐
│ Header (العنوان + التاريخ + الإشعارات)             │
├──────────┬────────────────────────────────────────┤
│          │                                        │
│ Sidebar  │         المحتوى (children)              │
│ (القائمة │                                        │
│  الجانبية│         ← الصفحة الحالية                │
│  + روابط │                                        │
│  الملاحة)│                                        │
│          │                                        │
├──────────┴────────────────────────────────────────┤
│ Footer (حقوق النشر)                               │
└───────────────────────────────────────────────────┘
```

الـ Sidebar بتظهر الروابط حسب الصلاحيات:

```tsx
// permissions.ts — تعريف الروابط
export const SIDEBAR_GROUPS = [
  {
    label: 'الرئيسية',
    items: [
      { path: '/', label: 'لوحة التحكم', icon: 'dashboard', permission: 'dashboard.view' },
      { path: '/quick-action', label: 'إجراء سريع', icon: 'flash_on', permission: 'quickAction.view' },
    ],
  },
  {
    label: 'الإنتاج',
    items: [
      { path: '/products', label: 'المنتجات', icon: 'inventory_2', permission: 'products.view' },
      { path: '/lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', permission: 'lines.view' },
    ],
  },
  // ...
];

// Layout.tsx — عرض الروابط
{SIDEBAR_GROUPS.map((group) => {
  const visibleItems = group.items.filter((item) => can(item.permission));
  if (visibleItems.length === 0) return null;  // لو مفيش صلاحية لأي رابط → اخفي المجموعة

  return (
    <div key={group.label}>
      <p className="text-xs font-bold text-slate-400">{group.label}</p>
      {visibleItems.map((item) => (
        <NavLink key={item.path} to={item.path}>{item.label}</NavLink>
      ))}
    </div>
  );
})}
```

---

## الجزء الرابع: المتجر (Zustand Store) — مخ التطبيق

### إيه هو Zustand؟

Zustand مكتبة بسيطة لإدارة الحالة (state management). بدل ما كل component يكون عنده بياناته الخاصة، بنحط كل البيانات المشتركة في مكان واحد:

```tsx
// store/useAppStore.ts
import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // ══════════════════════════════════════════
  // الجزء 1: البيانات (State)
  // ══════════════════════════════════════════
  products: [],              // قائمة المنتجات
  productionLines: [],       // قائمة خطوط الإنتاج
  employees: [],             // قائمة الموظفين
  productionReports: [],     // التقارير
  productionPlans: [],       // خطط الإنتاج
  costCenters: [],           // مراكز التكلفة
  systemSettings: {},        // إعدادات النظام

  isAuthenticated: false,    // مسجل دخول ولا لأ
  userPermissions: {},       // صلاحيات المستخدم
  loading: false,            // بيحمّل ولا لأ

  // ══════════════════════════════════════════
  // الجزء 2: الأوامر (Actions)
  // ══════════════════════════════════════════
  login: async (email, password) => { ... },
  logout: async () => { ... },
  fetchProducts: async () => { ... },
  createReport: async (data) => { ... },
  updateSystemSettings: async (data) => { ... },
}));
```

### `set` — تغيير البيانات

```tsx
// غيّر قيمة
set({ loading: true });

// غيّر عدة قيم
set({ products: newProducts, loading: false });

// لما تغيّر → كل component بيقرأ القيمة دي بيتحدث تلقائياً!
```

### `get` — قراءة البيانات الحالية (جوه action)

```tsx
createReport: async (data) => {
  const { systemSettings } = get();  // ← اقرأ الإعدادات الحالية
  const { uid, userEmail } = get();  // ← اقرأ بيانات المستخدم

  await reportService.create(data);

  get()._rebuildProducts();  // ← استدعي action تاني
},
```

### استخدام المتجر في الصفحات

```tsx
// في أي component — اقرأ بيانات من المتجر
const products = useAppStore((s) => s.products);
const isAuthenticated = useAppStore((s) => s.isAuthenticated);
const createReport = useAppStore((s) => s.createReport);

// لما products تتغير في المتجر → الـ component ده بيتعاد رسمه تلقائياً
```

**القاعدة:** اقرأ بس اللي محتاجه. `(s) => s.products` بيخلي الـ component يتحدث بس لما products تتغير، مش لما أي حاجة تانية تتغير.

### مثال كامل: إنشاء تقرير إنتاج

```tsx
// 1. في المتجر (store/useAppStore.ts)
createReport: async (data) => {
  // فحص الصلاحيات من الإعدادات
  const { systemSettings } = get();
  const planSettings = systemSettings.planSettings;

  // هل في خطة نشطة؟
  const activePlan = await productionPlanService.getActiveByLineAndProduct(data.lineId, data.productId);

  // لو مش مسموح بتقرير بدون خطة
  if (!planSettings.allowReportWithoutPlan && !activePlan) {
    set({ error: 'لا يمكن إنشاء تقرير بدون خطة إنتاج' });
    return null;
  }

  // احفظ في Firebase
  const id = await reportService.create(data);

  // حدّث الخطة (لو في)
  if (activePlan) {
    await productionPlanService.incrementProduced(activePlan.id, data.quantityProduced);
  }

  // حدّث البيانات المحلية
  const todayReports = await reportService.getByDateRange(today, today);
  set({ todayReports });

  // أعد حساب المنتجات والخطوط
  get()._rebuildProducts();
  get()._rebuildLines();

  // سجّل في سجل النشاط
  get()._logActivity('CREATE_REPORT', 'إنشاء تقرير إنتاج جديد');

  return id;
},

// 2. في الصفحة (pages/QuickAction.tsx)
const QuickAction = () => {
  const createReport = useAppStore((s) => s.createReport);

  const handleSubmit = async () => {
    const id = await createReport({
      lineId: selectedLine,
      productId: selectedProduct,
      employeeId: selectedEmployee,
      date: selectedDate,
      quantityProduced: quantity,
      quantityWaste: waste,
      workersCount: workers,
      workHours: hours,
    });

    if (id) {
      // نجح! اعرض رسالة نجاح
      setSuccess(true);
    }
  };
};
```

---

## الجزء الخامس: الخدمات (Services) — التواصل مع Firebase

### إيه هو Firebase Firestore؟

قاعدة بيانات NoSQL على السحابة. البيانات متخزنة في **collections** (مجموعات) فيها **documents** (مستندات):

```
Firestore
├── products/              ← collection
│   ├── abc123             ← document
│   │   ├── name: "منتج A"
│   │   ├── code: "P001"
│   │   └── openingBalance: 1000
│   └── def456
│       ├── name: "منتج B"
│       └── ...
├── production_reports/
│   └── ...
├── users/
│   └── ...
└── system_settings/
    └── global             ← document واحد فيه كل الإعدادات
```

### شكل الـ Service

كل service نفس البنية — CRUD (Create, Read, Update, Delete):

```tsx
// services/productService.ts
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export const productService = {
  // قراءة الكل
  async getAll() {
    const snap = await getDocs(collection(db, 'products'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // إنشاء
  async create(data) {
    const docRef = await addDoc(collection(db, 'products'), data);
    return docRef.id;
  },

  // تحديث
  async update(id, data) {
    await updateDoc(doc(db, 'products', id), data);
  },

  // حذف
  async delete(id) {
    await deleteDoc(doc(db, 'products', id));
  },
};
```

**كل الـ 18 service نفس الشكل.** ده بيخلي الكود متوقع وسهل الفهم.

### الـ Collections في المشروع

| Collection | الوصف | Service |
|-----------|-------|---------|
| `products` | المنتجات | `productService` |
| `production_lines` | خطوط الإنتاج | `lineService` |
| `employees` | الموظفين | `employeeService` |
| `production_reports` | تقارير الإنتاج | `reportService` |
| `production_plans` | خطط الإنتاج | `productionPlanService` |
| `line_status` | حالة الخطوط (المنتج الحالي) | `lineStatusService` |
| `line_product_config` | إعدادات المنتج-الخط | `lineProductConfigService` |
| `cost_centers` | مراكز التكلفة | `costCenterService` |
| `cost_center_values` | قيم مراكز التكلفة الشهرية | `costCenterValueService` |
| `cost_allocations` | توزيع التكاليف على الخطوط | `costAllocationService` |
| `labor_settings` | إعدادات العمالة (سعر الساعة) | `laborSettingsService` |
| `roles` | الأدوار والصلاحيات | `roleService` |
| `users` | المستخدمين | `userService` |
| `system_settings` | إعدادات النظام (مستند واحد) | `systemSettingsService` |
| `activity_logs` | سجل النشاط | `activityLogService` |
| `backups` | سجل النسخ الاحتياطي | `backupService` |

---

## الجزء السادس: نظام الصلاحيات (RBAC)

### المفهوم

كل مستخدم عنده **دور** (role). كل دور عنده قائمة **صلاحيات** (permissions):

```tsx
// مثال: دور "مشرف" في Firestore
{
  name: "مشرف",
  color: "bg-blue-100 text-blue-700",
  permissions: {
    "dashboard.view": true,
    "reports.view": true,
    "reports.create": true,
    "reports.edit": false,     // ← ممنوع
    "reports.delete": false,   // ← ممنوع
    "products.view": true,
    "products.create": false,  // ← ممنوع
    "settings.view": false,    // ← ممنوع
  }
}
```

### الاستخدام: `usePermission()` hook

```tsx
const { can, canCreateReport, canManageUsers } = usePermission();

// في الواجهة
{can('reports.create') && <Button>إنشاء تقرير</Button>}    // ✅ يظهر للمشرف
{can('reports.delete') && <Button>حذف</Button>}             // ❌ مخفي عن المشرف
{can('settings.view') && <NavLink to="/settings">إعدادات</NavLink>}  // ❌ مخفي
```

### الحماية المزدوجة

```
المستخدم يضغط زرار
        ↓
Frontend: هل عنده الصلاحية؟ (الزرار ظاهر ولا لأ)
        ↓ أيوه
Store: يبعت الطلب لـ Firebase
        ↓
Firestore Rules: هل فعلاً عنده الصلاحية؟ (فحص ثاني من السيرفر)
        ↓ أيوه
تتنفذ العملية
```

---

## الجزء السابع: المكونات المشتركة (UI.tsx)

### Card — بطاقة

```tsx
<Card title="حالة النظام">
  <p>أي محتوى هنا</p>
</Card>
```

### Badge — شارة ملونة

```tsx
<Badge variant="success">متصل</Badge>
<Badge variant="danger">خطأ</Badge>
<Badge variant="warning" pulse>تنبيه</Badge>  // مع وميض
```

### Button — زرار

```tsx
<Button>حفظ</Button>                           // أزرق (primary)
<Button variant="secondary">إنشاء</Button>     // أخضر
<Button variant="outline">إلغاء</Button>       // حدود فقط
<Button disabled={saving}>
  {saving && <span className="animate-spin">↻</span>}
  حفظ
</Button>
```

### KPIBox — مربع مؤشر أداء

```tsx
<KPIBox
  label="الكفاءة"
  value="87.5"
  unit="%"
  icon="speed"
  trend="+3.2% عن الشهر الماضي"
  trendUp={true}
/>
```

### SearchableSelect — قائمة منسدلة مع بحث

```tsx
<SearchableSelect
  options={[
    { value: 'line1', label: 'خط 1' },
    { value: 'line2', label: 'خط 2' },
  ]}
  value={selectedLine}
  onChange={setSelectedLine}
  placeholder="اختر الخط..."
/>
```

---

## الجزء الثامن: التنسيق — Tailwind CSS

المشروع يستخدم **Tailwind CSS** — بدل ما تكتب CSS في ملفات منفصلة، بتحط classes مباشرة:

```tsx
// بدون Tailwind
<div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>

// مع Tailwind — أنظف وأسرع
<div className="bg-white p-6 rounded-xl border border-slate-200">
```

### أهم الـ Classes اللي هتشوفها في المشروع

```
// الألوان
bg-primary          → لون الخلفية الرئيسي
bg-primary/10       → لون رئيسي بشفافية 10%
text-primary        → لون النص الرئيسي
text-slate-700      → رمادي غامق
bg-emerald-500      → أخضر (نجاح)
bg-amber-500        → أصفر (تحذير)
bg-rose-500         → أحمر (خطر)

// المساحات
p-6                 → padding: 24px (كل الاتجاهات)
px-4                → padding-left + right: 16px
py-2.5              → padding-top + bottom: 10px
gap-4               → المسافة بين العناصر: 16px
space-y-6           → مسافة عمودية: 24px بين الأبناء

// الأحجام
w-12                → width: 48px
h-12                → height: 48px
w-full              → width: 100%
min-w-0             → min-width: 0 (مهم في flex)

// النصوص
text-sm             → 14px
text-xs             → 12px
text-lg             → 18px
text-2xl            → 24px
font-bold           → خط عريض
font-black          → أعرض خط

// التخطيط
flex                → display: flex
flex-1              → flex-grow: 1 (ياخد المساحة المتبقية)
items-center        → محاذاة عمودية وسط
justify-between     → مسافة بين العناصر
grid                → display: grid
grid-cols-3         → 3 أعمدة
grid-cols-1 md:grid-cols-2 lg:grid-cols-4  → responsive!

// الحواف
rounded-xl          → border-radius: 12px
rounded-full        → دائري بالكامل
border              → حد 1px
border-slate-200    → لون الحد

// الظل
shadow-sm           → ظل خفيف
shadow-lg           → ظل كبير
shadow-primary/20   → ظل بلون رئيسي شفاف

// الـ Dark Mode
dark:bg-slate-900   → في الـ dark mode: خلفية غامقة
dark:text-white     → في الـ dark mode: نص أبيض

// الـ Responsive
sm:w-72             → على شاشات ≥640px: width 288px
md:grid-cols-2      → على شاشات ≥768px: عمودين
lg:grid-cols-4      → على شاشات ≥1024px: 4 أعمدة

// الانتقالات
transition-all      → حركة سلسة عند أي تغيير
hover:bg-slate-200  → عند مرور الماوس
animate-pulse       → وميض
animate-spin        → دوران (للتحميل)

// المساعدات
truncate            → نص طويل → ...
shrink-0            → لا تنكمش في flex
overflow-hidden     → اخفي المحتوى الزائد
cursor-pointer      → مؤشر اليد
```

### Material Icons

```tsx
<span className="material-icons-round">settings</span>      // أيقونة إعدادات
<span className="material-icons-round">dashboard</span>     // أيقونة لوحة تحكم
<span className="material-icons-round text-primary">check_circle</span>
```

---

## الجزء التاسع: محرك المظهر (Theme Engine)

### المفهوم

بدل ما الألوان تكون ثابتة في الكود، بنستخدم **CSS Variables** (متغيرات):

```css
/* في index.html */
:root {
  --color-primary: 36 48 143;    /* أزرق غامق */
}

/* Tailwind بيستخدم المتغير */
.bg-primary {
  background-color: rgb(var(--color-primary));
}
```

لما المستخدم يغير اللون في الإعدادات:

```tsx
// utils/themeEngine.ts
export function applyTheme(theme) {
  const root = document.documentElement;

  // حوّلrgb(102, 36, 20) → "36 48 143"
  root.style.setProperty('--color-primary', hexToRgb(theme.primaryColor));
  root.style.setProperty('--font-family-base', `'${theme.baseFontFamily}'`);
  root.style.setProperty('--font-size-base', `${theme.baseFontSize}px`);

  // Dark mode
  if (theme.darkMode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}
```

**النتيجة:** كل `bg-primary` و `text-primary` في التطبيق بيتغيروا فوراً!

### متى بيتطبق؟

```
1. التطبيق يفتح → _loadAppData() → applyTheme(settings.theme)
2. المستخدم يغير لون في الإعدادات → useEffect → applyTheme(localTheme) فوراً
3. المستخدم يضغط حفظ → updateSystemSettings() → applyTheme() + حفظ في Firestore
```

---

## الجزء العاشر: أنواع البيانات (types.ts)

كل مستند في Firestore ليه `interface` في TypeScript:

```tsx
// شكل التقرير
interface ProductionReport {
  id?: string;               // ID تلقائي من Firestore
  employeeId: string;        // مرتبط بالموظف
  productId: string;         // مرتبط بمنتج
  lineId: string;            // مرتبط بخط إنتاج
  date: string;              // "2026-02-21"
  quantityProduced: number;  // الكمية المنتجة
  quantityWaste: number;     // الهالك
  workersCount: number;      // عدد العمال
  workHours: number;         // ساعات العمل
  createdAt?: any;           // تاريخ الإنشاء (Firestore timestamp)
}

// شكل خطة الإنتاج
interface ProductionPlan {
  id?: string;
  productId: string;
  lineId: string;
  plannedQuantity: number;
  producedQuantity: number;
  startDate: string;
  plannedEndDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';  // ← قيم محددة بس
  status: 'planned' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
}

// إعدادات النظام (مستند لكل مستأجر: system_settings/{tenantId})
interface SystemSettings {
  dashboardWidgets: Record<string, WidgetConfig[]>;
  alertSettings: AlertSettings;
  kpiThresholds: Record<string, KPIThreshold>;
  printTemplate: PrintTemplateSettings;
  planSettings: PlanSettings;
  branding?: BrandingSettings;    // هوية المصنع
  theme?: ThemeSettings;          // المظهر
  dashboardDisplay?: DashboardDisplaySettings;
  alertToggles?: AlertToggleSettings;
}
```

---

## الجزء الحادي عشر: الحسابات (calculations.ts)

### حسابات الإنتاج

```tsx
// الكفاءة = (الإنتاج الفعلي / السعة المتاحة) × 100
function calculateEfficiency(produced, capacity) {
  if (capacity <= 0) return 0;
  return Math.min((produced / capacity) * 100, 100);
}

// نسبة الهدر = هالك / (إنتاج + هالك) × 100
function calculateWasteRatio(produced, waste) {
  const total = produced + waste;
  if (total <= 0) return 0;
  return (waste / total) * 100;
}

// السعة اليومية = (ساعات العمل × 60 × عدد العمال) / وقت التجميع القياسي
function calculateDailyCapacity(workingHours, workers, assemblyTime) {
  if (assemblyTime <= 0) return 0;
  return Math.floor((workingHours * 60 * workers) / assemblyTime);
}
```

### بناء بيانات العرض

```tsx
// buildProducts: يحوّل بيانات Firestore الخام → بيانات جاهزة للعرض
function buildProducts(rawProducts, reports, configs) {
  return rawProducts.map((product) => {
    // فلتر التقارير لهذا المنتج
    const productReports = reports.filter((r) => r.productId === product.id);

    // احسب الإجمالي
    const totalProduction = productReports.reduce((sum, r) => sum + r.quantityProduced, 0);
    const totalWaste = productReports.reduce((sum, r) => sum + r.quantityWaste, 0);

    // متوسط وقت التجميع
    const config = configs.find((c) => c.productId === product.id);
    const avgAssemblyTime = config?.standardAssemblyTime ?? 0;

    // المخزون = الرصيد الافتتاحي + الإنتاج - الهالك
    const stockLevel = product.openingBalance + totalProduction - totalWaste;

    return {
      id: product.id,
      name: product.name,
      totalProduction,
      wasteUnits: totalWaste,
      stockLevel,
      avgAssemblyTime,
      stockStatus: stockLevel <= 0 ? 'out' : stockLevel < 100 ? 'low' : 'available',
    };
  });
}
```

---

## الجزء الثاني عشر: النسخ الاحتياطي (backupService.ts)

```tsx
// تصدير: اقرأ كل الـ collections → حوّلها لـ JSON → حمّلها كملف
async exportFullBackup(createdBy) {
  const collections = {};
  for (const name of ALL_COLLECTIONS) {
    collections[name] = await readCollection(name);  // اقرأ كل المستندات
  }

  const backup = {
    metadata: { version: '2.0.0', type: 'full', createdAt: new Date().toISOString() },
    collections,
  };

  downloadJSON(backup, `backup_full_${timestamp}.json`);
}

// استيراد: اقرأ ملف JSON → اكتب المستندات في Firestore
async importBackup(file, mode) {
  // أنشئ نسخة احتياطية تلقائية أولاً (أمان)
  await this.exportFullBackup('auto-before-restore');

  for (const [name, docs] of Object.entries(file.collections)) {
    if (mode === 'replace') await clearCollection(name);  // امسح القديم
    await writeDocuments(name, docs, mode);                // اكتب الجديد
  }
}
```

---

## الجزء الثالث عشر: التصدير (Excel + PDF + واتساب)

### Excel

```tsx
// utils/exportExcel.ts — يستخدم مكتبة xlsx
import * as XLSX from 'xlsx';

// حوّل التقارير لأعمدة عربية → أنشئ ملف Excel → حمّله
const rows = reports.map((r) => ({
  'التاريخ': r.date,
  'خط الإنتاج': getLineName(r.lineId),
  'الكمية المنتجة': r.quantityProduced,
}));

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'تقارير الإنتاج');
// → حمّل كملف .xlsx
```

### PDF

```tsx
// utils/reportExport.ts — يستخدم html2canvas + jsPDF
// 1. صوّر الـ HTML element كصورة (canvas)
const canvas = await html2canvas(element, { scale: 2 });
// 2. حوّل الصورة لـ PDF
const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, width, height);
pdf.save('report.pdf');
```

---

## الجزء الرابع عشر: خريطة كل صفحة

| الصفحة | الملف | الوصف | الصلاحية |
|--------|-------|-------|----------|
| تسجيل الدخول | `Login.tsx` | إيميل + باسورد + تسجيل جديد | عامة |
| لوحة التحكم | `Dashboard.tsx` | KPIs + مراقبة الخطوط + رسوم بيانية | `dashboard.view` |
| لوحة المدير | `AdminDashboard.tsx` | KPIs متقدمة + تنبيهات + توزيع أدوار | `adminDashboard.view` |
| لوحة المصنع | `FactoryManagerDashboard.tsx` | أداء المصنع + تكاليف | `factoryDashboard.view` |
| لوحة الموظف | `EmployeeDashboard.tsx` | أداء الموظف + تقاريره | `employeeDashboard.view` |
| المنتجات | `Products.tsx` | قائمة + بحث + إضافة + حذف | `products.view` |
| تفاصيل منتج | `ProductDetails.tsx` | رسوم بيانية + تقارير + تكاليف | `products.view` |
| خطوط الإنتاج | `Lines.tsx` | قائمة + حالات + إضافة | `lines.view` |
| تفاصيل خط | `LineDetails.tsx` | أداء + منتجات + تكاليف | `lines.view` |
| الموظفين | `Employees.tsx` | قائمة + ربط بحسابات | `employees.view` |
| تفاصيل موظف | `EmployeeProfile.tsx` | الملف الشخصي + أداء | `employees.view` |
| التقارير | `Reports.tsx` | فلترة + Excel + PDF + واتساب | `reports.view` |
| إجراء سريع | `QuickAction.tsx` | إنشاء تقرير بخطوة واحدة | `quickAction.view` |
| خطط الإنتاج | `ProductionPlans.tsx` | إنشاء + متابعة + تقدم ذكي | `plans.view` |
| مراكز التكلفة | `CostCenters.tsx` | قائمة + إضافة + تعديل | `costs.view` |
| توزيع التكلفة | `CostCenterDistribution.tsx` | توزيع % على الخطوط | `costs.view` |
| إعدادات التكلفة | `CostSettings.tsx` | سعر الساعة + إعدادات | `costs.manage` |
| المستخدمين | `Users.tsx` | قائمة + تفعيل/تعطيل + تغيير أدوار | `users.view` |
| سجل النشاط | `ActivityLog.tsx` | كل العمليات مع pagination | `activityLog.view` |
| إدارة الأدوار | `RolesManagement.tsx` | إنشاء + تعديل صلاحيات | `roles.manage` |
| الإعدادات | `Settings.tsx` | هوية + مظهر + سلوك + طباعة + نسخ | `settings.view` |
| الإعداد الأولي | `Setup.tsx` | شاشة إعداد Firebase أول مرة | عامة |
| انتظار الموافقة | `PendingApproval.tsx` | مستخدم جديد ينتظر التفعيل | عامة |

---

## الجزء الخامس عشر: إزاي تضيف ميزة جديدة — خطوة بخطوة

### مثال: إضافة نظام ضبط الجودة (Quality Control)

**الخطوة 1: الأنواع** (`types.ts`)

```tsx
export interface QualityCheck {
  id?: string;
  reportId: string;        // مرتبط بتقرير إنتاج
  lineId: string;
  inspectorId: string;
  date: string;
  sampleSize: number;
  defectsFound: number;
  passed: boolean;
  notes: string;
  createdAt?: any;
}
```

**الخطوة 2: الخدمة** (`services/qualityCheckService.ts`)

```tsx
export const qualityCheckService = {
  async getAll() { /* getDocs */ },
  async create(data) { /* addDoc */ },
  async update(id, data) { /* updateDoc */ },
  async delete(id) { /* deleteDoc */ },
};
```

**الخطوة 3: المتجر** (`store/useAppStore.ts`)

```tsx
// أضف في الـ state
qualityChecks: [],

// أضف في الـ actions
fetchQualityChecks: async () => { ... },
createQualityCheck: async (data) => { ... },
```

**الخطوة 4: الصلاحية** (`utils/permissions.ts`)

```tsx
// أضف في PERMISSION_GROUPS
{ label: 'ضبط الجودة', permissions: [
  { key: 'qc.view', label: 'عرض' },
  { key: 'qc.create', label: 'إنشاء' },
] }

// أضف في SIDEBAR_GROUPS
{ path: '/quality', label: 'ضبط الجودة', icon: 'verified', permission: 'qc.view' }
```

**الخطوة 5: الصفحة** (`pages/QualityControl.tsx`)

```tsx
export const QualityControl = () => {
  const qualityChecks = useAppStore((s) => s.qualityChecks);
  const { can } = usePermission();
  // ... واجهة العرض
};
```

**الخطوة 6: التوجيه** (`App.tsx`)

```tsx
<Route path="/quality" element={
  <ProtectedRoute permission="qc.view"><QualityControl /></ProtectedRoute>
} />
```

**الخطوة 7: Firestore Rules** (`firestore.rules`)

```
match /quality_checks/{docId} {
  allow read: if isActiveUser();
  allow create: if hasPermission('qc.create');
}
```

**الخطوة 8: النسخ الاحتياطي** (`services/backupService.ts`)

```tsx
const ALL_COLLECTIONS = [
  // ... الموجود
  'quality_checks',  // ← أضف هنا
];
```

---

## ملخص — القواعد الذهبية

| القاعدة | التطبيق |
|---------|---------|
| الشاشة مش بتكلم Firebase | كل حاجة عن طريق الـ Store |
| كل collection ليها service | نفس البنية: get, create, update, delete |
| الصلاحيات في مكان واحد | `usePermission()` — مش if/else في كل صفحة |
| Activity Log تلقائي | الـ Store بيسجل — مش الصفحة |
| الحماية مزدوجة | Frontend (hide) + Firestore Rules (reject) |
| TypeScript لكل حاجة | interface واضح لكل document |
| الإعدادات مركزية | `system_settings/{tenantId}` + `useAppStore.systemSettings` |
| المظهر ديناميكي | CSS Variables + `applyTheme()` |

---

## أدوات التطوير

| الأداة | الوصف |
|--------|-------|
| **Vite** | أداة البناء — سريعة جداً + HMR (تحديث فوري) |
| **TypeScript** | JavaScript + أنواع = أخطاء أقل |
| **React** | مكتبة بناء الواجهات |
| **react-router-dom** | التوجيه بين الصفحات |
| **Zustand** | إدارة الحالة (بديل بسيط لـ Redux) |
| **Firebase** | قاعدة بيانات + مصادقة + تخزين ملفات |
| **Tailwind CSS** | تنسيق سريع بالـ classes |
| **Recharts** | رسوم بيانية (أعمدة، خطوط، دوائر) |
| **xlsx (SheetJS)** | تصدير/استيراد Excel |
| **jsPDF** | إنشاء ملفات PDF |
| **html2canvas** | تصوير HTML كصورة |
| **file-saver** | تحميل ملفات من المتصفح |
| **react-to-print** | طباعة مباشرة |

---

## التشغيل

```bash
npm install        # تثبيت المكتبات
npm run dev        # تشغيل بيئة التطوير (localhost:3000)
npm run build      # بناء نسخة الإنتاج
```

---

> **نصيحة للمذاكرة:** ابدأ بقراءة `components/UI.tsx` (أبسط ملف) → ثم `ProtectedRoute.tsx` → ثم `App.tsx` → ثم اختار صفحة بسيطة زي `CostSettings.tsx` وحاول تفهمها سطر سطر. بعد كده افتح `useAppStore.ts` واقرأ action واحد (مثلاً `createReport`). لما تفهم دول — هتفهم أي صفحة في المشروع.
