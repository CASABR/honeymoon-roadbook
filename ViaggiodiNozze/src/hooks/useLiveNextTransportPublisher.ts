import { useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { liveService } from '../services/liveService';
import { storageService } from '../storage/storageService';
import {
  deriveUpcomingImportantTransports,
  serializePublicUpcomingTransportsProjection,
  toPublicUpcomingTransportsFeedProjection,
  toPublicUpcomingTransportTokens,
} from '../utils/liveNextTransport';
import type { CloudRole } from '../utils/useAuthIdentity';

interface UseLiveNextTransportPublisherParams {
  enabled: boolean;
  tripId: string | null;
  tripTitle?: string;
  currentUid: string | null;
  cloudRole: CloudRole;
}

const TRANSPORT_MUTATION_TYPES = new Set(['trasporti', 'trasporto', 'transport', 'transports', 'all']);

/**
 * Mantiene proiettato nel documento pubblico `/live_feeds/{tripId}` esclusivamente
 * il prossimo spostamento importante (sanificato) per gli ospiti esterni,
 * senza toccare SyncService né aprire le collezioni private.
 */
export function useLiveNextTransportPublisher({
  enabled,
  tripId,
  tripTitle,
  currentUid,
  cloudRole,
}: UseLiveNextTransportPublisherParams): void {
  const lastSignatureRef = useRef<string | null>(null);
  const hasHydratedRef = useRef(false);
  const inFlightRef = useRef(false);
  const resyncRequestedRef = useRef(false);
  const allowClearOnPendingRef = useRef(false);

  useEffect(() => {
    lastSignatureRef.current = null;
    hasHydratedRef.current = false;
  }, [tripId, currentUid]);

  useEffect(() => {
    if (!enabled || !tripId || !currentUid) return;
    if (cloudRole !== 'owner' && cloudRole !== 'copilota') return;

    let cancelled = false;
    let rolloverTimer: ReturnType<typeof setTimeout> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRollover = () => {
      if (rolloverTimer) {
        clearTimeout(rolloverTimer);
        rolloverTimer = null;
      }
    };

    const scheduleRollover = (departureUtcMs: number) => {
      clearRollover();
      const remainingMs = departureUtcMs - Date.now();
      if (remainingMs <= 0) return;
      const delayMs = Math.min(remainingMs + 1_500, 3_600_000);
      rolloverTimer = setTimeout(() => {
        if (!cancelled) void runSync(true);
      }, delayMs);
    };

    const runSync = async (allowClearWhenEmpty: boolean): Promise<void> => {
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (auth?.currentUser?.uid !== currentUid) return;

      if (inFlightRef.current) {
        resyncRequestedRef.current = true;
        allowClearOnPendingRef.current = allowClearOnPendingRef.current || allowClearWhenEmpty;
        return;
      }

      inFlightRef.current = true;
      try {
        const transports = await storageService.getTransports();
        if (cancelled) return;

        if (transports.length > 0 || allowClearWhenEmpty) {
          hasHydratedRef.current = true;
        }

        const upcoming = deriveUpcomingImportantTransports(transports, new Date());
        if (upcoming[0]) {
          scheduleRollover(upcoming[0].departureUtcMs);
        } else {
          clearRollover();
        }

        const projectedList = toPublicUpcomingTransportsFeedProjection(upcoming);
        const projectedNext = projectedList[0] ?? null;
        const projectedTokens = toPublicUpcomingTransportTokens(upcoming);
        if (projectedTokens.length === 0 && !hasHydratedRef.current) {
          return;
        }

        const sig = `${tripId}:${serializePublicUpcomingTransportsProjection(projectedTokens, projectedNext)}`;
        if (lastSignatureRef.current === sig) {
          return;
        }

        await liveService.syncNextTransportProjection(tripId, upcoming, { title: tripTitle });
        if (!cancelled) {
          lastSignatureRef.current = sig;
        }
      } catch (err) {
        console.warn('[LiveNextTransportPublisher] Proiezione feed LIVE differita:', err);
        lastSignatureRef.current = null;
      } finally {
        inFlightRef.current = false;
        if (!cancelled && resyncRequestedRef.current) {
          const nextAllowClear = allowClearOnPendingRef.current;
          resyncRequestedRef.current = false;
          allowClearOnPendingRef.current = false;
          void runSync(nextAllowClear);
        }
      }
    };

    const handleDataMutated = (ev: Event) => {
      const entityType = String((ev as CustomEvent)?.detail?.entityType || '').toLowerCase();
      if (!entityType || TRANSPORT_MUTATION_TYPES.has(entityType)) {
        lastSignatureRef.current = null;
        void runSync(true);
      }
    };

    const handleCloudSynced = () => {
      hasHydratedRef.current = true;
      void runSync(true);
    };

    const handleOnline = () => {
      lastSignatureRef.current = null;
      void runSync(hasHydratedRef.current);
    };

    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    window.addEventListener('roadbook_cloud_synced', handleCloudSynced);
    window.addEventListener('online', handleOnline);

    void runSync(false);
    settleTimer = setTimeout(() => {
      hasHydratedRef.current = true;
      if (!cancelled) void runSync(true);
    }, 2_500);

    return () => {
      cancelled = true;
      clearRollover();
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener('roadbook_data_mutated', handleDataMutated);
      window.removeEventListener('roadbook_cloud_synced', handleCloudSynced);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, tripId, tripTitle, currentUid, cloudRole]);
}
