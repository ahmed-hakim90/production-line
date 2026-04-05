
import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageRouteFallback } from './components/PageRouteFallback';
import { RouterRealtimeSubscriptions } from './components/RouterRealtimeSubscriptions';
import { ProtectedRoute } from './components/ProtectedRoute';
import { lazyNamed } from './modules/shared/routes/lazyNamed';
import { AUTH_PUBLIC_ROUTES } from './modules/auth/routes';
import { DASHBOARD_ROUTES } from './modules/dashboards/routes';
import { CATALOG_ROUTES } from './modules/catalog/routes';
import { PRODUCTION_ROUTES } from './modules/production/routes';
import { QUALITY_ROUTES } from './modules/quality/routes';
import { HR_ROUTES } from './modules/hr/routes';
import { COST_ROUTES } from './modules/costs/routes';
import { SYSTEM_ROUTES } from './modules/system/routes';
import { INVENTORY_ROUTES } from './modules/inventory/routes';
import { ATTENDANCE_ROUTES } from './modules/attendance/routes';
import { REPAIR_ROUTES } from './modules/repair/routes';
import type { AppRouteDef } from './modules/shared/routes';
import type { PublicRouteDef } from './modules/shared/routes/types';
import { useAppStore } from './store/useAppStore';
import { useAuthUiSlice } from './store/selectors';
import { auth, onAuthChange } from './services/firebase';
import { eventBus, registerSystemEventListeners, SystemEvents } from './shared/events';
import { useTenantTheme } from './core/ui-engine/theme/useTenantTheme';
import { GlobalModalManagerProvider, useGlobalModalManager } from './components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from './components/modal-manager/modalKeys';
import { ModalHost } from './components/modal-manager/ModalHost';
import { toast, ToastContainer } from './components/Toast';
import { useJobsStore } from './components/background-jobs/useJobsStore';
import { presenceService } from './services/presenceService';
import { pushService } from './services/pushService';
import { sessionTrackerService } from './modules/system/audit';
import { userService } from './services/userService';
import { ForcedClientUpdateGate } from './components/ForcedClientUpdateGate';
import { NotificationPopupOverlay } from './components/NotificationPopupOverlay';
import { setCurrentTenant } from './lib/currentTenant';
import { defaultTenantSlug, resolveTenantNavigationTarget, tenantHomePath, tenantSlugFromPathname, withTenantPath } from './lib/tenantPaths';
import { tenantService } from './services/tenantService';
import { setAppLanguage, type SupportedLanguage } from './src/i18n';
import { TenantSlugResolveProvider } from './modules/auth/context/TenantSlugResolveContext';
import type { TenantSlugResolveValue } from './modules/auth/context/TenantSlugResolveContext';
import { SuperAdminGuard } from './modules/super-admin/SuperAdminGuard';
import { AuthBrandedLoadingPage } from './components/system-ui/AuthLoadingState';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useAuthStore } from './store/useAuthStore';

const HomeDashboardRouter = lazyNamed(() => import('./modules/dashboards/pages/HomeDashboardRouter'), 'HomeDashboardRouter');
const RegisterCompany = lazyNamed(() => import('./modules/auth/pages/RegisterCompany'), 'RegisterCompany');
const LandingPage = lazyNamed(() => import('./modules/auth/pages/LandingPage'), 'LandingPage');
const TenantLoginGateway = lazyNamed(
  () => import('./modules/auth/pages/TenantLoginGateway'),
  'TenantLoginGateway',
);
const RepairTrackPublic = lazyNamed(() => import('./modules/repair/pages/RepairTrackPublic'), 'RepairTrackPublic');
const CompanyNotApprovedPage = lazyNamed(() => import('./modules/auth/pages/CompanyNotApprovedPage'), 'CompanyNotApprovedPage');
const SuperAdminShell = lazyNamed(() => import('./modules/super-admin/SuperAdminShell'), 'SuperAdminShell');
const TenantsApproval = lazyNamed(() => import('./modules/super-admin/pages/TenantsApproval'), 'TenantsApproval');
const TenantInsightsPage = lazyNamed(() => import('./modules/super-admin/pages/TenantInsightsPage'), 'TenantInsightsPage');
import { UiDensityBootstrap } from './core/ui-engine/density/UiDensityBootstrap';

