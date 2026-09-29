import { useEffect } from 'react';
import { createPortal } from 'react-dom';

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

  const modalNode = (
    <div 
      className="modal-backdrop-layer"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Click outside to close */}
      <div 
        style={{ position: 'fixed', inset: 0, cursor: 'pointer' }} 
        onClick={onClose} 
        aria-hidden="true" 
      />

      {/* Modal / Sheet Container */}
      <div 
        className={"modal-sheet-container border-t sm:border rounded-t-3xl sm:rounded-3xl " + accentBorder + " text-slate-900"}
        style={{
          position: 'relative',
          zIndex: 100000,
          width: '100%',
          maxWidth: '32rem',
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Drag Handle Pill on Mobile */}
        <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-white/95 backdrop-blur sticky top-0 z-20 shrink-0">
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

        {/* Scrollable Body con safe area scrolling */}
        <div 
          className="modal-sheet-body space-y-4"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '1.25rem 1.5rem 5.5rem 1.5rem',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
}

