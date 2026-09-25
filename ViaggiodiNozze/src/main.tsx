import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { seedMilano29Dic } from "./data/seedMilano29Dic";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

// Seed initial real data
seedMilano29Dic();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
