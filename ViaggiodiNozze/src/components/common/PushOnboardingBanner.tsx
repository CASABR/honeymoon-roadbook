import { useState, useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { auth } from '../../firebase';
import { getTripConfig } from '../../utils/tripConfig';

const PROMPT_STORAGE_KEY = 'hounigo_push_prompt_dismissed_v1';

export default function PushOnboardingBanner() {
  const { isSupported, permission, state, subscribeToPush, isSubscribing } = usePushNotifications();
  const [isVisible, setIsVisible] = useState(false);
  const [isIosNonStandalone, setIsIosNonStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    // 1. Controllo supporto browser di base
    if (!isSupported) return;

    // 2. Se il permesso è già concesso, non ripetere mai la richiesta
    if (permission === 'granted' || state === 'active') return;

    // 3. Se l'utente ha già scelto "Non ora" in precedenza, rispetta la scelta
    const dismissed = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (dismissed === 'true') return;

    // 4. Rilevamento iPhone / iOS e modalità Standalone (Home Screen)
    const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    );

    if (isIos && !isStandalone) {
      setIsIosNonStandalone(true);
    }

    // 5. Mostra il prompt al primo accesso utile
    setIsVisible(true);
  }, [isSupported, permission, state]);

  if (!isVisible) return null;

  const handleDismiss = () => {
    // Rispetta la scelta senza insistere; consente l'attivazione successiva dalle Impostazioni
    try {
      localStorage.setItem(PROMPT_STORAGE_KEY, 'true');
    } catch {}
    setIsVisible(false);
  };

  const handleActivate = async () => {
    setFeedback(null);

    // Su iPhone non standalone, spiega prima come installare la PWA
    if (isIosNonStandalone) {
      setShowIosGuide(true);
      return;
    }

    try {
      // Verifica autenticazione e viaggio
      if (!auth.currentUser || !getTripConfig()?.id) {
        setFeedback('Accedi a un viaggio prima di abilitare le notifiche.');
        return;
      }

      await subscribeToPush();
      // Se l'attivazione ha successo o è completata
      try {
        localStorage.setItem(PROMPT_STORAGE_KEY, 'true');
      } catch {}
      setFeedback('Notifiche di viaggio attivate con successo!');
      setTimeout(() => setIsVisible(false), 2000);
    } catch (err: any) {
      if (Notification.permission === 'denied') {
        setFeedback('Permesso negato. Puoi riattivarlo in qualsiasi momento dalle Impostazioni del browser.');
      } else {
        setFeedback(err?.message || 'Impossibile completare la registrazione push.');
      }
    }
  };

  return (
    <div className="mx-auto max-w-xl mb-4 px-3 sm:px-0 animate-fade-in" role="region" aria-label="Attivazione notifiche di viaggio">
      <div className="relative overflow-hidden rounded-2xl border border-rose-200/80 dark:border-rose-900/60 bg-[#FDFBF7] dark:bg-[#1E293B] p-4 sm:p-5 shadow-sm text-slate-800 dark:text-slate-100">
        {/* Accent bar brand roadbook */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF6B5F] to-[#FFA07A]" />

        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-[#FF6B5F] flex items-center justify-center text-xl shrink-0 mt-0.5">
            🔔
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#FF6B5F]">
                AGGIORNAMENTI DI VIAGGIO
              </span>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
                title="Chiudi avviso"
                aria-label="Chiudi avviso"
              >
                ✕
              </button>
            </div>

            <h4 className="text-sm font-extrabold text-[#172033] dark:text-white mt-1">
              Vuoi ricevere aggiornamenti importanti sul tuo viaggio?
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              Ricevi promemoria discreti per voli, treni, check-in e note operative, anche ad app chiusa. Nessun messaggio pubblicitario o spam.
            </p>

            {/* Guida iPhone PWA se non installata */}
            {isIosNonStandalone && showIosGuide && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1.5 animate-fade-in font-sans">
                <div className="font-bold flex items-center gap-1.5">
                  <span>📱</span>
                  <span>Installazione richiesta su iPhone:</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Per ricevere le notifiche su iOS, Apple richiede che l'app sia sulla schermata Home:
                </p>
                <ol className="list-decimal list-inside text-[11px] space-y-0.5 pl-1">
                  <li>Tocca l'icona <strong>Condividi</strong> (quadrato con freccia in Safari)</li>
                  <li>Scorri verso il basso e seleziona <strong>Aggiungi alla schermata Home</strong></li>
                  <li>Apri HOUNIGO dall'icona Home creata e attiva le notifiche</li>
                </ol>
              </div>
            )}

            {feedback && (
              <div className="mt-2.5 text-xs font-bold text-[#FF6B5F] dark:text-rose-400">
                {feedback}
              </div>
            )}

            {/* Pulsanti Azione */}
            <div className="mt-3.5 flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                disabled={isSubscribing}
                onClick={handleActivate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                {isSubscribing ? 'Attivazione in corso…' : isIosNonStandalone && !showIosGuide ? 'Come attivare su iPhone' : 'Attiva notifiche'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[36px]"
              >
                Non ora
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
