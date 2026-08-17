# تقرير المخازن والتحكم والصلاحيات (DB كمصدر وحيد للمنح)

**التاريخ:** 2026-08-03  
**الحالة:** تدقيق + خطة تنفيذ (لم يُطبَّق بعد إلا ما هو مذكور كموجود)  
**المبدأ الحاكم:** **منح الصلاحيات من قاعدة البيانات فقط** — الكود يعرّف الكتالوج والتسميات والتحقق، ولا يخزّن أدوارًا تشغيلية ولا يمنح صلاحيات ثابتة في الواجهة.

مستندات مرتبطة:

- [FIREBASE_SCALE_READINESS_REPORT_AR.md](./FIREBASE_SCALE_READINESS_REPORT_AR.md) — جاهزية الحجم والموديولات
- [settings-contract.md](./settings-contract.md) — مسارات العمليات وتوجيه المخازن
- [adr/ADR-002-server-owned-stock-mutations.md](./adr/ADR-002-server-owned-stock-mutations.md) — ملكية حركات المخزون للخادم
- [security-tenancy.md](./security-tenancy.md) — عزل المستأجر

---

## 1) الملخص التنفيذي

النظام فيه **سطح مخازن واسع** (صفحات + قواعد + دوال) و**طبقة صلاحيات ناضجة شكليًا** (`roles.permissions` في Firestore)، لكن التشغيل الحالي يعاني من:

1. **تكرار مسارات** لنفس العمل التشغيلي (صرف / تحويل / تسليم / اعتماد).
2. **صلاحية عريضة** `inventory.view` تفتح أغلب صفحات المخزون بما فيها طفرات حساسة.
3. **ازدواجية مصادر الحقيقة**: كتالوج + aliases + seeds في الكود، بينما المنح في DB — والمطلوب توحيد المنح على DB فقط مع تقليص aliases.
4. **فجوات أمان P0**: إنشاء مستخدم ذاتي يمكن أن يرفع `roleId`؛ نطاق مخزن الخامات UI فقط؛ جزء كبير من طفرات الرصيد ما زال client+rules (ADR-002 غير مكتمل).
5. **تحكم المشغّل موجود جزئيًا** (`inventoryRouting` + `operationPaths` + ربط مخزن المستخدم) لكنه غير مكتمل على كل المسارات وليس كله مفروضًا من الخادم.

هذا التقرير يرسم: خريطة الصفحات → نموذج التحكم المطلوب → مشاكل/متطلبات → خطة تنظيف RBAC → أولويات P0/P1/P2.

---

## 2) خريطة صفحات ومسارات المخازن

### 2.1 القائمة الجانبية (المصدر: `config/menu.config.ts`)

| المفتاح | العنوان | المسار | صلاحية القائمة الحالية |
|---------|---------|--------|-------------------------|
| inv-dashboard | لوحة تحكم المخزون | `/inventory` | `inventory.view` |
| (خام) | تحكم مخزن الخامات | `/inventory/raw-materials/control` | `inventory.view` |
| (خام) | تنبيهات الخامات | `/inventory/raw-materials/alerts` | `inventory.view` |
| inv-warehouses | إدارة المخازن | `/inventory/warehouses` | `inventory.view` |
| inv-locations | لوكيشنات المخازن | `/inventory/locations` | `inventory.view` |
| inv-balances | الأرصدة | `/inventory/balances` | `inventory.view` |
| inv-transactions | الحركات | `/inventory/transactions` | `inventory.view` |
| — | مستهلكات الأقسام | `/inventory/department-consumables` | `departmentConsumables.view` أو `inventory.view` |
| inv-transfer-approvals | اعتماد التحويلات | `/inventory/transfer-approvals` | `inventory.view` |
| inv-counts | الجرد والمطابقة | `/inventory/counts` | `inventory.counts.manage` |
| inv-production-issues | صرف إنتاج | `/inventory/production-issues` | `inventory.view` |
| production-floor | مساحة صالة الإنتاج (تحت الإنتاج) | `/production/floor` | `inventory.view` |
| — | اعتمادات الإنتاج | `/inventory/production-approvals` | `inventory.view` |
| — | سجلات مكونات الإنتاج | `/inventory/production-component-records` | `inventory.view` |
| — | تحليل استهلاك الإنتاج | `/inventory/production-consumption-analysis` | `inventory.view` |
| inv-disassembly | تفكيك عكسي | `/inventory/disassembly` | `inventory.disassembly.manage` |
| inv-analytics | تحليلات المخزون | `/inventory/analytics` | `inventory.analytics.view` |
| inv-exceptions | استثناءات المخزون | `/inventory/exceptions` | `inventory.exceptions.view` |

