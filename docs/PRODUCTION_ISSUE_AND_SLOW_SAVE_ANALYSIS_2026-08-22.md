# تحليل مشكلتين + خطة عمل — production-line
**تاريخ:** 2026-08-22 · **مبني على فحص الكود + تاريخ Git + التغييرات غير المحفوظة (uncommitted) في المشروع**

---

## 1) مشكلة "صرف الإنتاج مش بيوصل للمخزن المتحدد"

### الخلاصة
هذا باگ حقيقي، وهو **بالفعل تحت الإصلاح دلوقتي** — لقيت 3 كوميتات اتعملت النهاردة بعنوان "solve werehouse for floor production" (الساعة 09:11، 09:17، 09:20) + تعديلات إضافية **لسه مش متحفوظة (uncommitted)** في نفس الملفات. يعني حد كان شغال على نفس المشكلة فعليًا.

### السبب الجذري
المشكلة بتظهر بالتحديد مع المستخدمين **"المقفولين" على مخزن واحد** (`users.inventoryWarehouseId`) — وهو نفس الوصف اللي قلته. في نقطتين تكسير:

1. **`resolveProductionFloorWarehouse` كان يستخدم `getAllWarehouses()`** (قراءة List) لجلب مخزن "صالة الإنتاج" المستهدف.
   قاعدة الـ Firestore بتمنع أي `list` على `warehouses` للمستخدم المقفول على مخزن واحد (`firestore.rules` — `pl_isInventoryWarehouseBound()` تمنع `list`، تسمح بـ `get` فقط).
   → أي مستخدم مقفول كان بيفضل يطلع له **Permission Denied** لحظة تحديد المخزن الهدف، فالصرف ما كان يوصلش أبدًا للمخزن الهدف (حتى لو كان محدد صح في الإعدادات).
   ✅ **تم إصلاحه فعلاً** في كوميت `323fd31` (09:11) — استخدام `warehouseService.getById(floorId)` (قراءة `get` مسموحة) بدل القائمة الكاملة، مع fallback لو المخزن غير موجود في الكاتالوج ظاهريًا لكن الـ ID صحيح (`modules/inventory/lib/resolveProductionFloorWarehouse.ts`).

2. **تخصيص رقم إذن الصرف (`allocateNextProductionIssueReference`)** كان بيعمل fallback بمسح كل مستندات `production_issue_orders` (`getDocs` بدون فلتر) لو فيه خطأ في العداد.
   ده كمان List query ممنوع على المستخدم المقفول → لو حصل أي تعطل في العداد، المستخدم المقفول يطلع له خطأ صلاحيات ويفشل إنشاء/اعتماد الصرف بالكامل.
   🟡 **موجود حاليًا كتعديل غير محفوظ (uncommitted)** في `modules/inventory/services/productionIssueSequence.ts` — بيشيل الفallback ده ويعتمد بس على إعادة seed للعداد + transaction تاني.

3. **صلاحيات دالة Cloud Function (`functions/src/productionIssueStock.ts`)** — `hasPermission` كانت بتتحقق من مفتاح صلاحية واحد بس (`productionIssue.approve` مثلاً)، لكن أدوار زي "مسؤول مخزن المستلزمات" غالبًا معرّفة بمفاتيح صلاحيات مختلفة (`inventory.transfers.approve` / `inventory.transactions.create`).
   لو المفتاح غير متطابق 100%، السيرفر يرفض الطلب بـ `permission-denied` — يعني إذن الصرف يتعمل في الواجهة لكن **حركة المخزون الفعلية (اللي بتحرك الكمية للمخزن الهدف) ما بتتنفذش على السيرفر**، فيبان للمستخدم إن "الصرف موجود بس المخزون مش زاد في المخزن المطلوب".
   🟡 **موجود حاليًا كتعديل غير محفوظ** — إضافة `PERMISSION_ALIASES` لمطابقة صلاحيات العميل بالسيرفر.

4. بالإضافة لتعديل في `ProductionIssues.tsx` (uncommitted) بيلف كل نداءات الكاتالوج (`getActiveWarehouses`, `fetchWorkOrders`, `fetchProductionPlans`...) بـ `.catch()` بحيث فشل نداء واحد (بسبب صلاحيات مستخدم مقفول على مخزن) ما يوقفش الصفحة كلها.

### الحالة الآن
كل التعديلات دي **مش متعمل لها commit ولا deploy للـ Cloud Functions**. يعني لو الفريق مجرب يستخدم الصرف دلوقتي، هو لسه شغال على النسخة القديمة اللي فيها المشكلة (خصوصًا نقطة 2 و3)، أو نسخة نص متصلحة محليًا بس مش لايف.

