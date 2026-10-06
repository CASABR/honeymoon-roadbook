import React, { useState, useEffect } from 'react';
import { saveTripConfig } from '../utils/tripConfig';
import { idbClearAll } from '../storage/indexedDB';
import { auth } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import {
  isMasterTripCode,
  ensureMasterTripMembership,
  MASTER_TRIP_ID,
  MASTER_TRIP_START_DATE,
  MASTER_TRIP_END_DATE,
  MASTER_TRIP_TOTAL_DAYS
} from '../utils/masterTrip';

export default function OnboardingView({ onComplete }: { onComplete?: (config: any) => void }) {
  const [mode, setMode] = useState<'select' | 'create' | 'join' | 'role' | 'ai'>('select');
  const [tempConfig, setTempConfig] = useState<any>(null);
  const [tempRole, setTempRole] = useState<'guida' | 'copilota'>('guida');

  // Create state
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode) {
      setInviteCode(joinCode.toUpperCase());
      setMode('join');
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !endDate) return;
    setLoading(true);
    await idbClearAll();

    let ownerUid = 'local_fallback';
    if (auth) {
      try {
        const authPromise = signInAnonymously(auth);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000));
        const userCredential = await Promise.race([authPromise, timeoutPromise]) as any;
        ownerUid = userCredential.user.uid;
        console.log('Autenticato come proprietario:', ownerUid);
      } catch (err) {
        console.warn('Errore autenticazione (fallback locale):', err);
        // Non blocchiamo la creazione. Procediamo offline/fallback
      }
    }

    const id = 'trip_' + Math.random().toString(36).substring(2, 9);
    setTempConfig({ id, title, startDate, endDate, ownerUid });
    setMode('role');
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);

    try {
      let user = auth.currentUser;
      if (!user) {
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // ⚠️ TEMP dev/test: re-claim diretto del viaggio master "0000" (UID anonimo rigenerato)
      if (isMasterTripCode(inviteCode)) {
        const { data } = await ensureMasterTripMembership(user.uid);
        await idbClearAll();
        setTempConfig({
          id: MASTER_TRIP_ID,
          title: data?.title || 'Viaggio Originale',
          startDate: MASTER_TRIP_START_DATE,
          endDate: MASTER_TRIP_END_DATE,
          totalDays: MASTER_TRIP_TOTAL_DAYS,
          ownerUid: data?.ownerUid
        });
        setMode('role');
        return;
      }

      const { doc, getDoc, updateDoc, arrayUnion, increment } = await import('firebase/firestore');
      const { db } = await import('../firebase');

      const inviteRef = doc(db, 'invites', inviteCode.trim().toUpperCase());
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        alert("Codice invito non valido o non trovato.");
        setLoading(false);
        return;
      }

      const inviteData = inviteSnap.data();
      if (inviteData.expiresAt < Date.now()) {
        alert("Questo codice invito è scaduto.");
        setLoading(false);
        return;
      }

      if (inviteData.usedCount >= inviteData.maxUses) {
        alert("Questo codice invito è già stato utilizzato.");
        setLoading(false);
        return;
      }

      const tripId = inviteData.tripId;
      const tripRef = doc(db, 'trips', tripId);

      // Prima aggiorniamo l'invito per segnarlo come usato
      await updateDoc(inviteRef, {
        usedCount: increment(1)
      });

      // Poi ci aggiungiamo ai members del viaggio
      await updateDoc(tripRef, {
        members: arrayUnion(user.uid)
      });

      // Scarichiamo i metadati base del viaggio
      const tripSnap = await getDoc(tripRef);
      if (tripSnap.exists()) {
        const tData = tripSnap.data();
        await idbClearAll();
        setTempConfig({
          id: tripId,
          title: tData.title,
          startDate: tData.startDate,
          endDate: tData.endDate,
          ownerUid: tData.ownerUid
        });
        setMode('role');
      } else {
        alert("Errore: impossibile leggere i dettagli del viaggio.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Errore durante l'adesione al viaggio. Verifica la connessione e i permessi.${err?.code ? `\n(${err.code})` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishOnboarding = (aiAction?: 'gmail' | 'manual') => {
    import('../storage/storageService').then(({ storageService }) => {
      storageService.setDeviceRole(tempRole);
    });
    saveTripConfig(tempConfig);
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
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
      <div className="absolute top-[-80px] left-[-80px] w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
      <div className="absolute bottom-[-60px] right-[-60px] w-72 h-72 rounded-full opacity-15 blur-3xl"
        style={{ background: 'radial-gradient(circle, #f472b6, transparent)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-5 blur-3xl"
        style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />
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

          {/* Icon */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-3xl blur-xl opacity-60"
                style={{ background: 'linear-gradient(135deg, #818cf8, #f472b6)' }} />
              <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center text-5xl shadow-2xl"
                style={{ background: 'linear-gradient(135deg, #6366f1, #ec4899)' }}>
                🗺️
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
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff' }}
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
          <p className="text-xs text-center" style={{ color: '#64748b' }}>
            I dati sono salvati localmente e sincronizzati via cloud
          </p>
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
                className="w-full px-4 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                  Partenza
                </label>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                  Ritorno
                </label>
                <input
                  required
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-white/15 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#ffffff' }}
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
                Codice Invito
              </label>
              <input
                required
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Es. W9K2TX"
                className="w-full px-4 py-4 rounded-xl font-bold text-center tracking-widest text-lg outline-none transition-all border border-white/15 focus:border-slate-300 focus:ring-2 focus:ring-[#FF6B5F]/30 uppercase"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white', colorScheme: 'dark' }}
              />
              <p className="text-xs mt-2 text-center" style={{ color: '#64748b' }}>
                Trovi il codice nelle ⚙️ Impostazioni della Guida
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff' }}
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
    return renderLayout(
      <div className="rounded-3xl border border-white/10 p-7 space-y-6"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white mb-2">Ruolo Dispositivo</h2>
          <p className="text-sm text-slate-300">Scegli come utilizzerai questo dispositivo durante il viaggio.</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => { setTempRole('guida'); setMode('ai'); }}
            className="w-full text-left p-4 rounded-2xl border transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
            style={{ borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🗺️</span>
              <h3 className="font-bold text-white text-lg">Guida (Navigazione)</h3>
            </div>
            <p className="text-xs text-slate-400">Chi guida vede e usa principalmente le mappe GPS, il percorso e le direzioni.</p>
          </button>

          <button
            onClick={() => { setTempRole('copilota'); setMode('ai'); }}
            className="w-full text-left p-4 rounded-2xl border transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
            style={{ borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📝</span>
              <h3 className="font-bold text-white text-lg">Copilota (Organizzazione)</h3>
            </div>
            <p className="text-xs text-slate-400">Il copilota gestisce le note, inserisce le spese, controlla gli orari e i documenti.</p>
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
            style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>
            ✨
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-2">Houni AI</h2>
          <p className="text-sm text-slate-300">
            Il tuo Concierge personale. Vuoi caricare automaticamente le prenotazioni?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleFinishOnboarding('manual')}
            className="w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 border"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <span>📋</span> Incolla conferme o voucher
          </button>

          <button
            onClick={() => handleFinishOnboarding('gmail')}
            className="w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-90 cursor-pointer flex items-center justify-center gap-2"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <span>📧</span> Sincronizza con Gmail (Avanzato)
          </button>

          <button
            onClick={() => handleFinishOnboarding()}
            className="w-full py-3 mt-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Salta, crea itinerario a mano
          </button>
        </div>
      </div>
    );
  }

  return null;
}
