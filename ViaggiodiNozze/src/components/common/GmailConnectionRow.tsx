import { useState, useEffect } from 'react';
import { auth } from '../../firebase';
import { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup } from 'firebase/auth';

interface GmailConnectionRowProps {
  onSearchEmails?: () => void;
  className?: string;
  compactDark?: boolean;
}

export default function GmailConnectionRow({
  onSearchEmails,
  className = '',
  compactDark = false
}: GmailConnectionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const checkConnection = () => {
    const user = auth?.currentUser;
    if (!user) {
      setIsConnected(false);
      setGoogleEmail(null);
      return;
    }

    const googleProvider = user.providerData?.find((p: any) => p.providerId === 'google.com');
    if (googleProvider) {
      setIsConnected(true);
      setGoogleEmail(googleProvider.email || user.email || null);
    } else if (user.email && !user.isAnonymous && user.email.includes('@gmail.com')) {
      setIsConnected(true);
      setGoogleEmail(user.email);
    } else {
      setIsConnected(false);
      setGoogleEmail(null);
    }
  };

  useEffect(() => {
    checkConnection();
    const unsub = auth?.onAuthStateChanged(() => checkConnection());
    return () => unsub?.();
  }, []);

  const handleConnectGmail = async () => {
    if (!auth?.currentUser) {
      setErrorMsg('Nessuna sessione attiva. Ricarica la pagina.');
      return;
    }
    setIsConnecting(true);
    setErrorMsg(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

      if (auth.currentUser.isAnonymous) {
        await linkWithPopup(auth.currentUser, provider);
      } else {
        try {
          await reauthenticateWithPopup(auth.currentUser, provider);
        } catch {
          await linkWithPopup(auth.currentUser, provider);
        }
      }
      checkConnection();
      if (onSearchEmails) {
        onSearchEmails();
      }
    } catch (err: any) {
      console.warn('[GmailConnectionRow] Errore connessione:', err);
      if (err?.code === 'auth/credential-already-in-use') {
        setErrorMsg('Questo account Google è già registrato su un altro profilo. Usa l\'inserimento manuale.');
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err?.message || 'Errore autorizzazione Gmail.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePrimaryAction = () => {
    if (isConnected) {
      if (onSearchEmails) {
        onSearchEmails();
      } else {
        window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'gmail' } }));
      }
    } else {
      handleConnectGmail();
    }
  };

  const bgClass = compactDark
    ? 'bg-slate-800/80 border-slate-700 text-slate-200'
    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100';

  return (
    <div className={`rounded-2xl border transition-all ${bgClass} ${className}`}>
      {/* Riga Singola Compatta */}
      <div className="flex items-center justify-between px-3.5 py-2.5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">📧</span>
          <div className="min-w-0 truncate">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold truncate">
                Importazione da Gmail
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                In preparazione
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              Verifica Google Cloud in corso • Usa PDF o Foto per la beta
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1 cursor-pointer"
            aria-expanded={isExpanded}
          >
            <span>Info</span>
            <span className={`text-[9px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>
      </div>

      {/* Sezione Informativa Espandibile */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/60 text-xs space-y-2">
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
            <strong className="block mb-0.5 font-bold">Integrazione Gmail per la Beta:</strong>
            L'accesso diretto alle caselle di posta richiede la verifica formale degli ambiti riservati (<code>gmail.readonly</code>) da parte di Google Cloud per gli account esterni.
            <br />
            Per evitare schermate di blocco durante i test, <strong>puoi importare istantaneamente qualsiasi voucher di volo, hotel o treno allegando il PDF o la foto/screenshot della prenotazione</strong> tramite il pulsante <em>📎 Allega prenotazione</em>.
          </div>

          <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
            <span>Stato: In attesa di verifica Google Cloud Console</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">PDF & Foto 100% attivi</span>
          </div>

          {errorMsg && (
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{errorMsg}</p>
          )}

          <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            {googleEmail ? (
              <span className="text-[10px] text-slate-500 font-mono">Google: {googleEmail}</span>
            ) : <span />}
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isConnecting}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? 'Connessione in corso…' : 'Testa autorizzazione (solo tester GCP registrati)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
