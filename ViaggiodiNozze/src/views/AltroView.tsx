import { useState, useEffect } from 'react';
import type { TravelDocument } from '../types';
import { storageService } from '../storage/storageService';
import DocumentFilesModal from '../components/modals/DocumentFilesModal';
import DocumentValidityModal from '../components/modals/DocumentValidityModal';

type SubTab = 'tutti' | 'assicurazione' | 'emergenze' | 'documenti';

export default function AltroView() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('tutti');
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [selectedDocForFiles, setSelectedDocForFiles] = useState<TravelDocument | null>(null);
  const [selectedDocForValidity, setSelectedDocForValidity] = useState<TravelDocument | null>(null);

  // Tutto collassato di default: aperto solo se l'utente ci clicca sopra
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadDocs() {
      try {
        const loaded = await storageService.getDocuments();
        setDocuments(loaded);
      } catch (err) {
        console.error('Errore caricamento documenti:', err);
      }
    }
    loadDocs();
  }, []);

  const getDoc = (id: string): TravelDocument | undefined => {
    return documents.find((d) => d.id === id);
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleExpandAll = () => {
    const allExpanded: Record<string, boolean> = {
      sec_assicurazione: true,
      sec_emergenze: true,
      doc_passaporti: true,
      doc_visto_nzeta: true,
      doc_visto_australia: true,
      doc_visto_filippine: true,
      doc_patente: true
    };
    documents.forEach((d) => {
      allExpanded[d.id] = true;
    });
    setExpandedSections(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedSections({});
  };

  const isAnyExpanded = Object.values(expandedSections).some(Boolean);

  const handleOpenFilesModal = (doc: TravelDocument) => {
    setSelectedDocForFiles(doc);
  };

  const handleOpenValidityModal = (doc: TravelDocument) => {
    setSelectedDocForValidity(doc);
  };

  const handleSaveDocument = async (updated: TravelDocument) => {
    try {
      await storageService.saveDocument(updated);
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      if (selectedDocForFiles?.id === updated.id) {
        setSelectedDocForFiles(updated);
      }
      if (selectedDocForValidity?.id === updated.id) {
        setSelectedDocForValidity(updated);
      }
    } catch (err) {
      console.error('Errore salvataggio documento:', err);
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || 'Valido').toLowerCase();
    if (s.includes('valido') || s.includes('attiva') || s.includes('approvato') || s.includes('completato')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
          ✓ {status || 'Valido'}
        </span>
      );
    }
    if (s.includes('attesa') || s.includes('verificare')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
          ⏳ {status}
        </span>
      );
    }
    if (s.includes('richiedere')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
          📝 {status}
        </span>
      );
    }
    if (s.includes('scadut') || s.includes('non valido')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
          ❌ {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
        {status || 'Valido'}
      </span>
    );
  };

  const insuranceDoc = getDoc('doc_assicurazione');
  const passportDoc = getDoc('doc_passaporti');
  const nzetaDoc = getDoc('doc_visto_nzeta');
  const australiaDoc = getDoc('doc_visto_australia');
  const filippineDoc = getDoc('doc_visto_filippine');
  const patenteDoc = getDoc('doc_patente');

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-10">
      {/* Header Sezione con Controlli Espandi/Comprimi */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Info & Documenti
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Assicurazione, numeri utili e visti di viaggio
          </p>
        </div>
        <button
          type="button"
          onClick={isAnyExpanded ? handleCollapseAll : handleExpandAll}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl border border-indigo-200/80 transition-all cursor-pointer"
        >
          <span>{isAnyExpanded ? '▲ Chiudi tutto' : '▼ Espandi tutto'}</span>
        </button>
      </div>

      {/* Segmented Control / Filtro Sotto-sezioni */}
      <div className="flex gap-1.5 p-1 bg-slate-200/60 rounded-2xl">
        {[
          { id: 'tutti', label: 'Tutti' },
          { id: 'assicurazione', label: 'Polizza' },
          { id: 'emergenze', label: 'Emergenze' },
          { id: 'documenti', label: 'Documenti' }
        ].map((tab) => {
          const isSelected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as SubTab)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ================= SOTTO-SCHEDA 1: ASSICURAZIONE DI VIAGGIO ================= */}
      {(activeSubTab === 'tutti' || activeSubTab === 'assicurazione') && (
        <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
          {/* HEADER COLLASSABILE / TOGGLE */}
          <button
            type="button"
            onClick={() => toggleSection('sec_assicurazione')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg font-bold shrink-0 border border-emerald-100 shadow-2xs">
                🛡️
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-900 truncate">
                    Assicurazione di Viaggio
                  </h2>
                  {getStatusBadge(insuranceDoc?.status || 'Valido')}
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {insuranceDoc?.validity || 'Polizza Sanitaria H24 & Assistenza Nozze'}
                  {insuranceDoc?.attachments?.length ? ` • 📎 ${insuranceDoc.attachments.length} file` : ''}
                </p>
              </div>
            </div>
            <div className="shrink-0 ml-2">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                  expandedSections.sec_assicurazione ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                }`}
              >
                ▼
              </span>
            </div>
          </button>

          {/* CONTENUTO ESPLOSO */}
          {expandedSections.sec_assicurazione && (
            <div className="p-4 pt-0 border-t border-slate-100 space-y-4 animate-fade-in mt-1">
              {/* Dettagli Polizza */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2 mt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Compagnia:</span>
                  <span className="font-bold text-slate-800">Europ Assistance / Allianz Global</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Polizza N°:</span>
                  <span className="font-mono font-bold text-slate-900">EA-2026-NZAU-88391</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Massimale Spese Mediche:</span>
                  <span className="font-bold text-emerald-700">Illimitato (NZ & AU)</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-500 font-medium">Validità:</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {insuranceDoc?.validity || '28 Nov 2026 – 12 Gen 2027'}
                  </span>
                </div>
              </div>

              {/* Azione di chiamata rapida H24 */}
              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Centrale Operativa H24 all'Estero
                  </div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">
                    +39 02 5824 5555
                  </div>
                </div>
                <a
                  href="tel:+390258245555"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95 shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Chiama H24</span>
                </a>
              </div>

              {/* Box Gestione Validità & Preset */}
              {insuranceDoc && (
                <div className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                      Stato & Durata Validità
                    </span>
                    <span className="font-semibold text-slate-800 truncate block">
                      {insuranceDoc.validity || 'Non impostata'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenValidityModal(insuranceDoc)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    <span>✏️ Modifica</span>
                  </button>
                </div>
              )}

              {/* Gestione Allegati Polizza */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  {insuranceDoc?.attachments?.length
                    ? `📎 ${insuranceDoc.attachments.length} ${insuranceDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                    : 'Nessun certificato caricato'}
                </span>
                <button
                  type="button"
                  onClick={() => insuranceDoc && handleOpenFilesModal(insuranceDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
                >
                  <span>📎 Certificato & Foto</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed space-y-1">
                <p className="font-semibold text-slate-700">Coperture principali incluse:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Rimpatrio sanitario e trasporto medico protetto</li>
                  <li>Smarrimento, furto o danneggiamento bagagli</li>
                  <li>Responsabilità civile verso terzi</li>
                  <li>Prolungamento forzato o interruzione viaggio</li>
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= SOTTO-SCHEDA 2: NUMERI DI EMERGENZA RAPIDA ================= */}
      {(activeSubTab === 'tutti' || activeSubTab === 'emergenze') && (
        <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
          {/* HEADER COLLASSABILE / TOGGLE */}
          <button
            type="button"
            onClick={() => toggleSection('sec_emergenze')}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg font-bold shrink-0 border border-rose-100 shadow-2xs">
                🚨
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-slate-900 truncate">
                    Numeri di Emergenza Rapida
                  </h2>
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    3 Paesi
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  🇳🇿 NZ 111 • 🇦🇺 AU 000 • 🇵🇭 PH 911 • Ambasciate italiane
                </p>
              </div>
            </div>
            <div className="shrink-0 ml-2">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                  expandedSections.sec_emergenze ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                }`}
              >
                ▼
              </span>
            </div>
          </button>

          {/* CONTENUTO ESPLOSO */}
          {expandedSections.sec_emergenze && (
            <div className="p-4 pt-0 border-t border-slate-100 space-y-4 animate-fade-in mt-1">
              <div className="grid grid-cols-1 gap-2.5 mt-3">
                {/* Nuova Zelanda */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🇳🇿</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Nuova Zelanda</div>
                      <div className="text-[11px] text-slate-500">Polizia, Ambulanza, Pompieri</div>
                    </div>
                  </div>
                  <a
                    href="tel:111"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                  >
                    <span>📞 111</span>
                  </a>
                </div>

                {/* Australia */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🇦🇺</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Australia</div>
                      <div className="text-[11px] text-slate-500">Triple Zero (Emergenza Nazionale)</div>
                    </div>
                  </div>
                  <a
                    href="tel:000"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                  >
                    <span>📞 000</span>
                  </a>
                </div>

                {/* Filippine */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🇵🇭</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Filippine</div>
                      <div className="text-[11px] text-slate-500">Pronto Intervento & Polizia</div>
                    </div>
                  </div>
                  <a
                    href="tel:911"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                  >
                    <span>📞 911</span>
                  </a>
                </div>
              </div>

              {/* Rappresentanze Diplomatiche Italiane */}
              <div className="pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Ambasciate e Consolati Italiani
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className="font-semibold text-slate-800">Wellington (NZ):</span>
                      <p className="text-[11px] text-slate-500">+64 4 473 5339</p>
                    </div>
                    <a
                      href="tel:+6444735339"
                      className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                    >
                      Chiama
                    </a>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className="font-semibold text-slate-800">Sydney (AU):</span>
                      <p className="text-[11px] text-slate-500">+61 2 9262 3222</p>
                    </div>
                    <a
                      href="tel:+61292623222"
                      className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                    >
                      Chiama
                    </a>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className="font-semibold text-slate-800">Manila (PH):</span>
                      <p className="text-[11px] text-slate-500">+63 2 8892 4531</p>
                    </div>
                    <a
                      href="tel:+63288924531"
                      className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                    >
                      Chiama
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= SOTTO-SCHEDA 3: DOCUMENTI & VISTI DI VIAGGIO ================= */}
      {(activeSubTab === 'tutti' || activeSubTab === 'documenti') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🛂</span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Documenti & Visti d'Ingresso
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Tocca ciascuna card per esplodere
            </span>
          </div>

          {/* CARD 1: PASSAPORTI */}
          {passportDoc && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => toggleSection('doc_passaporti')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold shrink-0 border border-indigo-100 shadow-2xs">
                    🛂
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        Passaporti Elettronici (Sposo & Sposa)
                      </h3>
                      {getStatusBadge(passportDoc.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {passportDoc.validity || 'Passaporti biometrici validi'}
                      {passportDoc.attachments?.length ? ` • 📎 ${passportDoc.attachments.length} file` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                      expandedSections.doc_passaporti ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {expandedSections.doc_passaporti && (
                <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                  <p className="text-xs text-slate-600 leading-relaxed mt-3">
                    Scansioni e foto delle pagine biografiche dei passaporti biometrici. Obbligatoria validità residua minima di 6 mesi oltre la data di rientro in Italia.
                  </p>

                  {/* Riquadro Validità con tasto Preset / Modifica */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Validità & Durata:
                        </span>
                        {getStatusBadge(passportDoc.status)}
                      </div>
                      <span className="font-bold text-slate-900 block truncate mt-0.5">
                        {passportDoc.validity || 'Non specificata'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenValidityModal(passportDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <span>✏️ Modifica</span>
                    </button>
                  </div>

                  {/* File & Scansioni */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      {passportDoc.attachments?.length
                        ? `📎 ${passportDoc.attachments.length} ${passportDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                        : 'Nessuna foto passaporto'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenFilesModal(passportDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>{passportDoc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica Foto / PDF'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CARD 2: NZETA NUOVA ZELANDA */}
          {nzetaDoc && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => toggleSection('doc_visto_nzeta')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg font-bold shrink-0 border border-sky-100 shadow-2xs">
                    🇳🇿
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        🇳🇿 Visto NZeTA + Tassa IVL
                      </h3>
                      {getStatusBadge(nzetaDoc.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {nzetaDoc.validity || 'Autorizzazione elettronica Nuova Zelanda'}
                      {nzetaDoc.attachments?.length ? ` • 📎 ${nzetaDoc.attachments.length} file` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                      expandedSections.doc_visto_nzeta ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {expandedSections.doc_visto_nzeta && (
                <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                  <p className="text-xs text-slate-600 leading-relaxed mt-3">
                    Autorizzazione elettronica di viaggio e conservazione turistica per ingresso in Nuova Zelanda. Collegata digitalmente al passaporto con ingressi multipli consentiti.
                  </p>

                  {/* Riquadro Validità con tasto Preset / Modifica */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Validità & Durata:
                        </span>
                        {getStatusBadge(nzetaDoc.status)}
                      </div>
                      <span className="font-bold text-slate-900 block truncate mt-0.5">
                        {nzetaDoc.validity || 'Non specificata'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenValidityModal(nzetaDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <span>✏️ Modifica</span>
                    </button>
                  </div>

                  {/* File & Scansioni */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      {nzetaDoc.attachments?.length
                        ? `📎 ${nzetaDoc.attachments.length} ${nzetaDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                        : 'Nessun visto salvato'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenFilesModal(nzetaDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>{nzetaDoc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica Documenti/Foto'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CARD 3: EVISITOR AUSTRALIA */}
          {australiaDoc && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => toggleSection('doc_visto_australia')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold shrink-0 border border-amber-100 shadow-2xs">
                    🇦🇺
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        🇦🇺 Visto eVisitor (Subclass 651)
                      </h3>
                      {getStatusBadge(australiaDoc.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {australiaDoc.validity || 'Visto turistico Australia'}
                      {australiaDoc.attachments?.length ? ` • 📎 ${australiaDoc.attachments.length} file` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                      expandedSections.doc_visto_australia ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {expandedSections.doc_visto_australia && (
                <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                  <p className="text-xs text-slate-600 leading-relaxed mt-3">
                    Visto turistico australiano gratuito per cittadini UE, valido 12 mesi per soggiorni fino a 3 mesi continuativi. Rilasciato dal Department of Home Affairs australiano.
                  </p>

                  {/* Riquadro Validità con tasto Preset / Modifica */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Validità & Durata:
                        </span>
                        {getStatusBadge(australiaDoc.status)}
                      </div>
                      <span className="font-bold text-slate-900 block truncate mt-0.5">
                        {australiaDoc.validity || 'Non specificata'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenValidityModal(australiaDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <span>✏️ Modifica</span>
                    </button>
                  </div>

                  {/* File & Scansioni */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      {australiaDoc.attachments?.length
                        ? `📎 ${australiaDoc.attachments.length} ${australiaDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                        : 'Nessun visto salvato'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenFilesModal(australiaDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>{australiaDoc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica Documenti/Foto'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CARD 4: ETRAVEL FILIPPINE */}
          {filippineDoc && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => toggleSection('doc_visto_filippine')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center text-lg font-bold shrink-0 border border-cyan-100 shadow-2xs">
                    🇵🇭
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        🇵🇭 Registrazione eTravel Filippine
                      </h3>
                      {getStatusBadge(filippineDoc.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {filippineDoc.validity || 'QR Code digitale arrivo'}
                      {filippineDoc.attachments?.length ? ` • 📎 ${filippineDoc.attachments.length} file` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                      expandedSections.doc_visto_filippine ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {expandedSections.doc_visto_filippine && (
                <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                  <p className="text-xs text-slate-600 leading-relaxed mt-3">
                    Registrazione sanitaria e doganale digitale obbligatoria da compilare online sul portale governativo filippino entro le 72 ore precedenti l'imbarco. Genera un QR code personale da mostrare all'immigrazione.
                  </p>

                  {/* Riquadro Validità con tasto Preset / Modifica */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Validità & Durata:
                        </span>
                        {getStatusBadge(filippineDoc.status)}
                      </div>
                      <span className="font-bold text-slate-900 block truncate mt-0.5">
                        {filippineDoc.validity || 'Non specificata'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenValidityModal(filippineDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <span>✏️ Modifica</span>
                    </button>
                  </div>

                  {/* File & Scansioni */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      {filippineDoc.attachments?.length
                        ? `📎 ${filippineDoc.attachments.length} ${filippineDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                        : 'Nessun QR code salvato'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenFilesModal(filippineDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>{filippineDoc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica QR Code'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CARD 5: PATENTE INTERNAZIONALE */}
          {patenteDoc && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => toggleSection('doc_patente')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold shrink-0 border border-amber-100 shadow-2xs">
                    🪪
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        🪪 Patente Internazionale (IDP)
                      </h3>
                      {getStatusBadge(patenteDoc.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {patenteDoc.validity || 'Convenzione Ginevra 1949'}
                      {patenteDoc.attachments?.length ? ` • 📎 ${patenteDoc.attachments.length} file` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                      expandedSections.doc_patente ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {expandedSections.doc_patente && (
                <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                  <p className="text-xs text-slate-600 leading-relaxed mt-3">
                    Modello Ginevra 1949 / Vienna 1968 rilasciato dalla Motorizzazione Civile, indispensabile per il noleggio e la guida dell'auto in Nuova Zelanda e del campervan in Australia.
                  </p>

                  {/* Riquadro Validità con tasto Preset / Modifica */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Validità & Durata:
                        </span>
                        {getStatusBadge(patenteDoc.status)}
                      </div>
                      <span className="font-bold text-slate-900 block truncate mt-0.5">
                        {patenteDoc.validity || 'Non specificata'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenValidityModal(patenteDoc)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <span>✏️ Modifica</span>
                    </button>
                  </div>

                  {/* File & Scansioni */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      {patenteDoc.attachments?.length
                        ? `📎 ${patenteDoc.attachments.length} ${patenteDoc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                        : 'Nessuna scansione salvata'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenFilesModal(patenteDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>{patenteDoc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica Scansione'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EVENTUALI ALTRI DOCUMENTI PERSONALIZZATI */}
          {documents
            .filter(
              (d) =>
                ![
                  'doc_assicurazione',
                  'doc_passaporti',
                  'doc_visto_nzeta',
                  'doc_visto_australia',
                  'doc_visto_filippine',
                  'doc_patente'
                ].includes(d.id)
            )
            .map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(doc.id)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold shrink-0 border border-indigo-100 shadow-2xs">
                      📄
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900 truncate">{doc.title}</h3>
                        {getStatusBadge(doc.status)}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {doc.validity || doc.description || 'Documento di viaggio'}
                        {doc.attachments?.length ? ` • 📎 ${doc.attachments.length} file` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-500 text-xs transition-transform duration-200 ${
                        expandedSections[doc.id] ? 'rotate-180 bg-indigo-50 text-indigo-700' : ''
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </button>

                {expandedSections[doc.id] && (
                  <div className="p-4 pt-0 border-t border-slate-100 space-y-3 animate-fade-in mt-1">
                    {doc.description && (
                      <p className="text-xs text-slate-600 leading-relaxed mt-3">{doc.description}</p>
                    )}

                    {/* Riquadro Validità con tasto Preset / Modifica */}
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Validità & Durata:
                          </span>
                          {getStatusBadge(doc.status)}
                        </div>
                        <span className="font-bold text-slate-900 block truncate mt-0.5">
                          {doc.validity || 'Non specificata'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenValidityModal(doc)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <span>✏️ Modifica</span>
                      </button>
                    </div>

                    {/* File & Scansioni */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500 font-medium">
                        {doc.attachments?.length
                          ? `📎 ${doc.attachments.length} ${doc.attachments.length === 1 ? 'file caricato' : 'file caricati'}`
                          : 'Nessun file salvato'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenFilesModal(doc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        <span>{doc.attachments?.length ? 'Visualizza / Aggiungi File' : '+ Carica File'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </section>
      )}

      {/* MODAL GESTIONE ALLEGATI DOCUMENTO (MULTI-UPLOAD & CAROSELLO) */}
      <DocumentFilesModal
        isOpen={selectedDocForFiles !== null}
        onClose={() => setSelectedDocForFiles(null)}
        document={selectedDocForFiles}
        onUpdateDocument={handleSaveDocument}
      />

      {/* MODAL MODIFICA VALIDITÀ E DURATA (PRESET & SCRITTURA LIBERA) */}
      <DocumentValidityModal
        isOpen={selectedDocForValidity !== null}
        onClose={() => setSelectedDocForValidity(null)}
        document={selectedDocForValidity}
        onSave={handleSaveDocument}
      />
    </div>
  );
}