### المطلوب (بالترتيب)
1. مراجعة الـ diff الحالي غير المحفوظ في: `functions/src/productionIssueStock.ts`, `modules/inventory/services/productionIssueSequence.ts`, `modules/inventory/pages/ProductionIssues.tsx`, `store/useAppStore.ts` — والتأكد إنها متوافقة مع مفاتيح الصلاحيات الحقيقية في جدول `roles` بتاعك (مطابقة `PERMISSION_ALIASES` الجديدة).
2. `npm run build` لمجلد `functions` (تأكدت إن `functions/lib/productionIssueStock.js` أحدث من المصدر، يعني أُعمل build بالفعل — لكن لازم build نهائي بعد آخر تعديل).
3. `git commit` للتعديلات، بعدين **`firebase deploy --only functions`** — لأن مشكلة الصلاحيات (نقطة 3) لن تُحل إلا بعد نشر الدالة الجديدة.
4. اختبار حقيقي بحساب مستخدم **مقفول على مخزن واحد** (نفس الوضع اللي وصفته) لعملية صرف إنتاج كاملة: إنشاء → اعتماد/إصدار → تأكد إن الكمية زادت فعليًا في مخزن صالة الإنتاج.

---

## 2) مشكلة "تقرير الإنتاج بيتأخر جدًا في الحفظ"

### الخلاصة
سبب واضح: **حفظ التقرير من المتصفح بيعمل سلسلة من رحلات الشبكة المتتالية (sequential round-trips) لـ Firestore**، بينما فيه دالة سيرفر جاهزة ("Fast path") بتعمل نفس الشغل في نداء واحد **لكنها مش متستخدمة في أي مكان بالتطبيق**.

### التفاصيل
مسار الحفظ الحالي (`modules/production/services/reportService.ts` → `create`) بيعمل بالترتيب (كل خطوة = رحلة شبكة مستقلة من المتصفح):

1. `assertProductionProductId` لكل صنف — ولو فيه خطوط تعبيء (`packagingLines`) بتتفحص **واحدة ورا واحدة بـ `await` داخل loop** (مش `Promise.all`)، يعني كل خط تعبيء إضافي = تأخير إضافي.
2. `generateNextReportCode()` — نداء/transaction مستقل لتوليد كود التقرير.
3. `runTransaction` لفحص تكرار المفتاح (unique key) وحفظ التقرير.
4. `productionAttendanceService.replaceForReport(...)` — استبدال سجلات الحضور المرتبطة بالتقرير (queries/writes إضافية).
5. بعد كل ده، الاستدعاء من `store/useAppStore.ts` (اللي فيه المنطق الفعلي للحفظ في الواجهة، مش الـ usecase النظيف) بيكمل بعدها بتأثيرات المخزون وتحديث الكاش — خطوات إضافية بعد نقطة الحفظ.

بمعنى: عملية حفظ تقرير واحدة ممكن تبقى ٦-٨ رحلات شبكة متتالية بدل رحلة واحدة — وده اللي يوريك التأخير خصوصًا على شبكة مصنع ضعيفة.

### الاكتشاف المهم
فيه فعلاً **Cloud Function جاهزة اسمها `createProductionReportFast`** (`functions/src/productionReportFast.ts` + `createProductionReportFastCallable` في `modules/auth/services/firebase.ts`) بتعمل كل الفحوصات والحفظ **على السيرفر في نداء واحد فقط**. لكن لما بحثت في المشروع كله، **مفيش أي صفحة أو ستور بيستخدمها فعليًا** — هي موجودة "جاهزة على الرف" بس لسه مش متوصّلة بالواجهة (`Reports.tsx` / `QuickAction.tsx` لسه بتنده على `reportService.create` القديم عن طريق `store/useAppStore.ts`).

### المطلوب (بالترتيب)
1. **الأسرع والأكثر تأثيرًا:** وصل صفحات حفظ التقرير (`Reports.tsx`, `QuickAction.tsx`, ومسار إقفال أمر الشغل في `store/useAppStore.ts` سطر ~2625) لاستدعاء `createProductionReportFastCallable` بدل `reportService.create` مباشرة. غالبًا هيحوّل الحفظ من ٦-٨ رحلات لرحلة واحدة.
2. لو فيه حاجة لسه محتاجة `reportService.create` (مثلاً حالات خاصة الفانكشن الجديدة مش غطياها)، على الأقل حوّل `for (const line of packagingLines) { await ... }` إلى `Promise.all(...)` — تحسين بسيط ومضمون فورًا.
3. اتأكد إن `createProductionReportFast` بيغطي كل أنواع التقارير المستخدمة فعليًا (finished_product / component_injection / packaging / component_waste) قبل الاعتماد عليها بالكامل — من قراية الكود هي بتغطيهم.
4. بعد التحويل، قيس زمن الحفظ الفعلي (قبل/بعد) على نفس الشبكة اللي بيشتكي منها المستخدمين.

