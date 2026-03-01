import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { userService } from '../services/userService';

type MinimizedModalEntry = {
  id: string;
  title: string;
  workspaceId: string;
  route: string;
};

type WorkspaceItem = {
  id: string;
  title: string;
  route: string;
  favorite: boolean;
  openerText?: string;
};

const MODAL_ID_ATTR = 'data-global-modal-id';
const MANAGED_ATTR = 'data-global-modal-managed';
const MINIMIZED_ATTR = 'data-global-modal-minimized';
const WORKSPACE_STORAGE_KEY = 'global_modal_workspace_v1';

const hasDialogLikePanel = (el: HTMLElement): boolean => {
  const children = Array.from(el.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  return children.some((child) => {
    const cls = String(child.className || '');
    const role = child.getAttribute('role') || '';
    return (
      role === 'dialog' ||
      cls.includes('max-w-') ||
      cls.includes('rounded-') ||
      cls.includes('shadow') ||
      cls.includes('bg-white') ||
      cls.includes('dark:bg-')
    );
  });
};

const isLikelyOverlay = (el: Element): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('header, nav, aside')) return false;
  const cls = el.className || '';
  const hasFixedInsetClasses = cls.includes('fixed') && cls.includes('inset-0');
  if (!hasFixedInsetClasses) return false;

  const hasCenteredLayoutClasses = cls.includes('flex') && cls.includes('justify-center');
  let hasCenteredLayoutByStyle = false;
  try {
    const style = window.getComputedStyle(el);
    hasCenteredLayoutByStyle =
      style.display === 'flex' &&
      (style.justifyContent === 'center' || style.justifyContent === 'space-around' || style.justifyContent === 'space-evenly');
  } catch {
    hasCenteredLayoutByStyle = false;
  }
  if (!(hasCenteredLayoutClasses || hasCenteredLayoutByStyle)) return false;

  const hasOverlayClasses =
    cls.includes('bg-black/') ||
    cls.includes('bg-slate/') ||
    cls.includes('bg-gray/') ||
    cls.includes('backdrop-blur');
  if (!(hasOverlayClasses || hasDialogLikePanel(el))) return false;

  return hasDialogLikePanel(el);
};

const getModalPanel = (overlay: HTMLElement): HTMLElement | null => {
  const children = Array.from(overlay.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length === 0) return null;
  const dialogChild = children.find((child) => {
    const cls = String(child.className || '');
    const role = child.getAttribute('role') || '';
    return (
      role === 'dialog' ||
      cls.includes('max-w-') ||
      cls.includes('rounded-') ||
      cls.includes('shadow') ||
      cls.includes('bg-white') ||
      cls.includes('dark:bg-')
    );
  });
  return dialogChild || children[0] || null;
};

const getModalTitle = (panel: HTMLElement): string => {
  const titleEl = panel.querySelector('h1, h2, h3, [data-modal-title]');
  const text = (titleEl?.textContent || '').trim();
  return text || 'نافذة';
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const splitWords = (value: string) =>
  normalizeText(value).split(' ').filter((word) => word.length > 1);

const makeIconButton = (icon: string, title: string): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = title;
  btn.className =
    'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white transition-colors';
  const span = document.createElement('span');
  span.className = 'material-icons-round text-base';
  span.textContent = icon;
  btn.appendChild(span);
  return btn;
};

const getModalHeaderElement = (panel: HTMLElement): HTMLElement | null => {
  return (panel.querySelector('div[class*="border-b"], header, [data-modal-header]') as HTMLElement | null) || null;
};

const hideLegacyHeaderCloseButton = (panel: HTMLElement) => {
  const header = getModalHeaderElement(panel);
  if (!header) return;
  const closeButtons = Array.from(header.querySelectorAll('button')).filter((btn) => {
    const iconEl = btn.querySelector('.material-icons-round');
    const iconText = (iconEl?.textContent || '').trim();
    return iconText === 'close';
  });
  closeButtons.forEach((btn) => {
    (btn as HTMLElement).style.display = 'none';
  });
};

