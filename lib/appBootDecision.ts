/**
 * Boot gate for the SPA: branded splash only on cold start (no session cache).
 * Warm resume never shows splash screens — routes open and shell/page skeletons handle loading.
 */

export type BootPhase = 'auth' | 'tenant' | 'app-data' | 'ready' | 'error';

export type BootSplashVariant = 'branded' | 'resume';

export type BootDecision = {
  showSplash: boolean;
  splashVariant: BootSplashVariant;
  subtitle: string;
  allowRoutes: boolean;
  error?: string;
};

export const BOOTSTRAP_SPLASH_SUBTITLE = 'جاري تحميل النظام...';
export const BOOTSTRAP_RESUME_SUBTITLE = 'جاري استعادة الجلسة...';
export const BOOTSTRAP_TENANT_SUBTITLE = 'جاري تحميل بيانات الشركة...';

export type BuildBootDecisionOptions = {
  error?: string;
  /** Returning user with local session cache — skip all splash screens. */
  hasCachedSession?: boolean;
};

export const buildBootDecision = (
  phase: BootPhase,
  options: BuildBootDecisionOptions = {},
): BootDecision => {
  const { error, hasCachedSession = false } = options;

  if (phase === 'ready') {
    return {
      showSplash: false,
      splashVariant: 'branded',
      subtitle: '',
      allowRoutes: true,
      error,
    };
  }

  // Warm resume: never show branded/resume splash — Layout/AppShellSkeleton only.
  if (hasCachedSession) {
    return {
      showSplash: false,
      splashVariant: 'resume',
      subtitle: '',
      allowRoutes: true,
      error,
    };
  }

  const subtitleByPhase: Record<Exclude<BootPhase, 'ready'>, string> = {
    auth: BOOTSTRAP_SPLASH_SUBTITLE,
    tenant: BOOTSTRAP_TENANT_SUBTITLE,
    'app-data': BOOTSTRAP_SPLASH_SUBTITLE,
    error: error || 'تعذر تحميل النظام. جارٍ فتح التطبيق...',
  };

  return {
    showSplash: true,
    splashVariant: 'branded',
    subtitle: subtitleByPhase[phase],
    allowRoutes: false,
    error,
  };
};
