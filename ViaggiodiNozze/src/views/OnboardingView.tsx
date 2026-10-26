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
  checkPendingRedirectResult,
  verifyTripOwnership,
  type UserTripSummary
} from '../services/accountService';
import {
  createTripInvite,
  validateTripInvite,
  redeemTripInvite
} from '../services/tripInviteService';
import { TrailItinerario, TrailToolkit, TrailCopiloti } from '../components/icons/TrailIcons';

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
  const [recoveredTrips, setRecoveredTrips] = useState<UserTripSummary[]>([]);
  const [isSearchingTrips, setIsSearchingTrips] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [manualTripId, setManualTripId] = useState('');
  const [copilotDisplayName, setCopilotDisplayName] = useState(() => auth?.currentUser?.displayName || '');

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

      // Fallback speciale per viaggio originale legacy 0000
      if (codeClean === '0000') {
        const { doc, getDoc } = await import('firebase/firestore');
        let directTripData: any = null;
        if (db && user) {
          try {
            const tripSnap = await getDoc(doc(db, 'trips', '0000'));
            if (tripSnap.exists()) directTripData = tripSnap.data();
          } catch {}
        }
        const legacyCfg = normalizeTripConfig({
          id: '0000',
          title: directTripData?.title || 'Viaggio Originale',
          startDate: directTripData?.startDate || '2026-11-28',
          endDate: directTripData?.endDate || '2027-01-10',
          ownerUid: directTripData?.ownerUid || user.uid,
          ownerName: directTripData?.ownerName || 'nunzio'
        });
        setTempConfig(legacyCfg);
        setTempRole('guida');
        handleFinishOnboarding(undefined, legacyCfg, 'guida');
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
          recordUserAccess(userObj, id).catch(() => {});
        }
      } catch (cloudErr) {
        console.warn('[Onboarding] Errore salvataggio immediato viaggio su Firestore:', cloudErr);
      }
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
    const res = await loginWithGoogle();
    if (!res.success || !res.user) {
      if (res.code === 'auth/redirect-started') {
        setLoading(true);
        return;
      }
      setLoading(false);
      setLoginError(res.error || 'Accesso Google non completato.');
      return;
    }
    setLoading(false);
    setMode('account_login');
    await inspectUserTrips(res.user);
  };

  const inspectUserTrips = async (user: User) => {
    setAuthenticatedUser(user);
    setIsSearchingTrips(true);
    try {
      // 1. Recupero sicuro dei viaggi associati tramite /users/{uid} (zero query 'list' globali)
      const trips = await fetchUserTrips(user.uid);

      // 2. Controllo se sul dispositivo era già aperto un viaggio autorizzato (es. GIAPPONE)
      const rawLocalConfig = typeof localStorage !== 'undefined' ? localStorage.getItem('roadbook_trip_config') : null;
      let localTripId: string | null = null;
      if (rawLocalConfig) {
        try { localTripId = JSON.parse(rawLocalConfig)?.id; } catch {}
      }

      if (localTripId && localTripId !== '0000') {
        const alreadyInList = trips.some(t => t.id === localTripId);
        if (!alreadyInList) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const snap = await getDoc(doc(db, 'trips', localTripId));
            if (snap.exists()) {
              const tdata = snap.data();
              const isOwner = tdata.ownerUid === user.uid || tdata.ownerId === user.uid;
              const isMem = Array.isArray(tdata.members) && tdata.members.includes(user.uid);
              if (isOwner || isMem) {
                trips.unshift({
                  id: localTripId,
                  title: tdata.title || 'Il nostro viaggio',
                  startDate: tdata.startDate,
                  endDate: tdata.endDate,
                  ownerUid: tdata.ownerUid || tdata.ownerId,
                  ownerName: tdata.ownerName,
                  isOwner,
                  role: isOwner ? 'owner' : 'copilota',
                  isLastUsed: true
                });
                const { recordUserAccess } = await import('../services/userAccessService');
                recordUserAccess(user, localTripId).catch(() => {});
              }
            }
          } catch {}
        }
      }

      // 3. Controllo per viaggio legacy 0000 in sola lettura (se l'utente è l'owner effettivo)
      const legacyCheck = await verifyTripOwnership('0000', user.uid);
      if (legacyCheck.exists && legacyCheck.isOwner) {
        const alreadyHas0000 = trips.some(t => t.id === '0000');
        if (!alreadyHas0000) {
          const trip0000 = {
            id: '0000',
            title: 'Viaggio Originale (0000)',
            isOwner: true,
            role: 'owner' as const,
            ownerUid: user.uid,
            ownerName: legacyCheck.ownerName || 'nunzio'
          };
          // Se l'utente ha altri viaggi attivi, posiziona 0000 in coda per non oscurare il viaggio corrente
          if (trips.length > 0) {
            trips.push(trip0000);
          } else {
            trips.unshift(trip0000);
          }
        }
      }

      setRecoveredTrips(trips);
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
      className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden font-sans"
      style={{ background: '#172033' }}
    >
      <div
        className="absolute top-[-100px] left-[-100px] w-80 h-80 rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FF6B5F, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-80px] right-[-80px] w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #F8F7F3, transparent 70%)' }}
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
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)' }}
      >
        {/* Logo / Header */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 mx-auto">
            <div
              className="absolute inset-0 rounded-3xl blur-xl opacity-40"
              style={{ background: '#FF6B5F' }}
            />
            <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center p-3 shadow-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight font-brand-title" style={{ color: '#ffffff' }}>
              Hounigo
            </h1>
            <p className="font-brand-body mt-1 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
              Il Roadbook digitale di nozze & avventura
            </p>
          </div>
        </div>

        {/* 3 INTENZIONI PRINCIPALI (BRAND IDENTITY INSTAGRAM) */}
        <div className="space-y-3 pt-1">
          {/* 1. ORGANIZZA UN VIAGGIO */}
          <button
            type="button"
            onClick={() => setMode('create')}
            className="w-full py-4 px-4.5 rounded-2xl font-bold text-sm transition-all active:scale-95 hover:opacity-95 cursor-pointer shadow-lg shadow-[#FF6B5F]/20 flex items-center justify-between text-left group"
            style={{ background: '#FF6B5F', color: '#ffffff' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <TrailItinerario size={20} active />
              </div>
              <div>
                <div className="font-extrabold text-base leading-tight">Crea un nuovo viaggio</div>
                <div className="text-xs text-white/85 font-normal mt-0.5">Imposta date, tappe e itinerario</div>
              </div>
            </div>
            <span className="text-white text-base font-bold group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* 2. ACCEDI AL TUO ACCOUNT */}
          <button
            type="button"
            onClick={() => setMode('account_login')}
            className="w-full py-4 px-4.5 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer border flex items-center justify-between text-left hover:bg-white/10 group"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.18)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/10">
                <TrailToolkit size={18} active />
              </div>
              <div>
                <div className="font-extrabold text-base leading-tight">Accedi al tuo account</div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">Ripristina i viaggi sincronizzati su questo dispositivo</div>
              </div>
            </div>
            <span className="text-slate-300 text-base font-bold group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* 3. PARTECIPA A UN VIAGGIO */}
          <button
            type="button"
            onClick={() => setMode('join')}
            className="w-full py-4 px-4.5 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer border flex items-center justify-between text-left hover:bg-white/10 group"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.14)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/10">
                <TrailCopiloti size={18} active />
              </div>
              <div>
                <div className="font-extrabold text-base leading-tight">Partecipa a un viaggio</div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">Entra come copilota con link o codice invito</div>
              </div>
            </div>
            <span className="text-slate-300 text-base font-bold group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* Visualizzazione Errore Accesso Esplicito con Riprova */}
          {loginError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold leading-relaxed text-left flex items-start gap-2.5 shadow-sm">
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
                    className="text-[11px] font-medium text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Accedi con Email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Accesso Rapido Google Facoltativo */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-white text-slate-900 hover:bg-slate-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <span>🌐</span>
              <span>{loading ? 'Accesso in corso…' : 'Continua con Google'}</span>
            </button>
          </div>
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
          <div className="space-y-4">
            {recoveredTrips.length === 1 ? (
              /* Accesso rapido se c'è un solo viaggio */
              <div className="p-4 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">
                    Accesso Rapido al Tuo Viaggio
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    recoveredTrips[0].isOwner ? 'bg-amber-400/20 text-amber-300' : 'bg-emerald-400/20 text-emerald-300'
                  }`}>
                    {recoveredTrips[0].isOwner ? '👑 Organizzatore' : '🤝 Copilota'}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">{recoveredTrips[0].title}</h3>
                  {recoveredTrips[0].startDate && (
                    <p className="text-xs text-slate-300 mt-0.5">
                      📅 {recoveredTrips[0].startDate} {recoveredTrips[0].endDate ? `– ${recoveredTrips[0].endDate}` : ''}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => selectRecoveredTrip(recoveredTrips[0])}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Entra nel Viaggio</span>
                  <span>→</span>
                </button>
              </div>
            ) : (
              /* Elenco raggruppato se sono presenti più viaggi */
              <div className="space-y-3 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  I tuoi viaggi sincronizzati ({recoveredTrips.length}):
                </p>

                {/* Organizzatore */}
                {recoveredTrips.filter(t => t.isOwner).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider block">
                      👑 Organizzatore
                    </span>
                    {recoveredTrips.filter(t => t.isOwner).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectRecoveredTrip(t)}
                        className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-left transition-all active:scale-95 cursor-pointer space-y-1 block"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm truncate">{t.title}</span>
                          {t.isLastUsed && (
                            <span className="text-[9px] font-bold bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded">
                              Ultimo usato
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-300 flex items-center gap-2">
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
                    <span className="text-[11px] font-extrabold text-emerald-300 uppercase tracking-wider block">
                      🤝 Co-pilota
                    </span>
                    {recoveredTrips.filter(t => !t.isOwner).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectRecoveredTrip(t)}
                        className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-left transition-all active:scale-95 cursor-pointer space-y-1 block"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm truncate">{t.title}</span>
                          {t.isLastUsed && (
                            <span className="text-[9px] font-bold bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded">
                              Ultimo usato
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-300 flex items-center gap-2">
                          {t.startDate && <span>📅 {t.startDate}</span>}
                          <span className="font-mono text-slate-400">ID: {t.id}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMode('create')}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              + Crea un altro viaggio con questo account
            </button>
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

            {/* Invito in Sospeso Riconosciuto */}
            {inviteCode && (
              <div className="p-3.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">
                    🤝 Invito in Sospeso
                  </span>
                  <span className="text-[10px] text-slate-300 font-mono">ID: {inviteCode}</span>
                </div>
                <p className="text-xs text-white">
                  {inviteDetails?.tripTitle ? `Unisciti al viaggio "${inviteDetails.tripTitle}"` : `Unisciti al viaggio ${inviteCode}`} con questo account!
                </p>
                <button
                  type="button"
                  onClick={() => executeJoin(inviteCode, inviteToken)}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-[#FF6B5F] hover:bg-[#e85c50] text-white transition-all shadow-sm cursor-pointer"
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

        {isValidatingInvite ? (
          <div className="py-10 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center animate-pulse text-2xl">
              🤝
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Verifica invito in corso…</h3>
              <p className="text-xs text-slate-400 mt-1">Connessione sicura al viaggio...</p>
            </div>
          </div>
        ) : inviteDetails ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-left space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-extrabold text-xs uppercase tracking-wider">
                <span>🤝</span>
                <span>Invito Co-pilota Valido</span>
              </div>
              <h3 className="text-lg font-black text-white">{inviteDetails.tripTitle || 'Il nostro viaggio'}</h3>
              {inviteDetails.ownerName && (
                <p className="text-xs text-slate-300">
                  Organizzato da: <strong className="text-white">{inviteDetails.ownerName}</strong>
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                Sei stato invitato come Co-pilota. Potrai consultare il roadbook, aggiornare spese e note, e seguire la navigazione.
              </p>
            </div>

            {inviteError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold leading-relaxed">
                ⚠️ {inviteError}
              </div>
            )}

            <div className="text-left space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Il tuo nome da mostrare nel viaggio
              </label>
              <input
                type="text"
                value={copilotDisplayName}
                onChange={(e) => setCopilotDisplayName(e.target.value)}
                placeholder="Es. Marco, Sara, etc."
                maxLength={40}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none border border-white/20 focus:border-[#FF6B5F] transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
              />
              <p className="text-[10px] text-slate-400">
                Questo nome sarà visibile all'organizzatore del viaggio e nelle tappe o spese condivise.
              </p>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => executeJoin(inviteDetails.tripId, inviteToken, copilotDisplayName)}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 hover:opacity-90 cursor-pointer disabled:opacity-60 shadow-md"
              style={{ background: '#FF6B5F', color: '#ffffff' }}
            >
              {loading ? '⏳ Accesso in corso…' : 'Accetta Invito e Inizia 🚀'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="space-y-5">
            {inviteError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold leading-relaxed">
                ⚠️ {inviteError}
              </div>
            )}

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
                Per motivi di sicurezza, per i nuovi viaggi è necessario aprire il <strong>link di invito completo</strong> condiviso dall'organizzatore. Il solo codice ID è utilizzabile solo se sei già stato autorizzato.
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
        )}
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
