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
        className={`modal-sheet-container relative z-[100000] w-full max-w-lg flex flex-col overflow-hidden shadow-2xl border-t sm:border rounded-t-3xl sm:rounded-2xl ${accentBorder} text-slate-900 dark:text-slate-100 bg-white dark:bg-[#1E293B] dark:border-slate-700 max-h-[90dvh] sm:my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Drag Handle Pill on Mobile */}
        <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur sticky top-0 z-20 shrink-0 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate break-words min-w-0 mr-3">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
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

