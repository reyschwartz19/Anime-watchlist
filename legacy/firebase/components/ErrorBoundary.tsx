import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-fade-in-up">
            <div className="bg-red-500/10 p-4 rounded-full inline-block mb-4">
                <AlertTriangle className="w-12 h-12 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-slate-400 mb-6 text-sm">
              {this.state.error?.message || "An unexpected error occurred while rendering the application."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-lg transition flex items-center justify-center space-x-2 w-full active:scale-95 transform"
            >
              <RefreshCw size={18} />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}