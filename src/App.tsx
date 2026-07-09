import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { auth, onAuthStateChanged, getRedirectResult } from "./services/firebase";
import { syncService } from "./services/sync";
import BottomNav from "./components/BottomNav";
import LoginView from "./views/LoginView";
import TodayView from "./views/TodayView";
import TripView from "./views/TripView";
import AccommodationsView from "./views/AccommodationsView";
import TransportsView from "./views/TransportsView";
import BudgetView from "./views/BudgetView";
import AltroView from "./views/AltroView";

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    // 1. Controlla se c'è un bypass locale attivo in localStorage
    const localBypass = localStorage.getItem("hrb_local_auth_bypass");
    if (localBypass) {
      try {
        setCurrentUser(JSON.parse(localBypass));
        setIsAuthChecking(false);
        return;
      } catch (e) {
        localStorage.removeItem("hrb_local_auth_bypass");
      }
    }

    // 2. Altrimenti usa Firebase Auth
    if (!auth) {
      setIsAuthChecking(false);
      return;
    }

    const checkUserProfile = async (user: any) => {
      if (user && !user.isAnonymous && user.uid !== "local-bypass-user") {
        try {
          const profile = await syncService.getOrCreateUserProfile(user);
          if (!profile.onboardingCompleted) {
            setNeedsOnboarding(true);
          }
        } catch (e) {
          console.error("Errore verifica profilo utente:", e);
        }
      }
    };

    // Raccoglie l'esito del redirect auth
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("Login redirect completato per:", result.user.email);
          setCurrentUser(result.user);
          await checkUserProfile(result.user);
        }
      })
      .catch((err) => {
        console.error("Errore redirect auth:", err);
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await checkUserProfile(user);
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.uid !== "local-bypass-user") {
      const unsubscribeSync = syncService.startBudgetRealtimeSync(currentUser);
      return () => unsubscribeSync();
    }
  }, [currentUser]);
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

  if (needsOnboarding) {
    return (
      <OnboardingScreen 
        user={currentUser} 
        onComplete={() => setNeedsOnboarding(false)} 
      />
    );
  }

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
