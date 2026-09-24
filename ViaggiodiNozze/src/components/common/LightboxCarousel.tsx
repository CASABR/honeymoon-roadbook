import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransportAttachment } from '../../types';

interface LightboxCarouselProps {
  isOpen: boolean;
  onClose: () => void;
  items: TransportAttachment[];
  initialIndex?: number;
  title?: string;
}

export default function LightboxCarousel({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  title = 'Pronto per la scansione'
}: LightboxCarouselProps) {
  // Filtra solo le immagini
  const imageItems = items.filter((item) => item.type === 'image');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, imageItems.length - 1)));
    }
  }, [isOpen, initialIndex, imageItems.length]);

  const handleNext = useCallback(() => {
    if (imageItems.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % imageItems.length);
  }, [imageItems.length]);

  const handlePrev = useCallback(() => {
    if (imageItems.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + imageItems.length) % imageItems.length);
  }, [imageItems.length]);

  // Keyboard navigation (Arrow keys & Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  // Swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 45; // pixel

    if (diff > minSwipeDistance) {
      // Swipe a sinistra -> Prossima foto
      handleNext();
    } else if (diff < -minSwipeDistance) {
      // Swipe a destra -> Foto precedente
      handlePrev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (!isOpen || imageItems.length === 0) return null;

  const currentItem = imageItems[currentIndex] || imageItems[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-black/95 p-4 sm:p-6 backdrop-blur-md select-none animate-fade-in"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Barra */}
      <div
        className="w-full max-w-md flex items-center justify-between py-2 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
            {title}
          </span>
          {imageItems.length > 1 && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/20">
              {currentIndex + 1} di {imageItems.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
          title="Chiudi"
        >
          ✕
        </button>
      </div>

      {/* Main Image Container with navigation arrows */}
      <div
        className="relative w-full max-w-md flex-1 flex items-center justify-center my-auto py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Freccia Sinistra */}
        {imageItems.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-1 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center text-lg transition-transform active:scale-90 cursor-pointer shadow-lg"
            title="Precedente (o swipe verso destra)"
          >
            ◀
          </button>
        )}

        {/* Immagine / QR Code Ingrandito */}
        <div className="w-full max-h-[72vh] bg-white p-2.5 sm:p-4 rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden">
          <img
            key={currentItem.id}
            src={currentItem.dataUrl}
            alt={currentItem.name}
            className="w-full h-auto max-h-[66vh] object-contain rounded-xl transition-all duration-200"
          />
        </div>

        {/* Freccia Destra */}
        {imageItems.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-1 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center text-lg transition-transform active:scale-90 cursor-pointer shadow-lg"
            title="Successiva (o swipe verso sinistra)"
          >
            ▶
          </button>
        )}
      </div>

      {/* Footer Dettagli & Consigli */}
      <div
        className="w-full max-w-md text-center py-2 shrink-0 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-slate-300 truncate px-4">
          {currentItem.name}
        </p>

        {imageItems.length > 1 ? (
          <p className="text-[11px] text-slate-400">
            Scorri con il dito o usa le frecce per sfogliare i biglietti • Aumenta la luminosità per la scansione
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Aumenta la luminosità dello schermo per facilitare la scansione del lettore ottico.
          </p>
        )}
      </div>
    </div>
  );
}
