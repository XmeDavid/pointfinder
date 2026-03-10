import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex h-[200px] items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-sm text-destructive">
          Something went wrong. Please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Full-screen error fallback for the app-level ErrorBoundary.
 * Shows a centered message with a reload button.
 */
export function AppErrorFallback() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Please reload the page.</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Reload
      </button>
    </div>
  );
}
