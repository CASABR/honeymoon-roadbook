import React from 'react';

/**
 * Hounigo Trail Icons — Mini Design System Iconografico Originale
 * 
 * Linee guida stilistiche:
 * - Griglia vettoriale coerente 24×24 (viewBox="0 0 24 24")
 * - Tratti arrotondati (strokeLinecap="round", strokeLinejoin="round")
 * - Dettaglio ricorrente "Trail Waypoint": punto di passaggio o traguardo con geometrie curve
 * - Stato attivo riconoscibile sia dalla silhouette geometrica (forma piena/marker) sia dallo spessore
 * - 0 dipendenze esterne, componenti SVG React puri e leggeri
 */

export interface TrailIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  active?: boolean;
  className?: string;
  strokeWidth?: number;
}

const baseProps = (size: number | string = 24, strokeWidth = 2, active = false, className = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: active ? strokeWidth + 0.35 : strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true
});

/** 1. OGGI / CALENDARIO DI TAPPA */
export function TrailOggi({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Cornice calendario arrotondata */}
      <rect x="3.5" y="4.5" width="17" height="16" rx="4" />
      {/* Barra orizzontale intestazione data */}
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      {/* Occhielli superiori per ganci roadbook */}
      <line x1="8" y1="2.5" x2="8" y2="5" />
      <line x1="16" y1="2.5" x2="16" y2="5" />
      {/* Trail Waypoint oggi: curva di percorso che tocca il giorno attivo */}
      <path d="M7 15.5 Q 9.5 13, 12 14.5" />
      {/* Punto traguardo del giorno corrente (pieno se attivo) */}
      <circle cx="15.5" cy="14.5" r={active ? "2" : "1.5"} fill={active ? "currentColor" : "currentColor"} />
    </svg>
  );
}

/** 2. ITINERARIO / TRACCIATO COMPLETO */
export function TrailItinerario({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Punto di partenza itinerario */}
      <circle cx="5" cy="19" r="2" fill={active ? "currentColor" : "none"} />
      {/* Sentiero a S sinuoso con deviazione intermedia */}
      <path d="M7 19 C 13 19, 9 12, 14 12 C 17.5 12, 18 9, 18 6.5" />
      {/* Tappa intermedia di sosta lungo il sentiero */}
      <circle cx="11.5" cy="13.8" r="1.2" fill="currentColor" />
      {/* Destinazione / Milestone finale con pin a bandierina */}
      <circle cx="18" cy="5" r={active ? "2.4" : "1.8"} fill={active ? "currentColor" : "none"} />
      {active && <circle cx="18" cy="5" r="0.9" fill="white" />}
    </svg>
  );
}

/** 3. TAPPE / WAYPOINT ROADBOOK */
export function TrailTappe({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Traccia del terreno / strada sottostante */}
      <path d="M4 21.5 C 8 20, 16 23, 20 21" strokeDasharray="1.5 2" />
      {/* Sagoma pin a goccia stilizzata Hounigo */}
      <path d="M12 21 C 12 21, 6.5 14.5, 6.5 9.5 A 5.5 5.5 0 0 1 17.5 9.5 C 17.5 14.5, 12 21, 12 21 Z" />
      {/* Nucleo waypoint interno (pieno nello stato attivo) */}
      <circle cx="12" cy="9.5" r={active ? "2.5" : "2"} fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

/** 4. ATTIVITÀ / BUSSOLA AVVENTURA */
export function TrailAttivita({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Cerchio bussola / quadrante */}
      <circle cx="12" cy="12" r="9" />
      {/* Tacche dei quattro punti cardinali */}
      <line x1="12" y1="3" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21" />
      <line x1="3" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21" y2="12" />
      {/* Ago romboidale orientato a nord-est */}
      <path
        d="M14.8 9.2 L11 11.2 L9.2 14.8 L13 12.8 Z"
        fill={active ? "currentColor" : "none"}
      />
      {/* Perno centrale */}
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** 5. ALLOGGI / RIFUGIO & HOTEL */
export function TrailAlloggi({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Tetto a capanna con pendenza morbida */}
      <path d="M3.5 11 L12 4 L20.5 11" />
      {/* Camino rifugio / antenna */}
      <path d="M17 7.5 V5 h2.5 v4.5" />
      {/* Pareti dell'alloggio */}
      <path d="M5.5 10.5 V19.5 A 1.5 1.5 0 0 0 7 21 H17 A 1.5 1.5 0 0 0 18.5 19.5 V10.5" />
      {/* Portale d'accesso con sentiero che entra all'interno */}
      <path d="M10 21 V14.5 A 2 2 0 0 1 14 14.5 V21" fill={active ? "currentColor" : "none"} />
      {active && <circle cx="12" cy="9.5" r="1.2" fill="currentColor" />}
    </svg>
  );
}

/** 6. TRASPORTI / GLIDER IN ROTTA (AEREO & STRADA) */
export function TrailTrasporti({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Sagoma aereo da viaggio inclinata */}
      <path
        d="M21 3 L14 10 L6.5 7.5 L5 9 L9.5 12.5 L6.5 15.5 L4.5 15 L3.5 16.5 L6.5 18 L8 21 L9.5 20 L9 18 L12 15 L15.5 19.5 L17 18 L14.5 10.5 Z"
        fill={active ? "currentColor" : "none"}
      />
      {/* Scia di spostamento / rotta tratteggiata */}
      <path d="M3 21 C 5 18, 7 17, 8 16" strokeDasharray="1 1.5" />
    </svg>
  );
}

