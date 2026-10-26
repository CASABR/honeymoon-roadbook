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
import TripSelectorModal from '../components/modals/TripSelectorModal';
import DeviceRoleModal from '../components/common/DeviceRoleModal';
import TrailIconsShowcaseModal from '../components/icons/TrailIconsShowcaseModal';
import {
  TrailLive,
  TrailPrenotazioni,
  TrailSpese,
  TrailBagagli,
  TrailNote,
  TrailSicurezza,
  TrailEmergenze,
  TrailToolkit,
  TrailCopiloti,
  TrailMappa,
  TrailItinerario,
  TrailPdf
} from '../components/icons/TrailIcons';
import PdfExportModal from '../components/modals/PdfExportModal';

const LiveView = lazyWithRetry(() => import('./altro/LiveView'), 'LiveView');
const SpeseBudgetView = lazyWithRetry(() => import('./altro/SpeseBudgetView'), 'SpeseBudgetView');
import { storageService } from '../storage/storageService';
import { getTripConfig } from '../utils/tripConfig';
import type { DeviceRole } from '../types';

type SubViewType = 'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'galleria' | 'gestione' | null;

interface AltroViewProps {
  initialSubView?: SubViewType;
}

export default function AltroView({ initialSubView = null }: AltroViewProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>(initialSubView);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [showIconsShowcase, setShowIconsShowcase] = useState(false);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const currentTripConfig = getTripConfig();

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
    <div className="space-y-4 pt-1 animate-fade-in pb-12 max-w-lg mx-auto">
      {/* Intestazione Sezione & Chip Viaggio Corrente */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-6 w-auto object-contain" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              Altro
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Risorse, sicurezza e gestione del roadbook
            </p>
          </div>
        </div>

        {/* Chip Viaggio Attivo con Cambio Rapido */}
        <button
          type="button"
          onClick={() => setShowTripSelector(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-200/80 dark:border-slate-700 cursor-pointer active:scale-95 shadow-2xs"
          title="Visualizza e cambia viaggio"
        >
          <TrailMappa size={14} active />
          <span className="max-w-[110px] truncate">{currentTripConfig?.title || 'Viaggio'}</span>
          <span className="text-[10px] text-slate-400">▾</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. LIVE E CONDIVISIONE VIAGGIO (In Evidenza) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <button 
        type="button"
        onClick={() => setActiveSubView('live')}
        className="relative overflow-hidden w-full bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_64%,#fff0ed_100%)] dark:bg-[linear-gradient(115deg,#172033_0%,#172033_64%,rgba(255,107,95,.14)_100%)] rounded-3xl p-4 border border-[#FF6B5F]/40 dark:border-[#FF6B5F]/30 shadow-xs hover:shadow-md transition-all text-left flex items-center justify-between cursor-pointer hounigo-touch-feedback group"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative w-12 h-12 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-md shadow-[#FF6B5F]/20 shrink-0">
            <TrailLive size={24} active />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-[#172033] dark:text-white text-base leading-tight font-brand-title">
                Live & Posizione
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 text-[#FF6B5F] dark:text-[#ff9a90] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F] animate-pulse" />
                LIVE
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate font-brand-body">
              Posizione LIVE, programma previsto e cartoline
            </p>
          </div>
        </div>
        <svg className="w-5 h-5 text-[#FF6B5F] shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. DOCUMENTI E RISORSE PRATICHE */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 font-brand-title">
          Documenti & Risorse
        </h3>
        <div className="hounigo-route-group bg-white dark:bg-[#172033] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden font-sans">
          
          {/* Documenti del Viaggio */}
          <button
            type="button"
            onClick={() => setActiveSubView('documenti')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="hounigo-route-icon w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailPrenotazioni size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Documenti & Voucher
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Voucher, documenti e file disponibili offline
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Esporta Itinerario PDF */}
          <button
            type="button"
            onClick={() => setShowPdfExportModal(true)}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left bg-[#FFF0ED]/55 dark:bg-[#FF6B5F]/[0.08] hover:bg-[#FFF0ED] dark:hover:bg-[#FF6B5F]/15 transition-colors cursor-pointer active:bg-[#ffe4df]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="hounigo-route-icon w-9 h-9 rounded-xl bg-[#FF6B5F] text-white flex items-center justify-center shrink-0 border border-[#FF6B5F]/30 shadow-sm shadow-[#FF6B5F]/20">
                <TrailPdf size={20} active />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Esporta Itinerario PDF
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Roadbook A4 personalizzato, anche offline
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Spese & Budget */}
          <button
            type="button"
            onClick={() => setActiveSubView('spese')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailSpese size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Spese & Budget
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Costi, pagamenti saldati e valute
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Lista Bagagli */}
          <button
            type="button"
            onClick={() => setActiveSubView('bagagli')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailBagagli size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Lista Bagagli
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Checklist valigie per partecipante
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Note di Viaggio */}
          <button
            type="button"
            onClick={() => setActiveSubView('note')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailNote size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Note di Viaggio
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Idee, appunti e promemoria
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. SICUREZZA E ASSISTENZA */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 font-brand-title">
          Sicurezza & Assistenza
        </h3>
        <div className="hounigo-route-group bg-white dark:bg-[#172033] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden font-sans">
          
          {/* Assicurazione Sanitaria */}
          <button
            type="button"
            onClick={() => setActiveSubView('assicurazione')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailSicurezza size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                    Assicurazione Sanitaria
                  </h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#FFF0ED] text-[#FF6B5F] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90]">
                    H24
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Polizza, centrale operativa e massimali
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Emergenze & Soccorso */}
          <button
            type="button"
            onClick={() => setActiveSubView('emergenza')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailEmergenze size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Emergenze & Soccorso
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Numeri locali, consolati e soccorso
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Travel Toolkit */}
          <button
            type="button"
            onClick={() => setActiveSubView('info')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F8F7F3] dark:bg-slate-800 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                <TrailToolkit size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#172033] dark:text-white leading-tight">
                  Travel Toolkit
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Fusi orari, prese e checklist utili
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. GESTIONE VIAGGIO & PARTECIPANTI */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
          Gestione Viaggio & Dispositivo
        </h3>
        <div className="hounigo-route-group bg-white dark:bg-[#172033] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          
          {/* Partecipanti e Invito Co-pilota */}
          <button
            type="button"
            onClick={() => setActiveSubView('gestione')}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <TrailCopiloti size={20} active />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Partecipanti & Inviti
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Inviti e accessi condivisi
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Ruolo Dispositivo */}
          <button
            type="button"
            onClick={() => setShowRoleModal(true)}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                <TrailLive size={18} active={deviceRole === 'guida'} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Ruolo Dispositivo
                  </h4>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                    deviceRole === 'guida'
                      ? 'bg-[#FFF0ED] text-[#FF6B5F] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90]'
                      : deviceRole === 'copilota'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {deviceRole === 'guida' ? 'Telefono Guida' : deviceRole === 'copilota' ? 'Co-pilota' : 'Viewer / PC'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {deviceRole === 'guida'
                    ? 'Trasmissione GPS e cartoline attiva'
                    : deviceRole === 'copilota'
                    ? 'Modifica note e programma (GPS ancorato)'
                    : 'Visualizzazione da computer o ospite'}
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* I Tuoi Viaggi (Selettore Viaggi) */}
          <button
            type="button"
            onClick={() => setShowTripSelector(true)}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/50">
                <TrailMappa size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  I Tuoi Viaggi
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Cambia viaggio o consulta gli accessi
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {/* Anteprima Iconografia Hounigo Trail Icons */}
          <button
            type="button"
            onClick={() => setShowIconsShowcase(true)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors cursor-pointer active:bg-slate-100 dark:active:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 text-[#FF6B5F] flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/40">
                <TrailItinerario size={20} active />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  Iconografia Hounigo Trail
                </h4>
                <p className="text-[10px] text-slate-400 truncate">
                  Tavola comparativa: 20 icone SVG originali del brand
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[#FF6B5F] bg-[#FFF0ED] dark:bg-[#FF6B5F]/20 px-2 py-0.5 rounded-full">
              Nuovo
            </span>
          </button>
        </div>
      </div>

      {/* Modal Selezione Ruolo Dispositivo */}
      <DeviceRoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentRole={deviceRole}
        onSelectRole={handleSelectRole}
      />

      {/* Modal Selezione Viaggi (P1-A) */}
      <TripSelectorModal
        isOpen={showTripSelector}
        onClose={() => setShowTripSelector(false)}
      />

      {/* Modal Tavola Comparativa Iconografia Hounigo Trail */}
      <TrailIconsShowcaseModal
        isOpen={showIconsShowcase}
        onClose={() => setShowIconsShowcase(false)}
      />

      {/* Modal Esportazione PDF Roadbook */}
      <PdfExportModal
        isOpen={showPdfExportModal}
        onClose={() => setShowPdfExportModal(false)}
      />
    </div>
  );
}
