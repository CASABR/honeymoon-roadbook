import { useState, useEffect } from 'react';

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('houni_theme') || localStorage.getItem('theme');
    const dark = saved === 'dark';
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#172033' : '#F8F7F3');
  }, []);

  const toggleDarkMode = () => {
    const nextMode = !isDark;
    setIsDark(nextMode);
    
    const themeStr = nextMode ? 'dark' : 'light';
    if (nextMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', nextMode ? '#172033' : '#F8F7F3');
    localStorage.setItem('houni_theme', themeStr);
    localStorage.setItem('theme', themeStr);
    
    // Dispatche un evento custom in modo che altri componenti (es. grafici o mappe) possano reagire
    window.dispatchEvent(new CustomEvent('theme_changed', { detail: { isDark: nextMode } }));
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-300/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer overflow-hidden focus-visible:ring-2 focus-visible:ring-[#FF6B5F] outline-hidden"
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
