import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getPreActivationSyncReport,
  allowCloudWriteForTrip0000,
  executeControlledReconciliation,
  type PreActivationSyncReport
} from '../../storage/syncService';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import { getTripConfig } from '../../utils/tripConfig';

interface PreActivationDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PreActivationDiagnosticModal({ isOpen, onClose }: PreActivationDiagnosticModalProps) {
  const [report, setReport] = useState<PreActivationSyncReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const { cloudRole, currentUser } = useAuthIdentity();
  const tripConfig = getTripConfig();
  const tripId = tripConfig?.id || '0000';

  const isOwner = cloudRole === 'owner' ||
    (Boolean(currentUser?.uid) && !currentUser?.isAnonymous && Boolean(tripConfig?.ownerUid) && currentUser?.uid === tripConfig?.ownerUid);

  const reloadReport = () => {
    setLoading(true);
    getPreActivationSyncReport(tripId)
      .then((rep) => {
        setReport(rep);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    reloadReport();
    setActionFeedback(null);
  }, [isOpen, tripId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const hasConflicts = (report?.conflictsCount ?? 0) > 0 || (report?.items?.some(i => i.hasPotentialConflict) ?? false);

  const handleReconcileAndUnlock = async () => {
    if (!isOwner) return;
    if (hasConflicts) {
      setActionFeedback({
        type: 'error',
        message: 'Riconciliazione bloccata: sono presenti conflitti rilevati rispetto al server che richiedono verifica.'
      });
      return;
    }

    setReconciling(true);
    setActionFeedback(null);

    try {
      const res = await executeControlledReconciliation(tripId);
      const rep = await getPreActivationSyncReport(tripId);
      setReport(rep);

      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: `✓ Riconciliazione completata con successo! ${res.pushedCount} mutazioni confermate da Firestore.`
        });
      } else if (res.errors.length > 0) {
        setActionFeedback({
          type: 'error',
          message: `Errore sincronizzazione: ${res.errors.join(' | ')}. Tutte le modifiche locali rimangono intatte nella coda.`
        });
      } else {
        setActionFeedback({
          type: 'info',
          message: `Riconciliazione parziale: ${res.remainingCount} elementi rimasti in attesa nella coda protetta.`
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: `Eccezione: ${err?.message || String(err)}. Dati locali protetti e inalterati.`
      });
    } finally {
      setReconciling(false);
    }
  };

  const handleRelock = async () => {
    if (!isOwner) return;
    allowCloudWriteForTrip0000(false);
    const rep = await getPreActivationSyncReport(tripId);
    setReport(rep);
    setActionFeedback({
      type: 'info',
      message: 'Scritture Cloud ri-bloccate con successo. Modalità pre-attivazione protetta attiva.'
    });
  };

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
        className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto outline-none"
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
                Viaggio {tripId} • {isOwner ? 'Modalità Gestione Owner' : 'Accesso Sola Lettura / Copilota'}
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

        {/* Feedback Banner */}
        {actionFeedback && (
          <div className={`p-3 rounded-2xl text-xs font-medium border animate-in fade-in duration-200 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : actionFeedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}>
            {actionFeedback.message}
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500 space-y-2">
            <span className="inline-block animate-spin text-lg">⏳</span>
            <p>Caricamento diagnostica e verifica versioni remote…</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Sezione 1: Stato Blocco Scritture Cloud */}
            <div className={`p-3.5 rounded-2xl border ${
              report?.isCloudWriteAllowed
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-extrabold text-xs">
                  <span>{report?.isCloudWriteAllowed ? '⚠️' : '🔒'}</span>
                  <span>Scritture Cloud: {report?.isCloudWriteAllowed ? 'ABILITATE (Attivazione eseguita)' : 'BLOCCATE (Pre-attivazione attiva)'}</span>
                </div>
              </div>
              <p className="text-[11px] mt-1 opacity-90 leading-relaxed">
                {report?.isCloudWriteAllowed
                  ? 'Il dispositivo ha autorizzazione alla sincronizzazione remota su Firestore.'
                  : 'Nessuna operazione locale di scrittura o cancellazione può raggiungere Firestore senza sblocco autorizzato.'}
              </p>
              {isOwner && report?.isCloudWriteAllowed && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleRelock}
                    className="px-3 py-1.5 rounded-xl font-bold text-[11px] bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700/60 transition-colors cursor-pointer"
                  >
                    🔒 Ripristina Blocco Scritture Cloud
                  </button>
                </div>
              )}
            </div>

            {/* Sezione 2: Coda Mutazioni Locali con Anteprima Sicura */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Coda Mutazioni Locali
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  {report?.pendingCount ?? 0} in sospeso
                </span>
              </div>

              {report && Object.keys(report.pendingByType).length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  {Object.entries(report.pendingByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                      <span className="capitalize text-slate-600 dark:text-slate-400 font-medium">{type}</span>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">{count}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Anteprima Documenti Pendenti (Sola Lettura Senza Dati Sensibili) */}
              {report && report.items && report.items.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Anteprima Protetta Mutazioni (Senza Dati Sensibili)
                  </p>
                  {report.items.map((item, idx) => (
                    <div
                      key={`${item.id}_${idx}`}
                      className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                          {item.previewTitle || item.id}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono capitalize">
                          {item.entityType} • {item.action}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">
                          {new Date(item.timestamp).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        {item.hasPotentialConflict ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            ⚠️ Conflitto ({item.conflictReason})
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            ✓ Conflitti: Nessuno (Pronto)
                          </span>
                        )}
                      </div>
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
                  Archivio Conflitti Isolato
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
                  ✓ Nessun conflitto riscontrato nell'archivio.
                </p>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                Archiviati in HounigoConflictArchiveDB (mai inviati a Firestore).
              </p>
            </div>

            {/* Sezione 4: Azione Riconciliazione (Riservata Owner) */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200">
                  {isOwner ? 'Comando Riconciliazione Controllata' : 'Informazioni Sincronizzazione Copilota'}
                </span>
              </div>

              {isOwner ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {!report?.isCloudWriteAllowed
                      ? 'In qualità di Owner verificato, puoi avviare la riconciliazione controllata delle modifiche pendenti verso Firestore. Le versioni remote vengono confrontate prima della scrittura e la coda locale viene liberata solo dopo conferma del server.'
                      : 'La sincronizzazione cloud è già attiva sul dispositivo.'}
                  </p>

                  {!report?.isCloudWriteAllowed && (
                    <button
                      type="button"
                      disabled={reconciling || hasConflicts}
                      onClick={handleReconcileAndUnlock}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        reconciling || hasConflicts
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-indigo-500/20 active:scale-[0.98]'
                      }`}
                    >
                      {reconciling ? (
                        <>
                          <span className="animate-spin text-sm">⏳</span>
                          <span>Riconciliazione e Push in corso…</span>
                        </>
                      ) : (
                        <>
                          <span>🚀</span>
                          <span>Sblocca ed Esegui Riconciliazione (Owner)</span>
                        </>
                      )}
                    </button>
                  )}

                  {hasConflicts && (
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                      ⚠️ Riconciliazione disabilitata per presenza di conflitti non risolti.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  ℹ️ <strong>Ricezione Automatica Copilota:</strong> Il dispositivo riceve automaticamente tutti gli aggiornamenti dal server in background tramite listener Firestore live. Non è richiesta alcuna azione tecnica da parte del Copilota.
                </div>
              )}
            </div>

            {/* Note di sicurezza e garanzia privacy */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400 space-y-1 leading-relaxed">
              <p>🔒 <strong>Zero leak dati sensibili:</strong> Questa schermata visualizza solo titoli o identificativi sanificati. Nessun PIN, PNR, password, prezzo o allegato privato viene esposto.</p>
              <p>🛡️ <strong>Integrità coda garantita:</strong> Nessun elemento della coda viene rimosso prima che Firestore abbia confermato con successo la scrittura atomica.</p>
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
