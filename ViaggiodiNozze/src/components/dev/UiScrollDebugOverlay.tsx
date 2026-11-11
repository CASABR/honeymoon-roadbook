import { useEffect, useState } from 'react';

export interface UiDebugSnapshot {
  ts: string;
  collecting: boolean;
  scrollY: number;
  maxScrollY: number;
  docHeight: number;
  innerHeight: number;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  headerHeight: number;
  headerTop: number;
  mainHeight: number;
  counts: {
    appMounts: number;
    appRenders: number;
    oggiMounts: number;
    oggiRenders: number;
    tabChanges: number;
    dayChanges: number;
    headerHeightChanges: number;
    mainHeightChanges: number;
    docHeightChanges: number;
    scrollToCalls: number;
    scrollIntoViewCalls: number;
    unpromptedScrollShifts: number;
    roadbookCloudSynced: number;
    roadbookDataMutated: number;
    activityUpdated: number;
    houniCloudRoleChanged: number;
    tripConfigChanged: number;
  };
  pwa: {
    displayMode: 'standalone' | 'browser';
    navigatorStandalone: boolean;
    statusBarMeta: string | null;
    themeColorMeta: string | null;
    viewportMeta: string | null;
    manifestHrefs: string[];
    safeTopPx: number;
    safeBottomPx: number;
    headerPadTopPx: number;
  };
  recentEvents: Array<{ t: number; type: string; detail?: string }>;
}

interface DebugStore {
  collecting: boolean;
  counts: UiDebugSnapshot['counts'];
  recentEvents: UiDebugSnapshot['recentEvents'];
  lastUserScrollAt: number;
  lastScrollY: number;
  lastDocHeight: number;
  lastHeaderHeight: number;
  lastMainHeight: number;
  listeners: Set<() => void>;
}

const DEBUG_KEY = '__HOUNIGO_UI_DEBUG_STORE__';
const UI_DEBUG_SESSION_KEY = 'houni_ui_debug_enabled_v1';
const UI_DEBUG_URL_DISMISSED_KEY = 'houni_ui_debug_url_dismissed_v1';
export const UI_DEBUG_CHANGED_EVENT = 'houni_ui_debug_changed';

function hasUrlDebugParam(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('uiDebug') === '1';
  } catch {
    return false;
  }
}

export function isUiDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(UI_DEBUG_SESSION_KEY) === '1') {
      return true;
    }
    if (hasUrlDebugParam() && window.sessionStorage.getItem(UI_DEBUG_URL_DISMISSED_KEY) !== '1') {
      return true;
    }
    return false;
  } catch {
    return hasUrlDebugParam();
  }
}

export function enableUiDebugSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(UI_DEBUG_URL_DISMISSED_KEY);
    window.sessionStorage.setItem(UI_DEBUG_SESSION_KEY, '1');
  } catch {}
  const store = getOrCreateStore();
  if (store) {
    store.collecting = true;
    store.lastScrollY = Math.round(window.scrollY || window.pageYOffset || 0);
    store.lastDocHeight = Math.round(document.documentElement.scrollHeight);
  }
  window.dispatchEvent(new CustomEvent(UI_DEBUG_CHANGED_EVENT, { detail: { enabled: true } }));
}

export function disableUiDebugSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(UI_DEBUG_SESSION_KEY);
    if (hasUrlDebugParam()) {
      window.sessionStorage.setItem(UI_DEBUG_URL_DISMISSED_KEY, '1');
    }
  } catch {}
  const win = window as unknown as Record<string, DebugStore | undefined>;
  if (win[DEBUG_KEY]) {
    win[DEBUG_KEY]!.collecting = false;
  }
  window.dispatchEvent(new CustomEvent(UI_DEBUG_CHANGED_EVENT, { detail: { enabled: false } }));
}

function getOrCreateStore(): DebugStore | null {
  if (!isUiDebugEnabled()) return null;
  const win = window as unknown as Record<string, DebugStore | undefined>;
  if (!win[DEBUG_KEY]) {
    win[DEBUG_KEY] = {
      collecting: true,
      counts: {
        appMounts: 0,
        appRenders: 0,
        oggiMounts: 0,
        oggiRenders: 0,
        tabChanges: 0,
        dayChanges: 0,
        headerHeightChanges: 0,
        mainHeightChanges: 0,
        docHeightChanges: 0,
        scrollToCalls: 0,
        scrollIntoViewCalls: 0,
        unpromptedScrollShifts: 0,
        roadbookCloudSynced: 0,
        roadbookDataMutated: 0,
        activityUpdated: 0,
        houniCloudRoleChanged: 0,
        tripConfigChanged: 0,
      },
      recentEvents: [],
      lastUserScrollAt: 0,
      lastScrollY: typeof window !== 'undefined' ? Math.round(window.scrollY) : 0,
      lastDocHeight: typeof document !== 'undefined' ? document.documentElement.scrollHeight : 0,
      lastHeaderHeight: 0,
      lastMainHeight: 0,
      listeners: new Set(),
    };
  }
  return win[DEBUG_KEY]!;
}

