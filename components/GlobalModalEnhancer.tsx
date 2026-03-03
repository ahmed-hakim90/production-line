import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { userService } from '../services/userService';
import { useGlobalModalManager } from './modal-manager/GlobalModalManager';
import { inferModalKeyFromLegacyContext } from './modal-manager/modalKeys';

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
  modalKey?: string;
  openerSelector?: string;
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
const normalizeArabicLoose = (value: string) =>
  normalizeText(value)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[ًٌٍَُِّْـ]/g, '');
const splitWords = (value: string) =>
  normalizeText(value).split(' ').filter((word) => word.length > 1);

const inferModalKey = (title: string, route: string, openerText?: string): string | undefined =>
  inferModalKeyFromLegacyContext(title, route, openerText);

const normalizeRouteStatic = (route: string) => {
  if (!route) return '/';
  return route.startsWith('/') ? route : `/${route}`;
};

const cssEscape = (value: string) => {
  if (typeof (window as any).CSS?.escape === 'function') return (window as any).CSS.escape(value);
  return value.replace(/["\\.#:[\]()]/g, '\\$&');
};

const buildSelector = (el: HTMLElement): string => {
  const modalKey = (el.getAttribute('data-modal-key') || '').trim();
  if (modalKey) return `[data-modal-key="${cssEscape(modalKey)}"]`;

  const id = (el.id || '').trim();
  if (id) return `#${cssEscape(id)}`;

  const aria = (el.getAttribute('aria-label') || '').trim();
  if (aria) return `${el.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;

  const title = (el.getAttribute('title') || '').trim();
  if (title) return `${el.tagName.toLowerCase()}[title="${cssEscape(title)}"]`;

  const text = normalizeText(el.textContent || '');
  if (text) return '';

  // conservative fallback path (max depth 4)
  const chain: string[] = [];
  let node: HTMLElement | null = el;
  let depth = 0;
  while (node && depth < 4) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter((c) => (c as HTMLElement).tagName === node!.tagName);
    const idx = siblings.indexOf(node) + 1;
    chain.unshift(`${tag}:nth-of-type(${idx})`);
    node = parent;
    depth += 1;
  }
  return chain.join(' > ');
};

const makeIconButton = (icon: string, title: string): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = title;
  btn.className =
    'text-slate-500 hover:text-[var(--color-text)] dark:text-[var(--color-text-muted)] dark:hover:text-white transition-colors';
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
  const { openModal, hasModalTarget } = useGlobalModalManager();
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
  const zOrderRef = useRef(80);
  const lastInteractionRef = useRef<{
    route: string;
    openerText: string;
    openerSelector?: string;
    at: number;
    modalKey?: string;
  } | null>(null);

  const getCurrentRoute = () => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/')) return hash.slice(1);
    if (hash.startsWith('#')) return hash.slice(1) || '/';
    return `${window.location.pathname}${window.location.search}` || '/';
  };

  const bringOverlayToFront = (id: string) => {
    const overlay = overlaysRef.current.get(id);
    if (!overlay) return;
    zOrderRef.current += 1;
    overlay.style.zIndex = String(zOrderRef.current);
  };

  const normalizeRoute = (route: string) => {
    return normalizeRouteStatic(route);
  };

  const makeWorkspaceId = (title: string, route: string, modalKey?: string) =>
    modalKey ? `modal::${modalKey}` : `${normalizeRoute(route)}::${title.trim().toLowerCase()}`;

  const normalizeWorkspaceItems = (items: WorkspaceItem[]): WorkspaceItem[] => {
    const merged = new Map<string, WorkspaceItem>();
    const aliases = new Map<string, string>();
    items.forEach((item) => {
      if (!item?.title || !item?.route) return;
      const resolvedModalKey = item.modalKey || inferModalKey(item.title, item.route, item.openerText);
      const titleAlias = `title::${normalizeArabicLoose(item.title)}`;
      const canonicalKey = makeWorkspaceId(item.title, item.route, resolvedModalKey);
      const key = aliases.get(canonicalKey) || aliases.get(titleAlias) || canonicalKey;
      aliases.set(canonicalKey, key);
      aliases.set(titleAlias, key);
      const current: WorkspaceItem = {
        ...item,
        id: key,
        route: normalizeRoute(item.route),
        modalKey: resolvedModalKey,
        favorite: Boolean(item.favorite),
      };
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, current);
      } else {
        merged.set(key, {
          ...existing,
          ...current,
          favorite: Boolean(existing.favorite || current.favorite),
          openerText: current.openerText || existing.openerText,
          openerSelector: current.openerSelector || existing.openerSelector,
          modalKey: current.modalKey || existing.modalKey,
        });
      }
    });
    return Array.from(merged.values());
  };

  const commitWorkspaceItems = (updater: (prev: WorkspaceItem[]) => WorkspaceItem[]) => {
    setWorkspaceItems((prev) => {
      const next = normalizeWorkspaceItems(updater(prev));
      try {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage write failures
      }
      return next;
    });
  };

  const upsertWorkspaceItem = (
    title: string,
    route: string,
    favorite: boolean,
    openerText?: string,
    modalKey?: string,
    openerSelector?: string,
  ) => {
    const normalizedRoute = normalizeRoute(route);
    const inferredModalKey = modalKey || inferModalKey(title, normalizedRoute, openerText);
    const id = makeWorkspaceId(title, normalizedRoute, inferredModalKey);
    commitWorkspaceItems((prev) => {
      const idx = prev.findIndex((item) =>
        item.id === id ||
        (Boolean(inferredModalKey) && item.modalKey === inferredModalKey),
      );
      if (idx === -1) {
        return [
          ...prev,
          { id, title, route: normalizedRoute, favorite, openerText, modalKey: inferredModalKey, openerSelector },
        ];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        title,
        route: normalizedRoute,
        favorite: favorite || next[idx].favorite,
        openerText: openerText || next[idx].openerText,
        modalKey: inferredModalKey || next[idx].modalKey,
        openerSelector: openerSelector || next[idx].openerSelector,
      };
      return next;
    });
    const existing = workspaceRef.current.find((item) =>
      item.id === id || (Boolean(inferredModalKey) && item.modalKey === inferredModalKey),
    );
    return existing?.id || id;
  };

  const removeWorkspaceItem = (workspaceId: string) => {
    commitWorkspaceItems((prev) => prev.filter((item) => item.id !== workspaceId));
  };

  const isWorkspaceEntryOpenable = (item: WorkspaceItem) => {
    const resolvedModalKey = item.modalKey || inferModalKey(item.title, item.route, item.openerText);
    if (resolvedModalKey && hasModalTarget(resolvedModalKey)) return true;
    const currentRoute = normalizeRoute(getCurrentRoute());
    return normalizeRoute(item.route) === currentRoute;
  };

  const tryOpenModalFromHint = (item: WorkspaceItem): boolean => {
    const resolvedModalKey = item.modalKey || inferModalKey(item.title, item.route, item.openerText);
    if (resolvedModalKey && hasModalTarget(resolvedModalKey)) {
      if (resolvedModalKey !== item.modalKey) {
        commitWorkspaceItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, modalKey: resolvedModalKey } : it)),
        );
      }
      return openModal(resolvedModalKey, { source: 'workspace' });
    }

    if (item.openerSelector) {
      const selectorTarget = document.querySelector(item.openerSelector) as HTMLElement | null;
      if (selectorTarget) {
        selectorTarget.click();
        return true;
      }
    }

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
    if (!isWorkspaceEntryOpenable(item)) {
      setOpenHint('هذا المودال غير متاح في الصفحة الحالية حتى يتم تحويله إلى Global Modal فعلي.');
      return;
    }
    const resolvedModalKey = item.modalKey || inferModalKey(item.title, item.route, item.openerText);
    if (resolvedModalKey && hasModalTarget(resolvedModalKey)) {
      const opened = openModal(resolvedModalKey, { source: 'workspace' });
      if (opened) {
        if (resolvedModalKey !== item.modalKey) {
          commitWorkspaceItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, modalKey: resolvedModalKey } : it)),
          );
        }
        return;
      }
    }
    const runtime = minimized.find((entry) => entry.workspaceId === item.id);
    if (runtime) {
      const overlay = overlaysRef.current.get(runtime.id);
      const panel = panelsRef.current.get(runtime.id);
      if (overlay && panel) {
        overlay.removeAttribute(MINIMIZED_ATTR);
        overlay.style.pointerEvents = 'none';
        overlay.style.background = 'transparent';
        panel.style.display = '';
        bringOverlayToFront(runtime.id);
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
      const modalKeyRaw = clickable.getAttribute('data-modal-key') || '';
      const openerSelector = buildSelector(clickable);
      lastInteractionRef.current = {
        route: normalizeRoute(getCurrentRoute()),
        openerText: text,
        openerSelector,
        at: Date.now(),
        modalKey: modalKeyRaw || undefined,
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
        setWorkspaceItems(normalizeWorkspaceItems(localItems));
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
            openerText: item.openerText,
            modalKey: item.modalKey || inferModalKey(item.title, item.route, item.openerText),
            openerSelector: item.openerSelector,
          });
        });
        const merged = normalizeWorkspaceItems(Array.from(mergedMap.values()));
        if (alive) setWorkspaceItems(merged);
      } catch {
        if (alive) setWorkspaceItems(normalizeWorkspaceItems(localItems));
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
      const sanitizedWorkspaceItems = workspaceItems.map((item) => ({
        id: item.id,
        title: item.title,
        route: item.route,
        favorite: Boolean(item.favorite),
        ...(item.openerText ? { openerText: item.openerText } : {}),
        ...(item.modalKey ? { modalKey: item.modalKey } : {}),
        ...(item.openerSelector ? { openerSelector: item.openerSelector } : {}),
      }));
      userService.update(uid, {
        uiPreferences: {
          modalWorkspace: { items: sanitizedWorkspaceItems },
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
      bringOverlayToFront(id);
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
      const openerSelector =
        interaction && interaction.route === normalizeRoute(route) && Date.now() - interaction.at < 5000
          ? interaction.openerSelector
          : undefined;
      const modalKey =
        interaction && interaction.route === normalizeRoute(route) && Date.now() - interaction.at < 5000
          ? interaction.modalKey
          : undefined;
      const workspaceId = upsertWorkspaceItem(title, route, false, openerText, modalKey, openerSelector);
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
      bringOverlayToFront(id);

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
      dragHandle.style.display = 'inline-flex';
      dragHandle.style.alignItems = 'center';
      dragHandle.style.justifyContent = 'center';
      dragHandle.style.zIndex = '2';
      dragHandle.style.cursor = 'move';
      dragHandle.style.userSelect = 'none';
      dragHandle.style.marginInlineStart = '8px';
      dragHandle.title = 'اسحب لتحريك النافذة';
      const handleIcon = document.createElement('span');
      handleIcon.className = 'material-icons-round text-slate-400';
      handleIcon.style.fontSize = '18px';
      handleIcon.textContent = 'drag_indicator';
      dragHandle.appendChild(handleIcon);
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
        if (!current?.favorite) {
          removeWorkspaceItem(workspaceId);
        }
        closeModal(id);
      });
      dragHandle.addEventListener('mousedown', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        bringOverlayToFront(id);
        startDrag(id, panel, evt.clientX, evt.clientY);
      });
      dragHandle.addEventListener('touchstart', (evt) => {
        if (!evt.touches.length) return;
        evt.preventDefault();
        evt.stopPropagation();
        const touch = evt.touches[0];
        bringOverlayToFront(id);
        startDrag(id, panel, touch.clientX, touch.clientY);
      }, { passive: false });

      // Drag from the whole modal header, except interactive controls.
      const header = getModalHeaderElement(panel);
      if (header) {
        // Keep drag behavior on the whole header, but don't inject
        // an extra visual handle that can duplicate page-level icons.
        header.style.cursor = 'move';
        header.style.userSelect = 'none';
        const startFromHeaderMouse = (evt: MouseEvent) => {
          const target = evt.target as HTMLElement;
          if (target.closest('button,input,select,textarea,a,label,[role="button"]')) return;
          evt.preventDefault();
          bringOverlayToFront(id);
          startDrag(id, panel, evt.clientX, evt.clientY);
        };
        const startFromHeaderTouch = (evt: TouchEvent) => {
          if (!evt.touches.length) return;
          const target = evt.target as HTMLElement;
          if (target.closest('button,input,select,textarea,a,label,[role="button"]')) return;
          evt.preventDefault();
          const touch = evt.touches[0];
          bringOverlayToFront(id);
          startDrag(id, panel, touch.clientX, touch.clientY);
        };
        header.addEventListener('mousedown', startFromHeaderMouse);
        header.addEventListener('touchstart', startFromHeaderTouch, { passive: false });
      } else {
        // Fallback for uncommon modal layouts without a detectable header.
        dragHandle.style.position = 'absolute';
        dragHandle.style.top = '10px';
        dragHandle.style.right = '12px';
        panel.appendChild(dragHandle);
      }

      panel.addEventListener('mousedown', () => bringOverlayToFront(id), true);
      panel.addEventListener('touchstart', () => bringOverlayToFront(id), { passive: true, capture: true });
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
    bringOverlayToFront(entryId);
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
    <div className="fixed left-2 bottom-3 z-[70] hidden md:flex flex-col items-start gap-2">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="erp-minimized-btn relative flex items-center gap-1.5"
        title="النوافذ المصغرة"
      >
        <span className="material-icons-round text-[16px]">tab_unselected</span>
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' as any }} className="text-[10.5px] tracking-wide">
          نوافذ مصغرة
        </span>
        {workspaceItems.length > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[16px] h-[16px] px-0.5 rounded-full bg-[rgb(var(--color-primary))] text-white text-[9px] font-bold flex items-center justify-center">
            {workspaceItems.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {menuOpen && (
        <div className="erp-minimized-panel">
          {/* Head */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="material-icons-round text-[var(--color-text-muted)] text-[16px]">tab_unselected</span>
              <span className="text-[11.5px] font-bold text-[var(--color-text)]">النوافذ المصغرة</span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="p-1 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] hover:text-[var(--color-text)] transition-colors"
            >
              <span className="material-icons-round text-[15px]">close</span>
            </button>
          </div>

          {orderedWorkspaceItems.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-muted)] py-2 text-center">لا توجد نوافذ مصغرة</p>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {orderedWorkspaceItems.map((entry) => {
                const isOpenable = isWorkspaceEntryOpenable(entry);
                return (
                  <div key={entry.id} className="erp-minimized-item">
                    <button
                      className={`flex-1 text-right min-w-0 ${
                        isOpenable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`}
                      onClick={() => openWorkspaceItem(entry)}
                      title={isOpenable ? `فتح ${entry.title}` : 'غير متاح في الصفحة الحالية'}
                      disabled={!isOpenable}
                    >
                      <span className="block text-[12.5px] font-semibold text-[var(--color-text)] truncate">
                        {entry.favorite ? `⭐ ${entry.title}` : entry.title}
                      </span>
                      <span className="block text-[10.5px] text-[var(--color-text-muted)] truncate mt-0.5">
                        {normalizeRoute(entry.route) === currentRoute
                          ? 'الصفحة الحالية'
                          : (isOpenable ? entry.route : `غير متاح • ${entry.route}`)}
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openWorkspaceItem(entry)}
                        className={`p-1 rounded-[var(--border-radius-sm)] transition-colors ${
                          isOpenable
                            ? 'text-[var(--color-text-muted)] hover:text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.08)]'
                            : 'text-[var(--color-border)] cursor-not-allowed'
                        }`}
                        title="استرجاع"
                        disabled={!isOpenable}
                      >
                        <span className="material-icons-round text-[14px]">open_in_full</span>
                      </button>
                      <button
                        onClick={() => {
                          const runtime = minimized.find((m) => m.workspaceId === entry.id);
                          if (runtime) closeEntry(runtime.id);
                          removeWorkspaceItem(entry.id);
                        }}
                        className="p-1 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        title="إزالة"
                      >
                        <span className="material-icons-round text-[14px]">close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {openHint && (
            <div className="mt-2 rounded-[var(--border-radius-sm)] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-700">
              {openHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

