# تقرير مراجعة وتنظيف المشروع — أغسطس 2026

## الخلاصة

مراجعة مركّزة لإزالة ملفات/أكواد ميتة وإصلاح تضاربات إعدادات عالية الأثر دون لمس مسارات Inventory V2 أو قواعد Firestore أو pipelines المخزن في `useAppStore`.

---

## ما تم إصلاحه (تضارب)

### 1) افتراضات الموافقة على إدخال الإنتاج

| الحقل | قبل | بعد |
|-------|-----|-----|
| `planSettings.requireFinishedStockApprovalForReports` | `true` | `false` |
| `planSettings.inventoryRouting.requireApprovalForProductionEntry` | `false` | بدون تغيير |

**لماذا:** المستندان يعبّران عن نفس السياسة تقريباً. الافتراضات المتضاربة كانت تجعل المستأجر الجديد يرى موافقة مطلوبة من مسار legacy ومُعطّلة من مسار الـ routing — سلوك غير متوقع عند أول حفظ/مزامنة.

**القرار:** توحيد الافتراض على `false` (opt-in للموافقة)، مع الإبقاء على أن `syncPlanSettingsWarehouseRouting` يُبقي الحقلين متزامنين بعد الدمج.

### 2) `resolvePlanSettings` يستدعي المزامنة دائماً

في `modules/system/lib/resolveSystemSettings.ts` أصبح كل مسار يمر عبر `resolvePlanSettings` ينتهي بـ `syncPlanSettingsWarehouseRouting`.

**لماذا:** شاشات/مسارات تقرأ الحقول legacy وأخرى تقرأ `inventoryRouting`. بدون مزامنة عند التحميل، يمكن أن يظهر تضارب مؤقت حتى يضغط المستخدم «حفظ».

### 3) إزالة غلاف ميت في الـ store

حُذف `resolveInventoryRouting` المحلي المهمل في `store/useAppStore.ts` (كان معلّماً `@deprecated` وبدون مستدعين). المسار الحي هو `resolveInventoryRoutingV1Async`.

### 4) صدق واجهة الصفحة الرئيسية الافتراضية

التعليقات ونص الإعدادات أوضحا أن الـ allowlist حالياً `''` / `/` فقط، وأن المسار يسقط دائماً على لوحات الدور.

**لماذا:** التعليق السابق أوحى بأن المسار المخصّص يعمل، بينما التنفيذ يعيد دائماً `null`.

### 5) تعليقات/وثائق قديمة `system_settings/global`

حُدّثت إلى `system_settings/{tenantId}` في:

- `ProductionReportPrint.tsx`
- `learn-dev.md`

---

## ما تم حذفه (آمن)

| الملف | السبب |
|-------|--------|
| `services/dashboardStatsService.ts` | لا مستوردين؛ موجود فقط كمرجع في `DEPRECATION_MAP` |
| `pages/TeamRequests.tsx` | shim غير مستورد؛ `App.tsx` يعيد توجيه `/team-requests` → `/production/requests` |
| `_p1_head.txt` | ملف scratch في جذر المشروع |
| `plan_production` | ملف scratch بدون امتداد/مرجع |
| `functions/lib/scripts/backfillItemsInventory.js` | ناتج مترجم يتيم (لا يوجد مصدر مقابل في `functions/src/scripts`) |

حُدّث `DEPRECATION_MAP.md` ليعكس الحذف.

---

## ما لم يُمس (عمداً)

| العنصر | السبب |
|--------|--------|
| `useAppStore` pipelines للمخزون/التقارير | خطر انحدار عالٍ؛ التنظيف الجراحي كافٍ |
| `firestore.rules` و callables Inventory V2 | خارج نطاق «تنظيف آمن» |
| dual-read لإعدادات HR / quality `global` | يبقى حتى إثبات اكتمال الـ backfill |
| re-exports تحت `services/*` المستخدمة | حذف جماعي يكسر الاستيرادات الحالية |
| redirect `/team-requests` | رابط قديم مفيد؛ حذف الـ shim فقط |

---

## التحقق

شُغّلت عبر `npx tsx` ونجحت:

- `tests/system-settings-contract.test.ts`
- `tests/sync-plan-settings-routing.test.ts`
- `tests/report-behavior-settings.test.ts`
- `tests/inventory-routing.test.ts`
- `tests/recommended-inventory-routing.test.ts`

---

## أثر على المستأجرين الحاليين

- المستأجرون الذين حفظوا مسبقاً `requireFinishedStockApprovalForReports: true` أو `requireApprovalForProductionEntry: true` **لا يتأثرون** — القيمة المحفوظة تفوز عند الدمج.
- المستأجرون الجدد أو من يعتمدون على الافتراضات فقط: الموافقة على إدخال الإنتاج **غير مفعّلة** افتراضياً (opt-in)، متسقة مع سياسة الـ routing.