### 2.2 مسارات مسجّلة في الموديول (`modules/inventory/routes/index.ts`) — أبرزها

| المسار | الغرض التشغيلي | ملاحظة تكرار / خطر |
|--------|----------------|---------------------|
| `/inventory` | لوحة | OK |
| `/inventory/warehouses` | CRUD مخازن | غالبًا يحتاج `inventory.warehouses.manage` لا `view` |
| `/inventory/locations` | مواقع داخل المخزن | نفس المشكلة |
| `/inventory/balances` | أرصدة | قراءة؛ الطفرات عبر عمليات أخرى |
| `/inventory/transactions` | دفتر حركات | قراءة |
| `/inventory/issue-requests` | طلبات صرف | يتداخل مع production-issues |
| `/inventory/production-issues` | صرف إنتاج | مسار تشغيلي أساسي |
| `/inventory/transfers` + `/inventory/transfers/new` | تحويلات عامة | يتداخل مع transfer-approvals و handover |
| `/inventory/transfer-approvals` | اعتماد تحويلات | يجب فصل صلاحيات approve/receive |
| `/inventory/production-handover` | تسليم إنتاج→تعبئة | مسار خاص؛ جزء منه على CF |
| `/inventory/packaging-control` | استلام نهائي + فروقات | مربوط بـ operation path |
| `/production/floor` | كروت منتجات الصالة + صفحة تفاصيل الخطة/التقارير | مربوط بـ `productionFloorWarehouseId`؛ المسار القديم `/inventory/production-floor` يعيد التوجيه |
| `/inventory/raw-materials/*` | تحكم/تنبيهات خام | نطاق المخزن UI فقط حاليًا |
| `/inventory/department-consumables` | مستهلكات أقسام | وضع موافقة من إعدادات القسم |
| `/inventory/counts` | جرد | صلاحية أدق موجودة |
| `/inventory/disassembly` | تفكيك | صلاحية أدق موجودة |
| `/inventory/analytics` / `exceptions` | تقارير | صلاحيات أدق موجودة |
| `/inventory/settings` (إن وُجد في الراوتر) | إعدادات موديول | يجب أن يكون admin/settings فقط |

> **قاعدة تنظيف التنقل:** لكل عمل تشغيلي نقطة دخول واحدة في القائمة؛ الباقي redirect أو إزالة من menu مع الإبقاء على deep link مؤقت إن لزم.

### 2.3 نقاط دخول خارج موديول المخزون تؤثر على المخزون

- تقارير الإنتاج / خط الإنتاج → تطبيق/عكس مخزون التقرير (CF + operation path).
- أوامر الشغل / حقن المكونات → حركات مكونات.
- إعدادات النظام → `planSettings.inventoryRouting` + `operationPaths`.
- المستخدمون → `inventoryWarehouseId` (ربط مشغّل بمخزن).
- الأقسام → وضع موافقة المستهلكات.

---

## 3) نموذج التحكم المطلوب للمشغّل (Settings + DB)

### 3.1 ما هو موجود اليوم (يعتمد على DB/إعدادات)

