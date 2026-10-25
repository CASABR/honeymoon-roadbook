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
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-xs font-bold truncate">
                {isConnected ? 'Gmail collegato' : 'Collega Gmail'}
              </span>
              {isConnected && googleEmail && (
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                  ({googleEmail})
                </span>
              )}
            </div>
            {isConnected && googleEmail && (
              <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate block sm:hidden">
                {googleEmail}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isConnecting}
            onClick={handlePrimaryAction}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
              isConnected
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-xs'
            }`}
          >
            {isConnecting
              ? 'Connessione…'
              : isConnected
              ? (onSearchEmails ? 'Importa' : 'Cerca')
              : 'Collega'}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer text-xs"
            title={isExpanded ? 'Riduci' : 'Dettagli'}
            aria-expanded={isExpanded}
          >
            <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>
      </div>

      {/* Sezione Espandibile */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/60 text-xs space-y-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Permesso in sola lettura (<code>gmail.readonly</code>) per cercare automaticamente voucher di volo, hotel o treni.
            Nessun accesso a email personali non di viaggio e nessuna modifica all'identità o ai permessi del dispositivo.
          </p>

          {errorMsg && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-400">
              {isConnected ? `Collegato come ${googleEmail || 'Google Account'}` : 'Nessun account sincronizzato'}
            </span>
            {isConnected && (
              <button
                type="button"
                onClick={handleConnectGmail}
                disabled={isConnecting}
                className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold underline cursor-pointer"
              >
                Cambia account Google
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
