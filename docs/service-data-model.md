# نموذج بيانات عمليات الصيانة

## المجموعات (Firestore)

### `repair_jobs`

وثيقة الطلب الرئيسية. حقول جديدة أو مهمة:

| الحقل | الوصف |
|--------|--------|
| `status` | حالة المسار (قيم موحّدة جديدة + دعم قراءة قيم قديمة) |
| `laborCost` | تكلفة عمالة للتحليل والربحية |
| `warrantyScope` | `none` / `manufacturer` / `in_store` — ضمان الجهاز عند الاستلام |
| `warrantyExpiresAt` | تاريخ انتهاء ضمان الجهاز (ISO) |
| `priority` | `normal` / `urgent` |
| `deviceSerial` | سريال سريع للبحث |
| `intakePhotoUrls` / `repairPhotoUrls` | مصفوفات روابط تخزين |
| `approvalStatus` | `not_required` / `pending` / `approved` / `rejected` |
| `approvalTokenHash` | SHA-256 للتوكن (التوكن الكامل فقط في الرابط العام) |
| `approvalTokenExpiresAt` | انتهاء صلاحية رابط الموافقة |
| `dueAt` | الموعد المتوقع للتسليم (نفس SLA الظاهر للموظف) |

### `repair_jobs/{jobId}/service_events`

سجل تدقيق ملحق:

- `action`: `status_change` | `job_created` | `approval_requested` | `approval_resolved` | `parts_reserved` | …
- `statusBefore` / `statusAfter` عند تغيير الحالة
- `actorUid` / `actorName` / `at` / `note` / `payload`

**ملاحظة:** `statusHistory` ما زال على وثيقة الطلب كملخص سريع؛ المصدر التفصيلي للتدقيق هو `service_events`.

### `repair_part_reservations`

حجز كمية لصالح طلب:

- `status`: `active` | `consumed` | `released`
- `quantity`, `partId`, `jobId`, `branchId`, `warehouseId` (اختياري)

**منطق المتاح للحجز:** `رصيد المخزون − مجموع الحجوزات النشطة لنفس القطعة/المخزن`.

### تكامل مخزون الإنتاج (اختياري)

حقل `rawMaterialId` على `repair_spare_parts` لربط تقريري بمادة خام؛ لا يفرض مزامنة تلقائية في هذه المرحلة.

## الفهارس (indexes)

راجع `firestore.indexes.json` لمجموعة `repair_part_reservations` (استعلامات `tenantId` + `branchId` + `status` + `partId` / `jobId`).

## التخزين (Storage)

مسار الصور: `company/repair_jobs/{tenantId}__{jobId}/{timestamp}_{filename}` — يتطلب تسجيل دخول و`module=repair_jobs` في القواعد.
