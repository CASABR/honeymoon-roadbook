import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously,
  signOut,
  linkWithPopup,
  onAuthStateChanged,
  type User
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "placeholder-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "placeholder-auth-domain.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "placeholder-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "placeholder-storage-bucket.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "placeholder-sender-id",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "placeholder-app-id"
};

// Rileva se il client Firebase è stato configurato con chiavi reali
const isConfigured = 
  import.meta.env.VITE_FIREBASE_API_KEY && 
  import.meta.env.VITE_FIREBASE_API_KEY !== "placeholder-api-key" &&
  import.meta.env.VITE_FIREBASE_API_KEY.trim() !== "";

// Inizializza Firebase con controllo degli errori
let app;
let auth: any = null;
let googleProvider: any = null;
let db: any = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    db = getFirestore(app);
  } catch (error) {
    console.error("Errore nell'inizializzazione di Firebase:", error);
  }
} else {
  console.warn("Firebase Auth non configurato. Crea il file .env.local per abilitare le funzionalità di autenticazione e sincronizzazione cloud.");
}

export { auth, googleProvider, db, signInWithPopup, signInAnonymously, signOut, linkWithPopup, onAuthStateChanged };
export type { User };
