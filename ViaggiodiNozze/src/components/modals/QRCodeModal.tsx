import React, { useState, useRef, useCallback } from 'react';
import Modal from '../common/Modal';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  title?: string;
  subtitle?: string;
  onFilesSelected?: (files: File[]) => void;
  isUploading?: boolean;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  code,
  title = 'QR Code per la scansione',
  subtitle,
  onFilesSelected,
  isUploading = false
}: QRCodeModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropFeedback, setDropFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  }, [isDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles: File[] = [];
      const fileList = Array.from(e.dataTransfer.files);

      for (const file of fileList) {
        const type = file.type.toLowerCase();
        const name = file.name.toLowerCase();
        if (
          type.startsWith('image/') ||
          type === 'application/pdf' ||
          name.endsWith('.pdf') ||
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.png') ||
          name.endsWith('.webp')
        ) {
          validFiles.push(file);
        }
      }

      if (validFiles.length > 0) {
        if (onFilesSelected) {
          onFilesSelected(validFiles);
          setDropFeedback(`✓ ${validFiles.length} ${validFiles.length === 1 ? 'file aggiunto' : 'file aggiunti'} con successo!`);
          setTimeout(() => setDropFeedback(null), 4000);
        }
      }
    }
  }, [isUploading, onFilesSelected]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onFilesSelected) {
        const files = Array.from(e.target.files);
        onFilesSelected(files);
        setDropFeedback(`✓ ${files.length} ${files.length === 1 ? 'file aggiunto' : 'file aggiunti'}!`);
        setTimeout(() => setDropFeedback(null), 4000);
      }
      e.target.value = '';
    }
  };

  if (!code) return null;

  // Usa l'API standard sicura QR Server (nessuna dipendenza JS esterna, 100% stabile)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(code)}&margin=10`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} accentVariant="amber">
      <div className="flex flex-col items-center justify-center p-3 text-center space-y-4">
        {subtitle && (
          <p className="text-xs text-slate-500 font-medium">
            {subtitle}
          </p>
        )}

        {/* Feedback salvataggio/caricamento */}
        {dropFeedback && (
          <div className="w-full p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-fade-in flex items-center justify-center gap-1.5">
            <span>{dropFeedback}</span>
          </div>
        )}

        {/* Contenitore QR Code interattivo ad altissimo contrasto con Drag & Drop da Desktop */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (onFilesSelected && !isUploading) {
              fileInputRef.current?.click();
            }
          }}
          className={`relative p-4 rounded-3xl border-2 transition-all inline-block select-none ${
            isDragOver
              ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-500 scale-105 shadow-2xl ring-4 ring-amber-400/50 animate-pulse cursor-copy'
              : 'bg-white dark:bg-white border-slate-900 shadow-xl hover:shadow-2xl'
          } ${onFilesSelected ? 'cursor-pointer' : ''}`}
          title={onFilesSelected ? 'Trascina qui il file dal desktop o clicca per caricare un biglietto' : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={handleInputChange}
            className="hidden"
            disabled={isUploading || !onFilesSelected}
          />

          <img
            src={qrUrl}
            alt={`QR Code: ${code}`}
            className={`w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl transition-opacity ${
              isDragOver ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
            loading="eager"
          />

          {/* Overlay visivo durante il trascinamento file */}
          {isDragOver && (
            <div className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center p-4 bg-amber-500/90 text-slate-950 font-black backdrop-blur-xs">
              <span className="text-4xl mb-2 animate-bounce">📥</span>
              <p className="text-base tracking-tight leading-tight">Rilascia il file qui!</p>
              <p className="text-xs font-semibold mt-1 opacity-90">Verrà salvato come allegato del biglietto</p>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center p-4 bg-slate-950/70 text-white font-bold backdrop-blur-xs">
              <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs">Caricamento in corso...</p>
            </div>
          )}
        </div>

        {/* Badge / Istruzione per drag & drop da Desktop */}
        {onFilesSelected && (
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span>🖱️</span>
              <span>Trascina un file PDF o screenshot direttamente sul QR code</span>
            </span>
          </div>
        )}

        <div className="w-full bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
            Dato / Codice Scansionato
          </span>
          <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 break-all select-all">
            {code}
          </p>
        </div>

        <p className="text-[11px] text-slate-400">
          💡 Suggerimento: alza la luminosità dello schermo per una scansione ottimale.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer"
        >
          Chiudi
        </button>
      </div>
    </Modal>
  );
}
