import { useState } from 'react';
import type { TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import DropZone from '../common/DropZone';
import { processFileForAttachment, openAttachmentInNewTab } from '../../utils/fileAttachment';
import AttachmentListRow from '../common/AttachmentListRow';

interface UniversalAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  attachments: TransportAttachment[];
  onSave: (newAttachments: TransportAttachment[]) => Promise<void>;
  canEdit?: boolean;
}

export default function UniversalAttachmentModal({
  isOpen,
  onClose,
  title = "Pass / Biglietti",
  attachments,
  onSave,
  canEdit = true
}: UniversalAttachmentModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  const handleFilesBatch = async (filesArray: File[]) => {
    if (!filesArray || filesArray.length === 0) return;

    setErrorMessage('');
    setIsUploading(true);
    setUploadProgressText(`Elaborazione di ${filesArray.length} ${filesArray.length === 1 ? 'file' : 'file'}...`);

    try {
      const newAttachments = [...attachments];
      for (let i = 0; i < filesArray.length; i++) {
        setUploadProgressText(`Elaborazione file ${i + 1} di ${filesArray.length}...`);
        const processed = await processFileForAttachment(filesArray[i]);
        newAttachments.push(processed);
      }
      await onSave(newAttachments);
    } catch (err: any) {
      console.error('Errore:', err);
      setErrorMessage(err.message || 'Errore imprevisto durante il caricamento.');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Vuoi eliminare questo allegato?')) return;
    try {
      await onSave(attachments.filter(a => a.id !== id));
    } catch (err) {
      setErrorMessage("Errore durante l'eliminazione.");
    }
  };

  const handleOpenPdf = (dataUrl: string, fileName: string) => {
    openAttachmentInNewTab(dataUrl, fileName);
  };

  const handleOpenAttachment = async (att: TransportAttachment, attIdx: number) => {
    setErrorMessage('');
    let effectiveDataUrl = att.dataUrl;

    if (!effectiveDataUrl && (att as any).isChunked) {
      setIsUploading(true);
      setUploadProgressText(`Ricomposizione di ${att.name}...`);
      try {
        const { getTripConfig } = await import('../../utils/tripConfig');
        const config = getTripConfig();
        const tripId = config?.id || '0000';
        const { downloadAttachmentFromChunks } = await import('../../storage/attachmentChunkService');
        const reconstructed = await downloadAttachmentFromChunks(tripId, att as any);
        if (reconstructed && reconstructed.dataUrl) {
          effectiveDataUrl = reconstructed.dataUrl;
          const nextAttachments = attachments.map(a => a.id === att.id ? { ...a, dataUrl: effectiveDataUrl } : a);
          await onSave(nextAttachments).catch(() => {});
        } else {
          setErrorMessage(`Impossibile scaricare "${att.name}": file protetto o sessione non autorizzata.`);
          return;
        }
      } catch (err: any) {
        setErrorMessage(err.message || `Errore durante il download di "${att.name}".`);
        return;
      } finally {
        setIsUploading(false);
        setUploadProgressText('');
      }
    }

    if (!effectiveDataUrl) {
      setErrorMessage(`Dati non disponibili per "${att.name}".`);
      return;
    }

    if (att.type === 'pdf') {
      handleOpenPdf(effectiveDataUrl, att.name);
    } else {
      setZoomedIndex(attIdx);
    }
  };

  const renderContent = () => {
    if (attachments.length === 0) {
      return (
        <DropZone
          variant="hero"
          onFilesSelected={handleFilesBatch}
          isUploading={isUploading}
          uploadProgressText={uploadProgressText}
          disabled={!canEdit}
          title="Trascina qui il tuo Voucher, Biglietto o QR Code"
          subtitle="Rilascia direttamente dal desktop o clicca per sfogliare (PDF o immagini)"
        />
      );
    }

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {attachments.map((att, attIdx) => (
            <AttachmentListRow
              key={att.id}
              attachment={att}
              onView={() => handleOpenAttachment(att, attIdx)}
              onOpenExternal={att.dataUrl ? () => handleOpenPdf(att.dataUrl, att.name) : undefined}
              onDelete={canEdit ? () => handleDelete(att.id) : undefined}
            />
          ))}
        </div>

        {canEdit && (
          <DropZone
            variant="compact"
            onFilesSelected={handleFilesBatch}
            isUploading={isUploading}
            uploadProgressText={uploadProgressText}
            title="Aggiungi voucher o QR code"
            subtitle="PDF o immagini"
          />
        )}
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} accentVariant="sky">
        {errorMessage && (
          <div className="p-3 mb-4 bg-rose-50 text-rose-700 rounded-xl text-sm border border-rose-200">
            {errorMessage}
          </div>
        )}

        {isUploading ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-[#FF6B5F] rounded-full animate-spin mb-4"></div>
            <p className="font-bold text-[#172033] dark:text-white">Caricamento in corso...</p>
            <p className="text-sm text-slate-500 mt-1">{uploadProgressText}</p>
          </div>
        ) : (
          renderContent()
        )}
      </Modal>

      {zoomedIndex !== null && attachments.length > 0 && (
        <LightboxCarousel
          isOpen={true}
          items={attachments}
          initialIndex={zoomedIndex}
          onClose={() => setZoomedIndex(null)}
          title={title}
        />
      )}
    </>
  );
}
