import { useCallback, useEffect, useRef, useState } from 'react';
import { getTripConfig } from '../utils/tripConfig';
import { isCloudAuthorized } from '../utils/useAuthIdentity';
import { hasPendingMutation } from '../storage/localMutationQueue';

export type AutoSaveSyncStatus =
  | 'idle'
  | 'pending'
  | 'invalid'
  | 'saving_local'
  | 'saved_local_offline'
  | 'syncing_cloud'
  | 'synced'
  | 'error'
  | 'conflict';

export interface UseCardAutoSaveOptions {
  enabled: boolean;
  entityType: string;
  entityId?: string;
  draftFingerprint: string;
  baselineFingerprint: string;
  validationError: string | null;
  debounceMs?: number;
  performSave: () => Promise<boolean>;
}

export interface UseCardAutoSaveResult {
  status: AutoSaveSyncStatus;
  errorMessage: string | null;
  isDirty: boolean;
  isSaving: boolean;
  flushBeforeClose: () => Promise<boolean>;
  flushManualSave: () => Promise<boolean>;
  resetDirtyToSaved: () => void;
}

/**
 * Hook condiviso per autosalvataggio su card esistenti:
 * - debounce su inattività (default 1000 ms), solo se dirty e valido
 * - serializzazione single-flight per evitare scritture concorrenti o duplicate
 * - flush garantito alla chiusura senza perdere modifiche pendenti
 * - conferma reale di sincronizzazione Cloud Firestore tramite coda locale ed eventi SyncService
 */
