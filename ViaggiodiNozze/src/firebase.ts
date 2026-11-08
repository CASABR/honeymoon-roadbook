import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions } from "firebase/functions";

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

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[Firebase] Variabili mancanti in .env.local: ${missing.join(", ")}`);
}

let dbInstance: any;
let authInstance: any;
let functionsInstance: any;
let appCheckInstance: any;

const isBrowser = typeof window !== 'undefined';
const useEmulator = Boolean(import.meta.env.DEV && (
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' ||
  (isBrowser && (
    new URLSearchParams(window.location.search).get('emulator') === 'true' ||
    (window as any).__HOUNIGO_USE_EMULATOR__ === true
  ))
));

try {
  const app = initializeApp(firebaseConfig);
  const appCheckSiteKey = (import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY || '').trim();
  if (!useEmulator && isBrowser && appCheckSiteKey) {
    if (import.meta.env.DEV) {
      (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  } else if (!useEmulator && import.meta.env.PROD) {
    console.warn('[Firebase] App Check non configurato: HouniAI resterà non disponibile finché manca la site key pubblica.');
  }
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
  functionsInstance = getFunctions(app);

  if (useEmulator) {
    const emulatorHost = (isBrowser && (window as any).__HOUNIGO_EMULATOR_HOST__) || '127.0.0.1';
    const firestorePort = Number((isBrowser && (window as any).__HOUNIGO_EMULATOR_PORT__) || import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8194);
    const authPort = Number((isBrowser && (window as any).__HOUNIGO_AUTH_PORT__) || import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099);

    if (dbInstance) {
      try {
        connectFirestoreEmulator(dbInstance, emulatorHost, firestorePort);
        console.log(`[Firebase] Connesso con successo a Firestore Emulator su ${emulatorHost}:${firestorePort}`);
      } catch (emuErr) {
        console.warn('[Firebase] Impossibile connettere Firestore Emulator:', emuErr);
      }
    }
    if (authInstance) {
      try {
        connectAuthEmulator(authInstance, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
        console.log(`[Firebase] Connesso con successo ad Auth Emulator su http://${emulatorHost}:${authPort}`);
      } catch (authErr) {
        console.warn('[Firebase] Impossibile connettere Auth Emulator:', authErr);
      }
    }
  }
} catch (e) {
  console.error("Firebase initialization failed:", e);
}

export const db = dbInstance;
export const auth = authInstance;
export const cloudFunctions = functionsInstance;
export const appCheck = appCheckInstance;
export { signInWithCustomToken } from "firebase/auth";
