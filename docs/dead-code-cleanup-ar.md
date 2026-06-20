# تنظيف الكود القديم غير المستخدم

تاريخ التنفيذ: يونيو 2026

## الهدف

إزالة بقايا التنفيذات الأولى التي استُبدلت بمسارات أحدث، مع الإبقاء على السلوك الحالي دون تغيير.

---

## ما تم حذفه

### 1. تكلفة المواد الشهرية — متغير ميت

**الملف:** `modules/costs/pages/MonthlyProductionCosts.tsx`

- حُذف `aggregated` الذي كان يُعرَّف ولا يُستخدم.
- المسار الفعّال: `lists` → `resolveProductMaterialCosts()` → `resolvedAggregated`.

### 2. عمال الإنتاج — واجهة تعديل غير قابلة للوصول

**الملف:** `modules/production/pages/ProductionWorkers.tsx`

- حُذف state `editing` ومسار `productionWorkerService.update` من القائمة.
- `setEditing(worker)` لم يكن موجوداً في أي مكان → فروع «تعديل عامل» و«عامل يدوي» كانت ميتة.
- النموذج أصبح **ربط موظف فقط**؛ التعديل من صفحة التفاصيل `/production-workers/:id`.

### 3. خدمات عمال الإنتاج — دوال بلا مستدعين

| الملف | المحذوف | السبب |
|-------|---------|--------|
| `productionWorkerService.ts` | `subscribe()` | لا يوجد أي استدعاء في المشروع |
| `workerPerformanceSummaryService.ts` | `get()` | لا يُقرأ من Firestore؛ `upsert` فقط من محرك الأداء |
| `collections.ts` | `workerPerformanceSummariesRef` | غير مستورد |
| `modules/production/index.ts` | re-export لـ `workerPerformanceSummaryService` | لا استيراد خارجي |

**ملاحظة:** `productionWorkerService.update()` بقي في الخدمة للاستخدام المستقبلي من صفحة التفاصيل.

### 4. مشاركة واتساب — توحيد التقاط بطاقة التقرير

**الملف الجديد المشترك:** `src/shared/utils/exportNodeToImage.ts` → `captureNodeAndShareToWhatsApp`

- دمج منطق مكرر كان في `Reports.tsx` و `QuickAction.tsx`:
  - `waitForExportPaint(250)`
  - `exportNodeToPng` + timeout 20 ثانية
  - `shareImageBlobToWhatsApp`
- **لم يُدمج** مسار المشاركة الجماعية (`shareToWhatsApp` + `html2canvas`) لأنه يلتقط DOM مختلف (تقارير متعددة).

---

## ما لم يُحذف (عمداً)

| العنصر | السبب |
|--------|--------|
| `line_worker_assignments` / صفحة `/line-workers` | مسار يومي للمشرف؛ ليس بديلاً لعمال الإنتاج الجدد |
| `product_materials` | ما زال fallback للـ BOM القديم حتى اكتمال الترحيل |
| `worker_performance_summaries` + `upsert` | كتابة تلقائية عند فتح الأداء؛ قراءة لاحقة محتملة |
| مساران للصلاحيات `productionWorkers.view` و `production.workers.view` | توافق مع أدوار قديمة |

---

## الملفات الملموسة

```
modules/costs/pages/MonthlyProductionCosts.tsx
modules/production/pages/ProductionWorkers.tsx
modules/production/services/productionWorkerService.ts
modules/production/services/workerPerformanceSummaryService.ts
modules/production/collections.ts
modules/production/index.ts
modules/production/pages/Reports.tsx
modules/production/pages/QuickAction.tsx
src/shared/utils/exportNodeToImage.ts
```

---

## مراجع

- إصلاح مشاركة واتساب: [whatsapp-share-fix-ar.md](./whatsapp-share-fix-ar.md)
- شرح تكلفة المواد الداخلية: `modules/costs/services/internalManufacturedMaterialCostService.ts`
