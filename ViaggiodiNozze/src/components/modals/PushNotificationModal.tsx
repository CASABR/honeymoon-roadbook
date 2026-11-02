import { BACKGROUND_PUSH_DISABLED_MESSAGE } from '../../config/freeArchitecture';
import Modal from '../common/Modal';

interface PushNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PushNotificationModal({ isOpen, onClose }: PushNotificationModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notifiche push" accentVariant="indigo">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">Promemoria nell’app attivi</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{BACKGROUND_PUSH_DISABLED_MESSAGE}</p>
          </div>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            PUSH OFF
          </span>
        </div>
      </div>
      <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        Le scadenze e i promemoria continuano a comparire in HOUNIGO quando apri l’app, anche senza un servizio push esterno.
      </div>
    </Modal>
  );
}
