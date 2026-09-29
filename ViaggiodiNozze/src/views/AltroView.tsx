import { useState, useEffect } from 'react';
import PlaceholderView from './altro/PlaceholderView';
import DocumentiView from './altro/DocumentiView';
import AssicurazioneView from './altro/AssicurazioneView';
import DocumentiGalleriaView from './altro/DocumentiGalleriaView';
import SpeseBudgetView from './altro/SpeseBudgetView';
import LiveView from './altro/LiveView';
import BagagliView from './altro/BagagliView';
import NoteViaggioView from './altro/NoteViaggioView';
import DeviceRoleModal from '../components/common/DeviceRoleModal';
import { storageService } from '../storage/storageService';
import type { DeviceRole } from '../types';

type SubViewType = 'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | null;

interface AltroViewProps {
  initialSubView?: SubViewType;
}

export default function AltroView({ initialSubView = null }: AltroViewProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>(initialSubView);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);

  useEffect(() => {
    if (initialSubView) {
      setActiveSubView(initialSubView);
    }
  }, [initialSubView]);

  useEffect(() => {
    const handleNavigateSubView = (e: Event) => {
      const customEvent = e as CustomEvent<{ subView: SubViewType }>;
      if (customEvent.detail?.subView) {
        setActiveSubView(customEvent.detail.subView);
      }
    };
    window.addEventListener('navigate_subview', handleNavigateSubView);
    return () => window.removeEventListener('navigate_subview', handleNavigateSubView);
  }, []);

  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: DeviceRole }>;
      if (customEvent.detail?.role) {
        setDeviceRole(customEvent.detail.role);
      }
    };
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  const handleSelectRole = (newRole: DeviceRole) => {
    storageService.setDeviceRole(newRole);
    setDeviceRole(newRole);
  };

  const handleBack = () => setActiveSubView(null);

  if (activeSubView === 'live') return <LiveView onBack={handleBack} />;
  if (activeSubView === 'assicurazione') return <AssicurazioneView onBack={handleBack} />;
  if (activeSubView === 'documenti') return <DocumentiView onBack={handleBack} />;
  if (activeSubView === 'emergenza') return <PlaceholderView title="Numeri di Emergenza" icon="📞" onBack={handleBack} />;
  if (activeSubView === 'info') return <PlaceholderView title="Info Utili" icon="ℹ️" onBack={handleBack} />;
  if (activeSubView === 'spese') return <SpeseBudgetView onBack={handleBack} />;
  if (activeSubView === 'bagagli') return <BagagliView onBack={handleBack} />;
  if (activeSubView === 'note') return <NoteViaggioView onBack={handleBack} />;
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
        {/* Card 0: Live Viaggio (Condividi & Segui il viaggio in tempo reale) */}
        <button 
          onClick={() => setActiveSubView('live')}
          className="col-span-2 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-white rounded-3xl p-4.5 border border-emerald-200/90 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-500/20 shrink-0">
              <span className="relative z-10">📡</span>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border border-white" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">Live Viaggio</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                Condividi la posizione e segui il viaggio in tempo reale
              </p>
            </div>
          </div>
          <svg className="w-5 h-5 text-emerald-600 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Card Ruolo Dispositivo (Guida / Copilota / Viewer) */}
        <button
          type="button"
          onClick={() => setShowRoleModal(true)}
          className="col-span-2 bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl shrink-0 shadow-2xs border border-slate-200/60">
              {deviceRole === 'guida' ? '🟢' : deviceRole === 'copilota' ? '🟡' : '💻'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">Ruolo Dispositivo</h3>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  deviceRole === 'guida'
                    ? 'bg-emerald-100 text-emerald-800'
                    : deviceRole === 'copilota'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {deviceRole === 'guida' ? 'Telefono Guida' : deviceRole === 'copilota' ? 'Co-pilota' : 'Viewer / PC'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                {deviceRole === 'guida'
                  ? 'Invia GPS reale e foto a chi segue da casa'
                  : deviceRole === 'copilota'
                  ? 'Modifica note e spese (GPS ancorato alla Guida)'
                  : 'Nessun accesso GPS (visualizzazione passiva)'}
              </p>
            </div>
          </div>
          <span className="text-slate-400 text-base font-bold ml-2">›</span>
        </button>

        {/* Card 1: Assicurazione */}
        <button 
          onClick={() => setActiveSubView('assicurazione')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">🛡️</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Assicurazione</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Polizza, H24, massimali, emergenze</p>
          </div>
        </button>

        {/* Card 2: Numeri Emergenza */}
        <button 
          onClick={() => setActiveSubView('emergenza')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">📞</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Emergenze</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">111 NZ, 000 AU, 911 PH, Consolati</p>
          </div>
        </button>

        {/* Card 3: Info utili */}
        <button 
          onClick={() => setActiveSubView('info')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">ℹ️</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Info utili</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Fuso orario, valuta, prese elettriche</p>
          </div>
        </button>

        {/* Card 4: Spese & Budget */}
        <button 
          onClick={() => setActiveSubView('spese')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">💳</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Spese & Budget</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Riepilogo costi saldati vs da saldare</p>
          </div>
        </button>

        {/* Card 5: Lista bagagli */}
        <button 
          onClick={() => setActiveSubView('bagagli')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">🧳</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Lista bagagli</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Checklist cosa portare, franchigie</p>
          </div>
        </button>

        {/* Card 6: Note di viaggio */}
        <button 
          onClick={() => setActiveSubView('note')}
          className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">📝</span>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Note di viaggio</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Appunti, idee, promemoria</p>
          </div>
        </button>

        {/* Card Full Width Unificata: Documenti del Viaggio */}
        <button 
          onClick={() => setActiveSubView('documenti')}
          className="col-span-2 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/60 rounded-3xl p-4.5 border border-indigo-200/90 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl shrink-0 shadow-md shadow-indigo-600/20">
              📑
            </div>
            <div className="text-left">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">Documenti del Viaggio</h3>
              <p className="text-xs text-slate-600 mt-0.5">Passaporti, visti NZeTA, patenti, voucher e file salvati</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Modal Selezione Ruolo Dispositivo */}
      <DeviceRoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentRole={deviceRole}
        onSelectRole={handleSelectRole}
      />
    </div>
  );
}