export function bumpUiDebugCounter(
  key: keyof UiDebugSnapshot['counts'],
  detail?: string
): void {
  const store = getOrCreateStore();
  if (!store || !store.collecting) return;
  store.counts[key] += 1;
  if (key === 'appRenders' || key === 'oggiRenders') return;
  store.recentEvents.push({
    t: Math.round(performance.now()),
    type: key,
    ...(detail ? { detail: detail.slice(0, 48) } : {}),
  });
  if (store.recentEvents.length > 25) {
    store.recentEvents.shift();
  }
  queueMicrotask(() => {
    store.listeners.forEach((fn) => fn());
  });
}

function readSnapshot(): UiDebugSnapshot {
  const store = getOrCreateStore();
  const hdrEl = document.querySelector('header.app-mobile-header') as HTMLElement | null;
  const mainEl = document.querySelector('main') as HTMLElement | null;
  const hdrRect = hdrEl?.getBoundingClientRect();
  const mainRect = mainEl?.getBoundingClientRect();
  const rootStyle = getComputedStyle(document.documentElement);
  const hdrStyle = hdrEl ? getComputedStyle(hdrEl) : null;
  const manifestHrefs = Array.from(document.querySelectorAll('link[rel="manifest"]')).map(
    (el) => el.getAttribute('href') || ''
  );

  return {
    ts: new Date().toISOString(),
    collecting: Boolean(store?.collecting),
    scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
    maxScrollY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
    docHeight: Math.round(document.documentElement.scrollHeight),
    innerHeight: Math.round(window.innerHeight),
    visualViewportHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    visualViewportOffsetTop: window.visualViewport ? Math.round(window.visualViewport.offsetTop) : null,
    headerHeight: hdrRect ? Math.round(hdrRect.height) : 0,
    headerTop: hdrRect ? Math.round(hdrRect.top) : 0,
    mainHeight: mainRect ? Math.round(mainRect.height) : 0,
    counts: store ? { ...store.counts } : {
      appMounts: 0, appRenders: 0, oggiMounts: 0, oggiRenders: 0,
      tabChanges: 0, dayChanges: 0, headerHeightChanges: 0, mainHeightChanges: 0,
      docHeightChanges: 0, scrollToCalls: 0, scrollIntoViewCalls: 0, unpromptedScrollShifts: 0,
      roadbookCloudSynced: 0, roadbookDataMutated: 0, activityUpdated: 0,
      houniCloudRoleChanged: 0, tripConfigChanged: 0,
    },
    pwa: {
      displayMode: window.matchMedia?.('(display-mode: standalone)')?.matches ? 'standalone' : 'browser',
      navigatorStandalone: Boolean((window.navigator as unknown as { standalone?: boolean }).standalone),
      statusBarMeta: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') || null,
      themeColorMeta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
      manifestHrefs,
      safeTopPx: parseFloat(rootStyle.getPropertyValue('--app-safe-top')) || 0,
      safeBottomPx: parseFloat(rootStyle.getPropertyValue('--app-safe-bottom')) || 0,
      headerPadTopPx: hdrStyle ? parseFloat(hdrStyle.paddingTop) || 0 : 0,
    },
    recentEvents: store ? [...store.recentEvents] : [],
  };
}

