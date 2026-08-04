# تموين قطع الغيار للمراكز

## الهدف

مخزن **قطع الغيار المركزي** يصرف لمخازن **مراكز الصيانة**. الرصيد لا يدخل مخزن المركز إلا بعد تأكيد الاستلام.

## الأدوار المخزنية

| دور | المعنى |
|-----|--------|
| `spare_parts_central` | مخزن قطع الغيار / الصيانة المركزي |
| `maintenance_center` | مخزن مركز صيانة يستلم التموين |

تُنشأ من **إدارة المخازن**.

## الورك فلو

`submitted` → `approved` → `prepared` → `responsible_approved` → `received`

| خطوة | من يفعل | تأثير المخزون |
|------|---------|----------------|
| طلب | المركز | لا |
| اعتماد | مسؤول الاعتماد | لا |
| تجهيز | المخزن المركزي | لا |
| موافقة المسؤول | المسؤول | لا |
| تأكيد الاستلام | المركز | **نعم** — TRANSFER من المركزي → المركز |

التكلفة تُلتقط من `materials.purchaseCost` مركزياً. العميل لا يرسل أسعاراً.

## الشاشات

- `/repair/parts` — لمستخدم مركز الصيانة: كتالوج الفرع + جدول الطلبات المفتوحة + إنشاء/استلام تموين (بدون فتح موديول المخازن)
- `/inventory/spare-parts-replenishment` — لموظفي المخزن المركزي (اعتماد / تجهيز / موافقة مسؤول)
- `/inventory/warehouses/:warehouseId` — مساحة شاملة لكل مخزن (أرصدة، حركات، إجراءات حسب الدور)

إنشاء طلب التموين من المركز يمكنه إغفال `fromWarehouseId`؛ الـ Cloud Function يختار مخزن `spare_parts_central` النشط تلقائياً.

## قواعد مرتبطة

- اختيار قطع الغيار في طلب الصيانة **غير مقيد بـ BOM المنتج**
- في موديول الصيانة يظهر **سعر الاستخدام/البيع فقط**؛ تكلفة الشراء تبقى على `materials` للمخازن/التصنيع

## Callables

- `createSparePartsReplenishment`
- `approveSparePartsReplenishment`
- `prepareSparePartsReplenishment`
- `responsibleApproveSparePartsReplenishment`
- `receiveSparePartsReplenishment`
- `rejectSparePartsReplenishment`
- `cancelSparePartsReplenishment`

مجموعة: `spare_parts_replenishment_requests` (قراءة عميل فقط؛ الكتابة عبر Admin SDK).

### لوحة التحكم بعد تسجيل الدخول

مستخدم **مسؤول مخزن** (دور `materials_warehouse` أو مربوط بمخزن أو لديه صلاحيات مخازن تنفيذية) يفتح بوابة `warehouse_manager` بدل «لوحة التشغيل» العامة:

| حالة المستخدم | الوجهة |
|---------------|--------|
| مربوط بمخزن (`inventoryWarehouseId`) | مساحة المخزن `/inventory/warehouses/:id` |
| دور مستلزمات بدون ربط | تحكم المستلزمات `/inventory/raw-materials/control` |
| صلاحيات مخازن بدون نطاق | لوحة المخازن `/inventory` |

هذا مستقل عن دور المخزن التشغيلي (`spare_parts_central` / `maintenance_center` / …) — مساحة المخزن تعرض الإجراءات حسب الدور.

## الصلاحيات والمستخدمين

### مفاتيح الصلاحيات (تموين قطع الغيار)

| صلاحية | المعنى |
|--------|--------|
| `sparePartsReplenishment.view` | عرض الطلبات |
| `sparePartsReplenishment.create` | إنشاء طلب من المركز |
| `sparePartsReplenishment.approve` | اعتماد الطلب |
| `sparePartsReplenishment.prepare` | تجهيز من المخزن المركزي |
| `sparePartsReplenishment.responsibleApprove` | موافقة المسؤول بعد التجهيز |
| `sparePartsReplenishment.receive` | تأكيد استلام المركز (دخول الرصيد) |

تظهر في **إدارة الأدوار** تحت مجموعة المخازن. الأدمن يحصل عليها تلقائياً من كتالوج الصلاحيات.

### أدوار مدمجة (منح إضافي بدون سحب)

| دور | منح تموين قطع الغيار |
|-----|------------------------|
| مسؤول مخزن المستلزمات | كل خطوات التموين |
| مدير المصنع | عرض + اعتماد + موافقة المسؤول |
| عرض مخزون فقط | عرض فقط |

للتخصيص الأدق (مركز فقط / مركزي فقط): أنشئ دوراً مخصصاً وفعّل المفاتيح المناسبة فقط.

### ربط المستخدم بمخزن

من **إدارة المستخدمين → إدارة المستخدم → المخزن المرتبط**:

| الربط | الأثر |
|-------|--------|
| فارغ | يرى/يتعامل مع كل المخازن (ضمن صلاحياته) |
| مخزن محدد | يرى فقط طلبات/أرصدة تمس هذا المخزن (مصدر أو وجهة) |

**تهيئة مقترحة:**
1. مستخدم مخزن قطع الغيار المركزي → اربطه بمخزن دور `spare_parts_central` + صلاحيات prepare/approve/responsibleApprove
2. مستخدم مركز صيانة → اربطه بمخزن دور `maintenance_center` + صلاحيات create/receive
3. مدير عام → بدون ربط مخزن + صلاحيات اعتماد/موافقة

بعد تحديث الأدوار المدمجة على بيئة قائمة: افتح النظام بحساب أدمن (migration تلقائي) أو استدعِ `syncBuiltInRolePermissionGrants`.

## القواعد والفهارس

- Rules: `firestore/production-line.rules.fragment` → `npm run compose:firestore-rules`
  - قراءة: مستأجر + (`sparePartsReplenishment.view` أو `inventory.view`) + نطاق مخزن المصدر/الوجهة
  - كتابة العميل: ممنوعة
- Indexes في `firestore.indexes.json` لـ:
  - `tenantId + createdAt`
  - `tenantId + status + createdAt`
  - `tenantId + fromWarehouseId (+ status) + createdAt`
  - `tenantId + toWarehouseId (+ status) + createdAt`

نشر:

```bash
npm run compose:firestore-rules
firebase deploy --only firestore:rules,firestore:indexes,functions
```
