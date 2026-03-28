# Changelog

كل التغييرات المهمة في المشروع موثقة في هذا الملف بناءً على تاريخ Git.

## [Unreleased] - 2026-02-25

### Added
- تحويل هيكل المشروع إلى Modules جديدة: `auth`, `costs`, `dashboards`, `production`, `quality`, `shared`, `system`.
- إضافة ملفات Routes/Services/Hooks/Components لكل Module.
- إضافة ملفات خدمات جديدة مثل `services/imageCompression.ts`, `services/storageService.ts`, و `storage.rules`.
- إضافة نظام إدارة الأصول والإهلاك داخل موديول الإنتاج (`assets`, `asset_depreciations`) مع صفحات `AssetsList`, `AssetDetails`, `DepreciationReport`.
- إضافة Job إهلاك شهري عبر Cloud Scheduler + تشغيل يدوي عبر Callable Function (`runAssetDepreciationJob`).

### Changed
- تحديثات كبيرة على `App.tsx`, `types.ts`, `vite.config.ts`, و `store/useAppStore.ts`.
- نقل صفحات كثيرة من `pages/` إلى `modules/*/pages/` مع إعادة تنظيم المسارات.
- ربط تكلفة الإهلاك بحسابات تكلفة الإنتاج وتوزيعها حتى مستوى الخط/المنتج ضمن خدمات وحسابات التكاليف.
- تحديث الصلاحيات، القائمة، والمسارات لدعم إدارة الأصول وتقارير الإهلاك.

### Removed
- إزالة صفحات قديمة من مجلد `pages/` بعد نقلها للهيكل المعياري الجديد.

---

## مرحلة التأسيس (قبل الترقيم)

### 2026-02-16
- `8664574` بداية المشروع (`fff`).
- `e8e1aea` تحديث ملف README.
- `4753fe4` إكمال جزء المصادقة (`auth done`).

---

## الإصدارات

### [1.0.0] - 2026-02-18
- `cab8204` إصدار أولي (`versoin 1.0.0`).

### [1.0.01] - 2026-02-18
- `09642f7` تحديث نسخة (`version 1.0.01`).

### [1.0.03] - 2026-02-18
- `eb3b9e0` تحسينات Responsive.
- `e6a8830` تحسينات Responsive إضافية.
- `d256d89` تحديث نسخة (`version 1.0.03`).

### [1.0.05] - 2026-02-21
- `ae10587` إضافة جزء التكاليف (`add cost`).
- `292d0d2` تحسينات إضافية على التكاليف.
- `31be8dc` تحديث نسخة (`version 1.0.05`).

### [1.0.08] - 2026-02-21
- `f635308` إضافة إعدادات (`Add Settings`).

### [1.0.001] - 2026-02-21
- `834e9ad` تحديث نسخة (`version 1.0.001`).

### [1.0.002] - 2026-02-21
- `bf9afd1` تطبيق الثيمات (`All Theme`).
- `9621b7a` إضافة اللون الافتراضي للثيمات (`Add Default Color`).

### [2v] - 2026-02-22
- `db0ad8b` إضافات HR.
- `4c8bc91` إصدار (`Version 2v`).

### [2.0.01v] - 2026-02-22
- `7cbde0c` تحديث نسخة (`Version 2.0.01v`).

### [v4 PRODECTION] - 2026-02-23
- `e096a66` إصدار إنتاج v4.

### [v5 PRODECTION] - 2026-02-23
- `679fa73` إصدار إنتاج v5.
- `454aa67` تحديث إضافي ضمن نفس الإصدار.

### [v6 PRODECTION] - 2026-02-23
- `5c6f721` إصدار إنتاج v6.

### [1.01.01] - 2026-02-23
- `3f032a3` تعديلات (`edits`).

### [1.01.02] - 2026-02-23
- `f538441` تحديث نسخة (`version 1.01.02`).

### [15] - 2026-02-23
- `4c6e92c` إصدار (`version 15`).

### [Post-15 Updates] - 2026-02-24
- `f0ba081` Notes Report + تحسين Responsive للموبايل.
- `07bbe24` تحديثات عامة على الموديلات.
- `aaaf1f1` إضافة Pagination.
- `70a501d` إضافة Pagination + Barcode.
- `7746c65` تحسينات إضافية على Pagination و Barcode.

### [PWA Rollout] - 2026-02-24
- `86b8224` تفعيل PWA.
- `b5c0705` تحسين PWA على iPhone.
- `8eb95b3` إضافة أيقونة iPhone.
- `a082b97` تحسينات أيقونات + Real environment.

### [QC Done] - 2026-02-25
- `afda117` إنهاء مرحلة الجودة (`QC Done`).

