import { useState, useEffect, Suspense } from 'react';
import DocumentiView from './altro/DocumentiView';
import AssicurazioneView from './altro/AssicurazioneView';
import DocumentiGalleriaView from './altro/DocumentiGalleriaView';
import BagagliView from './altro/BagagliView';
import NoteViaggioView from './altro/NoteViaggioView';
import GestioneViaggioView from './altro/GestioneViaggioView';
import { EmergenzeView, TravelToolkitView } from './altro/EmergenzeToolkitView';

import { lazyWithRetry } from '../utils/lazyWithRetry';
import RouteErrorBoundary from '../components/common/RouteErrorBoundary';

const LiveView = lazyWithRetry(() => import('./altro/LiveView'), 'LiveView');
const SpeseBudgetView = lazyWithRetry(() => import('./altro/SpeseBudgetView'), 'SpeseBudgetView');
import DeviceRoleModal from '../components/common/DeviceRoleModal';
import { storageService } from '../storage/storageService';
import { useAuthIdentity } from '../utils/useAuthIdentity';
import type { DeviceRole } from '../types';

type SubViewType = 'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | 'gestione' | null;

interface AltroViewProps {
  initialSubView?: SubViewType;
}

export default function AltroView({ initialSubView = null }: AltroViewProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>(initialSubView);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const { cloudRole, isCloudAuthorized } = useAuthIdentity();

  useEffect(() => {
    setActiveSubView(initialSubView);
  }, [initialSubView]);

  useEffect(() => {
    const handleResetRoot = () => {
      setActiveSubView(null);
    };
    window.addEventListener('reset_altro_root', handleResetRoot);
    return () => window.removeEventListener('reset_altro_root', handleResetRoot);
  }, []);

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

  if (activeSubView === 'live') {
    return (
      <RouteErrorBoundary fallbackTitle="Impossibile caricare Live Viaggio">
        <Suspense fallback={
          <div className="flex flex-col h-72 items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse m-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento Live Viaggio...</span>
            </div>
          </div>
        }>
          <LiveView onBack={handleBack} />
        </Suspense>
      </RouteErrorBoundary>
    );
  }
  if (activeSubView === 'assicurazione') return <AssicurazioneView onBack={handleBack} />;
  if (activeSubView === 'documenti') return <DocumentiView onBack={handleBack} />;
  if (activeSubView === 'emergenza') return <EmergenzeView onBack={handleBack} />;
  if (activeSubView === 'info') return <TravelToolkitView onBack={handleBack} />;
  if (activeSubView === 'spese') {
    return (
      <RouteErrorBoundary fallbackTitle="Impossibile caricare Spese e Budget">
        <Suspense fallback={
          <div className="flex flex-col h-72 items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 animate-pulse m-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento spese e budget...</span>
            </div>
          </div>
        }>
          <SpeseBudgetView onBack={handleBack} />
        </Suspense>
      </RouteErrorBoundary>
    );
  }
  if (activeSubView === 'bagagli') return <BagagliView onBack={handleBack} />;
  if (activeSubView === 'note') return <NoteViaggioView onBack={handleBack} />;
  if (activeSubView === 'galleria') return <DocumentiGalleriaView onBack={handleBack} />;
  if (activeSubView === 'gestione') return <GestioneViaggioView onBack={handleBack} />;

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-10">
      {/* Intestazione Sezione */}
      <div className="flex flex-col mb-4 px-1">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-6 w-auto object-contain" />
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Altro
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
          Tutto quello che ti serve per il viaggio, in un unico posto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Card 0: Live Viaggio (Condividi & Segui in tempo reale) */}
        <button 
          type="button"
          onClick={() => setActiveSubView('live')}
          className="col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-4.5 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center text-xl shadow-md shadow-[#FF6B5F]/20 shrink-0">
              <span className="relative z-10">📡</span>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">Live Viaggio</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] dark:text-[#ff9a90]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F] animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                Condividi la posizione e segui il viaggio in tempo reale
              </p>
            </div>
          </div>
          <svg className="w-5 h-5 text-[#FF6B5F] shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Card Ruolo Dispositivo */}
        <button
          type="button"
          onClick={() => setShowRoleModal(true)}
          className="col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xl shrink-0 border border-slate-200/60 dark:border-slate-600">
              {deviceRole === 'guida'
                ? (isCloudAuthorized && cloudRole === 'owner' ? '🟢' : '🟡')
                : deviceRole === 'copilota'
                ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? '🟢' : '🟡')
                : '💻'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm leading-tight">Ruolo Dispositivo</h3>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  deviceRole === 'guida'
                    ? (isCloudAuthorized && cloudRole === 'owner' ? 'bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] dark:text-[#ff9a90]' : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200')
                    : deviceRole === 'copilota'
                    ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200' : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200')
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}>
                  {deviceRole === 'guida'
                    ? (isCloudAuthorized && cloudRole === 'owner' ? 'Telefono Guida' : 'Guida (Non verificato)')
                    : deviceRole === 'copilota'
                    ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? 'Co-pilota (Verificato)' : 'Co-pilota (Non verificato)')
                    : 'Viewer / PC'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {deviceRole === 'guida'
                  ? 'Invia GPS reale e foto a chi segue da casa'
                  : deviceRole === 'copilota'
                  ? 'Modifica note e spese (GPS ancorato alla Guida)'
                  : 'Nessun accesso GPS (visualizzazione passiva)'}
              </p>
            </div>
          </div>
          <span className="text-slate-400 dark:text-slate-400 text-base font-bold ml-2">›</span>
        </button>

        {/* Card Gestione Viaggio */}
        <button
          type="button"
          onClick={() => setActiveSubView('gestione')}
          className="col-span-2 bg-[#172033]/5 dark:bg-slate-800 rounded-3xl p-4 border border-[#172033]/15 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-[#172033]/30 dark:hover:border-slate-600 transition-all text-left flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#172033] dark:bg-slate-700 text-white flex items-center justify-center text-xl shrink-0 border border-slate-700">
              👥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[#172033] dark:text-white text-xs sm:text-sm leading-tight">Gestione Viaggio</h3>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                Invita collaboratori e gestisci gli accessi del viaggio
              </p>
            </div>
          </div>
          <span className="text-slate-400 dark:text-slate-400 text-base font-bold ml-2">›</span>
        </button>

        {/* Card 1: Assicurazione */}
        <button 
          type="button"
          onClick={() => setActiveSubView('assicurazione')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">🛡️</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Assicurazione</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Polizza, H24, massimali, emergenze</p>
          </div>
        </button>

        {/* Card 2: Numeri Emergenza */}
        <button 
          type="button"
          onClick={() => setActiveSubView('emergenza')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">📞</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Emergenze</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Contatti, strutture e note del viaggio</p>
          </div>
        </button>

        {/* Card 3: Travel Toolkit */}
        <button 
          type="button"
          onClick={() => setActiveSubView('info')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">ℹ️</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Travel Toolkit</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Checklist e strumenti per la partenza</p>
          </div>
        </button>

        {/* Card 4: Spese & Budget */}
        <button 
          type="button"
          onClick={() => setActiveSubView('spese')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">💳</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Spese & Budget</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Riepilogo costi saldati vs da saldare</p>
          </div>
        </button>

        {/* Card 5: Lista bagagli */}
        <button 
          type="button"
          onClick={() => setActiveSubView('bagagli')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">🧳</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Lista bagagli</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Checklist cosa portare, franchigie</p>
          </div>
        </button>

        {/* Card 6: Note di viaggio */}
        <button 
          type="button"
          onClick={() => setActiveSubView('note')}
          className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left flex flex-col gap-2 min-h-[105px] cursor-pointer active:scale-[0.98]"
        >
          <span className="text-2xl">📝</span>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">Note di viaggio</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">Bacheca post-it, idee, promemoria</p>
          </div>
        </button>

        {/* Card Full Width: Documenti del Viaggio */}
        <button 
          type="button"
          onClick={() => setActiveSubView('documenti')}
          className="col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-4.5 border border-slate-200/90 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center justify-between cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#172033] dark:bg-slate-700 flex items-center justify-center text-white text-2xl shrink-0 shadow-md shadow-[#172033]/20">
              📑
            </div>
            <div className="text-left">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">Documenti del Viaggio</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">Passaporti, visti NZeTA, patenti, voucher e file salvati</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-[#FF6B5F] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
