/**
 * Esegue una promise con un tempo massimo. Allo scadere risolve con `fallback`
 * invece di restare appesa (es. IndexedDB bloccato su iOS PWA o rete lenta).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn(`[withTimeout] Operazione oltre ${ms}ms: uso il fallback.`);
        resolve(fallback);
      }
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn('[withTimeout] Operazione fallita, uso il fallback:', err);
        resolve(fallback);
      }
    );
  });
}

/** Come withTimeout ma rigetta allo scadere (per operazioni dove serve l'errore). */
export function rejectAfter<T>(promise: Promise<T>, ms: number, message = 'Timeout'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}