| طبقة التحكم | مكان التخزين | ماذا تتحكم |
|-------------|--------------|------------|
| توجيه المخازن | `system_settings` / `planSettings.inventoryRouting` | مخزن خام، WIP، تام، صالة، إلخ |
| مسارات العمليات | `operationPaths.*` | تفعيل/تعطيل مسار تشغيلي (handover، تطبيق مخزون التقرير، …) |
| أدوار المخزن | حقول على `warehouses` / تعيينات | من يصرّف / يعتمد / يستلم على مستوى مخزن |
| ربط المستخدم بمخزن | `users.inventoryWarehouseId` | تقييد واجهة مشغّل لمخزن واحد |
| موافقة المستهلكات | إعدادات القسم | مباشر vs موافقة |
| صلاحيات الدور | `roles/{roleId}.permissions[]` | **مصدر المنح الوحيد المطلوب** |

### 3.2 ما ينقص ليكتمل «التحكم»

1. **مصفوفة صلاحيات دقيقة لكل صفحة طفرات** بدل `inventory.view`.
2. **فرض نطاق المخزن في Firestore Rules + CF** وليس فقط في UI (خصوصًا raw-materials).
3. **تسجيل كل مسار تشغيلي في `operationPaths`** مع guard خادمي (جزء منه بدأ: handover + apply/reverse report).
4. **شاشة تحكم موحّدة للمشرف** تعرض: المخازن المعيّنة + المسارات المفعّلة + من يملك أي صلاحية مخزون (قراءة من `roles` فقط).
5. **منع تكرار الطلبات** بنفس المفاتيح الطبيعية (idempotency) على الصرف/التحويل/التسليم — جزء موجود على handover.

### 3.3 عقد الإعدادات (مرجع سريع)

مفاتيح التوجيه الحرجة (انظر `warehouseService` / settings-contract):

- مخزن الخامات / WIP / التام / صالة الإنتاج (`productionFloorWarehouseId`)
- سلوك التقرير تجاه المخزون (`reportBehavior`)
- مسارات: `inventory.productionHandover.*`, تطبيق/عكس مخزون التقرير، …

**قاعدة:** تعطيل مسار من الإعدادات = رفض من الخادم، وليس إخفاء زر فقط.

---

## 4) المتطلبات والمشاكل (مجمّعة)

### 4.1 متطلبات تشغيلية (مخازن + أرضية مصنع)

| # | المتطلب | الحالة التقريبية |
|---|---------|------------------|
| R1 | صرف إنتاج من مسار واحد واضح | موجود لكن مكرر مع issue-requests |
| R2 | تحويل بين مخازن + اعتماد/استلام | موجود؛ صلاحيات عريضة |
| R3 | تسليم إنتاج→تعبئة مع فروقات عند الاستلام النهائي | موجود (CF + packaging-control) |
| R4 | ربط تقارير الإنتاج بالمخزون (apply/reverse) | موجود جزئيًا + operation path |
| R5 | مصالحة الخطة من التقارير بعد الإكمال | أُغلق مؤخرًا في الكود |
| R6 | حفظ/مسح مفاتيح توجيه المخازن بدون بقايا | أُغلق مؤخرًا (deep-merge + clear keys) |
| R7 | مستهلكات الأقسام بموافقة اختيارية | موجود |
| R8 | جرد / استثناءات / تحليلات | موجود بصلاحيات أدق نسبيًا |
| R9 | تحكم مشغّل: تفعيل مسارات + تعيين مخازن من الإعدادات | جزئي |
| R10 | كل طفرة رصيد من الخادم فقط (ADR-002) | **غير مكتمل** |

### 4.2 مشاكل أمان وتحكم (مرتبة)

| أولوية | المشكلة | الأثر |
|--------|---------|-------|
| **P0** | إنشاء `users/{uid}` ذاتيًا يمكن أن يضبط `roleId` / `isActive` | رفع صلاحيات |
| **P0** | طفرات رصيد كثيرة ما زالت من العميل + rules | تلاعب رصيد / سباقات |
| **P0** | نطاق مخزن الخامات في الواجهة فقط | IDOR عبر قراءة/كتابة مباشرة |
| **P1** | أغلب صفحات الطفرات على `inventory.view` | مشغّل قراءة يصبح قادرًا على UI حساس |
| **P1** | aliases ضخمة في `checkPermission` | صلاحية ظاهرة ≠ صلاحية القواعد/CF |
| **P1** | مفاتيح مكررة (`productionWorkers.view` vs `production.workers.view`) | أدوار غير متسقة |
| **P1** | `adminPermissions()` / overrides من الكود | يخالف «DB فقط» |
| **P2** | ملفات أدوار ميتة / كتالوج غير متزامن مع القواعد | صيانة خطرة |
| **P2** | تكرار نقاط دخول القائمة لنفس التدفق | ارتباك تشغيلي |
| **P2** | تقارير/تحليلات ثقيلة client-side (انظر تقرير Firebase) | بطء + تكلفة قراءة |