export function useCardAutoSave(options: UseCardAutoSaveOptions): UseCardAutoSaveResult {
  const {
    enabled,
    entityType,
    entityId,
    draftFingerprint,
    baselineFingerprint,
    validationError,
    debounceMs = 1000,
    performSave,
  } = options;

  const [status, setStatus] = useState<AutoSaveSyncStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastSavedFingerprintRef = useRef<string>(baselineFingerprint);
  const latestFingerprintRef = useRef<string>(draftFingerprint);
  const latestValidationErrorRef = useRef<string | null>(validationError);
  const performSaveRef = useRef<() => Promise<boolean>>(performSave);
  const enabledRef = useRef<boolean>(enabled);
  const entityIdRef = useRef<string | undefined>(entityId);

  latestFingerprintRef.current = draftFingerprint;
  latestValidationErrorRef.current = validationError;
  performSaveRef.current = performSave;
  enabledRef.current = enabled;
  entityIdRef.current = entityId;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRecheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSaveRef = useRef<Promise<boolean> | null>(null);
  const lastSaveStartedAtRef = useRef<number>(0);
  const lastConfirmedCloudSyncAtRef = useRef<number>(0);
  const cloudErrorRef = useRef<string | null>(null);
  const conflictRef = useRef<boolean>(false);
  const hasSavedInSessionRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearSyncRecheckTimer = useCallback(() => {
    if (syncRecheckTimerRef.current) {
      clearTimeout(syncRecheckTimerRef.current);
      syncRecheckTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const evaluateCloudConfirmation = useCallback(async () => {
    if (!enabledRef.current || !entityIdRef.current || !hasSavedInSessionRef.current) return;
    if (latestFingerprintRef.current !== lastSavedFingerprintRef.current) return;

    if (conflictRef.current) {
      if (isMountedRef.current) setStatus('conflict');
      return;
    }

    const online = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
    if (cloudErrorRef.current) {
      if (isMountedRef.current) {
        setStatus(online ? 'error' : 'saved_local_offline');
        if (online) setErrorMessage(cloudErrorRef.current);
      }
      return;
    }

    const tripId = getTripConfig()?.id || null;
    const authorized = Boolean(tripId && isCloudAuthorized(tripId));
    if (!online || !authorized || !tripId) {
      if (isMountedRef.current) setStatus('saved_local_offline');
      return;
    }

    let pendingInQueue = false;
    try {
      pendingInQueue = await hasPendingMutation(tripId, entityType, entityIdRef.current);
    } catch {
      pendingInQueue = false;
    }

    if (!isMountedRef.current || latestFingerprintRef.current !== lastSavedFingerprintRef.current) {
      return;
    }

    const cloudConfirmed =
      lastConfirmedCloudSyncAtRef.current >= lastSaveStartedAtRef.current &&
      lastSaveStartedAtRef.current > 0 &&
      !pendingInQueue;

    if (cloudConfirmed) {
      setStatus('synced');
      return;
    }

    setStatus(pendingInQueue ? 'saved_local_offline' : 'syncing_cloud');
  }, [entityType]);

  // Reset baseline quando cambia l'elemento aperto o l'abilitazione
  const trackedContextKey = enabled && entityId ? `${entityType}:${entityId}` : 'disabled';
  const prevContextKeyRef = useRef<string>(trackedContextKey);
  if (prevContextKeyRef.current !== trackedContextKey) {
    prevContextKeyRef.current = trackedContextKey;
    clearDebounceTimer();
    clearSyncRecheckTimer();
    lastSavedFingerprintRef.current = baselineFingerprint;
    lastSaveStartedAtRef.current = 0;
    lastConfirmedCloudSyncAtRef.current = 0;
    cloudErrorRef.current = null;
    conflictRef.current = false;
    hasSavedInSessionRef.current = false;
  }

  useEffect(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, [trackedContextKey]);

  // Ascolta eventi reali di SyncService e connettività senza modificare syncService
  useEffect(() => {
    if (!enabled || !entityId || typeof window === 'undefined') return;

    const handleSyncStatusChanged = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const tripId = getTripConfig()?.id || null;
      if (tripId && detail?.tripId && detail.tripId !== tripId) return;

      if (
        typeof detail?.lastSyncAt === 'number' &&
        lastSaveStartedAtRef.current > 0 &&
        detail.lastSyncAt >= lastSaveStartedAtRef.current &&
        detail.status !== 'offline' &&
        detail.status !== 'error'
      ) {
        lastConfirmedCloudSyncAtRef.current = detail.lastSyncAt;
        cloudErrorRef.current = null;
      } else if (detail?.status === 'error' && detail?.lastSyncError && lastSaveStartedAtRef.current > 0) {
        cloudErrorRef.current = String(detail.lastSyncError);
      }
      void evaluateCloudConfirmation();
    };

    const handleCloudError = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const tripId = getTripConfig()?.id || null;
      if (tripId && detail?.tripId && detail.tripId !== tripId) return;
      if (detail?.id && detail.id !== entityId) return;
      if (lastSaveStartedAtRef.current > 0) {
        cloudErrorRef.current = String(detail?.error || 'Errore di sincronizzazione cloud');
        void evaluateCloudConfirmation();
      }
    };

    const handleConflictDetected = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail?.id && detail.id !== entityId) return;
      if (lastSaveStartedAtRef.current > 0) {
        conflictRef.current = true;
        if (isMountedRef.current) setStatus('conflict');
      }
    };

    const handleConnectivityOrAuthChange = () => {
      void evaluateCloudConfirmation();
    };

    window.addEventListener('roadbook_sync_status_changed', handleSyncStatusChanged);
    window.addEventListener('roadbook_cloud_sync_error', handleCloudError);
    window.addEventListener('roadbook_conflict_detected', handleConflictDetected);
    window.addEventListener('online', handleConnectivityOrAuthChange);
    window.addEventListener('offline', handleConnectivityOrAuthChange);
    window.addEventListener('houni_cloud_role_changed', handleConnectivityOrAuthChange);

    return () => {
      window.removeEventListener('roadbook_sync_status_changed', handleSyncStatusChanged);
      window.removeEventListener('roadbook_cloud_sync_error', handleCloudError);
      window.removeEventListener('roadbook_conflict_detected', handleConflictDetected);
      window.removeEventListener('online', handleConnectivityOrAuthChange);
      window.removeEventListener('offline', handleConnectivityOrAuthChange);
      window.removeEventListener('houni_cloud_role_changed', handleConnectivityOrAuthChange);
    };
  }, [enabled, entityId, evaluateCloudConfirmation]);

  const executeSerializedSave = useCallback(
    async (trigger: 'debounce' | 'close' | 'manual'): Promise<boolean> => {
      clearDebounceTimer();
      clearSyncRecheckTimer();

      while (true) {
        if (inFlightSaveRef.current) {
          await inFlightSaveRef.current;
        }

        const targetFingerprint = latestFingerprintRef.current;
        const currentValidationErr = latestValidationErrorRef.current;
        const dirtyNow = targetFingerprint !== lastSavedFingerprintRef.current;

        if (!dirtyNow) {
          return true;
        }

        if (currentValidationErr) {
          if (isMountedRef.current) {
            setStatus('invalid');
            setErrorMessage(currentValidationErr);
          }
          return false;
        }

        if (!enabledRef.current || !entityIdRef.current) {
          return false;
        }

        const saveStartedAt = Date.now();
        lastSaveStartedAtRef.current = saveStartedAt;
        cloudErrorRef.current = null;
        conflictRef.current = false;

        if (isMountedRef.current) {
          setStatus('saving_local');
          setErrorMessage(null);
        }

        const saveRun = (async (): Promise<boolean> => {
          try {
            const saved = await performSaveRef.current();
            if (!saved) {
              if (isMountedRef.current) setStatus('error');
              return false;
            }
            lastSavedFingerprintRef.current = targetFingerprint;
            hasSavedInSessionRef.current = true;
            return true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio locale.';
            if (isMountedRef.current) {
              setStatus('error');
              setErrorMessage(msg);
            }
            return false;
          }
        })();

        inFlightSaveRef.current = saveRun;
        const ok = await saveRun;
        if (inFlightSaveRef.current === saveRun) {
          inFlightSaveRef.current = null;
        }

        if (!ok) {
          return false;
        }

        const stillDirtyAfterSave =
          latestFingerprintRef.current !== lastSavedFingerprintRef.current;

        if (stillDirtyAfterSave && (trigger === 'close' || trigger === 'manual')) {
          continue;
        }

        await evaluateCloudConfirmation();

        if (!stillDirtyAfterSave && isMountedRef.current) {
          syncRecheckTimerRef.current = setTimeout(() => {
            syncRecheckTimerRef.current = null;
            void evaluateCloudConfirmation();
          }, 250);
        }

        return true;
      }
    },
    [clearDebounceTimer, clearSyncRecheckTimer, evaluateCloudConfirmation]
  );

  // Pianifica autosave dopo debounceMs di inattività su modifiche valide
  useEffect(() => {
    if (!enabled || !entityId) return;

    clearDebounceTimer();
    const isDirtyNow = draftFingerprint !== lastSavedFingerprintRef.current;

    if (!isDirtyNow) {
      if (hasSavedInSessionRef.current) {
        void evaluateCloudConfirmation();
      } else {
        setStatus('idle');
        setErrorMessage(null);
      }
      return;
    }

    if (validationError) {
      setStatus('invalid');
      return;
    }

    setStatus('pending');
    setErrorMessage(null);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void executeSerializedSave('debounce');
    }, debounceMs);

    return () => {
      clearDebounceTimer();
    };
  }, [
    enabled,
    entityId,
    draftFingerprint,
    validationError,
    debounceMs,
    clearDebounceTimer,
    evaluateCloudConfirmation,
    executeSerializedSave,
  ]);

  // Fallback di sicurezza se il form si smonta mentre ci sono modifiche valide ancora in debounce
  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearSyncRecheckTimer();
      if (!enabledRef.current || !entityIdRef.current) return;
      const dirtyNow = latestFingerprintRef.current !== lastSavedFingerprintRef.current;
      if (dirtyNow && !latestValidationErrorRef.current && !inFlightSaveRef.current) {
        void performSaveRef.current();
      }
    };
  }, [clearDebounceTimer, clearSyncRecheckTimer]);

  const flushBeforeClose = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current || !entityIdRef.current) return true;
    return executeSerializedSave('close');
  }, [executeSerializedSave]);

  const flushManualSave = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current || !entityIdRef.current) return false;
    return executeSerializedSave('manual');
  }, [executeSerializedSave]);

  const resetDirtyToSaved = useCallback(() => {
    clearDebounceTimer();
    lastSavedFingerprintRef.current = latestFingerprintRef.current;
    setErrorMessage(null);
    setStatus(hasSavedInSessionRef.current ? 'saved_local_offline' : 'idle');
  }, [clearDebounceTimer]);

  const isDirty = Boolean(enabled && entityId && draftFingerprint !== lastSavedFingerprintRef.current);

  return {
    status,
    errorMessage,
    isDirty,
    isSaving: status === 'saving_local',
    flushBeforeClose,
    flushManualSave,
    resetDirtyToSaved,
  };
}
