import React, { useState, useRef, useEffect } from 'react';
import { storageService } from '../../storage/storageService';
import { getTripConfig, clearTripConfig } from '../../utils/tripConfig';
import { idbClearAll } from '../../storage/indexedDB';
import type { DeviceRole } from '../../types';
import DeviceRoleModal from './DeviceRoleModal';
import { usePushNotifications } from '../../hooks/usePushNotifications';

/**
 * Menu impostazioni discreto (icona in alto a destra nell'\u2019App).
 * Gestisce Export JSON e Import JSON del backup completo.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [tripId, setTripId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const generateCopilotInviteUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const config = getTripConfig();
    const activeTrip = config?.id || tripId;
    const joinQuery = activeTrip ? `&join=${encodeURIComponent(activeTrip)}` : '';
    return `${baseUrl}?role=copilota&invite=true${joinQuery}`;
  };

  const handleCopyInviteLink = async () => {
    const url = generateCopilotInviteUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      showToast('ok', "Link d'invito copiato negli appunti!");
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch (err) {
      console.warn('Clipboard writeText non disponibile:', err);
      showToast('ok', "Seleziona e copia il link nel riquadro");
    }
  };
  
  const { isSupported, permission, subscription, subscribeToPush, unsubscribeFromPush, isSubscribing } = usePushNotifications();

  useEffect(() => {
    const config = getTripConfig();
    if (config) {
      setTripId(config.id || '');
    }

    const handleRoleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: DeviceRole }>;
      if (customEvent.detail?.role) {
        setDeviceRole(customEvent.detail.role);
      }
    };
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  const handleSelectRole = (newRole: DeviceRole) => {
    storageService.setDeviceRole(newRole);
    setDeviceRole(newRole);
    const roleLabels: Record<DeviceRole, string> = {
      guida: 'Telefono Guida (GPS Attivo)',
      copilota: 'Telefono Co-pilota',
      viewer: 'Computer / Ospite (Viewer)'
    };
    showToast('ok', `Ruolo aggiornato: ${roleLabels[newRole]}`);
  };

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
      a.download = `honeymoon-roadbook-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('ok', 'Backup esportato con successo.');
    } catch (err) {
      showToast('error', 'Errore durante l\u2019esportazione.');
      console.error(err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      await storageService.importAllData(text);
      showToast('ok', 'Dati ripristinati. La pagina si aggiorner\u00e0.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore durante l\u2019importazione.';
      showToast('error', msg);
    } finally {
      setImporting(false);
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {/* Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Impostazioni"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                Dispositivo
              </p>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowRoleModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">
                    {deviceRole === 'guida' ? '🟢' : deviceRole === 'copilota' ? '🟡' : '💻'}
                  </span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Ruolo Dispositivo</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {deviceRole === 'guida' ? 'Telefono Guida (GPS)' : deviceRole === 'copilota' ? 'Telefono Co-pilota' : 'Computer / Viewer'}
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {tripId && (
                <div className="w-full flex items-center justify-between px-4 py-3 text-xs border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Codice Viaggio</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono select-all">{tripId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tripId);
                      showToast('ok', 'Codice copiato negli appunti!');
                    }}
                    className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    📋 Copia
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowInviteModal(true);
                  handleCopyInviteLink();
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🤝</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Invita Co-pilota</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Copia link d'invito diretto</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'gestione' } }));
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">👥</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Gestione Viaggio</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Gestisci accessi e collaboratori</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Vuoi bloccare l\'app e richiedere nuovamente il PIN di accesso?')) {
                    localStorage.removeItem('houni_pin_authenticated');
                    localStorage.removeItem('houni_auth_time');
                    localStorage.removeItem('auth_pin_verified');
                    clearTripConfig();
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors border-t border-slate-100 dark:border-slate-700 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span>🔒</span>
                  <span>Blocca App / Logout PIN</span>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (confirm('Sei sicuro di voler uscire da questo viaggio? I dati non sincronizzati andranno persi.')) {
                    localStorage.removeItem('houni_pin_authenticated');
                    localStorage.removeItem('houni_auth_time');
                    localStorage.removeItem('auth_pin_verified');
                    await idbClearAll();
                    clearTripConfig();
                    setOpen(false);
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-center px-4 py-2 text-xs font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors border-t border-slate-100 dark:border-slate-700 cursor-pointer"
              >
                Esci / Cambia Viaggio
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-slate-100 dark:border-slate-700">
                Houni AI & Gmail
              </p>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'gmail' } }));
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📧</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Cerca in Gmail</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Importa email di prenotazione</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'copilot' } }));
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🤖</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Copilota AI</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Chiedi al Concierge intelligente</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = localStorage.getItem('gemini_api_key') || '';
                  const key = window.prompt('Inserisci la chiave API Gemini:', current);
                  if (key !== null) {
                    localStorage.setItem('gemini_api_key', key.trim());
                    showToast('ok', 'Chiave API Gemini salvata!');
                  }
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔑</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Chiave API Gemini</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Configura l'accesso all'IA</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100 dark:border-slate-700">
                Backup & Ripristino
              </p>

              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Esportazione...' : 'Esporta backup JSON'}
              </button>

              <button
                type="button"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100 dark:border-slate-700"
              >
                <svg className="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {importing ? 'Importazione...' : 'Importa backup JSON'}
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100 dark:border-slate-700">
                Sincronizzazione Cloud
              </p>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('force_cloud_sync_requested'));
                  showToast('ok', 'Sincronizzazione forzata avviata nel cloud!');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700"
              >
                <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Forza Sincronizzazione al Cloud
              </button>

              <button
                type="button"
                disabled={isSubscribing}
                onClick={async () => {
                  if (!isSupported) {
                    showToast('error', 'Notifiche non supportate sul tuo browser/dispositivo.');
                    return;
                  }
                  
                  try {
                    if (subscription) {
                      await unsubscribeFromPush();
                      showToast('ok', '🔕 Notifiche push disattivate.');
                    } else {
                      const sub = await subscribeToPush();
                      if (sub) {
                        showToast('ok', '🔔 Notifiche push attivate con successo!');
                      } else if (permission === 'denied') {
                        showToast('error', 'Permesso notifiche negato dal browser.');
                      }
                    }
                  } catch (err: any) {
                    showToast('error', err.message || 'Errore durante la modifica delle notifiche.');
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-700 ${isSubscribing ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <span className="text-base shrink-0">{subscription ? '🔔' : '🔕'}</span>
                <div className="text-left flex-1">
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                    {isSubscribing ? 'Salvataggio in corso...' : 'Notifiche Push'}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-normal">
                    {isSubscribing 
                      ? 'Attendere prego...' 
                      : (subscription ? 'Attive - Clicca per disattivare' : 'Ricevi avvisi e aggiornamenti')}
                  </span>
                </div>
                {!isSubscribing && subscription && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800">
                    ON
                  </span>
                )}
                {!isSubscribing && !subscription && permission !== 'denied' && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600">
                    OFF
                  </span>
                )}
                {!isSubscribing && !subscription && permission === 'denied' && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-800">
                    BLOCCATE
                  </span>
                )}
              </button>

              {tripId === '0000' && (
                <button
                  type="button"
                  onClick={async () => {
                    await storageService.seedRealActivities();
                    showToast('ok', 'Attività ripristinate con successo!');
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 transition-colors cursor-pointer border-t border-indigo-100"
                >
                  <span className="text-lg">📥</span>
                  Ripristina Attività Viaggio
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </>
        )}
      </div>

      {/* Modal Ruolo Dispositivo */}
      <DeviceRoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentRole={deviceRole}
        onSelectRole={handleSelectRole}
      />

      {/* Modal Invita Copilota */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setShowInviteModal(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4 z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
                  🤝
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Invita Co-pilota</h3>
                  <p className="text-[11px] text-slate-400">Link di accesso con ruolo Co-pilota</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center text-xs cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Invia questo link al tuo co-pilota. Aprendolo su qualsiasi smartphone o tablet, accederà direttamente al viaggio con il ruolo Co-pilota già configurato.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Link d'invito
              </label>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                <input
                  type="text"
                  readOnly
                  value={generateCopilotInviteUrl()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent px-1 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none select-all truncate"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{copiedInvite ? '✓' : '📋'}</span>
                <span>{copiedInvite ? "Copiato negli appunti!" : "Copia Link"}</span>
              </button>

              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: 'Hounigo - Invito Co-pilota',
                        text: 'Unisciti al Roadbook di Nozze come Co-pilota!',
                        url: generateCopilotInviteUrl()
                      });
                    } catch (e) {
                      // Annullato
                    }
                  }}
                  className="py-3 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center cursor-pointer"
                  title="Condividi tramite app"
                >
                  📤
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={
            'fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] p-4 rounded-xl shadow-xl transition-all min-w-[280px] text-center font-medium border ' +
            (toast.type === 'ok'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-800 dark:border-slate-100'
              : 'bg-slate-900 text-rose-400 dark:bg-white dark:text-rose-600 border-rose-900/50 dark:border-rose-200')
          }
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
