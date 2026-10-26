import React from 'react';
import {
  TrailOggi,
  TrailItinerario,
  TrailTappe,
  TrailAttivita,
  TrailAlloggi,
  TrailTrasporti,
  TrailPrenotazioni,
  TrailBagagli,
  TrailSpese,
  TrailLive,
  TrailCopiloti,
  TrailImpostazioni,
  TrailMappa,
  TrailCategorie,
  TrailRistoranti,
  TrailShopping,
  TrailSicurezza,
  TrailEmergenze,
  TrailNote,
  TrailToolkit,
  TrailAi
} from './TrailIcons';

export interface IconShowcaseItem {
  name: string;
  category: string;
  oldVisual: string;
  description: string;
  NewComponent: React.ComponentType<{ size?: number; active?: boolean; className?: string }>;
}

export const TRAIL_ICONS_COMPARISON: IconShowcaseItem[] = [
  {
    name: 'Oggi',
    category: 'Navigazione Principale',
    oldVisual: '📅 (Emoji generica / Lucide Calendar)',
    description: 'Calendario roadbook con orizzonte data e waypoint di arrivo pieno per la tappa odierna',
    NewComponent: TrailOggi
  },
  {
    name: 'Itinerario',
    category: 'Navigazione Principale',
    oldVisual: 'Curva S generica (Lucide Route)',
    description: 'Sentiero sinuoso con cerchio di partenza, sosta intermedia e milestone flag finale',
    NewComponent: TrailItinerario
  },
  {
    name: 'Tappe',
    category: 'Categorie Roadbook',
    oldVisual: '📍 (Emoji red pin standard)',
    description: 'Hounigo Waypoint pin con tracciato terreno tratteggiato e nucleo attivo',
    NewComponent: TrailTappe
  },
  {
    name: 'Attività',
    category: 'Categorie Roadbook',
    oldVisual: '🎯 (Emoji bersaglio)',
    description: 'Bussola avventura con ago romboidale direzionato verso il prossimo obiettivo',
    NewComponent: TrailAttivita
  },
  {
    name: 'Alloggi',
    category: 'Categorie Roadbook',
    oldVisual: '🛏️ (Emoji letto)',
    description: 'Rifugio con tetto spiovente, camino roadbook e portale accogliente a sentiero',
    NewComponent: TrailAlloggi
  },
  {
    name: 'Trasporti',
    category: 'Categorie Roadbook',
    oldVisual: '✈️ (Emoji aereo orizzontale)',
    description: 'Glider aerodinamico da viaggio con scia vettoriale in quota e traiettoria',
    NewComponent: TrailTrasporti
  },
  {
    name: 'Prenotazioni',
    category: 'Strumenti',
    oldVisual: '📑 (Emoji fogli)',
    description: 'Voucher di viaggio con intagli semicircolari laterali e sigillo di verifica',
    NewComponent: TrailPrenotazioni
  },
  {
    name: 'Bagagli',
    category: 'Strumenti',
    oldVisual: '🧳 (Emoji valigia marrone)',
    description: 'Trolley adventure con manico telescopico, cinghie rinforzate e fibbia waypoint',
    NewComponent: TrailBagagli
  },
  {
    name: 'Spese',
    category: 'Strumenti',
    oldVisual: '💳 (Emoji carta di credito)',
    description: 'Token di valuta con anello concentrico e dislivello sinuoso di budget',
    NewComponent: TrailSpese
  },
  {
    name: 'LIVE',
    category: 'In Evidenza',
    oldVisual: '📡 (Emoji antenna parabolica)',
    description: 'Faro di trasmissione con onde radar concentriche e trasmettitore beacon pieno',
    NewComponent: TrailLive
  },
  {
    name: 'Copiloti',
    category: 'Gestione',
    oldVisual: '👥 (Emoji busti generici)',
    description: 'Due compagni di viaggio collegati da ponte e cordata con profondità sfalsata',
    NewComponent: TrailCopiloti
  },
  {
    name: 'Impostazioni',
    category: 'Sistema',
    oldVisual: '⚙️ (Emoji ingranaggio industriale)',
    description: 'Ghiera d\'arresto e bussola di precisione con perno centrale roadbook',
    NewComponent: TrailImpostazioni
  },
  {
    name: 'Mappa',
    category: 'Navigazione Principale',
    oldVisual: 'Mappa 3 pannelli generica',
    description: 'Trittico carteggio prospettico con sentiero che attraversa le pieghe fino al punto d\'arrivo',
    NewComponent: TrailMappa
  },
  {
    name: 'Categorie',
    category: 'Navigazione Principale',
    oldVisual: '4 quadrati generici (Lucide LayoutGrid)',
    description: 'Reticolo 4 quadranti con angoli arrotondati e waypoint identificativo incorporato',
    NewComponent: TrailCategorie
  },
  {
    name: 'Ristoranti',
    category: 'Categorie Roadbook',
    oldVisual: '🍽️ (Emoji piatto e posate)',
    description: 'Piatto da degustazione con bordo circolare e posate minimali da viaggio',
    NewComponent: TrailRistoranti
  },
  {
    name: 'Shopping',
    category: 'Categorie Roadbook',
    oldVisual: '🛍️ (Emoji busta shopping rosa)',
    description: 'Shopping bag con manici arrotondati e stella di scoperta del territorio',
    NewComponent: TrailShopping
  },
  {
    name: 'Sicurezza',
    category: 'Strumenti',
    oldVisual: '🛡️ (Emoji scudo)',
    description: 'Scudo protettivo polizza con croce medica centrale e profilo sagomato',
    NewComponent: TrailSicurezza
  },
  {
    name: 'Emergenze',
    category: 'Strumenti',
    oldVisual: '📞 (Emoji telefono cornetta)',
    description: 'Ricevitore SOS con onde radio di contatto rapido',
    NewComponent: TrailEmergenze
  },
  {
    name: 'Note',
    category: 'Strumenti',
    oldVisual: '📝 (Emoji foglio e matita)',
    description: 'Taccuino con angolo ripiegato, righe appunti e bullet milestone',
    NewComponent: TrailNote
  },
  {
    name: 'Toolkit',
    category: 'Strumenti',
    oldVisual: 'ℹ️ (Emoji info blu)',
    description: 'Guida rapida del paese con cerchio waypoint e punto focale informativo',
    NewComponent: TrailToolkit
  },
  {
    name: 'HouniAI',
    category: 'Navigazione Principale',
    oldVisual: '✨ (Emoji sparkle generica)',
    description: 'Scintilla geometrica editoriale a 4 punte curve con traiettoria waypoint e stella polare',
    NewComponent: TrailAi
  }
];

