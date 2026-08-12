# مستندات التسليم والتشغيل

## عرض الشركة (HTML بالموديولات + صور)

عرض إداري يشرح قوة ForgeOps لكل موديول بالصور الفعلية:

- **[../company-showcase/index.html](../company-showcase/index.html)** — نظرة عامة + خريطة الموديولات
- صفحات `../company-showcase/modules/01-…10-…html` — شرح تفصيلي لكل موديول
- تحديث لقطات إضافية: `npm run showcase:screens`

## الملفات الرئيسية

| الملف | الغرض |
|-------|--------|
| [Factory-ERP-Handover-2026-05.pdf](Factory-ERP-Handover-2026-05.pdf) | دليل تسليم وتدريب كامل (فصول 1–12) |
| [TENANT_READINESS_CHECKLIST.md](TENANT_READINESS_CHECKLIST.md) | قائمة جاهزية التشغيل (مرحلة A) |
| [OPS_DAILY_ROUTINE.md](OPS_DAILY_ROUTINE.md) | روتين المراقبة والمتابعة اليومي |
| [OPS_MONTHLY_ROUTINE.md](OPS_MONTHLY_ROUTINE.md) | روتين التحليلات الشهرية |
| [MATERIALS_WAREHOUSE_OPERATOR_GUIDE_AR.md](MATERIALS_WAREHOUSE_OPERATOR_GUIDE_AR.md) | دليل تدريب مسؤول مخزن مستلزمات الإنتاج (نص) |
| [MATERIALS_WAREHOUSE_OPERATOR_GUIDE_PRINT_AR.html](MATERIALS_WAREHOUSE_OPERATOR_GUIDE_PRINT_AR.html) | نفس الدليل — نسخة للطباعة / PDF |
| [REPAIR_TECHNICIAN_GUIDE_AR.md](REPAIR_TECHNICIAN_GUIDE_AR.md) | دليل فني الصيانة (نص) |
| [REPAIR_TECHNICIAN_GUIDE_PRINT_AR.html](REPAIR_TECHNICIAN_GUIDE_PRINT_AR.html) | فني الصيانة — طباعة / PDF |
| [REPAIR_CENTER_MANAGER_GUIDE_AR.md](REPAIR_CENTER_MANAGER_GUIDE_AR.md) | دليل مسؤول مركز الصيانة / الاستقبال (نص) |
| [REPAIR_CENTER_MANAGER_GUIDE_PRINT_AR.html](REPAIR_CENTER_MANAGER_GUIDE_PRINT_AR.html) | مسؤول المركز — طباعة / PDF |
| [REPAIR_MAINTENANCE_MANAGER_GUIDE_AR.md](REPAIR_MAINTENANCE_MANAGER_GUIDE_AR.md) | دليل مدير الصيانة (نص) |
| [REPAIR_MAINTENANCE_MANAGER_GUIDE_PRINT_AR.html](REPAIR_MAINTENANCE_MANAGER_GUIDE_PRINT_AR.html) | مدير الصيانة — طباعة / PDF |
| [SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_AR.md](SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_AR.md) | دليل مسؤول مخزن قطع الغيار المركزي (نص) |
| [SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_PRINT_AR.html](SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_PRINT_AR.html) | مخزن قطع الغيار المركزي — طباعة / PDF |

## أوامر npm

```bash
# توليد PDF كامل (لقطات + محتوى) — يتطلب npm run dev + docs/handover/.credentials
npm run handover:pdf

# تحديث PDF فقط (فصول جديدة دون إعادة التقاط)
npm run handover:pdf:content

# فحص جاهزية المستأجر على Firestore (يتطلب firebase login)
npm run handover:readiness
```

## بيانات الدخول للأتمتة

انسخ `.credentials.example` إلى `.credentials` (مُستثنى من Git).
