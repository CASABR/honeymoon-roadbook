import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { auth, onAuthStateChanged, /* getRedirectResult, */ signInWithEmailAndPassword, createUserWithEmailAndPassword } from "./services/firebase";
import { syncService } from "./services/sync";
import BottomNav from "./components/BottomNav";
import LoginView from "./views/LoginView";
import TodayView from "./views/TodayView";
import TripView from "./views/TripView";
import AccommodationsView from "./views/AccommodationsView";
import TransportsView from "./views/TransportsView";
import BudgetView from "./views/BudgetView";
import AltroView from "./views/AltroView";
import { useAuthStore } from "./stores/authStore";

export default function App() {
  const { currentUser, isAuthChecking, setCurrentUser, setIsAuthChecking } = useAuthStore();

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

      // 2. Try automatic login only when explicitly configured for local testing
      const email = import.meta.env.VITE_TEST_EMAIL;
      const password = import.meta.env.VITE_TEST_PASSWORD;
      if (!email || !password) {
        console.warn("[AUTH] VITE_TEST_EMAIL/VITE_TEST_PASSWORD missing. Automatic test login skipped.");
        setCurrentUser(null);
        setIsAuthChecking(false);
        return;
      }

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
  }, [setCurrentUser, setIsAuthChecking]);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (user) setCurrentUser(user);
    });
  }, [setCurrentUser]);

  useEffect(() => {
    if (currentUser && auth?.currentUser?.uid === currentUser.uid) {
      const unsubscribeSync = syncService.startRealtimeSync(auth.currentUser);
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

