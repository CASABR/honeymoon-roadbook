import { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import Modal from '../common/Modal';

interface DocumentValidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: TravelDocument | null;
  onSave: (updated: TravelDocument) => void;
}

const PRESETS_BY_DOC_ID: Record<string, string[]> = {
  doc_passaporti: [
    'Validi (> 6 mesi oltre il rientro, fino al 2036)',
    'Validi 10 anni (fino al 2036)',
    'Scadenza oltre la data del rientro (Gennaio 2027)',
    'In corso di rilascio in Questura',
    'Da rinnovare'
  ],
  doc_visto_nzeta: [
    'Valido 2 anni (ingressi multipli)',
    'Approvato e collegato al passaporto',
    'Richiesta inviata - In attesa approvazione',
    'Da richiedere prima della partenza (NZD 52)',
    'Valido fino al 2028'
  ],
  doc_visto_australia: [
    'Valido 12 mesi (max 3 mesi per soggiorno)',
    'Approvato su ImmiAccount (Subclass 651)',
    'Richiesta inviata - In elaborazione',
    'Da richiedere (gratuito per cittadini UE)',
    'Valido fino a Dicembre 2027'
  ],
  doc_visto_filippine: [
    'Da compilare 72 ore prima del volo (Dicembre 2026)',
    'QR Code eTravel verde generato con successo',
    'In attesa della finestra temporale (72h prima)',
    'Completato per entrambi i passeggeri'
  ],
  doc_patente: [
    'Valida 1 anno (Convenzione Ginevra 1949)',
    'Valida 3 anni (Convenzione Vienna 1968)',
    'Richiesta depositata in Motorizzazione',
    'Pronta per il ritiro allo sportello',
    'In corso di rinnovo'
  ],
  doc_assicurazione: [
    'Valida per l\'intero viaggio (28 Nov 2026 – 12 Gen 2027)',
    'Polizza attiva - Massimale illimitato H24',
    'Valida 45 giorni dalla partenza',
    'Da attivare / saldare'
  ]
};

const DEFAULT_GENERAL_PRESETS = [
  'Valido per l\'intera durata del viaggio',
  'Valido 1 anno',
  'Valido 6 mesi',
  'Valido 10 anni',
  'Richiesta inviata - In attesa',
  'Da rinnovare / richiedere'
];

const STATUS_OPTIONS = [
  { value: 'Valido', label: '✓ Valido / Approvato', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'In attesa', label: '⏳ In attesa / Da verificare', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'Da richiedere', label: '📝 Da richiedere', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'In elaborazione', label: '🔄 In elaborazione', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'In scadenza', label: '⚠️ In scadenza', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'Scaduto', label: '❌ Non valido / Scaduto', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' }
];

export default function DocumentValidityModal({
  isOpen,
  onClose,
  document,
  onSave
}: DocumentValidityModalProps) {
  const [status, setStatus] = useState('Valido');
  const [validity, setValidity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (document) {
      setStatus(document.status || 'Valido');
      setValidity(document.validity || '');
      setExpiresAt(document.expiresAt || '');
    }
  }, [document]);

  if (!document) return null;

  const presets = (document.id && PRESETS_BY_DOC_ID[document.id]) || DEFAULT_GENERAL_PRESETS;

  const handleSelectPreset = (presetText: string) => {
    setValidity(presetText);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: TravelDocument = {
      ...document,
      status: status.trim() || 'Valido',
      validity: validity.trim() || undefined,
      expiresAt: expiresAt.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    onSave(updated);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Validità & Scadenza Documento"
      accentVariant="indigo"
    >
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Intestazione Documento */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-white border border-indigo-200 flex items-center justify-center text-lg shrink-0 shadow-xs">
            {document.category === 'passaporto' ? '🛂' : document.category === 'visto' ? '✈️' : document.category === 'patente' ? '🪪' : '🛡️'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-900 truncate">{document.title}</h3>
            <p className="text-[11px] text-slate-500 line-clamp-1">{document.description || 'Configura stato e durata'}</p>
          </div>
        </div>

        {/* 1. SELEZIONE STATO DI VALIDITÀ */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Stato del Documento
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = status.toLowerCase() === opt.value.toLowerCase();
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`p-2 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? `${opt.badgeClass} ring-2 ring-indigo-500 shadow-xs`
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. PRESET RAPIDI DI DURATA E VALIDITÀ */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Scegli da un Preset
            </label>
            <span className="text-[10px] text-slate-400">Tocca per inserire</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset, idx) => {
              const isSelected = validity === preset;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. SCRITTURA LIBERA VALIDITÀ / DURATA ("Poter scrivere io") */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Durata / Validità Personalizzata (Scrittura Libera)
          </label>
          <textarea
            rows={2}
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            placeholder="es. Valido fino al 15/10/2034, rinnovato il mese scorso..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors placeholder:text-slate-400 leading-relaxed"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Puoi selezionare un preset sopra oppure digitare qualsiasi informazione sulla validità o sul rinnovo.
          </p>
        </div>

        {/* 4. DATA DI SCADENZA ESATTA (OPZIONALE) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Scadenza Esatta (Opzionale)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Pulsanti Azione */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            Salva Validità
          </button>
        </div>
      </form>
    </Modal>
  );
}
