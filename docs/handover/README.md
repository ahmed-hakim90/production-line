# مستندات التسليم والتشغيل

## الملفات الرئيسية

| الملف | الغرض |
|-------|--------|
| [Hakimo-ERP-Handover-2026-05.pdf](Hakimo-ERP-Handover-2026-05.pdf) | دليل تسليم وتدريب كامل (فصول 1–12) |
| [TENANT_READINESS_CHECKLIST.md](TENANT_READINESS_CHECKLIST.md) | قائمة جاهزية التشغيل (مرحلة A) |
| [OPS_DAILY_ROUTINE.md](OPS_DAILY_ROUTINE.md) | روتين المراقبة والمتابعة اليومي |
| [OPS_MONTHLY_ROUTINE.md](OPS_MONTHLY_ROUTINE.md) | روتين التحليلات الشهرية |

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
