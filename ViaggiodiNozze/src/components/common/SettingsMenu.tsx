import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { storageService } from '../../storage/storageService';
import { getTripConfig, clearTripConfig } from '../../utils/tripConfig';
import { clearDeviceSession } from '../../utils/deviceSession';
import { idbClearAll } from '../../storage/indexedDB';
import type { DeviceRole } from '../../types';
import DeviceRoleModal from './DeviceRoleModal';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import AccountSyncModal from '../modals/AccountSyncModal';

/**
 * Menu impostazioni ordinato e strutturato.
 * Utilizza React Portal per evitare qualsiasi stacking context concorrente o troncamento da contenitori padre.
 */
export default function SettingsMenu() {
  const { cloudRole, isCloudAuthorized } = useAuthIdentity();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [tripId, setTripId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

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
    } catch (err) {
      console.warn('Clipboard writeText non disponibile:', err);
      showToast('ok', "Seleziona e copia il link nel riquadro");
    }
  };

  const [memberUidInput, setMemberUidInput] = useState('');
  const [memberNameInput, setMemberNameInput] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberStatus, setAddMemberStatus] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const handleAuthorizeMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = memberUidInput.trim();
    const cleanName = memberNameInput.trim() || 'Co-pilota';
    if (!cleanUid) {
      setAddMemberStatus({ type: 'error', text: 'Inserisci l\'UID del dispositivo.' });
      return;
    }
    const config = getTripConfig();
    const activeTripId = config?.id || tripId || '0000';

    setIsAddingMember(true);
    setAddMemberStatus(null);
    try {
      if (!db) throw new Error('Database Firebase non inizializzato.');
      const tripRef = doc(db, 'trips', activeTripId);
      const memberRef = doc(db, 'trips', activeTripId, 'members', cleanUid);
      const batch = writeBatch(db);
      batch.update(tripRef, {
        members: arrayUnion(cleanUid),
        updatedAt: Date.now()
      });
      batch.set(memberRef, {
        uid: cleanUid,
        name: cleanName,
        role: 'copilota',
        createdAt: Date.now()
      }, { merge: true });
      await batch.commit();

      setAddMemberStatus({ type: 'ok', text: `✓ Dispositivo "${cleanName}" autorizzato con successo!` });
      setMemberUidInput('');
      setMemberNameInput('');
      setTimeout(() => setAddMemberStatus(null), 4000);
    } catch (err: any) {
      console.error('[SettingsMenu] Errore autorizzazione copilota:', err);
      setAddMemberStatus({
        type: 'error',
        text: err?.message || 'Permessi insufficienti su Firestore: la sessione attuale non è riconosciuta come Owner del viaggio remoto.'
      });
    } finally {
      setIsAddingMember(false);
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

  // Calcolo dinamico coordinate portale per non tagliare mai il menu
  useEffect(() => {
    if (!open || !triggerRef.current || typeof window === 'undefined') {
      setMenuCoords(null);
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.min(320, window.innerWidth - 24);

      // Se il trigger è a sinistra (sidebar desktop), posiziona a partire da sinistra per evitare overflow a sinistra
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

  // Chiusura accessibile con tasto Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

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
      await storageService.importAllData(text);
      showToast('ok', 'Dati ripristinati con successo. La pagina si aggiornerà.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore durante l\'importazione.';
      showToast('error', msg);
    } finally {
      setImporting(false);
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Impostazioni"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Dropdown Menu renderizzato via React Portal direttamente sotto document.body */}
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
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto outline-none animate-in fade-in zoom-in-95 duration-150"
            >
              {/* SEZIONE 1: ACCOUNT */}
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                Account
              </p>

              {/* Account (Gestisci Accesso e Profilo) */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowAccountModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">👤</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Profilo &amp; Accesso</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Accedi, collega Google o Email</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* Blocca App / Logout PIN */}
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Vuoi bloccare l\'app e richiedere nuovamente il PIN di accesso?')) {
                    await clearDeviceSession();
                    clearTripConfig();
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
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

              {/* Esci dal viaggio */}
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Sei sicuro di voler uscire da questo viaggio? I dati non sincronizzati andranno persi.')) {
                    await clearDeviceSession();
                    await idbClearAll();
                    clearTripConfig();
                    setOpen(false);
                    window.location.reload();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
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

              {/* SEZIONE 2: PREFERENZE */}
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100 dark:border-slate-800">
                Preferenze
              </p>

              {/* Notifiche Push */}
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
                className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${isSubscribing ? 'opacity-70 cursor-not-allowed' : ''}`}
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
              </button>

              {/* Riavvia Tutorial / Onboarding */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  localStorage.removeItem('houni_onboarding_completed_v1');
                  localStorage.removeItem('walkthrough_seen');
                  window.dispatchEvent(new CustomEvent('replay_tutorial_requested'));
                  showToast('ok', 'Tutorial e guida riavviati');
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💡</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Guida &amp; Tutorial</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Rivedi i passaggi introduttivi</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* SEZIONE 3: GESTIONE DEL VIAGGIO */}
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100 dark:border-slate-800">
                Gestione del viaggio
              </p>

              {/* Invita Co-pilota */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowInviteModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🤝</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Invita Co-pilota</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Condividi link e accesso collaborativo</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* Ruolo Dispositivo */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowRoleModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">
                    {deviceRole === 'guida'
                      ? (isCloudAuthorized && cloudRole === 'owner' ? '🟢' : '🟡')
                      : deviceRole === 'copilota'
                      ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? '🟢' : '🟡')
                      : '💻'}
                  </span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Ruolo Dispositivo</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {deviceRole === 'guida'
                        ? (isCloudAuthorized && cloudRole === 'owner' ? 'Telefono Guida (GPS)' : 'Telefono Guida (Non verificato)')
                        : deviceRole === 'copilota'
                        ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? 'Telefono Co-pilota (Verificato)' : 'Telefono Co-pilota (Non verificato)')
                        : 'Computer / Viewer'}
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* Codice Viaggio con copia rapida */}
              {tripId && (
                <div className="w-full flex items-center justify-between px-4 py-2.5 text-xs border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
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
                    className="px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    📋 Copia
                  </button>
                </div>
              )}

              {/* SEZIONE 4: FUNZIONI AVANZATE */}
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100 dark:border-slate-800">
                Funzioni avanzate
              </p>

              {/* Forza Sincronizzazione */}
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('force_cloud_sync_requested'));
                  showToast('ok', 'Sincronizzazione forzata avviata nel cloud!');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Forza Allineamento Cloud</span>
              </button>

              {/* Esporta Backup JSON */}
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100 dark:border-slate-800"
              >
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{exporting ? 'Esportazione...' : 'Esporta backup JSON'}</span>
              </button>

              {/* Importa Backup JSON */}
              <button
                type="button"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100 dark:border-slate-800"
              >
                <svg className="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{importing ? 'Importazione...' : 'Importa backup JSON'}</span>
              </button>

              {/* Cerca in Gmail */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'gmail' } }));
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📧</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Importa da Gmail</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Cerca voucher e conferme</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* Chiave API Gemini */}
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
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔑</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Chiave API Gemini</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Personalizza modello IA</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              {/* Diagnostica Sessione (Discreta, non protagonista) */}
              <a
                href={`${window.location.pathname}?diag=identity&identityDiagnostics=1`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">🔍</span>
                  <div className="text-left">
                    <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">Verifica Identità 0000 &amp; Diagnostica</span>
                    <span className="block text-[9px] text-slate-400 font-normal">Stato sessione e sincronizzazione</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">↗</span>
              </a>

              {/* Console Amministratore: visibile esclusivamente per il viaggio originale 0000 */}
              {getTripConfig()?.id === '0000' && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    const url = new URL(window.location.href);
                    url.searchParams.set('admin', '1');
                    window.history.pushState({}, '', url.toString());
                    window.dispatchEvent(new CustomEvent('open_admin_console'));
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🛡️</span>
                    <div className="text-left">
                      <span className="block text-xs font-bold text-indigo-700 dark:text-indigo-300">Console Amministratore</span>
                      <span className="block text-[10px] text-indigo-500/80 dark:text-indigo-400/80 font-normal">Pannello globale roadbook</span>
                    </div>
                  </div>
                  <span className="text-indigo-400 text-xs">›</span>
                </button>
              )}
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

      {/* Modal Ruolo Dispositivo */}
      <DeviceRoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentRole={deviceRole}
        onSelectRole={handleSelectRole}
      />

      {/* Modal Invita Copilota renderizzata via Portal per rompere lo stacking context */}
      {showInviteModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowInviteModal(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            className="relative bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4 z-10 animate-in zoom-in-95 duration-200 outline-none"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
                  🤝
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Invita Co-pilota</h3>
                  <p className="text-[11px] text-slate-400">Condivisione rapida dell'accesso</p>
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

            {/* Azione Principale: Link d'invito condivisibile */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🔗</span>
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                  Link di Invito al Viaggio
                </span>
              </div>
              <p className="text-[11px] text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">
                Invia questo link al tuo co-pilota. Aprendolo da smartphone potrà accedere ed entrare subito nel viaggio:
              </p>
              
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2 shadow-xs">
                <input
                  type="text"
                  readOnly
                  value={generateCopilotInviteUrl()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent px-1 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none select-all truncate"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{copiedInvite ? '✓' : '📋'}</span>
                  <span>{copiedInvite ? "Copiato!" : "Copia Link"}</span>
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.share({
                          title: 'Hounigo - Invito Co-pilota',
                          text: 'Unisciti al Roadbook come Co-pilota!',
                          url: generateCopilotInviteUrl()
                        });
                      } catch (e) {
                        // Annullato
                      }
                    }}
                    className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center justify-center cursor-pointer"
                    title="Condividi con WhatsApp o altre app"
                  >
                    📤 Condividi
                  </button>
                )}
              </div>
            </div>

            {/* Accordatore / Opzione diretta dispositivo */}
            <details className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-800/30 group">
              <summary className="text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer list-none flex items-center justify-between">
                <span>Autorizza dispositivo direttamente</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <form onSubmit={handleAuthorizeMember} className="mt-3 space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                  Se il tuo co-pilota ti mostra il codice del suo telefono, inseriscilo qui per confermarlo all'istante:
                </p>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    value={memberUidInput}
                    onChange={(e) => setMemberUidInput(e.target.value)}
                    placeholder="Codice Dispositivo Copilota *"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <input
                    type="text"
                    value={memberNameInput}
                    onChange={(e) => setMemberNameInput(e.target.value)}
                    placeholder="Nome (es. Maria, Co-pilota)"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                {addMemberStatus && (
                  <div className={`p-2 rounded-xl text-[10px] font-semibold leading-tight ${
                    addMemberStatus.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {addMemberStatus.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAddingMember || !memberUidInput.trim()}
                  className="w-full py-2 rounded-xl font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAddingMember ? 'Conferma in corso...' : 'Conferma Co-pilota'}
                </button>
              </form>
            </details>
          </div>
        </div>,
        document.body
      )}

      {/* Modale Account & Multi-Dispositivo */}
      <AccountSyncModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSuccess={(msg) => showToast('ok', msg)}
      />

      {/* Toast Feedback */}
      {toast && typeof document !== 'undefined' && createPortal(
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
        </div>,
        document.body
      )}
    </>
  );
}
