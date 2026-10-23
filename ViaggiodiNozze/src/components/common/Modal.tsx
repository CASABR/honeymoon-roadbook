import React, { useEffect } from 'react';
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
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

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
        className="modal-backdrop-layer fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/65 backdrop-blur-sm"
    >
      {/* Click outside to close */}
      <div 
        style={{ position: 'fixed', inset: 0, cursor: 'pointer' }} 
        onClick={onClose} 
        aria-hidden="true" 
      />

      {/* Modal / Sheet Container */}
      <div
        className={`modal-sheet-container relative z-[100000] w-full max-w-lg flex flex-col overflow-hidden border-t sm:border rounded-t-3xl sm:rounded-2xl ${accentBorder} text-[#172033] dark:text-slate-100 dark:bg-[#1E293B] dark:border-slate-700 max-h-[90dvh] sm:my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Drag Handle Pill on Mobile */}
        <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e3dd] dark:border-slate-800 bg-[#fffdfa]/95 dark:bg-[#1E293B]/95 backdrop-blur sticky top-0 z-20 shrink-0 min-w-0">
          <h2 className="hounigo-title text-lg dark:text-slate-100 truncate break-words min-w-0 mr-3">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-[#172033] dark:hover:text-slate-200 hover:bg-[#f1eee7] dark:hover:bg-slate-800 transition-all cursor-pointer"
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
