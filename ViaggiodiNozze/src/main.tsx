import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import LocalIdentityDiagnostics from "./components/dev/LocalIdentityDiagnostics";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");
const localDiagnostics = new URLSearchParams(window.location.search).get('identityDiagnostics') === '1'
  || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('localDiagnostics') === '1');

if (!localDiagnostics) {
  void import('./storage/syncService');
}



ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {localDiagnostics ? <LocalIdentityDiagnostics /> : <BrowserRouter basename={basename}><App /></BrowserRouter>}
    </ErrorBoundary>
  </React.StrictMode>
);