---

## 3) فهم المشروع وتقسيمه

### البنية العامة (متفق عليها في `ARCHITECTURE_MAP.md`)
`UI (pages/components) → usecases/store → services → Firebase`
المفروض الصفحات ما تنادي Firebase مباشرة، والمنطق التجاري يكون في `usecases` مش في الواجهة.

**الواقع الحالي:** الالتزام بالقاعدة دي جزئي. `store/useAppStore.ts` لسه ملف واحد ضخم (~180K حرف) بيحتوي منطق تجاري مباشر لعشرات الشاشات (ده موصوف في `PROJECT_STATUS.md` بتاريخ 2026-05-21 كـ "مكتمل" لكنه فعليًا نقطة ضعف معمارية متراكمة). المشكلتين اللي فوق (الصرف + التقرير) الاتنين ليهم علاقة بمسارات لسه بتعدي من الستور الضخم مباشرة، مش من `usecases` نظيفة.

### تقسيم الموديولات حسب الحجم (مؤشر على مركز الثقل الفعلي في الكود)

| الموديول | الحجم التقريبي | ملاحظة |
|---|---|---|
| `production` | 2.8M | الأكبر — تقارير، خطط، أوامر شغل، دورات توريد |
| `inventory` | 2.2M | مخازن، صرف إنتاج، تحويلات، جرد — أكثر منطق صلاحيات/قواعد Firestore تعقيدًا |
| `repair` | 2.0M | صيانة/قطع غيار — تم شغل عليه مؤخرًا (فروع، مركز اتصال) |
| `hr` | 1.5M | رواتب، حضور، طلبات |
| `system` | 780K | صلاحيات، أدوار، إعدادات |
| `dashboards` | 548K | لوحات تحكم تحليلية |
| `costs` | 444K | مراكز تكلفة |
| `manufacturing` | 344K | Materials/BOM — طبقة جديدة نسبيًا (2026-05)، فيها حقول read-only لهجرة قديمة |
| `customers`, `quality`, `catalog`, `auth`, `shared`, `super-admin`, `accounting`, `reports` | أصغر | دعم/تخصصية |

### مستندات موجودة بالفعل تستحق تحديث
- `PROJECT_STATUS.md` تاريخه 2026-05-21 — قديم مقارنة بحجم الكوميتات اليومية الحالية (أكتر من 20 كوميت في يوم واحد النهاردة لوحده). يفضل يتحدث دوري وإلا يفقد قيمته كمرجع.
- `CLEANUP_PLAN.md` / `DEPRECATION_MAP.md` / `MIGRATION_DECISIONS_LOG.md` موجودين ويستحقوا مراجعة لمعرفة هل الباگين دول (الصرف + التقرير) متسجلين فيهم أو محتاجين يتسجلوا كـ "ديون تقنية" رسمية.

---

## 4) خطة العمل المقترحة (مرتبة بالأولوية)

**فورًا (اليوم):**
1. اختبار ونشر (deploy) تعديلات الصرف غير المحفوظة — ده بلوكر حقيقي لأي مستخدم مقفول على مخزن.
2. commit للتعديلات دي بعد التأكد منها (بدل ما تفضل uncommitted وعرضة للضياع).

**قريب (هذا الأسبوع):**
3. تحويل حفظ تقرير الإنتاج لاستخدام `createProductionReportFast`.
4. اختبار قياسي لزمن الحفظ قبل/بعد على نفس نوع الشبكة في المصنع.

**متوسط المدى:**
5. تفريغ منطق حفظ التقرير + صرف الإنتاج من `store/useAppStore.ts` إلى `usecases` مخصصة (زي اللي حصل بالفعل لـ `createProductionIssueRequest`) — تقليل تكرار المشكلة دي في المستقبل.
6. تحديث `PROJECT_STATUS.md` ليعكس شغل الأسابيع الأخيرة.

---

**ملفات رئيسية اتفحصت في هذا التحليل:**
`firestore.rules`, `modules/inventory/lib/resolveProductionFloorWarehouse.ts`, `modules/inventory/services/productionIssueService.ts`, `modules/inventory/services/productionIssueSequence.ts`, `modules/inventory/pages/ProductionIssues.tsx`, `modules/inventory/hooks/useMaterialsWarehouseScope.ts`, `modules/inventory/hooks/useRawMaterialWarehouse.ts`, `functions/src/productionIssueStock.ts`, `modules/production/services/reportService.ts`, `functions/src/productionReportFast.ts`, `modules/auth/services/firebase.ts`, `ARCHITECTURE_MAP.md`, `PROJECT_STATUS.md`.
