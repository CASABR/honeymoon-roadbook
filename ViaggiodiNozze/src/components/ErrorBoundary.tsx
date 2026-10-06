import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-900">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-rose-100 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-3xl mb-2">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-rose-600">Ops! Qualcosa è andato storto.</h1>
            <p className="text-sm text-slate-600 mb-4">
              C'è stato un errore nel caricamento dell'app.
            </p>
            <div className="p-4 bg-slate-100 rounded-xl text-left overflow-auto text-xs font-mono text-slate-700 max-h-40 border border-slate-200">
              {this.state.error?.message || 'Errore sconosciuto'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors w-full"
            >
              Ricarica l'App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
