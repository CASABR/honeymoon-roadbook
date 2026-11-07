import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getPreActivationSyncReport, type PreActivationSyncReport } from '../../storage/syncService';
import { getTripConfig } from '../../utils/tripConfig';

interface PreActivationDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PreActivationDiagnosticModal({ isOpen, onClose }: PreActivationDiagnosticModalProps) {
  const [report, setReport] = useState<PreActivationSyncReport | null>(null);
  const [loading, setLoading] = useState(true);

  const tripConfig = getTripConfig();
  const tripId = tripConfig?.id || '0000';

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);

    getPreActivationSyncReport(tripId)
      .then((rep) => {
        if (isMounted) {
          setReport(rep);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, tripId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0 border border-indigo-100 dark:border-indigo-900/50">
              🛡️
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Diagnostica Pre-Attivazione
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Viaggio {tripId} • Sola Lettura
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500 space-y-2">
            <span className="inline-block animate-spin text-lg">⏳</span>
            <p>Caricamento diagnostica in sola lettura…</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Sezione 1: Stato Blocco Scritture Cloud */}
            <div className={`p-3.5 rounded-2xl border ${
              report?.isCloudWriteAllowed
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2 font-extrabold text-xs">
                <span>{report?.isCloudWriteAllowed ? '⚠️' : '🔒'}</span>
                <span>Scritture Cloud: {report?.isCloudWriteAllowed ? 'ABILITATE (Attivazione eseguita)' : 'BLOCCATE (Pre-attivazione attiva)'}</span>
              </div>
              <p className="text-[11px] mt-1 opacity-90 leading-relaxed">
                {report?.isCloudWriteAllowed
                  ? 'Il dispositivo ha autorizzazione alla sincronizzazione remota.'
                  : 'Nessuna operazione di scrittura o cancellazione può raggiungere Firestore senza sblocco autorizzato.'}
              </p>
            </div>

            {/* Sezione 2: Coda Mutazioni Pendenti */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Coda Mutazioni Locali
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  {report?.pendingCount ?? 0} in sospeso
                </span>
              </div>

              {report && Object.keys(report.pendingByType).length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {Object.entries(report.pendingByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                      <span className="capitalize text-slate-600 dark:text-slate-400 font-medium">{type}</span>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                  Nessuna modifica locale in attesa.
                </p>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                Archiviate durabilmente in HounigoLocalQueueDB (isolate da settings).
              </p>
            </div>

            {/* Sezione 3: Archivio Conflitti Isolato */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Archivio Conflitti
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  (report?.conflictsCount ?? 0) > 0
                    ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {report?.conflictsCount ?? 0} rilevati
                </span>
              </div>

              {report && Object.keys(report.conflictsByType).length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {Object.entries(report.conflictsByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
                        {type === 'remote_tombstone_vs_local_edit' ? 'Tombstone vs Modifica locale' : type}
                      </span>
                      <span className="font-extrabold text-rose-600 dark:text-rose-400">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-0.5">
                  ✓ Nessun conflitto riscontrato.
                </p>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                Archiviati in HounigoConflictArchiveDB (mai inviati a Firestore).
              </p>
            </div>

            {/* Note di sicurezza e garanzia privacy */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400 space-y-1 leading-relaxed">
              <p>🔒 <strong>Zero leak di dati sensibili:</strong> Questa schermata riporta esclusivamente metadati e conteggi numerici. Nessun PIN, PNR, prezzo o allegato privato viene esposto.</p>
              <p>🛑 <strong>Nessuna azione di rete:</strong> Questa vista opera in sola lettura locale e non attiva sincronizzazioni.</p>
            </div>
          </div>
        )}

        {/* Pulsante Chiusura */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
        >
          Chiudi Diagnostica
        </button>
      </div>
    </div>,
    document.body
  );
}

