import React, { useState, useEffect } from 'react';
import { saveTripConfig } from '../utils/tripConfig';
import { storageService } from '../storage/storageService';
import { auth } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { withTimeout } from '../utils/withTimeout';
import { persistDeviceSession } from '../utils/deviceSession';

export default function OnboardingView({ onComplete }: { onComplete?: (config: any) => void }) {
  const [mode, setMode] = useState<'select' | 'create' | 'join' | 'role' | 'ai'>('select');
  const [tempConfig, setTempConfig] = useState<any>(null);
  const [tempRole, setTempRole] = useState<'guida' | 'copilota'>('guida');

  // Create state
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(auth?.currentUser?.uid || null);
  const [uidCopied, setUidCopied] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setMyUid(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => setMyUid(cred.user.uid))
          .catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  const copyMyUid = async () => {
    if (!myUid) return;
    try {
      await navigator.clipboard.writeText(myUid);
      setUidCopied(true);
      setTimeout(() => setUidCopied(false), 2500);
    } catch {
      setUidCopied(true);
      setTimeout(() => setUidCopied(false), 2500);
    }
  };

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
        const userCredential = await Promise.race([authPromise, timeoutPromise]) as any;
        ownerUid = userCredential.user.uid;

      } catch (err) {
        console.warn('Errore autenticazione (fallback locale):', err);
        // Non blocchiamo la creazione. Procediamo offline/fallback
      }
    }

    const id = 'trip_' + Math.random().toString(36).substring(2, 9);
    setTempConfig({ id, title: cleanTitle, startDate, endDate, ownerUid, ownerName: cleanOwnerName });
    setMode('role');
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

      // 1. Verifica immediata: il codice inserito corrisponde direttamente all'ID di un viaggio
      // (es. "0000" o ID personalizzato) in cui questo UID è già stato autorizzato (Firebase Spark)
      const { db } = await import('../firebase');
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
        console.warn('[Onboarding] Verifica diretta membro non riuscita o non autorizzata da Firestore Rules:', checkErr);
      }

      if (isAuthorizedMember && directTripData) {
        // L'utente autenticato è già membro registrato del viaggio: ripristina la sessione
        setTempConfig({
          id: codeClean,
          title: directTripData.title || (codeClean === '0000' ? 'Viaggio Originale' : 'Il nostro viaggio'),
          startDate: directTripData.startDate || '',
          endDate: directTripData.endDate || '',
          ownerUid: directTripData.ownerUid || ''
        });
        setMode('role');
        return;
      }

      // Se ha inserito "0000" ma non è ancora membro autorizzato: spiega come procedere con l'UID
      if (codeClean === '0000') {
        alert(
          'Questo dispositivo non risulta ancora autorizzato per il viaggio principale "0000".\n\n' +
          'Il tuo UID Dispositivo è:\n' + (user?.uid || 'non disponibile') + '\n\n' +
          'Chiedi all’Organizzatore di inserire questo UID in "Partecipanti al Viaggio" nelle Impostazioni del suo dispositivo (100% gratuito su Firebase Spark), poi riprova.'
        );
        return;
      }

      const tripLabel = codeClean === '0000' ? 'il viaggio principale "0000"' : `il viaggio "${codeClean}"`;
      alert(
        `Questo dispositivo non risulta ancora autorizzato per ${tripLabel}.\n\n` +
        `Il tuo UID Dispositivo Ã¨:\n${user?.uid || 'non disponibile'}\n\n` +
        'Su Firebase Spark l’organizzatore deve prima aggiungere questo UID in "Partecipanti al Viaggio". Dopo l\'autorizzazione, inserisci di nuovo lo stesso ID viaggio.'
      );
    } catch (err: any) {
      console.error('[Onboarding] Dettagli tecnici accesso UID:', {
        phase: 'uid_authorized_trip_access',
        errorCode: err?.code || 'NO_CODE',
        errorName: err?.name || 'Error',
        errorMessage: err?.message || 'unknown'
      });
      let userMessage = 'Impossibile unirsi al viaggio. Verifica il codice e la connessione.';
      const msg = String(err?.message || '').toLowerCase();
      const code = String(err?.code || '').toLowerCase();

      if (code === 'functions/not-found' || msg.includes('not-found')) {
        userMessage = 'Codice invito non trovato o non valido. Verifica di aver digitato il codice invito a 6 caratteri generato dall’organizzatore.';
      } else if (code === 'functions/failed-precondition' || msg.includes('failed-precondition')) {
        userMessage = err.message.replace(/^.*?:\s*/, '') || 'Codice invito scaduto o già utilizzato.';
      } else if (code === 'functions/unauthenticated') {
        userMessage = 'Sessione di autenticazione non valida. Ricarica la pagina e riprova.';
      } else if (code === 'functions/permission-denied') {
        userMessage = 'Accesso non consentito per questo account.';
      } else if (code === 'functions/invalid-argument') {
        userMessage = 'Formato del codice invito non valido.';
      } else if (code === 'functions/unavailable') {
        userMessage = 'Servizio cloud temporaneamente non disponibile. Riprova tra qualche istante.';
      } else if (code === 'functions/internal' || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('cors')) {
        userMessage = 'Il codice invito automatico richiede Cloud Functions (piano Blaze). Sul piano gratuito Spark, chiedi all’organizzatore di aggiungere il tuo UID (' + (auth?.currentUser?.uid || '') + ') da "Partecipanti al Viaggio", poi digita qui l\'ID del viaggio (es. 0000).';
      } else if (msg.includes('timeout')) {
        userMessage = 'Tempo di attesa esaurito durante il collegamento. Verifica la connessione Internet e riprova.';
      }
      alert(userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishOnboarding = (aiAction?: 'gmail' | 'manual') => {
    // Ruolo e config salvati in modo sincrono → la transizione è immediata
    const targetTripId = tempConfig?.id || '0000';
    persistDeviceSession(targetTripId, tempRole);
    
    import('../storage/storageService').then(({ storageService }) => {
      storageService.setDeviceRole(tempRole);
      // Popola i dati locali in background (non blocca il render)
      storageService.ensureRefuels().catch(console.error);
    });
    saveTripConfig(tempConfig);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
    }
    if (onComplete) onComplete(tempConfig);

    if (aiAction) {
      // Small delay to let the app mount
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: aiAction } }));
      }, 500);
    }
  };

  // Funzione helper per il layout di base comune
  const renderLayout = (children: React.ReactNode) => (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #172033 0%, #26324b 50%, #172033 100%)' }}>
      <div className="absolute top-[-80px] left-[-80px] w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #FF6B5F, transparent)' }} />
      <div className="absolute bottom-[-60px] right-[-60px] w-72 h-72 rounded-full opacity-15 blur-3xl"
        style={{ background: 'radial-gradient(circle, #f5a28d, transparent)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-5 blur-3xl"
        style={{ background: 'radial-gradient(circle, #F8F7F3, transparent)' }} />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  );

  // ─────────────────────────────────────────
  if (mode === 'select') {
    return renderLayout(
      <>
        {/* Card */}
        <div className="rounded-3xl border border-white/10 p-8 text-center space-y-8"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

          {/* Icon / Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-3xl blur-xl opacity-60"
                style={{ background: 'linear-gradient(135deg, #FF6B5F, #f5a28d)' }} />
              <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center p-3 shadow-2xl bg-white/10 backdrop-blur-md border border-white/20">
                <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#ffffff' }}>Benvenuto!</h1>
              <p className="font-medium mt-1.5 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                Il tuo Roadbook digitale è pronto.<br />Come vuoi iniziare?
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer"
              style={{ background: '#FF6B5F', color: '#ffffff' }}
            >
              ✨ Crea Nuovo Viaggio
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 cursor-pointer border"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              🤝 Unisciti a un Viaggio
            </button>
          </div>

          {/* Footer hint */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-xs text-center" style={{ color: '#64748b' }}>
              I dati sono salvati localmente e sincronizzati via cloud
            </p>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────
  // CREATE MODE
  // ─────────────────────────────────────────
  if (mode === 'create') {
    return renderLayout(
      <>
        <div className="rounded-3xl border border-white/10 p-7 space-y-6"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('select')}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              ←
            </button>
            <div>
              <h2 className="text-xl font-extrabold" style={{ color: '#ffffff' }}>Nuovo Viaggio</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Imposta le date per generare il calendario</p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            {/* Trip name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                Nome del Viaggio
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

            {/* Owner name */}
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
                Questo nome identifica il creatore del viaggio ed è visibile ai partecipanti invitati e nel portale Admin.
              </p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                  Partenza
                </label>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartDate(nextStart);
                    if (endDate && endDate < nextStart) setEndDate(nextStart);
                    requestAnimationFrame(() => document.getElementById('onboarding-end-date')?.focus());
                  }}
                  className="w-full min-w-0 px-3 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/30"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                  Ritorno
                </label>
                <input
                  id="onboarding-end-date"
                  required
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  className="w-full min-w-0 px-3 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/30"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60"
              style={{ background: '#FF6B5F', color: '#ffffff' }}
            >
              {loading ? '⏳ Creazione...' : 'Genera Roadbook 🚀'}
            </button>
          </form>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────
  // JOIN MODE
  // ─────────────────────────────────────────
  if (mode === 'join') {
    return renderLayout(
      <>
        <div className="rounded-3xl border border-white/10 p-7 space-y-6"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('select')}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              ←
            </button>
            <div>
              <h2 className="text-xl font-extrabold" style={{ color: '#ffffff' }}>Unisciti al Viaggio</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Inserisci il codice della tua Guida</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                ID viaggio autorizzato
              </label>
              <input
                required
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Es. trip_ab12cd oppure 0000"
                className="w-full px-4 py-4 rounded-xl font-bold text-center tracking-widest text-lg outline-none transition-all border border-white/15 focus:border-slate-300 focus:ring-2 focus:ring-[#FF6B5F]/30 uppercase"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
              />
              <p className="text-xs mt-2 text-center" style={{ color: '#64748b' }}>
                Inserisci il codice di 6 caratteri oppure l'ID del viaggio (es. 0000)
              </p>
            </div>

            {/* Box UID Dispositivo per autorizzazione su Spark */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Il tuo UID Dispositivo</span>
                {myUid && (
                  <button
                    type="button"
                    onClick={copyMyUid}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-200 text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    {uidCopied ? '✓ Copiato!' : 'Copia UID'}
                  </button>
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-200 break-all bg-black/25 p-2 rounded-xl border border-white/10 select-all">
                {myUid || 'Inizializzazione sessione Firebase...'}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Su piano Firebase Spark (gratuito), invia questo UID all’Organizzatore affinché ti aggiunga da "Partecipanti al Viaggio". Poi inserisci l'ID (es. 0000) e connettiti.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60"
              style={{ background: '#FF6B5F', color: '#ffffff' }}
            >
              {loading ? '⏳ Connessione...' : 'Connettiti 🔗'}
            </button>
          </form>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────
  // ROLE MODE
  // ─────────────────────────────────────────
  if (mode === 'role') {
    // NB: colori fissi in esadecimale — il tema scuro rimappa text-white/slate-* su toni scuri.
    const roleCardStyle: React.CSSProperties = {
      background: 'rgba(30,41,59,0.9)',
      border: '1.5px solid rgba(255,255,255,0.28)'
    };
    return renderLayout(
      <div className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

        <div className="text-center">
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: '#ffffff' }}>Ruolo Dispositivo</h2>
          <p className="text-sm" style={{ color: '#cbd5e1' }}>Scegli come utilizzerai questo dispositivo durante il viaggio.</p>
        </div>

        <div className="space-y-4">
          <button
            id="onboarding-role-guida"
            onClick={() => { setTempRole('guida'); setMode('ai'); }}
            className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-125 active:scale-95 cursor-pointer shadow-lg"
            style={roleCardStyle}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🗺️</span>
              <div>
                <h3 className="font-bold text-lg leading-tight" style={{ color: '#ffffff' }}>Nunzio • Guida (Navigazione)</h3>
                <span className="text-[11px] font-semibold" style={{ color: '#34d399' }}>Master GPS • Mappe & Direzioni</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1" style={{ color: '#cbd5e1' }}>Dispositivo di riferimento per le mappe e la posizione GPS del viaggio.</p>
          </button>

          <button
            id="onboarding-role-copilota"
            onClick={() => { setTempRole('copilota'); setMode('ai'); }}
            className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-125 active:scale-95 cursor-pointer shadow-lg"
            style={roleCardStyle}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📝</span>
              <div>
                <h3 className="font-bold text-lg leading-tight" style={{ color: '#ffffff' }}>Giusy • Copilota (Organizzazione)</h3>
                <span className="text-[11px] font-semibold" style={{ color: '#fbbf24' }}>Roadbook • Note, Spese & Orari</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1" style={{ color: '#cbd5e1' }}>Gestisce le note di guida, inserisce le spese, controlla gli orari e i documenti.</p>
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // AI MODE
  // ─────────────────────────────────────────
  if (mode === 'ai') {
    return renderLayout(
      <div className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
            style={{ background: '#FF6B5F' }}>
            ✨
          </div>
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: '#ffffff' }}>Houni AI</h2>
          <p className="text-sm" style={{ color: '#cbd5e1' }}>
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
            className="w-full py-3 mt-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: '#cbd5e1' }}
          >
            Salta, crea itinerario a mano
          </button>
        </div>
      </div>
    );
  }

  return null;
}
