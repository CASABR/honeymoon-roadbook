import { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import { storageService } from '../../storage/storageService';

interface DocumentiGalleriaViewProps {
  onBack: () => void;
}

export default function DocumentiGalleriaView({ onBack }: DocumentiGalleriaViewProps) {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDocs() {
      try {
        setLoading(true);
        const loaded = await storageService.getDocuments();
        setDocuments(loaded);
      } catch (err) {
        console.error('Errore caricamento galleria documenti:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDocs();
  }, []);

  // Raccogliamo tutti gli allegati con il riferimento al documento genitore
  const allAttachments = documents.flatMap(doc => 
    (doc.attachments || []).map(att => ({ ...att, parentDoc: doc }))
  );

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
          <span>📂</span> Galleria Documenti
        </h1>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : allAttachments.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <span className="text-4xl mb-3">📭</span>
          <p className="text-sm text-slate-500">Nessun file o foto caricato finora.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-1">
          {allAttachments.map((file, idx) => (
            <div key={idx} className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer relative flex flex-col">
              <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center relative overflow-hidden">
                {file.type === 'image' ? (
                  <img src={file.dataUrl} alt={file.name} className="object-cover w-full h-full" />
                ) : (
                  <div className="text-rose-500 flex flex-col items-center justify-center">
                    <svg className="w-10 h-10 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                    </svg>
                    <span className="text-[10px] font-bold">PDF</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a
                    href={file.dataUrl}
                    download={file.name}
                    className="bg-white/90 text-slate-900 p-2 rounded-full transform scale-90 group-hover:scale-100 transition-transform shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </div>
              </div>
              <div className="p-3">
                <p className="text-[11px] font-bold text-slate-800 line-clamp-1" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                  {file.parentDoc.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
