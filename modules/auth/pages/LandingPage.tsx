import React from 'react';
import { Link } from 'react-router-dom';

const FEATURES: { icon: string; title: string; desc: string }[] = [
  {
    icon: 'precision_manufacturing',
    title: 'الإنتاج والتخطيط',
    desc: 'أوامر العمل، الخطوط، الجداول الزمنية ومتابعة التنفيذ لحظة بلحظة.',
  },
  {
    icon: 'inventory_2',
    title: 'المخزون والمواد',
    desc: 'حركات المخزون، التحويلات بين المستودعات، وتتبع الدُفعات.',
  },
  {
    icon: 'groups',
    title: 'الموارد البشرية',
    desc: 'الموظفون، الحضور، الإجازات، الرواتب والهيكل التنظيمي في مكان واحد.',
  },
  {
    icon: 'account_balance_wallet',
    title: 'التكاليف والأصول',
    desc: 'مراكز التكلفة، توزيع المصروفات، والأصول والإهلاك.',
  },
  {
    icon: 'verified',
    title: 'الجودة والامتثال',
    desc: 'إجراءات الجودة، التتبع، وربط العمليات بمعايير التشغيل.',
  },
  {
    icon: 'insights',
    title: 'التقارير والمؤشرات',
    desc: 'لوحات معلومات، تقارير جاهزة، وتصدير للمراجعة والإدارة.',
  },
];

const HIGHLIGHTS: { icon: string; label: string; text: string }[] = [
  { icon: 'hub', label: 'منصة موحدة', text: 'إنتاج، مخزون، بشرية وتكاليف ضمن تجربة واحدة متسقة.' },
  { icon: 'lock', label: 'صلاحيات وتدقيق', text: 'أدوار مفصّلة وتتبع للأنشطة الحساسة.' },
  { icon: 'support_agent', label: 'دعم وتفعيل', text: 'مسار واضح لتسجيل الشركات ومتابعة طلبات الانضمام.' },
];

