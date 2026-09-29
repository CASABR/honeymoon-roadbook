import { useState, useEffect } from 'react';
import type { DeviceRole } from '../types';
import { storageService } from '../storage/storageService';

export function useDeviceRole(): { role: DeviceRole; canEdit: boolean; isGuida: boolean; isCopilota: boolean; isViewer: boolean } {
  const [role, setRole] = useState<DeviceRole>(() => storageService.getDeviceRole());

  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const custom = e as CustomEvent<{ role: DeviceRole }>;
      if (custom.detail?.role) {
        setRole(custom.detail.role);
      } else {
        setRole(storageService.getDeviceRole());
      }
    };

    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  const canEdit = role === 'guida' || role === 'copilota';
  const isGuida = role === 'guida';
  const isCopilota = role === 'copilota';
  const isViewer = role === 'viewer';

  return { role, canEdit, isGuida, isCopilota, isViewer };
}
