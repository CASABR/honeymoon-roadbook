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
        <div className="px-3.5 pb-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] space-y-2 leading-relaxed">
          <p className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300">Puoi incollare il testo delle conferme di prenotazione ricevute via email direttamente nella casella di testo per registrarle automaticamente nel viaggio.</p>
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="truncate text-[10px] text-slate-400">{googleEmail ? `Account Google: ${googleEmail}` : 'Nessun account Google collegato'}</span>
            <button type="button" onClick={handleTryGmail} className="shrink-0 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 underline">Prova Gmail</button>
          </div>
        </div>
      )}
    </div>
  );
}
