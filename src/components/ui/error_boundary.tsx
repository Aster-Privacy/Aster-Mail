import { Component, ReactNode } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { show_toast } from "@/components/toast/simple_toast";

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

      const error = this.state.error;

      return (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <img
            alt="Aster"
            className="h-10 mb-4"
            draggable={false}
            src="/text_logo.png"
          />
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
          {error && <ErrorDetails error={error} />}
        </div>
      );
    }

    return this.props.children;
  }
}

function ErrorDetails({ error }: { error: Error }) {
  const handle_copy = async () => {
    const error_text = `${error.message}${error.stack ? `\n\n${error.stack}` : ""}`;

    try {
      await navigator.clipboard.writeText(error_text);
      show_toast("Error copied to clipboard", "success");
    } catch {
      show_toast("Failed to copy", "error");
    }
  };

  return (
    <div
      className="mt-6 max-w-lg w-full rounded-lg overflow-hidden"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-secondary)" }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Error Details
        </span>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          style={{ color: "var(--text-muted)" }}
          type="button"
          onClick={handle_copy}
        >
          <ClipboardDocumentIcon className="w-3.5 h-3.5" />
          <span>Copy</span>
        </button>
      </div>
      <div className="p-3 overflow-auto max-h-40">
        <pre
          className="text-xs whitespace-pre-wrap break-words font-mono"
          style={{ color: "var(--text-secondary)" }}
        >
          {error.message}
          {error.stack && `\n\n${error.stack}`}
        </pre>
      </div>
    </div>
  );
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
