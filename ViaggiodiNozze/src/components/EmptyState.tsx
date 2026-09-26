import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  icon: React.ReactNode;
  onAction?: () => void;
  accentVariant?: 'amber' | 'purple' | 'sky' | 'rose';
}

export default function EmptyState({
  title,
  description,
  actionLabel = 'Aggiungi',
  icon,
  onAction,
  accentVariant = 'amber'
}: EmptyStateProps) {
  const accentClasses = {
    amber: {
      icon: 'text-amber-600 border-amber-200 bg-amber-50',
      btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
    },
    purple: {
      icon: 'text-purple-600 border-purple-200 bg-purple-50',
      btn: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
    },
    sky: {
      icon: 'text-sky-600 border-sky-200 bg-sky-50',
      btn: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
    },
    rose: {
      icon: 'text-rose-600 border-rose-200 bg-rose-50',
      btn: 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
    }
  }[accentVariant];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-3xl bg-white border border-slate-200/80 shadow-sm my-auto min-h-[280px]">
      <div className={"w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border " + accentClasses.icon}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed font-normal">
        {description}
      </p>
      {onAction && (
        <button 
          type="button"
          onClick={onAction}
          className={"inline-flex items-center justify-center gap-2 h-11 px-6 font-semibold text-sm rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer " + accentClasses.btn}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
