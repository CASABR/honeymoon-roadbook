import React, { useState, useRef } from 'react';
import type { TravelDocument, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import AttachmentListRow from '../common/AttachmentListRow';
import { processFileForAttachment, openAttachmentInNewTab } from '../../utils/fileAttachment';
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
    openAttachmentInNewTab(dataUrl, fileName);
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
            <div className="space-y-2">
              {attachments.map((att, attIdx) => (
                <AttachmentListRow
                  key={att.id}
                  attachment={att}
                  onView={() => setZoomedIndex(attIdx)}
                  onOpenExternal={() => handleOpenPdf(att.dataUrl, att.name)}
                  onDelete={() => handleDeleteAttachment(att.id)}
                  accentClassName="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
                />
              ))}
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
