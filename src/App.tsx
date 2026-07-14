import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { auth, /* onAuthStateChanged, getRedirectResult, */ signInWithEmailAndPassword, createUserWithEmailAndPassword } from "./services/firebase";
import { syncService } from "./services/sync";
import BottomNav from "./components/BottomNav";
import LoginView from "./views/LoginView";
import TodayView from "./views/TodayView";
import TripView from "./views/TripView";
import AccommodationsView from "./views/AccommodationsView";
import TransportsView from "./views/TransportsView";
import BudgetView from "./views/BudgetView";
import AltroView from "./views/AltroView";
// import TripOnboarding from "./components/TripOnboarding";

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // const [needsTripOnboarding, setNeedsTripOnboarding] = useState(false);

  useEffect(() => {
    const handleSilentAuth = async () => {
      // 1. If Firebase is not configured, fall back to local shared user immediately
      if (!auth) {
        console.warn("[AUTH] Firebase not configured. Using local fallback.");
        setCurrentUser({
          uid: "shared-roadbook-user",
          isAnonymous: false,
          displayName: "Sposi",
          email: "sposi@local.roadbook"
        });
        setIsAuthChecking(false);
        return;
      }

      // 2. Try automatic login with fixed account to keep devices synced
      const email = "sposi@viaggiodinozze.it";
      const password = "viaggiodinozze2026";

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("[AUTH] Silent login successful:", userCredential.user.uid);
        setCurrentUser(userCredential.user);
      } catch (err: any) {
        console.warn("[AUTH] Silent login failed, attempting user registration...", err.code);
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-disabled") {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log("[AUTH] Silent registration and login successful:", userCredential.user.uid);
            setCurrentUser(userCredential.user);
          } catch (regErr) {
            console.error("[AUTH] Silent registration failed. Falling back to local user.", regErr);
            setCurrentUser({
              uid: "shared-roadbook-user",
              isAnonymous: false,
              displayName: "Sposi",
              email: "sposi@local.roadbook"
            });
          }
        } else {
          // Other errors (e.g. network offline), check if we already have a cached user session:
          if (auth.currentUser) {
            console.log("[AUTH] Using existing Firebase session:", auth.currentUser.uid);
            setCurrentUser(auth.currentUser);
          } else {
            console.warn("[AUTH] Offline/Error fallback to local shared user.");
            setCurrentUser({
              uid: "shared-roadbook-user",
              isAnonymous: false,
              displayName: "Sposi",
              email: "sposi@local.roadbook"
            });
          }
        }
      } finally {
        setIsAuthChecking(false);
      }
    };

    handleSilentAuth();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.uid !== "local-bypass-user") {
      const unsubscribeSync = syncService.startBudgetRealtimeSync(currentUser);
      return () => unsubscribeSync();
    }
  }, [currentUser]);

  console.log("[AUTH DEBUG] App render. isAuthChecking:", isAuthChecking, "currentUser:", currentUser ? currentUser.uid : "null", "auth.currentUser:", auth?.currentUser ? auth.currentUser.uid : "null");

  if (isAuthChecking) {
    return (
      <div className="app-shell flex flex-col items-center justify-center bg-radial-gradient">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold mt-3">Verifica sessione...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  // Onboarding screens bypassed for direct access to "Oggi" view
  /*
  if (needsOnboarding) {
    return (
      <OnboardingScreen 
        user={currentUser} 
        onComplete={() => setNeedsOnboarding(false)} 
      />
    );
  }

  if (needsTripOnboarding) {
    return <TripOnboarding />;
  }
  */

  return (
    <div className="app-shell">
      <div className="page-content">
        <Routes>
          <Route path="/" element={<Navigate to="/oggi" replace />} />
          <Route path="/oggi" element={<TodayView />} />
          <Route path="/viaggio" element={<TripView />} />
          <Route path="/alloggi" element={<AccommodationsView />} />
          <Route path="/trasporti" element={<TransportsView />} />
          <Route path="/budgeter" element={<BudgetView />} />
          <Route path="/altro" element={<AltroView />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}

// OnboardingScreen commented out to avoid unused variable compiler errors
/*
function OnboardingScreen({ user, onComplete }: { user: any; onComplete: () => void }) {
  const [name, setName] = useState(user.displayName || "Viaggiatore");
  const [isSaving, setIsSaving] = useState(false);

  async function handleStart() {
    setIsSaving(true);
    try {
      await syncService.completeUserProfileOnboarding(user.uid);
      // Aggiorniamo anche localmente se possibile
      try {
        user.displayName = name.trim();
      } catch (e) {}
      onComplete();
    } catch (e) {
      console.error("Errore salvataggio onboarding:", e);
      onComplete(); // Procediamo comunque per evitare blocchi permanenti
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell flex flex-col items-center justify-center p-6 bg-radial-gradient text-center">
      <div className="card p-6 max-w-[320px] shadow-xl border border-blue-100/10 space-y-5 animate-fade-in">
        <div className="w-16 h-16 bg-blue-600/10 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl">
          ✨
        </div>
        <div>
          <h2 className="text-[19px] font-black text-gray-900">Benvenuto nel Roadbook!</h2>
          <p className="text-[12px] text-gray-400 mt-1">
            Abbiamo creato il tuo profilo. Come preferisci che ti chiamiamo durante il viaggio?
          </p>
        </div>
        <div className="space-y-2 text-left">
          <label className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600">Nome Viaggiatore</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 px-3 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-900 font-bold focus:outline-none focus:border-blue-600 transition-all"
            placeholder="Il tuo nome"
          />
        </div>
        <button
          onClick={handleStart}
          disabled={isSaving || !name.trim()}
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] rounded-xl transition-all active:scale-98 disabled:opacity-50"
        >
          {isSaving ? "Salvataggio..." : "Inizia il Viaggio →"}
        </button>
      </div>
    </div>
  );
}
*/
