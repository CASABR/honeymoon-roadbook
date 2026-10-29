/**
 * DatabaseUsagePanel.tsx
 *
 * Pannello per il monitoraggio dello spazio Firestore nella Console Admin Globale.
 * Mostra:
 * - Spazio totale ufficiale da Cloud Monitoring (se disponibile)
 * - Limite gratuito: 1 GiB (1.073.741.824 byte)
 * - Percentuale utilizzata e spazio residuo
 * - Avvisi automatici a soglie 70%, 85%, 95%
 * - Somma delle stime documentali dei viaggi esistenti (escluso overhead indici)
 * - Gestione rigorosa del fallback "Totale ufficiale non disponibile" (zero dati inventati)
 * - Controllo efficiente on-demand delle stime con barra di avanzamento
 */

import React, { useMemo } from 'react';
import type { OfficialFirestoreStorageSnapshot } from '../../config/officialFirestoreStorage';
import type { TripSummary } from './AdminDashboardView';
import {
  formatStorageBytes,
  calculateQuotaPercentage,
  getQuotaAlertLevel
} from '../../utils/firestoreStorageCalculator';
import { formatDateTimeIT } from '../../utils/tripDates';

export interface DatabaseUsagePanelProps {
  officialMetric: OfficialFirestoreStorageSnapshot;
  onToggleOfficialMetricAvailability?: (available: boolean) => void;
  trips: TripSummary[];
  isBatchCalculating: boolean;
  batchProgress: { current: number; total: number } | null;
  onBatchCalculate: () => void;
  onClearCache?: () => void;
}

