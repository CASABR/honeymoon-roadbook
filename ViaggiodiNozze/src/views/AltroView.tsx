import { useState, useEffect } from 'react';
import type { TravelDocument } from '../types';
import { storageService } from '../storage/storageService';
import DocumentFilesModal from '../components/modals/DocumentFilesModal';
import DocumentValidityModal from '../components/modals/DocumentValidityModal';

export default function AltroView() {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [selectedDocForFiles, setSelectedDocForFiles] = useState<TravelDocument | null>(null);
  const [selectedDocForValidity, setSelectedDocForValidity] = useState<TravelDocument | null>(null);

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

  const insuranceDoc = getDoc('doc_assicurazione');
  const passportDoc = getDoc('doc_passaporti');
  
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
        {/* Card 1: Assicurazione */}
        <button 
          onClick={() => insuranceDoc ? handleOpenValidityModal(insuranceDoc) : null}
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
          onClick={() => passportDoc ? handleOpenValidityModal(passportDoc) : null}
          className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all text-left flex flex-col gap-2 min-h-[100px] cursor-pointer"
        >
          <span className="text-2xl">📑</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Documenti</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Passaporti, visti, patenti, scadenze</p>
          </div>
        </button>

        {/* Card 3: Numeri Emergenza */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]">
          <span className="text-2xl">📞</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Numeri di emergenza</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">111 NZ, 000 AU, 911 PH, Consolati</p>
          </div>
        </div>

        {/* Card 4: Info utili */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]">
          <span className="text-2xl">ℹ️</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Info utili</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Fuso orario, valuta, prese elettriche</p>
          </div>
        </div>

        {/* Card 5: Spese & Budget */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]">
          <span className="text-2xl">💳</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Spese & Budget</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Riepilogo costi saldati vs da saldare</p>
          </div>
        </div>

        {/* Card 6: Lista bagagli */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]">
          <span className="text-2xl">🧳</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Lista bagagli</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Checklist cosa portare, franchigie</p>
          </div>
        </div>

        {/* Card 7: Note di viaggio */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]">
          <span className="text-2xl">📝</span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">Note di viaggio</h3>
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Appunti, idee, promemoria</p>
          </div>
        </div>

        {/* Card Full Width: Documenti del Viaggio */}
        <button 
          onClick={() => passportDoc ? handleOpenFilesModal(passportDoc) : null}
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

      {/* MODAL GESTIONE ALLEGATI DOCUMENTO */}
      {selectedDocForFiles && (
        <DocumentFilesModal
          isOpen={true}
          onClose={() => setSelectedDocForFiles(null)}
          document={selectedDocForFiles}
          onUpdateDocument={handleSaveDocument}
        />
      )}

      {/* MODAL MODIFICA VALIDITÀ E DURATA */}
      {selectedDocForValidity && (
        <DocumentValidityModal
          isOpen={true}
          onClose={() => setSelectedDocForValidity(null)}
          document={selectedDocForValidity}
          onSave={handleSaveDocument}
        />
      )}
    </div>
  );
}
