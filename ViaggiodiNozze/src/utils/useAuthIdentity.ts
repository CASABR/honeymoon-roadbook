import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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

export function getAuthoritativeCloudRole(): CloudRole {
  return authoritativeCloudRole;
}

export function setAuthoritativeCloudRole(role: CloudRole): void {
  authoritativeCloudRole = role;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('houni_cloud_role_changed', { detail: { cloudRole: role } }));
  }
}

/**
 * Determina se la sessione dispone di autorizzazione Cloud effettiva sul viaggio (owner o copilota).
 * Amministratore globale (non owner/copilota), viewer, checking, offline o unverified NON sono autorizzati.
 */
export function isCloudAuthorized(): boolean {
  return authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota';
}

/**
 * Controllo di guardia per scritture locali/remote:
 * Blocca le mutazioni se l'identità non è autorizzata dal Cloud.
 */
export function assertCanMutate(entity: string): void {
  // In ambiente Node di migrazione/script senza window e in stato checking, non bloccare
  if (typeof window === 'undefined' && authoritativeCloudRole === 'checking') {
    return;
  }
  if (!isCloudAuthorized()) {
    throw new Error(`Operazione su "${entity}" bloccata: identità cloud non autorizzata o in verifica (stato: ${authoritativeCloudRole}).`);
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

function getLocalDeviceRole(): DeviceRole {
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
  
  // ownerName: fallback visivo 'nunzio' solo per trip '0000'
  const ownerName = authoritativeOwnerName || config?.ownerName || (tripId === '0000' ? 'nunzio' : 'Non specificato');
  
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
      if (isMounted) setCloudRole(newRole);
      setAuthoritativeCloudRole(newRole);
    }

    async function verifyCloudRole() {
      // 1. Controllo offline immediato
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateRole('offline');
        return;
      }

      // 2. Utente non autenticato -> Viewer / Ospite confermato
      if (!currentUser) {
        updateRole('viewer');
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

        const tripData = tripSnap.data();
        const remoteOwnerUid = tripData?.ownerUid || null;
        const remoteOwnerName = tripData?.ownerName || (tripId === '0000' ? 'nunzio' : undefined);
        const remoteMembers: string[] = Array.isArray(tripData?.members) ? tripData.members : [];

        if (isMounted) {
          if (remoteOwnerUid) setAuthoritativeOwnerUid(remoteOwnerUid);
          if (remoteOwnerName) setAuthoritativeOwnerName(remoteOwnerName);
        }

        // 1. Owner effettivo del viaggio verificato da Firestore
        if (remoteOwnerUid && currentUser.uid === remoteOwnerUid) {
          updateRole('owner');
          return;
        }

        // 2. Copilota presente nell'array members del documento radice
        if (remoteMembers.includes(currentUser.uid)) {
          updateRole('copilota');
          return;
        }

        // 3. Verifica opzionale nella sottocollezione /trips/{tripId}/members/{uid}
        const memRef = doc(db, 'trips', tripId, 'members', currentUser.uid);
        const memSnap = await getDoc(memRef).catch(() => null);
        if (memSnap?.exists()) {
          const memRole = memSnap.data()?.role;
          updateRole(memRole === 'owner' ? 'owner' : 'copilota');
          return;
        }

        // 4. Se non è owner né copilota del viaggio, ma è amministratore globale di sistema
        if (isAdmin) {
          updateRole('admin');
          return;
        }

        // 5. Se l'UID non è owner e non è presente in members -> Viewer Confermato dal backend
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
  }, [currentUser?.uid, tripId]);

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

  const isCloudAuthorizedState = cloudRole === 'owner' || cloudRole === 'copilota';

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
