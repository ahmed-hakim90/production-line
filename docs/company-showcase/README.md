# عرض الشركة — ForgeOps Module Showcase

HTML عربي RTL يشرح قوة النظام لكل موديول بالصور الفعلية — للعرض على الإدارة والشركة.

## افتح من هنا

1. افتح الملف: [`index.html`](./index.html) في المتصفح  
   أو من جذر المشروع:

```bash
open docs/company-showcase/index.html
```

2. من الخريطة ادخل أي موديول (01–10).

## المحتوى

| الملف | المحتوى |
|-------|---------|
| `index.html` | عرض الشركة: القيمة، المسار التشغيلي، خريطة الموديولات، ملخص التحمل |
| `data-and-scale.html` | هندسة البيانات، السعة (~7k صنف / ~8k عميل / ~100 يوزر)، سيناريوهات الضغط، حدود النمو |
| `modules/01-dashboards.html` … `10-system.html` | شرح تفصيلي + جداول شاشات + صور |
| `assets/showcase.css` | تنسيق العرض والطباعة |

## تحديث اللقطات الحية

الصور الحالية للإنتاج/المخازن/التكاليف موجودة في `docs/handover/_screenshots/`.

للقطات إضافية (صيانة، HR، جودة، عملاء، حسابات):

```bash
# مرة واحدة: تثبيت متصفح الالتقاط
npm i -D playwright && npx playwright install chromium

# يتطلب: npm run dev على المنفذ 3000 + docs/handover/.credentials
npm run showcase:screens
```

اللقطات تُحفظ في `docs/handover/_screenshots/modules/`.

## طباعة PDF

من أي صفحة: زر **طباعة / PDF** في الشريط العلوي → حفظ كـ PDF.
