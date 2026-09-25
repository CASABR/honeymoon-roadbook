import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  accentVariant?: 'amber' | 'purple' | 'sky' | 'indigo' | 'rose' | 'emerald';
}

export default function Modal({ isOpen, onClose, title, children, accentVariant = 'amber' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const accentBorder = {
    amber: 'border-amber-200',
    purple: 'border-purple-200',
    sky: 'border-sky-200',
    indigo: 'border-indigo-200',
    rose: 'border-rose-200',
    emerald: 'border-emerald-200'
  }[accentVariant];

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal / Sheet Container */}
      <div 
        className={"relative z-10 w-full max-w-lg bg-white border-t sm:border rounded-t-3xl sm:rounded-3xl " + accentBorder + " shadow-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/95 backdrop-blur sticky top-0 z-10">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            aria-label="Chiudi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
