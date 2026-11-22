import React, { useState, useRef } from 'react';
import type { Attivita, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import QRCodeModal from './QRCodeModal';
import DropZone from '../common/DropZone';
import AttachmentListRow from '../common/AttachmentListRow';
import { processFileForAttachment, openAttachmentInNewTab } from '../../utils/fileAttachment';
import { storageService } from '../../storage/storageService';

interface AttivitaTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: Attivita | null;
  onUpdateActivity?: (updated: Attivita) => void;
}

export default function AttivitaTicketsModal({
  isOpen,
  onClose,
  activity,
  onUpdateActivity
}: AttivitaTicketsModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isQRDragOver, setIsQRDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!activity) return null;

  const attachments = activity.attachments || [];

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

      const updatedActivity: Attivita = {
        ...activity,
        attachments: newAttachments,
        updatedAt: Date.now()
      };

      await storageService.saveActivity(updatedActivity);
      if (onUpdateActivity) {
        onUpdateActivity(updatedActivity);
      }
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { 
        detail: { action: 'update', entityType: 'attivita', data: updatedActivity } 
      }));
    } catch (err: unknown) {
      console.error('Errore durante il caricamento del file per attività:', err);
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
    const updatedActivity: Attivita = {
      ...activity,
      attachments: newAttachments,
      updatedAt: Date.now()
    };

    try {
      await storageService.saveActivity(updatedActivity);
      if (onUpdateActivity) {
        onUpdateActivity(updatedActivity);
      }
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { 
        detail: { action: 'update', entityType: 'attivita', data: updatedActivity } 
      }));
    } catch (err) {
      console.error("Errore durante l'eliminazione:", err);
      setErrorMessage("Errore durante l'eliminazione del file.");
    }
  };

  const handleOpenPdf = (dataUrl: string, fileName: string) => {
    openAttachmentInNewTab(dataUrl, fileName);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Biglietti, Pass & QR Code" accentVariant="amber">
        <div className="space-y-4">
          {/* Header Sintetico con DropZone Button */}
          <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {activity.title}
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
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-none shadow-amber-500/20"
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

          {/* QR Code Generato da Testo/Codice con supporto Drop diretto */}
          {activity.qrCode && (
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsQRDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsQRDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsQRDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesBatch(Array.from(e.dataTransfer.files));
                }
              }}
              className={`p-3.5 rounded-2xl transition-all flex items-center justify-between gap-3 ${
                isQRDragOver
                  ? 'bg-amber-100 dark:bg-amber-950/60 border-2 border-dashed border-amber-500 scale-[1.02] shadow-lg ring-2 ring-amber-400/50'
                  : 'bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-white rounded-xl border border-amber-200 p-1 flex items-center justify-center shrink-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(activity.qrCode)}`}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 tracking-wider block">
                    {isQRDragOver ? '📥 Rilascia il file qui!' : 'QR Code Digitale'}
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate">
                    {activity.qrCode}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block">
                    {isQRDragOver ? 'Carica subito il biglietto' : 'Trascina qui il file o clicca Ingrandisci'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsQRModalOpen(true)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                Ingrandisci 🔍
              </button>
            </div>
          )}

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

          {/* Lista Biglietti / Allegati con supporto Drag & Drop */}
          {attachments.length === 0 && !activity.qrCode ? (
            <DropZone
              variant="hero"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploading}
              uploadProgressText={uploadProgressText}
              title="Trascina qui il tuo Biglietto, Pass o QR Code"
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
                  accentClassName="text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300"
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
        </div>
      </Modal>

      {/* Lightbox / Ingrandimento immagini e PDF sfogliabili */}
      <LightboxCarousel
        isOpen={zoomedIndex !== null}
        onClose={() => setZoomedIndex(null)}
        items={attachments}
        initialIndex={zoomedIndex || 0}
        title={activity.title || 'Pass & QR Code'}
      />

      {/* Modal QR Code Ingrandito con supporto Drag & Drop */}
      {activity.qrCode && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
          onFilesSelected={handleFilesBatch}
          isUploading={isUploading}
        />
      )}
    </>
  );
}
