import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { auth, onAuthStateChanged } from "./services/firebase";
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

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
