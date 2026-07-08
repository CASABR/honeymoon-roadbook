import { auth } from "./firebase";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { repository } from "./repository";

// Inizializzazione sicura di Firestore per evitare crash se Firebase non è attivo
let db: any = null;
try {
  db = getFirestore();
} catch (e) {
  console.error("Firestore non inizializzato:", e);
}

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
  }
};