### 4.3 مشاكل منتج/حجم (من تقرير Firebase — ملخص)

- جاهزية **السعة** أفضل من جاهزية **الكمال الوظيفي**.
- فجوات موديولات (CRM عملاء، فواتير محدودة، رواتب من العميل، ZKTeco، تحميل منتجات كامل، …).
- التفاصيل والجداول في: [FIREBASE_SCALE_READINESS_REPORT_AR.md](./FIREBASE_SCALE_READINESS_REPORT_AR.md).

---

## 5) الصلاحيات والأدوار — الوضع الحالي مقابل الهدف

### 5.1 الوضع الحالي (طبقات)

```
[كتالوج + تسميات + aliases + seeds]  ← utils/permissions.ts, roleService.ts (كود)
              ↓
[roles.permissions في Firestore]     ← المنح الفعلية للمستخدم عبر roleId
              ↓
checkPermission(user, key)           ← يوسّع aliases وقد يتجاوز بمفاتيح إدارية
              ↓
Menu / Page UI                       ← غالباً مفاتيح عريضة
Firestore Rules / Cloud Functions      ← مفاتيح أدق أو مختلفة أحيانًا
```

### 5.2 الهدف (DB فقط للمنح)

```
[كتالوج ثابت في الكود]  = قائمة المفاتيح المعروفة + العربي + تجميع للقوائم فقط
        ↓ لا يمنح شيئًا
[roles.permissions]     = المصدر الوحيد لما يقدر عليه الدور
[users.roleId]          = الربط فقط (يُغيَّر عبر مسار خادمي محمي)
        ↓
hasPermission(exactKey) = تطابق حرفي مع المصفوفة (بدون graph aliases ضخمة)
        ↓
UI يخفي/يُظهر للراحة فقط
Rules + CF تفرض نفس المفتاح الحرفي
```

**ما يُسمح بقاؤه في الكود:**

- تعريف المفتاح ومعناه والوسم العربي.
- تجميع مفاتيح لعرض شاشة «إدارة الأدوار».
- رفض مفتاح غير معروف عند حفظ دور (allowlist من الكتالوج).

**ما يُحذف من منطق المنح في الكود:**

- منح admin ثابتة خارج DB.
- aliases من نوع «إن ملكت A فأنت تملك B و C و D».
- نسخ seeds تُعتبر مصدر حقيقة بعد أول تهيئة (التهيئة مرة واحدة → بعدها DB).
- ملفات أدوار ميتة (`core/auth/roles.ts` إن بقيت).

### 5.3 تكرارات يجب مسحها / توحيدها

| التكرار | الإجراء |
|---------|---------|
| `productionWorkers.view` ↔ `production.workers.view` | مفتاح واحد رسمي + هجرة قيم الأدوار في DB |
| aliases داخل `checkPermission` | اختزال إلى صفر أو جدول هجرة مؤقت بحد أقصى إصدار واحد |
| قائمة menu بمفتاح أوسع من القواعد | محاذاة حرفية |
| صلاحية في الكتالوج غير مستخدمة في rules/CF | إما ربطها أو حذفها من الكتالوج |
| `workOrders.componentInjection.manage` ناقص من الكتالوج | إضافته للكتالوج إن بقي مستخدمًا في القواعد |
| مسارات مكررة: issue-requests vs production-issues | مسار تشغيلي واحد + redirect |
| transfers vs transfer-approvals vs handover | فصل أنواع المستند وصلاحيات approve/receive |

### 5.4 مصفوفة صلاحيات مقترحة للمخزون (حد أدنى)

