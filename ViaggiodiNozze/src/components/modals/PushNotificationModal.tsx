import { useCallback, useEffect, useState } from 'react';
import { BACKGROUND_PUSH_DISABLED_MESSAGE, BACKGROUND_PUSH_ENABLED } from '../../config/freeArchitecture';
import { auth } from '../../firebase';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import {
  type PushDiagnosticEntry,
  type PushPreferences,
  getPushTestRemainingSeconds,
  readPushDiagnostics,
  recordPushTestSent,
} from '../../services/pushNotificationService';
import { getActiveTripId } from '../../storage/indexedDB';
import { getLastSyncError, getLastSyncTimestamp } from '../../storage/syncService';
import { isCloudAuthorized } from '../../utils/useAuthIdentity';
import Modal from '../common/Modal';

interface PushNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  checking: 'Verifica in corso…',
  unsupported: 'Non supportate in questo browser',
  'permission-denied': 'Permesso bloccato nel browser',
  inactive: 'Notifiche disattivate',
  'browser-only': 'Autorizzato sul dispositivo, mancante sul server',
  active: 'Notifiche attive e sincronizzate',
  'server-unavailable': 'Server non raggiungibile',
  error: 'Configurazione non completata',
};

const SKIP_REASON_LABELS: Record<string, string> = {
  ok: 'Reminder calcolato',
  invalid_data: 'Dati incompleti',
  unsupported_entity: 'Categoria senza reminder',
  unconfirmed_time: 'Orario non confermato / scadenza non verificata',
  missing_date_or_time: 'Data o orario mancante',
  missing_timezone: 'Fuso orario mancante: specifica città o fuso IANA (es. Europe/Rome) nella card',
  past_event: 'Orario evento già passato',
};

const TIMEZONE_SOURCE_LABELS: Record<string, string> = {
  card_explicit: 'fuso card',
  card_coordinates: 'coordinate card',
  card_iata: 'aeroporto IATA',
  card_place: 'luogo card',
  day_or_stage: 'tappa/giorno',
  device_fallback: 'fuso dispositivo (fallback)',
  none: 'non determinato',
};

const RECOVERY_REASON_LABELS: Record<string, string> = {
  device_tz_changed: 'cambio fuso dispositivo',
  rescheduled: 'riprogrammazione',
};

