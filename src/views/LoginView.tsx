import { useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInAnonymously 
} from "../services/firebase";

export default function LoginView() {
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
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Errore login Google:", err);
      // Gestione errori amichevole
      if (err.code === "auth/popup-blocked") {
        setError("Il popup per il login è stato bloccato dal browser. Abilita i popup e riprova.");
      } else if (err.code === "auth/configuration-not-found") {
        setError("La configurazione Firebase per Google Sign-In non è configurata o attiva.");
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

  // Bypass di sviluppo se Firebase non è configurato o in caso di errore persistente
  function handleBypass() {
    // Crea un utente mock in localStorage per simulare l'accesso locale bypassando Firebase
    const mockUser = {
      uid: "local-bypass-user",
      isAnonymous: true,
      displayName: "Sposo Ospite (Bypass)",
      email: "ospite@local.roadbook"
    };
    localStorage.setItem("hrb_local_auth_bypass", JSON.stringify(mockUser));
    // Forza il ricaricamento della pagina per far leggere il bypass a App.tsx
    window.location.reload();
  }

  return (
    <div className="app-shell flex flex-col justify-between p-6 text-slate-800 bg-[#f8fafc]">
      {/* Top Section / Logo */}
      <div className="flex-1 flex flex-col justify-center items-center text-center my-auto">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-[38px] font-black shadow-lg shadow-blue-100 mb-6 animate-pulse">
          ✨
        </div>
        <h1 className="text-[26px] font-black text-gray-900 leading-tight">
          Honeymoon Roadbook
        </h1>
        <p className="text-[13.5px] text-gray-400 font-semibold mt-2.5 max-w-[280px]">
          Il vostro diario di viaggio di nozze organizzato, consultabile e sempre disponibile offline.
        </p>

        {error && (
          <div className="mt-6 p-3 bg-red-50 border border-red-100 rounded-2xl text-[12px] text-red-600 font-medium leading-relaxed max-w-[290px] text-left">
            <span className="font-bold block mb-0.5">⚠️ Attenzione:</span>
            {error}
            <button 
              onClick={handleBypass}
              className="mt-2.5 block text-blue-600 font-extrabold hover:underline text-left text-[11px]"
            >
              Usa bypass locale (offline di sicurezza) &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Buttons Section */}
      <div className="space-y-3 pb-6">
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full h-12 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-bold text-[14px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-98 shadow-sm disabled:opacity-50"
        >
          {/* Icona Google minimale SVG */}
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
          {isLoading ? "Connessione..." : "Accedi con Google"}
        </button>

        <button
          onClick={handleGuestLogin}
          disabled={isLoading}
          className="w-full h-12 bg-blue-600 text-white font-bold text-[14px] rounded-2xl flex items-center justify-center transition-all hover:bg-blue-700 active:scale-98 shadow-md shadow-blue-100 disabled:opacity-50"
        >
          {isLoading ? "Accesso in corso..." : "Continua come Ospite"}
        </button>

        <p className="text-[10px] text-gray-400 text-center leading-relaxed px-4 pt-1">
          I dati modificati come ospite rimangono salvati sul dispositivo locale e potranno essere sincronizzati collegando l'account in seguito.
        </p>
      </div>
    </div>
  );
}