const POST_LOGIN_REDIRECT_KEY = 'post_login_redirect_path';
const DAILY_WELCOME_STORAGE_PREFIX = 'daily_welcome_seen';
const LEGACY_MODAL_WORKSPACE_LS = 'global_modal_workspace_v1';
const MODAL_WORKSPACE_CLEARED_FLAG = 'erp_modal_workspace_cleared_v1';

const buildCurrentPath = (location: { pathname: string; search: string }) =>
  `${location.pathname}${location.search}`;

const shouldPersistRedirect = (path: string) => {
  if (!path) return false;
  const lower = path.toLowerCase();
  if (lower.includes('/login') || lower.includes('/setup') || lower.includes('/pending')) return false;
  return true;
};

const savePostLoginRedirect = (path: string) => {
  if (!shouldPersistRedirect(path)) return;
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
};

const consumePostLoginRedirect = (): string | null => {
  const saved = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (!saved) return null;
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return shouldPersistRedirect(saved) ? saved : null;
};

const getTodayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const playNotificationTone = () => {
  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    void audio.play().catch(() => {});
    return;
  } catch {
    // Fall through to oscillator fallback when Audio is unavailable.
  }

  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    oscillator.start(start);
    oscillator.stop(start + 0.38);
    oscillator.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // Browser policy can block audio if user did not interact yet.
  }
};

/** After login: deep link if saved, otherwise tenant home */
const LoginRedirect: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const target = useMemo(() => {
    const saved = consumePostLoginRedirect();
    if (saved) {
      if (saved.startsWith('/t/')) return saved;
      if (saved.startsWith('/') && tenantSlug) {
        return `/t/${tenantSlug}${saved}`;
      }
    }
    return tenantHomePath(tenantSlug);
  }, [tenantSlug]);
  return <Navigate to={target} replace />;
};

/** Unified home: content by role permissions */
const HomeRedirect: React.FC = () => (
  <Suspense fallback={<PageRouteFallback />}>
    <HomeDashboardRouter />
  </Suspense>
);

const PROTECTED_ROUTES: AppRouteDef[] = [
  ...DASHBOARD_ROUTES,
  ...CATALOG_ROUTES,
  ...PRODUCTION_ROUTES,
  ...QUALITY_ROUTES,
  ...HR_ROUTES,
  ...COST_ROUTES,
  ...SYSTEM_ROUTES,
  ...INVENTORY_ROUTES,
  ...ATTENDANCE_ROUTES,
  ...REPAIR_ROUTES,
];

/** `/products` → `products` (real URLs are `/t/:tenantSlug/products`). */
const tenantRelativePath = (absolutePath: string): string =>
  absolutePath === '/' || absolutePath === '' ? '' : absolutePath.replace(/^\//, '');

const TenantCatchAll: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return <Navigate to={tenantHomePath(tenantSlug)} replace />;
};

const TenantPathRedirect: React.FC<{ redirectTo: string }> = ({ redirectTo }) => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const target =
    redirectTo === '/' || redirectTo === ''
      ? tenantHomePath(tenantSlug)
      : withTenantPath(tenantSlug, redirectTo);
  return <Navigate to={target} replace />;
};

const WrongCompanyLinkScreen: React.FC<{ forceLogout?: boolean }> = ({ forceLogout = false }) => {
  const navigate = useNavigate();
  const logout = useAppStore((s) => s.logout);

  useEffect(() => {
    if (forceLogout) {
      void logout().catch(() => {});
    }
  }, [forceLogout, logout]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="erp-auth-page">
      <div className="erp-auth-card text-center p-8 max-w-md mx-auto mt-12">
        <span className="material-icons-round text-5xl text-rose-500 mb-3 block">link_off</span>
        <h2 className="text-lg font-bold mb-2 text-rose-600">رابط الشركة غير صحيح</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          هذا الحساب تابع لشركة مختلفة. سيتم تحويلك للصفحة الرئيسية.
        </p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          العودة للصفحة الرئيسية
        </button>
      </div>
    </div>
  );
};