| المفتاح | الاستخدام |
|---------|-----------|
| `inventory.view` | لوحات + أرصدة + حركات (قراءة) |
| `inventory.warehouses.manage` | إدارة مخازن/مواقع |
| `inventory.issue.create` | إنشاء طلب صرف |
| `inventory.issue.approve` | اعتماد صرف |
| `inventory.transfer.create` | إنشاء تحويل |
| `inventory.transfer.approve` | اعتماد تحويل |
| `inventory.transfer.receive` | استلام تحويل |
| `inventory.productionHandover.create` | إنشاء تسليم إنتاج |
| `inventory.productionHandover.confirmReceipt` | استلام نهائي/فروقات |
| `inventory.counts.manage` | جرد |
| `inventory.disassembly.manage` | تفكيك |
| `inventory.analytics.view` | تحليلات |
| `inventory.exceptions.view` | استثناءات |
| `inventory.rawMaterials.operate` | تشغيل يومي لمخزن الخامات (نطاق مخزن) |
| `departmentConsumables.view` / `.manage` / `.approve` | مستهلكات أقسام |
| `settings.manage` | توجيه المخازن + operation paths |

> الأسماء النهائية تُثبَّت بعد جرد المفاتيح المستخدمة فعليًا في `firestore.rules` و`functions/src` ثم هجرة `roles.permissions`.

---

## 6) خطة التنفيذ (مرحلية)

### المرحلة P0 — أمان ومصدر الحقيقة (قبل أي تجميل UI)

1. **منع privilege escalation عند إنشاء/تحديث المستخدم**
   - نقل إنشاء المستخدم المميز وربط `roleId` إلى Cloud Function.
   - Rules: المستخدم لا يكتب `roleId` / `isActive` / صلاحيات حساسة على مستنده.
2. **فرض نطاق المخزن في Rules (+ CF حيث يلزم)** لمخزن الخامات والمشغّل المربوط.
3. **جرد كل طفرات الرصيد المتبقية على العميل** ووضع قائمة قطع حسب ADR-002 (لا ادّعاء اكتمال قبل النقل).
4. **إزالة/تعطيل `adminPermissions()` وأي bypass** يعتمد على اسم دور أو قائمة كود بدل `roles.permissions`.

**معيار قبول P0:** اختبارات rules: مستخدم عادي لا يرفع نفسه؛ لا يقرأ/يعدّل رصيد خارج نطاقه.

### المرحلة P1 — RBAC نظيف + صفحات المخازن محكومة

1. توليد **قائمة المفاتيح الحية** من: menu + routes guards + rules + functions.
2. توحيد المفاتيح المكررة + سكربت هجرة `roles.permissions` في Firestore.
3. اختزال aliases إلى طبقة توافق مؤقتة (أو صفر) مع اختبارات انحدار.
4. استبدال `permission: 'inventory.view'` على صفحات الطفرات بالمفاتيح الدقيقة في:
   - `config/menu.config.ts`
   - حراس الصفحات/الراوتر
   - rules/CF لنفس المفتاح
5. شاشة الأدوار: تحفظ فقط مفاتيح من الكتالوج إلى DB؛ لا تزرع صلاحيات من الكود بعد الحفظ.
6. تنظيف نقاط الدخول المكررة (menu + redirects) حسب قاعدة المشروع project-wide.

**معيار قبول P1:** grep لا يُظهر alias graph ضخم؛ كل صفحة مخزون طفرات لها مفتاح يطابق rules.

### المرحلة P2 — تحكم المشغّل وتجربة التشغيل

1. لوحة تحكم إعدادات المخزون: توجيه + مسارات عمليات + حالة الربط.
2. إكمال `operationPaths` على بقية المسارات الحساسة مع guard خادمي.
3. تقارير مخزون للمشرف (من DB/aggregates) بدل حسابات ثقيلة على العميل حيث أمكن.
4. ربط تقرير Firebase (الحجم) بتحسينات القراءة/الفهارس للمخزون.