/** 7. PRENOTAZIONI / VOUCHER DI VIAGGIO */
export function TrailPrenotazioni({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Biglietto/voucher con intagli laterali semicircolari */}
      <path d="M4 6 A 2 2 0 0 1 6 4 H18 A 2 2 0 0 1 20 6 V9.5 A 2.5 2.5 0 0 0 20 14.5 V18 A 2 2 0 0 1 18 20 H6 A 2 2 0 0 1 4 18 V14.5 A 2.5 2.5 0 0 0 4 9.5 Z" />
      {/* Linea perforata interna per strappo/conferma */}
      <line x1="10" y1="5.5" x2="10" y2="18.5" strokeDasharray="2 2" />
      {/* Timbro di validazione / check */}
      <circle cx="15.5" cy="12" r={active ? "2.5" : "2"} fill={active ? "currentColor" : "none"} />
      {active && <path d="M14.5 12 l 0.8 0.8 l 1.5 -1.5" stroke="white" strokeWidth="1.2" />}
    </svg>
  );
}

/** 8. BAGAGLI / VALIGIA ROADBOOK */
export function TrailBagagli({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Corpo valigia trolley con spigoli protetti */}
      <rect x="4" y="6.5" width="16" height="14" rx="3" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.08 : 0} />
      {/* Maniglia telescopica superiore */}
      <path d="M9 6.5 V3.5 A 1 1 0 0 1 10 2.5 H14 A 1 1 0 0 1 15 3.5 V6.5" />
      {/* Cinghie/linee verticali di rinforzo da viaggio */}
      <line x1="8.5" y1="6.5" x2="8.5" y2="20.5" />
      <line x1="15.5" y1="6.5" x2="15.5" y2="20.5" />
      {/* Fibbia centrale / Waypoint lock */}
      <circle cx="12" cy="13.5" r={active ? "1.8" : "1.4"} fill="currentColor" />
    </svg>
  );
}

/** 9. SPESE / TOKEN BUDGET & VALUTA */
export function TrailSpese({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Moneta / gettone principale */}
      <circle cx="12" cy="12" r="9" />
      {/* Anello concentrico interno */}
      <circle cx="12" cy="12" r="6.5" strokeDasharray={active ? "none" : "2 1.5"} />
      {/* Simbolo dislivello / cambio valuta sinuoso */}
      <path d="M12 7.5 V16.5" />
      <path d="M9.5 10 C 9.5 8.5, 14.5 8.5, 14.5 10.5 C 14.5 12.5, 9.5 11.5, 9.5 13.5 C 9.5 15.5, 14.5 15.5, 14.5 14" />
      {active && <circle cx="12" cy="12" r="1.2" fill="currentColor" />}
    </svg>
  );
}

/** 10. LIVE / FARO TRASMISSIONE & BEACON */
export function TrailLive({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Onde concentriche radar esterne */}
      <path d="M4.5 7.5 A 11 11 0 0 1 19.5 7.5" />
      <path d="M7 10.5 A 7 7 0 0 1 17 10.5" />
      {/* Nucleo antenna / trasmettitore beacon (pulsante/pieno) */}
      <circle cx="12" cy="14" r={active ? "2.6" : "2"} fill="currentColor" />
      {/* Base a traliccio treppiede */}
      <path d="M12 16.5 V21.5" />
      <path d="M9 21.5 L12 17 L15 21.5" />
    </svg>
  );
}

