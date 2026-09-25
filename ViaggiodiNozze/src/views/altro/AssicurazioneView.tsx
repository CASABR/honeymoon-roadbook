import { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import { storageService } from '../../storage/storageService';
import DocumentValidityModal from '../../components/modals/DocumentValidityModal';

interface AssicurazioneViewProps {
  onBack: () => void;
}

export default function AssicurazioneView({ onBack }: AssicurazioneViewProps) {
  const [doc, setDoc] = useState<TravelDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  
  const loadDoc = async () => {
    try {
      setLoading(true);
      const loaded = await storageService.getDocuments();
      let insurance = loaded.find(d => d.category === 'assicurazione');
      if (!insurance) {
        // Create an empty one
        insurance = {
          id: 'doc_assicurazione',
          category: 'assicurazione',
          title: 'Assicurazione di Viaggio',
          attachments: [],
          updatedAt: new Date().toISOString()
        };
      }
      setDoc(insurance);
    } catch (err) {
      console.error('Errore caricamento assicurazione:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoc();
  }, []);

  const handleSaveDocument = async (updated: TravelDocument) => {
    try {
      await storageService.saveDocument(updated);
      setIsEditing(false);
      await loadDoc();
    } catch (err) {
      console.error('Errore salvataggio assicurazione:', err);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-10">
      <header className="flex items-center gap-3 mb-6 px-1">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>🛡️</span> Assicurazione
        </h1>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-1 space-y-4">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/60">
            <div className="flex justify-between items-start mb-3">
              <h2 className="text-lg font-bold text-slate-900">{doc?.title || 'Assicurazione di Viaggio'}</h2>
              <button onClick={() => setIsEditing(true)} className="text-xs text-sky-600 font-bold bg-sky-50 px-3 py-1.5 rounded-full">
                Modifica
              </button>
            </div>

            <div className="space-y-3 mt-4">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Stato / Polizza</p>
                <p className="font-medium text-sm text-slate-800">{doc?.status || 'Nessun dettaglio'}</p>
              </div>
              
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dettagli / Contatti</p>
                <p className="font-medium text-sm text-slate-800 whitespace-pre-wrap">{doc?.description || 'Nessuna informazione aggiunta.'}</p>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Inizio Copertura</p>
                  <p className="font-medium text-sm text-slate-800">{doc?.validity || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fine Copertura</p>
                  <p className="font-medium text-sm text-slate-800">{doc?.expiresAt || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditing && doc && (
        <DocumentValidityModal
          isOpen={true}
          onClose={() => setIsEditing(false)}
          document={doc}
          onSave={handleSaveDocument}
        />
      )}
    </div>
  );
}