const ProtectedTenantShell: React.FC<{ isAuthenticated: boolean; isPendingApproval: boolean }> = ({
  isAuthenticated,
  isPendingApproval,
}) => {
  const location = useLocation();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const authError = useAppStore((s) => s.authError);

  const wrongCompanyLink =
    !isAuthenticated && String(authError || '').includes('لا ينتمي لهذه الشركة');

  if (wrongCompanyLink) {
    return <WrongCompanyLinkScreen />;
  }

  if (!isAuthenticated) {
    savePostLoginRedirect(buildCurrentPath(location));
    return <Navigate to={`/t/${tenantSlug}/login`} replace />;
  }

  if (isPendingApproval) {
    return <Navigate to={`/t/${tenantSlug}/pending`} replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

const AuthUiStateGuard: React.FC = () => {
  const { isAuthenticated, isPendingApproval } = useAuthUiSlice();
  const { resetAllModals } = useGlobalModalManager();
  const resetJobsUiState = useJobsStore((s) => s.resetUiState);

  useEffect(() => {
    // On any exit from protected app state, clear global overlays/stateful UI.
    if (!isAuthenticated || isPendingApproval) {
      resetAllModals();
      resetJobsUiState();
    }
  }, [isAuthenticated, isPendingApproval, resetAllModals, resetJobsUiState]);

  return null;
};

/** Migrates old bookmarks like `/#/path` to `/path` once on load. */
const LegacyHashRedirect: React.FC = () => {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    const { hash } = window.location;
    if (!hash.startsWith('#/')) return;
    const currentSlug = tenantSlugFromPathname(window.location.pathname);
    navigate(resolveTenantNavigationTarget(currentSlug, hash.slice(1)), { replace: true });
  }, [navigate]);
  return null;
};

const ServiceWorkerNavigateBridge: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const onWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type !== 'notification-click') return;
      const targetUrl = String(event.data.targetUrl || '/');
      if (targetUrl.startsWith('/')) {
        const currentSlug = tenantSlugFromPathname(window.location.pathname);
        navigate(resolveTenantNavigationTarget(currentSlug, targetUrl), { replace: true });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
  }, [navigate]);
  return null;
};

const PresenceHeartbeatBridge: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, isPendingApproval } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);
  const currentEmployeeId = useAppStore((s) => s.currentEmployee?.id || '');
  const userEmail = useAppStore((s) => s.userEmail);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const prevAuditRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) {
      prevAuditRouteRef.current = null;
      return;
    }
    const route = `${location.pathname}${location.search}` || '/';
    if (prevAuditRouteRef.current === route) return;
    const prev = prevAuditRouteRef.current;
    prevAuditRouteRef.current = route;
    if (prev !== null) {
      sessionTrackerService.onAppRouteChange(route);
    }
  }, [location.pathname, location.search, isAuthenticated, isPendingApproval, uid]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    const getRoute = () => `${location.pathname}${location.search}` || '/';
    const deriveModule = (route: string) => {
      if (!route || route === '/') return 'dashboard';
      const first = route.split('?')[0].split('/').filter(Boolean)[0];
      return first || 'dashboard';
    };

    /** Must match Firestore rules `request.auth.uid == userId` — store `uid` can lag after auth switches (e.g. register-company). */
    const presenceUid = auth?.currentUser?.uid;
    if (!presenceUid || presenceUid !== uid) return;

    const emitHeartbeat = () => {
      const route = getRoute();
      const writer = auth?.currentUser?.uid;
      if (!writer || writer !== presenceUid) return;
      void presenceService.heartbeat({
        userId: writer,
        employeeId: currentEmployeeId || '',
        userEmail: userEmail || '',
        displayName: userDisplayName || '',
        roleId: userRoleId || '',
        currentRoute: route,
        currentModule: deriveModule(route),
      });
    };

    emitHeartbeat();
    const timer = window.setInterval(emitHeartbeat, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') emitHeartbeat();
    };
    const onBeforeUnload = () => {
      const w = auth?.currentUser?.uid;
      if (w) void presenceService.markOffline(w);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    const unsubActions = eventBus.on(SystemEvents.USER_ACTION, (payload) => {
      const action = String(payload.action || payload.description || 'user.action');
      const w = auth?.currentUser?.uid;
      if (w && w === presenceUid) void presenceService.setLastAction(w, action);
    });

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsubActions();
      const w = auth?.currentUser?.uid;
      if (w && w === presenceUid) void presenceService.markOffline(w);
    };
  }, [
    isAuthenticated,
    isPendingApproval,
    uid,
    currentEmployeeId,
    userEmail,
    userDisplayName,
    userRoleId,
    location.pathname,
    location.search,
  ]);

  return null;
};