export default function UiScrollDebugOverlay() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collecting, setCollecting] = useState<boolean>(() => Boolean(getOrCreateStore()?.collecting ?? true));
  const [snap, setSnap] = useState<UiDebugSnapshot>(() => readSnapshot());

  useEffect(() => {
    const store = getOrCreateStore();
    if (!store) return;

    const refresh = () => {
      if (store.collecting) {
        const nextDocH = Math.round(document.documentElement.scrollHeight);
        if (store.lastDocHeight > 0 && Math.abs(nextDocH - store.lastDocHeight) >= 2) {
          store.counts.docHeightChanges += 1;
        }
        store.lastDocHeight = nextDocH;
      }
      setCollecting(store.collecting);
      setSnap(readSnapshot());
    };

    store.listeners.add(refresh);

    const markUserInput = () => {
      store.lastUserScrollAt = performance.now();
    };
    window.addEventListener('touchstart', markUserInput, { passive: true });
    window.addEventListener('touchmove', markUserInput, { passive: true });
    window.addEventListener('wheel', markUserInput, { passive: true });
    window.addEventListener('pointerdown', markUserInput, { passive: true });
    window.addEventListener('keydown', markUserInput, { passive: true });

    const onScroll = () => {
      const currentY = Math.round(window.scrollY || window.pageYOffset || 0);
      if (store.collecting) {
        const delta = Math.abs(currentY - store.lastScrollY);
        const sinceUserMs = performance.now() - store.lastUserScrollAt;
        if (delta >= 16 && sinceUserMs > 300) {
          store.counts.unpromptedScrollShifts += 1;
          store.recentEvents.push({
            t: Math.round(performance.now()),
            type: 'scrollShift',
            detail: `${store.lastScrollY}->${currentY}`,
          });
          if (store.recentEvents.length > 25) store.recentEvents.shift();
        }
      }
      store.lastScrollY = currentY;
      refresh();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    window.visualViewport?.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('scroll', refresh);

    // Intercetta scroll programmatici (senza alterarne il comportamento)
    const origScrollTo = window.scrollTo.bind(window);
    const wrappedScrollTo: typeof window.scrollTo = ((...args: unknown[]) => {
      if (store.collecting) {
        store.counts.scrollToCalls += 1;
        store.recentEvents.push({
          t: Math.round(performance.now()),
          type: 'window.scrollTo',
          detail: typeof args[0] === 'object' && args[0] !== null
            ? `top=${String((args[0] as ScrollToOptions).top ?? '')}`
            : `${String(args[0])},${String(args[1] ?? '')}`,
        });
        if (store.recentEvents.length > 25) store.recentEvents.shift();
      }
      return (origScrollTo as (...a: unknown[]) => void)(...args);
    }) as typeof window.scrollTo;
    window.scrollTo = wrappedScrollTo;

    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (store.collecting) {
        store.counts.scrollIntoViewCalls += 1;
        store.recentEvents.push({
          t: Math.round(performance.now()),
          type: 'scrollIntoView',
          detail: this.tagName.toLowerCase(),
        });
        if (store.recentEvents.length > 25) store.recentEvents.shift();
      }
      return origScrollIntoView.call(this, arg);
    };

    const eventMap: Array<[string, keyof UiDebugSnapshot['counts']]> = [
      ['roadbook_cloud_synced', 'roadbookCloudSynced'],
      ['roadbook_data_mutated', 'roadbookDataMutated'],
      ['activity_updated', 'activityUpdated'],
      ['houni_cloud_role_changed', 'houniCloudRoleChanged'],
      ['trip_config_changed', 'tripConfigChanged'],
    ];
    const boundHandlers = eventMap.map(([evName, counterKey]) => {
      const h = (e: Event) => {
        const detailObj = (e as CustomEvent)?.detail;
        const safeDetail = counterKey === 'houniCloudRoleChanged'
          ? String(detailObj?.cloudRole || '')
          : undefined;
        bumpUiDebugCounter(counterKey, safeDetail);
      };
      window.addEventListener(evName, h);
      return [evName, h] as const;
    });

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
          let changed = false;
          for (const entry of entries) {
            const h = Math.round(entry.contentRect.height);
            if (entry.target.tagName === 'HEADER') {
              if (store.collecting && store.lastHeaderHeight > 0 && Math.abs(h - store.lastHeaderHeight) >= 2) {
                store.counts.headerHeightChanges += 1;
                changed = true;
              }
              store.lastHeaderHeight = h;
            } else if (entry.target.tagName === 'MAIN') {
              if (store.collecting && store.lastMainHeight > 0 && Math.abs(h - store.lastMainHeight) >= 2) {
                store.counts.mainHeightChanges += 1;
                changed = true;
              }
              store.lastMainHeight = h;
            }
          }
          if (changed) refresh();
        })
      : null;

    const hdrEl = document.querySelector('header.app-mobile-header');
    const mainEl = document.querySelector('main');
    if (ro && hdrEl) ro.observe(hdrEl);
    if (ro && mainEl) ro.observe(mainEl);

    const pollId = window.setInterval(refresh, 750);
    (window as unknown as Record<string, unknown>).__HOUNIGO_UI_DEBUG_GET__ = readSnapshot;

    return () => {
      store.listeners.delete(refresh);
      window.removeEventListener('touchstart', markUserInput);
      window.removeEventListener('touchmove', markUserInput);
      window.removeEventListener('wheel', markUserInput);
      window.removeEventListener('pointerdown', markUserInput);
      window.removeEventListener('keydown', markUserInput);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('scroll', refresh);
      window.scrollTo = origScrollTo;
      Element.prototype.scrollIntoView = origScrollIntoView;
      boundHandlers.forEach(([evName, h]) => window.removeEventListener(evName, h));
      ro?.disconnect();
      window.clearInterval(pollId);
    };
  }, []);

  const toggleCollecting = () => {
    const store = getOrCreateStore();
    if (!store) return;
    store.collecting = !store.collecting;
    store.lastScrollY = Math.round(window.scrollY || window.pageYOffset || 0);
    store.lastDocHeight = Math.round(document.documentElement.scrollHeight);
    setCollecting(store.collecting);
    setSnap(readSnapshot());
  };

  const copySnapshot = async () => {
    const payload = JSON.stringify(readSnapshot(), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const resetCounters = () => {
    const store = getOrCreateStore();
    if (!store) return;
    (Object.keys(store.counts) as Array<keyof UiDebugSnapshot['counts']>).forEach((k) => {
      store.counts[k] = 0;
    });
    store.recentEvents = [];
    store.lastScrollY = Math.round(window.scrollY || window.pageYOffset || 0);
    store.lastDocHeight = Math.round(document.documentElement.scrollHeight);
    setSnap(readSnapshot());
  };

  return (
    <aside
      data-testid="ui-debug-overlay"
      className="fixed right-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[9990] max-w-[94vw] text-[10px] font-mono text-white bg-slate-900/95 border border-white/20 rounded-xl shadow-xl backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-bold text-amber-300 whitespace-nowrap"
        >
          uiDebug {expanded ? '▼' : '▲'}
        </button>
        <span className="text-slate-300 whitespace-nowrap">
          {collecting ? '● REC' : '❚❚ PAUSA'} Y:{snap.scrollY} ΔH:{snap.counts.mainHeightChanges} Shift:{snap.counts.unpromptedScrollShifts}
        </span>
        <button
          type="button"
          onClick={toggleCollecting}
          className={`px-1.5 py-0.5 rounded font-semibold ${collecting ? 'bg-amber-600 text-white' : 'bg-sky-600 text-white'}`}
        >
          {collecting ? 'Ferma' : 'Avvia'}
        </button>
        <button
          type="button"
          onClick={copySnapshot}
          className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold"
        >
          {copied ? 'Copiato' : 'Copia'}
        </button>
        <button
          type="button"
          onClick={disableUiDebugSession}
          aria-label="Chiudi diagnostica"
          className="px-1.5 py-0.5 rounded bg-rose-700 text-white font-semibold"
        >
          Chiudi
        </button>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-white/10 space-y-1 max-h-[45vh] overflow-y-auto">
          <div>
            mode: {snap.pwa.displayMode} | navStandalone: {String(snap.pwa.navigatorStandalone)} | statusMeta: {snap.pwa.statusBarMeta}
          </div>
          <div>
            safeTop:{snap.pwa.safeTopPx} hdrPadTop:{snap.pwa.headerPadTopPx} hdrTop:{snap.headerTop} hdrH:{snap.headerHeight} vvH:{snap.visualViewportHeight}
          </div>
          <div>
            manifests: {snap.pwa.manifestHrefs.join(', ') || 'none'}
          </div>
          <div>
            mounts A/O: {snap.counts.appMounts}/{snap.counts.oggiMounts} | renders A/O: {snap.counts.appRenders}/{snap.counts.oggiRenders}
          </div>
          <div>
            Δhdr:{snap.counts.headerHeightChanges} Δmain:{snap.counts.mainHeightChanges} Δdoc:{snap.counts.docHeightChanges} scrollCalls:{snap.counts.scrollToCalls}+{snap.counts.scrollIntoViewCalls} unpromptedY:{snap.counts.unpromptedScrollShifts}
          </div>
          <div>
            sync:{snap.counts.roadbookCloudSynced} mut:{snap.counts.roadbookDataMutated} role:{snap.counts.houniCloudRoleChanged} tab:{snap.counts.tabChanges} day:{snap.counts.dayChanges}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={toggleCollecting} className="px-2 py-0.5 rounded bg-amber-600">
              {collecting ? 'Ferma raccolta' : 'Avvia raccolta'}
            </button>
            <button type="button" onClick={resetCounters} className="px-2 py-0.5 rounded bg-slate-700">
              Reset
            </button>
            <button type="button" onClick={copySnapshot} className="px-2 py-0.5 rounded bg-emerald-600">
              {copied ? 'JSON Copiato' : 'Copia JSON'}
            </button>
            <button type="button" onClick={disableUiDebugSession} className="px-2 py-0.5 rounded bg-rose-700">
              Chiudi diagnostica
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
