import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Errore imprevisto durante il caricamento della vista.'
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[RouteErrorBoundary] Errore componente intercettato:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm my-6 mx-2 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-2xl mb-3">
            ⚠️
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight mb-1">
            {this.props.fallbackTitle || 'Impossibile caricare la sezione'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4 leading-relaxed">
            Si è verificato un problema di caricamento dinamico della vista. Puoi riprovare immediatamente.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-xl bg-[#172033] dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              🔄 Riprova
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all active:scale-95 cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              Ricarica app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
