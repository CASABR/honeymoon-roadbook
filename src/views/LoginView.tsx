import { useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInAnonymously,
  linkWithPopup,
  signInWithRedirect,
  linkWithRedirect,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  linkWithCredential
} from "../services/firebase";

export default function LoginView() {
  const [step, setStep] = useState<"intro" | "auth" | "reset">(() => {
    return localStorage.getItem("hrb_intro_seen") === "true" ? "auth" : "intro";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleEmailAuth() {
    if (!auth) {
      setError("Servizio di autenticazione non inizializzato. Controlla le chiavi Firebase.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError("Inserisci email e password.");
      return;
    }
    if (isRegistering && !name.trim()) {
      setError("Inserisci il tuo nome.");
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      if (isRegistering) {
        let userCredential;
        if (auth.currentUser && auth.currentUser.isAnonymous) {
          const credential = EmailAuthProvider.credential(email.trim(), password);
          userCredential = await linkWithCredential(auth.currentUser, credential);
        } else {
          userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        }

        if (userCredential && userCredential.user && name.trim()) {
          const { updateProfile } = await import("firebase/auth");
          await updateProfile(userCredential.user, {
            displayName: name.trim()
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: any) {
      console.error("Errore email auth:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("Questo indirizzo email è già registrato.");
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Email o password non valide.");
      } else if (err.code === "auth/weak-password") {
        setError("La password deve contenere almeno 6 caratteri.");
      } else {
        setError(err.message || "Errore durante l'autenticazione.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!auth) return;
    if (!email.trim()) {
      setError("Inserisci l'indirizzo email per reimpostare la password.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfoMessage("Email di ripristino inviata con successo! Controlla la tua casella di posta.");
      setStep("auth");
    } catch (err: any) {
      console.error("Errore password reset:", err);
      setError(err.message || "Errore durante l'invio dell'email.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!auth) {
      setError("Servizio di autenticazione non inizializzato. Controlla le chiavi Firebase.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setConflictError(false);

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    try {
      if (isMobile) {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
          await linkWithRedirect(auth.currentUser, googleProvider);
        } else {
          await signInWithRedirect(auth, googleProvider);
        }
        return;
      }

      if (auth.currentUser && auth.currentUser.isAnonymous) {
        await linkWithPopup(auth.currentUser, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err: any) {
      console.error("Errore login/linking Google:", err);
      if (err.code === "auth/popup-blocked") {
        setError("La finestra di Google è stata bloccata dal browser. Consenti i popup o prova a usare l'accesso tramite Email.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Hai chiuso la finestra popup di Google prima di inserire le credenziali. Riprova.");
      } else if (err.code === "auth/cancelled-popup-request") {
        setError("La richiesta di accesso Google è stata annullata. Riprova.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("Questo dominio (o localhost) non è autorizzato per Google Auth. Aggiungilo nei 'Domini autorizzati' della Firebase Console.");
      } else if (err.code === "auth/configuration-not-found") {
        setError("Il provider Google non è configurato o abilitato nella console di Firebase.");
      } else if (err.code === "auth/credential-already-in-use") {
        setConflictError(true);
      } else {
        setError(err.message || "Errore durante l'autenticazione con Google. In caso di persistenza, accedi con Email.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForceGoogleLogin() {
    if (!auth) return;
    setIsLoading(true);
    setConflictError(false);
    setError(null);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    try {
      if (isMobile) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err: any) {
      console.error("Errore login forzato:", err);
      if (err.code === "auth/popup-blocked") {
        setError("La finestra popup di Google è stata bloccata. Consenti i popup o prova a usare l'accesso tramite Email.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Hai chiuso la finestra popup di Google. Riprova.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("Questo dominio (o localhost) non è autorizzato per Google Auth. Aggiungilo nei 'Domini autorizzati' della Firebase Console.");
      } else {
        setError(err.message || "Errore durante l'accesso.");
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

  // Schermata 4: Reset Password
  if (step === "reset") {
    return (
      <div className="app-shell flex flex-col justify-between p-8 text-white bg-[#0b0f19] relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
        
        <button 
          onClick={() => { setStep("auth"); setError(null); }}
          className="absolute top-6 left-6 text-slate-400 hover:text-white font-bold text-[12px] flex items-center gap-1 z-10 active:scale-95"
        >
          &larr; Indietro
        </button>

        <div className="flex-1 flex flex-col justify-center items-center text-center my-auto z-10 w-full max-w-[290px] mx-auto space-y-4">
          <h2 className="text-[20px] font-black text-white">Reset Password</h2>
          <p className="text-[12px] text-slate-400">
            Ti invieremo un link per reimpostare la tua password
          </p>

          {error && <div className="p-3 bg-red-950/80 border border-red-800/60 rounded-xl text-[11px] text-red-300 w-full text-left">{error}</div>}

          <div className="w-full space-y-1 text-left">
            <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-500">Email di Registrazione</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-600 transition-all font-semibold"
              placeholder="nome@esempio.com"
            />
          </div>
        </div>

        <div className="pb-4 z-10 w-full max-w-[290px] mx-auto">
          <button
            onClick={handlePasswordReset}
            disabled={isLoading}
            className="w-full h-12 bg-white text-slate-900 font-extrabold text-[13.5px] rounded-2xl flex items-center justify-center transition-all active:scale-98 shadow-md disabled:opacity-50"
          >
            {isLoading ? "Invio in corso..." : "Invia email di ripristino"}
          </button>
        </div>
      </div>
    );
  }

  // Schermata 2: Schermata Autenticazione Standard con Card Tabbed (Crea account / Accedi)
  return (
    <div className="app-shell flex flex-col justify-between p-6 text-white bg-[#0b0f19] relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
      
      {/* Back Button */}
      <button 
        onClick={() => setStep("intro")}
        className="absolute top-6 left-6 text-slate-400 hover:text-white font-bold text-[12px] flex items-center gap-1 z-10 active:scale-95"
      >
        &larr; Indietro
      </button>

      {/* Top Logo */}
      <div className="flex flex-col items-center text-center mt-12 mb-3 z-10">
        <svg className="w-12 h-12 mb-2 drop-shadow-[0_4px_8px_rgba(37,99,235,0.2)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <h2 className="text-[18px] font-black text-white">
          {(auth && auth.currentUser && auth.currentUser.isAnonymous) ? "Metti al sicuro i dati" : "Il tuo Roadbook"}
        </h2>
      </div>

      {/* Central Card */}
      <div className="flex-1 flex flex-col justify-center z-10 max-w-[340px] w-full mx-auto my-auto">
        <div className="bg-[#111827] border border-slate-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
          {/* Google Access Button (Azione Principale) */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-11 bg-white hover:bg-gray-100 text-slate-900 font-extrabold text-[13.5px] rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-md disabled:opacity-50"
          >
            <svg className="w-4.5 h-4.5 flex-shrink-0" viewBox="0 0 24 24">
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
            Accedi con Google
          </button>

          {/* Separator */}
          <div className="flex items-center gap-2">
            <span className="h-[1px] bg-slate-800 flex-1" />
            <span className="text-[9px] uppercase tracking-wider font-black text-slate-500">oppure usa l'e-mail</span>
            <span className="h-[1px] bg-slate-800 flex-1" />
          </div>

          {/* Tabs Selector (Azione Secondaria) */}
          <div className="flex bg-[#1f2937] p-1 rounded-xl">
            <button
              onClick={() => { setIsRegistering(true); setError(null); setInfoMessage(null); }}
              className={`flex-1 py-1.5 text-center text-[11px] font-black rounded-lg transition-all ${
                isRegistering ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Crea account
            </button>
            <button
              onClick={() => { setIsRegistering(false); setError(null); setInfoMessage(null); }}
              className={`flex-1 py-1.5 text-center text-[11px] font-black rounded-lg transition-all ${
                !isRegistering ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Accedi
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-950/80 border border-red-800/60 rounded-xl text-[11px] text-red-300 w-full text-left font-semibold">
              {error}
              <button 
                onClick={handleBypass}
                className="mt-2 block text-blue-400 font-extrabold hover:underline text-left text-[10px]"
              >
                Usa bypass locale (offline di sicurezza) &rarr;
              </button>
            </div>
          )}
          {infoMessage && <div className="p-3 bg-green-950/80 border border-green-800/60 rounded-xl text-[11px] text-green-300 w-full text-left font-semibold">{infoMessage}</div>}

          {/* Form Fields */}
          <div className="space-y-3">
            {isRegistering && (
              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-500">Nome Viaggiatore</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-600 transition-all font-semibold"
                  placeholder="Il tuo nome"
                />
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-500">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-600 transition-all font-semibold"
                placeholder="nome@esempio.com"
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-500">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-600 transition-all font-semibold"
                placeholder="******"
              />
            </div>

            {isRegistering && (
              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-500">Conferma Password</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-600 transition-all font-semibold"
                  placeholder="******"
                />
              </div>
            )}

            {!isRegistering && (
              <button 
                onClick={() => setStep("reset")}
                className="text-[11px] text-slate-500 hover:text-blue-400 font-bold block"
              >
                Password dimenticata?
              </button>
            )}
          </div>

          {/* Primary Action Button for Email */}
          <button
            onClick={handleEmailAuth}
            disabled={isLoading}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13.5px] rounded-xl flex items-center justify-center transition-all active:scale-98 shadow-md disabled:opacity-50"
          >
            {isLoading ? "Elaborazione..." : (isRegistering ? "Completa Registrazione" : "Completa Accesso")}
          </button>
        </div>

        {conflictError && (
          <div className="mt-4 p-4 bg-amber-950/80 border border-amber-800/60 rounded-xl text-[12px] text-amber-200 font-medium space-y-2.5 max-w-[280px] text-left">
            <span className="font-extrabold block text-amber-100">⚠️ Conflitto di Collegamento</span>
            Questo account Google è già associato ad un altro diario di nozze. Vuoi disconnettere la sessione ospite ed accedere direttamente all'account Google esistente?
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleForceGoogleLogin}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10.5px] rounded-lg text-center"
              >
                Entra con Google
              </button>
              <button
                onClick={() => setConflictError(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10.5px] rounded-lg text-center"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guest Link Footer */}
      <div className="space-y-2 pb-2 z-10 text-center">
        <button
          onClick={handleGuestLogin}
          disabled={isLoading}
          className="text-slate-400 hover:text-slate-300 font-bold text-[11.5px] transition-all bg-transparent border-none active:scale-95 cursor-pointer"
        >
          {isLoading ? "Accesso..." : "Continua come ospite →"}
        </button>

        <p className="text-[9px] text-slate-600 max-w-[260px] mx-auto leading-normal">
          I dati rimangono archiviati sul browser locale e verranno sincronizzati quando collegherai l'account Google o Email nelle impostazioni.
        </p>
      </div>
    </div>
  );
}
