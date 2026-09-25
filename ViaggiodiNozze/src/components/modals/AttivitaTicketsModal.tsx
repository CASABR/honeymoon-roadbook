import { useState, useRef } from 'react';
import type { Attivita, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import QRCodeModal from './QRCodeModal';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!activity) return null;

  const attachments = activity.attachments || [];
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

      const updatedActivity: Attivita = {
        ...activity,
        attachments: newAttachments,
        updatedAt: Date.now()
      };

      await storageService.saveActivity(updatedActivity);
      if (onUpdateActivity) {
        onUpdateActivity(updatedActivity);
      }
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
    } catch (err) {
      console.error("Errore durante l'eliminazione:", err);
      setErrorMessage("Errore durante l'eliminazione del file.");
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
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.click();
      }
    } catch {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Biglietti, Pass & QR Code" accentVariant="amber">
        <div className="space-y-4">
          {/* Header Sintetico */}
          <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                {activity.title}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {attachments.length === 0
                  ? 'Nessun file salvato'
                  : `${attachments.length} ${attachments.length === 1 ? 'file salvato offline' : 'file salvati offline'}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>{uploadProgressText || 'Caricamento...'}</span>
                </>
              ) : (
                <>
                  <span>+ Aggiungi File</span>
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

          {/* QR Code Generato da Testo/Codice (se configurato) */}
          {activity.qrCode && (
            <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-white rounded-xl border border-amber-200 p-1 flex items-center justify-center shrink-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(activity.qrCode)}`}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                    QR Code Digitale
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-900 truncate">
                    {activity.qrCode}
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

          {/* Lista Biglietti / Allegati */}
          {attachments.length === 0 && !activity.qrCode ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-3xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-slate-100/70"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 text-2xl mb-2.5">
                📱
              </div>
              <h4 className="text-sm font-bold text-slate-900">Carica Biglietto, Pass o QR Code</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Tocca qui per caricare i file dei biglietti, immagini con QR code o documenti PDF (fino a 25 MB ciascuno).
              </p>
              <span className="inline-block mt-3 px-3 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 rounded-full border border-amber-200">
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
                        title="Tocca per ingrandire e scansionare"
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
                          className="mt-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Mostra a schermo intero (sfogliabile)</span>
                          <span>🔍</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                          className="mt-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
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
        </div>
      </Modal>

      {/* Lightbox / Ingrandimento immagini */}
      <LightboxCarousel
        isOpen={zoomedIndex !== null}
        onClose={() => setZoomedIndex(null)}
        items={imageAttachments}
        initialIndex={zoomedIndex || 0}
        title={activity.title || 'Pass & QR Code'}
      />

      {/* Modal QR Code Ingrandito */}
      {activity.qrCode && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
        />
      )}
    </>
  );
}
