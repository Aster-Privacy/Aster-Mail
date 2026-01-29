import { Component, ReactNode } from "react";

import { Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  on_error?: (error: Error, error_info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  has_error: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { has_error: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { has_error: true, error };
  }

  componentDidCatch(error: Error, error_info: React.ErrorInfo): void {
    this.props.on_error?.(error, error_info);
  }

  render(): ReactNode {
    if (this.state.has_error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <Logo className="w-10 h-10 mb-4" style={{ color: "var(--text-primary)" }} />
          <div
            className="text-sm font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Something went wrong
          </div>
          <div className="text-xs mb-4">
            An unexpected error occurred. Please try refreshing the page.
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => this.setState({ has_error: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface EmailErrorFallbackProps {
  on_retry?: () => void;
}

export function EmailErrorFallback({ on_retry }: EmailErrorFallbackProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8 text-center"
      style={{ color: "var(--text-secondary)" }}
    >
      <div
        className="text-base font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Unable to display email
      </div>
      <div className="text-sm mb-4 max-w-md">
        There was a problem rendering this email. The content may be corrupted
        or in an unsupported format.
      </div>
      {on_retry && (
        <button
          className="px-4 py-2 text-sm rounded-lg transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "white",
          }}
          onClick={on_retry}
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function ComposeErrorFallback() {
  return (
    <div
      className="flex flex-col items-center justify-center h-64 p-8 text-center"
      style={{ color: "var(--text-secondary)" }}
    >
      <div
        className="text-base font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Unable to load composer
      </div>
      <div className="text-sm mb-4 max-w-md">
        There was a problem loading the email composer. Please close this dialog
        and try again.
      </div>
    </div>
  );
}
