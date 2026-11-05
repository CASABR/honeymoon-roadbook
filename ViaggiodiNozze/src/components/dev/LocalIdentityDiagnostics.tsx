import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getDocsFromServer,
  collection,
  query,
  limit
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { idbGetForTrip, STORES } from '../../storage/indexedDB';
import { getPersistedSession } from '../../utils/deviceSession';
import { getTripConfig } from '../../utils/tripConfig';

type RoleVerdict = 'owner' | 'copilota' | 'viewer' | 'non_membro' | 'checking';

interface ResourceCheckResult {
  name: string;
  path: string;
  status: 'CONSENTITO' | 'NEGATO' | 'ERRORE_RETE' | 'IN_CORSO';
  code?: string;
  latencyMs?: number;
}

export default function LocalIdentityDiagnostics() {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser || null);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);

  // Ruolo effettivo verificato su Firestore per viaggio 0000
  const [verifiedRole, setVerifiedRole] = useState<RoleVerdict>('checking');
  const [roleDetails, setRoleDetails] = useState<string>('Verifica ruolo su Firestore in corso…');

  // Risultati controlli collezioni operative (100% sola lettura)
  const [resourceResults, setResourceResults] = useState<ResourceCheckResult[]>([]);
  const [runningChecks, setRunningChecks] = useState<boolean>(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const config = getTripConfig();
  const session = getPersistedSession();

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setCurrentUser(user));
  }, []);

  // 1. Controllo configurazione locale
  useEffect(() => {
    let active = true;
    if (config?.ownerUid) {
      setOwnerUid(config.ownerUid);
      return;
    }
    const tripId = config?.id || session.tripId;
    if (!tripId) return;

    idbGetForTrip<{ value?: { ownerUid?: string } }>(tripId, STORES.SETTINGS, 'trip_config_backup')
      .then((backup) => {
        if (active && backup?.value?.ownerUid) {
          setOwnerUid(backup.value.ownerUid);
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, [config, session.tripId]);

  // 2. Controllo Ruolo Effettivo da Server Firebase
  useEffect(() => {
    let active = true;
    if (!db || !currentUser?.uid) {
      setVerifiedRole('checking');
      return;
    }

    async function checkRole() {
      try {
        // Controllo se l'utente è registrato come membro del viaggio 0000
        const memberRef = doc(db, 'trips', '0000', 'members', currentUser!.uid);
        const memberSnap = await getDocFromServer(memberRef);

        if (memberSnap.exists()) {
          const r = memberSnap.data()?.role;
          if (r === 'owner' || r === 'copilota' || r === 'viewer') {
            if (active) {
              setVerifiedRole(r);
              setRoleDetails(`Membro registrato in /trips/0000/members con ruolo: ${r.toUpperCase()}`);
              return;
            }
          }
        }

        // Controllo se l'utente coincide con ownerUid sul documento trips/0000
        try {
          const tripSnap = await getDocFromServer(doc(db, 'trips', '0000'));
          if (tripSnap.exists()) {
            const data = tripSnap.data();
            const rOwner = data?.ownerUid || data?.ownerId;
            if (rOwner && currentUser!.uid === rOwner) {
              if (active) {
                setVerifiedRole('owner');
                setRoleDetails('Owner confermato dal campo ownerUid del viaggio 0000');
                return;
              }
            }
          }
        } catch {}

        if (active) {
          setVerifiedRole('non_membro');
          setRoleDetails('Utente autenticato ma NON registrato come membro del viaggio 0000 (Estraneo)');
        }
      } catch (err: any) {
        if (!active) return;
        if (err.code === 'permission-denied') {
          setVerifiedRole('non_membro');
          setRoleDetails('Accesso alle membership di 0000 negato (Non sei membro)');
        } else if (err.code === 'unavailable' || err.message?.includes('network')) {
          setRoleDetails('Errore di connessione a Firestore (Rete non disponibile)');
        } else {
          setRoleDetails(`Errore verifica ruolo: ${err.message}`);
        }
      }
    }

    checkRole();
    return () => { active = false; };
  }, [currentUser?.uid]);

  // 3. Esecuzione Test Permessi su Collezioni Operative
  const runOperationalChecks = async () => {
    if (!db) return;
    setRunningChecks(true);

    const targets = [
      { name: 'Documento Radice Viaggio', path: 'trips/0000', type: 'doc' as const },
      { name: 'Collezione Alloggi', path: 'trips/0000/alloggi', type: 'collection' as const },
      { name: 'Collezione Trasporti', path: 'trips/0000/trasporti', type: 'collection' as const },
      { name: 'Collezione Tappe', path: 'trips/0000/tappe', type: 'collection' as const },
      { name: 'Collezione Attività', path: 'trips/0000/attivita', type: 'collection' as const },
      { name: 'Collezione Spese', path: 'trips/0000/spese', type: 'collection' as const },
      { name: 'Cassaforte private_credentials', path: 'trips/0000/private_credentials', type: 'collection' as const },
      { name: 'Altro Viaggio (Verifica Isolamento)', path: 'trips/trip_isolation_probe', type: 'doc' as const }
    ];

    const results: ResourceCheckResult[] = [];

    for (const t of targets) {
      const startTime = performance.now();
      try {
        if (t.type === 'doc') {
          await getDocFromServer(doc(db, t.path));
        } else {
          await getDocsFromServer(query(collection(db, t.path), limit(1)));
        }
        const latencyMs = Math.round(performance.now() - startTime);
        results.push({
          name: t.name,
          path: t.path,
          status: 'CONSENTITO',
          latencyMs
        });
      } catch (err: any) {
        const latencyMs = Math.round(performance.now() - startTime);
        const code = err.code || 'unknown';
        if (code === 'permission-denied') {
          results.push({
            name: t.name,
            path: t.path,
            status: 'NEGATO',
            code,
            latencyMs
          });
        } else if (code === 'unavailable' || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('offline')) {
          results.push({
            name: t.name,
            path: t.path,
            status: 'ERRORE_RETE',
            code,
            latencyMs
          });
        } else {
          results.push({
            name: t.name,
            path: t.path,
            status: 'NEGATO',
            code,
            latencyMs
          });
        }
      }
    }

    setResourceResults(results);
    setRunningChecks(false);
  };

  // Esegui i controlli automaticamente al primo caricamento quando l'utente è pronto
  useEffect(() => {
    if (currentUser?.uid && db) {
      runOperationalChecks();
    }
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
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#FF6B5F]">
            HOUNIGO — Diagnostica Sicurezza Pre-Lockdown
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">Verifica Identità e Permessi Server</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tutte le verifiche interrogano direttamente il server Firebase con <code>getDocFromServer</code>, escludendo al 100% la cache locale. Zero dati privati o credenziali esposti.
          </p>
        </div>

        {/* 1. Box Identità Utente Corrente */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Sessione Attiva (Firebase Auth)</span>
            <button
              onClick={copyUid}
              className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
            >
              {copiedUid ? '✓ UID Copiato!' : 'Copia UID'}
            </button>
          </div>
          <div className="font-mono text-xs font-semibold break-all text-slate-800 dark:text-slate-200">
            UID: {currentUser?.uid || 'Non autenticato'}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Owner UID locale: {ownerUid || 'Non configurato'}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Ruolo in Viaggio 0000:</span>
            <span
              className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                verifiedRole === 'owner'
                  ? 'bg-amber-500 text-white'
                  : verifiedRole === 'copilota'
                  ? 'bg-blue-600 text-white'
                  : verifiedRole === 'viewer'
                  ? 'bg-emerald-600 text-white'
                  : verifiedRole === 'non_membro'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {verifiedRole === 'owner'
                ? '👑 OWNER'
                : verifiedRole === 'copilota'
                ? '🧭 COPILOTA'
                : verifiedRole === 'viewer'
                ? '👁️ VIEWER MEMBRO'
                : verifiedRole === 'non_membro'
                ? '🚫 NON MEMBRO (ESTRANEO)'
                : '⏳ VERIFICA IN CORSO'}
            </span>
          </div>
          <p className="text-xs text-slate-500 italic pt-1">{roleDetails}</p>
        </div>

        {/* 2. Tabella Esiti Operativi da Server Firebase (100% Sola Lettura) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Esiti Chiamate Server (Zero Cache)
            </span>
            <button
              onClick={runOperationalChecks}
              disabled={runningChecks}
              className="rounded-xl bg-[#172033] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {runningChecks ? '⏳ Interrogazione Server…' : '🔄 Riesegui Controllo Server'}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300 font-bold">
                <tr>
                  <th className="p-3">Risorsa / Collezione</th>
                  <th className="p-3">Stato Server</th>
                  <th className="p-3 text-right">Latenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {resourceResults.map((r) => (
                  <tr key={r.path} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="p-3">
                      <div className="font-bold text-slate-800 dark:text-slate-200">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.path}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                          r.status === 'CONSENTITO'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : r.status === 'NEGATO'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {r.status === 'CONSENTITO' && '✓ ACCESSO CONSENTITO'}
                        {r.status === 'NEGATO' && `🔒 ACCESSO NEGATO (${r.code || 'permission-denied'})`}
                        {r.status === 'ERRORE_RETE' && `⚠️ ERRORE DI RETE (${r.code || 'offline'})`}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">
                      {r.latencyMs ? `${r.latencyMs} ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
