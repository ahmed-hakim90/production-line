# 📘 مثال عملي — إضافة موديول حسابات وربطه بالإنتاج

## الفكرة

عندك دلوقتي نظام إنتاج شغّال:

```
products → production_lines → production_reports → supervisors
```

عايز تضيف **موديول حسابات** (مصاريف، إيرادات، تكلفة إنتاج). والمهم: **يكون مربوط بالإنتاج**. يعني لما المشرف يسجل تقرير إنتاج → النظام يعرف تكلفة الإنتاج ده تلقائي.

---

## الخطوة 0 — فكّر في البيانات الأول

قبل ما تكتب أي كود، ارسم العلاقات:

```
┌──────────────┐         ┌──────────────────┐
│   products   │────────→│  product_costs   │  تكلفة كل منتج (خامات + عمالة)
└──────────────┘         └──────────────────┘
                                  │
┌──────────────────┐              ↓
│production_reports│────→ حساب تكلفة الإنتاج التلقائي
└──────────────────┘              ↓
                         ┌──────────────────┐
                         │   transactions   │  كل حركة مالية (مصاريف / إيرادات)
                         └──────────────────┘
                                  ↓
                         ┌──────────────────┐
                         │    Dashboard     │  ملخص مالي (ربح، خسارة، تكلفة)
                         └──────────────────┘
```

**الربط بين الموديولين** هو:

- **`product_costs`** → كل منتج ليه تكلفة (خامات + عمالة لكل وحدة)
- **`production_reports`** → لما تقرير إنتاج يتعمل، بنحسب: `الكمية × تكلفة الوحدة = تكلفة الإنتاج`
- **`transactions`** → كل حركة مالية (شراء خامات، بيع منتجات، مصاريف تشغيل)

---

## الخطوة 1 — أضف الـ Types في `types.ts`

```typescript
// ═══════════════════════════════════════════
// موديول الحسابات
// ═══════════════════════════════════════════

/** تكلفة منتج واحد */
export interface ProductCost {
  id?: string;
  productId: string;          // ← ربط بالمنتج (من collection products)
  materialCostPerUnit: number; // تكلفة خامات لكل وحدة
  laborCostPerUnit: number;    // تكلفة عمالة لكل وحدة
  overheadPerUnit: number;     // مصاريف إضافية لكل وحدة
  updatedAt?: any;
}

/** أنواع الحركات المالية */
export type TransactionType = 'income' | 'expense' | 'production_cost';

/** فئات الحركات */
export type TransactionCategory =
  | 'مبيعات'
  | 'شراء خامات'
  | 'رواتب'
  | 'صيانة'
  | 'إيجار'
  | 'تكلفة إنتاج'  // ← تتولد تلقائي من تقارير الإنتاج
  | 'أخرى';

/** حركة مالية واحدة */
export interface Transaction {
  id?: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  date: string;               // "2026-02-16"
  referenceId?: string;       // ← ربط (مثلاً ID تقرير الإنتاج)
  referenceType?: 'production_report' | 'manual';
  createdBy: string;          // userId
  createdAt?: any;
}

/** ملخص مالي لفترة */
export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  totalProductionCost: number;
  netProfit: number;          // totalIncome - totalExpenses - totalProductionCost
}
```

**لاحظ الربط:**

- `ProductCost.productId` → بيشاور على منتج موجود في `products` collection
- `Transaction.referenceId` → ممكن يشاور على `production_report` (ربط مع الإنتاج)
- `Transaction.referenceType` → بيقولك الحركة دي جت منين (يدوية ولا من إنتاج)

---

## الخطوة 2 — أنشئ الـ Services

### `services/productCostService.ts`

```typescript
import { db, isConfigured } from './firebase';
import {
  collection, doc, getDoc, getDocs,
  setDoc, serverTimestamp
} from 'firebase/firestore';
import type { ProductCost } from '../types';

const COLLECTION = 'product_costs';

export const productCostService = {
  async getAll(): Promise<ProductCost[]> {
    if (!isConfigured) return [];
    const snap = await getDocs(collection(db!, COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductCost));
  },

  async getByProductId(productId: string): Promise<ProductCost | null> {
    if (!isConfigured) return null;
    // doc ID = productId عشان كل منتج ليه تكلفة واحدة بس
    const snap = await getDoc(doc(db!, COLLECTION, productId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as ProductCost : null;
  },

  async set(productId: string, data: Omit<ProductCost, 'id' | 'productId'>): Promise<void> {
    if (!isConfigured) return;
    await setDoc(doc(db!, COLLECTION, productId), {
      productId,
      ...data,
      updatedAt: serverTimestamp(),
    });
  },
};
```