**معيار قبول P2:** مشرف يُعطّل مسارًا من الإعدادات فيُرفض من الخادم؛ مشغّل يرى فقط مخزنه ومساراته المسموحة.

---

## 7) ما يُمسح من الكود (قائمة عمل، ليست حذفًا أعمى)

| هدف المسح | أين تبحث |
|-----------|----------|
| aliases داخل `checkPermission` | `utils/permissions.ts` |
| seeds تُعامل كمصدر حقيقة | `roleService.ts` / سكربتات seed |
| أدوار/ملفات ميتة | `core/auth/roles.ts` وأشباهها |
| مفاتيح مكررة في الكتالوج | نفس ملف الصلاحيات |
| عناصر قائمة مكررة لنفس التدفق | `config/menu.config.ts` |
| حراس UI أوسع من القواعد | صفحات `modules/inventory/**` |
| منطق «إن كان admin بالاسم» | أي `role === 'admin'` للمنح |
| معالجات `?action=` يتيمة بعد نقل التدفق | routes + dashboards |

**قاعدة:** لا تُمسح صلاحية من الكتالوج قبل هجرة كل الأدوار في DB وإزالة الاستخدام من rules/CF/UI.

---

## 8) اعتماد الداتابيز فقط — قواعد تنفيذية للفريق

1. **المنح = `roles.permissions` فقط.** أي مسار آخر = باج.
2. **الكتالوج في الكود = قاموس، ليس مخزن منح.**
3. **تغيير صلاحيات دور = كتابة Firestore (أو CF admin)، ليس PR يغيّر مصفوفة defaults للمستخدمين الحاليين.**
4. **Defaults/seeds:** مرة واحدة للمستأجر الجديد؛ بعدها لا تُعاد تطبيقها فوق أدوار معدَّلة.
5. **التحقق الخادمي:** Rules و Functions تستخدم نفس المفتاح الحرفي المخزّن في الدور.
6. **الواجهة:** `hasPermission` للراحة؛ الفشل الآمن من الخادم.
7. **العمليات الحساسة للمخزون:** CF + `operationPaths` + صلاحية دقيقة + نطاق مستأجر/مخزن.

---

## 9) خطة تحقق (بعد التنفيذ)

- [ ] `test:rules` — رفض رفع `roleId` ذاتيًا؛ رفض طفرة رصيد خارج النطاق
- [ ] اختبارات وحدة لـ `hasPermission` بدون aliases مخفية
- [ ] سكربت/تقرير يطبع فرق: مفاتيح الكتالوج ↔ مفاتيح rules ↔ مفاتيح menu
- [ ] مرور يدوي عربي: مشغّل مخزن خام / مشغّل صالة / معتمد تحويل / مستلم تعبئة
- [ ] تعطيل operation path من الإعدادات → رفض CF
- [ ] grep: لا `adminPermissions(` للمنح؛ لا مسارات menu يتيمة

---

## 10) توصية البدء الفوري

ابدأ بـ **P0 أمان المستخدم + نطاق المخزن**، ثم **هجرة المفاتيح وتضييق `inventory.view`**.  
لا تُنفَّذ تجميلات قائمة قبل إصلاح مصدر المنح؛ وإلا سيتكرر التكرار تحت أسماء جديدة.

عند الموافقة على هذا التقرير، التنفيذ المقترح في أول PR:

1. CF + rules لإنشاء/تحديث المستخدم بدون privilege escalation  
2. نطاق `inventoryWarehouseId` / مخزن الخامات في rules  
3. اختزال aliases + مصفوفة صلاحيات مخزون دقيقة في menu/guards  
4. هجرة أدوار المستأجر على المفاتيح الموحّدة

---

## سجل قرارات قصيرة

| قرار | الاختيار | البديل المرفوض |
|------|----------|----------------|
| مصدر المنح | Firestore `roles.permissions` | مصفوفات أدوار في الكود |
| aliases | هجرة ثم حذف | الإبقاء على graph دائم |
| طفرات الرصيد | CF تدريجيًا (ADR-002) | توسيع صلاحيات client |
| تكرار الصفحات | مسار تشغيلي واحد | الإبقاء على كل المداخل |
