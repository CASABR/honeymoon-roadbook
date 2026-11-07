import { useState, useEffect, Suspense } from 'react';
import DocumentiView from './altro/DocumentiView';
import AssicurazioneView from './altro/AssicurazioneView';
import DocumentiGalleriaView from './altro/DocumentiGalleriaView';
import BagagliView from './altro/BagagliView';
import NoteViaggioView from './altro/NoteViaggioView';
import ScadenzeView from './altro/ScadenzeView';
import GestioneViaggioView from './altro/GestioneViaggioView';
import { EmergenzeView, TravelToolkitView } from './altro/EmergenzeToolkitView';

import { lazyWithRetry } from '../utils/lazyWithRetry';
import RouteErrorBoundary from '../components/common/RouteErrorBoundary';
import TripSelectorModal from '../components/modals/TripSelectorModal';
import DeviceRoleModal from '../components/common/DeviceRoleModal';
import AccountSyncModal from '../components/modals/AccountSyncModal';
import PreActivationDiagnosticModal from '../components/modals/PreActivationDiagnosticModal';
import { useAuthIdentity } from '../utils/useAuthIdentity';
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
  TrailPdf
} from '../components/icons/TrailIcons';
import PdfExportModal from '../components/modals/PdfExportModal';
import { useGlobalAdminAccess } from '../hooks/useGlobalAdminAccess';
import { CalendarClock } from 'lucide-react';

const LiveView = lazyWithRetry(() => import('./altro/LiveView'), 'LiveView');
const SpeseBudgetView = lazyWithRetry(() => import('./altro/SpeseBudgetView'), 'SpeseBudgetView');
import { storageService } from '../storage/storageService';
import { getTripConfig } from '../utils/tripConfig';
import type { DeviceRole } from '../types';

type SubViewType = 'live' | 'assicurazione' | 'documenti' | 'emergenza' | 'info' | 'spese' | 'bagagli' | 'note' | 'scadenze' | 'galleria' | 'gestione' | null;

interface AltroViewProps {
  initialSubView?: SubViewType;
}