**لاحظ:** الـ doc ID هو `productId` — يعني كل منتج ليه document واحد بس. ده أبسط من إنك تعمل query في كل مرة.

### `services/transactionService.ts`

```typescript
import { db, isConfigured } from './firebase';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, where, orderBy, serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import type { Transaction } from '../types';

const COLLECTION = 'transactions';

export const transactionService = {
  async getAll(): Promise<Transaction[]> {
    if (!isConfigured) return [];
    const q = query(collection(db!, COLLECTION), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  },

  async getByDateRange(start: string, end: string): Promise<Transaction[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db!, COLLECTION),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  },

  async create(data: Omit<Transaction, 'id'>): Promise<string> {
    if (!isConfigured) return '';
    const ref = await addDoc(collection(db!, COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(id: string, data: Partial<Transaction>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db!, COLLECTION, id), data);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(db!, COLLECTION, id));
  },

  // ← دي المهمة: إنشاء حركة تلقائية من تقرير إنتاج
  async createFromReport(
    reportId: string,
    productId: string,
    quantity: number,
    costPerUnit: number,
    userId: string,
    date: string,
  ): Promise<string> {
    const totalCost = quantity * costPerUnit;
    return this.create({
      type: 'production_cost',
      category: 'تكلفة إنتاج',
      amount: totalCost,
      description: `تكلفة إنتاج ${quantity} وحدة`,
      date,
      referenceId: reportId,
      referenceType: 'production_report',
      createdBy: userId,
    });
  },
};
```

**`createFromReport`** — دي function بتاخد بيانات تقرير الإنتاج وتحسب التكلفة وتسجلها كحركة مالية. هنستدعيها من الـ Store.

---

## الخطوة 3 — وسّع الـ Store

### أضف State جديد

```typescript
// في useAppStore.ts — جوه create(...)
// ══ حسابات ══
productCosts: [] as ProductCost[],
transactions: [] as Transaction[],
financialSummary: null as FinancialSummary | null,
accountsLoading: false,
```

### أضف Actions

```typescript
// ── جلب التكاليف ──
fetchProductCosts: async () => {
  const costs = await productCostService.getAll();
  set({ productCosts: costs });
},

// ── تحديث تكلفة منتج ──
updateProductCost: async (productId, data) => {
  await productCostService.set(productId, data);
  await get().fetchProductCosts();
  get()._logActivity('UPDATE_PRODUCT_COST', `تحديث تكلفة منتج`, { productId });
},

// ── جلب الحركات المالية ──
fetchTransactions: async (start?, end?) => {
  set({ accountsLoading: true });
  const txns = start && end
    ? await transactionService.getByDateRange(start, end)
    : await transactionService.getAll();
  const summary = calculateFinancialSummary(txns);
  set({ transactions: txns, financialSummary: summary, accountsLoading: false });
},

// ── إنشاء حركة مالية يدوية ──
createTransaction: async (data) => {
  const id = await transactionService.create({
    ...data,
    createdBy: get().uid!,
  });
  await get().fetchTransactions();
  get()._logActivity('CREATE_TRANSACTION', data.description, { transactionId: id });
  return id;
},

// ── حذف حركة مالية ──
deleteTransaction: async (id) => {
  await transactionService.delete(id);
  await get().fetchTransactions();
  get()._logActivity('DELETE_TRANSACTION', 'حذف حركة مالية', { transactionId: id });
},
```

### **الربط السحري — تعديل `createReport` الموجود**

```typescript
// في action createReport الموجود:
createReport: async (data) => {
  // 1. احفظ التقرير (زي ما هو)
  const id = await reportService.create(data);

  // 2. ═══ الجديد: سجّل تكلفة الإنتاج تلقائي ═══
  const cost = get().productCosts.find(c => c.productId === data.productId);
  if (cost) {
    const costPerUnit = cost.materialCostPerUnit
                      + cost.laborCostPerUnit
                      + cost.overheadPerUnit;

    await transactionService.createFromReport(
      id,                       // referenceId = التقرير
      data.productId,
      data.quantityProduced,
      costPerUnit,
      get().uid!,
      data.date,
    );
  }

  // 3. حدّث البيانات (زي ما هو)
  await refreshReports();
  get()._logActivity('CREATE_REPORT', '...');
  return id;
},
```

