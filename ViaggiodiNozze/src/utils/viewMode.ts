export type ViewMode = 'auto' | 'desktop' | 'tablet' | 'mobile';
export type EffectiveViewMode = Exclude<ViewMode,'auto'>;
export function resolveViewMode(mode: ViewMode, width: number, height: number, touch: boolean): EffectiveViewMode {
  // Keep native smartphone layout on narrow windows, including tablet split view.
  if (width < 600 || (touch && Math.min(width,height) < 600)) return 'mobile';
  if (mode === 'desktop' && width < 768) return 'mobile';
  if (mode !== 'auto') return mode;
  if (touch && Math.min(width,height) >= 600) return 'tablet';
  return width >= 768 ? 'desktop' : 'mobile';
}
export function readViewMode(saved: string | null, legacy: string | null, width: number, height: number, touch: boolean): ViewMode {
  if (saved === 'auto' || saved === 'tablet' || saved === 'mobile' || saved === 'desktop') return saved;
  // Old smartphone simulation was the only alternative to desktop on tablets.
  if (touch && Math.min(width,height) >= 600) return 'auto';
  return legacy === 'mobile' || legacy === 'desktop' ? legacy : 'auto';
}
