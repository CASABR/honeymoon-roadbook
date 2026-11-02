import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { storageService } from '../../storage/storageService';
import { clearTripConfig } from '../../utils/tripConfig';
import { clearDeviceSession } from '../../utils/deviceSession';
import { idbClearAll } from '../../storage/indexedDB';
import AccountSyncModal from '../modals/AccountSyncModal';
import PushNotificationModal from '../modals/PushNotificationModal';
import { APP_VERSION, BUILD_TIME, COMMIT_HASH } from '../../utils/appVersion';
import { openAppInfo } from './AppInfo';
import { BACKGROUND_PUSH_ENABLED } from '../../config/freeArchitecture';

/**
 * Menu Impostazioni compatto, ordinato e mirato.
 * Raggruppa le opzioni essenziali e sposta gli strumenti tecnici
 * in una sezione avanzata comprimibile.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  // Calcolo dinamico coordinate portale per non tagliare mai il menu
  useEffect(() => {
    if (!open || !triggerRef.current || typeof window === 'undefined') {
      setMenuCoords(null);
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.min(300, window.innerWidth - 24);

      let left: number;
      if (rect.left < window.innerWidth / 2) {
        left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
      } else {
        left = Math.max(12, rect.right - menuWidth);
      }

      setMenuCoords({
        top: Math.min(rect.bottom + 8, window.innerHeight - 200),
        left,
        width: menuWidth,
        maxHeight: Math.max(250, window.innerHeight - (rect.bottom + 24))
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  // Chiusura con Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const showToast = (type: 'ok' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await storageService.exportAllData();
      const date = new Date().toISOString().split('T')[0];
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hounigo-roadbook-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('ok', 'Backup esportato con successo.');
    } catch (err) {
      showToast('error', 'Errore durante l\'esportazione.');
      console.error(err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      'Attenzione: il ripristino del backup sostituirà i dati locali correnti con quelli contenuti nel file selezionato.\n\nVuoi procedere con l\'importazione?'
    );
    if (!confirmRestore) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const success = await storageService.importAllData(text);
      if (success) {
        showToast('ok', 'Dati ripristinati con successo! Ricaricamento...');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast('error', 'Formato del backup non valido.');
      }
    } catch (err) {
      showToast('error', 'Errore durante l\'importazione del file.');
      console.error(err);
    } finally {
      setImporting(false);
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          title="Impostazioni"
          aria-label="Apri menu impostazioni"
          aria-expanded={open}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Dropdown Menu renderizzato via React Portal sotto document.body */}
        {open && menuCoords && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[9990] flex" onClick={() => setOpen(false)}>
            <div
              style={{
                position: 'fixed',
                top: `${menuCoords.top}px`,
                left: `${menuCoords.left}px`,
                width: `${menuCoords.width}px`,
                maxHeight: `${menuCoords.maxHeight}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              tabIndex={-1}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto outline-none animate-in fade-in zoom-in-95 duration-150 py-1"
            >
              {/* Header Compatto */}
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest px-4 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                Impostazioni
              </p>

              {/* 1. Profilo & Accesso */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowAccountModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">👤</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Profilo &amp; Accesso</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Account, Google ed Email</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* 2. Notifiche Push */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowPushModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔔</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                      {BACKGROUND_PUSH_ENABLED ? 'Notifiche e promemoria' : 'Promemoria'}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {BACKGROUND_PUSH_ENABLED ? 'Push in background e avvisi del viaggio' : 'Avvisi nell’app; push non attive'}
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* 3. Blocca Schermo */}
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Vuoi bloccare l\'app e richiedere nuovamente il PIN di accesso?')) {
                    await clearDeviceSession();
                    clearTripConfig();
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span>🔒</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold">Blocca Schermo</span>
                    <span className="block text-[10px] text-amber-500/80 font-normal">Richiede PIN alla riapertura</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* 4. Esci dal viaggio */}
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Sei sicuro di voler uscire da questo viaggio? I dati non sincronizzati andranno persi.')) {
                    try {
                      const { auth } = await import('../../firebase');
                      if (auth) {
                        const { signOut } = await import('firebase/auth');
                        await signOut(auth).catch(() => {});
                      }
                    } catch {}
                    await clearDeviceSession();
                    await idbClearAll();
                    clearTripConfig();
                    setOpen(false);
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span>🚪</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold">Esci dal viaggio</span>
                    <span className="block text-[10px] text-rose-400/80 font-normal">Cambia account o viaggio</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* SEZIONE COMPATTABILE: OPZIONI AVANZATE */}
              <div className="border-t border-slate-100 dark:border-slate-800 mt-1">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                  className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-50/60 dark:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs">⚙️</span>
                    <span>Opzioni Avanzate</span>
                  </span>
                  <span className="text-[10px] text-slate-400 transition-transform">
                    {isAdvancedOpen ? '▲' : '▼'}
                  </span>
                </button>

                {isAdvancedOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40">
                    {/* Forza Allineamento Cloud */}
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('force_cloud_sync_requested'));
                        showToast('ok', 'Sincronizzazione cloud avviata');
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <span className="text-sky-500">🔄</span>
                      <span>Forza Allineamento Cloud</span>
                    </button>

                    {/* Esporta Backup JSON */}
                    <button
                      type="button"
                      disabled={exporting}
                      onClick={handleExport}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100 dark:border-slate-800"
                    >
                      <span className="text-amber-500">💾</span>
                      <span>{exporting ? 'Esportazione...' : 'Esporta backup JSON'}</span>
                    </button>

                    {/* Importa Backup JSON */}
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100 dark:border-slate-800"
                    >
                      <span className="text-purple-500">📂</span>
                      <span>{importing ? 'Importazione...' : 'Importa backup JSON'}</span>
                    </button>

                    {/* Verifica Aggiornamenti PWA */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
                          showToast('error', 'PWA non supportata da questo browser.');
                          return;
                        }
                        showToast('ok', 'Controllo aggiornamenti PWA...');
                        try {
                          const reg = await navigator.serviceWorker.ready;
                          await reg.update();
                          if (reg.waiting) {
                            if (confirm('Una nuova versione è pronta. Ricaricare per applicare l\'aggiornamento?')) {
                              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                              window.location.reload();
                            }
                          } else {
                            showToast('ok', 'Sei già all\'ultima versione disponibile!');
                          }
                        } catch (err: any) {
                          showToast('error', 'Impossibile verificare aggiornamenti.');
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
                    >
                      <span className="text-emerald-500">🔄</span>
                      <span>Verifica aggiornamenti PWA</span>
                    </button>

                    {/* Versione Build Tecnica */}
                    <div className="px-4 py-2 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 font-mono">
                      <span>Build: {COMMIT_HASH}</span>
                      {BUILD_TIME && <span> • {BUILD_TIME}</span>}
                    </div>

                    {/* Strumenti amministrativi protetti (visibili SOLO con parametro esplicito ?admin=1) */}
                    {typeof window !== 'undefined' && (window.location.search.includes('admin=1') || window.location.hash.includes('admin')) && (
                      <>
                        <a
                          href={`${window.location.pathname}?diag=identity&identityDiagnostics=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                        >
                          <span>🔍</span>
                          <span>Diagnostica Identità</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            window.dispatchEvent(new CustomEvent('open_admin_console'));
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                        >
                          <span>🛡️</span>
                          <span>Console Amministratore</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openAppInfo();
                }}
                className="w-full px-4 py-2.5 text-center text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-t border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
              >
                HOUNIGO v{APP_VERSION}
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Account Sync Modal */}
      {showAccountModal && (
        <AccountSyncModal
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
        />
      )}

      <PushNotificationModal isOpen={showPushModal} onClose={() => setShowPushModal(false)} />

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <span>{toast.type === 'ok' ? '✓' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}
