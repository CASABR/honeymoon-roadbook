import React from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export const InstallPWA: React.FC = () => {
  const { isInstallable, promptInstall, isIOSPrompt, dismissIOSPrompt } = useInstallPrompt();

  if (isIOSPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 animate-in slide-in-from-bottom-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">
              Installa l'app per un'esperienza completa e offline
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tocca l'icona Condividi <span className="text-xl inline-block translate-y-1">⎋</span> in basso e poi seleziona <strong>Aggiungi alla schermata Home</strong> <span className="text-xl inline-block translate-y-1">⊞</span>.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={dismissIOSPrompt}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold active:scale-95 transition-all"
          >
            Ho capito
          </button>
        </div>
      </div>
    );
  }

  if (!isInstallable) {
    return null;
  }

  return (
    <button
      onClick={promptInstall}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-50 flex items-center gap-2 font-medium"
      aria-label="Installa l'app"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
      Installa App
    </button>
  );
};