/** Public marketing landing — standalone layout (not the auth two-panel shell). */
export const LandingPage: React.FC = () => {
  const loginPath = '/login';

  return (
    <div className="landing-marketing">
      <header className="landing-marketing-nav">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
              style={{
                background: 'linear-gradient(145deg, rgb(var(--color-primary)) 0%, rgb(var(--color-primary-hover)) 100%)',
                boxShadow: '0 8px 24px rgb(var(--color-primary) / 0.35)',
              }}
            >
              <span className="material-icons-round text-[22px]">factory</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--color-text)] tracking-tight truncate">
                Hakimo ERP
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)] hidden sm:block">
                إدارة تشغيلية متكاملة
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--color-text-muted)]">
            <a href="#features" className="hover:text-[rgb(var(--color-primary))] transition-colors">
              المميزات
            </a>
            <a href="#why" className="hover:text-[rgb(var(--color-primary))] transition-colors">
              لماذا المنصة
            </a>
            <a href="#contact" className="hover:text-[rgb(var(--color-primary))] transition-colors">
              تواصل معنا
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={loginPath}
              className="hidden sm:inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-text)] border border-[var(--color-border)] bg-white/90 hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/register-company"
              className="inline-flex items-center justify-center rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
              style={{ background: 'rgb(var(--color-primary))' }}
            >
              تسجيل شركة
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16 md:pt-14 md:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
              <div className="order-2 lg:order-1 text-center lg:text-right">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold text-[rgb(var(--color-primary))] mb-4 shadow-sm">
                  <span className="material-icons-round text-[14px]">auto_awesome</span>
                  منصة تشغيل للشركات الصناعية
                </p>
                <h1 className="text-3xl sm:text-4xl md:text-[2.65rem] font-extrabold text-[var(--color-text)] leading-[1.15] tracking-tight mb-4">
                  تحكّم في الإنتاج والمخزون والموارد من لوحة واحدة
                </h1>
                <p className="text-base sm:text-lg text-[var(--color-text-muted)] leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
                  Hakimo ERP يجمع التخطيط، المخزون، الموارد البشرية والتكاليف في منظومة واحدة
                  قابلة للتوسع — لتقليل التشتت وتسريع القرار التشغيلي.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Link
                    to={loginPath}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:opacity-95 transition-opacity"
                    style={{
                      background: 'linear-gradient(135deg, rgb(var(--color-primary)) 0%, rgb(var(--color-primary-hover)) 100%)',
                      boxShadow: '0 12px 32px rgb(var(--color-primary) / 0.35)',
                    }}
                  >
                    <span className="material-icons-round text-[20px]">login</span>
                    ابدأ من لوحة شركتك
                  </Link>
                  <a
                    href="#features"
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold border border-[var(--color-border)] bg-white/90 text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors shadow-sm"
                  >
                    <span className="material-icons-round text-[20px] text-[rgb(var(--color-primary))]">
                      explore
                    </span>
                    استكشف المميزات
                  </a>
                </div>
                <p className="mt-6 text-xs text-[var(--color-text-muted)]">
                  لديك حساب معتمد؟{' '}
                  <Link to={loginPath} className="font-semibold text-[rgb(var(--color-primary))] hover:underline">
                    تسجيل الدخول
                  </Link>
                  {' · '}
                  <Link to="/register-company" className="font-semibold text-[rgb(var(--color-primary))] hover:underline">
                    طلب شركة جديدة
                  </Link>
                </p>
              </div>

              <div className="order-1 lg:order-2 relative">
                <div
                  className="absolute -inset-4 rounded-3xl opacity-[0.45] blur-3xl pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgb(var(--color-primary) / 0.35) 0%, transparent 70%)',
                  }}
                />
                <img
                  src="/landing/hero-marketing.png"
                  alt=""
                  className="landing-marketing-hero-img relative w-full h-auto object-cover max-h-[min(52vh,420px)] lg:max-h-[min(60vh,480px)]"
                  width={1200}
                  height={630}
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-16 md:py-20 border-t border-[var(--color-border)] bg-white/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12 md:mb-14">
              <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--color-text)] mb-3">
                مميزات تغطي دورة التشغيل كاملة
              </h2>
              <p className="text-[var(--color-text-muted)] text-sm md:text-base leading-relaxed">
                وحدات مترابطة بدل أنظمة منفصلة — من أمر العمل حتى التقرير المالي التشغيلي.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className="group rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm hover:shadow-md hover:border-[rgb(var(--color-primary)/0.25)] transition-all duration-200"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)/0.08)] text-[rgb(var(--color-primary))] mb-4 group-hover:bg-[rgb(var(--color-primary)/0.12)] transition-colors">
                    <span className="material-icons-round text-[26px]">{f.icon}</span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--color-text)] mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Why us */}
        <section id="why" className="scroll-mt-20 py-16 md:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="rounded-3xl border border-[var(--color-border)] bg-gradient-to-br from-white via-[#fafbff] to-[#eef2ff] p-8 md:p-12 shadow-sm">
              <div className="text-center mb-10 md:mb-12">
                <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--color-text)] mb-3">
                  لماذا Hakimo ERP؟
                </h2>
                <p className="text-[var(--color-text-muted)] text-sm md:text-base max-w-2xl mx-auto">
                  صممنا التجربة لتكون واضحة للفرق التشغيلية — أقل تعقيداً في اليومي، وأكثر وضوحاً للإدارة.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
                {HIGHLIGHTS.map((h) => (
                  <div key={h.label} className="text-center md:text-right">
                    <div className="inline-flex md:flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-[var(--color-border)] text-[rgb(var(--color-primary))] shadow-sm mb-4 mx-auto md:mx-0">
                      <span className="material-icons-round text-[22px]">{h.icon}</span>
                    </div>
                    <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{h.label}</h3>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{h.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 py-16 md:py-20 border-t border-[var(--color-border)] bg-white/70">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--color-text)] mb-3">
                تواصل معنا
              </h2>
              <p className="text-[var(--color-text-muted)] text-sm md:text-base">
                لفريق الدعم: تفعيل، صلاحيات، أو استفسارات تقنية — نرد خلال أوقات العمل.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <span className="material-icons-round text-[rgb(var(--color-primary))] text-[28px] shrink-0">
                    mail
                  </span>
                  <div>
                    <h3 className="font-bold text-[var(--color-text)] mb-1">البريد الإلكتروني</h3>
                    <a
                      href="mailto:support@hakimoerp.com"
                      className="text-sm font-semibold text-[rgb(var(--color-primary))] hover:underline break-all"
                    >
                      support@hakimoerp.com
                    </a>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
                      يُفضّل إرفاق اسم الشركة ووصف مختصر للمشكلة لتسريع المعالجة.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <span className="material-icons-round text-[rgb(var(--color-primary))] text-[28px] shrink-0">
                    schedule
                  </span>
                  <div>
                    <h3 className="font-bold text-[var(--color-text)] mb-1">أوقات الرد</h3>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                      أيام العمل — نسعى للرد في أقرب وقت. للطوارئ التشغيلية بعد التفعيل،
                      يُذكر الأولوية في عنوان الرسالة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
              <a
                href="mailto:support@hakimoerp.com?subject=%D8%AF%D8%B9%D9%85%20Hakimo%20ERP"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md hover:opacity-95 transition-opacity"
                style={{ background: 'rgb(var(--color-primary))' }}
              >
                <span className="material-icons-round text-[20px]">send</span>
                إرسال بريد للدعم
              </a>
              <Link
                to="/register-company"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                طلب تسجيل شركة جديدة
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[#f8fafc] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <p className="text-xs text-[var(--color-text-muted)]">
            © {new Date().getFullYear()} Hakimo ERP — منصة إدارة تشغيلية موحدة.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
            <Link to={loginPath} className="text-[rgb(var(--color-primary))] hover:underline">
              دخول المستخدمين
            </Link>
            <span className="text-[var(--color-border)] hidden sm:inline">|</span>
            <Link to="/register-company" className="text-[rgb(var(--color-primary))] hover:underline">
              تسجيل شركة
            </Link>
            <span className="text-[var(--color-border)] hidden sm:inline">|</span>
            <a href="mailto:support@hakimoerp.com" className="text-[rgb(var(--color-primary))] hover:underline">
              الدعم
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
