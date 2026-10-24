import React, { useState, useEffect } from 'react';
import { saveTripConfig, normalizeTripConfig } from '../utils/tripConfig';
import { storageService } from '../storage/storageService';
import { auth, db } from '../firebase';
import { signInAnonymously, type User } from 'firebase/auth';
import { withTimeout } from '../utils/withTimeout';
import { persistDeviceSession } from '../utils/deviceSession';
import {
  fetchUserTrips,
  loginWithEmailPassword,
  loginWithGoogle,
  verifyTripOwnership,
  type UserTripSummary
} from '../services/accountService';

export type OnboardingMode =
  | 'select'
  | 'create'
  | 'join'
  | 'role'
  | 'invite_choice'
  | 'ai'
  | 'account_login';

export default function OnboardingView({ onComplete }: { onComplete?: (config: any) => void }) {
  const [mode, setMode] = useState<OnboardingMode>('select');
  const [tempConfig, setTempConfig] = useState<any>(null);
  const [tempRole, setTempRole] = useState<'guida' | 'copilota'>('guida');

  // Create state
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Invite state in creation flow
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [sharedInviteSuccess, setSharedInviteSuccess] = useState(false);

  // Join state
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Multi-device account login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [recoveredTrips, setRecoveredTrips] = useState<UserTripSummary[]>([]);
  const [isSearchingTrips, setIsSearchingTrips] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [manualTripId, setManualTripId] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    const roleParam = urlParams.get('role');
    if (roleParam === 'copilota' || roleParam === 'guida' || roleParam === 'viewer') {
      setTempRole(roleParam as any);
      storageService.setDeviceRole(roleParam as any);
    }
    if (joinCode) {
      setInviteCode(joinCode);
      setMode('join');
    }
    if (joinCode || roleParam || urlParams.get('invite')) {
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Genera URL di invito per il viaggio appena creato
  const getCreatedTripInviteUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const targetId = tempConfig?.id || '';
    return `${baseUrl}?role=copilota&invite=true&join=${encodeURIComponent(targetId)}`;
  };

  const handleCopyCreatedInviteUrl = async () => {
    const url = getCreatedTripInviteUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteLink(true);
      setTimeout(() => setCopiedInviteLink(false), 3000);
    } catch {
      setCopiedInviteLink(true);
      setTimeout(() => setCopiedInviteLink(false), 3000);
    }
  };

  const handleShareCreatedInviteUrl = async () => {
    const url = getCreatedTripInviteUrl();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Unisciti al viaggio "${tempConfig?.title || 'Hounigo'}"`,
          text: `Ecco il link per unirti come copilota al nostro viaggio su Hounigo!`,
          url
        });
        setSharedInviteSuccess(true);
        setTimeout(() => setSharedInviteSuccess(false), 3000);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Errore navigator.share:', err);
        }
      }
    }
    // Fallback: copia negli appunti
    await handleCopyCreatedInviteUrl();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanOwnerName = ownerName.trim();
    if (!cleanTitle || !startDate || !endDate) return;
    if (!cleanOwnerName) {
      alert("Inserisci il nome dell'organizzatore del viaggio.");
      return;
    }
    setLoading(true);
    let ownerUid = 'local_fallback';
    if (auth) {
      try {
        const authPromise = signInAnonymously(auth);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000));
        const userCredential = (await Promise.race([authPromise, timeoutPromise])) as any;
        ownerUid = userCredential.user.uid;
      } catch (err) {
        console.warn('Errore autenticazione (fallback locale):', err);
      }
    }

    const id = 'trip_' + Math.random().toString(36).substring(2, 9);
    setTempConfig({ id, title: cleanTitle, startDate, endDate, ownerUid, ownerName: cleanOwnerName });
    setTempRole('guida');
    // Requisito B: Passa subito al passaggio di scelta invito facoltativo
    setMode('invite_choice');
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    const codeClean = inviteCode.trim();

    setLoading(true);

    try {
      if (!auth) {
        throw new Error('Autenticazione Firebase non inizializzata.');
      }

      let user = auth.currentUser;
      if (!user) {
        const userCredential = await withTimeout(signInAnonymously(auth), 8000, undefined);
        if (!userCredential) {
          throw new Error('Autenticazione non disponibile.');
        }
        user = userCredential.user;
      }

      // Verifica in sola lettura se il codice inserito corrisponde ad un viaggio in cui questo UID è già autorizzato
      const { doc, getDoc } = await import('firebase/firestore');
      let isAuthorizedMember = false;
      let directTripData: any = null;

      try {
        if (db && user) {
          const tripSnap = await getDoc(doc(db, 'trips', codeClean));
          if (tripSnap.exists()) {
            directTripData = tripSnap.data();
            const members = Array.isArray(directTripData?.members) ? directTripData.members : [];
            if (members.includes(user.uid) || directTripData?.ownerUid === user.uid) {
              isAuthorizedMember = true;
            }
          }
        }
      } catch (checkErr) {
        console.warn('[Onboarding] Verifica diretta membro (normale se non ancora aggiunto su Spark):', checkErr);
      }

      if (isAuthorizedMember && directTripData) {
        setTempConfig({
          id: codeClean,
          title: directTripData.title || (codeClean === '0000' ? 'Viaggio Originale' : 'Il nostro viaggio'),
          startDate: directTripData.startDate || '',
          endDate: directTripData.endDate || '',
          ownerUid: directTripData.ownerUid || '',
          ownerName: directTripData.ownerName || ''
        });
        setMode('role');
        return;
      }

      // Se non è ancora membro autorizzato: messaggio comprensibile e orientato all'invito
      const tripLabel = codeClean === '0000' ? 'il viaggio principale' : `il viaggio "${codeClean}"`;
      alert(
        `Non è stato possibile collegarsi a ${tripLabel}.\n\n` +
        'Assicurati che il codice sia corretto oppure chiedi all’organizzatore di condividere il link d’invito diretto.'
      );
    } catch (err: any) {
      console.error('[Onboarding] Errore adesione viaggio:', err);
      alert('Impossibile verificare il viaggio. Controlla il codice e la connessione Internet.');
    } finally {
      setLoading(false);
    }
  };

  // Login con Account Esistente (Multi-Dispositivo)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    const res = await loginWithEmailPassword(loginEmail, loginPassword);
    setLoading(false);
    if (!res.success || !res.user) {
      setLoginError(res.error || 'Credenziali non valide.');
      return;
    }
    await inspectUserTrips(res.user);
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setLoading(true);
    const res = await loginWithGoogle();
    setLoading(false);
    if (!res.success || !res.user) {
      setLoginError(res.error || 'Accesso Google non completato.');
      return;
    }
    await inspectUserTrips(res.user);
  };

  const inspectUserTrips = async (user: User) => {
    setAuthenticatedUser(user);
    setIsSearchingTrips(true);
    try {
      // 1. Recupero sicuro dei viaggi associati tramite /users/{uid} (zero query 'list' globali)
      const trips = await fetchUserTrips(user.uid);

      // 2. Controllo speciale per 0000 in sola lettura (se l'utente fosse l'owner legittimo)
      const legacyCheck = await verifyTripOwnership('0000', user.uid);
      if (legacyCheck.exists && legacyCheck.isOwner) {
        trips.unshift({
          id: '0000',
          title: 'Viaggio Originale (0000)',
          isOwner: true,
          ownerUid: user.uid,
          ownerName: legacyCheck.ownerName || 'nunzio'
        });
      }

      setRecoveredTrips(trips);
      if (trips.length === 1) {
        // Se c'è un solo viaggio, proponilo direttamente
        selectRecoveredTrip(trips[0]);
      }
    } catch (err) {
      console.warn('[Onboarding] Errore recupero viaggi utente:', err);
    } finally {
      setIsSearchingTrips(false);
    }
  };

  const handleManualTripConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualTripId.trim();
    if (!cleanId || !authenticatedUser) return;
    setLoading(true);
    setLoginError(null);
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const tripSnap = await getDoc(doc(db, 'trips', cleanId));
      if (!tripSnap.exists()) {
        setLoginError(`Nessun viaggio trovato con ID "${cleanId}".`);
        setLoading(false);
        return;
      }
      const data = tripSnap.data();
      const isOwner = data?.ownerUid === authenticatedUser.uid;
      const members = Array.isArray(data?.members) ? data.members : [];
      const isMember = members.includes(authenticatedUser.uid) || isOwner;
      if (!isMember) {
        setLoginError(`Questo account (${authenticatedUser.email}) non risulta tra i partecipanti autorizzati del viaggio "${cleanId}".`);
        setLoading(false);
        return;
      }
      selectRecoveredTrip({
        id: cleanId,
        title: data?.title || 'Il nostro viaggio',
        startDate: data?.startDate,
        endDate: data?.endDate,
        ownerUid: data?.ownerUid,
        ownerName: data?.ownerName,
        isOwner
      });
    } catch (err: any) {
      console.warn('[Onboarding] Errore verifica viaggio manuale:', err);
      setLoginError(`Impossibile accedere al viaggio "${cleanId}" (Permission Denied). Assicurati che l'account sia autorizzato.`);
    } finally {
      setLoading(false);
    }
  };

  const selectRecoveredTrip = (trip: UserTripSummary) => {
    const config = normalizeTripConfig({
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      ownerUid: trip.ownerUid || '',
      ownerName: trip.ownerName || ''
    });
    setTempConfig(config);
    setTempRole(trip.isOwner ? 'guida' : 'copilota');
    handleFinishOnboarding(undefined, config, trip.isOwner ? 'guida' : 'copilota');
  };

  const handleFinishOnboarding = (
    aiAction?: 'gmail' | 'manual',
    finalConfig: any = tempConfig,
    finalRole: 'guida' | 'copilota' = tempRole
  ) => {
    const targetTripId = finalConfig?.id || '0000';
    persistDeviceSession(targetTripId, finalRole);

    import('../storage/storageService').then(({ storageService }) => {
      storageService.setDeviceRole(finalRole);
      storageService.ensureRefuels().catch(console.error);
    });
    saveTripConfig(finalConfig);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
    }
    if (onComplete) onComplete(finalConfig);

    if (aiAction) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: aiAction } }));
      }, 500);
    }
  };

  const renderLayout = (children: React.ReactNode) => (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #172033 0%, #26324b 50%, #172033 100%)' }}
    >
      <div
        className="absolute top-[-80px] left-[-80px] w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FF6B5F, transparent)' }}
      />
      <div
        className="absolute bottom-[-60px] right-[-60px] w-72 h-72 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #f5a28d, transparent)' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-5 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #F8F7F3, transparent)' }}
      />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );

  // ─────────────────────────────────────────
  // 1. SELECT MODE (Schermata Principale)
  // ─────────────────────────────────────────
  if (mode === 'select') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 sm:p-8 text-center space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        {/* Logo / Header */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 mx-auto">
            <div
              className="absolute inset-0 rounded-3xl blur-xl opacity-60"
              style={{ background: 'linear-gradient(135deg, #FF6B5F, #f5a28d)' }}
            />
            <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center p-3 shadow-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#ffffff' }}>
              Hounigo
            </h1>
            <p className="font-medium mt-1 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
              Il Roadbook digitale di nozze & avventura
            </p>
          </div>
        </div>

        {/* 3 Possibilità Chiare ed Immediate: Accedi · Crea · Partecipa */}
        <div className="space-y-3 pt-1">
          {/* 1. ACCEDI (Google in primo piano, Email e Password disponibile) */}
          <div className="p-3.5 rounded-2xl bg-white/[0.08] border border-white/15 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                Hai già un viaggio o un account?
              </span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Consigliato
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-white text-slate-900 hover:bg-slate-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
            >
              <span className="text-base">🌐</span>
              <span>{loading ? 'Accesso in corso…' : 'Continua con Google'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('account_login')}
              className="w-full text-center text-[11px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer py-1"
            >
              Accedi al tuo Account (Multi-dispositivo) con Email e Password →
            </button>
          </div>

          <div className="relative flex items-center justify-center pt-0.5 pb-0.5">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#172033] px-3 text-[10px] uppercase font-bold text-slate-400 absolute">
              oppure
            </span>
          </div>

          {/* 2. CREA UN VIAGGIO */}
          <button
            type="button"
            onClick={() => setMode('create')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer shadow-md flex items-center justify-between"
            style={{ background: '#FF6B5F', color: '#ffffff' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">✨</span>
              <div className="text-left">
                <div className="font-extrabold text-sm">Crea un nuovo viaggio</div>
                <div className="text-[10px] text-white/80 font-normal">Imposta le date e inizia il roadbook</div>
              </div>
            </div>
            <span className="text-white text-sm font-bold">→</span>
          </button>

          {/* 3. PARTECIPA A UN VIAGGIO */}
          <button
            type="button"
            onClick={() => setMode('join')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer border flex items-center justify-between"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.18)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🤝</span>
              <div className="text-left">
                <div className="font-extrabold text-sm">Partecipa a un viaggio</div>
                <div className="text-[10px] text-slate-300 font-normal">Inserisci codice o accetta un invito</div>
              </div>
            </div>
            <span className="text-slate-300 text-sm font-bold">→</span>
          </button>
        </div>

        <p className="text-[11px] text-center" style={{ color: '#64748b' }}>
          Dati protetti, sincronizzazione in tempo reale & backup offline
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 2. CREATE MODE
  // ─────────────────────────────────────────
  if (mode === 'create') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: '#ffffff' }}>
              Nuovo Viaggio
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
              Imposta le date per generare il calendario
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
              Nome del Viaggio *
            </label>
            <input
              required
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Giappone 2026 🌸"
              className="w-full px-4 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/30"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
              Nome dell'Organizzatore *
            </label>
            <input
              required
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full px-4 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/30"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
            />
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#94a3b8' }}>
              Identifica il creatore con pieni poteri di gestione e modifica.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                Partenza *
              </label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border border-white/15 focus:border-[#FF6B5F]"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                Rientro *
              </label>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border border-white/15 focus:border-[#FF6B5F]"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-2 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60"
            style={{ background: '#FF6B5F', color: '#ffffff' }}
          >
            {loading ? 'Creazione in corso…' : 'Crea Viaggio e Prosegui 🚀'}
          </button>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 3. INVITE CHOICE (REQUISITO B: INVITO FACOLTATIVO)
  // ─────────────────────────────────────────
  if (mode === 'invite_choice') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6 text-center"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-3xl shadow-lg" style={{ background: '#FF6B5F' }}>
          🎉
        </div>

        <div>
          <h2 className="text-2xl font-black text-white">Viaggio Creato!</h2>
          <p className="text-xs font-semibold mt-1" style={{ color: '#FF6B5F' }}>
            {tempConfig?.title}
          </p>
          <p className="text-xs mt-2 text-slate-300">
            Vuoi invitare subito un Copilota o iniziare subito ad esplorare?
          </p>
        </div>

        <div className="space-y-3.5 pt-1 text-left">
          {/* Opzione 1: Invita un Copilota */}
          <div
            className="p-4 rounded-2xl border transition-all space-y-3"
            style={{ background: 'rgba(30,41,59,0.85)', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🤝</span>
              <div>
                <h3 className="font-bold text-sm text-white">Invita un Copilota</h3>
                <p className="text-[11px] text-slate-300">Condividi il link d'accesso al viaggio</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleShareCreatedInviteUrl}
                className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                style={{ background: '#FF6B5F', color: '#ffffff' }}
              >
                <span>📤</span>
                <span>{sharedInviteSuccess ? '✓ Condiviso!' : 'Condividi Link'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCreatedInviteUrl}
                className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
              >
                <span>{copiedInviteLink ? '✓ Copiato!' : '📋 Copia'}</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-400 leading-tight">
              Il copilota riceverà un link diretto per collegare il proprio dispositivo al tuo viaggio.
            </p>
          </div>

          {/* Opzione 2: Lo farò più tardi */}
          <button
            type="button"
            onClick={() => {
              // Prosegue immediatamente senza attese
              if (tempConfig?.id === '0000') {
                setMode('role');
              } else {
                setMode('ai');
              }
            }}
            className="w-full p-4 rounded-2xl border transition-all text-left hover:brightness-110 active:scale-95 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⏳</span>
                <div>
                  <h3 className="font-bold text-sm text-white">Lo farò più tardi</h3>
                  <p className="text-[11px] text-slate-400">Entra subito nel viaggio e invita in seguito</p>
                </div>
              </div>
              <span className="text-slate-400 text-lg">→</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 pl-8">
              Potrai generare o revocare l'invito in qualunque momento da Impostazioni ⚙️ → Partecipanti.
            </p>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (tempConfig?.id === '0000') {
              setMode('role');
            } else {
              setMode('ai');
            }
          }}
          className="w-full py-3.5 rounded-xl font-extrabold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer shadow-md"
          style={{ background: '#FF6B5F', color: '#ffffff' }}
        >
          Entra nel Roadbook 🚀
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 4. ACCOUNT LOGIN MODE (MULTI-DISPOSITIVO REQUISITO A)
  // ─────────────────────────────────────────
  if (mode === 'account_login') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-white">Accedi al tuo Account</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sincronizza lo stesso viaggio su smartphone e PC</p>
          </div>
        </div>

        {loginError && (
          <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold leading-relaxed">
            ⚠️ {loginError}
          </div>
        )}

        {/* Elenco Viaggi Riconosciuti dopo Login */}
        {isSearchingTrips ? (
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center text-xs font-semibold text-slate-300 animate-pulse">
            ⏳ Ricerca viaggi sincronizzati in corso…
          </div>
        ) : recoveredTrips.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
              I tuoi viaggi sincronizzati:
            </p>
            {recoveredTrips.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectRecoveredTrip(t)}
                className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-left transition-all active:scale-95 cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{t.title}</span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                      t.isOwner ? 'bg-amber-400/20 text-amber-300' : 'bg-emerald-400/20 text-emerald-300'
                    }`}
                  >
                    {t.isOwner ? '👑 Organizzatore' : '🤝 Copilota'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">ID: {t.id}</div>
              </button>
            ))}
          </div>
        ) : authenticatedUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1.5 text-left">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <span>✓</span>
                <span>Accesso completato</span>
              </div>
              <p className="text-slate-200">
                Connesso come: <strong className="text-white">{authenticatedUser.email || authenticatedUser.uid}</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Nessun viaggio trovato nella cronologia di questo account.
              </p>
            </div>

            {/* Azioni dirette ed utili */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setMode('create')}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                style={{ background: '#FF6B5F', color: '#ffffff' }}
              >
                <span>✨</span>
                <span>Crea il tuo primo viaggio</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('join')}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs border border-white/20 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🤝</span>
                <span>Partecipa con un codice viaggio</span>
              </button>
            </div>

            <form onSubmit={handleManualTripConnect} className="pt-2 border-t border-white/10 space-y-2 text-left">
              <label className="block text-[11px] font-semibold text-slate-400">
                Oppure inserisci un ID viaggio manuale:
              </label>
              <div className="flex gap-2">
                <input
                  required
                  type="text"
                  value={manualTripId}
                  onChange={(e) => setManualTripId(e.target.value)}
                  placeholder="Es. 0000 oppure trip_xxx"
                  className="flex-1 px-3 py-2 rounded-xl text-xs outline-none border border-white/15 focus:border-[#FF6B5F]"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl font-bold text-xs bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? '…' : 'Collega'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Continua con Google (Accesso con account esistente) */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-white text-slate-900 hover:bg-slate-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
            >
              <span className="text-base">🌐</span>
              <span>{loading ? 'Accesso in corso…' : 'Continua con Google'}</span>
            </button>

            <div className="relative flex items-center justify-center pt-1 pb-1">
              <div className="border-t border-white/15 w-full" />
              <span className="bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-400 absolute">
                oppure con email
              </span>
            </div>

            {/* Form Email / Password (Compatibile 100% PWA Safari standalone) */}
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-300">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="nome@esempio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border border-white/15 focus:border-[#FF6B5F]"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-300">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border border-white/15 focus:border-[#FF6B5F]"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-md"
                style={{ background: '#FF6B5F', color: '#ffffff' }}
              >
                {loading ? 'Accesso in corso…' : 'Accedi con Email e Password ✉️'}
              </button>
            </form>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              💡 Su iPhone o se hai installato l'app sulla schermata Home, puoi accedere direttamente con Email e Password senza dover gestire finestre esterne.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 5. JOIN MODE (Adesione con Codice)
  // ─────────────────────────────────────────
  if (mode === 'join') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-white">Unisciti a un Viaggio</h2>
            <p className="text-xs text-slate-400 mt-0.5">Inserisci l'ID del viaggio o accetta un invito</p>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-300">
              Codice o ID del Viaggio
            </label>
            <input
              required
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Es. trip_ab12cd oppure 0000"
              className="w-full px-4 py-3.5 rounded-xl font-bold text-center tracking-widest text-base outline-none transition-all border border-white/15 focus:border-[#FF6B5F] uppercase"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5 text-xs text-left">
            <span className="font-bold text-white block">💡 Come funziona l'accesso:</span>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Se l'organizzatore ti ha inviato un link d'invito (via WhatsApp o email), aprilo direttamente per collegarti all'istante senza dover digitare codici.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60 shadow-md"
            style={{ background: '#FF6B5F', color: '#ffffff' }}
          >
            {loading ? '⏳ Connessione…' : 'Connettiti al Viaggio 🔗'}
          </button>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 6. ROLE MODE (Scelta Ruolo Operativo Locale)
  // ─────────────────────────────────────────
  if (mode === 'role') {
    const roleCardStyle: React.CSSProperties = {
      background: 'rgba(30,41,59,0.9)',
      border: '1.5px solid rgba(255,255,255,0.28)'
    };

    const isTrip0000 = tempConfig?.id === '0000';
    const guidaTitle = isTrip0000
      ? '***REMOVED*** • Guida (Navigazione)'
      : `${tempConfig?.ownerName || 'Organizzatore'} • Guida (Master GPS)`;
    const copilotaTitle = isTrip0000
      ? '***REMOVED*** • Copilota (Organizzazione)'
      : 'Copilota (Roadbook & Spese)';

    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-extrabold mb-2 text-white">Ruolo Dispositivo</h2>
          <p className="text-sm text-slate-300">
            Scegli come utilizzerai questo dispositivo durante il viaggio.
          </p>
        </div>

        <div className="space-y-4">
          <button
            id="onboarding-role-guida"
            onClick={() => {
              setTempRole('guida');
              setMode('ai');
            }}
            className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-125 active:scale-95 cursor-pointer shadow-lg"
            style={roleCardStyle}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🗺️</span>
              <div>
                <h3 className="font-bold text-lg leading-tight text-white">{guidaTitle}</h3>
                <span className="text-[11px] font-semibold text-emerald-400">Master GPS • Mappe & Direzioni</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1 text-slate-300">
              Dispositivo di riferimento per le mappe e la posizione GPS del viaggio.
            </p>
          </button>

          <button
            id="onboarding-role-copilota"
            onClick={() => {
              setTempRole('copilota');
              setMode('ai');
            }}
            className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-125 active:scale-95 cursor-pointer shadow-lg"
            style={roleCardStyle}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📝</span>
              <div>
                <h3 className="font-bold text-lg leading-tight text-white">{copilotaTitle}</h3>
                <span className="text-[11px] font-semibold text-amber-400">Roadbook • Note, Spese & Orari</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1 text-slate-300">
              Gestisce le note di viaggio, inserisce le spese, controlla gli orari e i documenti.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 7. AI MODE
  // ─────────────────────────────────────────
  if (mode === 'ai') {
    return renderLayout(
      <div
        className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
            style={{ background: '#FF6B5F' }}
          >
            ✨
          </div>
          <h2 className="text-2xl font-extrabold mb-2 text-white">Houni AI</h2>
          <p className="text-sm text-slate-300">
            Il tuo Concierge personale. Vuoi caricare automaticamente le prenotazioni?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleFinishOnboarding('manual')}
            className="w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 border"
            style={{ background: '#FF6B5F', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <span>📋</span> Incolla conferme o voucher
          </button>

          <button
            onClick={() => handleFinishOnboarding('gmail')}
            className="w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer flex items-center justify-center gap-2"
            style={{ background: 'rgba(30,41,59,0.9)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <span>📧</span> Sincronizza con Gmail (Avanzato)
          </button>

          <button
            onClick={() => handleFinishOnboarding()}
            className="w-full py-3 mt-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer text-slate-300"
          >
            Salta, crea itinerario a mano
          </button>
        </div>
      </div>
    );
  }

  return null;
}
