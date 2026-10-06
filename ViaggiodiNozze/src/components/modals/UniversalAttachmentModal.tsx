import React, { useState, useRef } from 'react';
import type { TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import LightboxCarousel from '../common/LightboxCarousel';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
import { Trash2, Plus, Download, FileText } from 'lucide-react';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imageAttachments = attachments.filter((att) => att.type === 'image');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
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
      setErrorMessage(err.message || 'Errore imprevisto.');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  };

  const renderContent = () => {
    if (attachments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600">
          <div className="w-16 h-16 bg-[#FFF0ED] text-[#FF6B5F] rounded-full flex items-center justify-center mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-[#172033] dark:text-white font-bold mb-2">Nessun Pass caricato</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-[250px]">
            Carica biglietti, QR code o ricevute in formato PDF o Immagine per averli sempre a portata di mano (anche offline).
          </p>
          {canEdit && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#FF6B5F] hover:bg-[#e85c50] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors active:scale-95 shadow-md shadow-[#FF6B5F]/20"
            >
              <Plus className="w-5 h-5" />
              Carica Biglietto
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between p-3 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
              <div 
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group"
                onClick={() => {
                  if (att.type === 'image') {
                    const idx = imageAttachments.findIndex(img => img.id === att.id);
                    if (idx >= 0) setZoomedIndex(idx);
                  } else {
                    handleOpenPdf(att.dataUrl, att.name);
                  }
                }}
              >
                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden group-hover:border-[#DDF4F5] transition-colors">
                  {att.type === 'image' ? (
                    <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-6 h-6 text-[#FF6B5F]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#172033] dark:text-white text-sm truncate">{att.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{att.type}</span>
                    <span className="text-[10px] text-slate-400">•</span>
                    <span className="text-[10px] text-slate-500 font-medium">{formatFileSize(att.size)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 ml-2 shrink-0">
                {att.type === 'pdf' && (
                  <button onClick={() => handleOpenPdf(att.dataUrl, att.name)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-[#172033] dark:hover:text-white bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => handleDelete(att.id)} className="w-8 h-8 flex items-center justify-center text-rose-500 hover:text-white hover:bg-rose-500 rounded-full transition-colors ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {canEdit && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 mt-2 bg-[#F0FAF9] dark:bg-slate-800 hover:bg-[#DDF4F5] dark:hover:bg-slate-700 text-[#172033] dark:text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-[#DDF4F5] dark:border-slate-600 transition-colors active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Aggiungi altri biglietti
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} accentVariant="sky">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
        />
        
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

      {zoomedIndex !== null && imageAttachments.length > 0 && (
        <LightboxCarousel
          isOpen={true} items={imageAttachments}
          initialIndex={zoomedIndex}
          onClose={() => setZoomedIndex(null)}
        />
      )}
    </>
  );
}