/** 11. COPILOTI / EQUIPAGGIO IN VIAGGIO */
export function TrailCopiloti({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Organizzatore principale (sinistra) */}
      <circle cx="8.5" cy="8" r="3.2" fill={active ? "currentColor" : "none"} />
      <path d="M3.5 19 C 3.5 15.5, 5.5 14, 8.5 14 C 10.5 14, 12 14.8, 12.8 16" />
      {/* Copilota compagno di viaggio (destra, leggermente arretrato per profondità) */}
      <circle cx="16" cy="9.5" r="2.8" />
      <path d="M13 18.5 C 13.5 16.5, 14.5 15.5, 16.5 15.5 C 19 15.5, 20.5 17, 20.5 19.5" />
      {/* Filo conduttore / collegamento tra i due partecipanti */}
      <line x1="8.5" y1="19" x2="16" y2="19" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

/** 12. IMPOSTAZIONI / GHIERA & BUSSOLA DI REGOLAZIONE */
export function TrailImpostazioni({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Ghiera a 6 tacche d'arresto arrotondate */}
      <path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3" />
      {/* Corpo corona circolare */}
      <circle cx="12" cy="12" r="6" />
      {/* Perno centrale con waypoint ring */}
      <circle cx="12" cy="12" r={active ? "2.5" : "1.8"} fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

/** 13. MAPPA / CARTEGGIO ROADBOOK */
export function TrailMappa({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Trittico pieghevole mappa a tre ante */}
      <path d="M3.5 5.5 L9 3 L15 5.5 L20.5 3 V18.5 L15 21 L9 18.5 L3.5 21 Z" />
      {/* Pieghe verticali prospettiche */}
      <line x1="9" y1="3" x2="9" y2="18.5" />
      <line x1="15" y1="5.5" x2="15" y2="21" />
      {/* Traccia di percorso che attraversa le ante con waypoint */}
      <path d="M6 14 Q 9 10, 12 12 T 18 8" strokeDasharray="1 1.5" />
      <circle cx="17.5" cy="8.5" r={active ? "1.8" : "1.3"} fill="currentColor" />
    </svg>
  );
}

/** 14. CATEGORIE / RETICOLO A GRIGLIA INTELLIGENTE */
export function TrailCategorie({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* 4 Quadranti con angoli stondati e waypoint identificativo */}
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      {/* Quadrante 4 con piccolo waypoint circolare */}
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      <circle cx="17" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 15. RISTORANTI / DEGUSTAZIONE & SOSTE */
export function TrailRistoranti({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Piatto con bordo circolare */}
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" strokeDasharray={active ? "none" : "2 1.5"} />
      {/* Forchetta stilizzata a sinistra */}
      <path d="M4 4.5 V9 A 2 2 0 0 0 6 11 V19.5" />
      {/* Coltello stilizzato a destra */}
      <path d="M20 4.5 C 19 6, 18 9, 18 11 V19.5" />
      {active && <circle cx="12" cy="12" r="1.8" fill="currentColor" />}
    </svg>
  );
}

/** 16. SHOPPING & EXTRA / SHOPPING BAG CON SENTIERO */
export function TrailShopping({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Borsa da viaggio con angoli arrotondati */}
      <path d="M5 8.5 H19 L18 20.5 A 2 2 0 0 1 16 22.5 H8 A 2 2 0 0 1 6 20.5 Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.1 : 0} />
      {/* Manici borsa ricurvi */}
      <path d="M9 8.5 V6 A 3 3 0 0 1 15 6 V8.5" />
      {/* Stella/scintilla centrale di scoperta */}
      <circle cx="12" cy="14.5" r={active ? "2" : "1.4"} fill="currentColor" />
    </svg>
  );
}

/** 17. SICUREZZA / SCUDO POLIZZA */
export function TrailSicurezza({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Scudo protettivo sagomato */}
      <path d="M12 3 L4 6.5 V12 C 4 17, 7.5 21, 12 22 C 16.5 21, 20 17, 20 12 V6.5 Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
      {/* Croce medica o check centrale */}
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}

/** 18. TELEFONO EMERGENZE / CONTATTO DIRETTO */
export function TrailEmergenze({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Ricevitore cornetta dinamica */}
      <path d="M20.5 16.5 C 19 16.5, 17.5 16.2, 16.2 15.7 A 1 1 0 0 0 15 16 L13 18 C 10 16.5, 7.5 14, 6 11 L8 9 A 1 1 0 0 0 8.3 7.8 C 7.8 6.5, 7.5 5, 7.5 3.5 A 1 1 0 0 0 6.5 2.5 H3.5 A 1 1 0 0 0 2.5 3.5 C 2.5 13.5, 10.5 21.5, 20.5 21.5 A 1 1 0 0 0 21.5 20.5 V17.5 A 1 1 0 0 0 20.5 16.5 Z" fill={active ? "currentColor" : "none"} />
      {/* Onde di chiamata SOS */}
      <path d="M16 4 A 6 6 0 0 1 20 8" />
      <path d="M18.5 2 A 9 9 0 0 1 22.5 6" />
    </svg>
  );
}

/** 19. NOTE & PROMEMORIA ROADBOOK */
export function TrailNote({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Foglio taccuino con angolo ripiegato */}
      <path d="M5 4 A 2 2 0 0 1 7 2 H14 L19 7 V20 A 2 2 0 0 1 17 22 H7 A 2 2 0 0 1 5 20 Z" />
      <path d="M14 2 V7 H19" />
      {/* Righe appunti */}
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="16" x2="13.5" y2="16" />
      {active && <circle cx="15.5" cy="16" r="1.3" fill="currentColor" />}
    </svg>
  );
}

/** 20. TOOLKIT & INFO GUIDA */
export function TrailToolkit({ size = 24, active = false, className = '', strokeWidth = 1.9, ...props }: TrailIconProps) {
  return (
    <svg {...baseProps(size, strokeWidth, active, className)} {...props}>
      {/* Cerchio info con waypoint */}
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="8" r="1.4" fill="currentColor" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeWidth="2.2" />
      <line x1="10" y1="11" x2="12" y2="11" />
    </svg>
  );
}
