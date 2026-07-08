import { auth, db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { repository, type BudgetEntry } from "./repository";

export const syncService = {
  // 1. PUSH NOTE
  async pushNotes(): Promise<void> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return;

    const notes = await repository.getNotes();
    const docRef = doc(db, `users/${user.uid}/data/notes`);
    await setDoc(docRef, {
      text: notes,
      updatedAt: Date.now()
    }, { merge: true });
  },

  // 2. PULL NOTE
  async pullNotes(): Promise<string | null> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return null;

    const docRef = doc(db, `users/${user.uid}/data/notes`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.text === "string") {
        await repository.saveNotes(data.text);
        return data.text;
      }
    }
    return null;
  },

  // 3. PUSH ATTIVITÀ COMPLETATE
  async pushCompletedActivities(): Promise<void> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return;

    const completed = await repository.getCompletedActivities();
    const docRef = doc(db, `users/${user.uid}/data/completed_activities`);
    await setDoc(docRef, {
      list: completed,
      updatedAt: Date.now()
    }, { merge: true });
  },

  // 4. PULL ATTIVITÀ COMPLETATE
  async pullCompletedActivities(): Promise<string[] | null> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return null;

    const docRef = doc(db, `users/${user.uid}/data/completed_activities`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.list)) {
        await repository.saveCompletedActivities(data.list);
        return data.list;
      }
    }
    return null;
  },

  // 5. PUSH BUDGET
  async pushBudget(): Promise<void> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return;

    // NOTA: Passiamo un array vuoto come fallback per non rischiare di sovrascrivere o inserire i default a questo livello
    const localEntries = await repository.getBudgetEntries([]);

    const { collection, getDocs, deleteDoc } = await import("firebase/firestore");
    const budgetColRef = collection(db, `users/${user.uid}/budget`);

    // Rileva ed elimina le spese rimosse localmente nel cloud
    const querySnapshot = await getDocs(budgetColRef);
    const localIds = new Set(localEntries.map(e => e.id));

    for (const snapDoc of querySnapshot.docs) {
      if (!localIds.has(snapDoc.id)) {
        await deleteDoc(snapDoc.ref);
      }
    }

    // Scrive o aggiorna le spese correnti
    for (const entry of localEntries) {
      const docRef = doc(db, `users/${user.uid}/budget/${entry.id}`);
      await setDoc(docRef, {
        ...entry,
        updatedAt: Date.now()
      }, { merge: true });
    }
  },

  // 6. PULL BUDGET
  async pullBudget(): Promise<BudgetEntry[] | null> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return null;

    const { collection, getDocs } = await import("firebase/firestore");
    const budgetColRef = collection(db, `users/${user.uid}/budget`);
    const querySnapshot = await getDocs(budgetColRef);

    const cloudEntries: BudgetEntry[] = [];
    querySnapshot.forEach((snapDoc) => {
      const data = snapDoc.data();
      if (data && data.id) {
        cloudEntries.push({
          id: data.id,
          date: data.date || "",
          label: data.label || "",
          amount: typeof data.amount === "number" ? data.amount : 0,
          category: data.category || "Altro"
        });
      }
    });

    await repository.saveBudgetEntries(cloudEntries);
    return cloudEntries;
  },

  // 7. PUSH ALLOGGI
  async pushAccommodations(): Promise<void> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return;

    const localEntries = await repository.getAccommodations([]);

    // Scrive o aggiorna gli alloggi locali correnti nel cloud (senza cancellare quelli remoti)
    for (const entry of localEntries) {
      const docRef = doc(db, `users/${user.uid}/accommodations/${entry.id}`);
      await setDoc(docRef, {
        ...entry,
        updatedAt: Date.now()
      }, { merge: true });
    }
  },

  // 8. PULL ALLOGGI
  async pullAccommodations(): Promise<any[] | null> {
    const user = auth?.currentUser;
    if (!user || user.uid === "local-bypass-user" || !db) return null;

    const { collection, getDocs } = await import("firebase/firestore");
    const accoColRef = collection(db, `users/${user.uid}/accommodations`);
    const querySnapshot = await getDocs(accoColRef);

    const cloudEntries: any[] = [];
    querySnapshot.forEach((snapDoc) => {
      const data = snapDoc.data();
      if (data && data.id) {
        cloudEntries.push({
          id: data.id,
          name: data.name || "",
          checkIn: data.checkIn || "",
          checkOut: data.checkOut || "",
          address: data.address || "",
          notes: data.notes || "",
          phone: data.phone || "",
          lat: typeof data.lat === "number" ? data.lat : undefined,
          lng: typeof data.lng === "number" ? data.lng : undefined,
          isMockDefault: data.isMockDefault || false
        });
      }
    });

    // Merge additivo e non distruttivo per evitare perdite dati
    const localEntries = await repository.getAccommodations([]);
    const mergedMap = new Map<string, any>();

    localEntries.forEach(item => mergedMap.set(item.id, item));
    cloudEntries.forEach(item => mergedMap.set(item.id, item));

    const finalEntries = Array.from(mergedMap.values());
    await repository.saveAccommodations(finalEntries);
    return finalEntries;
  }
};
