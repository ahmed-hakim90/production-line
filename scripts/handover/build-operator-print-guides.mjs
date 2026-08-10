/**
 * Builds printable Arabic operator guides (self-contained HTML).
 * Run: node scripts/handover/build-operator-print-guides.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const cssPath = path.join(root, 'docs/handover/_print/operator-guide.css');
const outDir = path.join(root, 'docs/handover');
const css = fs.readFileSync(cssPath, 'utf8');

function page(guide) {
  const accentOverride = guide.accent
    ? `:root { --accent: ${guide.accent}; --navy: ${guide.navy || '#1e3a5f'}; }`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${guide.title} — للطباعة</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
${accentOverride}
${css}
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
    <button type="button" class="secondary" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">أعلى الصفحة</button>
    <span>A4 · اضغط الطباعة واختر «حفظ كـ PDF» إن حابب ملف</span>
  </div>

  <article class="sheet">
    <header class="cover">
      <div class="badge">${guide.badge}</div>
      <h1>${guide.title}</h1>
      <p class="lead">${guide.lead}</p>
      <div class="meta">
        ${guide.meta.map((line) => `<div>${line}</div>`).join('\n        ')}
      </div>
    </header>

    <div class="content">
      <nav class="toc" aria-label="فهرس">
        <h2>فهرس المحتويات</h2>
        <ol>
          ${guide.sections.map((s, i) => `<li><a href="#s${i + 1}">${s.toc}</a></li>`).join('\n          ')}
        </ol>
      </nav>

      ${guide.sections.map((s, i) => `
      <section id="s${i + 1}">
        <div class="kicker">القسم ${i + 1}</div>
        <h2>${s.heading}</h2>
        ${s.html}
      </section>`).join('\n')}

      <div class="summary-banner">
        <strong>خلاصة سطر واحد</strong>
        ${guide.summary}
      </div>
      <p class="footer-note">
        Factory ERP · ${guide.title} · أغسطس 2026<br />
        المصدر النصي: ${guide.source}
      </p>
    </div>
  </article>
</body>
</html>
`;
}

function table(headers, rows) {
  return `<table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n            ')}
          </tbody>
        </table>`;
}

function checklist(items) {
  return `<ul class="checklist">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

function signs() {
  return `<div class="sign-grid">
          <div class="sign-box"><div class="label">توقيع المتدرّب</div><div class="line">الاسم / التاريخ</div></div>
          <div class="sign-box"><div class="label">توقيع المدرّب</div><div class="line">الاسم / التاريخ</div></div>
          <div class="sign-box"><div class="label">بدء العمل منفردًا</div><div class="line">التاريخ</div></div>
        </div>`;
}

const guides = [
  {
    file: 'REPAIR_TECHNICIAN_GUIDE_PRINT_AR.html',
    title: 'دليل فني الصيانة',
    badge: 'تدريب تشغيل · صيانة · فني',
    lead: 'مرجع واضح بعد الشرح: لوحتك، طلباتك، ومساحة الورشة من التشخيص حتى الإنهاء.',
    accent: '#6d28d9',
    navy: '#312e81',
    meta: [
      'الدور في النظام: <strong>فني صيانة</strong>',
      'الجمهور: فني الورشة',
      'تاريخ الإصدار: <strong>10 أغسطس 2026</strong>',
      'نقطة البداية: <strong>لوحة الفني / طلباتي</strong>',
    ],
    source: 'docs/handover/REPAIR_TECHNICIAN_GUIDE_AR.md',
    summary: 'لوحتي → طلباتي → مساحة العمل → تشخيص → طلب قطع → إنهاء.',
    sections: [
      {
        toc: 'شغلك باختصار',
        heading: '1) شغلك باختصار',
        html: `
        <p>أنت فني ورشة. شغلك على <strong>الطلبات المسندة لك فقط</strong>: تشخيص → طلب قطع (لو لزم) → إصلاح/إنهاء.</p>
        <div class="grid-2">
          <div class="card do"><h4>تفعل أنت</h4><ul>
            <li>فتح طلباتي والعمل من مساحة الورشة</li>
            <li>التشخيص وتحديد العطل</li>
            <li>طلب قطع غيار من الورشة</li>
            <li>إنهاء الإصلاح أو تعليم غير قابل للإصلاح</li>
          </ul></div>
          <div class="card dont"><h4>لا تفعل أنت</h4><ul>
            <li>تسجيل طلب جديد من الاستقبال</li>
            <li>التحصيل والتسليم للعميل</li>
            <li>إدارة العهدة / التموين</li>
            <li>الخزينة والفروع والإعدادات</li>
          </ul></div>
        </div>
        <div class="callout ok"><strong>أول صفحة:</strong> لوحة الفني <span class="path">/repair/technician</span> — موبايل: لوحتي · طلباتي</div>`,
      },
      {
        toc: 'خريطة الصفحات',
        heading: '2) خريطة الصفحات',
        html: table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['لوحة الفني', '<span class="path">/repair/technician</span>', 'ملخص طلباتك'],
            ['طلباتي', '<span class="path">/repair/my-jobs</span>', 'كل الطلبات المسندة لك'],
            ['مساحة عمل الطلب', '<span class="path">/repair/jobs/:id/workspace</span>', 'تشخيص → قطع → إنهاء'],
          ],
        ) + `<div class="callout">باقي شاشات الصيانة مخفية عن دورك عمدًا. لو محتاج حاجة: كلّم مسؤول المركز.</div>`,
      },
      {
        toc: 'مسار العمل اليومي',
        heading: '3) مسار العمل اليومي',
        html: `
        <h3>صباحًا</h3>
        <ol class="steps">
          <li>افتح لوحتي / طلباتي</li>
          <li>رتّب حسب الأولوية</li>
          <li>ادخل أول طلب من مساحة العمل</li>
        </ol>
        <h3>على كل طلب</h3>
        <ol class="steps">
          <li><strong>تشخيص</strong> — سجّل العطل</li>
          <li>لو محتاج قطع → <strong>طلب قطع</strong> من الورشة</li>
          <li>نفّذ الإصلاح بعد التوفر/الموافقة</li>
          <li><strong>إنهاء</strong> أو علّم غير قابل للإصلاح</li>
        </ol>
        <h3>نهاية اليوم</h3>
        ${checklist([
          'لا طلبات مفتوحة بدون تحديث حالة',
          'طلبات القطع المعلّقة متابَعة مع الاستقبال',
          'ما فيش طلب نسيته في منتصف التشخيص',
        ])}`,
      },
      {
        toc: 'حالات الطلب',
        heading: '4) حالات الطلب اللي تهمك',
        html: table(
          ['الحالة', 'معناها لك'],
          [
            ['تشخيص', 'شغلك الآن'],
            ['انتظار موافقة العميل', 'استنى — متطلبش قطع غالية قبل الموافقة'],
            ['انتظار قطع', 'القطعة مطلوبة ولسه مش جاهزة'],
            ['إصلاح / اختبار', 'نفّذ واختبر'],
            ['جاهز', 'خلّصت — الاستقبال يتولى التسليم'],
            ['غير قابل للإصلاح', 'قرار فني مغلق من الورشة'],
          ],
        ),
      },
      {
        toc: 'قواعد وأخطاء',
        heading: '5) قواعد وأخطاء شائعة',
        html: `
        <div class="callout ok"><strong>قاعدة ذهبية:</strong> اشتغل من طلباتي / مساحة العمل فقط. طلب القطع من الورشة — متخصمش رصيد بنفسك ولا تحصّل.</div>
        ${table(
          ['الخطأ', 'الصحيح'],
          [
            ['ترك الطلب بدون تحديث', 'حدّث من مساحة العمل بعد كل خطوة'],
            ['طلب قطع من غير تشخيص', 'خلّص التشخيص أولًا'],
            ['محاولة فتح التحصيل/العهدة', 'مش من صلاحيتك — كلّم الاستقبال'],
          ],
        )}`,
      },
      {
        toc: 'تدريب وتوقيع',
        heading: '6) قائمة تحقق التدريب',
        html: checklist([
          'فتح لوحتي وطلباتي',
          'فتح مساحة عمل طلب وشرح الخطوات',
          'عمل تشخيص تجريبي',
          'طلب قطعة من الورشة',
          'إنهاء طلب / غير قابل للإصلاح تحت إشراف',
        ]) + signs(),
      },
    ],
  },
  {
    file: 'REPAIR_CENTER_MANAGER_GUIDE_PRINT_AR.html',
    title: 'دليل مسؤول مركز الصيانة',
    badge: 'تدريب تشغيل · صيانة · استقبال المركز',
    lead: 'تشغيل الفرع يوميًا: طلب جديد، متابعة، تموين وقطع، تحصيل وتسليم.',
    accent: '#0369a1',
    navy: '#0c4a6e',
    meta: [
      'الدور في النظام: <strong>استقبال صيانة / مسؤول تشغيل المركز</strong>',
      'الجمهور: موظف استقبال أو مسؤول فرع صيانة',
      'تاريخ الإصدار: <strong>10 أغسطس 2026</strong>',
      'نقطة البداية: <strong>لوحة الصيانة + طلب جديد</strong>',
    ],
    source: 'docs/handover/REPAIR_CENTER_MANAGER_GUIDE_AR.md',
    summary: 'طلب جديد → متابعة الطلبات → تموين/صرف قطع → تحصيل وتسليم.',
    sections: [
      {
        toc: 'شغلك باختصار',
        heading: '1) شغلك باختصار',
        html: `
        <p>أنت واجهة المركز مع العميل وتشغيل الطلب من الاستلام حتى التسليم، مع مخزون قطع المركز.</p>
        <div class="grid-2">
          <div class="card do"><h4>تفعل أنت</h4><ul>
            <li>تسجيل طلب جديد واستلام جهاز</li>
            <li>متابعة طلبات فرعك وإسناد الفني</li>
            <li>التحصيل والتسليم</li>
            <li>تموين قطع المركز واستلامها</li>
            <li>سندات صرف قطع للورشة</li>
            <li>عهدة / استبدال / شكاوى الفرع</li>
          </ul></div>
          <div class="card dont"><h4>لا تفعل أنت (عادة)</h4><ul>
            <li>إعدادات كل المراكز</li>
            <li>لوحة أدمن كل المراكز</li>
            <li>تجهيز التموين من المخزن المركزي</li>
            <li>التشخيص الفني العميق (للفني)</li>
            <li>زر «إسناد لي» — للفني المربوط بالفرع فقط</li>
          </ul></div>
        </div>
        <div class="callout ok"><strong>أول صفحة:</strong> لوحة الصيانة <span class="path">/repair</span> — موبايل: رئيسية · طلب جديد · الطلبات · التحصيل</div>
        <div class="callout">اربط الحساب بفرع الصيانة (+ مخزن المركز إن وُجد).</div>`,
      },
      {
        toc: 'خريطة الصفحات',
        heading: '2) خريطة الصفحات',
        html: `
        <h3>تشغيل الطلبات</h3>
        ${table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['لوحة الصيانة', '<span class="path">/repair</span>', 'نظرة اليوم'],
            ['طلب جديد', '<span class="path">/repair/jobs/new</span>', 'استلام جهاز'],
            ['طلبات الصيانة', '<span class="path">/repair/jobs</span>', 'متابعة الفرع'],
            ['التحصيل والتسليم', '<span class="path">/repair/payments</span>', 'قبض وإغلاق'],
            ['عهدة الأجهزة', '<span class="path">/repair/custody-stock</span>', 'عهدة / غير قابل للإصلاح'],
            ['استبدال / شكاوى', '<span class="path">/repair/replacements</span> · شكاوى', 'حسب الحالة'],
          ],
        )}
        <h3>قطع وتموين</h3>
        ${table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['قطع غيار المراكز', '<span class="path">/repair/parts</span>', 'أرصدة المركز'],
            ['متابعة التموين', '<span class="path">/repair/parts-replenishment</span>', 'طلب + تأكيد استلام'],
            ['سندات صرف قطع', '<span class="path">/repair/spare-issues</span>', 'صرف للورشة'],
          ],
        )}`,
      },
      {
        toc: 'مسار العمل اليومي',
        heading: '3) مسار العمل اليومي',
        html: `
        <h3>صباحًا</h3>
        <ol class="steps">
          <li>لوحة الصيانة — متأخرات وجاهز للتسليم</li>
          <li>تحصيل معلّق + تموين بانتظار الاستلام</li>
          <li>سندات صرف معلّقة للفنيين</li>
        </ol>
        <h3>خلال اليوم</h3>
        ${table(
          ['الحالة', 'ماذا تفعل', 'أين'],
          [
            ['عميل جديد', 'سجّل طلب', 'طلب جديد'],
            ['للفني', 'أسند من قائمة الفرع (مش «إسناد لي»)', 'الطلبات'],
            ['طلب قطع', 'سند صرف بعد التوفر', 'سندات صرف'],
            ['نقص قطع', 'اطلب تموين', 'متابعة التموين'],
            ['وصل تموين', 'أكّد الاستلام', 'متابعة التموين'],
            ['جاهز', 'حصّل وسلّم', 'التحصيل'],
          ],
        )}
        <h3>نهاية اليوم</h3>
        ${checklist([
          'لا أجهزة جاهزة من غير تسليم/إبلاغ',
          'لا تموين واصل من غير تأكيد استلام',
          'لا سند صرف معلّق بدون سبب',
          'التحصيلات اليومية سليمة',
        ])}`,
      },
      {
        toc: 'قواعد ذهبية',
        heading: '4) قواعد ذهبية',
        html: `
        <div class="callout ok">الرصيد يدخل مخزن المركز عند <strong>تأكيد استلام التموين</strong> فقط — مش عند إنشاء الطلب.</div>
        <div class="callout navy">صرف القطعة للورشة من <strong>سندات صرف قطع الغيار</strong> مربوط بالطلب.</div>
        ${table(
          ['الخطأ', 'الصحيح'],
          [
            ['طلب التموين = دخول رصيد', 'الرصيد بعد تأكيد الاستلام'],
            ['صرف بدون سند', 'استخدم سندات صرف القطع'],
            ['نسيان إسناد الفني', 'أسند من قائمة الفرع على الطلب (لا «إسناد لي»)'],
            ['«إسناد لي» من الاستقبال', 'للفني المربوط بالفرع فقط — اختر من القائمة'],
          ],
        )}`,
      },
      {
        toc: 'تدريب وتوقيع',
        heading: '5) قائمة تحقق التدريب',
        html: checklist([
          'تسجيل طلب جديد كامل',
          'إسناد فني من قائمة الفرع (بدون «إسناد لي») ومتابعة الحالة',
          'طلب تموين + تأكيد استلام',
          'سند صرف قطع لطلب',
          'تحصيل وتسليم',
          'عهدة / استبدال حسب السياسة',
        ]) + signs(),
      },
    ],
  },
  {
    file: 'REPAIR_MAINTENANCE_MANAGER_GUIDE_PRINT_AR.html',
    title: 'دليل مدير الصيانة',
    badge: 'تدريب إدارة · صيانة · مدير المراكز',
    lead: 'رقابة التشغيل عبر المركز أو كل المراكز: طلبات، تموين، تحصيل، أداء، وإعدادات.',
    accent: '#b45309',
    navy: '#7c2d12',
    meta: [
      'الدور في النظام: <strong>مدير الصيانة / مدير المراكز</strong>',
      'صلاحية أساسية: <strong>repair.adminDashboard.view</strong>',
      'تاريخ الإصدار: <strong>10 أغسطس 2026</strong>',
      'نقطة البداية: <strong>لوحة الصيانة (أدمن)</strong>',
    ],
    source: 'docs/handover/REPAIR_MAINTENANCE_MANAGER_GUIDE_AR.md',
    summary: 'لوحة الإدارة → الطلبات الحرجة → التموين → التحصيل → أداء الفنيين → إعدادات عند الحاجة.',
    sections: [
      {
        toc: 'شغلك باختصار',
        heading: '1) شغلك باختصار',
        html: `
        <p>تشرف على تشغيل الصيانة والمؤشرات عبر الفرع أو كل المراكز — مش بديل عن الفني في كل طلب.</p>
        <div class="grid-2">
          <div class="card do"><h4>تفعل أنت</h4><ul>
            <li>لوحة أدمن والمؤشرات</li>
            <li>متابعة الطلبات الحرجة</li>
            <li>أداء الفنيين</li>
            <li>متابعة التموين بين المركزي والمراكز</li>
            <li>خزينة وتقارير (إن مُنحت)</li>
            <li>فروع وإعدادات (إن مُنحت)</li>
          </ul></div>
          <div class="card dont"><h4>تفوّض / تتابع</h4><ul>
            <li>تسجيل كل طلب يوميًا ← الاستقبال</li>
            <li>التشخيص التفصيلي ← الفني</li>
            <li>تأكيد استلام كل شحنة ← الاستقبال</li>
          </ul></div>
        </div>
        <div class="callout">النطاق من إعدادات الصيانة: فرع واحد أو <strong>كل مراكز الصيانة</strong>.</div>`,
      },
      {
        toc: 'خريطة الصفحات',
        heading: '2) خريطة الصفحات',
        html: table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['لوحة الصيانة', '<span class="path">/repair</span>', 'KPIs ومتأخرات'],
            ['طلبات الصيانة', '<span class="path">/repair/jobs</span>', 'متابعة الفروع'],
            ['أداء الفنيين', '<span class="path">/repair/technician-kpis</span>', 'إنتاجية الفريق'],
            ['التحصيل والتسليم', '<span class="path">/repair/payments</span>', 'رقابة مالية'],
            ['الخزينة / تقريرها', '<span class="path">/repair/treasury</span>', 'حركة وتقارير'],
            ['متابعة التموين', '<span class="path">/repair/parts-replenishment</span>', 'اختناق القطع'],
            ['سندات صرف قطع', '<span class="path">/repair/spare-issues</span>', 'رقابة الصرف'],
            ['الفروع', '<span class="path">/repair/branches</span>', 'ربط مخزن ومسؤول'],
            ['إعدادات الصيانة', '<span class="path">/repair/settings</span>', 'نطاق وسياسات'],
          ],
        ),
      },
      {
        toc: 'روتين يومي وأسبوعي',
        heading: '3) روتين يومي / أسبوعي',
        html: `
        <h3>يوميًا (15–25 د)</h3>
        <ol class="steps">
          <li>لوحة الصيانة — متأخرات وجاهز واختناقات</li>
          <li>طلبات حرجة (SLA / شكاوى / انتظار قطع)</li>
          <li>تموين معلّق</li>
          <li>تحصيل معلّق وعهدة</li>
          <li>لمحة أداء الفنيين</li>
        </ol>
        <h3>أسبوعيًا / شهريًا</h3>
        ${checklist([
          'مقارنة أداء المراكز/الفنيين',
          'تقرير خزينة / فروقات',
          'شكاوى متكررة وموديلات عالية العطل',
          'مراجعة سياسات الخصم/الآجل/الضمان',
          'مراجعة نطاق المدير (فرع vs كل المراكز)',
        ])}`,
      },
      {
        toc: 'فرّق الأدوار',
        heading: '4) فرّق الأدوار',
        html: table(
          ['الدور', 'المسؤولية'],
          [
            ['استقبال / مسؤول مركز', 'طلب جديد، تحصيل، تموين واستلام، صرف قطع، عهدة'],
            ['فني صيانة', 'تشخيص وإصلاح من مساحة الورشة'],
            ['مخزن قطع مركزي', 'تجهيز تموين المراكز'],
            ['مدير الصيانة', 'رقابة، أداء، اعتمادات، إعدادات، حل الاختناقات'],
          ],
        ),
      },
      {
        toc: 'تدريب وتوقيع',
        heading: '5) قائمة تحقق التدريب',
        html: checklist([
          'فتح لوحة أدمن وشرح المؤشرات',
          'فلترة الطلبات حسب فرع/حالة',
          'متابعة تموين حتى الاستلام',
          'قراءة أداء فني واتخاذ إجراء',
          'فتح خزينة/تقرير إن مفعّل',
          'معرفة أين يُضبط نطاق المدير',
        ]) + signs(),
      },
    ],
  },
  {
    file: 'SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_PRINT_AR.html',
    title: 'دليل مسؤول مخزن قطع الغيار المركزي',
    badge: 'تدريب تشغيل · مخازن · قطع غيار مركزي',
    lead: 'تموين المراكز من المخزن المركزي: اعتماد، تجهيز، متابعة الاستلام، والسحب من المراكز.',
    accent: '#0e7490',
    navy: '#155e75',
    meta: [
      'الدور في النظام: <strong>مسؤول مخزن قطع الغيار المركزي</strong>',
      'الجمهور: أمين المخزن المركزي لقطع الصيانة',
      'تاريخ الإصدار: <strong>10 أغسطس 2026</strong>',
      'نقطة البداية: <strong>/inventory/spare-parts-replenishment</strong>',
    ],
    source: 'docs/handover/SPARE_PARTS_CENTRAL_WAREHOUSE_GUIDE_AR.md',
    summary: 'تموين مركزي ← اعتمد ← جهّز ← تابع استلام المركز ← راقب أرصدة المراكز والسحب.',
    sections: [
      {
        toc: 'شغلك باختصار',
        heading: '1) شغلك باختصار',
        html: `
        <p>أنت مخزن <strong>قطع الغيار المركزي</strong>. الرصيد لا يخرج للمراكز إلا بعد <strong>تأكيد استلام المركز</strong>.</p>
        <div class="grid-2">
          <div class="card do"><h4>تفعل أنت</h4><ul>
            <li>اعتماد طلبات التموين</li>
            <li>تجهيز الطلب من رصيدك</li>
            <li>موافقة المسؤول بعد التجهيز (إن مُنحت)</li>
            <li>سحب قطع من المراكز</li>
            <li>أرصدة المراكز + وارد/جرد المركزي</li>
          </ul></div>
          <div class="card dont"><h4>لا تفعل أنت (عادة)</h4><ul>
            <li>تسجيل طلب صيانة عميل</li>
            <li>تأكيد استلام التموين في المركز</li>
            <li>تشخيص فني / مساحة الورشة</li>
            <li>صرف سند قطع على طلب صيانة</li>
          </ul></div>
        </div>
        <div class="callout ok"><strong>أول صفحة:</strong> تموين مركزي <span class="path">/inventory/spare-parts-replenishment</span></div>
        <div class="callout">اربط الحساب بمخزن دوره <strong>قطع غيار (مركزي)</strong>.</div>`,
      },
      {
        toc: 'دورة التموين',
        heading: '2) دورة التموين',
        html: table(
          ['الخطوة', 'من يفعل', 'هل يتحرك الرصيد؟'],
          [
            ['طلب', 'مركز الصيانة', 'لا'],
            ['اعتماد', 'أنت / مخوّل', 'لا'],
            ['تجهيز', 'المخزن المركزي', 'لا'],
            ['موافقة المسؤول', 'أنت إن مُنحت', 'لا'],
            ['تأكيد الاستلام', 'المركز', '<strong>نعم</strong> — تحويل للمركز'],
          ],
        ),
      },
      {
        toc: 'خريطة الصفحات',
        heading: '3) خريطة الصفحات',
        html: `
        <h3>أساسي</h3>
        ${table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['تموين مركزي → مراكز', '<span class="path">/inventory/spare-parts-replenishment</span>', 'اعتماد / تجهيز / موافقة'],
            ['أرصدة المراكز', '<span class="path">/inventory/spare-parts-center-stock</span>', 'ماذا عند كل مركز'],
            ['سحب من المراكز', '<span class="path">/inventory/spare-parts-recall</span>', 'سحب للمركزي'],
            ['فاتورة شراء قطع', '<span class="path">/inventory/spare-parts-purchase</span>', 'وارد شراء'],
            ['إذن إضافة', '<span class="path">/inventory/movements … IN</span>', 'وارد يدوي'],
          ],
        )}
        <h3>تشغيل يومي</h3>
        ${table(
          ['الصفحة', 'المسار', 'الاستخدام'],
          [
            ['الأرصدة / الحركات', '<span class="path">/inventory/balances</span>', 'رصيد ودفتر'],
            ['كارت الصنف', '<span class="path">/inventory/item-card</span>', 'تاريخ صنف'],
            ['جرد / مواقع', '<span class="path">/inventory/counts</span>', 'جرد وتنظيم'],
            ['اعتماد تحويلات', '<span class="path">/inventory/transfer-approvals</span>', 'تحويلات معلّقة'],
          ],
        )}`,
      },
      {
        toc: 'مسار العمل اليومي',
        heading: '4) مسار العمل اليومي',
        html: `
        <h3>صباحًا</h3>
        <ol class="steps">
          <li>افتح التموين المركزي</li>
          <li>صفّ: اعتماد → تجهيز → موافقة مسؤول</li>
          <li>راجع أرصدة المراكز والأصناف الحرجة</li>
          <li>راجع سحب من المراكز المعلّق</li>
        </ol>
        <h3>خلال اليوم</h3>
        ${table(
          ['الحالة', 'ماذا تفعل', 'أين'],
          [
            ['طلب جديد', 'راجع واعتمد', 'تموين مركزي'],
            ['معتمد', 'جهّز من الرصيد', 'تموين مركزي'],
            ['بعد التجهيز', 'موافقة مسؤول إن لزم', 'تموين مركزي'],
            ['زيادة في مركز', 'أنشئ سحب', 'سحب من المراكز'],
            ['وارد شراء', 'فاتورة أو وارد يدوي', 'شراء / حركات'],
          ],
        )}
        <h3>نهاية اليوم</h3>
        ${checklist([
          'لا طلبات معتمدة من غير تجهيز بدون سبب',
          'لا تجهيز معلّق بدون موافقة إن مطلوبة',
          'حالات السحب المعلّقة متابَعة',
          'الحركات منطقية عند الشك',
        ])}`,
      },
      {
        toc: 'قواعد وأخطاء',
        heading: '5) قواعد وأخطاء شائعة',
        html: `
        <div class="callout ok"><strong>قاعدة ذهبية:</strong> الاستلام عند المركز = لحظة خصم رصيدك. قبل كده مراحل موافقات فقط.</div>
        ${table(
          ['الخطأ', 'الصحيح'],
          [
            ['الاعتماد = خروج رصيد', 'الرصيد عند استلام المركز'],
            ['تجهيز بدون رصيد', 'راجع الأرصدة قبل التجهيز'],
            ['شاشة تموين الصيانة بدل المخازن', 'استخدم شاشة التموين المركزي'],
            ['خلط مع مستلزمات الإنتاج', 'مسار مختلف تمامًا'],
          ],
        )}`,
      },
      {
        toc: 'تدريب وتوقيع',
        heading: '6) قائمة تحقق التدريب',
        html: checklist([
          'فتح التموين المركزي وشرح الحالات',
          'اعتماد طلب تجريبي',
          'تجهيز + موافقة مسؤول إن مفعّلة',
          'متابعة حتى استلام المركز',
          'أرصدة المراكز + سحب من مركز',
          'وارد شراء أو إذن إضافة',
          'جرد / كارت صنف',
        ]) + signs(),
      },
    ],
  },
];

for (const g of guides) {
  const out = path.join(outDir, g.file);
  fs.writeFileSync(out, page(g), 'utf8');
  console.log('wrote', path.relative(root, out));
}
