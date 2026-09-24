import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Toast non invasivo che appare quando il Service Worker ha una nuova versione disponibile.
 * Intercetta l'evento update di Vite PWA e offre il pulsante "Aggiorna".
 */
export default function UpdateToast() {
  const [visible, setVisible] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // Controlla aggiornamenti ogni ora in background
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) setVisible(true);
  }, [needRefresh]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700/60 shadow-2xl shadow-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
          <p className="text-xs text-slate-200 font-medium truncate">
            Nuova versione disponibile
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Ignora
          </button>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 transition-all cursor-pointer"
          >
            Aggiorna
          </button>
        </div>
      </div>
    </div>
  );
}
