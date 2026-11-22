import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react';
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
  const allItems = items;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Touch swipe & pan support
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const panStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, allItems.length - 1)));
      setIsZoomed(false);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex, allItems.length]);

  useEffect(() => {
    setIsZoomed(false);
    setPanOffset({ x: 0, y: 0 });
  }, [currentIndex]);

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

  const currentItem = allItems[currentIndex] || allItems[0];
  const isPdf = currentItem
    ? currentItem.type === 'pdf' ||
      currentItem.name?.toLowerCase().endsWith('.pdf') ||
      currentItem.dataUrl?.startsWith('data:application/pdf')
    : false;

  const toggleZoom = useCallback(() => {
    if (isPdf) return;
    setIsZoomed((prev) => {
      const next = !prev;
      if (!next) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, [isPdf]);

  // Swipe / pan handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.targetTouches.length !== 1) return;
    const touch = e.targetTouches[0];
    if (isZoomed) {
      panStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        originX: panOffset.x,
        originY: panOffset.y,
      };
      return;
    }
    touchStartX.current = touch.clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.targetTouches.length !== 1) return;
    const touch = e.targetTouches[0];
    if (isZoomed && panStart.current) {
      setPanOffset({
        x: Math.max(-220, Math.min(220, panStart.current.originX + (touch.clientX - panStart.current.x))),
        y: Math.max(-220, Math.min(220, panStart.current.originY + (touch.clientY - panStart.current.y))),
      });
      return;
    }
    touchEndX.current = touch.clientX;
  };

  const handleTouchEnd = () => {
    if (isZoomed) {
      panStart.current = null;
      return;
    }
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 45;

    if (diff > minSwipeDistance) {
      handleNext();
    } else if (diff < -minSwipeDistance) {
      handlePrev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleImageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      toggleZoom();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  // Crea un Blob URL stabile per il visualizzatore PDF
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
      className="app-lightbox-overlay fixed inset-0 flex flex-col bg-black/95 backdrop-blur-md select-none animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Barra Compatta */}
      <div
        className="w-full max-w-5xl mx-auto flex items-center justify-between gap-2 px-2 sm:px-4 py-1.5 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-white/90 truncate">
            {title}
          </span>
          {allItems.length > 1 && (
            <span
              data-testid="lightbox-counter"
              className="shrink-0 whitespace-nowrap text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-200"
            >
              {currentIndex + 1} / {allItems.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isPdf ? (
            <button
              type="button"
              onClick={handleOpenExternal}
              disabled={!currentBlobUrl}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Apri in nuova scheda"
              aria-label="Apri in nuova scheda"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleZoom}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title={isZoomed ? 'Ripristina zoom' : 'Zoom 2x'}
              aria-label={isZoomed ? 'Ripristina zoom' : 'Zoom 2x'}
            >
              {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
          )}
          {currentBlobUrl && (
            <a
              href={currentItem.dataUrl}
              download={currentItem.name}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Scarica"
              aria-label="Scarica"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Chiudi"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container: frecce laterali esterne al documento su desktop/tablet */}
      <div
        className="w-full max-w-5xl mx-auto flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-4 px-1 sm:px-2 py-1"
        onClick={(e) => e.stopPropagation()}
      >
        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="hidden sm:flex shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/90 items-center justify-center transition-colors cursor-pointer"
            title="Precedente"
            aria-label="Allegato precedente"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="flex-1 min-w-0 h-full flex items-center justify-center overflow-hidden">
          {isPdf && !currentBlobUrl ? (
            <p role="alert" className="max-w-md px-6 text-center text-sm leading-6 text-white">
              File non disponibile su questo dispositivo. Il riferimento non contiene un PDF apribile: verifica l’allegato originale sul dispositivo che lo conserva.
            </p>
          ) : isPdf ? (
            <iframe
              key={currentItem.id}
              src={`${currentBlobUrl}#toolbar=1&navpanes=0`}
              title={currentItem.name}
              className="w-full h-full rounded-lg border-0 bg-white"
            />
          ) : (
            <img
              key={currentItem.id}
              src={currentItem.dataUrl}
              alt={currentItem.name}
              onClick={handleImageTap}
              onDoubleClick={toggleZoom}
              style={{
                transform: isZoomed
                  ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(2)`
                  : 'translate3d(0, 0, 0) scale(1)',
                touchAction: isZoomed ? 'none' : 'pan-y pinch-zoom',
              }}
              className="max-w-full max-h-full w-auto h-auto object-contain transition-transform duration-200 cursor-zoom-in"
            />
          )}
        </div>

        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="hidden sm:flex shrink-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/90 items-center justify-center transition-colors cursor-pointer"
            title="Successivo"
            aria-label="Allegato successivo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Footer Compatto: nome file + frecce discrete su mobile senza coprire il QR */}
      <div
        className="w-full max-w-5xl mx-auto flex items-center justify-center gap-3 px-3 py-1.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="sm:hidden shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Allegato precedente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <p className="text-xs font-medium text-slate-300 truncate text-center min-w-0">
          {currentItem.name}
        </p>
        {allItems.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="sm:hidden shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Allegato successivo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(lightboxNode, document.body);
  }

  return lightboxNode;
}