export default function AltroView({ initialSubView = null }: AltroViewProps) {
  const [activeSubView, setActiveSubView] = useState<SubViewType>(initialSubView);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const currentTripConfig = getTripConfig();
  const globalAdminAccess = useGlobalAdminAccess();
  const { currentUser, isAnonymous, isCloudAuthorized, cloudRole } = useAuthIdentity();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);

  useEffect(() => {
    const handleOpenDiagnostic = () => setShowDiagnosticModal(true);
    window.addEventListener('open_preactivation_diagnostic', handleOpenDiagnostic);
    return () => window.removeEventListener('open_preactivation_diagnostic', handleOpenDiagnostic);
  }, []);

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
  if (activeSubView === 'scadenze') return <ScadenzeView onBack={handleBack} />;
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
          <span className="max-w-[92px] truncate">I tuoi viaggi</span>
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

        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setActiveSubView('scadenze')}
        className="hounigo-route-item hounigo-touch-feedback w-full rounded-2xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3.5 flex items-center justify-between text-left shadow-xs hover:shadow-sm transition-all"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm"><CalendarClock size={20} /></div>
          <div className="min-w-0"><h4 className="text-sm font-extrabold text-[#172033] dark:text-white">Scadenze</h4><p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">Check-in, documenti, pagamenti e promemoria</p></div>
        </div>
        <span className="text-slate-400 text-sm ml-2">›</span>
      </button>

      {/* 3. SICUREZZA E ASSISTENZA */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 font-brand-title">
          Strumenti del Viaggio
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Spese & Budget */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('spese')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-rose-100/90 dark:border-rose-950/40 bg-gradient-to-b from-[#FFF5F3] to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-[#FF6B5F]/10 dark:bg-[#FF6B5F]/20 text-[#FF6B5F] flex items-center justify-center shrink-0 border border-[#FF6B5F]/20">
                <TrailSpese size={20} active />
              </div>
              <span className="text-[9px] font-bold text-[#FF6B5F] bg-[#FF6B5F]/10 px-1.5 py-0.5 rounded-md">Budget</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Spese & Budget</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Costi, pagamenti e valute</p>
            </div>
          </button>

          {/* Note di Viaggio */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('note')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-700/60 bg-gradient-to-b from-[#F8F7F3] to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-[#172033]/8 dark:bg-slate-700/60 text-[#172033] dark:text-slate-200 flex items-center justify-center shrink-0 border border-slate-200/70 dark:border-slate-700">
                <TrailNote size={20} active />
              </div>
              <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">Appunti</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Note di Viaggio</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Idee, note e promemoria</p>
            </div>
          </button>

          {/* Lista Bagagli */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('bagagli')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-amber-100/90 dark:border-amber-950/40 bg-gradient-to-b from-amber-50/50 to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-300/40 dark:border-amber-700/40">
                <TrailBagagli size={20} active />
              </div>
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-md">Checklist</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Lista Bagagli</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Valigie per partecipante</p>
            </div>
          </button>

          {/* Assicurazione Sanitaria */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('assicurazione')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-emerald-100/90 dark:border-emerald-950/40 bg-gradient-to-b from-emerald-50/50 to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-300/40 dark:border-emerald-700/40">
                <TrailSicurezza size={20} active />
              </div>
              <span className="text-[9px] font-black tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md">H24</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Assicurazione</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Polizza e assistenza H24</p>
            </div>
          </button>

          {/* Emergenze & Soccorso */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('emergenza')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-rose-200/90 dark:border-rose-950/50 bg-gradient-to-b from-rose-50/60 to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-300/40 dark:border-rose-800/40">
                <TrailEmergenze size={20} active />
              </div>
              <span className="text-[9px] font-black tracking-wide text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-950/60 px-1.5 py-0.5 rounded-md">SOS</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Emergenze</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Numeri locali e soccorso</p>
            </div>
          </button>

          {/* Travel Toolkit */}
          <button
            type="button"
            data-square-tool-card
            onClick={() => setActiveSubView('info')}
            className="hounigo-touch-feedback min-w-0 min-h-[108px] sm:min-h-[114px] overflow-hidden rounded-2xl border border-sky-100/90 dark:border-sky-950/40 bg-gradient-to-b from-sky-50/50 to-white dark:from-[#172033] dark:to-[#172033] p-3 sm:p-3.5 text-left shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 dark:bg-sky-400/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 border border-sky-300/40 dark:border-sky-700/40">
                <TrailToolkit size={20} active />
              </div>
              <span className="text-[9px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-950/60 px-1.5 py-0.5 rounded-md">Guide</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-[13px] font-extrabold text-[#172033] dark:text-white leading-tight break-words">Travel Toolkit</h4>
              <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2">Fusi, prese e checklist</p>
            </div>
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

          {/* Account & Autenticazione Cloud */}
          <button
            type="button"
            onClick={() => setShowAccountModal(true)}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                <span className="text-base">👤</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Account &amp; Accesso Cloud
                  </h4>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                    isCloudAuthorized
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}>
                    {isCloudAuthorized ? (cloudRole === 'owner' ? 'Organizzatore Verificato' : 'Copilota Verificato') : 'Non Autenticato'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {currentUser && !isAnonymous
                    ? (currentUser.email || currentUser.displayName || 'Account collegato')
                    : 'Accedi con Google per sbloccare PIN, PNR e voucher'}
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

          {/* Diagnostica Pre-Attivazione (Sola Lettura) */}
          <button
            type="button"
            data-preactivation-diagnostic-card
            onClick={() => setShowDiagnosticModal(true)}
            className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8F7F3] dark:hover:bg-slate-800/80 transition-colors cursor-pointer active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-base">🛡️</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Diagnostica Pre-Attivazione
                  </h4>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                    Sola Lettura
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Verifica stato coda, conflitti e blocco scritture
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-2">›</span>
          </button>

          {currentTripConfig?.id === '0000' && globalAdminAccess === 'authorized' && (
            <button
              type="button"
              data-admin-console-card
              onClick={() => window.dispatchEvent(new CustomEvent('open_admin_console'))}
              className="hounigo-route-item hounigo-touch-feedback w-full px-4 py-3.5 flex items-center justify-between text-left bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/15">
                  <TrailSicurezza size={20} active />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-extrabold leading-tight">Console Admin</h4>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">Accesso soggetto ad autorizzazione globale</p>
                </div>
              </div>
              <span className="text-slate-400 text-sm ml-2">›</span>
            </button>
          )}
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

      {/* Modal Account & Sincronizzazione */}
      <AccountSyncModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Modal Esportazione PDF Roadbook */}
      <PdfExportModal
        isOpen={showPdfExportModal}
        onClose={() => setShowPdfExportModal(false)}
      />

      {/* Modal Diagnostica Pre-Attivazione (Sola Lettura) */}
      <PreActivationDiagnosticModal
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
      />
    </div>
  );
}
