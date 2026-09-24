import { useState, useRef } from 'react';
import type { Trasporto, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
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
  const [errorMessage, setErrorMessage] = useState('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!transport) return null;

  const attachments = transport.attachments || [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMessage('');
    setIsUploading(true);

    try {
      const newAttachments: TransportAttachment[] = [...attachments];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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
    } catch (err: unknown) {
      console.error('Errore durante il caricamento del file:', err);
      const msg = err instanceof Error ? err.message : 'Errore imprevisto durante il caricamento del file.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
        // Fallback su download diretto
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
      <Modal isOpen={isOpen} onClose={onClose} title="Biglietti, Pass & QR Code" accentVariant="sky">
        <div className="space-y-4">
          {/* Header Sintetico */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-800/80 border border-slate-700/70">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-100 truncate">
                {transport.carrier || `${transport.departureLocation} ➔ ${transport.arrivalLocation}`}
              </div>
              <div className="text-[11px] text-slate-400">
                {attachments.length === 0
                  ? 'Nessun file salvato'
                  : `${attachments.length} ${attachments.length === 1 ? 'file salvato offline' : 'file salvati offline'}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Caricamento...</span>
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
            <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between gap-2">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-400 hover:text-rose-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Lista Biglietti / Allegati */}
          {attachments.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-800/30 hover:bg-slate-800/50"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-2xl mb-2.5">
                📱
              </div>
              <h4 className="text-sm font-bold text-slate-100">Carica Biglietto, Pass o QR Code</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Tocca qui per caricare screenshot di carte d'imbarco, QR code o PDF di prenotazione (fino a 25 MB).
              </p>
              <span className="inline-block mt-3 px-3 py-1 text-[11px] font-semibold text-sky-300 bg-sky-500/15 rounded-md border border-sky-500/30">
                Disponibili 100% offline
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 transition-all hover:border-slate-600"
                >
                  {/* Anteprima Sinistra */}
                  {att.type === 'image' ? (
                    <div
                      onClick={() => setZoomedImage(att.dataUrl)}
                      className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden cursor-pointer shrink-0 relative group flex items-center justify-center"
                      title="Tocca per ingrandire e scansionare"
                    >
                      <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-xs">🔍</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-rose-400 shrink-0">
                      <span className="text-lg font-bold">📄</span>
                      <span className="text-[9px] font-mono font-bold uppercase mt-0.5">PDF</span>
                    </div>
                  )}

                  {/* Informazioni File */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-100 truncate" title={att.name}>
                      {att.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{formatFileSize(att.size)}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-medium">Offline</span>
                    </div>

                    {att.type === 'image' ? (
                      <button
                        type="button"
                        onClick={() => setZoomedImage(att.dataUrl)}
                        className="mt-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Tocca per mostrare QR a schermo intero</span>
                        <span>🔍</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                        className="mt-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
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
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 transition-all cursor-pointer shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer del Modal */}
          <div className="pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      </Modal>

      {/* OVERLAY ZOOM QR CODE A SCHERMO INTERO PER SCANSIONE AI VARCHI */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div className="w-full max-w-sm flex items-center justify-between pb-3 text-white">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Pronto per la scansione
            </span>
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div
            className="w-full max-w-sm bg-white p-3 rounded-2xl shadow-2xl flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={zoomedImage}
              alt="QR Code o Pass ingrandito"
              className="w-full h-auto max-h-[75vh] object-contain rounded-lg"
            />
          </div>

          <p className="text-xs text-slate-400 mt-3 text-center">
            Aumenta la luminosità dello schermo per facilitare la scansione del lettore ottico.
          </p>
        </div>
      )}
    </>
  );
}
