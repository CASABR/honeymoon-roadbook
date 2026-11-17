import { useState, useEffect } from 'react';
import type { DeviceRole } from '../types';
import { storageService } from '../storage/storageService';
import { getSimulatedRole, type SimulatedRole, useAuthIdentity, type CloudRole, getVerifiedTripAuth, canMutateLocally } from './useAuthIdentity';
import { getTripConfig } from './tripConfig';

export function useDeviceRole(): {
  role: DeviceRole;
  canEdit: boolean;
  canSeePrivateInfo: boolean;
  isGuida: boolean;
  isCopilota: boolean;
  isViewer: boolean;
  isSimulated: boolean;
  simulatedRole: SimulatedRole;
  cloudRole: CloudRole;
  isCloudAuthorized: boolean;
} {
  const { cloudRole, isCloudAuthorized } = useAuthIdentity();
  const [role, setRole] = useState<DeviceRole>(() => {
    if (import.meta.env.DEV) {
      const sim = getSimulatedRole();
      if (sim === 'owner') return 'guida';
      if (sim === 'copilota') return 'copilota';
      if (sim === 'viewer') return 'viewer';
    }
    return storageService.getDeviceRole();
  });
  const [simulatedRole, setSimulatedRole] = useState<SimulatedRole>(() => getSimulatedRole());

  // Ripristino asincrono da IndexedDB qualora localStorage fosse stato ripulito dal browser mobile
  useEffect(() => {
    storageService.restoreDeviceRoleFromIndexedDB().then((restored) => {
      if (restored) setRole(restored);
    }).catch(() => {});
  }, []);

  // Inizializzazione coerente del ruolo da cloud verificato:
  // Se l'utente è Owner o Copilota verificato, allinea il dispositivo e garantisce i permessi.
  useEffect(() => {
    if (cloudRole === 'owner' && role !== 'guida') {
      storageService.setDeviceRole('guida', false);
      setRole('guida');
    } else if (cloudRole === 'copilota' && role !== 'copilota') {
      storageService.setDeviceRole('copilota', false);
      setRole('copilota');
    } else if (cloudRole === 'viewer' && role !== 'viewer') {
      storageService.setDeviceRole('viewer', false);
      setRole('viewer');
    }
  }, [cloudRole, role]);

  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      if (import.meta.env.DEV && getSimulatedRole()) return;
      const custom = e as CustomEvent<{ role: DeviceRole }>;
      if (custom.detail?.role) {
        setRole(custom.detail.role);
      } else {
        setRole(storageService.getDeviceRole());
      }
    };

    const handleSimChanged = (e: Event) => {
      if (!import.meta.env.DEV) return;
      const custom = e as CustomEvent<{ role: SimulatedRole }>;
      const sim = custom.detail?.role ?? getSimulatedRole();
      setSimulatedRole(sim);
      if (sim === 'owner') setRole('guida');
      else if (sim === 'copilota') setRole('copilota');
      else if (sim === 'viewer') setRole('viewer');
      else setRole(storageService.getDeviceRole());
    };

    window.addEventListener('device_role_changed', handleRoleChanged);
    window.addEventListener('houni_simulated_role_changed', handleSimChanged);
    return () => {
      window.removeEventListener('device_role_changed', handleRoleChanged);
      window.removeEventListener('houni_simulated_role_changed', handleSimChanged);
    };
  }, []);

  // Separazione netta: il ruolo per l'interfaccia rispecchia l'autorizzazione Cloud/verificata.
  // Il ruolo locale 'viewer' non deve bloccare un Owner o Copilota autorizzato.
  // Il ruolo locale 'guida' non deve autorizzare un ospite.
  const effectiveRole: DeviceRole = (() => {
    if (import.meta.env.DEV) {
      const sim = getSimulatedRole();
      if (sim === 'owner') return 'guida';
      if (sim === 'copilota') return 'copilota';
      if (sim === 'viewer') return 'viewer';
    }
    if (cloudRole === 'owner') return 'guida';
    if (cloudRole === 'copilota') return 'copilota';
    if (cloudRole === 'viewer') return 'viewer';

    // Se offline o in fase di verifica, controlla le credenziali verificate salvate per questo viaggio
    const tripConfig = getTripConfig();
    const currentTripId = tripConfig?.id || '0000';
    const verified = getVerifiedTripAuth(currentTripId);
    if (verified && (verified.role === 'owner' || verified.role === 'copilota')) {
      return verified.role === 'owner' ? 'guida' : 'copilota';
    }

    return role;
  })();

  // L'autorizzazione alle modifiche è RIGOROSAMENTE determinata da canMutateLocally():
  // - Owner e Copilota autorizzati possono sempre modificare le card con un clic.
  // - Il ruolo locale 'viewer' non blocca un Owner o Copilota autorizzato.
  // - Il ruolo locale 'guida' non autorizza un ospite.
  const canEdit = canMutateLocally() && (
    import.meta.env.DEV && simulatedRole === 'viewer' ? false : true
  );

  // Visibilità dati sensibili (PIN, credenziali, note private) vincolata a canEdit o autorizzazione cloud
  const canSeePrivateInfo = isCloudAuthorized || canEdit;
  const isGuida = effectiveRole === 'guida' && canEdit;
  const isCopilota = effectiveRole === 'copilota' && canEdit;
  const isViewer = !canEdit;
  const isSimulated = !!simulatedRole;

  return { role: effectiveRole, canEdit, canSeePrivateInfo, isGuida, isCopilota, isViewer, isSimulated, simulatedRole, cloudRole, isCloudAuthorized };
}