export const DatabaseUsagePanel: React.FC<DatabaseUsagePanelProps> = ({
  officialMetric,
  onToggleOfficialMetricAvailability,
  trips,
  isBatchCalculating,
  batchProgress,
  onBatchCalculate,
  onClearCache
}) => {
  // Somma delle stime calcolate sui viaggi attualmente caricati
  const { totalEstimatedDocBytes, totalCountedDocs, detailedTripsCount, partialTripsCount } = useMemo(() => {
    let bytes = 0;
    let docs = 0;
    let detailed = 0;
    let partial = 0;

    trips.forEach(t => {
      bytes += t.estimatedStorageBytes || 0;
      docs += t.docsCount || 1;
      if (t.storageStatus === 'calcolata') {
        detailed++;
      } else {
        partial++;
      }
    });

    return {
      totalEstimatedDocBytes: bytes,
      totalCountedDocs: docs,
      detailedTripsCount: detailed,
      partialTripsCount: partial
    };
  }, [trips]);

  const quotaLimitBytes = officialMetric.quotaLimitBytes || 1073741824; // 1 GiB
  const officialBytes = officialMetric.bytes || 0;
  const isOfficialAvailable = officialMetric.available && officialBytes > 0;

  const percentUsed = isOfficialAvailable
    ? calculateQuotaPercentage(officialBytes, quotaLimitBytes)
    : 0;

  const remainingBytes = isOfficialAvailable
    ? Math.max(0, quotaLimitBytes - officialBytes)
    : 0;

  const alertInfo = isOfficialAvailable
    ? getQuotaAlertLevel(percentUsed)
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Intestazione Pannello */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">📊</span>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Utilizzo Database (Cloud Firestore Spark)</span>
              {alertInfo && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${alertInfo.badgeColorClass}`}>
                  {alertInfo.badgeLabel}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Limite piano gratuito Spark: <strong>1 GiB</strong> (1.073.741.824 byte) • Database <code>(default)</code>
            </p>
          </div>
        </div>

        {/* Azioni del pannello */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={isBatchCalculating || trips.length === 0}
            onClick={onBatchCalculate}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
            title="Esegue una scansione controllata delle sottocollezioni di tutti i viaggi caricati"
          >
            {isBatchCalculating ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Calcolo… ({batchProgress ? `${batchProgress.current}/${batchProgress.total}` : ''})</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Aggiorna stime</span>
              </>
            )}
          </button>

          {onToggleOfficialMetricAvailability && (
            <button
              type="button"
              onClick={() => onToggleOfficialMetricAvailability(!officialMetric.available)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] font-medium transition-colors cursor-pointer"
              title="Test diagnostico: simula la risposta client quando la metrica Cloud Monitoring non è accessibile"
            >
              {officialMetric.available ? '🧪 Simula metrica non disp.' : '🔄 Ripristina metrica'}
            </button>
          )}

          {onClearCache && (
            <button
              type="button"
              onClick={onClearCache}
              className="px-2 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px] cursor-pointer"
              title="Pulisce la cache delle stime archiviata in sessionStorage"
            >
              🧹 Svuota cache
            </button>
          )}
        </div>
      </div>

      {/* Barra di avanzamento se batch in corso */}
      {isBatchCalculating && batchProgress && (
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 rounded-2xl space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-indigo-950 dark:text-indigo-200">
            <span>Calcolo dettagliato dello spazio per ciascun viaggio in corso…</span>
            <span>{Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}% ({batchProgress.current}/{batchProgress.total})</span>
          </div>
          <div className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${(batchProgress.current / Math.max(1, batchProgress.total)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-indigo-700 dark:text-indigo-300 block">
            Conteggio controllato di tappe, alloggi, trasporti, spese, documenti, ristoranti, shopping, note e live feed.
          </span>
        </div>
      )}

      {/* Griglia Metriche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Metrica Ufficiale o Fallback */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Spazio Totale Ufficiale
          </span>
          {isOfficialAvailable ? (
            <>
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {formatStorageBytes(officialBytes)}
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block leading-tight">
                ✓ Cloud Monitoring ufficiale (dati + indici)
              </span>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400 py-1">
                Totale ufficiale non disponibile
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                Metrica API Cloud Monitoring non accessibile senza credenziali server-side.
              </span>
            </>
          )}
        </div>

        {/* Limite Gratuito Spark */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Limite Gratuito Spark
          </span>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
            {formatStorageBytes(quotaLimitBytes)}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
            1 GiB (1.073.741.824 B) standard
          </span>
        </div>

        {/* Percentuale Utilizzata */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Quota Utilizzata
          </span>
          {isOfficialAvailable ? (
            <>
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {percentUsed.toFixed(2)}%
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                Metrica ufficiale verificata
              </span>
            </>
          ) : (
            <>
              <div className="text-xl font-black text-slate-400 font-mono">—</div>
              <span className="text-[10px] text-slate-400 italic block leading-tight">
                Nessuna stima globale inventata
              </span>
            </>
          )}
        </div>

        {/* Spazio Residuo */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Spazio Residuo Gratuito
          </span>
          {isOfficialAvailable ? (
            <>
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {formatStorageBytes(remainingBytes)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                Allocabile prima di qualsiasi limite
              </span>
            </>
          ) : (
            <>
              <div className="text-xl font-black text-slate-400 font-mono">—</div>
              <span className="text-[10px] text-slate-400 italic block leading-tight">
                Non computabile senza totale ufficiale
              </span>
            </>
          )}
        </div>

        {/* Somma Stime Viaggi (Documentale) */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
            Somma Stime Viaggi
          </span>
          <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 font-mono">
            {formatStorageBytes(totalEstimatedDocBytes)}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
            {totalCountedDocs} doc conteggiati • {detailedTripsCount} dett. / {partialTripsCount} parz.
          </span>
        </div>
      </div>

      {/* Barra della Quota Ufficiale o Messaggio Trasparenza */}
      {isOfficialAvailable ? (
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-extrabold text-slate-800 dark:text-slate-200">
              Allocazione Quota Globale Firestore (0 → 1 GiB)
            </span>
            <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
              {percentUsed.toFixed(3)}% utilizzato
            </span>
          </div>

          {/* Barra con soglie 70%, 85%, 95% */}
          <div className="relative w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentUsed >= 95
                  ? 'bg-rose-600'
                  : percentUsed >= 85
                  ? 'bg-amber-600'
                  : percentUsed >= 70
                  ? 'bg-yellow-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(1, Math.min(100, percentUsed))}%` }}
            />
          </div>

          {/* Indicatori delle soglie */}
          <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
            <span>0 GiB</span>
            <span className="text-yellow-600 dark:text-yellow-400 font-semibold">Soglia 70%</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Allerta 85%</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Critico 95%</span>
            <span>1 GiB</span>
          </div>

          {/* Alert Callout se quota elevata */}
          {alertInfo && alertInfo.level !== 'normal' && (
            <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${alertInfo.badgeColorClass}`}>
              <span className="text-base">⚠️</span>
              <span>{alertInfo.description}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <span className="text-base shrink-0">ℹ️</span>
          <div className="space-y-0.5">
            <p className="font-bold">Trasparenza Hounigo: Totale Ufficiale Non Disponibile dal Client</p>
            <p className="text-[11px] opacity-90 leading-relaxed">
              Google Cloud Firestore non espone la metrica complessiva di archiviazione all'SDK Web client senza credenziali Google Cloud privilegiate.
              La visualizzazione mostra separatamente la somma delle stime documentali dei viaggi senza inventare percentuali di quota o totali fittizi.
            </p>
          </div>
        </div>
      )}

      {/* Note e Timestamp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
        <div>
          <span>Metodo di calcolo: </span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            Regole ufficiali Google Firestore (path + 32 B overhead + campi UTF-8). Overhead indici computato unicamente nella metrica ufficiale.
          </span>
        </div>
        <div className="shrink-0 font-mono">
          Ultimo aggiornamento metrica:{' '}
          <strong className="text-slate-600 dark:text-slate-300">
            {isOfficialAvailable ? formatDateTimeIT(officialMetric.measuredAt) : 'Non disponibile'}
          </strong>
        </div>
      </div>
    </div>
  );
};
