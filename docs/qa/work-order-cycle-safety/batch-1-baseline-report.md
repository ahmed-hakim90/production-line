# الدفعة الأولى — تثبيت الأمان وخط المقارنة (٢٠٢٦-٠٩-١٣)

## ١. المرجع المنشور فعليًا

حُدد بدليلين مستقلين، وليس افتراضًا:

- **الواجهة (Vercel):** آخر نشر Production جاهز (`production-line-ed6zopy4r`) يتبع alias يحمل `-git-main-`، وتاريخ إنشائه (2026-09-07 09:12:49 +03:00) يطابق — حتى الدقيقة — طابع commit `06a429b` (2026-09-07 09:12:25 +03:00)، وهو نفسه raftirst الأساس المشترك (`merge-base`) بين `main` وفرع العمل الحالي.
- **الخلفية (Firebase, مشروع `sokany-production` من `.firebaserc`):** `firebase functions:list --project sokany-production` (قراءة فقط، بلا أي كتابة أو نشر) لا يُظهر أي دالة من دوال الدورة الجديدة (`mutateWorkOrderCycle`, `getWorkOrderCycleWorkspace`, ولا أي دالة تحمل "quality"/"workorder" جديدة) — متسق مع كون `06a429b` سابقًا لكامل عمل هذا الفرع.

**الخلاصة:** المرجع = commit `06a429b` (main). كل فحص المقارنة أدناه استُخدم هذا الكوميت تحديدًا عبر `git worktree`، وليس افتراضًا.

لا تعديل تم على الإنتاج؛ الاتصال الوحيد بحسابات الإنتاج الحقيقية كان قراءة قائمة الدوال المنشورة وقراءة سجل نشر Vercel، بدون أي كتابة.

## ٢. تصنيف التغييرات (من `06a429b` إلى شجرة العمل الحالية، ٧٠+ ملفًا)

### أ) خاصة بالدورة الجديدة
`functions/src/workOrderCycle.ts`, `workOrderCycleRead.ts`, `workOrderCycleBoundary.ts`, `workOrderQualityValidation.ts` (وملفات `lib/*.js` المقابلة) · مكوّنات وصفحات `WorkOrderCycle*`, `QualityReportForm/TemplateEditor`, `QualityInspectionPanel`, `WorkOrderContainerCard` · `workOrderCycleService.ts`, `useWorkOrderCycle.ts`, `utils/workOrderCycle.ts`, `utils/workOrderHourlySlots.ts` · سكربتات seed الثلاثة · اختبارات `work-order-cycle*` · ADR-014/015/016/017 وملفات `docs/qa/work-order-cycle-*`.

### ب) مشتركة مع القديم — محل تركيز هذه الدفعة
- `functions/src/productionReportBackground.ts`, `productionReportFast.ts`, `productionReportInventory.ts`, `index.ts` (`aggregateProductionReports`): أُضيف استدعاء `assertLegacyReportOrder` في كل نقطة كتابة/قراءة حساسة. **تم تحقق فعلي** أنه no-op تام لأي أمر قديم (`cycleVersion` غير موجود أو ≠ 2).
- `firestore.rules` / `firestore/production-line.rules.fragment`: قواعد جديدة لحماية `work_orders`/`production_reports` المرتبطة بالدورة V2 من الكتابة المباشرة، بالإضافة إلى قواعد قراءة/كتابة `hourly_slots`. **تم تحقق** عبر `npm run test:rules` (نجح) وعبر نجاح إنشاء تقرير لأمر قديم ضمن نفس القواعد الفعلية في المحاكي.
- `modules/production/services/workOrderService.ts`: دالة `create` تحولت من `addDoc` إلى `writeBatch` (متوافقة رجوعًا لأي أمر بلا `hourlySlots`)، ودالة `getById` أصبحت تُنفّذ قراءة إضافية دائمة لمجموعة فرعية (`hourly_slots`) حتى للأوامر القديمة — **لا يكسر شيئًا لكنه يزيد قراءة واحدة لكل فتح لأمر شغل قديم**؛ يُترك مرصودًا لدفعة قياس الأثر (دفعة ٧).
- `modules/production/pages/WorkOrders/index.tsx`: في وضع المختبر فقط (`isFirebaseEmulatorMode`)، المسار `/work-orders` يعرض افتراضيًا واجهة الدورة الجديدة (`WorkOrderCycleTasks`) بدل القائمة القديمة، إلا مع `?legacy=1`. **لا أثر خارج المختبر** (تحقق من الشرط في الكود).
- `modules/auth/services/firebase.ts`, `index.tsx`: كود اتصال بالمحاكيات وشريط تنبيه، كله محكوم بـ`isFirebaseEmulatorMode` (لا يُفعَّل إلا مع `.env.lab`).
- `types.ts`, `utils/permissions.ts`, `WorkOrderDrawer.tsx`, `routes/index.ts`, لوحات `HomeDashboardRouter`/`SupervisorDashboard`: إضافات فقط (حقول/صلاحيات/مسارات اختيارية)، لا حذف أو تغيير لسلوك قديم. تحقّقتُ أن `WorkOrderCycleTasks` نفسه يعيد `null` خارج وضع المختبر، فلا تظهر أي واجهة دورة جديدة في لوحات الإنتاج الحقيقية.

