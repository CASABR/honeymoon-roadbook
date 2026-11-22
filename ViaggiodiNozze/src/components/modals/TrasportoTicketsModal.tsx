import React, { useState, useRef } from 'react';
import type { Trasporto, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import DropZone from '../common/DropZone';
import AttachmentListRow from '../common/AttachmentListRow';
import { processFileForAttachment, openAttachmentInNewTab } from '../../utils/fileAttachment';
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
    if (!dataUrl || !openAttachmentInNewTab(dataUrl, fileName)) setErrorMessage('File non disponibile: il riferimento non contiene il PDF. Nessun documento è stato sostituito.');
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
            <div className="space-y-2">
              {attachments.map((att, attIdx) => (
                <AttachmentListRow
                  key={att.id}
                  attachment={att}
                  onView={() => setZoomedIndex(attIdx)}
                  onOpenExternal={() => handleOpenPdf(att.dataUrl, att.name)}
                  onDelete={() => handleDeleteAttachment(att.id)}
                />
              ))}
            </div>
          )}

          {/* Se ci sono già allegati, mostra DropZone compatta per aggiungerne altri */}
          {attachments.length > 0 && (
            <DropZone
              variant="compact"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploading}
              uploadProgressText={uploadProgressText}
              title="Aggiungi biglietto o QR code"
              subtitle="PDF o immagini"
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
