import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { getTripConfig } from '../utils/tripConfig';
import { storageService } from '../storage/storageService';

export function usePresence(docId: string | undefined) {
  const [lockedBy, setLockedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!docId || !db) return;
    
    const tripConfig = getTripConfig();
    if (!tripConfig) return;
    const tripId = tripConfig.id;
    const lockRef = doc(db, 'trips', tripId, 'locks', docId);
    
    // Sottoscrizione per leggere chi sta modificando
    const unsubscribe = onSnapshot(lockRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const now = Date.now();
        const timestamp = data.timestamp?.toMillis ? data.timestamp.toMillis() : now;
        
        // Se il lock è vecchio di oltre 2 minuti, consideralo scaduto
        if (now - timestamp > 120000) {
          setLockedBy(null);
        } else {
          setLockedBy(data.lockedBy || null);
        }
      } else {
        setLockedBy(null);
      }
    });

    // Registra la propria presenza
    const myRole = storageService.getDeviceRole() || 'Sconosciuto';
    
    const acquireLock = async () => {
      try {
        await setDoc(lockRef, {
          lockedBy: myRole,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.warn("[Presence] Impossibile acquisire il lock", err);
      }
    };
    
    acquireLock();

    // Pulizia quando il componente (il form) viene chiuso
    return () => {
      unsubscribe();
      setDoc(lockRef, { lockedBy: null, timestamp: serverTimestamp() }).catch(() => {});
    };
  }, [docId]);

  const myRole = storageService.getDeviceRole() || 'Sconosciuto';
  const isLockedByOther = lockedBy !== null && lockedBy !== myRole;

  return { lockedBy, myRole, isLockedByOther };
}
