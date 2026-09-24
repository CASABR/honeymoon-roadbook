import { useState, useRef } from 'react';
import type { TravelDocument, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
import { storageService } from '../../storage/storageService';

interface DocumentFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: TravelDocument | null;
  onUpdateDocument: (updated: TravelDocument) => void;
}

export default function DocumentFilesModal({
  isOpen,
  onClose,
  document,
  onUpdateDocument
}: DocumentFilesModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!document) return null;

  const attachments = document.attachments || [];
  const imageAttachments = attachments.filter((att) => att.type === 'image');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    setErrorMessage('');
    setIsUploading(true);
    setUploadProgressText(`Elaborazione di ${filesArray.length} ${filesArray.length === 1 ? 'file' : 'file'}...`);

    try {
      const newAttachments: TransportAttachment[] = [...attachments];

      for (let i = 0; i < filesArray.length; i++) {
        setUploadProgressText(`Elaborazione file ${i + 1} di ${filesArray.length}...`);
        const file = filesArray[i];
        const processed = await processFileForAttachment(file);
        newAttachments.push(processed);
      }

      const updatedDocument: TravelDocument = {
        ...document,
        attachments: newAttachments,
        updatedAt: new Date().toISOString()
      };

      await storageService.saveDocument(updatedDocument);
      onUpdateDocument(updatedDocument);
    } catch (err: unknown) {
      console.error('Errore durante il caricamento del file:', err);
      const msg = err instanceof Error ? err.message : 'Errore imprevisto durante il caricamento del file.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Vuoi eliminare questo documento / allegato?')) return;

    const newAttachments = attachments.filter((att) => att.id !== attachmentId);
    const updatedDocument: TravelDocument = {
      ...document,
      attachments: newAttachments,
      updatedAt: new Date().toISOString()
    };

    try {
      await storageService.saveDocument(updatedDocument);
      onUpdateDocument(updatedDocument);
    } catch (err) {
      console.error('Errore durante l\'eliminazione:', err);
      setErrorMessage('Errore durante l\'eliminazione del file.');
    }
  };

  const handleOpenPdf = (dataUrl: string, fileName: string) => {
    try {
      const win = window.open();
      if (win) {
        win.document.write(
          `<title>${fileName}</title><iframe src="${dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      } else {
        const a = window.document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.click();
      }
    } catch {
      const a = window.document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Allegati & Scansioni Documento" accentVariant="indigo">
        <div className="space-y-4">
          {/* Header Sintetico */}
          <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                {document.title}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {attachments.length === 0
                  ? 'Nessun file salvato'
                  : `${attachments.length} ${attachments.length === 1 ? 'file disponibile offline' : 'file disponibili offline'}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{uploadProgressText || 'Caricamento...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Aggiungi File</span>
                </>
              )}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,application/pdf"
              multiple
              className="hidden"
            />
          </div>

          {/* Banner Errore */}
          {errorMessage && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between gap-2">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-600 hover:text-rose-800 text-sm font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Lista Allegati / Documenti */}
          {attachments.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-3xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-slate-100/70"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 text-2xl mb-2.5">
                📁
              </div>
              <h4 className="text-sm font-bold text-slate-900">Carica Documenti o Foto</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Tocca qui per caricare più file insieme: foto di passaporti, visti PDF o certificati di polizza (fino a 25 MB ciascuno).
              </p>
              <span className="inline-block mt-3 px-3 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 rounded-full border border-indigo-200">
                Disponibili 100% offline
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {attachments.map((att) => {
                const imgIdx = att.type === 'image' ? imageAttachments.findIndex((a) => a.id === att.id) : -1;
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs transition-all hover:border-slate-300"
                  >
                    {/* Anteprima Sinistra */}
                    {att.type === 'image' ? (
                      <div
                        onClick={() => setZoomedIndex(imgIdx >= 0 ? imgIdx : 0)}
                        className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer shrink-0 relative group flex items-center justify-center"
                        title="Tocca per visualizzare a schermo intero"
                      >
                        <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="text-xs text-white">🔍</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 shrink-0">
                        <span className="text-lg font-bold">📄</span>
                        <span className="text-[9px] font-mono font-bold uppercase mt-0.5">PDF</span>
                      </div>
                    )}

                    {/* Informazioni File */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate" title={att.name}>
                        {att.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{formatFileSize(att.size)}</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-medium">Offline</span>
                      </div>

                      {att.type === 'image' ? (
                        <button
                          type="button"
                          onClick={() => setZoomedIndex(imgIdx >= 0 ? imgIdx : 0)}
                          className="mt-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Mostra a schermo intero (sfogliabile)</span>
                          <span>🔍</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                          className="mt-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Apri documento PDF</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Tasto Elimina */}
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      title="Elimina allegato"
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer del Modal */}
          <div className="pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>

      {/* CAROSELLO SFOGLIABILE A SCHERMO INTERO CON SUPPORTO TOUCH SWIPE */}
      <LightboxCarousel
        isOpen={zoomedIndex !== null}
        onClose={() => setZoomedIndex(null)}
        items={attachments}
        initialIndex={zoomedIndex ?? 0}
        title={document.title}
      />
    </>
  );
}
