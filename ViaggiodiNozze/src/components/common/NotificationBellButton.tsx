import { useState } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import PushNotificationModal from '../modals/PushNotificationModal';

export default function NotificationBellButton() {
  const push = usePushNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 3 Macro-Stati chiari e veritieri:
  // 1. Attive: dot verde smeraldo
  // 2. Attivazione da completare: dot ambra
  // 3. Disattivate o bloccate: nessun dot, icona sbarrata
  const isActive = push.state === 'active';
  const isPending = push.state === 'browser-only' || push.state === 'server-unavailable' || push.state === 'error';
  const isOffOrBlocked = !isActive && !isPending;

  let tooltip = 'Notifiche non attive. Tocca per attivare.';
  if (isActive) {
    tooltip = 'Notifiche attive per questo viaggio.';
  } else if (isPending) {
    tooltip = 'Attivazione notifiche da completare. Tocca per sincronizzare.';
  } else if (push.permission === 'denied') {
    tooltip = 'Notifiche bloccate nelle impostazioni del dispositivo.';
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FF6B5F] outline-hidden"
        title={tooltip}
        aria-label={isActive ? 'Notifiche attive' : isPending ? 'Attivazione notifiche da completare' : 'Notifiche non attive'}
      >
        {/* Icona Campanella SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isActive ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={isActive ? '1.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'text-[#FF6B5F] dark:text-[#ff9a90]' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {isOffOrBlocked && (
            <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" stroke="currentColor" className="text-slate-400 dark:text-slate-500" />
          )}
        </svg>

        {/* Solo 2 dot discreti: verde (attive) o ambra (da completare) */}
        {isActive && (
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 ring-1.5 ring-white dark:ring-slate-900" />
          </span>
        )}
        {isPending && (
          <span className="absolute top-1 right-1 flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 ring-1.5 ring-white dark:ring-slate-900" />
          </span>
        )}
      </button>

      {/* Modale con dettagli e Riprova attivazione */}
      <PushNotificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
