import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  icon: React.ReactNode;
  onAction?: () => void;
  accentVariant?: 'amber' | 'purple' | 'sky';
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
      icon: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
    },
    purple: {
      icon: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
      btn: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
    },
    sky: {
      icon: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
      btn: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
    }
  }[accentVariant];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800/80 my-auto min-h-[300px]">
      <div className={"w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-inner border " + accentClasses.icon}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed font-normal">
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
