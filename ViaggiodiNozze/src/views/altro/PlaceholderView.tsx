

interface PlaceholderViewProps {
  title: string;
  icon: string;
  onBack: () => void;
}

export default function PlaceholderView({ title, icon, onBack }: PlaceholderViewProps) {
  return (
    <div className="flex flex-col h-full animate-fade-in pb-10">
      <header className="flex items-center gap-3 mb-6 px-1">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>{icon}</span> {title}
        </h1>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl mb-4 shadow-sm border border-slate-200/60">
          {icon}
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Gestione in arrivo</h2>
        <p className="text-sm text-slate-500 max-w-xs">
          Questa sezione ({title}) è attualmente in fase di sviluppo e sarà disponibile nei prossimi aggiornamenti.
        </p>
      </div>
    </div>
  );
}
