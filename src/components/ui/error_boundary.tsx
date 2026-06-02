//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { Component, ReactNode } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { open_external } from "@/utils/open_link";
import { use_i18n } from "@/lib/i18n/context";

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
        <ErrorBoundaryFallback
          error={error}
          on_retry={() => this.setState({ has_error: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorBoundaryFallback({
  error,
  on_retry,
}: {
  error: Error | null;
  on_retry: () => void;
}) {
  const { t } = use_i18n();

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
        {t("common.something_went_wrong")}
      </div>
      <div className="text-xs mb-4">{t("common.unexpected_error_refresh")}</div>
      <div className="flex gap-2">
        <Button size="md" variant="depth" onClick={on_retry}>
          {t("common.try_again")}
        </Button>
        <Button
          size="md"
          variant="secondary"
          onClick={() => open_external("https://status.astermail.org/")}
        >
          {t("common.view_status")}
        </Button>
      </div>
      {error && <ErrorDetails error={error} />}
    </div>
  );
}

function ErrorDetails({ error }: { error: Error }) {
  const { t } = use_i18n();
  const handle_copy = async () => {
    const error_text = `${error.message}${error.stack ? `\n\n${error.stack}` : ""}`;

    try {
      await navigator.clipboard.writeText(error_text);
      show_toast(t("common.error_copied_to_clipboard"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_copy"), "error");
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
          {t("common.error_details")}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-[12px] text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            style={{ color: "var(--text-muted)" }}
            type="button"
            onClick={handle_copy}
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
            <span>{t("common.copy")}</span>
          </button>
        </div>
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
  const { t } = use_i18n();

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8 text-center"
      style={{ color: "var(--text-secondary)" }}
    >
      <div
        className="text-base font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {t("common.unable_to_display_email")}
      </div>
      <div className="text-sm mb-4 max-w-md">
        {t("common.email_render_error")}
      </div>
      {on_retry && (
        <button
          className="px-4 py-2 text-sm rounded-[14px] transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "white",
          }}
          onClick={on_retry}
        >
          {t("common.try_again")}
        </button>
      )}
    </div>
  );
}

export function ComposeErrorFallback() {
  const { t } = use_i18n();

  return (
    <div
      className="flex flex-col items-center justify-center h-64 p-8 text-center"
      style={{ color: "var(--text-secondary)" }}
    >
      <div
        className="text-base font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {t("common.unable_to_load_composer")}
      </div>
      <div className="text-sm mb-4 max-w-md">
        {t("common.composer_load_error")}
      </div>
    </div>
  );
}
