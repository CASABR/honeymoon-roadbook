import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { idbGetForTrip, STORES } from '../../storage/indexedDB';
import { getPersistedSession } from '../../utils/deviceSession';
import { getTripConfig } from '../../utils/tripConfig';

type OwnerSource =
  | 'Verifica locale in corso'
  | 'roadbook_trip_config (localStorage)'
  | 'trip_config_backup (IndexedDB)'
  | 'Nessun ownerUid nei backup locali'
  | 'Backup IndexedDB non leggibile';

type RemoteTrip0000Status =
  | 'Verifica remota in corso…'
  | 'Doc 0000 accessibile'
  | 'Doc 0000 protetto (Permission Denied / Non autorizzato)'
  | 'Doc 0000 non trovato su Firestore'
  | 'Database non disponibile';

type OwnershipVerdict =
  | 'checking'
  | 'owner_confirmed'
  | 'not_owner'
  | 'unauthorized'
  | 'not_found';

declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;

export default function LocalIdentityDiagnostics() {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser || null);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [ownerSource, setOwnerSource] = useState<OwnerSource>('Verifica locale in corso');

  // Verifica remota 0000 in sola lettura: 3 stati ben distinti
  const [remote0000Status, setRemote0000Status] = useState<RemoteTrip0000Status>('Verifica remota in corso…');
  const [remote0000OwnerUid, setRemote0000OwnerUid] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<OwnershipVerdict>('checking');
  const [copiedUid, setCopiedUid] = useState(false);

  // Stato Service Worker & Build
  const [swStatus, setSwStatus] = useState<string>(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'Non supportato';
    return navigator.serviceWorker.controller ? 'Attivo & Controllante (PWA attiva)' : 'In attesa o non registrato';
  });
  const [checkingSw, setCheckingSw] = useState(false);

  const handleCheckSwUpdate = async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setSwStatus('Service Worker non supportato dal browser.');
      return;
    }
    setCheckingSw(true);
    setSwStatus('Controllo aggiornamenti sul server...');
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
      if (reg.waiting) {
        setSwStatus('Nuova versione pronta! Ricarica per applicare.');
        if (confirm('Una nuova versione di Hounigo è disponibile. Ricaricare ora l\'applicazione senza cancellare i dati?')) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }
      } else {
        setSwStatus('Applicazione aggiornata: sei all\'ultima versione disponibile.');
      }
    } catch (err: any) {
      setSwStatus(`Errore verifica SW: ${err?.message || 'timeout'}`);
    } finally {
      setCheckingSw(false);
    }
  };

  const config = getTripConfig();
  const session = getPersistedSession();

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setCurrentUser(user));
  }, []);

  // Controllo locale (IndexedDB / localStorage)
  useEffect(() => {
    let active = true;
    if (config?.ownerUid) {
      setOwnerUid(config.ownerUid);
      setOwnerSource('roadbook_trip_config (localStorage)');
      return () => {
        active = false;
      };
    }

    const tripId = config?.id || session.tripId;
    if (!tripId) {
      setOwnerSource('Nessun ownerUid nei backup locali');
      return;
    }

    idbGetForTrip<{ value?: { ownerUid?: string } }>(tripId, STORES.SETTINGS, 'trip_config_backup')
      .then((backup) => {
        if (!active) return;
        if (backup?.value?.ownerUid) {
          setOwnerUid(backup.value.ownerUid);
          setOwnerSource('trip_config_backup (IndexedDB)');
        } else {
          setOwnerSource('Nessun ownerUid nei backup locali');
        }
      })
      .catch(() => {
        if (active) setOwnerSource('Backup IndexedDB non leggibile');
      });

    return () => {
      active = false;
    };
  }, [config, session.tripId]);

  // Controllo remoto autorizzato in SOLA LETTURA su /trips/0000
  useEffect(() => {
    let active = true;
    if (!db) {
      setRemote0000Status('Database non disponibile');
      setVerdict('unauthorized');
      return;
    }

    async function checkRemote0000() {
      try {
        const snap = await getDoc(doc(db, 'trips', '0000'));
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          const rOwner = data?.ownerUid || null;
          setRemote0000OwnerUid(rOwner);
          setRemote0000Status('Doc 0000 accessibile');
          if (currentUser?.uid && rOwner && currentUser.uid === rOwner) {
            setVerdict('owner_confirmed');
          } else {
            setVerdict('not_owner');
          }
        } else {
          setRemote0000Status('Doc 0000 non trovato su Firestore');
          setVerdict('not_found');
        }
      } catch (err: any) {
        if (!active) return;
        setRemote0000Status('Doc 0000 protetto (Permission Denied / Non autorizzato)');
        setRemote0000OwnerUid(null);
        setVerdict('unauthorized');
      }
    }

    checkRemote0000();

    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  const copyUid = async () => {
    if (!currentUser?.uid) return;
    try {
      await navigator.clipboard.writeText(currentUser.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F7F3] p-5 text-[#172033] dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#FF6B5F]">
            Verifica Diagnostica Multi-Dispositivo
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">Identità Dispositivo & Viaggio 0000</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Controllo in sola lettura: nessuna modifica a credenziali, sessioni o documenti remoti.
          </p>
        </div>

        {/* Verdetto su 0000 con 3 stati distinti */}
        <div
          className={`p-4 rounded-2xl border ${
            verdict === 'owner_confirmed'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
              : verdict === 'not_owner'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200'
              : verdict === 'unauthorized'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">Verdetto Viaggio 0000</span>
            <span
              className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
                verdict === 'owner_confirmed'
                  ? 'bg-amber-500 text-white'
                  : verdict === 'not_owner'
                  ? 'bg-blue-600 text-white'
                  : verdict === 'unauthorized'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {verdict === 'owner_confirmed'
                ? '👑 QUESTA È LA SESSIONE OWNER'
                : verdict === 'not_owner'
                ? '🤝 PARTECIPANTE / NON OWNER DI 0000'
                : verdict === 'unauthorized'
                ? '⛔ ACCESSO A 0000 NON AUTORIZZATO'
                : verdict === 'not_found'
                ? '⚠️ VIAGGIO 0000 NON TROVATO'
                : '⏳ Verifica in corso…'}
            </span>
          </div>

          <p className="text-xs mt-2.5 leading-relaxed">
            {verdict === 'owner_confirmed' && (
              <strong>
                ✓ SUCCESSO: Questo dispositivo detiene l'identità autenticata dell'Organizzatore di 0000.
                È QUESTO il browser su cui eseguire il primo collegamento a Google o Email per non perdere i privilegi.
              </strong>
            )}
            {verdict === 'not_owner' && (
              <span>
                Questo dispositivo ha accesso in lettura a 0000 (es. copilota o partecipante), ma l'ownerUid remoto ({remote0000OwnerUid}) non coincide con il tuo UID. Non collegare questo dispositivo come Organizzatore principale.
              </span>
            )}
            {verdict === 'unauthorized' && (
              <span>
                Lettura di 0000 non autorizzata dalle Firestore Rules (Permission Denied). Questa sessione è estranea al viaggio 0000: l'ownerUid remoto rimane protetto e inaccessibile.
              </span>
            )}
            {verdict === 'not_found' && (
              <span>Il documento /trips/0000 non risulta presente nel database Firestore remoto.</span>
            )}
            {verdict === 'checking' && (
              <span>Interrogazione di sicurezza Firestore in corso…</span>
            )}
          </p>
        </div>

        {/* Dati di Confronto */}
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs">UID Firebase di questo dispositivo:</span>
              {currentUser?.uid && (
                <button
                  type="button"
                  onClick={copyUid}
                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {copiedUid ? '✓ Copiato!' : 'Copia UID'}
                </button>
              )}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200 font-bold select-all">
              {currentUser?.uid || 'Nessuna sessione Firebase attiva'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-xs block">ownerUid remoto di 0000 su Firestore:</span>
            <div className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200 font-bold select-all">
              {remote0000OwnerUid || `(${remote0000Status})`}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-xs block">ownerUid memorizzato nei backup locali:</span>
            <div className="mt-1 break-all font-mono text-xs text-slate-600 dark:text-slate-300">
              {ownerUid || 'Non presente nei backup'}
            </div>
            <span className="block text-[10px] text-slate-400 mt-1">Provenienza: {ownerSource}</span>
          </div>

          {/* Dati Tecnici Build & Aggiornamento PWA */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <span>📦</span>
                <span>Versione PWA &amp; Build Eseguita</span>
              </span>
              <span className="text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-md">
                Commit: {typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'git'}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <p>Data &amp; Ora Build: <strong className="text-slate-800 dark:text-slate-100">{typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}</strong></p>
              <p>Service Worker: <span className="font-mono text-slate-700 dark:text-slate-300">{swStatus}</span></p>
            </div>
            <button
              type="button"
              disabled={checkingSw}
              onClick={handleCheckSwUpdate}
              className="w-full mt-1 py-2 px-3 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span>{checkingSw ? '⏳' : '🔄'}</span>
              <span>{checkingSw ? 'Controllo in corso…' : 'Verifica Nuova Versione PWA'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-200 space-y-2 leading-relaxed">
          <span className="font-bold block">📋 Istruzioni per il test multi-dispositivo di 0000:</span>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Apri questa pagina sul <strong>PC principale</strong> (dove hai creato il viaggio).</li>
            <li>Apri la stessa pagina su <strong>Safari iPhone</strong> e sulla <strong>PWA iPhone</strong>.</li>
            <li>Confronta gli UID: solo uno dei tre coinciderà con l'ownerUid remoto.</li>
            <li>Collega l'account Google o Email <strong>soltanto dal browser che riporta "QUESTA È LA SESSIONE OWNER"</strong>.</li>
          </ol>
        </div>

        <div className="text-center">
          <a
            href="."
            className="inline-block py-2.5 px-6 rounded-xl font-bold text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            Torna all'Applicazione
          </a>
        </div>
      </section>
    </main>
  );
}
