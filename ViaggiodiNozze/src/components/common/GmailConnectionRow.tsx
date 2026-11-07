import { useEffect, useState } from 'react';
import { auth } from '../../firebase';

interface GmailConnectionRowProps {
  onSearchEmails?: () => void;
  className?: string;
  compactDark?: boolean;
}

export default function GmailConnectionRow({ onSearchEmails, className = '', compactDark = false }: GmailConnectionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  useEffect(() => {
    const updateIdentity = () => {
      const user = auth?.currentUser;
      const googleProvider = user?.providerData?.find((provider: { providerId: string; email?: string | null }) => provider.providerId === 'google.com');
      setGoogleEmail(googleProvider?.email || null);
    };
    updateIdentity();
    const unsubscribe = auth?.onAuthStateChanged(updateIdentity);
    return () => unsubscribe?.();
  }, []);

  const handleTryGmail = () => {
    if (onSearchEmails) {
      onSearchEmails();
    } else {
      window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'gmail' } }));
    }
  };

  const bgClass = compactDark
    ? 'bg-slate-800/80 border-slate-700 text-slate-200'
    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100';

  return (
    <div className={`rounded-2xl border transition-all ${bgClass} ${className}`}>
      <div className="flex items-center justify-between px-3.5 py-2.5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">✉</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold">Importazione da Gmail</span>
              
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Importa prenotazioni da conferme email e documenti.</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsExpanded((value) => !value)} className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200" aria-expanded={isExpanded}>Info {isExpanded ? '▴' : '▾'}</button>
      </div>

      {isExpanded && (
        <div className="px-3.5 pb-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] space-y-2.5 leading-relaxed">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 space-y-1.5">
            <p>
              <strong>Modalità immediata consigliata:</strong> puoi incollare il testo dell&apos;email oppure caricare file <strong>PDF, screenshot o .eml</strong> direttamente in HouniAI per estrarre voli, hotel, trasporti e attività con anteprima modificabile.
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              ℹ️ La lettura automatica diretta da Gmail richiede la verifica Google OAuth dello scope <code>gmail.readonly</code> sulla Google Cloud Console.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'manual' } }))}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#FF6B5F] text-white hover:bg-[#e85c50] transition cursor-pointer"
            >
              📎 Incolla testo email o carica PDF / screenshot / .eml
            </button>
            <div className="flex items-center gap-2">
              <span className="truncate text-[10px] text-slate-400">{googleEmail ? `Google: ${googleEmail}` : 'Google non collegato'}</span>
              <button type="button" onClick={handleTryGmail} className="shrink-0 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 underline cursor-pointer">Prova Gmail</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
