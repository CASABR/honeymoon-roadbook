import { useState } from 'react';
import PropostaARoadbookEditoriale from './PropostaARoadbookEditoriale';
import PropostaBTravelBoard from './PropostaBTravelBoard';

export default function PrototypeComparisonView() {
  const [activeTab, setActiveTab] = useState<'a' | 'b' | 'compare'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('mode');
      if (p === 'a') return 'a';
      if (p === 'b') return 'b';
      if (p === 'compare') return 'compare';
    }
    return 'a';
  });

  const [isViewer, setIsViewer] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      
      {/* ─── TOOLBAR DI CONTROLLO PROTOTIPO ─── */}
      <div id="prototype-toolbar" className="sticky top-0 z-50 bg-slate-900 text-white px-3 py-2 border-b border-slate-800 shadow-lg flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="font-extrabold text-[#FF6B5F] tracking-wide">HOUNIGO LAB</span>
          <span className="text-slate-600">|</span>
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('a')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                activeTab === 'a' ? 'bg-[#FF6B5F] text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              A: Roadbook
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('b')}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                activeTab === 'b' ? 'bg-[#FF6B5F] text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              B: Travel Board
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className={`hidden sm:inline-block px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                activeTab === 'compare' ? 'bg-[#FF6B5F] text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Confronto 1:1
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch Ruolo */}
          <button
            type="button"
            onClick={() => setIsViewer(!isViewer)}
            className={`px-2.5 py-1 rounded-md font-bold border transition-colors cursor-pointer ${
              isViewer 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            Ruolo: {isViewer ? 'Viewer' : 'Owner'}
          </button>

          {/* Switch Dark Mode */}
          <button
            type="button"
            onClick={toggleDark}
            className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-xs cursor-pointer"
            title="Inverti tema chiaro/scuro"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* ─── CONTENUTO PROTOTIPO ─── */}
      <div className="flex-1 w-full">
        {activeTab === 'a' && (
          <div className="w-full max-w-md mx-auto shadow-2xl bg-white dark:bg-[#0F141C] min-h-screen">
            <PropostaARoadbookEditoriale isViewer={isViewer} />
          </div>
        )}

        {activeTab === 'b' && (
          <div className="w-full max-w-md mx-auto shadow-2xl bg-[#F4F5F7] dark:bg-[#0B0F17] min-h-screen">
            <PropostaBTravelBoard isViewer={isViewer} />
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="p-4 flex flex-col lg:flex-row gap-6 justify-center items-start max-w-7xl mx-auto">
            <div className="w-full max-w-md mx-auto flex-1 shadow-2xl rounded-3xl overflow-hidden border border-stone-200 dark:border-slate-800">
              <div className="bg-stone-900 text-white text-xs font-bold px-4 py-2 text-center uppercase tracking-wider">
                Proposta A: Roadbook Editoriale
              </div>
              <PropostaARoadbookEditoriale isViewer={isViewer} />
            </div>

            <div className="w-full max-w-md mx-auto flex-1 shadow-2xl rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <div className="bg-[#172033] text-white text-xs font-bold px-4 py-2 text-center uppercase tracking-wider">
                Proposta B: Travel Board
              </div>
              <PropostaBTravelBoard isViewer={isViewer} />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