/** One-time: drop minimized-window workspace localStorage + Firestore uiPreferences.modalWorkspace. */
const ModalWorkspaceMigration: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const legacyIsAuthenticated = useAppStore((s) => s.isAuthenticated);
  const legacyIsPendingApproval = useAppStore((s) => s.isPendingApproval);
  const legacyLoading = useAppStore((s) => s.loading);
  const legacyUid = useAppStore((s) => s.uid);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || loading || !uid) return;
    if (localStorage.getItem(MODAL_WORKSPACE_CLEARED_FLAG)) return;
    try {
      localStorage.removeItem(LEGACY_MODAL_WORKSPACE_LS);
    } catch {
      /* ignore */
    }
    void userService.clearModalWorkspacePreference(uid).finally(() => {
      try {
        localStorage.setItem(MODAL_WORKSPACE_CLEARED_FLAG, '1');
      } catch {
        /* ignore */
      }
    });
  }, [isAuthenticated, isPendingApproval, loading, uid]);

  return null;
};

type TenantGate = 'loading' | 'ready' | 'missing' | 'suspended' | 'inactive' | 'forbidden_slug';

const DEFAULT_TENANT_SLUG = defaultTenantSlug();

const TenantPublicRoute: React.FC<{ resolveElement: PublicRouteDef['resolveElement'] }> = ({
  resolveElement,
}) => {
  const { isAuthenticated, isPendingApproval } = useAuthUiSlice();
  return (
    <Suspense fallback={<PageRouteFallback />}>
      {resolveElement({
        isAuthenticated,
        isPendingApproval,
        loginRedirectElement: <LoginRedirect />,
      })}
    </Suspense>
  );
};

const defaultTenantResolve: TenantSlugResolveValue = {
  pendingRegistration: false,
  tenantStatus: '',
};

