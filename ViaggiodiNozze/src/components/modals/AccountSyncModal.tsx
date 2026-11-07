import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../firebase';
import {
  getAccountStatus,
  linkGoogleToCurrentSession,
  linkEmailPasswordToCurrentSession,
  loginWithEmailPassword,
  loginWithGoogle
} from '../../services/accountService';

interface AccountSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export default function AccountSyncModal({ isOpen, onClose, onSuccess }: AccountSyncModalProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth?.currentUser || null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modalità per ospiti: 'login' (azione primaria) vs 'register' (opzione secondaria)
  const [guestMode, setGuestMode] = useState<'login' | 'register'>('login');

  // Campi form login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Campi form creazione/link nuova coppia email/password
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);

  // Rimani sempre sincronizzato con lo stato Auth effettivo di Firebase
  useEffect(() => {
    if (!auth) return;
    setCurrentUser(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, [isOpen]);

  // Gestione tasto Escape per chiusura accessibile
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const status = getAccountStatus(currentUser || auth?.currentUser || null);

  const handleCopyUid = async () => {
    if (!status.uid) return;
    try {
      await navigator.clipboard.writeText(status.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  // Azione primaria per utenti ospiti: Login con credenziali esistenti (signInWithEmailAndPassword)
  const handleLoginEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage('Verifica credenziali e accesso in corso…');
    setLoading(true);

    try {
      const res = await loginWithEmailPassword(loginEmail, loginPassword);
      setLoading(false);
      setStatusMessage(null);

      if (!res.success || !res.user) {
        setError(res.error || 'Accesso non riuscito.');
        return;
      }

      setCurrentUser(res.user);

      // Verifica UID rispetto al viaggio configurato (non presumere che la sola email sia sufficiente)
      const { getTripConfig } = await import('../../utils/tripConfig');
      const tripConfig = getTripConfig();
      const currentTripId = tripConfig?.id || '0000';
      const expectedOwnerUid = tripConfig?.ownerUid;

      if (expectedOwnerUid && res.user.uid === expectedOwnerUid) {
        if (onSuccess) {
          onSuccess(`✓ Accesso completato come Organizzatore di ${currentTripId} (UID confermato: ${res.user.uid.slice(0, 6)}...)!`);
        }
      } else if (Array.isArray((tripConfig as any)?.members) && (tripConfig as any).members.includes(res.user.uid)) {
        if (onSuccess) {
          onSuccess(`✓ Accesso completato come Partecipante autorizzato di ${currentTripId}!`);
        }
      } else {
        if (onSuccess) {
          onSuccess(`✓ Connesso come ${res.user.email || res.user.uid}. Attenzione: UID (${res.user.uid.slice(0, 6)}...) non registrato come organizzatore di ${currentTripId}. I dati privati rimarranno protetti.`);
        }
      }
      onClose();
    } catch (err: any) {
      setLoading(false);
      setStatusMessage(null);
      setError(err?.message || 'Errore durante l\'accesso.');
    }
  };

  // Accesso diretto con Google per ospiti
  const handleLoginGoogle = async () => {
    setError(null);
    setStatusMessage('Apertura finestra di accesso Google…');
    setLoading(true);

    try {
      const res = await loginWithGoogle((stage) => setStatusMessage(stage));
      setLoading(false);
      setStatusMessage(null);

      if (!res.success || !res.user) {
        if (res.code === 'auth/redirect-started') {
          // Reindirizzamento OAuth verso Google in corso (PWA Standalone iOS)
          return;
        }
        setError(res.error || 'Accesso Google non riuscito.');
        return;
      }

      setCurrentUser(res.user);

      // Verifica UID rispetto al viaggio configurato (non presumere che la sola email sia sufficiente)
      const { getTripConfig } = await import('../../utils/tripConfig');
      const tripConfig = getTripConfig();
      const currentTripId = tripConfig?.id || '0000';
      const expectedOwnerUid = tripConfig?.ownerUid;

      if (expectedOwnerUid && res.user.uid === expectedOwnerUid) {
        if (onSuccess) {
          onSuccess(`✓ Accesso completato come Organizzatore di ${currentTripId} (UID confermato: ${res.user.uid.slice(0, 6)}...)!`);
        }
      } else if (Array.isArray((tripConfig as any)?.members) && (tripConfig as any).members.includes(res.user.uid)) {
        if (onSuccess) {
          onSuccess(`✓ Accesso completato come Partecipante autorizzato di ${currentTripId}!`);
        }
      } else {
        if (onSuccess) {
          onSuccess(`✓ Connesso come ${res.user.email || res.user.uid}. Attenzione: UID (${res.user.uid.slice(0, 6)}...) non registrato come organizzatore di ${currentTripId}. I dati privati rimarranno protetti.`);
        }
      }
      onClose();
    } catch (err: any) {
      setLoading(false);
      setStatusMessage(null);
      setError(err?.message || 'Errore durante l\'accesso con Google.');
    }
  };

  // Azione per utenti GIÀ REGISTRATI: Collega provider Google a questo specifico utente
  const handleLinkGoogle = async () => {
    setError(null);
    setStatusMessage('Apertura finestra Google per il collegamento…');
    setLoading(true);

    const activeUser = auth?.currentUser || currentUser;
    if (!activeUser) {
      setLoading(false);
      setStatusMessage(null);
      setError('Nessuna sessione attiva trovata. Accedi prima con Email e Password.');
      return;
    }

    try {
      const res = await linkGoogleToCurrentSession(activeUser);
      setLoading(false);
      setStatusMessage(null);

      if (!res.success) {
        setError(res.error || 'Collegamento con Google non riuscito.');
        return;
      }

      setCurrentUser(auth?.currentUser || null);
      if (onSuccess) {
        onSuccess('✓ Account Google collegato con successo! Stesso profilo e viaggi mantenuti.');
      }
      onClose();
    } catch (err: any) {
      setLoading(false);
      setStatusMessage(null);
      setError(err?.message || 'Errore imprevisto durante il collegamento con Google.');
    }
  };

  // Azione opzionale per ospiti: Registra nuova email/password
  const handleRegisterEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage('Creazione credenziali in corso…');
    setLoading(true);

    const activeUser = auth?.currentUser || currentUser;
    if (!activeUser) {
      setLoading(false);
      setStatusMessage(null);
      setError('Nessuna sessione attiva trovata. Ricarica la pagina per riprovare.');
      return;
    }

    try {
      const res = await linkEmailPasswordToCurrentSession(activeUser, newEmail, newPassword);
      setLoading(false);
      setStatusMessage(null);

      if (!res.success) {
        setError(res.error || 'Registrazione Email non riuscita.');
        return;
      }

      setCurrentUser(auth?.currentUser || null);
      if (onSuccess) {
        onSuccess('✓ Account registrato con successo! Ora puoi collegare anche Google.');
      }
    } catch (err: any) {
      setLoading(false);
      setStatusMessage(null);
      setError(err?.message || 'Errore durante la registrazione delle credenziali.');
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await auth.signOut();
      if (onSuccess) {
        onSuccess('Disconnessione completata. I dati locali del viaggio restano intatti.');
      }
      onClose();
    } catch (err: any) {
      setError('Errore durante la disconnessione: ' + err.message);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
      >
        {/* Header pulito */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">
              👤
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Account
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {status.isAnonymous ? 'Accedi al tuo profilo permanente' : 'Profilo registrato e sincronizzazione'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Feedback di caricamento */}
        {statusMessage && (
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-2">
            <span className="animate-spin text-sm shrink-0">⏳</span>
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error banner con testo chiaro */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold leading-relaxed">
            ⚠️ {error}
          </div>
        )}

        {/* Profilo Utente */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Profilo Attivo
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {status.isAnonymous ? '👤' : '🔒'}
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {status.email ? status.email : 'Sessione Ospite (non registrata)'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {status.isAnonymous
              ? 'Se possiedi già un account Email o Google, accedi qui sotto.'
              : 'Questo account è registrato e conserva l\'accesso ai tuoi viaggi.'}
          </p>
        </div>

        {/* SEZIONE 1: SESSIONE OSPITE (ANONIMA) */}
        {status.isAnonymous ? (
          <div className="space-y-3">
            {/* Avviso salvaguardia dati locali */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
              <span className="shrink-0 text-sm">💾</span>
              <span><strong>Dati locali protetti:</strong> I dati o i viaggi presenti su questo dispositivo rimarranno intatti e non verranno cancellati all'accesso.</span>
            </div>

            {/* Toggle tra Accedi ad account esistente e Crea nuovo */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setGuestMode('login'); setError(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  guestMode === 'login'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Accedi ad account esistente
              </button>
              <button
                type="button"
                onClick={() => { setGuestMode('register'); setError(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  guestMode === 'register'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Crea nuovo account
              </button>
            </div>

            {guestMode === 'login' ? (
              /* Azione Principale: Accedi ad Account Esistente con Email/Password */
              <form onSubmit={handleLoginEmailPassword} className="space-y-2.5 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block">
                  Inserisci le credenziali del tuo account:
                </span>
                <input
                  required
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="tua@email.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                <input
                  required
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password del tuo account"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>🔑</span>
                  <span>{loading ? 'Accesso in corso…' : 'Accedi con Email e Password'}</span>
                </button>

                <div className="relative my-2 text-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
                  <span className="relative px-2 bg-indigo-50/40 dark:bg-slate-900 text-[10px] text-slate-400 font-semibold uppercase">oppure</span>
                </div>

                <button
                  type="button"
                  onClick={handleLoginGoogle}
                  disabled={loading}
                  className="w-full py-2 px-3 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🌐</span>
                  <span>Accedi con Google</span>
                </button>
              </form>
            ) : (
              /* Registra nuove credenziali */
              <form onSubmit={handleRegisterEmailPassword} className="space-y-2.5 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Crea credenziali Email e Password per questa sessione:
                </span>
                <input
                  required
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nuova@email.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Scegli password (min 6 caratteri)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Salvataggio…' : 'Crea e Registra Account'}
                </button>
              </form>
            )}
          </div>
        ) : (
          /* SEZIONE 2: ACCOUNT REGISTRATO / PERMANENTE ATTIVO */
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs">
                <span>✓</span>
                <span>Account Permanente Attivo</span>
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                Email: <span className="font-bold">{status.email || 'Registrato'}</span>
              </p>

              {/* Sezione Collega Google (solo per account registrato autenticato) */}
              {status.providers.includes('google.com') ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold pt-1">
                  <span>🌐</span>
                  <span>Accesso con Google già collegato e attivo.</span>
                </div>
              ) : (
                <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 space-y-2">
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Vuoi accedere con Google con un solo clic in futuro? Collega ora il tuo account Google mantenendo questo stesso profilo.
                  </p>
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    disabled={loading}
                    className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <span>🌐</span>
                    <span>{loading ? 'Collegamento in corso…' : 'Collega Google'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Logout pulito */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
            >
              Disconnetti da questo dispositivo
            </button>
          </div>
        )}

        {/* Diagnostica (discreta) */}
        <details className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-2.5 text-[11px]">
          <summary className="font-bold text-slate-500 dark:text-slate-400 cursor-pointer flex items-center justify-between select-none">
            <span className="flex items-center gap-1.5">
              <span>🔍</span>
              <span>Dettagli tecnici &amp; Diagnostica</span>
            </span>
            <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
          </summary>
          <div className="pt-2.5 space-y-2 border-t border-slate-200/60 dark:border-slate-700/60 mt-2 text-slate-600 dark:text-slate-300">
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">UID Sessione</span>
              <div className="flex items-center justify-between gap-2 mt-0.5 font-mono text-[10px] bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="truncate select-all">{status.uid || 'Non disponibile'}</span>
                {status.uid && (
                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer"
                  >
                    {copiedUid ? '✓' : 'Copia'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase">Provider collegati</span>
              <span className="font-mono text-[10px]">
                {status.providers.length > 0 ? status.providers.join(', ') : 'anonymous'}
              </span>
            </div>
          </div>
        </details>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
        >
          Chiudi
        </button>
      </div>
    </div>,
    document.body
  );
}
