# Production diagrams

هذه الرسومات توثّق مسار الإنتاج الحالي كما تنفذه خدمات التطبيق وCloud Functions.

- `production-flow.mmd`: دورة الإنتاج من الخطة حتى التقرير والمخزون والتكلفة.
- `production-firestore-relations.mmd`: العلاقات المنطقية بين مجموعات Firestore المرتبطة بالإنتاج.
- ملفات `.svg` هي النسخ الجاهزة للعرض والتكبير والطباعة.
- نموذج LikeC4 موجود في `../ARCHITECTURE/production.c4`، وصوره في `../ARCHITECTURE/rendered/`.
- توجد نماذج ورسومات مماثلة للجودة والمخازن والصيانة داخل المجلدين نفسيهما.

لتحديث كل الرسومات بعد تعديل النموذج:

```sh
npm run diagram:production
npm run diagram:operations
```

لمعاينة نموذج LikeC4 تفاعليًا:

```sh
npx likec4 start docs/ARCHITECTURE
```

العلاقات مع Firestore موثقة منطقيًا من الحقول المرجعية في الكود؛ Firestore لا يفرض مفاتيح أجنبية فعلية.
