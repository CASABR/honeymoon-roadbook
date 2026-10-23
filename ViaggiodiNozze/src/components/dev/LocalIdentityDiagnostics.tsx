import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../firebase';
import { idbGetForTrip, STORES } from '../../storage/indexedDB';
import { getPersistedSession } from '../../utils/deviceSession';
import { getTripConfig } from '../../utils/tripConfig';

type OwnerSource = 'Verifica locale in corso' | 'roadbook_trip_config (localStorage)' | 'trip_config_backup (IndexedDB)' | 'Nessun ownerUid nei backup locali' | 'Backup IndexedDB non leggibile';
type BackupConfig = { ownerUid?: string };

export default function LocalIdentityDiagnostics() {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser || null);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [ownerSource, setOwnerSource] = useState<OwnerSource>('Verifica locale in corso');
  const config = getTripConfig();
  const session = getPersistedSession();

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, user => setCurrentUser(user));
  }, []);

  useEffect(() => {
    let active = true;
    if (config?.ownerUid) {
      setOwnerUid(config.ownerUid);
      setOwnerSource('roadbook_trip_config (localStorage)');
      return () => { active = false; };
    }

    const tripId = config?.id || session.tripId;
    if (!tripId) {
      setOwnerSource('Nessun ownerUid nei backup locali');
      return;
    }

    idbGetForTrip<{ value?: BackupConfig }>(tripId, STORES.SETTINGS, 'trip_config_backup')
      .then(backup => {
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

    return () => { active = false; };
  }, [config, session.tripId]);

  return (
    <main className="min-h-screen bg-[#F8F7F3] p-5 text-[#172033]">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-[#FF6B5F]">Diagnostica dispositivo corrente</p>
        <h1 className="mt-2 text-2xl font-extrabold">Diagnostica identità</h1>
        <p className="mt-2 text-sm text-slate-600">Solo letture di Firebase Auth e backup locali: nessuna lettura Firestore, token o credenziale.</p>
        <dl className="mt-6 space-y-3 text-sm">
          <div><dt className="font-bold">UID corrente</dt><dd className="mt-1 break-all font-mono text-xs">{currentUser?.uid || 'Nessuna sessione Firebase'}</dd></div>
          <div><dt className="font-bold">ownerUid nel backup locale</dt><dd className="mt-1 break-all font-mono text-xs">{ownerUid || 'Non presente'}</dd></div>
          <div><dt className="font-bold">Provenienza ownerUid</dt><dd className="mt-1">{ownerSource}</dd></div>
        </dl>
        <p className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Il valore locale non prova i privilegi remoti. Chiudi questa pagina rimuovendo <code>?identityDiagnostics=1</code>.</p>
      </section>
    </main>
  );
}