export const GlobalModalEnhancer: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const [minimized, setMinimized] = useState<MinimizedModalEntry[]>([]);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openHint, setOpenHint] = useState<string | null>(null);
  const workspaceRef = useRef<WorkspaceItem[]>([]);
  const overlaysRef = useRef<Map<string, HTMLElement>>(new Map());
  const panelsRef = useRef<Map<string, HTMLElement>>(new Map());
  const dragStateRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const offsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastInteractionRef = useRef<{ route: string; openerText: string; at: number } | null>(null);

  const getCurrentRoute = () => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/')) return hash.slice(1);
    if (hash.startsWith('#')) return hash.slice(1) || '/';
    return `${window.location.pathname}${window.location.search}` || '/';
  };

  const normalizeRoute = (route: string) => {
    if (!route) return '/';
    return route.startsWith('/') ? route : `/${route}`;
  };

  const makeWorkspaceId = (title: string, route: string) =>
    `${normalizeRoute(route)}::${title.trim().toLowerCase()}`;

  const commitWorkspaceItems = (updater: (prev: WorkspaceItem[]) => WorkspaceItem[]) => {
    setWorkspaceItems((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage write failures
      }
      return next;
    });
  };

  const upsertWorkspaceItem = (title: string, route: string, favorite: boolean, openerText?: string) => {
    const normalizedRoute = normalizeRoute(route);
    const id = makeWorkspaceId(title, normalizedRoute);
    commitWorkspaceItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return [...prev, { id, title, route: normalizedRoute, favorite, openerText }];
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        title,
        route: normalizedRoute,
        favorite: favorite || next[idx].favorite,
        openerText: openerText || next[idx].openerText,
      };
      return next;
    });
    return id;
  };

  const removeWorkspaceItem = (workspaceId: string) => {
    commitWorkspaceItems((prev) => prev.filter((item) => item.id !== workspaceId));
  };

  const tryOpenModalFromHint = (item: WorkspaceItem): boolean => {
    const hint = normalizeText(item.openerText || item.title || '');
    if (!hint) return false;
    const hintWords = splitWords(hint);
    const candidates = Array.from(
      document.querySelectorAll('button,[role="button"],a')
    ) as HTMLElement[];
    const target = candidates.find((el) => {
      const text = normalizeText(el.textContent || '');
      const label = normalizeText(el.getAttribute('aria-label') || '');
      const title = normalizeText(el.getAttribute('title') || '');
      if (!text && !label && !title) return false;
      const stack = `${text} ${label} ${title}`;
      if (stack.includes(hint)) return true;
      if (hintWords.length === 0) return false;
      const overlap = hintWords.filter((word) => stack.includes(word)).length;
      return overlap >= Math.max(1, Math.ceil(hintWords.length * 0.6));
    });
    if (!target) return false;
    target.click();
    return true;
  };

  const openWorkspaceItem = (item: WorkspaceItem) => {
    const runtime = minimized.find((entry) => entry.workspaceId === item.id);
    if (runtime) {
      const overlay = overlaysRef.current.get(runtime.id);
      const panel = panelsRef.current.get(runtime.id);
      if (overlay && panel) {
        overlay.removeAttribute(MINIMIZED_ATTR);
        overlay.style.pointerEvents = 'none';
        overlay.style.background = 'transparent';
        panel.style.display = '';
        setMinimized((prev) => prev.filter((m) => m.id !== runtime.id));
        return;
      }
    }
    const currentRoute = normalizeRoute(getCurrentRoute());
    const targetRoute = normalizeRoute(item.route);
    if (currentRoute !== targetRoute) {
      setOpenHint('هذا المودال مرتبط بصفحة أخرى. لن يتم الانتقال تلقائيًا.');
      return;
    }
    const opened = tryOpenModalFromHint(item);
    if (!opened) {
      setOpenHint('تعذر فتح المودال تلقائيًا هنا. افتحه يدويًا مرة ليتم ربطه.');
    }
  };

  useEffect(() => {
    workspaceRef.current = workspaceItems;
  }, [workspaceItems]);

  useEffect(() => {
    const captureInteraction = (evt: Event) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      const clickable = target.closest('button,[role="button"],a') as HTMLElement | null;
      if (!clickable) return;
      const text = normalizeText(clickable.textContent || clickable.getAttribute('aria-label') || clickable.getAttribute('title') || '');
      if (!text) return;
      lastInteractionRef.current = {
        route: normalizeRoute(getCurrentRoute()),
        openerText: text,
        at: Date.now(),
      };
    };
    window.addEventListener('mousedown', captureInteraction, true);
    window.addEventListener('touchstart', captureInteraction, true);
    return () => {
      window.removeEventListener('mousedown', captureInteraction, true);
      window.removeEventListener('touchstart', captureInteraction, true);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadWorkspace = async () => {
      let localItems: WorkspaceItem[] = [];
      try {
        const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as WorkspaceItem[];
          if (Array.isArray(parsed)) localItems = parsed.filter((r) => r?.id && r?.title && r?.route);
        }
      } catch {
        localItems = [];
      }
      if (!uid) {
        setWorkspaceItems(localItems);
        return;
      }
      try {
        const user = await userService.get(uid);
        const remote = user?.uiPreferences?.modalWorkspace?.items || [];
        const mergedMap = new Map<string, WorkspaceItem>();
        [...localItems, ...remote].forEach((item) => {
          if (!item?.id || !item?.title || !item?.route) return;
          const existing = mergedMap.get(item.id);
          mergedMap.set(item.id, existing ? { ...existing, ...item, favorite: Boolean(existing.favorite || item.favorite) } : {
            id: item.id,
            title: item.title,
            route: normalizeRoute(item.route),
            favorite: Boolean(item.favorite),
          });
        });
        const merged = Array.from(mergedMap.values());
        if (alive) setWorkspaceItems(merged);
      } catch {
        if (alive) setWorkspaceItems(localItems);
      }
    };
    void loadWorkspace();
    return () => { alive = false; };
  }, [uid]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceItems));
    } catch {
      // ignore storage quota errors
    }
    if (!uid) return;
    const timer = window.setTimeout(() => {
      userService.update(uid, {
        uiPreferences: {
          modalWorkspace: { items: workspaceItems },
        },
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [workspaceItems, uid]);

  useEffect(() => {
    if (!openHint) return;
    const timer = window.setTimeout(() => setOpenHint(null), 2500);
    return () => window.clearTimeout(timer);
  }, [openHint]);

  useEffect(() => {
    let idCounter = 0;

    const setPanelOffset = (id: string, panel: HTMLElement, x: number, y: number) => {
      offsetsRef.current.set(id, { x, y });
      panel.style.transform = `translate(${x}px, ${y}px)`;
    };

    const restoreModal = (id: string) => {
      const overlay = overlaysRef.current.get(id);
      const panel = panelsRef.current.get(id);
      if (!overlay || !panel) return;
      overlay.removeAttribute(MINIMIZED_ATTR);
      overlay.style.pointerEvents = 'none';
      overlay.style.background = 'transparent';
      overlay.style.backdropFilter = 'none';
      (overlay.style as any).webkitBackdropFilter = 'none';
      panel.style.display = '';
      setMinimized((prev) => prev.filter((m) => m.id !== id));
    };

    const minimizeModal = (id: string, title: string, workspaceId: string, route: string) => {
      const overlay = overlaysRef.current.get(id);
      const panel = panelsRef.current.get(id);
      if (!overlay || !panel) return;
      overlay.setAttribute(MINIMIZED_ATTR, '1');
      overlay.style.pointerEvents = 'none';
      overlay.style.background = 'transparent';
      overlay.style.backdropFilter = 'none';
      (overlay.style as any).webkitBackdropFilter = 'none';
      panel.style.display = 'none';
      setMinimized((prev) => {
        if (prev.some((m) => m.id === id)) return prev;
        return [...prev, { id, title, workspaceId, route }];
      });
      upsertWorkspaceItem(title, route, false);
    };

    const closeModal = (id: string) => {
      const overlay = overlaysRef.current.get(id);
      if (!overlay) return;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setMinimized((prev) => prev.filter((m) => m.id !== id));
    };

    const startDrag = (id: string, panel: HTMLElement, clientX: number, clientY: number) => {
      const current = offsetsRef.current.get(id) || { x: 0, y: 0 };
      dragStateRef.current = {
        id,
        startX: clientX,
        startY: clientY,
        baseX: current.x,
        baseY: current.y,
      };
      panel.style.cursor = 'grabbing';
    };

    const stopDrag = () => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const panel = panelsRef.current.get(drag.id);
      if (panel) panel.style.cursor = '';
      dragStateRef.current = null;
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const panel = panelsRef.current.get(drag.id);
      if (!panel) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPanelOffset(drag.id, panel, drag.baseX + dx, drag.baseY + dy);
    };

    const onTouchMove = (e: TouchEvent) => {
      const drag = dragStateRef.current;
      if (!drag || !e.touches.length) return;
      const panel = panelsRef.current.get(drag.id);
      if (!panel) return;
      const touch = e.touches[0];
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      setPanelOffset(drag.id, panel, drag.baseX + dx, drag.baseY + dy);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);

    const attachToOverlay = (overlay: HTMLElement) => {
      const panel = getModalPanel(overlay);
      if (!panel) return;
      if (panel.getAttribute(MANAGED_ATTR) === '1') return;
      // Skip modals already using inline translate handling.
      if (panel.style.transform && panel.style.transform.includes('translate(')) return;

      idCounter += 1;
      const id = `global-modal-${Date.now()}-${idCounter}`;
      const title = getModalTitle(panel);
      const route = getCurrentRoute();
      const interaction = lastInteractionRef.current;
      const openerText =
        interaction && interaction.route === normalizeRoute(route) && Date.now() - interaction.at < 5000
          ? interaction.openerText
          : undefined;
      const workspaceId = upsertWorkspaceItem(title, route, false, openerText);
      hideLegacyHeaderCloseButton(panel);
      overlay.setAttribute(MODAL_ID_ATTR, id);
      panel.setAttribute(MANAGED_ATTR, '1');
      overlaysRef.current.set(id, overlay);
      panelsRef.current.set(id, panel);
      offsetsRef.current.set(id, { x: 0, y: 0 });
      overlay.style.pointerEvents = 'none';
      overlay.style.background = 'transparent';
      overlay.style.backdropFilter = 'none';
      (overlay.style as any).webkitBackdropFilter = 'none';
      panel.style.pointerEvents = 'auto';

      if (!panel.style.position) panel.style.position = 'relative';

      const controls = document.createElement('div');
      controls.style.position = 'absolute';
      controls.style.top = '8px';
      controls.style.left = '10px';
      controls.style.zIndex = '2';
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.alignItems = 'center';

      const minimizeBtn = makeIconButton('minimize', 'تصغير');
      const favoriteBtn = makeIconButton(
        workspaceRef.current.find((item) => item.id === workspaceId)?.favorite ? 'star' : 'star_border',
        'إضافة للمفضلة',
      );
      const closeBtn = makeIconButton('close', 'إغلاق');
      controls.appendChild(minimizeBtn);
      controls.appendChild(favoriteBtn);
      controls.appendChild(closeBtn);
      panel.appendChild(controls);

      const dragHandle = document.createElement('div');
      dragHandle.style.position = 'absolute';
      dragHandle.style.top = '8px';
      dragHandle.style.left = '50%';
      dragHandle.style.transform = 'translateX(-50%)';
      dragHandle.style.zIndex = '2';
      dragHandle.style.cursor = 'move';
      dragHandle.style.userSelect = 'none';
      dragHandle.title = 'اسحب لتحريك النافذة';
      const handleIcon = document.createElement('span');
      handleIcon.className = 'material-icons-round text-slate-400';
      handleIcon.style.fontSize = '18px';
      handleIcon.textContent = 'drag_indicator';
      dragHandle.appendChild(handleIcon);
      panel.appendChild(dragHandle);

      minimizeBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        minimizeModal(id, title, workspaceId, route);
      });
      favoriteBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const current = workspaceRef.current.find((item) => item.id === workspaceId);
        const nextFavorite = !Boolean(current?.favorite);
        commitWorkspaceItems((prev) => prev.map((item) => (
          item.id === workspaceId ? { ...item, favorite: nextFavorite } : item
        )));
        favoriteBtn.firstElementChild!.textContent = nextFavorite ? 'star' : 'star_border';
      });
      closeBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const current = workspaceRef.current.find((item) => item.id === workspaceId);
        if (current?.favorite) {
          // Favorite windows use soft-close behavior so they can be reopened from the dock.
          minimizeModal(id, title, workspaceId, route);
          return;
        }
        closeModal(id);
      });
      dragHandle.addEventListener('mousedown', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        startDrag(id, panel, evt.clientX, evt.clientY);
      });
      dragHandle.addEventListener('touchstart', (evt) => {
        if (!evt.touches.length) return;
        evt.preventDefault();
        evt.stopPropagation();
        const touch = evt.touches[0];
        startDrag(id, panel, touch.clientX, touch.clientY);
      }, { passive: false });

      // Drag from the whole modal header, except interactive controls.
      const header = getModalHeaderElement(panel);
      if (header) {
        header.style.cursor = 'move';
        header.style.userSelect = 'none';
        const startFromHeaderMouse = (evt: MouseEvent) => {
          const target = evt.target as HTMLElement;
          if (target.closest('button,input,select,textarea,a,label,[role="button"]')) return;
          evt.preventDefault();
          startDrag(id, panel, evt.clientX, evt.clientY);
        };
        const startFromHeaderTouch = (evt: TouchEvent) => {
          if (!evt.touches.length) return;
          const target = evt.target as HTMLElement;
          if (target.closest('button,input,select,textarea,a,label,[role="button"]')) return;
          evt.preventDefault();
          const touch = evt.touches[0];
          startDrag(id, panel, touch.clientX, touch.clientY);
        };
        header.addEventListener('mousedown', startFromHeaderMouse);
        header.addEventListener('touchstart', startFromHeaderTouch, { passive: false });
      }
    };

    const scan = () => {
      const overlays = Array.from(document.querySelectorAll('div')).filter(isLikelyOverlay);
      overlays.forEach(attachToOverlay);

      const openIds = new Set<string>();
      overlays.forEach((overlay) => {
        const id = overlay.getAttribute(MODAL_ID_ATTR);
        if (id) openIds.add(id);
      });

      // cleanup refs for closed overlays
      Array.from(overlaysRef.current.keys()).forEach((id) => {
        if (!openIds.has(id)) {
          overlaysRef.current.delete(id);
          panelsRef.current.delete(id);
          offsetsRef.current.delete(id);
        }
      });
    };

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { subtree: true, childList: true });
    scan();

    return () => {
      observer.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
      dragStateRef.current = null;
    };
  }, []);

  const restoreEntry = (entryId: string) => {
    const overlay = overlaysRef.current.get(entryId);
    const panel = panelsRef.current.get(entryId);
    if (!overlay || !panel) {
      setMinimized((prev) => prev.filter((m) => m.id !== entryId));
      return;
    }
    overlay.removeAttribute(MINIMIZED_ATTR);
    overlay.style.pointerEvents = 'none';
    overlay.style.background = 'transparent';
    overlay.style.backdropFilter = 'none';
    (overlay.style as any).webkitBackdropFilter = 'none';
    panel.style.display = '';
    setMinimized((prev) => prev.filter((m) => m.id !== entryId));
  };

  const closeEntry = (entryId: string) => {
    const overlay = overlaysRef.current.get(entryId);
    if (!overlay) return;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setMinimized((prev) => prev.filter((m) => m.id !== entryId));
  };

  const currentRoute = normalizeRoute(getCurrentRoute());
  const orderedWorkspaceItems = useMemo(() => {
    return [...workspaceItems].sort((a, b) => {
      const aCurrent = normalizeRoute(a.route) === currentRoute;
      const bCurrent = normalizeRoute(b.route) === currentRoute;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.title.localeCompare(b.title, 'ar');
    });
  }, [workspaceItems, currentRoute]);

  return (
    <div className="fixed left-2 top-1/2 -translate-y-1/2 z-[70] flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl px-2 py-3 text-slate-700 dark:text-slate-200 hover:text-primary transition-colors relative"
        title="نوافذ مصغرة"
      >
        <span
          className="text-xs font-black tracking-wide"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' as any }}
        >
          نوافذ مصغرة
        </span>
        {workspaceItems.length > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
            {workspaceItems.length}
          </span>
        )}
      </button>

      {menuOpen && (
        <div className="w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-500">النوافذ المصغرة</p>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="إغلاق القائمة"
            >
              <span className="material-icons-round text-sm">close</span>
            </button>
          </div>
          {orderedWorkspaceItems.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold py-2">لا توجد نوافذ مصغرة الآن.</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {orderedWorkspaceItems.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 flex items-center justify-between gap-2">
                  <button
                    className="text-sm font-bold text-slate-700 dark:text-slate-100 hover:text-primary truncate text-right"
                    onClick={() => openWorkspaceItem(entry)}
                    title={`فتح ${entry.title}`}
                  >
                    <span className="block truncate">{entry.favorite ? `⭐ ${entry.title}` : entry.title}</span>
                    <span className="block text-[10px] font-semibold text-slate-400 truncate">
                      {normalizeRoute(entry.route) === currentRoute ? 'الصفحة الحالية' : `من ${entry.route}`}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openWorkspaceItem(entry)}
                      className="text-slate-400 hover:text-primary transition-colors"
                      title="استرجاع"
                    >
                      <span className="material-icons-round text-sm">open_in_full</span>
                    </button>
                    <button
                      onClick={() => {
                        const runtime = minimized.find((m) => m.workspaceId === entry.id);
                        if (runtime) closeEntry(runtime.id);
                        removeWorkspaceItem(entry.id);
                      }}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                      title="إزالة من القائمة"
                    >
                      <span className="material-icons-round text-sm">close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {openHint && (
            <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-2.5 py-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              {openHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

