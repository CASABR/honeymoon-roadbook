import { useEffect, useState } from 'react';
import { BACKGROUND_PUSH_DISABLED_MESSAGE, BACKGROUND_PUSH_ENABLED } from '../../config/freeArchitecture';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import type { PushPreferences } from '../../services/pushNotificationService';
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

export default function PushNotificationModal({ isOpen, onClose }: PushNotificationModalProps) {
  const push = usePushNotifications();
  const [draft, setDraft] = useState<PushPreferences>(push.preferences);
  const [feedback, setFeedback] = useState('');

  useEffect(() => setDraft(push.preferences), [push.preferences]);
  useEffect(() => {
    if (isOpen && BACKGROUND_PUSH_ENABLED) {
      void push.refreshStatus();
    }
  }, [isOpen, push.refreshStatus]);

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
            disabled={push.state !== 'active' || push.isSubscribing}
            onClick={() => void run(push.sendTestNotification, 'Notifica di prova inviata! Controlla lo schermo del dispositivo.')}
            className="rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition-colors dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50 cursor-pointer"
          >
            Invia notifica di prova
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
            Anticipo promemoria
            <select value={draft.reminderMinutes} onChange={event => updateFlag('reminderMinutes', Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900">
              <option value={15}>15 minuti prima</option>
              <option value={30}>30 minuti prima</option>
              <option value={60}>1 ora prima</option>
              <option value={120}>2 ore prima</option>
              <option value={360}>6 ore prima</option>
              <option value={720}>12 ore prima</option>
              <option value={1440}>1 giorno prima</option>
            </select>
          </label>
          <button type="button" onClick={() => void run(() => push.updatePreferences(draft), 'Preferenze salvate con successo.')} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer">
            Salva preferenze
          </button>
        </fieldset>

        {/* Guida iPhone PWA */}
        <div className="rounded-xl bg-amber-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          💡 Su iPhone e iPad le notifiche push richiedono che HOUNIGO sia aggiunta alla schermata Home come PWA (pulsante Condividi › Aggiungi a schermata Home).
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
