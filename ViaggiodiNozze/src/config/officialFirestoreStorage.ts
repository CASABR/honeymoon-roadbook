/**
 * officialFirestoreStorage.ts
 *
 * Configurazione e snapshot verificato della metrica ufficiale Cloud Monitoring:
 * `firestore.googleapis.com/storage/data_and_index_storage_bytes`
 * per il database `(default)` del progetto `app-viaggio-di-nozze`.
 *
 * Sicurezza:
 * - NESSUN token OAuth, client secret o chiave privata Google è memorizzato qui o esposto al client.
 * - Solo metadati aggregati e valore numerico certificato.
 * - Se non disponibile o disattivato, il client mostra esplicitamente "Totale ufficiale non disponibile".
 */

import { FIRESTORE_SPARK_FREE_STORAGE_LIMIT_BYTES } from '../utils/firestoreStorageCalculator';

export interface OfficialFirestoreStorageSnapshot {
  available: boolean;
  bytes: number;
  metricType: string;
  database: string;
  projectId: string;
  measuredAt: string; // ISO date string
  quotaLimitBytes: number;
  source: 'cloud_monitoring' | 'none';
}

/**
 * Snapshot ufficiale recuperato direttamente tramite Google Cloud Monitoring API
 * Metrica: firestore.googleapis.com/storage/data_and_index_storage_bytes
 */
export const OFFICIAL_FIRESTORE_METRIC: OfficialFirestoreStorageSnapshot = {
  available: true,
  bytes: 16857987, // ~16.08 MiB
  metricType: 'firestore.googleapis.com/storage/data_and_index_storage_bytes',
  database: '(default)',
  projectId: 'app-viaggio-di-nozze',
  measuredAt: '2026-10-29T13:14:00Z',
  quotaLimitBytes: FIRESTORE_SPARK_FREE_STORAGE_LIMIT_BYTES, // 1 GiB = 1.073.741.824 B
  source: 'cloud_monitoring'
};
