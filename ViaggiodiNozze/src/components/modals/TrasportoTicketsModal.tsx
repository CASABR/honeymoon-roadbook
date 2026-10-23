import React, { useState, useRef } from 'react';
import type { Trasporto, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import DropZone from '../common/DropZone';
import { processFileForAttachment, formatFileSize, openAttachmentInNewTab } from '../../utils/fileAttachment';
import { storageService } from '../../storage/storageService';

interface TrasportoTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transport: Trasporto | null;
  onUpdateTransport: (updated: Trasporto) => void;
}

export default function TrasportoTicketsModal({
  isOpen,
  onClose,
  transport,
  onUpdateTransport
}: TrasportoTicketsModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!transport) return null;

  const attachments = transport.attachments || [];

  const handleFilesBatch = async (filesArray: File[]) => {
    if (!filesArray || filesArray.length === 0) return;

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

      const updatedTransport: Trasporto = {
        ...transport,
        attachments: newAttachments,
        updatedAt: Date.now()
      };

      await storageService.saveTransport(updatedTransport);
      onUpdateTransport(updatedTransport);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { 
        detail: { action: 'update', entityType: 'trasporti', data: updatedTransport } 
      }));
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await handleFilesBatch(Array.from(files));
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Vuoi eliminare questo biglietto / allegato?')) return;

    const newAttachments = attachments.filter((att) => att.id !== attachmentId);
    const updatedTransport: Trasporto = {
      ...transport,
      attachments: newAttachments,
      updatedAt: Date.now()
    };

    try {
      await storageService.saveTransport(updatedTransport);
      onUpdateTransport(updatedTransport);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { 
        detail: { action: 'update', entityType: 'trasporti', data: updatedTransport } 
      }));
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
      <Modal isOpen={isOpen} onClose={onClose} title="Biglietti, Pass & QR Code" accentVariant="sky">
        <div className="space-y-4">
          {/* Header Sintetico con DropZone Button */}
          <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {transport.carrier || `${transport.departureLocation} ➔ ${transport.arrivalLocation}`}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {attachments.length === 0
                  ? 'Nessun file salvato'
                  : `${attachments.length} ${attachments.length === 1 ? 'file salvato offline' : 'file salvati offline'}`}
              </div>
            </div>

            <DropZone
              variant="button"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploading}
              uploadProgressText={uploadProgressText}
              title="+ Aggiungi File"
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold border-none shadow-sky-500/20"
            />
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

          {/* Lista Biglietti / Allegati con Drag & Drop */}
          {attachments.length === 0 ? (
            <DropZone
              variant="hero"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploading}
              uploadProgressText={uploadProgressText}
              title="Trascina qui Carte d'Imbarco, Biglietti o QR Code"
              subtitle="Rilascia direttamente dal desktop oppure clicca per sfogliare la cartella (PDF o immagini)."
            />
          ) : (
            <div className="space-y-3">
              {attachments.map((att, attIdx) => {
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs transition-all hover:border-slate-300"
                  >
                    {/* Anteprima Sinistra */}
                    {att.type === 'image' ? (
                      <div
                        onClick={() => setZoomedIndex(attIdx)}
                        className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer shrink-0 relative group flex items-center justify-center"
                        title="Tocca per visualizzare e sfogliare a schermo intero"
                      >
                        <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="text-xs text-white">🔍</span>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                        className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 shrink-0 cursor-pointer hover:bg-rose-100 transition-colors"
                        title="Tocca per aprire direttamente il PDF in una nuova scheda"
                      >
                        <span className="text-lg font-bold">📄</span>
                        <span className="text-[9px] font-mono font-bold uppercase mt-0.5">PDF</span>
                      </div>
                    )}

                    {/* Informazioni File */}
                    <div className="min-w-0 flex-1">
                      <p 
                        onClick={() => {
                          if (att.type === 'pdf') {
                            handleOpenPdf(att.dataUrl, att.name);
                          } else {
                            setZoomedIndex(attIdx);
                          }
                        }}
                        className="text-xs font-semibold text-slate-900 truncate cursor-pointer hover:text-sky-600" 
                        title={att.name}
                      >
                        {att.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{formatFileSize(att.size)}</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-medium">Offline</span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setZoomedIndex(attIdx)}
                          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Sfoglia</span>
                          <span>🔍</span>
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Apri</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </div>
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

          {/* Se ci sono già allegati, mostra DropZone compatta per aggiungerne altri */}
          {attachments.length > 0 && (
            <DropZone
              variant="compact"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploading}
              uploadProgressText={uploadProgressText}
              title="Trascina qui altri biglietti, voucher o QR code"
              subtitle="oppure clicca per selezionare dalla cartella"
            />
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
        title={transport.carrier || 'Pass & QR Code'}
      />
    </>
  );
}
