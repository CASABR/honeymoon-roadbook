import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type GlobalAdminAccess = 'checking' | 'authorized' | 'unauthorized';

export function useGlobalAdminAccess(): GlobalAdminAccess {
  const [access, setAccess] = useState<GlobalAdminAccess>('checking');

  useEffect(() => {
    if (!auth || !db) {
      setAccess('unauthorized');
      return;
    }

    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        if (!cancelled) setAccess('unauthorized');
        return;
      }

      if (!cancelled) setAccess('checking');
      try {
        await user.getIdToken(true);
        await getDocs(query(collection(db, 'trips'), limit(1)));
        if (!cancelled) setAccess('authorized');
      } catch {
        if (!cancelled) setAccess('unauthorized');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return access;
}
