import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TransportAttachment } from '../../types';
import { dataUrlToBlob, openAttachmentInNewTab } from '../../utils/fileAttachment';

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
  // Supporta tutti gli allegati (immagini e PDF)
  const allItems = items;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, allItems.length - 1)));
    }
  }, [isOpen, initialIndex, allItems.length]);

  const handleNext = useCallback(() => {
    if (allItems.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % allItems.length);
  }, [allItems.length]);

  const handlePrev = useCallback(() => {
    if (allItems.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
  }, [allItems.length]);

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
      handleNext();
    } else if (diff < -minSwipeDistance) {
      handlePrev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const currentItem = allItems[currentIndex] || allItems[0];
  const isPdf = currentItem ? (currentItem.type === 'pdf' || currentItem.name?.toLowerCase().endsWith('.pdf') || currentItem.dataUrl?.startsWith('data:application/pdf')) : false;

  // Crea un Blob URL stabile per il visualizzatore PDF (risolve il blocco delle data URL negli iframe)
  const currentBlobUrl = useMemo(() => {
    if (!isOpen || !currentItem || !currentItem.dataUrl) return '';
    if (isPdf && currentItem.dataUrl.startsWith('data:')) {
      try {
        const blob = dataUrlToBlob(currentItem.dataUrl);
        return URL.createObjectURL(blob);
      } catch (e) {
        console.warn('Errore conversione Blob PDF:', e);
        return currentItem.dataUrl;
      }
    }
    return currentItem.dataUrl;
  }, [isOpen, currentItem, isPdf]);

  // Rilascia i blob URL temporanei alla chiusura o cambio file
  useEffect(() => {
    return () => {
      if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [currentBlobUrl]);

  if (!isOpen || allItems.length === 0 || !currentItem) return null;

  const handleOpenExternal = () => {
    openAttachmentInNewTab(currentItem.dataUrl, currentItem.name);
  };

  const lightboxNode = (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between bg-black/95 p-3 sm:p-6 backdrop-blur-md select-none animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
      }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Barra */}
      <div
        className="w-full max-w-4xl flex items-center justify-between py-2 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
            {title}
          </span>
          {allItems.length > 1 && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/20">
              {currentIndex + 1} di {allItems.length}
            </span>
          )}
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-white/15 text-slate-300">
            {isPdf ? '📄 PDF' : '🖼️ Immagine'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isPdf && (
            <button
              type="button"
              onClick={handleOpenExternal}
              className="px-3 py-1.5 rounded-full bg-sky-500/30 hover:bg-sky-500/50 border border-sky-400/40 text-sky-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Apri a schermo intero in una nuova scheda"
            >
              <span>Apri a schermo intero</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
          <a
            href={currentItem.dataUrl}
            download={currentItem.name}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Scarica documento"
          >
            <span>Scarica</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
            title="Chiudi"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Container with navigation arrows */}
      <div
        className="relative w-full max-w-4xl flex-1 flex items-center justify-center my-auto py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Freccia Sinistra */}
        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-1 sm:-left-5 z-20 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 border border-white/30 text-white flex items-center justify-center text-lg transition-transform active:scale-90 cursor-pointer shadow-xl"
            title="Precedente (frecce o swipe)"
          >
            ◀
          </button>
        )}

        {/* Visualizzatore: PDF incorporato o Immagine ad alta risoluzione */}
        <div className="w-full h-full max-h-[76vh] bg-slate-900/90 rounded-2xl sm:rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden border border-white/10 p-1 sm:p-2">
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative">
              <iframe
                key={currentItem.id}
                src={`${currentBlobUrl}#toolbar=1&navpanes=0`}
                title={currentItem.name}
                className="w-full h-full rounded-xl border-0 bg-white"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold border border-white/20 shadow-lg cursor-pointer flex items-center gap-1.5 backdrop-blur-sm"
                >
                  <span>Apri in nuova scheda</span>
                  <span>↗</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-white/5 rounded-xl flex items-center justify-center overflow-hidden p-2">
              <img
                key={currentItem.id}
                src={currentItem.dataUrl}
                alt={currentItem.name}
                className="w-full h-auto max-h-[72vh] object-contain rounded-lg transition-all duration-200"
              />
            </div>
          )}
        </div>

        {/* Freccia Destra */}
        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-1 sm:-right-5 z-20 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 border border-white/30 text-white flex items-center justify-center text-lg transition-transform active:scale-90 cursor-pointer shadow-xl"
            title="Successivo (frecce o swipe)"
          >
            ▶
          </button>
        )}
      </div>

      {/* Footer Dettagli & Consigli */}
      <div
        className="w-full max-w-4xl text-center py-2 shrink-0 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-slate-200 truncate px-4">
          {currentItem.name}
        </p>

        {allItems.length > 1 ? (
          <p className="text-[11px] text-slate-400">
            Scorri o usa le frecce per sfogliare tutti i documenti e biglietti ({currentIndex + 1} di {allItems.length})
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Documento allegato disponibile offline • Tocca all'esterno o premi ESC per chiudere
          </p>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(lightboxNode, document.body);
  }

  return lightboxNode;
}

