import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Configurazione letta da .env.local (prefisso VITE_ obbligatorio per esporla al client).
// Progetto: app-viaggio-di-nozze — lo stesso su cui vengono deployate le firestore.rules (.firebaserc).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log("Firebase API Key check:", {
  hasKey: !!firebaseConfig.apiKey,
  length: firebaseConfig.apiKey ? firebaseConfig.apiKey.length : 0,
  prefix: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 6) : "MANCANTE",
  projectId: firebaseConfig.projectId || "MANCANTE",
});

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[Firebase] Variabili mancanti in .env.local: ${missing.join(", ")}`);
}

let dbInstance: any;
let authInstance: any;

try {
  const app = initializeApp(firebaseConfig);
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (firestoreError) {
    console.warn("Persistent cache failed, using default firestore", firestoreError);
    // Fallback senza persistenza esplicita se bloccato dal browser (es. Incognito o policy)
    dbInstance = initializeFirestore(app, {});
  }
  authInstance = getAuth(app);
} catch (e) {
  console.error("Firebase initialization failed:", e);
}

export const db = dbInstance;
export const auth = authInstance;