**ده هو الربط!** لما مشرف يعمل تقرير إنتاج → الـ Store بيشوف تكلفة المنتج → بيسجل حركة مالية تلقائي. الصفحة مش بتعمل أي حاجة إضافية — الربط كله في الـ Store.

### Helper لحساب الملخص المالي

```typescript
// ممكن تحطه في utils/calculations.ts
function calculateFinancialSummary(transactions: Transaction[]): FinancialSummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalProductionCost = 0;

  for (const txn of transactions) {
    if (txn.type === 'income') totalIncome += txn.amount;
    else if (txn.type === 'expense') totalExpenses += txn.amount;
    else if (txn.type === 'production_cost') totalProductionCost += txn.amount;
  }

  return {
    totalIncome,
    totalExpenses,
    totalProductionCost,
    netProfit: totalIncome - totalExpenses - totalProductionCost,
  };
}
```

---

## الخطوة 4 — أضف الصلاحيات

### في `utils/permissions.ts`

```typescript
// أضف صلاحيات جديدة في type Permission
export type Permission =
  | /* ... الموجودين */
  | 'accounts.view'
  | 'accounts.create'
  | 'accounts.edit'
  | 'accounts.delete'
  | 'productCosts.edit';

// أضف guards في usePermission()
canViewAccounts: can('accounts.view'),
canManageAccounts: can('accounts.create') || can('accounts.edit'),
canEditProductCosts: can('productCosts.edit'),

// أضف في SIDEBAR_ITEMS
{ path: '/accounts', icon: 'account_balance', label: 'الحسابات', permission: 'accounts.view' },
{ path: '/product-costs', icon: 'payments', label: 'تكاليف المنتجات', permission: 'productCosts.edit' },
```

### حدّث الأدوار الافتراضية في `services/roleService.ts`

```typescript
// المدير — كل الصلاحيات
'accounts.view': true,
'accounts.create': true,
'accounts.edit': true,
'accounts.delete': true,
'productCosts.edit': true,

// مشرف الصالة — يشوف بس
'accounts.view': true,
'accounts.create': false,
// ...

// المشرف — مالوش صلاحيات حسابات
'accounts.view': false,
// ...
```

---

## الخطوة 5 — أنشئ الصفحات

### `pages/Accounts.tsx` — صفحة الحركات المالية

```
┌──────────────────────────────────────────────────────┐
│  الحسابات                          [+ حركة جديدة]   │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ إيرادات  │ │ مصاريف   │ │ تكلفة    │ │ صافي    │ │
│  │ 150,000  │ │ 45,000   │ │ إنتاج    │ │ الربح   │ │
│  │          │ │          │ │ 80,000   │ │ 25,000  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
├──────────────────────────────────────────────────────┤
│  فلتر: [الكل ▾] [من تاريخ] [إلى تاريخ] [بحث]      │
├──────────────────────────────────────────────────────┤
│  📅 2026-02-16  │ تكلفة إنتاج │ 5,000 ج │ تلقائي    │
│  📅 2026-02-16  │ شراء خامات  │ 2,000 ج │ يدوي      │
│  📅 2026-02-15  │ مبيعات      │ 8,000 ج │ يدوي      │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

الكود الأساسي:

```typescript
const Accounts = () => {
  const { transactions, financialSummary, fetchTransactions,
          createTransaction, deleteTransaction } = useAppStore();
  const { canManageAccounts } = usePermission();

  useEffect(() => { fetchTransactions(); }, []);

  return (
    <div>
      {/* 4 كروت KPI: إيرادات، مصاريف، تكلفة إنتاج، صافي ربح */}
      {/* فلتر بالنوع والتاريخ */}
      {/* جدول الحركات */}
      {/* الحركات التلقائية (من الإنتاج) تظهر بأيقونة مختلفة */}
      {canManageAccounts && <Button onClick={...}>+ حركة جديدة</Button>}
    </div>
  );
};
```

### `pages/ProductCosts.tsx` — صفحة تكاليف المنتجات

```
┌──────────────────────────────────────────────────────┐
│  تكاليف المنتجات                                     │
├──────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐    │
│  │ منتج A                                       │    │
│  │ خامات: 10 ج  │  عمالة: 5 ج  │  إضافي: 2 ج  │    │
│  │ الإجمالي لكل وحدة: 17 ج                      │    │
│  │                               [تعديل]        │    │
│  └──────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────┐    │
│  │ منتج B                                       │    │
│  │ خامات: 15 ج  │  عمالة: 7 ج  │  إضافي: 3 ج  │    │
│  │ الإجمالي لكل وحدة: 25 ج                      │    │
│  │                               [تعديل]        │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

