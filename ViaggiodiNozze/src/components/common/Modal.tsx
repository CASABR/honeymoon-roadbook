import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  accentVariant?: 'amber' | 'purple' | 'sky' | 'indigo' | 'rose' | 'emerald';
  centered?: boolean;
}

export default function Modal({ isOpen, onClose, title, children, accentVariant = 'amber', centered = false }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    // Only focus the modal container if no element inside already has focus
    const focusTimer = window.setTimeout(() => {
      if (modalRef.current && !modalRef.current.contains(document.activeElement)) {
        modalRef.current.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
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
        className={`modal-backdrop-layer fixed inset-0 z-[99999] flex justify-center bg-slate-900/65 backdrop-blur-sm ${centered ? 'items-center p-4' : 'items-end sm:items-center p-0 sm:p-4'}`}
    >
      {/* Click outside to close */}
      <div 
        style={{ position: 'fixed', inset: 0, cursor: 'pointer' }} 
        onClick={onClose} 
        aria-hidden="true" 
      />

      {/* Modal / Sheet Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-sheet-container relative z-[100000] max-w-lg flex flex-col overflow-hidden ${centered ? 'w-full border rounded-2xl' : 'w-full border-t sm:border rounded-t-3xl sm:rounded-2xl'} ${accentBorder} text-[#172033] dark:text-slate-100 dark:bg-[#1E293B] dark:border-slate-700 max-h-[90dvh] sm:my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Drag Handle Pill on Mobile */}
        <div className={`w-full justify-center pt-2.5 pb-1 sm:hidden shrink-0 ${centered ? 'hidden' : 'flex'}`}>
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e3dd] dark:border-slate-800 bg-[#fffdfa]/95 dark:bg-[#1E293B]/95 backdrop-blur sticky top-0 z-20 shrink-0 min-w-0">
          <h2 id={titleId} className="hounigo-title text-lg dark:text-slate-100 truncate break-words min-w-0 mr-3">{title}</h2>
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
            padding: '1.25rem 1.5rem max(1.5rem, env(safe-area-inset-bottom, 1.5rem)) 1.5rem',
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