function formatDiagTime(ts: number | null | undefined): string {
  if (!ts) return 'Mai';
  try {
    return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export default function PushNotificationModal({ isOpen, onClose }: PushNotificationModalProps) {
  const push = usePushNotifications();
  const [draft, setDraft] = useState<PushPreferences>(push.preferences);
  const [feedback, setFeedback] = useState('');
  const [diagRefreshTick, setDiagRefreshTick] = useState(0);
  const [diagCopied, setDiagCopied] = useState(false);

  const readSnapshot = useCallback(() => {
    const tripId = getActiveTripId() || '0000';
    const entries = readPushDiagnostics();
    const allMutations = entries.filter(e => e.stage === 'mutation');
    const recentMutations = [...allMutations].slice(-10).reverse();
    const lastMutation: PushDiagnosticEntry | undefined = recentMutations[0];
    const lastActivityMutation: PushDiagnosticEntry | undefined = recentMutations.find(
      e => e.entityType === 'attivita' || e.entityType === 'activity',
    ) || [...allMutations].reverse().find(e => e.entityType === 'attivita' || e.entityType === 'activity');
    const lastSyncPush: PushDiagnosticEntry | undefined = [...entries].reverse().find(e => e.stage === 'sync_reminders');
    const lastCloudSyncDiag: PushDiagnosticEntry | undefined = [...entries].reverse().find(e => e.stage === 'sync_deferred' || e.stage === 'cloud_sync_error');
    return {
      isAuth: Boolean(auth.currentUser && !auth.currentUser.isAnonymous),
      isAuthorized: isCloudAuthorized(tripId),
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      lastCloudSyncAt: getLastSyncTimestamp(tripId),
      lastCloudSyncErr: getLastSyncError(tripId),
      lastCloudSyncDiag,
      lastMutation,
      lastActivityMutation,
      recentMutations,
      lastSyncPush,
    };
  }, []);

  const [diag, setDiag] = useState(readSnapshot);

  useEffect(() => {
    if (isOpen) {
      setDiag(readSnapshot());
    }
  }, [isOpen, diagRefreshTick, push.state, push.preferences, readSnapshot]);
  const [testCooldown, setTestCooldown] = useState(() => getPushTestRemainingSeconds());
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => setDraft(push.preferences), [push.preferences]);
  useEffect(() => {
    if (isOpen && BACKGROUND_PUSH_ENABLED) {
      void push.refreshStatus();
      setTestCooldown(getPushTestRemainingSeconds());
    }
  }, [isOpen, push.refreshStatus]);

  useEffect(() => {
    if (testCooldown <= 0) return;
    const interval = setInterval(() => {
      const remaining = getPushTestRemainingSeconds();
      setTestCooldown(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [testCooldown]);

  const handleSendTestNotification = async () => {
    if (isSendingTest || testCooldown > 0) return;
    setIsSendingTest(true);
    setFeedback('');
    try {
      await push.sendTestNotification();
      recordPushTestSent(30);
      setTestCooldown(30);
      setFeedback('✓ Invio accettato dal server. La notifica è stata trasmessa al servizio push; la comparsa effettiva dipende dai permessi OS e dalla modalità \'Non disturbare\'.');
    } catch (error: any) {
      const isRateLimited = error?.code === 'PUSH_RATE_LIMITED' || String(error?.message || '').includes('anti-spam') || String(error?.message || '').includes('RATE_LIMITED');
      const remaining = error?.retryAfter || (testCooldown > 0 ? testCooldown : 30);
      if (isRateLimited) {
        recordPushTestSent(remaining);
        setTestCooldown(remaining);
        setFeedback(`⚠️ Limite anti-spam attivo: attendi ancora ${remaining} secondi prima di richiedere un'altra notifica di prova.`);
      } else {
        setFeedback(error instanceof Error ? error.message : 'Operazione non completata.');
      }
    } finally {
      setIsSendingTest(false);
    }
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setFeedback('');
    try {
      await operation();
      setFeedback(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Operazione non completata.');
    }
  };

  if (!BACKGROUND_PUSH_ENABLED) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Notifiche push" accentVariant="indigo">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">Promemoria nell’app attivi</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{BACKGROUND_PUSH_DISABLED_MESSAGE}</p>
        </div>
      </Modal>
    );
  }

  const updateFlag = (key: keyof PushPreferences, value: boolean | number) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const isRetryState = push.state === 'browser-only' || push.state === 'server-unavailable' || push.state === 'error';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notifiche & Promemoria" accentVariant="rose">
      <div className="space-y-4">
        {/* Box Stato Principale */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">{STATUS_LABELS[push.state] || push.state}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{push.diagnostic}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${push.state === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : isRetryState ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {push.state === 'active' ? 'ATTIVE' : isRetryState ? 'DA RIPROVARE' : 'NON ATTIVE'}
            </span>
          </div>
        </div>

        {/* Avviso esplicativo se browser-only (disallineamento permesso OS vs DB D1) */}
        {push.state === 'browser-only' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> Autorizzazione concessa, registrazione server mancante
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300">
              Il tuo dispositivo ha consentito le notifiche a livello di sistema operativo, ma il database del viaggio non ha ancora salvato la registrazione. Tocca <strong>Riprova attivazione</strong> per completare l&apos;iscrizione.
            </p>
          </div>
        )}

        {/* Avviso se permesso negato dal dispositivo */}
        {push.permission === 'denied' && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>🚫</span> Permesso bloccato nel browser o sistema operativo
            </p>
            <p className="text-[11px] leading-relaxed text-rose-800/90 dark:text-rose-300">
              Le notifiche sono state bloccate. Per riattivarle, tocca l&apos;icona delle impostazioni del sito accanto alla barra degli indirizzi, seleziona <em>Consenti notifiche</em> e ricarica la pagina.
            </p>
          </div>
        )}

        {/* Pulsanti Azione Principali */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {push.state === 'active' ? (
            <button
              type="button"
              disabled={push.isSubscribing}
              onClick={() => void run(push.unsubscribeFromPush, 'Notifiche disattivate con successo.')}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {push.isSubscribing ? 'Operazione in corso…' : 'Disattiva notifiche'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!push.isSupported || push.isSubscribing || push.permission === 'denied'}
              onClick={() => void run(push.subscribeToPush, 'Subscription confermata con successo dal server!')}
              className="rounded-xl bg-[#FF6B5F] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e0564a] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {push.isSubscribing ? 'Attivazione in corso…' : isRetryState ? 'Riprova attivazione' : 'Attiva notifiche'}
            </button>
          )}

          <button
            type="button"
            disabled={push.state !== 'active' || push.isSubscribing || isSendingTest || testCooldown > 0}
            onClick={handleSendTestNotification}
            className="rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition-colors dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50 cursor-pointer"
          >
            {isSendingTest
              ? 'Invio in corso…'
              : testCooldown > 0
                ? `Attendi ${testCooldown}s per riprovare`
                : 'Invia notifica di prova'}
          </button>
        </div>

        {/* Preferenze Promemoria */}
        <fieldset disabled={push.state !== 'active' || push.isSubscribing} className="space-y-3 rounded-2xl border border-slate-200 p-4 disabled:opacity-55 dark:border-slate-700">
          <legend className="px-2 text-xs font-extrabold text-slate-700 dark:text-slate-200">Eventi da notificare</legend>
          {([
            ['transports', 'Trasporti, voli e treni'],
            ['activities', 'Attività con orario confermato'],
            ['lodging', 'Check-in e check-out alloggi'],
            ['deadlines', 'Scadenze e documenti di viaggio'],
            ['collaboration', 'Aggiornamenti itinerario del team'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <span>{label}</span>
              <input type="checkbox" checked={draft[key]} onChange={event => updateFlag(key, event.target.checked)} className="h-4 w-4 accent-[#FF6B5F]" />
            </label>
          ))}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-800">
            Anticipo promemoria card
            <select value={draft.reminderMinutes} onChange={event => updateFlag('reminderMinutes', Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900">
              <option value={15}>15 minuti prima</option>
              <option value={30}>30 minuti prima</option>
              <option value={60}>1 ora prima</option>
              <option value={120}>2 ore prima</option>
              <option value={360}>6 ore prima</option>
              <option value={720}>12 ore prima</option>
              <option value={1440}>1 giorno prima</option>
            </select>
            <span className="block mt-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">
              Vale per trasporti, attività, alloggi, tappe, ristoranti e shopping con orario confermato. Le scadenze usano il proprio anticipo dedicato.
            </span>
          </label>
          <button type="button" onClick={() => void run(() => push.updatePreferences(draft), 'Preferenze salvate con successo.')} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer">
            Salva preferenze
          </button>
        </fieldset>

        {/* Guida iPhone PWA */}
        <div className="rounded-xl bg-amber-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          💡 Su iPhone e iPad le notifiche push richiedono che HOUNIGO sia aggiunta alla schermata Home come PWA (pulsante Condividi › Aggiungi a schermata Home).
        </div>

        {/* Diagnostica Push iPhone (nessun dato personale) */}
        <div data-testid="push-diagnostics-panel" className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Diagnostica Push
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const formatD1 = (m: PushDiagnosticEntry) =>
                    typeof m.scheduledCount === 'number'
                      ? (m.scheduledCount > 0 ? `Job D1 confermati: ${m.scheduledCount}` : '0 job D1')
                      : 'Conferma D1 non ricevuta';
                  const formatTz = (m: PushDiagnosticEntry) =>
                    m.appliedTimeZone
                      ? ` | tz=${m.appliedTimeZone} (${TIMEZONE_SOURCE_LABELS[m.timeZoneSource || 'none'] || m.timeZoneSource || 'n/d'})`
                      : '';
                  const lines = [
                    `Auth: ${diag.isAuth ? 'OK' : 'NO'} | Editor: ${diag.isAuthorized ? 'OK' : 'NO'} | Rete: ${diag.isOnline ? 'Online' : 'Offline'} | Sync: ${formatDiagTime(diag.lastCloudSyncAt)}${diag.lastCloudSyncErr ? ` | ErrSync: ${diag.lastCloudSyncErr.slice(0, 60)}` : ''}`,
                    `Preferenza card: ${push.preferences.reminderMinutes} min | Stato push: ${push.state}`,
                    diag.lastActivityMutation
                      ? `Ultima Attivita: ${formatDiagTime(diag.lastActivityMutation.ts)} | rem=${diag.lastActivityMutation.reminderCount} | ${formatD1(diag.lastActivityMutation)}${formatTz(diag.lastActivityMutation)} | skip=${diag.lastActivityMutation.skipReason || 'ok'}${diag.lastActivityMutation.error ? ` | err=${diag.lastActivityMutation.error}` : ''}`
                      : 'Ultima Attivita: nessuna',
                    diag.lastSyncPush
                      ? `Backfill (${formatDiagTime(diag.lastSyncPush.ts)}): ${diag.lastSyncPush.error ? `err=${diag.lastSyncPush.error}` : `${diag.lastSyncPush.reminderCount} elem, schedulati=${diag.lastSyncPush.scheduledCount ?? 0}, recuperati=${diag.lastSyncPush.recoveredCount ?? 0}, rimossi=${diag.lastSyncPush.removedCount ?? 0}`}${diag.lastSyncPush.appliedTimeZone ? ` | tz=${diag.lastSyncPush.appliedTimeZone}` : ''}${diag.lastSyncPush.recoveryReason ? ` | recupero=${RECOVERY_REASON_LABELS[diag.lastSyncPush.recoveryReason] || diag.lastSyncPush.recoveryReason}` : ''}`
                      : 'Backfill: nessuno',
                    `Ultime ${diag.recentMutations.length} mutazioni:`,
                    ...diag.recentMutations.map((m, idx) =>
                      `${idx + 1}. ${formatDiagTime(m.ts)} | ${m.entityType || '—'} | rem=${m.reminderCount} | ${formatD1(m)}${formatTz(m)} | skip=${m.skipReason || 'ok'}${m.error ? ` | err=${m.error}` : ''}`
                    ),
                  ];
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
                      setDiagCopied(true);
                      setTimeout(() => setDiagCopied(false), 2000);
                    }).catch(() => {});
                  }
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
              >
                {diagCopied ? 'Copiato' : 'Copia diagnostica'}
              </button>
              <button
                type="button"
                onClick={() => setDiagRefreshTick(t => t + 1)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
              >
                Aggiorna
              </button>
            </div>
          </div>
          <div>
            <strong>1. Salvataggio &amp; Sync Cloud:</strong> {diag.isAuth ? 'Auth OK' : 'Non autenticato'} · {diag.isAuthorized ? 'Editor OK' : 'Non autorizzato'} · {diag.isOnline ? 'Online' : 'Offline'} · Sync {formatDiagTime(diag.lastCloudSyncAt)}
            {diag.lastCloudSyncErr ? ` · Errore sync: ${diag.lastCloudSyncErr.slice(0, 60)}` : ''}
            {diag.lastCloudSyncDiag?.error ? ` · ${diag.lastCloudSyncDiag.stage === 'sync_deferred' ? 'Differito' : 'Errore'} (${diag.lastCloudSyncDiag.entityType || '—'} ${formatDiagTime(diag.lastCloudSyncDiag.ts)}): ${diag.lastCloudSyncDiag.error}` : ''}
          </div>
          <div>
            <strong>2. Preferenza card effettiva:</strong> {push.preferences.reminderMinutes} minuti prima · Stato: {push.state}
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-2.5 py-1.5 dark:border-sky-800/60 dark:bg-sky-950/30">
            <strong>3. Ultima Attività:</strong>{' '}
            {diag.lastActivityMutation ? (
              <>
                {formatDiagTime(diag.lastActivityMutation.ts)} · Reminder: {diag.lastActivityMutation.reminderCount} ·{' '}
                {typeof diag.lastActivityMutation.scheduledCount === 'number'
                  ? (diag.lastActivityMutation.scheduledCount > 0
                    ? `Job D1 confermati: ${diag.lastActivityMutation.scheduledCount}`
                    : '0 job D1')
                  : 'Conferma D1 non ricevuta'}
                {diag.lastActivityMutation.appliedTimeZone
                  ? ` · Fuso: ${diag.lastActivityMutation.appliedTimeZone} (${TIMEZONE_SOURCE_LABELS[diag.lastActivityMutation.timeZoneSource || 'none'] || diag.lastActivityMutation.timeZoneSource || 'n/d'})`
                  : ''}
                {diag.lastActivityMutation.skipReason && diag.lastActivityMutation.skipReason !== 'ok'
                  ? ` · ${SKIP_REASON_LABELS[diag.lastActivityMutation.skipReason] || diag.lastActivityMutation.skipReason}`
                  : ''}
                {diag.lastActivityMutation.error ? ` · Errore: ${diag.lastActivityMutation.error}` : ''}
              </>
            ) : (
              'Nessuna mutazione Attività registrata su questo dispositivo'
            )}
          </div>
          {diag.lastSyncPush && (
            <div className="text-slate-500 dark:text-slate-400">
              <strong>Backfill ({formatDiagTime(diag.lastSyncPush.ts)}):</strong>{' '}
              {diag.lastSyncPush.error
                ? `Errore ${diag.lastSyncPush.error}`
                : `${diag.lastSyncPush.reminderCount} elementi, schedulati: ${diag.lastSyncPush.scheduledCount ?? 0}, recuperati: ${diag.lastSyncPush.recoveredCount ?? 0}, rimossi: ${diag.lastSyncPush.removedCount ?? 0}`}
              {diag.lastSyncPush.appliedTimeZone ? ` · Fuso: ${diag.lastSyncPush.appliedTimeZone}` : ''}
              {diag.lastSyncPush.recoveryReason ? ` · Recupero: ${RECOVERY_REASON_LABELS[diag.lastSyncPush.recoveryReason] || diag.lastSyncPush.recoveryReason}` : ''}
            </div>
          )}
          <div>
            <strong>4. Ultime {diag.recentMutations.length} mutazioni:</strong>
            {diag.recentMutations.length === 0 ? (
              <span className="ml-1 text-slate-500">Nessuna mutazione registrata</span>
            ) : (
              <ul className="mt-1 max-h-40 overflow-y-auto space-y-1 pr-1">
                {diag.recentMutations.map((m, idx) => {
                  const isAct = m.entityType === 'attivita' || m.entityType === 'activity';
                  const d1Label = typeof m.scheduledCount === 'number'
                    ? (m.scheduledCount > 0 ? `D1: ${m.scheduledCount}` : 'D1: 0')
                    : 'D1: n/d';
                  return (
                    <li
                      key={`${m.ts}-${idx}`}
                      className={`rounded-lg px-2 py-1 text-[10px] border ${
                        isAct
                          ? 'border-sky-300 bg-sky-50/90 text-sky-950 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100 font-semibold'
                          : 'border-slate-200/80 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                      }`}
                    >
                      <span>{formatDiagTime(m.ts)}</span> ·{' '}
                      <span className="uppercase">{isAct ? 'Attività' : (m.entityType || '—')}</span> ·{' '}
                      <span>Rem: {m.reminderCount}</span> · <span>{d1Label}</span>
                      {m.appliedTimeZone && (
                        <span> · {m.appliedTimeZone} ({TIMEZONE_SOURCE_LABELS[m.timeZoneSource || 'none'] || m.timeZoneSource || 'n/d'})</span>
                      )}
                      {m.skipReason && m.skipReason !== 'ok' && (
                        <span className="text-amber-700 dark:text-amber-300">
                          {' '}· {SKIP_REASON_LABELS[m.skipReason] || m.skipReason}
                        </span>
                      )}
                      {m.error && (
                        <span className="text-rose-600 dark:text-rose-400"> · Err: {m.error}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {feedback && (
          <p role="status" className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 animate-fade-in">
            {feedback}
          </p>
        )}
      </div>
    </Modal>
  );
}
