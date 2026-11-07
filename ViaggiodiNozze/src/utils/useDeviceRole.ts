import { useState, useEffect } from 'react';
import type { DeviceRole } from '../types';
import { storageService } from '../storage/storageService';
import { getSimulatedRole, type SimulatedRole, useAuthIdentity, type CloudRole, isTripAuthRevoked, canMutateLocally } from './useAuthIdentity';
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

  // Inizializzazione non distruttiva del ruolo da cloud verificato verso storage locale:
  // NON sovrascrive mai la scelta esplicita già fatta dall'utente sul telefono!
  // Se viewer confermato con revoca, riporta a viewer per sicurezza.
  useEffect(() => {
    const hasExplicitChoice = storageService.hasExplicitDeviceRole();
    if (!hasExplicitChoice) {
      if (cloudRole === 'owner' && role !== 'guida') {
        storageService.setDeviceRole('guida', false);
        setRole('guida');
      } else if (cloudRole === 'copilota' && role !== 'copilota') {
        storageService.setDeviceRole('copilota', false);
        setRole('copilota');
      }
    }
    if (cloudRole === 'viewer' && role !== 'viewer') {
      const tripConfig = getTripConfig();
      const currentTripId = tripConfig?.id || '0000';
      if (isTripAuthRevoked(currentTripId)) {
        storageService.setDeviceRole('viewer', false);
        setRole('viewer');
      }
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

  // L'autorizzazione alle modifiche richiede obbligatoriamente che l'identità
  // sia verificata e autorizzata dal backend Cloud (owner o copilota).
  // Il ruolo del dispositivo ('guida' | 'copilota' | 'viewer') rimane strettamente per-dispositivo.
  const effectiveRole: DeviceRole = (() => {
    if (import.meta.env.DEV) {
      const sim = getSimulatedRole();
      if (sim === 'owner') return 'guida';
      if (sim === 'copilota') return 'copilota';
      if (sim === 'viewer') return 'viewer';
    }
    if (cloudRole === 'viewer') return 'viewer';
    if (storageService.hasExplicitDeviceRole()) {
      return role;
    }
    if (cloudRole === 'owner') return 'guida';
    if (cloudRole === 'copilota') return 'copilota';
    return role;
  })();

  const canEdit = canMutateLocally() && (effectiveRole === 'guida' || effectiveRole === 'copilota');
  // Visibilità credenziali, PIN, PNR e voucher: RIGOROSAMENTE vincolata all'autorizzazione cloud effettiva (mai a ruolo locale)
  const canSeePrivateInfo = isCloudAuthorized && (effectiveRole === 'guida' || effectiveRole === 'copilota');
  const isGuida = isCloudAuthorized && effectiveRole === 'guida';
  const isCopilota = isCloudAuthorized && effectiveRole === 'copilota';
  const isViewer = !isCloudAuthorized || effectiveRole === 'viewer';
  const isSimulated = !!simulatedRole;

  return { role: effectiveRole, canEdit, canSeePrivateInfo, isGuida, isCopilota, isViewer, isSimulated, simulatedRole, cloudRole, isCloudAuthorized };
}