### ج) إعدادات مختبر فقط
`.env.lab`, `firebase.lab.json` (جديد)، إضافات `package.json` (`dev:lab`, `emulators:lab`, `seed:lab*`, `test:work-order-cycle`)، وتحديث ADR-013 بخصوص نقل منفذ Firestore إلى 8085.

### د) خارج النطاق تمامًا (دفعة مختلطة، أقرّ بها ADR-017 نفسه)
`modules/manufacturing/pages/Materials.tsx`, `MaterialDetails.tsx`, `lib/materialCatalog.ts`, `lib/materialListFilters.ts`, `components/MaterialsMasterSummary.tsx`, `services/bomService.ts`, `modules/production/pages/Products.tsx` + اختباراتها (كتالوج الخامات/الفلاتر/أعمدة الجدول). لا علاقة لها بمسار تقارير الإنتاج أو المخزون أو دورة أمر الشغل. **توصية:** فصلها في PR مستقل قبل أي دمج، لأنها مجمّعة حاليًا مع تغييرات حساسة في نفس الفرع.

## ٣. جدول الاختبارات

| الفحص | المتوقع | الفعلي | النتيجة |
|---|---|---|---|
| `npm run typecheck` + `typecheck:functions` | يمر دون أخطاء | مرّ | ✅ (لا يُعتبر إثباتًا وظيفيًا، إعلامي فقط) |
| `npm run test:rules` | يمر (تجاهل رسائل PERMISSION_DENIED المتوقعة) | `Script exited successfully (code 0)` | ✅ |
| `npm run test:work-order-cycle` (integration + safety) | يمر | مرّ، بما فيه رفض المراقب غير المكلف، الحجز الحصري، ٦٠+٤٠ دون تكرار، فك الحجز، حدود التقارير القديمة | ✅ |
| `npm run test:inventory` (٢٩ ملف) | يمر | كل الملفات مرّت | ✅ |
| `hall-supervisor-reporting.test.ts` | يمر | مرّ | ✅ |
| **سيناريو مقارنة حي (جديد لهذه الدفعة):** إنشاء أمر شغل قديم + تقرير إنتاج سريع + معالجة خلفية حقيقية (حدث Firestore فعلي) + مضاعفة تجميع (`aggregateProductionReports`) + تطبيق/عكس مخزون، **في بيئتين محاكاة منفصلتين تمامًا** — المرجع `06a429b` عبر `git worktree` على منافذ 8180/5101، والمعدّل الحالي على منافذ 8186/5106 — بنفس بيانات السيناريو حرفيًا | تطابق تام لكل الحقول (الحالة، الكمية المنتجة، حالة الأمر، التكلفة، إجمالي الإنتاج المجمّع، عدد وقيم حركات المخزون) بين البيئتين | تطابق تام، لا فروقات | ✅ |
| تقديم نفس التقرير مرتين (نفس المفتاح الفريد) | يُرفض الثاني | رُفض بـ`already-exists` | ✅ لا تكرار عند إعادة الطلب |
| إعادة تشغيل `processProductionReportBackground` على تقرير مكتمل | لا تغيير في الكمية/التكلفة | لا تغيير (٤٠ ثابتة، لا مضاعفة) | ✅ لا تكرار عند إعادة المعالجة |
| إعادة كتابة نفس بيانات التقرير (حدث Firestore ثانٍ بلا تغيير قيمة) | لا يتحرك إجمالي الإنتاج المجمّع | ثابت (٤٠ قبل وبعد) | ✅ لا تكرار في التجميع |
| تطبيق المخزون ثم تطبيقه ثانية لنفس التقرير | التطبيق الثاني idempotent | `idempotent: true` | ✅ |
| عكس المخزون بعد التطبيق | ينجح، `inventoryAppliedAt` يُصفَّر | نجح | ✅ |

