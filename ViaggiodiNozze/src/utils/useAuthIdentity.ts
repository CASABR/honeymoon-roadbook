import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDocFromServer as getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getTripConfig } from './tripConfig';
import type { DeviceRole } from '../types';

export type CloudRole = 'owner' | 'copilota' | 'viewer' | 'admin' | 'checking' | 'unverified' | 'offline';
export type SimulatedRole = 'owner' | 'copilota' | 'viewer' | null;

const SIMULATION_STORAGE_KEY = 'houni_dev_simulated_role';

export function getSimulatedRole(): SimulatedRole {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(SIMULATION_STORAGE_KEY);
  if (raw === 'owner' || raw === 'copilota' || raw === 'viewer') {
    return raw;
  }
  return null;
}

export function setSimulatedRole(role: SimulatedRole): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (!role) {
    sessionStorage.removeItem(SIMULATION_STORAGE_KEY);
  } else {
    sessionStorage.setItem(SIMULATION_STORAGE_KEY, role);
  }
  window.dispatchEvent(new CustomEvent('houni_simulated_role_changed', { detail: { role } }));
}

let authoritativeCloudRole: CloudRole = 'checking';
let authorizedIdentity: { uid: string; tripId: string } | null = null;

export function getAuthoritativeCloudRole(): CloudRole {
  return authoritativeCloudRole;
}

export function setAuthoritativeCloudRole(role: CloudRole): void {
  authoritativeCloudRole = role;
  authorizedIdentity = (role === 'owner' || role === 'copilota') && auth?.currentUser?.uid
    ? { uid: auth.currentUser.uid, tripId: getTripConfig()?.id || '0000' } : null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('houni_cloud_role_changed', { detail: { cloudRole: role } }));
  }
}

/**
 * Determina se la sessione dispone di autorizzazione Cloud effettiva sul viaggio (owner o copilota).
 * In modalità online richiede conferma dal backend Cloud.
 * In modalità offline (o rete disconnessa) ammette mutazioni locali purché il dispositivo
 * sia accreditato con ruolo locale guida o copilota (verificato precedentemente).
 */

export interface VerifiedTripAuth {
  tripId: string;
  uid: string;
  role: 'owner' | 'copilota';
  verifiedAt: number;
}

export function getVerifiedTripAuth(tripId?: string): VerifiedTripAuth | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('houni_verified_trip_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VerifiedTripAuth;
    if (tripId && parsed.tripId !== tripId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recordVerifiedTripAuth(tripId: string, uid: string, role: 'owner' | 'copilota'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('houni_verified_trip_auth', JSON.stringify({
      tripId,
      uid,
      role,
      verifiedAt: Date.now()
    }));
    localStorage.removeItem(`houni_revoked_trip_${tripId}`);
  } catch {}
}

export function revokeTripAuth(tripId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('houni_verified_trip_auth');
    localStorage.setItem(`houni_revoked_trip_${tripId}`, 'true');
    localStorage.setItem('houni_device_role', 'viewer');
    localStorage.setItem('app_device_role', 'viewer');
    setAuthoritativeCloudRole('viewer');
    window.dispatchEvent(new CustomEvent('houni_trip_auth_revoked', { detail: { tripId } }));
  } catch {}
}

export function isTripAuthRevoked(tripId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`houni_revoked_trip_${tripId}`) === 'true';
  } catch {
    return false;
  }
}

