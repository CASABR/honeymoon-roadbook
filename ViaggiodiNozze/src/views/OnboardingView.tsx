import React, { useState, useEffect } from 'react';
import { saveTripConfig, normalizeTripConfig } from '../utils/tripConfig';
import { storageService } from '../storage/storageService';
import { auth, db } from '../firebase';
import { signInAnonymously, type User } from 'firebase/auth';
import { withTimeout } from '../utils/withTimeout';
import { persistDeviceSession } from '../utils/deviceSession';
import {
  fetchUserTripsReport,
  loginWithEmailPassword,
  loginWithGoogle,
  checkPendingRedirectResult,
  type UserTripSummary
} from '../services/accountService';
import {
  createTripInvite,
  validateTripInvite,
  redeemTripInvite
} from '../services/tripInviteService';
import { TrailItinerario, TrailCopiloti } from '../components/icons/TrailIcons';
import HounigoLogo from '../components/common/HounigoLogo';

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
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');

  // Invite state in creation flow
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [sharedInviteSuccess, setSharedInviteSuccess] = useState(false);

  // Join state & Cryptographic Invite State (P0-B)
  const [inviteCode, setInviteCode] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<{
    tripId: string;
    tripTitle?: string;
    ownerName?: string;
    expiresAt?: number;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isValidatingInvite, setIsValidatingInvite] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return Boolean(p.get('join') && p.get('token'));
  });

  // Multi-device account login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginProgressMsg, setLoginProgressMsg] = useState<string | null>(null);
  const [recoveredTrips, setRecoveredTrips] = useState<UserTripSummary[]>([]);
  const [isSearchingTrips, setIsSearchingTrips] = useState(false);
  const [tripLoadFailed, setTripLoadFailed] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [manualTripId, setManualTripId] = useState('');
  const [copilotDisplayName, setCopilotDisplayName] = useState(() => auth?.currentUser?.displayName || '');
  const [activeAuthUser, setActiveAuthUser] = useState<User | null>(() => auth?.currentUser || null);

  useEffect(() => {
    if (!auth) return;
    const unsub = auth.onAuthStateChanged((u: any) => {
      setActiveAuthUser(u);
      if (u?.displayName && !ownerName) {
        setOwnerName(u.displayName);
      }
    });
    return () => unsub();
  }, []);

  const executeJoin = async (codeToJoin: string, tokenOverride?: string | null, nameOverride?: string) => {
    const codeClean = codeToJoin.trim();
    if (!codeClean) return;
    const token = tokenOverride !== undefined ? tokenOverride : inviteToken;
    const cleanCopilotName = (nameOverride !== undefined ? nameOverride : copilotDisplayName).trim();

    setLoading(true);
    setInviteError(null);

    try {
      if (!auth) {
        throw new Error('Autenticazione Firebase non inizializzata.');
      }

      if (typeof (auth as any).authStateReady === 'function') {
        await (auth as any).authStateReady();
      }

      let user = auth.currentUser;
      if (!user) {
        const userCredential = await withTimeout(signInAnonymously(auth), 8000, undefined);
        if (!userCredential) {
          throw new Error('Autenticazione non disponibile.');
        }
        user = userCredential.user;
      }

      // 1. Controllo immediato: Se l'utente è GIÀ membro autorizzato del viaggio, entra direttamente senza riutilizzare il token!
      if (db && codeClean !== '0000') {
        const { doc, getDoc } = await import('firebase/firestore');
        const tripSnap = await getDoc(doc(db, 'trips', codeClean)).catch(() => null);
        if (tripSnap && tripSnap.exists()) {
          const directTripData = tripSnap.data();
          const members = Array.isArray(directTripData.members) ? directTripData.members : [];
          const isOwner = directTripData.ownerUid === user.uid || directTripData.ownerId === user.uid;
          const isAlreadyMember = members.includes(user.uid) || isOwner;

          if (isAlreadyMember) {
            const config = normalizeTripConfig({
              id: codeClean,
              title: directTripData.title || 'Il nostro viaggio',
              startDate: directTripData.startDate || '',
              endDate: directTripData.endDate || '',
              ownerUid: directTripData.ownerUid || directTripData.ownerId || '',
              ownerName: directTripData.ownerName || ''
            });

            const role = isOwner ? 'guida' : 'copilota';
            setTempConfig(config);
            setTempRole(role);
            handleFinishOnboarding(undefined, config, role);
            return;
          }
        }
      }

      // Se c'è un token crittografico d'invito valido, riscatta l'invito atomico
      if (token && codeClean !== '0000') {
        const redeemRes = await redeemTripInvite(codeClean, token, user, cleanCopilotName);
        if (!redeemRes.success) {
          throw new Error(redeemRes.error || 'Riscatto invito non riuscito.');
        }

        const { doc, getDoc } = await import('firebase/firestore');
        const tripSnap = await getDoc(doc(db, 'trips', codeClean));
        const directTripData = tripSnap.data() || {};

        const config = normalizeTripConfig({
          id: codeClean,
          title: directTripData.title || 'Il nostro viaggio',
          startDate: directTripData.startDate || '',
          endDate: directTripData.endDate || '',
          ownerUid: directTripData.ownerUid || directTripData.ownerId || '',
          ownerName: directTripData.ownerName || ''
        });

        setTempConfig(config);
        setTempRole('copilota');
        handleFinishOnboarding(undefined, config, 'copilota');
        return;
      }

      // Nessun token fornito: verifica se l'utente autenticato è GIÀ membro autorizzato
      const { doc, getDoc } = await import('firebase/firestore');
      const tripSnap = await getDoc(doc(db, 'trips', codeClean));
      if (!tripSnap.exists()) {
        throw new Error(`Nessun viaggio trovato con codice "${codeClean}".`);
      }
      const directTripData = tripSnap.data();
      const members = Array.isArray(directTripData.members) ? directTripData.members : [];
      const isAlreadyMember = members.includes(user.uid) || directTripData.ownerUid === user.uid;

      if (!isAlreadyMember) {
        throw new Error(
          'Per unirti a questo viaggio è necessario un link d’invito fornito dall’organizzatore. Chiedi all’organizzatore di condividere il link d’invito protetto.'
        );
      }

      const config = normalizeTripConfig({
        id: codeClean,
        title: directTripData.title || 'Il nostro viaggio',
        startDate: directTripData.startDate || '',
        endDate: directTripData.endDate || '',
        ownerUid: directTripData.ownerUid || '',
        ownerName: directTripData.ownerName || ''
      });

      setTempConfig(config);
      const assignedRole = (directTripData.ownerUid === user.uid) ? 'guida' : 'copilota';
      setTempRole(assignedRole);
      handleFinishOnboarding(undefined, config, assignedRole);
    } catch (err: any) {
      console.error('[Onboarding] Errore adesione viaggio:', err);
      setInviteError(err?.message || 'Impossibile verificare il viaggio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Controllo eventuale esito di redirect OAuth Google (PWA Standalone o Safari)
    checkPendingRedirectResult().then(async (redirectRes) => {
      if (redirectRes.success && redirectRes.user) {
        setMode('account_login');
        await inspectUserTrips(redirectRes.user);
      } else if (redirectRes.error) {
        setLoginError(redirectRes.error);
      }
    }).catch(() => {});

    // 2. Lettura parametri invito URL o ripristino da sessionStorage per flussi OAuth
    const urlParams = new URLSearchParams(window.location.search);
    let joinCode = urlParams.get('join');
    let tokenParam = urlParams.get('token');
    let roleParam = urlParams.get('role');

    if (joinCode) {
      try {
        sessionStorage.setItem('houni_pending_invite', JSON.stringify({
          joinCode,
          tokenParam: tokenParam || null,
          roleParam: roleParam || null
        }));
      } catch {}
    } else if (typeof sessionStorage !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('houni_pending_invite');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.joinCode) {
            joinCode = parsed.joinCode;
            tokenParam = parsed.tokenParam || null;
            roleParam = parsed.roleParam || null;
          }
        }
      } catch {}
    }

    if (roleParam === 'copilota' || roleParam === 'guida' || roleParam === 'viewer') {
      setTempRole(roleParam as any);
      storageService.setDeviceRole(roleParam as any);
    }

    if (joinCode) {
      setInviteCode(joinCode);
      setMode('join');

      if (tokenParam) {
        setInviteToken(tokenParam);
        setIsValidatingInvite(true);
        validateTripInvite(joinCode, tokenParam).then(async (res) => {
          if (res.valid) {
            setInviteDetails({
              tripId: joinCode,
              tripTitle: res.tripTitle,
              ownerName: res.ownerName,
              expiresAt: res.expiresAt
            });
            if (res.isAlreadyMember) {
              await executeJoin(joinCode, tokenParam);
            }
          } else {
            setInviteError(res.error || 'Invito non valido o scaduto.');
          }
        }).catch(err => {
          setInviteError(err?.message || 'Errore convalida invito.');
        }).finally(() => {
          setIsValidatingInvite(false);
        });
      }
    }

    if (urlParams.get('join') || urlParams.get('role') || urlParams.get('token')) {
      // Pulisce l'URL mantenendo i dati nello stato del componente e in sessionStorage
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Genera URL di invito per il viaggio appena creato
  const getCreatedTripInviteUrl = (): string => {
    if (createdInviteUrl) return createdInviteUrl;
    if (typeof window === 'undefined') return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const targetId = tempConfig?.id || '';
    return `${baseUrl}?join=${encodeURIComponent(targetId)}`;
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
    let userObj: any = null;
    if (auth) {
      if (typeof (auth as any).authStateReady === 'function') {
        await (auth as any).authStateReady();
      }
      if (auth.currentUser) {
        ownerUid = auth.currentUser.uid;
        userObj = auth.currentUser;
      } else {
        try {
          const authPromise = signInAnonymously(auth);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 4000));
          const userCredential = (await Promise.race([authPromise, timeoutPromise])) as any;
          ownerUid = userCredential.user.uid;
          userObj = userCredential.user;
        } catch (err) {
          console.warn('Errore autenticazione (fallback locale):', err);
          if (auth.currentUser) {
            ownerUid = auth.currentUser.uid;
            userObj = auth.currentUser;
          }
        }
      }
    }

    const id = 'trip_' + Math.random().toString(36).substring(2, 9);
    const newConfig = { id, title: cleanTitle, startDate, endDate, ownerUid, ownerName: cleanOwnerName };
    setTempConfig(newConfig);
    setTempRole('guida');

    // Scrittura immediata su Firestore per rendere il viaggio e l'invito istantaneamente disponibili sul cloud
    if (db && ownerUid && ownerUid !== 'local_fallback') {
      try {
        const { doc, writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        const tripRef = doc(db, 'trips', id);
        const memberRef = doc(db, 'trips', id, 'members', ownerUid);

        batch.set(tripRef, {
          id,
          title: cleanTitle,
          startDate,
          endDate,
          ownerUid,
          ownerName: cleanOwnerName,
          members: [ownerUid],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        batch.set(memberRef, {
          uid: ownerUid,
          role: 'owner',
          name: cleanOwnerName,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        await batch.commit();

        try {
          const invRes = await createTripInvite(id);
          setCreatedInviteUrl(invRes.inviteLink);
        } catch (invErr) {
          console.warn('[Onboarding] Creazione invito crittografico iniziale:', invErr);
        }

        const { recordUserAccess } = await import('../services/userAccessService');
        if (userObj) {
          await recordUserAccess(userObj, id).catch(() => {});
        }
        const { addKnownTripId } = await import('../utils/tripConfig');
        addKnownTripId(id);
      } catch (cloudErr: any) {
        console.error('[Onboarding] Errore salvataggio immediato viaggio su Firestore:', cloudErr);
        setLoading(false);
        alert(`Impossibile salvare il viaggio su Firestore: ${cloudErr?.message || 'Errore di connessione o autorizzazione.'}`);
        return;
      }
    } else {
      const { addKnownTripId } = await import('../utils/tripConfig');
      addKnownTripId(id);
    }

    // Requisito B: Passa subito al passaggio di scelta invito facoltativo
    setMode('invite_choice');
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    await executeJoin(inviteCode.trim());
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
    setMode('account_login');
    await inspectUserTrips(res.user);
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setLoading(true);
    setLoginProgressMsg('Connessione al servizio Google…');
    try {
      const res = await loginWithGoogle((stage) => setLoginProgressMsg(stage));
      if (!res.success || !res.user) {
        if (res.code === 'auth/redirect-started') {
          setLoading(true);
          setLoginProgressMsg('Reindirizzamento verso Google…');
          return;
        }
        setLoading(false);
        setLoginProgressMsg(null);
        setLoginError(res.error || 'Accesso Google non completato.');
        return;
      }
      setLoginProgressMsg('Caricamento viaggi autorizzati…');
      setLoading(false);
      setMode('account_login');
      await inspectUserTrips(res.user);
    } finally {
      setLoading(false);
      setLoginProgressMsg(null);
    }
  };

  const inspectUserTrips = async (user: User) => {
    setAuthenticatedUser(user);
    setIsSearchingTrips(true);
    setTripLoadFailed(false);
    try {
      const report = await fetchUserTripsReport(user.uid);
      setRecoveredTrips(report.trips);
      if (report.failedIndexedTripIds.length > 0) {
        setLoginError('Alcuni viaggi associati non sono stati caricati. Verifica la connessione e riprova.');
        setTripLoadFailed(report.trips.length === 0);
      }
    } catch (err) {
      console.warn('[Onboarding] Errore recupero viaggi utente:', err);
      setRecoveredTrips([]);
      setTripLoadFailed(true);
      setLoginError((err as Error)?.message || 'Impossibile caricare l’elenco dei viaggi. Riprova.');
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
        isOwner,
        role: isOwner ? 'owner' : 'copilota'
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

    import('../utils/tripConfig').then(({ addKnownTripId }) => {
      addKnownTripId(targetTripId);
    });

    import('../storage/storageService').then(({ storageService }) => {
      storageService.setDeviceRole(finalRole);
      storageService.ensureRefuels().catch(console.error);
    });
    saveTripConfig(finalConfig);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
    }
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem('houni_pending_invite'); } catch {}
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
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans"
      style={{ background: '#F8F7F3' }}
    >
      <div
        className="absolute top-[-120px] left-[-100px] w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FF6B5F, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-100px] right-[-80px] w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #172033, transparent 70%)' }}
      />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );

  // ─────────────────────────────────────────
  // ─────────────────────────────────────────
  // 1. SELECT MODE (Schermata Principale Editoriale Light)
  // ─────────────────────────────────────────
  if (mode === 'select') {
    return renderLayout(
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 p-6 sm:p-7 text-center space-y-6 relative overflow-hidden font-sans">
        {/* Motivo grafico editoriale Waypoint & Route Path */}
        <div className="relative pt-2 pb-1">
          {/* Waypoint Coordinates & Expedition Tag */}
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest uppercase text-slate-400 font-mono px-1 mb-3">
            <span className="flex items-center gap-1.5 text-[#FF6B5F]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F] animate-pulse" />
              Waypoint 01
            </span>
            <span className="text-slate-400">35°41′N • 139°46′E</span>
          </div>

          {/* SVG Trail Path Geometric Motif */}
          <div className="w-full h-8 flex items-center justify-center my-1 pointer-events-none opacity-85">
            <svg viewBox="0 0 280 28" fill="none" className="w-full max-w-[260px] h-7">
              {/* Curved Trail Line */}
              <path
                d="M 10 14 Q 70 2, 140 14 T 270 14"
                stroke="#172033"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                strokeOpacity="0.25"
              />
              <path
                d="M 10 14 Q 70 2, 140 14"
                stroke="#FF6B5F"
                strokeWidth="2"
                strokeLinecap="round"
                strokeOpacity="0.7"
              />
              {/* Waypoint Markers */}
              <circle cx="10" cy="14" r="4" fill="#FF6B5F" />
              <circle cx="10" cy="14" r="7" stroke="#FF6B5F" strokeWidth="1" strokeOpacity="0.3" />
              <circle cx="140" cy="14" r="3.5" fill="#172033" stroke="#F8F7F3" strokeWidth="1.5" />
              <circle cx="270" cy="14" r="4.5" fill="#172033" />
              <circle cx="270" cy="14" r="8" stroke="#172033" strokeWidth="1" strokeOpacity="0.25" />
            </svg>
          </div>

          {/* Logo Ufficiale Completo (Lettering Navy) */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <HounigoLogo variant="onLight" size="md" className="mx-auto" />
            <h1 className="font-brand-title font-extrabold text-lg sm:text-xl text-[#172033] tracking-tight leading-snug mt-1">
              Il Roadbook digitale di nozze & avventura
            </h1>
            <p className="font-brand-body text-xs text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
              Itinerario condiviso, tappe offline e sincronizzazione in tempo reale per viaggiatori e copiloti.
            </p>
          </div>
        </div>

        {/* 3 AZIONI PRINCIPALI (BRAND IDENTITY INSTAGRAM) */}
        <div className="space-y-3 pt-0">
          {/* 1. CREA UN VIAGGIO (CORAL) */}
          <button
            type="button"
            onClick={() => setMode('create')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-[#FF6B5F]/20 flex items-center justify-between text-left group"
            style={{ background: '#FF6B5F', color: '#ffffff' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-2xs">
                <TrailItinerario size={20} active />
              </div>
              <div>
                <div className="font-extrabold text-base leading-tight font-brand-title">Crea un viaggio</div>
                <div className="text-xs text-white/90 font-normal mt-0.5">Imposta date, tappe e itinerario</div>
              </div>
            </div>
            <span className="text-white text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
          </button>
          <p className="px-2 text-center text-[11px] leading-relaxed text-slate-500">
            Con lo stesso account puoi creare e ritrovare più viaggi.
          </p>

          {/* 2. CONTINUA CON GOOGLE / ACCEDI (NAVY) */}
          <button
            type="button"
            onClick={activeAuthUser && !activeAuthUser.isAnonymous ? () => inspectUserTrips(activeAuthUser) : handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 cursor-pointer shadow-md shadow-[#172033]/15 border flex items-center justify-between text-left group disabled:opacity-75 disabled:pointer-events-none"
            style={{ background: '#172033', color: '#ffffff', borderColor: '#172033' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-base">🌐</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-base leading-tight font-brand-title truncate">
                  {loading
                    ? (loginProgressMsg || 'Accesso in corso…')
                    : activeAuthUser && !activeAuthUser.isAnonymous
                    ? `I Tuoi Viaggi (${activeAuthUser.displayName || activeAuthUser.email})`
                    : 'Continua con Google / Accedi'}
                </div>
                <div className="text-xs text-slate-300 font-normal mt-0.5 truncate">
                  {loading
                    ? 'Attendi la verifica delle credenziali'
                    : activeAuthUser && !activeAuthUser.isAnonymous
                    ? 'Visualizza i viaggi associati a questo account'
                    : 'Sincronizza e ripristina i tuoi viaggi'}
                </div>
              </div>
            </div>
            <span className="text-slate-300 text-base font-bold group-hover:translate-x-1 transition-transform shrink-0 ml-2">→</span>
          </button>

          {/* Banner trasparente cambio account Google se già autenticato */}
          {activeAuthUser && !activeAuthUser.isAnonymous && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-100 text-[11px] text-slate-600">
              <span className="truncate">Connesso: <strong>{activeAuthUser.email || activeAuthUser.displayName}</strong></span>
              <button
                type="button"
                onClick={async () => {
                  if (auth) await auth.signOut();
                  setActiveAuthUser(null);
                }}
                className="text-rose-500 hover:text-rose-700 font-bold underline ml-2 shrink-0 cursor-pointer"
              >
                Disconnetti
              </button>
            </div>
          )}

          {/* 3. PARTECIPA A UN VIAGGIO (CLOUD) */}
          <button
            type="button"
            onClick={() => setMode('join')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 cursor-pointer border border-slate-200/90 hover:border-slate-300 bg-[#F8F7F3] flex items-center justify-between text-left group shadow-xs"
            style={{ color: '#172033' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white text-[#172033] flex items-center justify-center shrink-0 border border-slate-200 shadow-2xs">
                <TrailCopiloti size={18} active />
              </div>
              <div>
                <div className="font-extrabold text-base leading-tight font-brand-title">Partecipa a un viaggio</div>
                <div className="text-xs text-slate-500 font-normal mt-0.5">Entra come copilota con link o codice</div>
              </div>
            </div>
            <span className="text-slate-400 text-base font-bold group-hover:translate-x-1 transition-transform">→</span>
          </button>

          {/* Visualizzazione Errore Accesso Esplicito con Riprova */}
          {loginError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed text-left flex items-start gap-2.5 shadow-2xs">
              <span className="shrink-0 text-base">⚠️</span>
              <div className="flex-1 space-y-1">
                <p>{loginError}</p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setLoginError(null); handleGoogleLogin(); }}
                    className="text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    Riprova con Google ↻
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLoginError(null); setMode('account_login'); }}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Accedi con Email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Link discreto ad accesso email tradizionale */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => setMode('account_login')}
              className="text-xs font-medium text-slate-500 hover:text-[#172033] transition-colors underline cursor-pointer"
            >
              Hai già un account? Accedi con email o ID
            </button>
          </div>
        </div>

        <p className="text-[11px] text-center text-slate-400 font-medium">
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
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-[#172033] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-[#172033] font-brand-title">
              Nuovo Viaggio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Imposta le date per generare il calendario
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {activeAuthUser && !activeAuthUser.isAnonymous ? (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
              <div className="min-w-0">
                <span className="font-bold block text-[10px] uppercase tracking-wider text-emerald-600">Account Organizzatore Connesso:</span>
                <span className="text-xs truncate block font-semibold text-emerald-800">
                  {activeAuthUser.email || activeAuthUser.displayName}
                </span>
              </div>
              <span className="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-full shrink-0 ml-2">
                Google
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <span className="font-bold block text-[10px] uppercase tracking-wider text-slate-400">Accesso Rapido Dispositivo:</span>
              <span className="text-[11px] text-slate-500">
                Il viaggio sarà creato con l'identità di questo browser. Potrai associare Google in seguito.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600">
              Nome del Viaggio *
            </label>
            <input
              required
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Giappone 2026 🌸"
              className="w-full px-4 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600">
              Nome dell'Organizzatore *
            </label>
            <input
              required
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full px-4 py-3 rounded-xl font-medium text-sm outline-none transition-all border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F] focus:ring-2 focus:ring-[#FF6B5F]/20"
            />
            <p className="text-[11px] mt-1.5 leading-relaxed text-slate-400">
              Identifica il creatore con pieni poteri di gestione e modifica.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600">
                Partenza *
              </label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F]"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600">
                Rientro *
              </label>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F]"
                style={{ colorScheme: 'light' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-2xl font-bold text-base transition-all active:scale-[0.98] hover:opacity-95 cursor-pointer disabled:opacity-60 shadow-md shadow-[#FF6B5F]/20"
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
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-3xl shadow-md text-white" style={{ background: '#FF6B5F' }}>
          🎉
        </div>

        <div>
          <h2 className="text-2xl font-black text-[#172033] font-brand-title">Viaggio Creato!</h2>
          <p className="text-xs font-semibold mt-1" style={{ color: '#FF6B5F' }}>
            {tempConfig?.title}
          </p>
          <p className="text-xs mt-2 text-slate-500">
            Vuoi invitare subito un Copilota o iniziare subito ad esplorare?
          </p>
        </div>

        <div className="space-y-3.5 pt-1 text-left">
          {/* Opzione 1: Invita un Copilota */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8F7F3] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🤝</span>
              <div>
                <h3 className="font-bold text-sm text-[#172033]">Invita un Copilota</h3>
                <p className="text-[11px] text-slate-500">Condividi il link d'accesso al viaggio</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleShareCreatedInviteUrl}
                className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-xs text-white"
                style={{ background: '#FF6B5F' }}
              >
                <span>📤</span>
                <span>{sharedInviteSuccess ? '✓ Condiviso!' : 'Condividi Link'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCreatedInviteUrl}
                className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 bg-white hover:bg-slate-100 text-[#172033] border border-slate-200 transition-all active:scale-[0.98] cursor-pointer"
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
              if (tempConfig?.id === '0000') {
                setMode('role');
              } else {
                setMode('ai');
              }
            }}
            className="w-full p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⏳</span>
                <div>
                  <h3 className="font-bold text-sm text-[#172033]">Lo farò più tardi</h3>
                  <p className="text-[11px] text-slate-500">Entra subito nel viaggio e invita in seguito</p>
                </div>
              </div>
              <span className="text-slate-400 text-lg">→</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 pl-8">
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
          className="w-full py-3.5 rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] hover:opacity-95 cursor-pointer shadow-md text-white"
          style={{ background: '#FF6B5F' }}
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
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-[#172033] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-[#172033] font-brand-title">Accedi al tuo Account</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sincronizza lo stesso viaggio su smartphone e PC</p>
          </div>
        </div>

        {loginError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed">
            ⚠️ {loginError}
          </div>
        )}

        {/* Elenco Viaggi Riconosciuti dopo Login */}
        {isSearchingTrips ? (
          <div className="p-4 rounded-2xl bg-[#F8F7F3] border border-slate-200 text-center text-xs font-semibold text-slate-600 animate-pulse">
            ⏳ Ricerca viaggi sincronizzati in corso…
          </div>
        ) : recoveredTrips.length > 0 ? (
          <div className="space-y-4">
            {recoveredTrips.length === 1 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Accesso Rapido al Tuo Viaggio
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    recoveredTrips[0].isOwner ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {recoveredTrips[0].isOwner ? '👑 Organizzatore' : '🤝 Copilota'}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#172033] font-brand-title">{recoveredTrips[0].title}</h3>
                  {recoveredTrips[0].startDate && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      📅 {recoveredTrips[0].startDate} {recoveredTrips[0].endDate ? `– ${recoveredTrips[0].endDate}` : ''}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => selectRecoveredTrip(recoveredTrips[0])}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Entra nel Viaggio</span>
                  <span>→</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  I tuoi viaggi sincronizzati ({recoveredTrips.length}):
                </p>

                {/* Organizzatore */}
                {recoveredTrips.filter(t => t.isOwner).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider block">
                      👑 Organizzatore
                    </span>
                    {recoveredTrips.filter(t => t.isOwner).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectRecoveredTrip(t)}
                        className="w-full p-3.5 rounded-2xl bg-[#F8F7F3] hover:bg-slate-100 border border-slate-200 text-left transition-all active:scale-[0.98] cursor-pointer space-y-1 block shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#172033] text-sm truncate">{t.title}</span>
                          {t.isLastUsed && (
                            <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                              Ultimo usato
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          {t.startDate && <span>📅 {t.startDate}</span>}
                          <span className="font-mono text-slate-400">ID: {t.id}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Co-pilota */}
                {recoveredTrips.filter(t => !t.isOwner).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider block">
                      🤝 Co-pilota
                    </span>
                    {recoveredTrips.filter(t => !t.isOwner).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectRecoveredTrip(t)}
                        className="w-full p-3.5 rounded-2xl bg-[#F8F7F3] hover:bg-slate-100 border border-slate-200 text-left transition-all active:scale-[0.98] cursor-pointer space-y-1 block shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#172033] text-sm truncate">{t.title}</span>
                          {t.isLastUsed && (
                            <span className="text-[9px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                              Ultimo usato
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          {t.startDate && <span>📅 {t.startDate}</span>}
                          <span className="font-mono text-slate-400">ID: {t.id}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Avviso informativo per viaggi condivisi / copilota (es. Giappone) */}
            <div className="p-3.5 rounded-2xl bg-[#F8F7F3] border border-slate-200/90 text-left text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#172033] font-bold text-[11px] uppercase tracking-wider">
                <span>💡</span>
                <span>Cerchi un viaggio condiviso come copilota (es. Giappone)?</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                I viaggi a cui partecipi come copilota compaiono automaticamente non appena apri e riscatti il link d'invito generato dall'organizzatore con questo account.
              </p>
              <button
                type="button"
                onClick={() => setMode('join')}
                className="text-[11px] font-bold text-[#FF6B5F] hover:underline cursor-pointer block pt-0.5"
              >
                Partecipa con codice o link d'invito →
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMode('create')}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-[#172033] transition-colors cursor-pointer"
            >
              + Crea un altro viaggio con questo account
            </button>
          </div>
        ) : authenticatedUser && tripLoadFailed ? (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="font-bold text-amber-800 dark:text-amber-200">Non è stato possibile verificare l’elenco dei viaggi.</p>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300">Nessun viaggio è stato dichiarato assente: il caricamento non è completo.</p>
            <button type="button" onClick={() => inspectUserTrips(authenticatedUser)} className="min-h-10 rounded-xl bg-[#172033] px-4 font-bold text-white dark:bg-white dark:text-[#172033]">Riprova</button>
          </div>
        ) : authenticatedUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5 text-left">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <span>✓</span>
                <span>Accesso completato</span>
              </div>
              <p className="text-slate-800">
                Connesso come: <strong className="text-[#172033]">{authenticatedUser.email || authenticatedUser.uid}</strong>
              </p>
              <p className="text-[11px] text-slate-500">
                Nessun viaggio trovato nella cronologia di questo account.
              </p>
            </div>

            {/* Invito in Sospeso Riconosciuto */}
            {inviteCode && (
              <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                    🤝 Invito in Sospeso
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">ID: {inviteCode}</span>
                </div>
                <p className="text-xs text-indigo-950">
                  {inviteDetails?.tripTitle ? `Unisciti al viaggio "${inviteDetails.tripTitle}"` : `Unisciti al viaggio ${inviteCode}`} con questo account!
                </p>
                <button
                  type="button"
                  onClick={() => executeJoin(inviteCode, inviteToken)}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-[#FF6B5F] hover:bg-[#e85c50] text-white transition-all shadow-xs cursor-pointer"
                >
                  {loading ? 'Partecipazione in corso…' : 'Accetta Invito & Entra nel Viaggio →'}
                </button>
              </div>
            )}

            {/* Azioni dirette ed utili */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setMode('create')}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 cursor-pointer text-white"
                style={{ background: '#FF6B5F' }}
              >
                <span>✨</span>
                <span>Crea il tuo primo viaggio</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('join')}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs border border-slate-200 bg-[#F8F7F3] text-[#172033] hover:bg-slate-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🤝</span>
                <span>Partecipa con un codice viaggio</span>
              </button>
            </div>

            <form onSubmit={handleManualTripConnect} className="pt-2 border-t border-slate-200 space-y-2 text-left">
              <label className="block text-[11px] font-semibold text-slate-500">
                Oppure inserisci un ID viaggio manuale:
              </label>
              <div className="flex gap-2">
                <input
                  required
                  type="text"
                  value={manualTripId}
                  onChange={(e) => setManualTripId(e.target.value)}
                  placeholder="Es. 0000 oppure trip_xxx"
                  className="flex-1 px-3 py-2 rounded-xl text-xs outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl font-bold text-xs bg-[#172033] text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? '…' : 'Collega'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Continua con Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-[#172033] text-white hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
            >
              <span className="text-base">🌐</span>
              <span>{loading ? 'Accesso in corso…' : 'Continua con Google'}</span>
            </button>

            <div className="relative flex items-center justify-center pt-1 pb-1">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[10px] uppercase font-bold text-slate-400 absolute">
                oppure con email
              </span>
            </div>

            {/* Form Email / Password */}
            <form onSubmit={handleEmailLogin} className="space-y-3 text-left">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="nome@esempio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer shadow-md text-white"
                style={{ background: '#FF6B5F' }}
              >
                {loading ? 'Accesso in corso…' : 'Accedi con Email e Password ✉️'}
              </button>
            </form>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              💡 Su iPhone o se hai installato l'app sulla schermata Home, puoi accedere direttamente con Email e Password.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 5. JOIN MODE (Light)
  // ─────────────────────────────────────────
  if (mode === 'join') {
    return renderLayout(
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-[#172033] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-[#172033] font-brand-title">Unisciti a un Viaggio</h2>
            <p className="text-xs text-slate-500 mt-0.5">Inserisci l'ID del viaggio o accetta un invito</p>
          </div>
        </div>

        {isValidatingInvite ? (
          <div className="py-10 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center animate-pulse text-2xl">
              🤝
            </div>
            <div>
              <h3 className="text-base font-bold text-[#172033]">Verifica invito in corso…</h3>
              <p className="text-xs text-slate-500 mt-1">Connessione sicura al viaggio...</p>
            </div>
          </div>
        ) : inviteDetails ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-2">
              <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs uppercase tracking-wider">
                <span>🤝</span>
                <span>Invito Co-pilota Valido</span>
              </div>
              <h3 className="text-lg font-black text-[#172033] font-brand-title">{inviteDetails.tripTitle || 'Il nostro viaggio'}</h3>
              {inviteDetails.ownerName && (
                <p className="text-xs text-slate-600">
                  Organizzato da: <strong className="text-[#172033]">{inviteDetails.ownerName}</strong>
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Sei stato invitato come Co-pilota. Potrai consultare il roadbook, aggiornare spese e note, e seguire la navigazione.
              </p>
            </div>

            {inviteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed">
                ⚠️ {inviteError}
              </div>
            )}

            <div className="text-left space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Il tuo nome da mostrare nel viaggio
              </label>
              <input
                type="text"
                value={copilotDisplayName}
                onChange={(e) => setCopilotDisplayName(e.target.value)}
                placeholder="Es. Marco, Sara, etc."
                maxLength={40}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F] transition-colors"
              />
              <p className="text-[10px] text-slate-400">
                Questo nome sarà visibile all'organizzatore del viaggio e nelle tappe o spese condivise.
              </p>
            </div>

            {(!auth?.currentUser || auth?.currentUser.isAnonymous) && (
              <div className="pt-0.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await loginWithGoogle();
                      if (res.success && res.user) {
                        setCopilotDisplayName((prev: string) => prev || res.user?.displayName || '');
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-bold text-slate-700 flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Accedi con Google per legare l'invito al tuo account</span>
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={() => executeJoin(inviteDetails.tripId, inviteToken, copilotDisplayName)}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] hover:opacity-95 cursor-pointer disabled:opacity-60 shadow-md text-white"
              style={{ background: '#FF6B5F' }}
            >
              {loading ? '⏳ Accesso in corso…' : 'Accetta Invito e Inizia 🚀'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="space-y-5">
            {inviteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed">
                ⚠️ {inviteError}
              </div>
            )}

            <div className="text-left">
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600">
                Codice o ID del Viaggio
              </label>
              <input
                required
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Es. trip_ab12cd oppure 0000"
                className="w-full px-4 py-3.5 rounded-xl font-bold text-center tracking-widest text-base outline-none transition-all border border-slate-200 bg-[#F8F7F3] text-[#172033] focus:border-[#FF6B5F] uppercase"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F8F7F3] border border-slate-200 space-y-1.5 text-xs text-left">
              <span className="font-bold text-[#172033] block">💡 Come funziona l'accesso:</span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Per motivi di sicurezza, per i nuovi viaggi è necessario aprire il <strong>link di invito completo</strong> condiviso dall'organizzatore. Il solo codice ID è utilizzabile solo se sei già stato autorizzato.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] hover:opacity-95 cursor-pointer disabled:opacity-60 shadow-md text-white"
              style={{ background: '#FF6B5F' }}
            >
              {loading ? '⏳ Connessione…' : 'Connettiti al Viaggio 🔗'}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 6. ROLE MODE (Light)
  // ─────────────────────────────────────────
  if (mode === 'role') {
    const isTrip0000 = tempConfig?.id === '0000';
    const guidaTitle = isTrip0000
      ? 'Guida (Navigazione)'
      : `${tempConfig?.ownerName || 'Organizzatore'} • Guida (Master GPS)`;
    const copilotaTitle = isTrip0000
      ? 'Copilota (Organizzazione)'
      : 'Copilota (Roadbook & Spese)';

    return renderLayout(
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold mb-1 text-[#172033] font-brand-title">Ruolo Dispositivo</h2>
          <p className="text-sm text-slate-500">
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
            className="w-full text-left p-4 rounded-2xl transition-all hover:border-[#FF6B5F] active:scale-[0.98] cursor-pointer shadow-sm border border-slate-200 bg-[#F8F7F3]"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🗺️</span>
              <div>
                <h3 className="font-bold text-base leading-tight text-[#172033]">{guidaTitle}</h3>
                <span className="text-[11px] font-semibold text-emerald-600">Master GPS • Mappe & Direzioni</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1 text-slate-500">
              Dispositivo di riferimento per le mappe e la posizione GPS del viaggio.
            </p>
          </button>

          <button
            id="onboarding-role-copilota"
            onClick={() => {
              setTempRole('copilota');
              setMode('ai');
            }}
            className="w-full text-left p-4 rounded-2xl transition-all hover:border-[#FF6B5F] active:scale-[0.98] cursor-pointer shadow-sm border border-slate-200 bg-[#F8F7F3]"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📝</span>
              <div>
                <h3 className="font-bold text-base leading-tight text-[#172033]">{copilotaTitle}</h3>
                <span className="text-[11px] font-semibold text-amber-600">Roadbook • Note, Spese & Orari</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed mt-1 text-slate-500">
              Gestisce le note di viaggio, inserisce le spese, controlla gli orari e i documenti.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 7. AI MODE (Light)
  // ─────────────────────────────────────────
  if (mode === 'ai') {
    return renderLayout(
      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 p-6 sm:p-7 space-y-6">
        <div className="text-center">
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center text-3xl shadow-md text-white"
            style={{ background: '#FF6B5F' }}
          >
            ✨
          </div>
          <h2 className="text-2xl font-extrabold mb-1 text-[#172033] font-brand-title">Houni AI</h2>
          <p className="text-sm text-slate-500">
            Il tuo Concierge personale. Vuoi caricare automaticamente le prenotazioni?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleFinishOnboarding('manual')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] hover:opacity-95 cursor-pointer flex items-center justify-center gap-2 shadow-sm text-white"
            style={{ background: '#FF6B5F' }}
          >
            <span>📋</span> Incolla conferme o voucher
          </button>

          <button
            onClick={() => handleFinishOnboarding('gmail')}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-2 text-white"
            style={{ background: '#172033' }}
          >
            <span>📧</span> Sincronizza con Gmail (Avanzato)
          </button>

          <button
            onClick={() => handleFinishOnboarding()}
            className="w-full py-2.5 mt-1 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 cursor-pointer text-slate-400"
          >
            Salta, crea itinerario a mano
          </button>
        </div>
      </div>
    );
  }

  return null;
}
