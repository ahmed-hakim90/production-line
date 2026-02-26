# Changelog

كل التغييرات المهمة في المشروع موثقة في هذا الملف بناءً على تاريخ Git.

## [Unreleased] - 2026-02-25

### Added
- تحويل هيكل المشروع إلى Modules جديدة: `auth`, `costs`, `dashboards`, `production`, `quality`, `shared`, `system`.
- إضافة ملفات Routes/Services/Hooks/Components لكل Module.
- إضافة ملفات خدمات جديدة مثل `services/imageCompression.ts`, `services/storageService.ts`, و `storage.rules`.

### Changed
- تحديثات كبيرة على `App.tsx`, `types.ts`, `vite.config.ts`, و `store/useAppStore.ts`.
- نقل صفحات كثيرة من `pages/` إلى `modules/*/pages/` مع إعادة تنظيم المسارات.

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
