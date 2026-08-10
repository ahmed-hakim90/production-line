import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/system-ui/BrandMark';
import { PRODUCT_BRAND } from '@/lib/productBrand';
import { getLastVisitedTenantSlug } from '@/lib/lastTenantSlugStorage';
import { tenantHomePath } from '@/lib/tenantPaths';

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
    icon: 'build',
    title: 'الصيانة والإصلاح',
    desc: 'استلام الأجهزة، التشخيص، قطع الغيار، والتسليم مع تتبع العميل.',
  },
  {
    icon: 'groups',
    title: 'الموارد البشرية',
    desc: 'الموظفون، الحضور، الإجازات، الرواتب والهيكل التنظيمي في مكان واحد.',
  },
  {
    icon: 'account_balance_wallet',
    title: 'التكاليف والمحاسبة',
    desc: 'مراكز التكلفة، تقييم المخزون، والدفاتر التشغيلية.',
  },
  {
    icon: 'insights',
    title: 'التقارير والمؤشرات',
    desc: 'لوحات معلومات، تقارير جاهزة، وتصدير للمراجعة والإدارة.',
  },
];

const HIGHLIGHTS: { icon: string; label: string; text: string }[] = [
  { icon: 'hub', label: 'منصة موحدة', text: 'إنتاج، مخزون، صيانة وموارد بشرية ضمن تجربة واحدة متسقة.' },
  { icon: 'lock', label: 'صلاحيات وتدقيق', text: 'أدوار مفصّلة وتتبع للأنشطة الحساسة عبر المستأجرين.' },
  { icon: 'devices', label: 'جاهز للميدان', text: 'واجهات تشغيلية للموبايل والكمبيوتر — من الاستلام حتى التسليم.' },
];

/** Public marketing landing — standalone layout (not the auth two-panel shell). */
export const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const brand = PRODUCT_BRAND.name;
  const lastSlug = getLastVisitedTenantSlug();
  const resumePath = lastSlug ? tenantHomePath(lastSlug) : '/login';
  const primaryCta = lastSlug ? resumePath : '/login';
  const primaryLabel = lastSlug ? 'متابعة إلى شركتك' : 'تسجيل الدخول';

  return (
    <div className="landing-marketing" dir="rtl">
      <header className="landing-marketing-nav">
        <div className="landing-marketing-nav__inner">
          <Link to="/" className="landing-marketing-brand" aria-label={`${brand} — الصفحة الرئيسية`}>
            <BrandMark size={40} className="landing-marketing-brand__logo" />
            <span className="landing-marketing-brand__text">
              <span className="landing-marketing-brand__name">{brand}</span>
              <span className="landing-marketing-brand__tag">{t('appSubtitle')}</span>
            </span>
          </Link>

          <nav className="landing-marketing-nav__links" aria-label="أقسام الصفحة">
            <a href="#features">المميزات</a>
            <a href="#why">لماذا المنصة</a>
            <a href="#contact">تواصل</a>
          </nav>

          <div className="landing-marketing-nav__actions">
            <Link to="/login" className="landing-marketing-btn landing-marketing-btn--ghost">
              دخول
            </Link>
            <Link to="/register-company" className="landing-marketing-btn landing-marketing-btn--solid">
              تسجيل شركة
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-marketing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-marketing-hero__media" aria-hidden="true">
            <img
              src="/landing/hero-marketing.png"
              alt=""
              width={1600}
              height={900}
              loading="eager"
              decoding="async"
            />
            <div className="landing-marketing-hero__veil" />
          </div>

          <div className="landing-marketing-hero__content">
            <div className="landing-marketing-hero__brand">
              <BrandMark size={72} className="landing-marketing-hero__logo" />
              <p className="landing-marketing-hero__product">{brand}</p>
            </div>

            <h1 id="landing-hero-title" className="landing-marketing-hero__title">
              {t('appTagline')}
            </h1>
            <p className="landing-marketing-hero__lead">
              خطط الإنتاج، المخزون، الإصلاح، والموارد البشرية — بصلاحيات واضحة وتجربة جاهزة للميدان.
            </p>

            <div className="landing-marketing-hero__cta">
              <Link to={primaryCta} className="landing-marketing-btn landing-marketing-btn--hero">
                <span className="material-icons-round" aria-hidden="true">
                  {lastSlug ? 'home' : 'login'}
                </span>
                {primaryLabel}
              </Link>
              <Link to="/register-company" className="landing-marketing-btn landing-marketing-btn--hero-ghost">
                طلب شركة جديدة
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="landing-marketing-section scroll-mt-20">
          <div className="landing-marketing-section__inner">
            <header className="landing-marketing-section__head">
              <h2>مميزات تغطي دورة التشغيل</h2>
              <p>وحدات مترابطة بدل أنظمة منفصلة — من أمر العمل حتى التقرير التشغيلي.</p>
            </header>
            <ul className="landing-marketing-features">
              {FEATURES.map((f) => (
                <li key={f.title} className="landing-marketing-feature">
                  <span className="landing-marketing-feature__icon material-icons-round" aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="why" className="landing-marketing-section landing-marketing-section--muted scroll-mt-20">
          <div className="landing-marketing-section__inner">
            <header className="landing-marketing-section__head">
              <h2>لماذا {brand}؟</h2>
              <p>واضحة للفرق التشغيلية — أقل تعقيداً في اليومي، وأكثر وضوحاً للإدارة.</p>
            </header>
            <ul className="landing-marketing-highlights">
              {HIGHLIGHTS.map((h) => (
                <li key={h.label}>
                  <span className="material-icons-round" aria-hidden="true">
                    {h.icon}
                  </span>
                  <h3>{h.label}</h3>
                  <p>{h.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="contact" className="landing-marketing-section scroll-mt-20">
          <div className="landing-marketing-section__inner landing-marketing-contact">
            <header className="landing-marketing-section__head">
              <h2>تواصل معنا</h2>
              <p>لتفعيل الشركات، الصلاحيات، أو الاستفسارات التقنية خلال أوقات العمل.</p>
            </header>
            <div className="landing-marketing-contact__actions">
              <a
                href={`mailto:support@forgeops.app?subject=${encodeURIComponent(`دعم ${brand}`)}`}
                className="landing-marketing-btn landing-marketing-btn--solid"
              >
                <span className="material-icons-round" aria-hidden="true">
                  mail
                </span>
                مراسلة الدعم
              </a>
              <Link to="/register-company" className="landing-marketing-btn landing-marketing-btn--ghost">
                طلب تسجيل شركة
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-marketing-footer">
        <div className="landing-marketing-footer__inner">
          <div className="landing-marketing-footer__brand">
            <BrandMark size={28} />
            <p>© {new Date().getFullYear()} {brand}</p>
          </div>
          <div className="landing-marketing-footer__links">
            <Link to="/login">دخول المستخدمين</Link>
            <Link to="/register-company">تسجيل شركة</Link>
            <a href="mailto:support@forgeops.app">الدعم</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
