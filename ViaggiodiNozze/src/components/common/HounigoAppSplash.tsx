import { useCallback, useEffect, useRef, useState } from 'react';
import HounigoMotionLogo from './HounigoMotionLogo';

const SPLASH_SESSION_KEY = 'hounigo_motion_splash_seen_v1';

export default function HounigoAppSplash() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('identityDiagnostics') === '1') return false;
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [isLeaving, setIsLeaving] = useState(false);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
    } catch {}
  }, [isVisible]);

  useEffect(() => () => {
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
  }, []);

  const finish = useCallback(() => {
    setIsLeaving(true);
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => setIsVisible(false), 180);
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`hounigo-app-splash ${isLeaving ? 'is-leaving' : ''}`} data-testid="hounigo-app-splash">
      <div className="hounigo-app-splash__brand">
        <HounigoMotionLogo animate theme="inherit" label="Hounigo" onFinished={finish} />
      </div>
      <button type="button" onClick={finish} className="hounigo-app-splash__skip" aria-label="Salta animazione iniziale">
        Salta
      </button>
    </div>
  );
}
