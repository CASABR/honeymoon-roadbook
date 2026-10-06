import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface WalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const slides = [
  {
    id: 'intro',
    title: 'Benvenuti nel vostro Roadbook',
    content: 'Questo è il vostro compagno di viaggio digitale. Qui troverete tutto ciò che vi serve per la vostra luna di miele, organizzato e accessibile in qualsiasi momento.',
    icon: '🌍',
  },
  {
    id: 'oggi',
    title: 'La scheda Oggi',
    content: 'La vostra bussola quotidiana. Troverete gli eventi del giorno in ordine cronologico: tappe, voli, e alloggi. Scorrerà automaticamente all\'evento più vicino all\'ora attuale.',
    icon: '📅',
  },
  {
    id: 'live',
    title: 'Funzione Live & Copilota',
    content: 'Il cuore dell\'app durante il viaggio! Dalla sezione "Altro" avviate il "Live": avrete il meteo in tempo reale, il tachimetro GPS, bussola, e la condivisione istantanea della vostra posizione per le emergenze.',
    icon: '📡',
  },
  {
    id: 'smart',
    title: '✨ Inserimento Smart AI',
    content: 'Aggiungere prenotazioni è magico. Cliccate sul pulsante "Smart" in alto a destra, incollate il testo di un\'email (es. Booking o Ryanair) e l\'Intelligenza Artificiale estrarrà date, orari, indirizzi e costi per voi!',
    icon: '🧠',
  },
  {
    id: 'categorie',
    title: 'Tutto al suo posto',
    content: 'Esplora e gestisci il tuo itinerario organizzato in pratiche sezioni:',
    icon: '🗂️',
  },
  {
    id: 'mappa',
    title: 'Mappa Globale',
    content: 'Dal pulsante "Mappa" potrete vedere tutti i punti di interesse del vostro viaggio con percorsi e distanze, tutto integrato per non perdervi mai.',
    icon: '🗺️',
  },
  {
    id: 'offline',
    title: 'Sempre con voi (Offline)',
    content: 'Nessuna connessione nel deserto o in aereo? Nessun problema! L\'app funziona anche offline. Ricordatevi solo di aprirla sotto rete Wi-Fi per sincronizzare i dati prima di partire.',
    icon: '✈️',
  }
];

export default function WalkthroughModal({ isOpen, onClose }: WalkthroughModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  };

  const current = slides[currentSlide];

  const modalNode = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Modal Container Glassmorphism (Light & Dark Support) */}
      <div 
        className="relative w-full max-w-lg mx-auto max-h-[85dvh] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header pulito con X */}
        <div className="flex justify-between items-center p-4 pb-0">
          <div className="text-[10px] font-bold tracking-widest text-indigo-500 dark:text-indigo-400 uppercase">
            Guida Rapida • {currentSlide + 1}/{slides.length}
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 hover:text-slate-700 dark:text-white/70 dark:hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center text-center px-6 pt-4 pb-8">
          
          {/* Icona e Grafica Slide con Glow */}
          <div className="relative mb-8 group">
            {/* Glow / Riflesso indigo-violet */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full blur-2xl opacity-20 dark:opacity-40 animate-pulse transition-transform duration-500"></div>
            <div className="relative w-24 h-24 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-white/10 rounded-full flex items-center justify-center text-5xl shadow-[0_8px_30px_rgba(99,102,241,0.15)] dark:shadow-[0_0_30px_rgba(99,102,241,0.3)] transform transition-transform duration-500 group-hover:scale-110">
              {current.icon}
            </div>
          </div>
          
          {/* Titolo */}
          <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight mb-3">
            {current.title}
          </h3>
          
          {/* Contenuto dinamico */}
          <div className="min-h-[110px] flex flex-col items-center justify-center w-full">
            {current.id === 'categorie' ? (
              <div className="w-full flex flex-col items-center gap-3">
                <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  {current.content}
                </p>
                <div className="w-full flex flex-wrap justify-center gap-1.5 mt-1">
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">📍 Tappe</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">🎟️ Attività</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">🏨 Alloggi</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">🍽️ Ristoranti</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">✈️ Trasporti</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-xs font-bold">🛍️ Shopping</span>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {current.content}
              </p>
            )}
          </div>

          {/* Indicatori (Dots) */}
          <div className="flex gap-2 mt-8 mb-6">
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`transition-all duration-300 ease-out ${
                  idx === currentSlide 
                    ? 'w-6 h-2 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]' 
                    : 'w-2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full'
                }`}
              />
            ))}
          </div>

          {/* Navigazione */}
          <div className="flex items-center w-full justify-between gap-3 mt-2">
            <button
              type="button"
              onClick={prevSlide}
              className={`py-3 px-4 text-sm font-bold transition-all duration-300 cursor-pointer ${
                currentSlide === 0 
                  ? 'opacity-0 pointer-events-none' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white active:scale-95'
              }`}
            >
              Indietro
            </button>
            
            <button
              type="button"
              onClick={nextSlide}
              className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 shadow-lg shadow-indigo-500/25 text-[#ffffff] text-[15px] font-bold active:scale-95 transition-all duration-300 cursor-pointer"
            >
              {currentSlide === slides.length - 1 ? 'Inizia l\'avventura! ✨' : 'Avanti ➔'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }
  return null;
}