const TenantLayout: React.FC = () => {
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const location = useLocation();
  const [gate, setGate] = useState<TenantGate>('loading');
  const [tenantResolve, setTenantResolve] = useState<TenantSlugResolveValue>(defaultTenantResolve);
  const [forbiddenRequiresLogout, setForbiddenRequiresLogout] = useState(false);
  const [forbiddenRedirectPath, setForbiddenRedirectPath] = useState<string | null>(null);
  const { isAuthenticated } = useAuthUiSlice();
  const userProfile = useAppStore((s) => s.userProfile);

  useEffect(() => {
    let alive = true;
    setGate('loading');
    setTenantResolve(defaultTenantResolve);
    setForbiddenRequiresLogout(false);
    setForbiddenRedirectPath(null);
    void (async () => {
      try {
        const r = await tenantService.resolveSlug(tenantSlug);
        if (!alive) return;
        if (!r.exists || !r.tenantId) {
          if (!isAuthenticated) {
            // Keep slug context for shared links even if slug resolution is temporarily unavailable.
            setTenantResolve({
              pendingRegistration: false,
              tenantStatus: 'unknown',
            });
            setGate('ready');
            return;
          }
          setGate('missing');
          return;
        }

        const loggedInTenantId = String(userProfile?.tenantId || '');
        const isSuperAdmin = Boolean(userProfile?.isSuperAdmin);
        if (isAuthenticated && !isSuperAdmin && (!loggedInTenantId || loggedInTenantId !== r.tenantId)) {
          // Keep current tenant during slug correction redirect to avoid breaking services
          // that synchronously read getCurrentTenantId().
          if (!loggedInTenantId) {
            setForbiddenRequiresLogout(true);
            setForbiddenRedirectPath('/');
          } else {
            try {
              const ownTenant = await tenantService.getById(loggedInTenantId);
              const ownSlug = String(ownTenant?.slug || '').trim();
              if (ownSlug) {
                setForbiddenRequiresLogout(false);
                setForbiddenRedirectPath(`/t/${encodeURIComponent(ownSlug)}/`);
              } else {
                setForbiddenRequiresLogout(true);
                setForbiddenRedirectPath('/');
              }
            } catch {
              setForbiddenRequiresLogout(true);
              setForbiddenRedirectPath('/');
            }
          }
          setGate('forbidden_slug');
          return;
        }

        setCurrentTenant(r.tenantId);
        if (r.pendingRegistration) {
          setTenantResolve({
            pendingRegistration: true,
            tenantStatus: r.status || 'pending',
          });
          setGate('ready');
          return;
        }
        if (r.status === 'suspended') {
          setGate('suspended');
          return;
        }
        if (r.status !== 'active') {
          setTenantResolve({
            pendingRegistration: false,
            tenantStatus: r.status || 'pending',
          });
          setGate('inactive');
          return;
        }
        setTenantResolve({
          pendingRegistration: false,
          tenantStatus: r.status || 'active',
        });
        setGate('ready');
      } catch {
        if (!alive) return;
        if (!isAuthenticated) {
          // Public/shared slug links should stay tenant-scoped on transient resolver failures.
          setTenantResolve({
            pendingRegistration: false,
            tenantStatus: 'unknown',
          });
          setGate('ready');
          return;
        }
        setGate('missing');
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantSlug, isAuthenticated, userProfile?.tenantId, userProfile?.isSuperAdmin]);

  if (gate === 'loading') {
    return <AuthBrandedLoadingPage subtitle="جاري تحميل بيانات الشركة..." />;
  }

  if (gate === 'missing') {
    const tenantLoginPath = `/t/${encodeURIComponent(tenantSlug)}/login`;
    if (!isAuthenticated && location.pathname !== tenantLoginPath) {
      return <Navigate to={tenantLoginPath} replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (gate === 'forbidden_slug') {
    if (forbiddenRedirectPath) {
      return <Navigate to={forbiddenRedirectPath} replace />;
    }
    return <WrongCompanyLinkScreen forceLogout={forbiddenRequiresLogout} />;
  }

  if (gate === 'suspended') {
    return (
      <div className="erp-auth-page">
        <div className="erp-auth-card text-center p-8 max-w-md mx-auto mt-12">
          <h2 className="text-lg font-bold mb-2 text-rose-600">الشركة موقوفة</h2>
          <p className="text-sm text-[var(--color-text-muted)]">تواصل مع الدعم لمزيد من المعلومات.</p>
        </div>
      </div>
    );
  }

  if (gate === 'inactive') {
    return (
      <Suspense fallback={<PageRouteFallback />}>
        <CompanyNotApprovedPage tenantSlug={tenantSlug} status={tenantResolve.tenantStatus} />
      </Suspense>
    );
  }

  return (
    <TenantSlugResolveProvider value={tenantResolve}>
      <Outlet />
    </TenantSlugResolveProvider>
  );
};

const RootFallbackRedirect: React.FC = () => {
  return <Navigate to="/" replace />;
};

const TrackLegacyRedirect: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const slug = String(params.get('slug') || '').trim();
  if (!slug) return <Navigate to="/" replace />;
  params.delete('slug');
  const rest = params.toString();
  return <Navigate to={`/track/${encodeURIComponent(slug)}${rest ? `?${rest}` : ''}`} replace />;
};

const DailyWelcomeLauncher: React.FC = () => {
  const { openModal, hasModalTarget } = useGlobalModalManager();
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || loading || !uid) return;
    const today = getTodayYmd();
    const storageKey = `${DAILY_WELCOME_STORAGE_PREFIX}_${uid}`;
    const seenDate = localStorage.getItem(storageKey);
    if (seenDate === today) return;
    const openOnce = () => {
      if (!hasModalTarget(MODAL_KEYS.DAILY_WELCOME)) return false;
      const opened = openModal(MODAL_KEYS.DAILY_WELCOME, { date: today });
      if (!opened) return false;
      localStorage.setItem(storageKey, today);
      return true;
    };

    if (openOnce()) return;
    const timer = window.setTimeout(() => {
      openOnce();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, isPendingApproval, loading, uid, openModal, hasModalTarget]);

  return null;
};

const App: React.FC = () => {
  useTenantTheme();

  const initializeApp = useAppInitialization();
  const syncAttendanceFromDevices = useAppStore((s) => s.syncAttendanceFromDevices);
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const uid = useAppStore((s) => s.uid);
  const legacyIsAuthenticated = useAppStore((s) => s.isAuthenticated);
  const legacyIsPendingApproval = useAppStore((s) => s.isPendingApproval);
  const legacyLoading = useAppStore((s) => s.loading);
  const legacyUid = useAppStore((s) => s.uid);
  const addRealtimeNotification = useAppStore((s) => s.addRealtimeNotification);
  const currentEmployeeId = useAppStore((s) => s.currentEmployee?.id || '');
  const userLanguage = useAppStore((s) => (s.userProfile?.uiPreferences?.language as SupportedLanguage | undefined));
  const activeSessionUidRef = useRef<string | null>(null);
  const cleanupSubsRef = useRef<(() => void) | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    useAuthStore.setState({
      isAuthenticated: legacyIsAuthenticated,
      isPendingApproval: legacyIsPendingApproval,
      loading: legacyLoading,
      uid: legacyUid,
    });
  }, [legacyIsAuthenticated, legacyIsPendingApproval, legacyLoading, legacyUid]);

  useEffect(() => {
    if (!authResolved) return;
    const lang = userLanguage ?? 'ar';
    void setAppLanguage(lang);
  }, [authResolved, userLanguage]);

  useEffect(() => {
    const clearSubscriptions = () => {
      cleanupSubsRef.current?.();
      cleanupSubsRef.current = null;
    };
    const resolveTimer = window.setTimeout(() => {
      // Safety fallback for local/dev if auth callback is delayed.
      setAuthResolved(true);
      useAppStore.setState({ loading: false });
    }, 6000);

    const unsub = onAuthChange(async (user) => {
      window.clearTimeout(resolveTimer);
      setAuthResolved(true);
      if (!user) {
        setCurrentTenant(null);
        sessionTrackerService.stop('auth_logout');
        activeSessionUidRef.current = null;
        clearSubscriptions();
        useAppStore.setState({
          loading: false,
          isAuthenticated: false,
          isPendingApproval: false,
        });
        return;
      }

      // Skip duplicate bootstraps for same authenticated session.
      if (activeSessionUidRef.current === user.uid && useAppStore.getState().isAuthenticated) return;

      clearSubscriptions();
      try {
        await Promise.race([
          initializeApp(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('initializeApp timeout')), 15000);
          }),
        ]);
      } catch {
        useAppStore.setState({ loading: false });
        return;
      }
      const state = useAppStore.getState();
      if (!state.isAuthenticated || state.isPendingApproval) {
        activeSessionUidRef.current = user.uid;
        return;
      }

      activeSessionUidRef.current = user.uid;

      const cleanupEvents = registerSystemEventListeners();
      cleanupSubsRef.current = () => {
        cleanupEvents();
      };
      sessionTrackerService.start({
        uid: user.uid,
        userName: user.displayName ?? user.email ?? user.uid,
      });
    });

    return () => {
      window.clearTimeout(resolveTimer);
      unsub();
      sessionTrackerService.stop('app_unmount');
      cleanupSubsRef.current?.();
      cleanupSubsRef.current = null;
    };
  }, [initializeApp]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    const timer = window.setInterval(() => {
      void syncAttendanceFromDevices({ mode: 'scheduled' }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, isPendingApproval, uid, syncAttendanceFromDevices]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || !uid) return;
    void pushService.registerDevice(uid, currentEmployeeId || '');
  }, [isAuthenticated, isPendingApproval, uid, currentEmployeeId]);

  useEffect(() => {
    let unsub = () => {};
    void pushService.subscribeForeground(({ title, body, data }) => {
      addRealtimeNotification({
        title,
        body,
        type: data.type || 'manual_broadcast',
        referenceId: data.reportId || data.referenceId,
        url: data.url || data.link,
        data,
      });
      if (Notification.permission === 'granted') {
        new Notification(title, { body, tag: data.notificationId || data.reportId || 'erp-notification' });
      }
      playNotificationTone();
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      unsub();
    };
  }, [addRealtimeNotification]);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: string) => {
      toast.error(String(message ?? 'حدث تنبيه'));
    };

    const onUnhandledError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || 'حدث خطأ غير متوقع';
      toast.error(message);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = typeof reason === 'string'
        ? reason
        : (reason?.message || 'حدث خطأ غير متوقع');
      toast.error(message);
    };

    window.addEventListener('error', onUnhandledError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.alert = nativeAlert;
      window.removeEventListener('error', onUnhandledError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  if (!authResolved) {
    return <AuthBrandedLoadingPage subtitle="جاري تهيئة النظام..." />;
  }

  return (
    <GlobalModalManagerProvider>
      <UiDensityBootstrap />
      <AuthUiStateGuard />
      <ModalWorkspaceMigration />
      <DailyWelcomeLauncher />
      <BrowserRouter>
        <RouterRealtimeSubscriptions />
        <LegacyHashRedirect />
        <ServiceWorkerNavigateBridge />
        <PresenceHeartbeatBridge />
        <Routes>
          <Route
            path="/register-company"
            element={
              <Suspense fallback={<PageRouteFallback />}>
                <RegisterCompany />
              </Suspense>
            }
          />
          <Route path="/super-admin" element={<SuperAdminGuard />}>
            <Route
              element={
                <Suspense fallback={<PageRouteFallback />}>
                  <SuperAdminShell />
                </Suspense>
              }
            >
              <Route index element={<Navigate to="tenants" replace />} />
              <Route
                path="tenants"
                element={
                  <Suspense fallback={<PageRouteFallback />}>
                    <TenantsApproval />
                  </Suspense>
                }
              />
              <Route
                path="insights"
                element={
                  <Suspense fallback={<PageRouteFallback />}>
                    <TenantInsightsPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>
          <Route
            path="/login"
            element={
              <Suspense fallback={<PageRouteFallback />}>
                <TenantLoginGateway />
              </Suspense>
            }
          />
          <Route path="/setup" element={<Navigate to={`/t/${DEFAULT_TENANT_SLUG}/setup`} replace />} />
          <Route path="/pending" element={<Navigate to={`/t/${DEFAULT_TENANT_SLUG}/pending`} replace />} />
          <Route
            path="/"
            element={
              <Suspense fallback={<PageRouteFallback />}>
                <LandingPage />
              </Suspense>
            }
          />
          <Route
            path="/track"
            element={<TrackLegacyRedirect />}
          />
          <Route
            path="/track/:tenantSlug"
            element={
              <Suspense fallback={<PageRouteFallback />}>
                <RepairTrackPublic />
              </Suspense>
            }
          />
          <Route path="/t/:tenantSlug" element={<TenantLayout />}>
            {AUTH_PUBLIC_ROUTES.map((r) => (
              <Route
                key={r.path}
                path={r.path}
                element={<TenantPublicRoute resolveElement={r.resolveElement} />}
              />
            ))}
            <Route
              element={
                <ProtectedTenantShell
                  isAuthenticated={isAuthenticated}
                  isPendingApproval={isPendingApproval}
                />
              }
            >
              <Route index element={<HomeRedirect />} />
              {PROTECTED_ROUTES.map((r) => {
                const childPath = tenantRelativePath(r.path);
                if (!childPath) return null;
                if (r.redirectTo) {
                  return (
                    <Route
                      key={r.path}
                      path={childPath}
                      element={<TenantPathRedirect redirectTo={r.redirectTo} />}
                    />
                  );
                }
                if (!r.component || (!r.permission && !(r.permissionsAny && r.permissionsAny.length > 0))) {
                  return null;
                }
                const Component = r.component;
                return (
                  <Route
                    key={r.path}
                    path={childPath}
                    element={
                      <ProtectedRoute permission={r.permission} permissionsAny={r.permissionsAny}>
                        <Suspense fallback={<PageRouteFallback />}>
                          <Component />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                );
              })}
              <Route path="*" element={<TenantCatchAll />} />
            </Route>
          </Route>
          <Route path="*" element={<RootFallbackRedirect />} />
        </Routes>
        {isAuthenticated && !isPendingApproval && <ModalHost />}
        <ForcedClientUpdateGate />
        <NotificationPopupOverlay />
        <ToastContainer />
      </BrowserRouter>
    </GlobalModalManagerProvider>
  );
};

export default App;
