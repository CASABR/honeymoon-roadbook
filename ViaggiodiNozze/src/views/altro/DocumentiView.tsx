import { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import { storageService } from '../../storage/storageService';
import DocumentValidityModal from '../../components/modals/DocumentValidityModal';

interface DocumentiViewProps {
  onBack: () => void;
}

export default function DocumentiView({ onBack }: DocumentiViewProps) {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<TravelDocument | null>(null);
  
  // Per creare un nuovo documento al volo (semplificato)
  const handleAddNew = async () => {
    const newDoc: TravelDocument = {
      id: 'doc_' + Date.now(),
      category: 'altro',
      title: 'Nuovo Documento',
      attachments: [],
      updatedAt: new Date().toISOString()
    };
    setSelectedDoc(newDoc);
  };

  const loadDocs = async () => {
    try {
      setLoading(true);
      const loaded = await storageService.getDocuments();
      // Mostriamo tutti tranne l'assicurazione, che ha una vista a sé
      setDocuments(loaded.filter(d => d.category !== 'assicurazione'));
    } catch (err) {
      console.error('Errore caricamento documenti:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleSaveDocument = async (updated: TravelDocument) => {
    try {
      await storageService.saveDocument(updated);
      setSelectedDoc(null);
      await loadDocs();
    } catch (err) {
      console.error('Errore salvataggio documento:', err);
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || 'Valido').toLowerCase();
    if (s.includes('valido') || s.includes('attiva') || s.includes('approvato') || s.includes('completato')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          ✓ {status || 'Valido'}
        </span>
      );
    }
    if (s.includes('attesa') || s.includes('verificare')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          ⏳ {status}
        </span>
      );
    }
    if (s.includes('richiedere')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          📝 {status}
        </span>
      );
    }
    if (s.includes('scadut') || s.includes('non valido')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          ❌ {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
        {status || 'Valido'}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-10">
      <header className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>📑</span> Documenti
          </h1>
        </div>
        
        <button
          onClick={handleAddNew}
          className="text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 active:scale-95 px-3.5 py-1.5 rounded-xl border border-sky-200 transition-all cursor-pointer shadow-2xs"
        >
          + Nuovo
        </button>
      </header>
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="text-4xl mb-3">🪪</span>
          <p className="text-sm font-semibold text-slate-500">Nessun documento inserito.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => setSelectedDoc(doc)}
              className="bg-white rounded-3xl p-4.5 border border-slate-200/90 shadow-sm cursor-pointer flex flex-col gap-2 hover:border-sky-300 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-extrabold text-slate-900 text-[15px]">{doc.title}</h3>
                {getStatusBadge(doc.status)}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{doc.description || 'Nessuna descrizione.'}</p>
              
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {doc.validity && (
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/60">
                    Rilascio: {doc.validity}
                  </span>
                )}
                {doc.expiresAt && (
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/60">
                    Scadenza: {doc.expiresAt}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDoc && (
        <DocumentValidityModal
          isOpen={true}
          onClose={() => { setSelectedDoc(null); loadDocs(); }}
          document={selectedDoc}
          onSave={handleSaveDocument}
        />
      )}
    </div>
  );
}
