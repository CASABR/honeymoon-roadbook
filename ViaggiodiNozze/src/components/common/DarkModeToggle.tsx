import { useState, useEffect } from 'react';

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const nextMode = !isDark;
    setIsDark(nextMode);
    
    if (nextMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    
    // Dispatche un evento custom in modo che altri componenti (es. grafici o mappe) possano reagire
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { isDark: nextMode } }));
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-200/50 hover:bg-slate-300/50 transition-colors cursor-pointer overflow-hidden"
      aria-label="Toggle Dark Mode"
      title={isDark ? 'Passa alla Modalità Chiara' : 'Passa alla Modalità Scura'}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-in-out ${
          isDark ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <span className="text-sm leading-none block">🌙</span>
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-in-out ${
          isDark ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <span className="text-sm leading-none block">☀️</span>
      </div>
    </button>
  );
}
