import { useEffect, useState } from 'react';

export interface VisualViewportBox {
  offsetTop: number;
  height: number;
}

/**
 * Rileva il restringimento di window.visualViewport (es. tastiera software su iPadOS/iOS PWA)
 * quando inferiore alla finestra layout, per vincolare overlay e modali sopra la tastiera.
 */
export function useVisualViewportBox(active: boolean): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) {
      setBox(null);
      return;
    }

    const vv = window.visualViewport;
    const syncViewport = () => {
      const shrinkPx = window.innerHeight - vv.height;
      if (shrinkPx > 40) {
        setBox({
          offsetTop: Math.max(0, Math.round(vv.offsetTop)),
          height: Math.max(1, Math.floor(vv.height)),
        });
      } else {
        setBox(null);
      }
    };

    syncViewport();
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  }, [active]);

  return box;
}
