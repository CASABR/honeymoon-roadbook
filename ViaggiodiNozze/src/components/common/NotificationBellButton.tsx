import { useState } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import PushNotificationModal from '../modals/PushNotificationModal';

export default function NotificationBellButton() {
  const push = usePushNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Determina indicatore di stato e tooltip
  let statusBadge: { color: string; label: string; ping?: boolean } | null = null;
  let tooltip = 'Notifiche e promemoria';

  switch (push.state) {
    case 'active':
      statusBadge = { color: 'bg-emerald-500', label: 'Attive' };
      tooltip = 'Notifiche attive per questo viaggio. Tocca per gestire.';
      break;
    case 'checking':
      statusBadge = { color: 'bg-slate-400', label: 'Verifica in corso...', ping: true };
      tooltip = 'Verifica configurazione notifiche in corso...';
      break;
    case 'browser-only':
      statusBadge = { color: 'bg-amber-500', label: 'Da sincronizzare' };
      tooltip = 'Permesso browser concesso, ma subscription non registrata sul server. Tocca per riprovare.';
      break;
    case 'permission-denied':
      statusBadge = { color: 'bg-rose-500', label: 'Bloccate' };
      tooltip = 'Notifiche bloccate nelle impostazioni del dispositivo. Tocca per dettagli.';
      break;
    case 'server-unavailable':
    case 'error':
      statusBadge = { color: 'bg-rose-500', label: 'Errore' };
      tooltip = 'Errore registrazione notifiche sul server. Tocca per riprovare.';
      break;
    case 'inactive':
    case 'unsupported':
    default:
      statusBadge = null;
      tooltip = push.isSupported ? 'Notifiche non attive. Tocca per abilitare.' : 'Notifiche push non supportate su questo browser.';
      break;
  }

  const isInactiveOrBlocked = push.state === 'inactive' || push.state === 'permission-denied' || push.state === 'unsupported';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FF6B5F] outline-hidden"
        title={tooltip}
        aria-label={`Notifiche: ${statusBadge ? statusBadge.label : 'Non attive'}`}
      >
        {/* Icona Campanella SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={push.state === 'active' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={push.state === 'active' ? '1.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 transition-transform duration-200 ${push.state === 'active' ? 'text-[#FF6B5F] dark:text-[#ff9a90]' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {isInactiveOrBlocked && (
            <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" stroke="currentColor" className="text-slate-400 dark:text-slate-500" />
          )}
        </svg>

        {/* Badge di stato sincronizzato */}
        {statusBadge && (
          <span className="absolute top-1 right-1 flex h-2 w-2">
            {statusBadge.ping && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusBadge.color} opacity-75`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${statusBadge.color} ring-1.5 ring-white dark:ring-slate-900`} />
          </span>
        )}
      </button>

      {/* Modale Push Notification sincronizzata */}
      <PushNotificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
