import React, { lazy } from 'react';

/**
 * Wrapper attorno a React.lazy con meccanismo di retry automatico.
 * Risolve i fallimenti temporanei di dynamic import (es. network jitter,
 * invalidazione cache Vite o chunk splitting asincrono).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  componentName: string = 'Modulo'
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn(`[Hounigo] Primo tentativo di caricamento fallito per ${componentName}, retry in corso...`, error);
      try {
        // Breve pausa prima del retry per consentire la sincronizzazione del bundler/rete
        await new Promise((resolve) => setTimeout(resolve, 250));
        return await componentImport();
      } catch (retryError) {
        console.error(`[Hounigo] Impossibile caricare il componente ${componentName} dopo il retry:`, retryError);
        throw retryError;
      }
    }
  });
}
