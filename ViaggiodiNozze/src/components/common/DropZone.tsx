import React, { useState, useRef, useCallback } from 'react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  uploadProgressText?: string;
  accept?: string;
  multiple?: boolean;
  variant?: 'hero' | 'compact' | 'button';
  title?: string;
  subtitle?: string;
  className?: string;
  disabled?: boolean;
}

export default function DropZone({
  onFilesSelected,
  isUploading = false,
  uploadProgressText = '',
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  multiple = true,
  variant = 'hero',
  title,
  subtitle,
  className = '',
  disabled = false
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
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

    if (disabled || isUploading) return;

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
        onFilesSelected(validFiles);
      }
    }
  }, [disabled, isUploading, onFilesSelected]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  if (variant === 'button') {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          isDragOver
            ? 'bg-indigo-600 text-white scale-105 shadow-lg ring-4 ring-indigo-400/50 animate-pulse'
            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 shadow-2xs'
        } ${className}`}
        title="Trascina qui il file o clicca per selezionarlo"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <span className="text-base">{isDragOver ? '📥' : '🎫'}</span>
        <span>{isDragOver ? 'Rilascia il file qui!' : (title || '+ Aggiungi File')}</span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`w-full py-3.5 px-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center gap-2.5 text-xs font-bold select-none ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 scale-[1.01] shadow-md ring-2 ring-indigo-400/40'
            : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
        } ${className}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <span className="text-lg transition-transform duration-200 group-hover:scale-110">
          {isDragOver ? '📥' : '➕'}
        </span>
        <div className="flex flex-col sm:flex-row items-center gap-1 text-center">
          <span>{isDragOver ? 'Rilascia per caricare subito!' : (title || 'Trascina qui altri file')}</span>
          <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
            {subtitle || 'oppure clicca per selezionare'}
          </span>
        </div>
      </div>
    );
  }

  // Variant 'hero' (Default Full Dropzone)
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`relative w-full border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all select-none overflow-hidden ${
        isDragOver
          ? 'border-[#FF6B5F] bg-[#FFF0ED]/80 dark:bg-rose-950/30 scale-[1.01] shadow-xl ring-4 ring-[#FF6B5F]/20'
          : 'border-slate-300 dark:border-slate-700 hover:border-[#FF6B5F] dark:hover:border-[#FF6B5F] bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
      } ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {isUploading ? (
        <div className="flex flex-col items-center justify-center py-4">
          <div className="w-10 h-10 border-3 border-slate-200 border-t-[#FF6B5F] rounded-full animate-spin mb-3"></div>
          <p className="font-bold text-sm text-slate-800 dark:text-white">Caricamento ed elaborazione...</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{uploadProgressText || 'Salvataggio in corso...'}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-2xs transition-all ${
              isDragOver
                ? 'bg-[#FF6B5F] text-white scale-110 shadow-md animate-bounce'
                : 'bg-white dark:bg-slate-800 text-[#FF6B5F] border border-slate-200 dark:border-slate-700'
            }`}
          >
            {isDragOver ? '📥' : '🎫'}
          </div>

          <h4 className="text-sm font-black text-slate-900 dark:text-white">
            {isDragOver ? 'Rilascia qui i tuoi file!' : (title || 'Trascina qui i tuoi Voucher, Pass o QR Code')}
          </h4>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            {subtitle || 'Supporta file PDF, screenshot di QR Code e immagini (JPG, PNG). Trascina dal desktop oppure clicca per sfogliare.'}
          </p>

          <div className="flex items-center gap-2 mt-3.5 flex-wrap justify-center">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
              🖱️ Trascina &amp; Rilascia
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
              📁 Sfoglia cartella
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ Offline 100%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
