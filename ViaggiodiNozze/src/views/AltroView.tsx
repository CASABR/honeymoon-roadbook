import { useState } from 'react';
import PlaceholderView from './altro/PlaceholderView';
import DocumentiView from './altro/DocumentiView';
import AssicurazioneView from './altro/AssicurazioneView';
import DocumentiGalleriaView from './altro/DocumentiGalleriaView';
import TappeView from './altro/TappeView';

type SubViewType = 'tappe' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | null;

export default function AltroView() {
  const [activeSubView, setActiveSubView] = useState<SubViewType>(null);

  const handleBack = () => setActiveSubView(null);

  if (activeSubView === 'tappe') return <TappeView onBack={handleBack} />;
  if (activeSubView === 'assicurazione') return <AssicurazioneView onBack={handleBack} />;
  if (activeSubView === 'documenti') return <DocumentiView onBack={handleBack} />;
  if (activeSubView === 'emergenza') return <PlaceholderView title="Numeri di Emergenza" icon="📞" onBack={handleBack} />;
  if (activeSubView === 'info') return <PlaceholderView title="Info Utili" icon="ℹ️" onBack={handleBack} />;
  if (activeSubView === 'spese') return <PlaceholderView title="Spese & Budget" icon="💳" onBack={handleBack} />;
  if (activeSubView === 'bagagli') return <PlaceholderView title="Lista Bagagli" icon="🧳" onBack={handleBack} />;
  if (activeSubView === 'note') return <PlaceholderView title="Note di Viaggio" icon="📝" onBack={handleBack} />;
  if (activeSubView === 'galleria') return <DocumentiGalleriaView onBack={handleBack} />;

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-10">
      <div className="flex flex-col mb-4 px-1">
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Altro
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Tutto quello che ti serve, in un unico posto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Card 0: Tappe */}
        <button 
          onClick={() => setActiveSubView('tappe')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">📍</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Tappe</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Punti di passaggio e soste</p>
          </div>
        </button>

        {/* Card 1: Assicurazione */}
        <button 
          onClick={() => setActiveSubView('assicurazione')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">🛡️</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Assicurazione di viaggio</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Polizza, contatti, copertura h24 con chiamata rapida</p>
          </div>
        </button>

        {/* Card 2: Documenti */}
        <button 
          onClick={() => setActiveSubView('documenti')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">📑</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Documenti</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Passaporti, visti, patenti, scadenze</p>
          </div>
        </button>

        {/* Card 3: Numeri Emergenza */}
        <button 
          onClick={() => setActiveSubView('emergenza')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">📞</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Numeri di emergenza</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">111 NZ, 000 AU, 911 PH, Consolati</p>
          </div>
        </button>

        {/* Card 4: Info utili */}
        <button 
          onClick={() => setActiveSubView('info')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">ℹ️</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Info utili</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Fuso orario, valuta, prese elettriche</p>
          </div>
        </button>

        {/* Card 5: Spese & Budget */}
        <button 
          onClick={() => setActiveSubView('spese')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">💳</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Spese & Budget</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Riepilogo costi saldati vs da saldare</p>
          </div>
        </button>

        {/* Card 6: Lista bagagli */}
        <button 
          onClick={() => setActiveSubView('bagagli')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">🧳</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Lista bagagli</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Checklist cosa portare, franchigie</p>
          </div>
        </button>

        {/* Card 7: Note di viaggio */}
        <button 
          onClick={() => setActiveSubView('note')}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">📝</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Note di viaggio</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Appunti, idee, promemoria</p>
          </div>
        </button>

        {/* Card Full Width: Documenti del Viaggio */}
        <button 
          onClick={() => setActiveSubView('galleria')}
          className="col-span-2 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex items-center justify-between cursor-pointer mt-2"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl">
              📂
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-900 text-sm">Documenti del viaggio</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Galleria allegati e PDF caricati</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