export function isCloudAuthorized(targetTripId?: string): boolean {
  if (import.meta.env.DEV) {
    const sim = getSimulatedRole();
    if (sim === 'owner' || sim === 'copilota') return true;
    if (sim === 'viewer') return false;
  }
  const user = auth?.currentUser;
  const tripId = targetTripId || getTripConfig()?.id || '0000';
  return Boolean(user && !user.isAnonymous && authorizedIdentity?.uid === user.uid &&
    authorizedIdentity?.tripId === tripId && !isTripAuthRevoked(tripId) &&
    (typeof navigator === 'undefined' || navigator.onLine) &&
    (authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota'));
}

/**
 * Determina se il dispositivo ha i permessi per mutare e salvare dati in locale (IndexedDB / HounigoLocalQueueDB).
 * Distingue la preservazione delle modifiche locali dall'accesso a credenziali private cloud.
 */
export function canMutateLocally(targetTripId?: string): boolean {
  if (import.meta.env.DEV) {
    const sim = getSimulatedRole();
    if (sim === 'owner' || sim === 'copilota') return true;
    if (sim === 'viewer') return false;
  }
  const config = getTripConfig();
  const currentTripId = config?.id || '0000';
  // Rifiuta mutazioni indirizzate a un viaggio diverso da quello attualmente attivo
  if (targetTripId && targetTripId !== currentTripId) {
    return false;
  }
  if (isTripAuthRevoked(currentTripId)) {
    return false;
  }
  // Se il backend Cloud conferma esplicitamente il ruolo Viewer, le modifiche sono disabilitate
  if (authoritativeCloudRole === 'viewer') {
    return false;
  }
  // Se il backend Cloud conferma Owner o Copilota, modifiche consentite
  if (authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota') {
    return true;
  }
  // Se la sessione è in stato transitorio (unverified, checking, offline):
  // consente mutazioni locali purché il dispositivo sia configurato come guida o copilota e non revocato
  const role = getLocalDeviceRole();
  return role === 'guida' || role === 'copilota';
}

/**
 * Controllo di guardia per scritture locali/remote:
 * Blocca le mutazioni se l'identità non è autorizzata o risulta revocata.
 */
export function assertCanMutate(entity: string): void {
  // In ambiente Node di migrazione/script senza window e in stato checking, non bloccare
  if (typeof window === 'undefined' && authoritativeCloudRole === 'checking') {
    return;
  }
  if (!canMutateLocally()) {
    throw new Error(`Operazione su "${entity}" bloccata: identità cloud non autorizzata o revocata (stato: ${authoritativeCloudRole}).`);
  }
}

export interface AuthIdentityState {
  // Autenticazione Firebase
  currentUser: User | null;
  currentUid: string | null;
  shortUid: string;
  email: string | null;
  isAnonymous: boolean;
  
  // Dati del Viaggio
  tripId: string;
  ownerName: string;
  ownerUid: string | null;
  shortOwnerUid: string;
  isOwnerUidVerified: boolean;
  
  // Ruoli
  cloudRole: CloudRole;
  deviceRole: DeviceRole;
  isCloudAuthorized: boolean;
  
  // Discrepanza tra cloud reale e localStorage locale
  hasDiscrepancy: boolean;
  discrepancyMessage: string | null;
  
  // Simulatore Dev
  isSimulated: boolean;
  simulatedRole: SimulatedRole;
  setSimulatedRole: (role: SimulatedRole) => void;
}

export function getLocalDeviceRole(): DeviceRole {
  if (typeof window === 'undefined') return 'viewer';
  try {
    const role = (localStorage.getItem('houni_device_role') || localStorage.getItem('app_device_role')) as DeviceRole | null;
    if (role === 'guida' || role === 'copilota' || role === 'viewer') {
      return role;
    }
    return 'viewer';
  } catch {
    return 'viewer';
  }
}

export function useAuthIdentity(): AuthIdentityState {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser || null);
  const [cloudRole, setCloudRole] = useState<CloudRole>('checking');
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => getLocalDeviceRole());
  const [simulatedRole, setSimRole] = useState<SimulatedRole>(() => getSimulatedRole());

  const [authoritativeOwnerUid, setAuthoritativeOwnerUid] = useState<string | null>(null);
  const [authoritativeOwnerName, setAuthoritativeOwnerName] = useState<string | null>(null);

  const config = getTripConfig();
  const tripId = config?.id || '0000';
  
  // ownerName: usa il dato autorevole, la configurazione locale o un ruolo generico
  const ownerName = authoritativeOwnerName || config?.ownerName || (tripId === '0000' ? 'Owner' : 'Non specificato');
  
  // ownerUid: proviene prioritariamente dal documento remoto Firestore attendibile
  const ownerUid = authoritativeOwnerUid || config?.ownerUid || null;
  const isOwnerUidVerified = !!authoritativeOwnerUid;

  const shortUid = currentUser?.uid
    ? `${currentUser.uid.slice(0, 4)}...${currentUser.uid.slice(-4)}`
    : 'Non connesso';

  const shortOwnerUid = ownerUid
    ? `${ownerUid.slice(0, 4)}...${ownerUid.slice(-4)}`
    : isOwnerUidVerified ? 'Non impostato' : 'Non verificato';

  // Listener Auth
  useEffect(() => {
    if (!auth) {
      setCloudRole('offline');
      return;
    }
    const unsub = onAuthStateChanged(auth, user => {
      setAuthoritativeCloudRole('checking');
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  // Listener Ruolo Dispositivo Locale
  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: DeviceRole }>;
      if (customEvent.detail?.role) {
        setDeviceRole(customEvent.detail.role);
      } else {
        setDeviceRole(getLocalDeviceRole());
      }
    };
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  // Listener Simulazione Dev
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleSimChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: SimulatedRole }>;
      setSimRole(customEvent.detail?.role ?? getSimulatedRole());
    };
    window.addEventListener('houni_simulated_role_changed', handleSimChanged);
    return () => window.removeEventListener('houni_simulated_role_changed', handleSimChanged);
  }, []);

  // Verifica Cloud Role da Firestore attendibile
  useEffect(() => {
    let isMounted = true;

    function updateRole(newRole: CloudRole) {
      if (!isMounted) return;
      setCloudRole(newRole);
      setAuthoritativeCloudRole(newRole);
    }

    async function verifyCloudRole() {
      // 1. Controllo offline immediato
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateRole('offline');
        return;
      }

      // Attendi che Firebase Auth sia pronto prima di prendere decisioni definitive
      if (auth && typeof (auth as any).authStateReady === 'function') {
        try {
          await (auth as any).authStateReady();
        } catch {}
      }
      const activeUser = auth?.currentUser || currentUser;
      // 2. Utente non autenticato o anonimo -> sessione non verificata sul backend Cloud
      // Nessuna promozione a Owner o Copilota basata su localStorage: l'accesso ai dati privati richiede login verificato
      if (!activeUser || (activeUser as any).isAnonymous) {
        updateRole('unverified');
        return;
      }

      // I privilegi globali sono verificati esclusivamente dalle Firestore Rules
      // tramite /system_admins/{uid} o custom claim: mai dall'indirizzo e-mail client.
      const isAdmin = false;

      if (!db || !tripId) {
        updateRole(isAdmin ? 'admin' : 'unverified');
        return;
      }

      try {
        updateRole('checking');

        // Lettura documento radice attendibile
        const tripRef = doc(db, 'trips', tripId);
        const tripSnap = await getDoc(tripRef);

        if (!tripSnap.exists()) {
          updateRole(isAdmin ? 'admin' : 'unverified');
          return;
        }

        if (!isMounted || auth?.currentUser?.uid !== activeUser.uid) return;
        const tripData = tripSnap.data();
        const remoteOwnerUid = tripData?.ownerUid || null;
        const remoteOwnerName = tripData?.ownerName || (tripId === '0000' ? 'Owner' : undefined);
        const remoteMembers: string[] = Array.isArray(tripData?.members) ? tripData.members : [];

        if (isMounted) {
          if (remoteOwnerUid) setAuthoritativeOwnerUid(remoteOwnerUid);
          if (remoteOwnerName) setAuthoritativeOwnerName(remoteOwnerName);
        }

        // 1. Owner effettivo del viaggio verificato da Firestore
        if (remoteOwnerUid && activeUser.uid === remoteOwnerUid) {
          recordVerifiedTripAuth(tripId, activeUser.uid, 'owner');
          updateRole('owner');
          return;
        }

        // 2. Copilota presente nell'array members del documento radice
        if (remoteMembers.includes(activeUser.uid)) {
          recordVerifiedTripAuth(tripId, activeUser.uid, 'copilota');
          updateRole('copilota');
          return;
        }

        // 3. Verifica opzionale nella sottocollezione /trips/{tripId}/members/{uid}
        const memRef = doc(db, 'trips', tripId, 'members', activeUser.uid);
        const memSnap = await getDoc(memRef).catch(() => null);
        if (!isMounted || auth?.currentUser?.uid !== activeUser.uid) return;
        if (memSnap?.exists() && ['owner', 'copilota'].includes(memSnap.data()?.role)) {
          const memRole = memSnap.data()?.role === 'owner' ? 'owner' : 'copilota';
          recordVerifiedTripAuth(tripId, activeUser.uid, memRole);
          updateRole(memRole);
          return;
        }

        // 4. Se non è owner né copilota del viaggio, ma è amministratore globale di sistema
        if (isAdmin) {
          updateRole('admin');
          return;
        }

        // 5. Se l'UID non è owner e non è presente in members:
        // Controlla se questo specifico utente era precedentemente verificato come Owner o Copilota.
        // Se un utente anonimo o un utente secondario accede, NON revoca le credenziali verificate del dispositivo!
        const verified = getVerifiedTripAuth(tripId);
        if (verified && verified.uid === activeUser.uid && !(activeUser as any).isAnonymous) {
          // L'utente era formalmente abilitato per questo viaggio, ma il backend Firestore
          // conferma che non è più né owner né membro: revoca confermata!
          console.warn(`[useAuthIdentity] Revoca confermata dal backend per utente ${activeUser.uid} su viaggio ${tripId}`);
          revokeTripAuth(tripId);
        }
        updateRole('viewer');
      } catch (err) {
        console.warn('[useAuthIdentity] Errore lettura remota autorizzazioni:', err);
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        updateRole(isOffline ? 'offline' : (isAdmin ? 'admin' : 'unverified'));
      }
    }

    verifyCloudRole();

    // Riascolta ritorno online
    const handleOnline = () => verifyCloudRole();
    const handleOffline = () => {
      updateRole('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser?.uid, currentUser?.isAnonymous, tripId]);

  // Calcolo Discrepanza
  let hasDiscrepancy = false;
  let discrepancyMessage: string | null = null;

  if (cloudRole !== 'checking' && cloudRole !== 'unverified' && cloudRole !== 'offline') {
    if (deviceRole === 'guida' && cloudRole !== 'owner') {
      hasDiscrepancy = true;
      discrepancyMessage = "Dispositivo impostato su Guida (GPS), ma la sessione Cloud corrente non è l'Owner.";
    } else if (deviceRole === 'copilota' && cloudRole !== 'owner' && cloudRole !== 'copilota') {
      hasDiscrepancy = true;
      discrepancyMessage = "Dispositivo impostato su Copilota, ma la sessione Cloud non risulta tra i membri autorizzati.";
    }
  }

  const isCloudAuthorizedState = isCloudAuthorized();

  return {
    currentUser,
    currentUid: currentUser?.uid || null,
    shortUid,
    email: currentUser?.email || null,
    isAnonymous: currentUser?.isAnonymous ?? true,
    tripId,
    ownerName,
    ownerUid,
    shortOwnerUid,
    isOwnerUidVerified,
    cloudRole,
    deviceRole,
    isCloudAuthorized: isCloudAuthorizedState,
    hasDiscrepancy,
    discrepancyMessage,
    isSimulated: !!simulatedRole,
    simulatedRole,
    setSimulatedRole
  };
}
