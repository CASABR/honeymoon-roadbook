import { useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInAnonymously,
  linkWithPopup
} from "../services/firebase";

export default function LoginView() {
  const [step, setStep] = useState<"intro" | "auth">(() => {
    return localStorage.getItem("hrb_intro_seen") === "true" ? "auth" : "intro";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    if (!auth) {
      setError("Servizio di autenticazione non inizializzato. Controlla le chiavi Firebase.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        // Collega l'account Google all'utente ospite anonimo attivo mantenendo lo stesso UID
        await linkWithPopup(auth.currentUser, googleProvider);
      } else {
        // Esegue un login Google pulito per utenti non anonimi
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err: any) {
      console.error("Errore login/linking Google:", err);
      if (err.code === "auth/popup-blocked") {
        setError("Il popup per il login è stato bloccato dal browser. Abilita i popup e riprova.");
      } else if (err.code === "auth/configuration-not-found") {
        setError("La configurazione Firebase per Google Sign-In non è configurata o attiva.");
      } else if (err.code === "auth/credential-already-in-use") {
        setError("Questo account Google è già associato ad un altro utente del Roadbook.");
      } else {
        setError(err.message || "Errore durante l'autenticazione con Google.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGuestLogin() {
    if (!auth) {
      setError("Servizio di autenticazione non inizializzato. Controlla le chiavi Firebase.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.error("Errore login anonimo:", err);
      if (err.code === "auth/admin-restricted-operation") {
        setError("L'autenticazione anonima deve essere abilitata nella console Firebase.");
      } else {
        setError(err.message || "Errore durante l'accesso come ospite.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleBypass() {
    const mockUser = {
      uid: "local-bypass-user",
      isAnonymous: true,
      displayName: "Sposo Ospite (Bypass)",
      email: "ospite@local.roadbook"
    };
    localStorage.setItem("hrb_local_auth_bypass", JSON.stringify(mockUser));
    localStorage.setItem("hrb_intro_seen", "true");
    window.location.reload();
  }

  function handleStart() {
    localStorage.setItem("hrb_intro_seen", "true");
    setStep("auth");
  }

  // Schermata 1: Intro Futuristica Premium ed Esclusiva
  if (step === "intro") {
    return (
      <div className="app-shell flex flex-col justify-between p-8 text-white bg-[#0b0f19] relative overflow-hidden">
        {/* Glow ed elementi grafici di profondità */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-blue-500/10 blur-[80px]" />

        {/* Top/Center: Logo e Titolo di grande impatto */}
        <div className="flex-1 flex flex-col justify-center items-center text-center my-auto z-10">
          {/* Logo Geometrico Stella Polare SVG */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-blue-500/25 blur-xl animate-pulse" />
            <svg className="w-24 h-24 relative drop-shadow-[0_4px_12px_rgba(37,99,235,0.3)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="24" fill="url(#logo-intro-grad)" />
              <path d="M50 20 L55 45 L80 50 L55 55 L50 80 L45 55 L20 50 L45 45 Z" fill="#ffffff" />
              <circle cx="50" cy="50" r="6" fill="#2563eb" />
              <defs>
                <linearGradient id="logo-intro-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563eb" />
                  <stop offset="1" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <span className="text-[10px] font-bold tracking-[0.25em] text-blue-400 uppercase mb-2">HONEYMOON ROADBOOK</span>
          <h1 className="text-[28px] font-black tracking-tight text-white leading-tight">
            Il Viaggio più Bello
          </h1>
          <p className="text-[13.5px] text-slate-400 mt-4 leading-relaxed max-w-[280px]">
            Nuova Zelanda, Australia, Filippine.
            <br />
            Il vostro diario di nozze organizzato, sicuro ed utilizzabile anche in assenza di rete.
          </p>
        </div>

        {/* Footer / CTA */}
        <div className="space-y-4 pb-4 z-10">
          <button
            onClick={handleStart}
            className="w-full h-13 bg-white text-slate-900 font-extrabold text-[14.5px] rounded-2xl flex items-center justify-center gap-2 transition-all hover:bg-gray-50 active:scale-97 shadow-lg shadow-white/5"
          >
            Inizia il Viaggio
            <span className="text-[16px]">&rarr;</span>
          </button>
          
          <div className="flex justify-center gap-1.5 pt-2">
            <span className="w-6 h-1.5 rounded-full bg-blue-600" />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
          </div>
        </div>
      </div>
    );
  }

  // Schermata 2: Schermata Autenticazione (Google / Ospite)
  return (
    <div className="app-shell flex flex-col justify-between p-8 text-white bg-[#0b0f19] relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
      
      {/* Back Button per tornare alla schermata d'impatto */}
      <button 
        onClick={() => setStep("intro")}
        className="absolute top-6 left-6 text-slate-400 hover:text-white font-bold text-[12px] flex items-center gap-1 z-10 active:scale-95"
      >
        &larr; Indietro
      </button>

      {/* Center: Logo ridotto e testo */}
      <div className="flex-1 flex flex-col justify-center items-center text-center my-auto z-10">
        <svg className="w-16 h-16 mb-5 drop-shadow-[0_4px_8px_rgba(37,99,235,0.2)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" rx="24" fill="url(#logo-auth-grad)" />
          <path d="M50 20 L55 45 L80 50 L55 55 L50 80 L45 55 L20 50 L45 45 Z" fill="#ffffff" />
          <circle cx="50" cy="50" r="6" fill="#2563eb" />
          <defs>
            <linearGradient id="logo-auth-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2563eb" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>

        <h2 className="text-[20px] font-black text-white">Scegli come accedere</h2>
        <p className="text-[12.5px] text-slate-400 mt-2 max-w-[240px] leading-relaxed">
          Accedi con Google per sincronizzare i dati sul cloud o continua offline come ospite.
        </p>

        {error && (
          <div className="mt-5 p-3 bg-red-950/80 border border-red-800/60 rounded-xl text-[11.5px] text-red-300 font-medium leading-relaxed max-w-[280px] text-left">
            <span className="font-bold block text-red-200 mb-0.5">⚠️ Errore di connessione:</span>
            {error}
            <button 
              onClick={handleBypass}
              className="mt-2 block text-blue-400 font-extrabold hover:underline text-left text-[10.5px]"
            >
              Usa bypass locale (offline di sicurezza) &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="space-y-3 pb-4 z-10">
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full h-12 bg-white text-slate-900 hover:bg-gray-100 font-bold text-[13.5px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-98 shadow-md disabled:opacity-50"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {isLoading ? "Connessione..." : "Continua con Google"}
        </button>

        <button
          onClick={handleGuestLogin}
          disabled={isLoading}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13.5px] rounded-2xl flex items-center justify-center transition-all active:scale-98 shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
          {isLoading ? "Accesso in corso..." : "Continua come Ospite"}
        </button>

        <p className="text-[10px] text-slate-500 text-center leading-relaxed px-4 pt-1">
          I dati rimangono archiviati sul browser locale e verranno sincronizzati quando collegherai l'account Google nelle impostazioni.
        </p>
      </div>
    </div>
  );
}
