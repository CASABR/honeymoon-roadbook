import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  getPreActivationSyncReport,
  allowCloudWriteForTrip0000,
  executeControlledReconciliation,
  resolveControlledConflict,
  enableCopilotBidirectionalSync,
  getActiveSyncService,
  setLastSyncError,
  type PreActivationSyncReport
} from '../../storage/syncService';
import { useAuthIdentity } from '../../utils/useAuthIdentity';
import { getTripConfig } from '../../utils/tripConfig';

interface PreActivationDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDiffDisplay(val: any): string {
  if (val === null || val === undefined) return '(non impostato)';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (typeof val === 'object') {
    const lat = val.lat ?? val.latitude;
    const lng = val.lng ?? val.longitude ?? val.lon;
    if (lat !== undefined && lng !== undefined) {
      const nLat = Number(lat);
      const nLng = Number(lng);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        return `Lat ${nLat.toFixed(5)}, Lng ${nLng.toFixed(5)}`;
      }
    }
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

export default function PreActivationDiagnosticModal({ isOpen, onClose }: PreActivationDiagnosticModalProps) {
  const [report, setReport] = useState<PreActivationSyncReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [tripConfig, setTripConfigState] = useState(() => getTripConfig());

  const { cloudRole, currentUser } = useAuthIdentity();
  const tripId = tripConfig?.id || '0000';
  const activeTripTitle = report?.tripTitle || tripConfig?.title || `Viaggio ${tripId}`;

  const isOwner = cloudRole === 'owner' ||
    (Boolean(currentUser?.uid) && !currentUser?.isAnonymous && Boolean(tripConfig?.ownerUid) && currentUser?.uid === tripConfig?.ownerUid);

  const isCopilota = cloudRole === 'copilota' && !isOwner;
  const copilotName = currentUser?.displayName || (tripId === '0000' ? 'Giusy' : '');
  const copilotSuffix = copilotName ? ` (${copilotName})` : '';

  // Diagnostica differenziata dei 4 stati operativi (senza esporre credenziali)
  const isOnline = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
  const isPermissionError = Boolean(
    report?.lastSyncFailure?.isPermissionError ||
    (report?.lastSyncError &&
     (report.lastSyncError.includes('Missing or insufficient permissions') ||
      report.lastSyncError.includes('permission-denied') ||
      report.lastSyncError.includes('insufficient permissions')))
  );
  const isNetworkError = !isOnline || Boolean(
    report?.lastSyncError &&
    (report.lastSyncError.includes('network') ||
     report.lastSyncError.includes('unavailable') ||
     report.lastSyncError.includes('offline') ||
     report.lastSyncError.includes('timeout'))
  );
  const hasUnresolvedConflict = Boolean(
    (report?.conflictsCount ?? 0) > 0 ||
    report?.items?.some(i => i.hasPotentialConflict && !i.isAlreadySynchronized)
  );

  let diagnosisBadge = '';
  let diagnosisBadgeClass = '';
  let diagnosisTitle = '';
  let diagnosisExplanation = '';
  let diagnosisAction = '';

  if (isNetworkError) {
    diagnosisBadge = 'Rete non disponibile';
    diagnosisBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    diagnosisTitle = 'Connessione di Rete Assente o Instabile';
    diagnosisExplanation = 'Il dispositivo non riesce a raggiungere i server Cloud. I salvataggi e le cancellazioni rimangono protetti nella memoria locale.';
    diagnosisAction = 'Verifica la connessione Wi-Fi o dati cellulari. La sincronizzazione si riattiverà automaticamente.';
  } else if (!currentUser || currentUser.isAnonymous) {
    diagnosisBadge = 'Accesso non effettuato';
    diagnosisBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800';
    diagnosisTitle = 'Sessione Anonima / Non Autenticata';
    diagnosisExplanation = 'Le scritture sul viaggio 0000 richiedono l\'accesso con account Google. Attualmente il dispositivo opera senza credenziali autenticate.';
    diagnosisAction = 'Apri Impostazioni > Account ed effettua l\'accesso con l\'account Google autorizzato (Owner o Copilota).';
  } else if (!isOwner && !isCopilota) {
    diagnosisBadge = 'Account non autorizzato';
    diagnosisBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800';
    diagnosisTitle = 'Account Connesso Privo di Autorizzazione';
    diagnosisExplanation = 'L\'account Google connesso non risulta abilitato con ruolo di scrittura (Owner o Copilota) sul viaggio 0000.';
    diagnosisAction = 'Accedi con l\'account Google associato al viaggio oppure richiedi l\'invito Copilota all\'Owner.';
  } else if (isPermissionError) {
    diagnosisBadge = 'Permessi non sufficienti';
    diagnosisBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800';
    diagnosisTitle = 'Scrittura Rifiutata da Firestore (Regole di Sicurezza)';
    const fail = report?.lastSyncFailure;
    if (fail?.phase === 'batch_credentials_public' && fail.batchIndistinguishable) {
      diagnosisExplanation = `Fase fallita: Batch atomico ("${fail.entityType}" + private_credentials). Firestore ha respinto la transazione: l'errore del batch atomico non permette di distinguere se il rifiuto riguarda la cassaforte privata o il documento pubblico. Il ruolo Owner mostrato nell'interfaccia non garantisce che ogni scrittura sia consentita dalle regole Cloud.`;
    } else if (fail?.phase === 'tombstone_setting') {
      diagnosisExplanation = `Fase fallita: Salvataggio impostazioni/tombstone su Firestore (settings/${fail.dataId || ''}). Scrittura rifiutata dalle Security Rules.`;
    } else if (fail?.phase === 'public_document') {
      diagnosisExplanation = `Fase fallita: Salvataggio documento pubblico "${fail.entityType}". Scrittura rifiutata dalle Security Rules.`;
    } else {
      diagnosisExplanation = 'La scrittura verso Firestore è stata respinta per permessi non sufficienti. Il ruolo Owner mostrato nella UI non garantisce che le regole Cloud consentano questa operazione.';
    }
    diagnosisAction = 'Verifica che l\'account Google connesso corrisponda all\'ownerUid sul documento Firestore /trips/0000 e che i dati rispettino lo schema protetto.';
  } else if (report?.lastSyncError) {
    diagnosisBadge = 'Errore sincronizzazione';
    diagnosisBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800';
    diagnosisTitle = 'Errore Attivo Durante il Push';
    diagnosisExplanation = `Operazione cloud interrotta: ${report.lastSyncError}`;
    diagnosisAction = 'Controlla la coda pendente e riprova la sincronizzazione.';
  } else if (hasUnresolvedConflict) {
    diagnosisBadge = 'Conflitto dati';
    diagnosisBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800';
    diagnosisTitle = 'Conflitto Dati o Timestamp Discordante';
    diagnosisExplanation = 'Sono presenti elementi in coda con timestamp non allineati o modifiche concorrenti registrate nel Cloud.';
    diagnosisAction = 'Verifica gli elementi nella sezione "Risoluzione Conflitti" per allinearli in sicurezza.';
  } else {
    diagnosisBadge = 'Autorizzato';
    diagnosisBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
    diagnosisTitle = 'Stato Regolare e Autorizzato';
    diagnosisExplanation = 'Dispositivo connesso e riconosciuto dal Cloud. La sincronizzazione bidirezionale è operativa.';
    diagnosisAction = '';
  }

  const reloadReport = useCallback((silent = false, forceFresh = false) => {
    const currentCfg = getTripConfig();
    setTripConfigState(currentCfg);
    const activeId = currentCfg?.id || '0000';
    if (!silent) setLoading(true);
    getPreActivationSyncReport(activeId, { forceFresh })
      .then((rep) => {
        setReport(rep);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    reloadReport();
    setActionFeedback(null);
  }, [isOpen, tripId, reloadReport]);

  useEffect(() => {
    if (!isOpen) return;
    const handleLiveUpdate = () => reloadReport(true);
    window.addEventListener('trip_config_changed', handleLiveUpdate);
    window.addEventListener('roadbook_sync_status_changed', handleLiveUpdate);
    window.addEventListener('roadbook_cloud_synced', handleLiveUpdate);
    window.addEventListener('online', handleLiveUpdate);
    window.addEventListener('offline', handleLiveUpdate);
    return () => {
      window.removeEventListener('trip_config_changed', handleLiveUpdate);
      window.removeEventListener('roadbook_sync_status_changed', handleLiveUpdate);
      window.removeEventListener('roadbook_cloud_synced', handleLiveUpdate);
      window.removeEventListener('online', handleLiveUpdate);
      window.removeEventListener('offline', handleLiveUpdate);
    };
  }, [isOpen, reloadReport]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const hasConflicts = (report?.conflictsCount ?? 0) > 0 || (report?.items?.some(i => i.hasPotentialConflict && !i.isAlreadySynchronized) ?? false);

  const handleRetrySyncNow = async () => {
    setReconciling(true);
    setActionFeedback(null);
    try {
      setLastSyncError(tripId, null);
      const svc = getActiveSyncService();
      if (svc && svc.getTripId() === tripId) {
        await svc.flushPendingQueue();
        await svc.syncBidirectional();
      }
      const rep = await getPreActivationSyncReport(tripId, { forceFresh: true });
      setReport(rep);
      if (!rep.hasActiveErrors && rep.pendingCount === 0) {
        setActionFeedback({ type: 'success', message: '✓ Sincronizzazione completata con successo.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Riprova non riuscita: ${err?.message || err}` });
    } finally {
      setReconciling(false);
    }
  };

  const handleResolveConflict = async (conflictId: string, resolution: 'mark_synced' | 'keep_remote' | 'keep_local') => {
    if (!isOwner) return;
    setReconciling(true);
    setActionFeedback(null);
    try {
      const res = await resolveControlledConflict(tripId, conflictId, resolution);
      const rep = await getPreActivationSyncReport(tripId);
      setReport(rep);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: `Risoluzione conflitto non riuscita: ${err?.message || err}`
      });
    } finally {
      setReconciling(false);
    }
  };

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
        if (res.pushedCount > 0) {
          setActionFeedback({
            type: 'success',
            message: `✓ Riconciliazione completata ed attivazione riuscita! ${res.pushedCount} mutazioni confermate da Firestore. Sincronizzazione cloud ora ATTIVA.`
          });
        } else {
          setActionFeedback({
            type: 'success',
            message: `✓ Sincronizzazione Cloud abilitata con successo! Coda verificata e allineata. Sincronizzazione in tempo reale ora ATTIVA.`
          });
        }
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
    if (!isOwner && !isCopilota) return;
    allowCloudWriteForTrip0000(false);
    const rep = await getPreActivationSyncReport(tripId);
    setReport(rep);
    setActionFeedback({
      type: 'info',
      message: 'Scritture Cloud ri-bloccate con successo. Modalità pre-attivazione protetta attiva.'
    });
  };

  const handleEnableCopilotSync = async () => {
    if (!isCopilota) return;
    setReconciling(true);
    setActionFeedback(null);
    try {
      const res = await enableCopilotBidirectionalSync(tripId);
      const rep = await getPreActivationSyncReport(tripId);
      setReport(rep);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: '✓ Sincronizzazione bidirezionale Copilota abilitata con successo (privilegi conformi a Copilota).'
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: `Attivazione Copilota bloccata: ${err?.message || err}`
      });
    } finally {
      setReconciling(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="app-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0 border border-indigo-100 dark:border-indigo-900/50">
              🛡️
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Stato & Attivazione Sincronizzazione
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <strong className="text-slate-700 dark:text-slate-200">{activeTripTitle}</strong> ({tripId}) • {isOwner ? 'Owner' : isCopilota ? `Copilota${copilotSuffix}` : 'Sola Lettura'}
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
            <p>Verifica stato sincronizzazione in corso…</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Riepilogo Immediato Comprensibile per l'Utente (P0 Sezione 2.2) */}
            <div className={`p-4 rounded-2xl border space-y-2 ${
              report?.userFriendlyStatus === 'Sincronizzazione attiva'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                : report?.userFriendlyStatus === 'Conflitto da verificare' || report?.userFriendlyStatus === 'Errore di sincronizzazione'
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <span>
                    {report?.userFriendlyStatus === 'Sincronizzazione attiva' ? '🟢' :
                     report?.userFriendlyStatus === 'Conflitto da verificare' ? '⚠️' :
                     report?.userFriendlyStatus === 'Errore di sincronizzazione' ? '🔴' :
                     report?.userFriendlyStatus === 'Nessuna connessione' ? '📡' : '⏳'}
                  </span>
                  <span>{report?.userFriendlyStatus || 'In attesa di attivazione'}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/60 border border-current/20">
                  {report?.pendingCount ?? 0} in attesa
                </span>
              </div>

              <div className="text-[11px] opacity-90 space-y-1">
                <p>
                  <strong>Viaggio attivo:</strong> {activeTripTitle} <span className="font-mono text-[10px]">({tripId})</span>
                </p>
                <p>
                  <strong>Ultimo aggiornamento riuscito:</strong>{' '}
                  {report?.lastSyncAt
                    ? new Date(report.lastSyncAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' })
                    : 'In attesa del primo allineamento'}
                </p>
              </div>

              {report?.lastSyncError && (
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-200 space-y-1.5">
                  <p className="font-bold">⚠️ Errore rilevato durante l&apos;ultimo invio:</p>
                  <p className="font-mono text-[10px] break-words">{report.lastSyncError}</p>
                  <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                    {isPermissionError
                      ? (!currentUser || currentUser.isAnonymous
                          ? 'Causa verificata: sessione non autenticata. Firestore respinge le scritture sul Cloud senza un account Google verificato.'
                          : (!isOwner && !isCopilota
                              ? 'Causa verificata: account connesso ma non autorizzato a scrivere sul viaggio 0000.'
                              : (report.lastSyncFailure?.phase === 'batch_credentials_public'
                                  ? 'Causa: Rifiuto scrittura atomica batch (entità + private_credentials). Firestore non specifica quale dei due documenti ha violato le regole di sicurezza.'
                                  : report.lastSyncFailure?.phase === 'tombstone_setting'
                                  ? 'Causa: Rifiuto scrittura tombstone/impostazioni da parte delle regole di sicurezza Firestore.'
                                  : report.lastSyncFailure?.phase === 'public_document'
                                  ? `Causa: Rifiuto scrittura documento pubblico "${report.lastSyncFailure.entityType}" da parte delle regole di sicurezza Firestore.`
                                  : 'Causa: Scrittura rifiutata da Firestore Security Rules. Il ruolo Owner mostrato nell\'interfaccia non garantisce che i permessi Cloud consentano questa operazione.')))
                      : isNetworkError
                        ? 'Causa verificata: mancata risposta di rete dai server Cloud.'
                        : 'Causa: anomalia durante la trasmissione del payload.'}
                  </p>
                  <button
                    type="button"
                    disabled={reconciling}
                    onClick={handleRetrySyncNow}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer transition-colors"
                  >
                    🔄 Riprova sincronizzazione ora
                  </button>
                </div>
              )}
            </div>

            {/* Box Diagnostica Chiara: Distinzione dei 4 stati operativi */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Diagnostica Autorizzazione &amp; Sincronizzazione
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${diagnosisBadgeClass}`}>
                  {diagnosisBadge}
                </span>
              </div>
              <div className="text-[11px] space-y-1">
                <p className="font-extrabold text-slate-800 dark:text-slate-200">
                  {diagnosisTitle}
                </p>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {diagnosisExplanation}
                </p>
                {diagnosisAction && (
                  <p className="text-indigo-600 dark:text-indigo-400 font-semibold pt-0.5">
                    💡 Azione richiesta: {diagnosisAction}
                  </p>
                )}
              </div>
            </div>

            {/* Sezione Dettagli Tecnici Avanzati (Espandibile) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedDetails(prev => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span>🔍 Dettagli tecnici avanzati (Coda: {report?.pendingCount ?? 0} • Storico: {report?.archivedLocalOnlyCount ?? 0})</span>
                <span className="text-[11px] text-slate-400">{showAdvancedDetails || (report?.pendingCount ?? 0) > 0 ? '▲' : '▼'}</span>
              </button>

              {(showAdvancedDetails || (report?.pendingCount ?? 0) > 0) && (
                <div className="p-3.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60 space-y-3">
                  {/* Stato tecnico blocco scritture */}
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                    <span>Scritture Cloud: <strong>{report?.isCloudWriteAllowed ? 'ABILITATE' : 'BLOCCATE'}</strong></span>
                    {(isOwner || isCopilota) && report?.isCloudWriteAllowed && (
                      <button
                        type="button"
                        onClick={handleRelock}
                        className="px-2.5 py-1 rounded-lg font-bold text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 transition-colors cursor-pointer"
                      >
                        🔒 Blocca Scritture
                      </button>
                    )}
                  </div>

                  {report && Object.keys(report.pendingByType).length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
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
                    <div className="space-y-1.5">
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
                            {item.isAlreadySynchronized ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                ✓ Già allineato su Cloud
                              </span>
                            ) : item.hasPotentialConflict ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                ⚠️ Conflitto ({
                                  item.conflictReason === 'unreliable_timestamp_conflict'
                                    ? 'timestamp discordante'
                                    : item.conflictReason === 'remote_tombstone_present'
                                    ? 'record cancellato su Cloud'
                                    : item.conflictReason === 'server_newer'
                                    ? 'versione Cloud più recente'
                                    : item.conflictReason
                                })
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                ✓ Conflitti: Nessuno (Pronto)
                              </span>
                            )}
                          </div>

                          {item.schemaSummary && (
                            <details className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 group">
                              <summary className="cursor-pointer font-bold select-none text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-between">
                                <span>🔍 Diagnostica Schema (solo nomi &amp; tipi)</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                                  item.schemaSummary.publicSchemaVersion === 2
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}>
                                  v{item.schemaSummary.publicSchemaVersion}
                                </span>
                              </summary>
                              <div className="mt-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 font-mono text-[9px] space-y-1.5">
                                <div>
                                  <p className="font-bold text-slate-500 uppercase tracking-wider text-[8px]">Campi Payload Locale ({item.schemaSummary.fieldNames.length}):</p>
                                  <p className="text-slate-700 dark:text-slate-300 break-words">
                                    {item.schemaSummary.fieldNames.map(k => `${k} (${item.schemaSummary!.fieldTypes[k]})`).join(', ')}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider text-[8px]">Doc Pubblico ({item.schemaSummary.publicKeys.length}):</p>
                                  <p className="text-slate-700 dark:text-slate-300 break-words">
                                    {item.schemaSummary.publicKeys.join(', ')}
                                  </p>
                                </div>
                                {item.schemaSummary.privateKeys.length > 0 && (
                                  <div>
                                    <p className="font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider text-[8px]">Cassaforte Privata ({item.schemaSummary.privateKeys.length}):</p>
                                    <p className="text-slate-700 dark:text-slate-300 break-words">
                                      {item.schemaSummary.privateKeys.join(', ')}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Nessuna modifica locale in attesa in HounigoLocalQueueDB.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Sezione 3: FASE 1 - Risoluzione Conflitti Guidata (Se presenti) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                    FASE 1
                  </span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Risoluzione Conflitti
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  (report?.conflictsCount ?? 0) > 0
                    ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {(report?.conflictsCount ?? 0) > 0 ? `${report?.conflictsCount} da verificare` : '✓ 0 conflitti attivi'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Allinea i singoli elementi discordanti o contrassegnali come già sincronizzati. Questa operazione locale <strong>NON</strong> invia scritture a Firestore.
              </p>

              {report && Object.keys(report.conflictsByType).length > 0 ? (
                <div className="space-y-1.5 pt-0.5">
                  {Object.entries(report.conflictsByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
                        {type === 'remote_tombstone_vs_local_edit'
                          ? 'Tombstone vs Modifica locale'
                          : type === 'unreliable_timestamp_conflict'
                          ? 'Timestamp incerto / documento remoto presente'
                          : type === 'local_only_record'
                          ? 'Record presente solo in locale (preservato)'
                          : type}
                      </span>
                      <span className="font-extrabold text-rose-600 dark:text-rose-400">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                  ✓ Fase 1 completata: nessun conflitto attivo nell'archivio. Puoi procedere alla Fase 2 sottostante.
                </div>
              )}

              {/* Schede Dettaglio e Risoluzione Conflitti */}
              {report?.conflictItems && report.conflictItems.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Dettaglio Conflitti e Risoluzione Guidata
                  </p>
                  {report.conflictItems.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[200px]">
                          {c.previewTitle || c.dataId}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-mono">
                          {c.entityType}
                        </span>
                      </div>

                      {c.isEquivalent ? (
                        <div className="space-y-2 pt-0.5">
                          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
                            ✓ <strong>Contenuto già identico su Firestore:</strong> I campi pubblici dell'attività coincidono esattamente con la versione presente nel Cloud. Non occorre alcuna riscrittura né cancellazione di credenziali private.
                          </div>
                          {isOwner && (
                            <button
                              type="button"
                              disabled={reconciling}
                              onClick={() => handleResolveConflict(c.id, 'mark_synced')}
                              className="w-full py-2 px-3 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
                            >
                              {reconciling ? (
                                <span className="animate-spin text-sm">⏳</span>
                              ) : (
                                <span>✓</span>
                              )}
                              <span>Risolvi Conflitto (Contrassegna come già sincronizzato)</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2 pt-0.5">
                          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] text-rose-800 dark:text-rose-200 space-y-1">
                            <p className="font-bold">⚠️ Rilevate differenze tra iPhone e Cloud:</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                              {c.differences.map((d, di) => (
                                <div key={di} className="p-1 rounded bg-white/60 dark:bg-slate-900/60">
                                  <span className="font-bold">{d.field}:</span> iPhone="{formatDiffDisplay(d.localVal)}" vs Cloud="{formatDiffDisplay(d.remoteVal)}"
                                </div>
                              ))}
                            </div>
                          </div>
                          {isOwner && (
                            <div className="grid grid-cols-2 gap-2 pt-0.5">
                              <button
                                type="button"
                                disabled={reconciling}
                                onClick={() => handleResolveConflict(c.id, 'keep_remote')}
                                className="py-1.5 px-2.5 rounded-xl font-bold text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                              >
                                Mantieni Cloud
                              </button>
                              <button
                                type="button"
                                disabled={reconciling}
                                onClick={() => handleResolveConflict(c.id, 'keep_local')}
                                className="py-1.5 px-2.5 rounded-xl font-bold text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                              >
                                Applica iPhone
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                Archiviati in HounigoConflictArchiveDB (mai inviati a Firestore).
              </p>
            </div>

            {/* Sezione 4: FASE 2 - Attivazione Sincronizzazione Cloud (Owner / Copilota) */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border-2 border-indigo-200/80 dark:border-indigo-800/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                    FASE 2
                  </span>
                  <span className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200">
                    {isOwner
                      ? 'Attivazione Sincronizzazione (Owner)'
                      : isCopilota
                      ? `Attivazione Sincronizzazione (Copilota${copilotSuffix})`
                      : 'Informazioni Sola Lettura'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  report?.isCloudWriteAllowed
                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                }`}>
                  {report?.isCloudWriteAllowed ? '🟢 Attiva' : '🔒 Bloccata'}
                </span>
              </div>

              {isOwner ? (
                <div className="space-y-2.5 pt-1">
                  {hasConflicts ? (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] text-rose-800 dark:text-rose-200 leading-relaxed font-medium">
                      ⚠️ <strong>Attivazione Bloccata:</strong> Prima di procedere all'attivazione, devi completare la <strong>Fase 1</strong> sopra risolvendo i conflitti aperti.
                    </div>
                  ) : null}

                  {report?.isCloudWriteAllowed ? (
                    (report.hasActiveErrors || isPermissionError || Boolean(report.lastSyncError)) ? (
                      <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          <span>⚠️</span>
                          <span>Sincronizzazione Cloud Sospesa da Errore</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          {isPermissionError
                            ? 'Scritture abilitate ma bloccate da Firestore (permessi non sufficienti o rifiuto transazione atomica). Le modifiche rimangono protette in locale.'
                            : 'Scritture abilitate ma interrotte da un errore attivo. I dati locali rimangono al sicuro in attesa di allineamento.'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          <span>✓</span>
                          <span>Sincronizzazione Cloud ATTIVA ed Operativa</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          Il tuo iPhone Owner sta sincronizzando in tempo reale bidirezionale con Firestore.
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {report?.pendingCount === 0 ? (
                        <>✓ <strong>Coda pulita (0 mutazioni) e zero conflitti:</strong> I controlli di sicurezza (Owner verificato, connessione di rete, integrità dati) sono superati. Clicca il pulsante sotto per attivare la sincronizzazione continua bidirezionale.</>
                      ) : (
                        <>Sono presenti <strong>{report?.pendingCount} modifiche locali</strong> in attesa. Clicca per verificare le versioni remote, riconciliarle con Firestore e attivare la sincronizzazione continua.</>
                      )}
                    </div>
                  )}

                  {!report?.isCloudWriteAllowed ? (
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
                          <span>Attivazione e verifica in corso…</span>
                        </>
                      ) : hasConflicts ? (
                        <>
                          <span>⚠️</span>
                          <span>Attivazione Bloccata (Risolvi Conflitti in Fase 1)</span>
                        </>
                      ) : report?.pendingCount === 0 ? (
                        <>
                          <span>🚀</span>
                          <span>Attiva Sincronizzazione Cloud Bidirezionale (Owner)</span>
                        </>
                      ) : (
                        <>
                          <span>🚀</span>
                          <span>Sincronizza Coda e Attiva Sincronizzazione ({report?.pendingCount} in attesa)</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRelock}
                      className="w-full py-2 px-3 rounded-xl font-bold text-[11px] bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 transition-colors cursor-pointer"
                    >
                      🔒 Ripristina Blocco Scritture Cloud (Pre-Attivazione)
                    </button>
                  )}
                </div>
              ) : isCopilota ? (
                <div className="space-y-2.5 pt-1">
                  {hasConflicts ? (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-[11px] text-rose-800 dark:text-rose-200 leading-relaxed font-medium">
                      ⚠️ <strong>Attivazione Bloccata:</strong> Conflitti presenti da verificare prima di attivare la sincronizzazione.
                    </div>
                  ) : null}

                  {report?.isCloudWriteAllowed ? (
                    (report.hasActiveErrors || isPermissionError || Boolean(report.lastSyncError)) ? (
                      <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          <span>⚠️</span>
                          <span>Sincronizzazione Copilota Sospesa da Errore</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          {isPermissionError
                            ? 'Scrittura Copilota bloccata da Firestore (permessi non sufficienti). I dati rimangono protetti nella memoria locale.'
                            : 'Scrittura Copilota abilitata ma interrotta da un errore attivo. I dati locali sono protetti in attesa di risoluzione.'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          <span>✓</span>
                          <span>Sincronizzazione Copilota ATTIVA ed Operativa</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90">
                          Il dispositivo invia e riceve aggiornamenti in tempo reale con i soli permessi del ruolo Copilota (cassaforte privata protetta).
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      In qualità di Copilota verificato{copilotSuffix}, puoi abilitare la sincronizzazione bidirezionale protetta separata dall'Owner. Nessuna elevazione di privilegi: le modifiche restano rigorosamente conformi al ruolo Copilota (zero accesso né sovrascrittura di credenziali private).
                    </p>
                  )}

                  {!report?.isCloudWriteAllowed ? (
                    <button
                      type="button"
                      disabled={reconciling || hasConflicts}
                      onClick={handleEnableCopilotSync}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        reconciling || hasConflicts
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-emerald-500/20 active:scale-[0.98]'
                      }`}
                    >
                      {reconciling ? (
                        <>
                          <span className="animate-spin text-sm">⏳</span>
                          <span>Verifica e attivazione in corso…</span>
                        </>
                      ) : hasConflicts ? (
                        <>
                          <span>⚠️</span>
                          <span>Attivazione Bloccata (Conflitti attivi)</span>
                        </>
                      ) : (
                        <>
                          <span>🟢</span>
                          <span>Attiva Sincronizzazione Copilota{copilotSuffix}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRelock}
                      className="w-full py-2 px-3 rounded-xl font-bold text-[11px] bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 transition-colors cursor-pointer"
                    >
                      🔒 Ripristina Blocco Scritture Copilota
                    </button>
                  )}
                  <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    ℹ️ <strong>Ricezione Automatica Sempre Attiva:</strong> Il dispositivo del Copilota riceve comunque tutti gli aggiornamenti dal server in background tramite listener Firestore live, senza bisogno di procedure tecniche.
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  ℹ️ <strong>Accesso Sola Lettura:</strong> Questo dispositivo riceve gli aggiornamenti dal cloud in consultazione senza permessi di scrittura sul viaggio.
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
