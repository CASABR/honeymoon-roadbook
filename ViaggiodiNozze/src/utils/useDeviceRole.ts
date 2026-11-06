import { useState, useEffect } from 'react';
import type { DeviceRole } from '../types';
import { storageService } from '../storage/storageService';
import { getSimulatedRole, type SimulatedRole, useAuthIdentity, type CloudRole } from './useAuthIdentity';

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

  // Sincronizzazione automatica del ruolo da cloud verificato verso storage locale:
  // Se viewer confermato, revoca immediatamente qualsiasi ruolo privilegiato locale
  useEffect(() => {
    if (cloudRole === 'owner' && role !== 'guida') {
      storageService.setDeviceRole('guida');
      setRole('guida');
    } else if (cloudRole === 'copilota' && role !== 'copilota') {
      storageService.setDeviceRole('copilota');
      setRole('copilota');
    } else if (cloudRole === 'viewer' && role !== 'viewer') {
      storageService.setDeviceRole('viewer');
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

  // L'autorizzazione alle modifiche richiede obbligatoriamente che l'identità
  // sia verificata e autorizzata dal backend Cloud (owner o copilota).
  // Se il Cloud non autorizza (viewer, admin globale, checking, offline, unverified),
  // le modifiche sono disabilitate a prescindere dal ruolo locale o dalla simulazione DEV.
  // Ruolo effettivo calcolato combinando cloud verificato e persistenza locale
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
    return role;
  })();

  const canEdit = isCloudAuthorized && (effectiveRole === 'guida' || effectiveRole === 'copilota');
  // Visibilità credenziali e PNR separata: concessa a Guida e Copilota (mai a viewer o revocati)
  const canSeePrivateInfo = isCloudAuthorized && (effectiveRole === 'guida' || effectiveRole === 'copilota');
  const isGuida = isCloudAuthorized && effectiveRole === 'guida';
  const isCopilota = isCloudAuthorized && effectiveRole === 'copilota';
  const isViewer = !isCloudAuthorized || effectiveRole === 'viewer';
  const isSimulated = !!simulatedRole;

  return { role: effectiveRole, canEdit, canSeePrivateInfo, isGuida, isCopilota, isViewer, isSimulated, simulatedRole, cloudRole, isCloudAuthorized };
}