---

## ملاحظات
- لا توجد Git Tags في المستودع حاليًا، لذلك تم بناء الـ changelog من رسائل الـ commits.
- يوجد تفاوت في نمط الترقيم داخل التاريخ (مثل: `1.0.002`, `2v`, `v6 PRODECTION`, `15`) وتم الحفاظ عليه كما هو.

## [4.0.1] - 2026-02-25

- Add Refactor Code All Project

## [4.0.2] - 2026-02-25

- Add Refactor Code All Project change qc position

## [4.0.3] - 2026-02-25

- phone

## [4.0.4] - 2026-02-25

- dashbaord worker

## [4.0.5] - 2026-02-25

- dashbaord worker search product

## [4.0.6] - 2026-02-25

- dashbaord worker search product add details in worker

## [4.0.7] - 2026-02-25

- refresh

## [4.0.8] - 2026-02-25

- refresh

## [4.0.9] - 2026-02-25

- refresh add import

## [4.0.10] - 2026-02-26

- top bar

## [4.0.11] - 2026-02-26

- top bar login in updated

## [4.0.12] - 2026-02-26

- QC Firebase

## [4.0.13] - 2026-02-26

- hide production live

## [4.0.14] - 2026-02-26

- hide production live change position

## [4.0.15] - 2026-02-26

- top bar table

## [4.0.16] - 2026-02-28

- All Edit Settings

## [4.0.19] - 2026-02-28

- All Updates

## [4.0.20] - 2026-02-28

- inv

## [4.0.21] - 2026-03-01

- add inv

## [4.0.22] - 2026-03-01

- All Edit inv

## [4.0.23] - 2026-03-02

- add model

## [4.0.24] - 2026-03-02

- add model 2

## [4.0.25] - 2026-03-02

- add model 3

## [4.0.26] - 2026-03-02

- MODELS

## [4.0.27] - 2026-03-02

- MODELS 2

## [4.0.28] - 2026-03-02

- MODELS 5

## [4.0.29] - 2026-03-02

- MODELS 6

## [4.0.30] - 2026-03-02

- MODELS 7

## [4.0.31] - 2026-03-02

- MODELS 8

## [4.0.32] - 2026-03-02

- MODELS 9

## [4.0.33] - 2026-03-02

- shere  10

## [4.0.34] - 2026-03-02

- shere  112

## [4.0.35] - 2026-03-02

- shere  113

## [4.0.36] - 2026-03-02

- shere  114

## [4.0.37] - 2026-03-02

- shere  114

## [4.0.38] - 2026-03-02

- All Edit for Reports & Plan Pro

## [4.0.39] - 2026-03-03

- ERPNEXT THEME

## [4.0.40] - 2026-03-03

- ERPNEXT THEME

## [4.0.41] - 2026-03-03

- ERPNEXT THEME

## [4.0.42] - 2026-03-04

- Reports Pro

## [4.0.43] - 2026-03-04

- Reports Pro WorkOrder

## [4.0.44] - 2026-03-04

- SALAH

## [4.0.45] - 2026-03-05

- Editable

## [4.0.46] - 2026-03-05

- Responsive

## [4.0.47] - 2026-03-05

- responcive

## [4.0.48] - 2026-03-05

- Add All File

## [4.0.49] - 2026-03-08

- notification

## [4.0.50] - 2026-03-08

- notification

## [4.0.51] - 2026-03-08

- notification 8

## [4.0.52] - 2026-03-09

- Users

## [4.0.53] - 2026-03-09

- daily Welcome

## [4.0.54] - 2026-03-10

- add catalog

## [4.0.55] - 2026-03-11

- Add Injection

## [4.0.56] - 2026-03-11

- Add Injection - send

## [4.0.57] - 2026-03-12

- Done

## [4.0.58] - 2026-03-12

- reports

## [4.0.59] - 2026-03-12

- reports

## [4.0.60] - 2026-03-15

- develop UX UI

## [4.0.61] - 2026-03-15

- Develop

## [4.0.62] - 2026-03-15

- Develop screen shot

## [4.0.63] - 2026-03-15

- Develop screen shot v2

## [4.0.64] - 2026-03-16

- HR & UPdate

## [4.0.65] - 2026-03-16

- HR & UPdate %

## [4.0.66] - 2026-03-16

- Photo Shere

## [4.0.67] - 2026-03-16

- Photo Shere & Transfer

## [4.0.68] - 2026-03-16

- Photo Shere & Transfer

## [4.0.69] - 2026-03-18

- All Files

## [4.0.70] - 2026-03-28

- Add Freatures Updated

## [4.0.71] - 2026-03-28

- Add updated Error