هنا بتحدد تكلفة كل منتج. لما تقرير إنتاج يتعمل، النظام بيستخدم الأرقام دي تلقائي.

---

## الخطوة 6 — أضف الـ Routes في `App.tsx`

```typescript
<Route path="/accounts" element={
  <ProtectedRoute permission="accounts.view">
    <Accounts />
  </ProtectedRoute>
} />
<Route path="/product-costs" element={
  <ProtectedRoute permission="productCosts.edit">
    <ProductCosts />
  </ProtectedRoute>
} />
```

---

## الخطوة 7 — حدّث Firestore Rules

```javascript
match /product_costs/{productId} {
  allow read: if isActiveUser();
  allow write: if hasPermission('productCosts.edit');
}

match /transactions/{docId} {
  allow read: if hasPermission('accounts.view');
  allow create: if hasPermission('accounts.create')
                || hasPermission('reports.create');  // ← للحركات التلقائية
  allow update: if hasPermission('accounts.edit');
  allow delete: if isAdmin();
}
```

لاحظ: `reports.create` مسموح يعمل create في transactions — عشان لما المشرف يعمل تقرير إنتاج، الـ Store بيسجل حركة مالية تلقائي.

---

## الخطوة 8 — حمّل البيانات في `_loadAppData`

```typescript
_loadAppData: async () => {
  // الموجود
  const [products, lines, supervisors, ...] = await Promise.all([
    productService.getAll(),
    lineService.getAll(),
    supervisorService.getAll(),
    // ...
  ]);

  // ═══ الجديد ═══
  const productCosts = await productCostService.getAll();

  set({
    // ... الموجود
    productCosts,
  });
},
```

---

## ملخص — إزاي الربط بيشتغل؟

```
┌────────────────────────────────────────────────────────────────┐
│                     تقرير إنتاج جديد                          │
│                                                                │
│  المشرف يضغط "حفظ" في صفحة التقارير أو الإدخال السريع        │
│                          ↓                                      │
│  Store.createReport(data)                                      │
│                          ↓                                      │
│  1. reportService.create(data)  → يحفظ التقرير في Firestore    │
│                          ↓                                      │
│  2. productCosts.find(productId) → يجيب تكلفة الوحدة           │
│                          ↓                                      │
│  3. transactionService.createFromReport(...)                    │
│     → يحفظ حركة مالية نوعها 'production_cost'                  │
│     → مربوطة بالتقرير عن طريق referenceId                      │
│                          ↓                                      │
│  4. _logActivity('CREATE_REPORT', ...)                          │
│                          ↓                                      │
│  ✅ التقرير + الحركة المالية + اللوج — كله تلقائي              │
│                                                                │
│  المشرف ماعملش غير "حفظ" — الباقي كله الـ Store عمله          │
└────────────────────────────────────────────────────────────────┘
```

---

## القاعدة الذهبية للربط بين الموديولات

```
1. Types:         أضف referenceId / foreignKey يشاور على الموديول التاني
2. Service:       أضف function خاصة بالربط (مثل createFromReport)
3. Store:         في الـ action الموجود — استدعِ الـ service الجديد
4. الصفحة:        مش بتعرف أي حاجة عن الربط — بتستدعي action واحد بس
```

**مثال على أنواع ربط تانية ممكن تعملها:**

| الموديول الجديد | الربط مع الإنتاج | إزاي |
|----------------|------------------|------|
| حسابات | تقرير إنتاج → حركة مالية تلقائية | `createReport` يستدعي `transactionService` |
| مخازن | تقرير إنتاج → يزود المخزون | `createReport` يستدعي `inventoryService.addStock(...)` |
| صيانة | خط إنتاج → طلب صيانة | `maintenanceService` بياخد `lineId` كـ reference |
| جودة | تقرير إنتاج → فحص جودة | `qualityService` بياخد `reportId` كـ reference |

الفكرة واحدة دايماً: **الـ Store هو نقطة الربط** — الصفحات مش بتعرف بعض، بس الـ Store بيربط بينهم.
