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
import {
  ChunkRecoveryFallbackView,
  ComposeErrorFallbackView,
  EmailErrorFallbackView,
  ErrorBoundaryView,
} from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import { show_toast } from "@/components/toast/simple_toast";
import { open_external } from "@/utils/open_link";
import { use_i18n } from "@/lib/i18n/context";
import {
  error_message_of,
  is_chunk_load_error,
  trigger_chunk_recovery,
} from "@/lib/chunk_recovery";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  on_error?: (error: Error, error_info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  has_error: boolean;
  error: Error | null;
  is_recovering: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { has_error: false, error: null, is_recovering: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { has_error: true, error, is_recovering: false };
  }

  componentDidCatch(error: Error, error_info: React.ErrorInfo): void {
    if (is_chunk_load_error(error_message_of(error))) {
      if (trigger_chunk_recovery()) this.setState({ is_recovering: true });
    }

    this.props.on_error?.(error, error_info);
  }

  render(): ReactNode {
    if (this.state.has_error) {
      if (this.state.is_recovering) {
        return <ChunkRecoveryFallback />;
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      const error = this.state.error;

      return (
        <ErrorBoundaryFallback
          error={error}
          on_retry={() =>
            this.setState({
              has_error: false,
              error: null,
              is_recovering: false,
            })
          }
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

  const handle_copy = async (error_text: string) => {
    try {
      await copy_text_or_throw(error_text);
      show_toast(t("common.error_copied_to_clipboard"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  return (
    <ErrorBoundaryView
      copy_label={t("common.copy")}
      description={t("common.unexpected_error_refresh")}
      details_title={t("common.error_details")}
      error={error}
      retry_label={t("common.try_again")}
      status_label={t("common.view_status")}
      title={t("common.something_went_wrong")}
      on_copy_error={handle_copy}
      on_retry={on_retry}
      on_view_status={() => open_external("https://status.astermail.org/")}
    />
  );
}

interface EmailErrorFallbackProps {
  on_retry?: () => void;
}

export function EmailErrorFallback({ on_retry }: EmailErrorFallbackProps) {
  const { t } = use_i18n();

  return (
    <EmailErrorFallbackView
      description={t("common.email_render_error")}
      retry_label={t("common.try_again")}
      title={t("common.unable_to_display_email")}
      on_retry={on_retry}
    />
  );
}

export function ComposeErrorFallback() {
  const { t } = use_i18n();

  return (
    <ComposeErrorFallbackView
      description={t("common.composer_load_error")}
      title={t("common.unable_to_load_composer")}
    />
  );
}

function ChunkRecoveryFallback() {
  const { t } = use_i18n();

  return <ChunkRecoveryFallbackView label={t("common.loading")} />;
}