export default function TrailIconsShowcaseModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF6B5F]/10 text-[#FF6B5F] flex items-center justify-center font-bold">
              <TrailItinerario size={22} active />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Hounigo Trail Icons — Tavola Comparativa
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mini design system iconografico: 24×24, tratti morbidi, trail waypoint e stati attivi distintivi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabella di confronto */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TRAIL_ICONS_COMPARISON.map((item) => {
              const IconComp = item.NewComponent;
              return (
                <div
                  key={item.name}
                  className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {item.category}
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {item.name}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                      24×24
                    </span>
                  </div>

                  <div className="flex items-center justify-around p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                    {/* Vecchia Icona */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-slate-400">Prima</span>
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-center text-slate-600 dark:text-slate-300">
                        {item.oldVisual.length <= 4 ? item.oldVisual : item.oldVisual.slice(0, 3)}
                      </div>
                    </div>

                    <div className="text-slate-300 dark:text-slate-700 font-bold">→</div>

                    {/* Nuova Icona (Stato Normale) */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-slate-400">Normale</span>
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                        <IconComp size={22} active={false} />
                      </div>
                    </div>

                    {/* Nuova Icona (Stato Attivo) */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-[#FF6B5F]">Attivo</span>
                      <div className="w-10 h-10 rounded-xl bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 border border-[#FF6B5F]/40 text-[#FF6B5F] flex items-center justify-center shadow-xs">
                        <IconComp size={22} active={true} />
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>20 componenti SVG originali pronti all'uso, zero dipendenze pesanti.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold cursor-pointer transition-colors"
          >
            Chiudi Anteprima
          </button>
        </div>
      </div>
    </div>
  );
}
