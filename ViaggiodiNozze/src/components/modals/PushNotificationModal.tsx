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
  checking: 'Verifica in corso', unsupported: 'Non supportate',
  'permission-denied': 'Permesso negato', inactive: 'Disattivate',
  'browser-only': 'Da riconfermare', active: 'Attive',
  'server-unavailable': 'Server non disponibile', error: 'Configurazione incompleta',
};

export default function PushNotificationModal({ isOpen, onClose }: PushNotificationModalProps) {
  const push = usePushNotifications();
  const [draft, setDraft] = useState<PushPreferences>(push.preferences);
  const [feedback, setFeedback] = useState('');

  useEffect(() => setDraft(push.preferences), [push.preferences]);
  useEffect(() => { if (isOpen && BACKGROUND_PUSH_ENABLED) void push.refreshStatus(); }, [isOpen, push.refreshStatus]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notifiche push" accentVariant="indigo">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">{STATUS_LABELS[push.state] || push.state}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{push.diagnostic}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${push.state === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {push.state === 'active' ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {push.state === 'active' ? (
          <button type="button" disabled={push.isSubscribing} onClick={() => void run(push.unsubscribeFromPush, 'Notifiche disattivate.')} className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50">Disattiva</button>
        ) : (
          <button type="button" disabled={!push.isSupported || push.isSubscribing} onClick={() => void run(push.subscribeToPush, 'Subscription confermata dal server.')} className="rounded-xl bg-[#FF6B5F] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Attiva notifiche</button>
        )}
        <button type="button" disabled={push.state !== 'active' || push.isSubscribing} onClick={() => void run(push.sendTestNotification, 'Invio accettato. Conferma la ricezione sul dispositivo.')} className="rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300">Invia notifica di prova</button>
      </div>

      <fieldset disabled={push.state !== 'active' || push.isSubscribing} className="space-y-3 rounded-2xl border border-slate-200 p-4 disabled:opacity-55 dark:border-slate-700">
        <legend className="px-2 text-xs font-extrabold text-slate-700 dark:text-slate-200">Cosa ricevere</legend>
        {([
          ['transports', 'Trasporti e riconsegne'], ['activities', 'Attività con orario confermato'],
          ['lodging', 'Check-in e check-out'], ['deadlines', 'Scadenze verificate'],
          ['collaboration', 'Aggiornamenti Owner e Copilota'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <span>{label}</span>
            <input type="checkbox" checked={draft[key]} onChange={event => updateFlag(key, event.target.checked)} className="h-4 w-4 accent-[#FF6B5F]" />
          </label>
        ))}
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
          Anticipo promemoria
          <select value={draft.reminderMinutes} onChange={event => updateFlag('reminderMinutes', Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value={15}>15 minuti</option><option value={30}>30 minuti</option><option value={60}>1 ora</option><option value={120}>2 ore</option><option value={360}>6 ore</option><option value={720}>12 ore</option><option value={1440}>1 giorno</option>
          </select>
        </label>
        <button type="button" onClick={() => void run(() => push.updatePreferences(draft), 'Preferenze confermate.')} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white dark:bg-white dark:text-slate-900">Salva preferenze</button>
      </fieldset>

      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Su iPhone le push richiedono la PWA aggiunta alla schermata Home. La ricezione va verificata sul dispositivo.
      </div>
      {feedback && <p role="status" className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{feedback}</p>}
    </Modal>
  );
}
