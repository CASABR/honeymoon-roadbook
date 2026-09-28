import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { storageService } from "./storage/storageService";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

// Inizializza i dati di default esclusivamente al primissimo avvio assoluto
storageService.initInitialSeedData().catch((err) => {
  console.error("Errore inizializzazione seed:", err);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
