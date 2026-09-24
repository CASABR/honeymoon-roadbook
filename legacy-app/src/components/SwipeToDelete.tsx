import { useRef, useState } from "react";

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
  label?: string;
  threshold?: number;
}

/**
 * SwipeToDelete — swipe sinistra per mostrare pannello elimina.
 * - NON blocca lo scroll verticale
 * - NON annulla il tap se deltaX < 5px
 * - Al rilascio oltre soglia: confirm → onDelete o ripristino
 */
export default function SwipeToDelete({
  onDelete,
  children,
  label = "Elimina",
  threshold = 80,
}: SwipeToDeleteProps) {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHorizontalRef = useRef<boolean | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  function snapBack() {
    setIsAnimating(true);
    setTranslateX(0);
    setTimeout(() => setIsAnimating(false), 300);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    isDraggingRef.current = true;
    isHorizontalRef.current = null;
    setIsAnimating(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDraggingRef.current) return;
    const t = e.touches[0];
    const dx = startXRef.current - t.clientX;
    const dy = Math.abs(t.clientY - startYRef.current);

    if (isHorizontalRef.current === null && (Math.abs(dx) > 5 || dy > 5)) {
      isHorizontalRef.current = Math.abs(dx) > dy;
    }
    if (!isHorizontalRef.current) return;

    if (dx > 0) {
      e.preventDefault();
      setTranslateX(-Math.min(dx, threshold + 24));
    }
  }

  function handleTouchEnd() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (isHorizontalRef.current && Math.abs(translateX) >= threshold) {
      const confirmed = window.confirm("Vuoi eliminare questo elemento?");
      if (confirmed) {
        onDelete();
      } else {
        snapBack();
      }
    } else {
      snapBack();
    }
  }

  const revealPct = Math.min(Math.abs(translateX) / threshold, 1);
  const showPanel = revealPct > 0.05;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showPanel && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 rounded-r-2xl"
          style={{ width: `${Math.max(56, Math.abs(translateX))}px` }}
        >
          <div className="flex flex-col items-center gap-0.5 px-2">
            <span className="text-[20px]">🗑️</span>
            <span
              className="text-white text-[9px] font-extrabold uppercase tracking-wider"
              style={{ opacity: Math.min(revealPct * 2, 1) }}
            >
              {label}
            </span>
          </div>
        </div>
      )}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? "transform 0.28s cubic-bezier(0.25,0.8,0.25,1)" : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
