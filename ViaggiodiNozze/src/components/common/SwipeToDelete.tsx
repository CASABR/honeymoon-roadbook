import React, { useState, useRef } from 'react';
import type { ReactNode } from 'react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: ReactNode;
  disabled?: boolean;
}

export default function SwipeToDelete({ onDelete, children, disabled = false }: SwipeToDeleteProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const threshold = -50; // px
  const maxSwipe = -100; // px

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
    isHorizontalSwipeRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (disabled || startXRef.current === null || startYRef.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startXRef.current;
    const diffY = currentY - startYRef.current;

    // Detect if this is a horizontal or vertical swipe on first move
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > Math.abs(diffY)) {
        isHorizontalSwipeRef.current = true;
      } else {
        isHorizontalSwipeRef.current = false;
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Se si sta facendo swipe verso sinistra
      if (diffX < 0) {
        // Aggiungi un po' di resistenza quando si supera la soglia
        const tX = diffX < maxSwipe ? maxSwipe + (diffX - maxSwipe) * 0.2 : diffX;
        setTranslateX(tX);
      } else {
        setTranslateX(0);
      }
    }
  };

  const handleTouchEnd = () => {
    if (disabled || !isDragging) return;
    setIsDragging(false);
    
    if (translateX < threshold) {
      onDelete();
    }
    
    setTranslateX(0);
    startXRef.current = null;
    startYRef.current = null;
    isHorizontalSwipeRef.current = null;
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl group touch-pan-y">
      {/* Background delete indicator */}
      <div 
        className="absolute inset-y-0 right-0 w-24 bg-rose-500 rounded-3xl flex flex-col items-center justify-center text-white font-bold opacity-0 transition-opacity duration-200 shadow-inner"
        style={{ opacity: translateX < -15 ? 1 : 0 }}
      >
        <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span className="text-xs">Elimina</span>
      </div>
      
      {/* Draggable item */}
      <div 
        className="relative z-10 w-full"
        style={{ 
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: 'pan-y'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
