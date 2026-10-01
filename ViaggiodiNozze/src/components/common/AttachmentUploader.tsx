import { useRef, useState } from 'react';
import type { TransportAttachment } from '../../types';

interface AttachmentUploaderProps {
  attachments: TransportAttachment[];
  onChange: (attachments: TransportAttachment[]) => void;
  maxSizeMB?: number;
}

export default function AttachmentUploader({ attachments = [], onChange, maxSizeMB = 0.7 }: AttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Controlli base
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Il file supera il limite di ${maxSizeMB}MB.`);
      return;
    }

    const type: 'image' | 'pdf' | null = file.type.startsWith('image/')
      ? 'image'
      : file.type === 'application/pdf'
      ? 'pdf'
      : null;

    if (!type) {
      setError('Formato non supportato. Usa JPG, PNG o PDF.');
      return;
    }

    setIsUploading(true);

    try {
      // Leggiamo il file come Base64 string per salvarlo off-line in IndexedDB
      const reader = new FileReader();
      
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const newAttachment: TransportAttachment = {
        id: 'att_' + Date.now(),
        name: file.name,
        type,
        dataUrl,
        size: file.size,
        createdAt: new Date().toISOString()
      };

      onChange([...attachments, newAttachment]);
    } catch (err) {
      console.error('Errore lettura file:', err);
      setError('Errore durante la lettura del file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = (id: string) => {
    onChange(attachments.filter(a => a.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-3">
      {/* Zona di Drop / Pulsante */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-indigo-400 transition-colors p-4 flex flex-col items-center justify-center cursor-pointer text-center group"
      >
        <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📤</span>
        <p className="text-xs font-bold text-slate-700">Carica Documento (Offline)</p>
        <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG o PDF (max {maxSizeMB * 1000} KB per Sync Cloud)</p>
        
        {isUploading && (
          <div className="mt-2 text-[10px] text-indigo-600 font-bold animate-pulse">
            Salvataggio in corso...
          </div>
        )}
      </div>

      {error && (
        <div className="p-2 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-medium border border-rose-200">
          ⚠️ {error}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
      />

      {/* Lista Allegati */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center gap-3 overflow-hidden">
                {/* Anteprima */}
                {att.type === 'image' ? (
                  <img src={att.dataUrl} alt={att.name} className="w-10 h-10 object-cover rounded-lg bg-slate-100 shrink-0 border border-slate-200/60" />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-lg shrink-0 border border-rose-100">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{att.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{att.type} • {formatSize(att.size)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <a 
                  href={att.dataUrl} 
                  download={att.name}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title="Scarica"
                >
                  ↓
                </a>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(att.id); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Elimina"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