## ٤. ما لم يكتمل / لم يُختبر في هذه الدفعة

- **تطبيق المخزون الكامل عبر السلسلة التلقائية** (`autoApplyInventoryOnReportSave: true` مع BOM حقيقي وإذن صرف إنتاج معتمد): سيناريو المقارنة استخدم إعداد `autoApplyInventoryOnReportSave: false` + تعطيل شرط إذن الصرف، لعزل فحص المُرشد (guard) دون بناء تركيبة BOM/مخازن كاملة قد تُدخل أخطاء تجهيز خاصة بي وتُشوّه النتيجة. تطبيق/عكس المخزون نفسه اختُبر بشكل منفصل وناجح (تحويل بسيط بدون BOM). التغطية الكاملة لمسار BOM التلقائي تحتاج تركيبة أغنى — تُرشَّح لدفعة لاحقة أو لتوسيع هذه الدفعة إن رغبتم.
- لم أُفحص كل تعديلات `modules/manufacturing/*` و`Products.tsx` (المصنّفة "خارج النطاق")، لأنها غير متصلة بمسار الإنتاج/المخزون القديم بحسب الفحص، لا لأنها بلا أهمية.
- لم أُشغّل `npm run build` (بناء Vite الكامل) ولا مراجعة بصرية RTL لهذه الدفعة تحديدًا؛ الأدلة السابقة (ADR-017) شملت مراجعة بصرية للدفعة الأمنية السابقة فقط.
- عثرت على وأصلحت خللًا صغيرًا: `scripts/seed-work-order-quality-safety.mjs` كان يتحقق من منفذ Firestore `8080` فقط، وهو منفذ لم يعد المختبر يستخدمه بعد نقله إلى `8085`؛ عدّلته ليقبل المنفذين وتحققت من عمله فعليًا ضد المختبر الحي (أنشأ أمر سيناريو جديدًا بنجاح، دون المساس بأي بيانات سابقة).

## ٥. طريقة تجربة هذه الدفعة

هذه دفعة تحقق داخلي بالدرجة الأولى وليست ميزة واجهة، فلا يوجد سيناريو مستخدم جديد لتجربته. للتأكد يدويًا من المختبر:

```bash
npm --prefix functions run build
npm run emulators:lab   # طرفية منفصلة (يعمل بالفعل حاليًا على 127.0.0.1:8085)
npm run dev:lab -- --port 3010   # طرفية منفصلة (يعمل بالفعل حاليًا)
```
الدخول: `production-manager@forgeops.local` / `Lab123456!` على `http://localhost:3010`. لتصفح القائمة القديمة لأوامر الشغل داخل المختبر أضف `?legacy=1` لمسار `/work-orders`.

## ٦. بيانات المختبر

لم تُحذف أو تُعدَّل أي بيانات في مختبركم الحي (المنافذ 8085/9099/5001/9199 وخادم dev:lab على 3010 بقيت كما هي طوال الفحص). أخذتُ تصديرًا احتياطيًا كاملًا قبل أي عملية إضافية:

`docs/qa/work-order-cycle-safety/backups/lab-export-20260913-091740/`

للاستعادة عند الحاجة:
```bash
firebase emulators:start --config firebase.lab.json --project demo-production-line-lab --import docs/qa/work-order-cycle-safety/backups/lab-export-20260913-091740
```
بعد تشغيل الإصلاح التجريبي لسكربت الجودة، تمت إضافة أمر سيناريو واحد جديد فقط (`quality-safety-...`) للمختبر الحي — إضافي وغير مدمّر، ومتوافق مع سلوك السكربت الموثق (لا يستبدل أوامر سابقة).

## ٧. مانع الانتقال للدفعة الثانية؟

**لا يوجد مانع.** كل فحوصات المسار القديم (إنشاء/تعديل أمر شغل، تقرير إنتاج سريع، معالجة خلفية حقيقية، تقدّم الأمر والتكلفة، تطبيق/عكس مخزون، تجميع تقارير) تمت في بيئتين معزولتين بنفس بيانات السيناريو، وتطابقت تمامًا بين مرجع الإنتاج الفعلي (`06a429b`) والفرع الحالي. القفل البرمجي لوظائف الدورة الجديدة (عميل + خادم، أربع طبقات مستقلة) تحقق منه فعليًا لا افتراضًا. الفجوة الوحيدة المتبقية (سلسلة BOM التلقائية الكاملة) مؤجلة وموثّقة أعلاه وليست شرط قبول لهذه الدفعة تحديدًا.
