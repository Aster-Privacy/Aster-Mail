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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useRef, useEffect } from "react";
import { ArrowRightIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Modal, ModalBody } from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { start_oauth_authorize } from "@/services/api/external_accounts";
import {
  DESKTOP_OAUTH_CALLBACK_EVENT,
  DESKTOP_OAUTH_RETURN_TO,
  expect_oauth_state,
  type DesktopOAuthCallbackDetail,
} from "@/native/desktop_oauth_bridge";

function is_tauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

const REASON_KEY_MAP: Record<string, TranslationKey> = {
  provider_denied: "settings.oauth_reason_provider_denied",
  missing_code: "settings.oauth_reason_missing_code",
  missing_state: "settings.oauth_reason_missing_state",
  internal_error: "settings.oauth_reason_internal_error",
  invalid_provider: "settings.oauth_reason_invalid_provider",
  provider_not_configured: "settings.oauth_reason_provider_not_configured",
  token_exchange_failed: "settings.oauth_reason_token_exchange_failed",
  encryption_error: "settings.oauth_reason_encryption_error",
  account_creation_failed: "settings.oauth_reason_account_creation_failed",
  email_not_found: "settings.oauth_reason_email_not_found",
  invalid_state: "settings.oauth_reason_session_expired",
  expired_state: "settings.oauth_reason_session_expired",
  wrong_account: "settings.oauth_reason_wrong_account",
};

export type ConnectProvider = "google" | "microsoft" | "yahoo";

interface ConnectProviderModalProps {
  provider: ConnectProvider | null;
  on_close: () => void;
  on_oauth_success?: (provider: string) => void;
}

interface ProviderTheme {
  icon: React.ReactNode;
  name_key:
    | "settings.connect_provider_name_google"
    | "settings.connect_provider_name_microsoft"
    | "settings.connect_provider_name_yahoo";
  button_key:
    | "settings.connect_sign_in_google"
    | "settings.connect_sign_in_microsoft"
    | "settings.connect_sign_in_yahoo";
}

const PROVIDER_THEME: Record<ConnectProvider, ProviderTheme> = {
  google: {
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-9 h-9 object-contain"
        src="/providers/gmail_logo.svg"
      />
    ),
    name_key: "settings.connect_provider_name_google",
    button_key: "settings.connect_sign_in_google",
  },
  microsoft: {
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-9 h-9 object-contain"
        src="/providers/outlook_logo.svg"
      />
    ),
    name_key: "settings.connect_provider_name_microsoft",
    button_key: "settings.connect_sign_in_microsoft",
  },
  yahoo: {
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-9 h-9 object-contain"
        src="/providers/yahoo_mail_logo.svg"
      />
    ),
    name_key: "settings.connect_provider_name_yahoo",
    button_key: "settings.connect_sign_in_yahoo",
  },
};

export function ConnectProviderModal({
  provider,
  on_close,
  on_oauth_success,
}: ConnectProviderModalProps) {
  const { t } = use_i18n();
  const [is_loading, set_is_loading] = useState(false);
  // Tears down the OAuth popup listener/timers without touching component state.
  // Held in a ref so it can run if the modal unmounts mid-flow (e.g. cancelled
  // while the popup is still open), preventing a leaked listener/interval.
  const teardown_ref = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      teardown_ref.current?.();
      teardown_ref.current = null;
    };
  }, []);

  // The modal is kept mounted by its parent and toggled via `provider`. When it
  // is closed (provider cleared), tear down any in-flight OAuth listener/timers
  // and reset the loading state so reopening starts clean.
  useEffect(() => {
    if (!provider) {
      teardown_ref.current?.();
      teardown_ref.current = null;
      set_is_loading(false);
    }
  }, [provider]);

  if (!provider) return null;

  const theme = PROVIDER_THEME[provider];
  const desktop = is_tauri();

  const handle_connect = async () => {
    set_is_loading(true);
    try {
      const tag_token = new Uint8Array(32);

      window.crypto.getRandomValues(tag_token);
      const result = await start_oauth_authorize(
        provider,
        tag_token,
        desktop ? { return_to: DESKTOP_OAUTH_RETURN_TO } : undefined,
      );

      if (result.error) {
        show_toast(
          t("settings.oauth_import_error", { reason: result.error }),
          "error",
        );
        set_is_loading(false);

        return;
      }
      if (!result.data?.authorize_url) {
        show_toast(
          t("settings.oauth_import_error", {
            reason: t("settings.oauth_reason_unknown"),
          }),
          "error",
        );
        set_is_loading(false);

        return;
      }

      let parsed: URL;

      try {
        parsed = new URL(result.data.authorize_url);
        if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
      } catch {
        show_toast(
          t("settings.oauth_import_error", {
            reason: t("settings.oauth_reason_unknown"),
          }),
          "error",
        );
        set_is_loading(false);

        return;
      }

      if (desktop && !expect_oauth_state(parsed.toString())) {
        show_toast(
          t("settings.oauth_import_error", {
            reason: t("settings.oauth_reason_unknown"),
          }),
          "error",
        );
        set_is_loading(false);

        return;
      }

      if (desktop) {
        let desktop_finished = false;

        const handle_desktop_callback = (event: Event) => {
          const detail = (event as CustomEvent<DesktopOAuthCallbackDetail>)
            .detail;

          if (desktop_finished || !detail) return;
          desktop_finished = true;
          teardown_desktop();
          teardown_ref.current = null;
          set_is_loading(false);
          if (detail.status === "success") {
            on_oauth_success?.(detail.provider || provider);
            on_close();

            return;
          }
          show_toast(
            t("settings.oauth_import_error", {
              reason: t(
                REASON_KEY_MAP[detail.reason ?? ""] ||
                  "settings.oauth_reason_unknown",
              ),
            }),
            "error",
          );
        };

        const teardown_desktop = () => {
          window.removeEventListener(
            DESKTOP_OAUTH_CALLBACK_EVENT,
            handle_desktop_callback,
          );
        };

        window.addEventListener(
          DESKTOP_OAUTH_CALLBACK_EVENT,
          handle_desktop_callback,
        );
        teardown_ref.current = teardown_desktop;

        try {
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url: parsed.toString() });
        } catch {
          teardown_desktop();
          teardown_ref.current = null;
          show_toast(
            t("settings.oauth_import_error", {
              reason: t("settings.oauth_reason_unknown"),
            }),
            "error",
          );
          set_is_loading(false);
        }

        return;
      }

      // Try to open a popup so the main window state is preserved.
      const popup = window.open(
        parsed.toString(),
        "aster_oauth",
        "width=600,height=700,scrollbars=yes,resizable=yes",
      );

      if (!popup) {
        // Popup blocked - fall back to full-page redirect.
        window.location.replace(parsed.toString());

        return;
      }

      let finished = false;

      let close_timeout: number | undefined;

      const teardown = () => {
        window.removeEventListener("message", handle_message);
        window.clearInterval(poll_id);
        if (close_timeout !== undefined) window.clearTimeout(close_timeout);
      };

      const cleanup = (
        success: boolean,
        oauth_provider?: string,
        reason?: string,
      ) => {
        if (finished) return;
        finished = true;
        teardown();
        teardown_ref.current = null;
        set_is_loading(false);
        if (success && oauth_provider) {
          on_oauth_success?.(oauth_provider);
          on_close();
        } else if (!success && reason) {
          const i18n_key =
            REASON_KEY_MAP[reason] || "settings.oauth_reason_unknown";

          show_toast(
            t("settings.oauth_import_error", {
              reason: t(i18n_key),
            }),
            "error",
          );
        }
      };

      const handle_message = (event: MessageEvent) => {
        if (event.source !== popup) return;
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "oauth_callback") return;
        if (event.data.status === "success") {
          cleanup(true, event.data.provider as string);
        } else {
          cleanup(false, undefined, (event.data.reason as string) || "unknown");
        }
      };

      window.addEventListener("message", handle_message);

      // Detect user closing the popup without completing OAuth. The popup closes
      // itself right after posting a success message, so wait briefly for that
      // message to arrive before treating a closed popup as a cancellation.
      const poll_id = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll_id);
          close_timeout = window.setTimeout(
            () => cleanup(false, undefined, undefined),
            700,
          );
        }
      }, 500);

      // If the modal unmounts before OAuth resolves, this removes the listener
      // and timers (no state updates on the dead component).
      teardown_ref.current = teardown;
    } catch {
      show_toast(
        t("settings.oauth_import_error", {
          reason: t("settings.oauth_reason_unknown"),
        }),
        "error",
      );
      set_is_loading(false);
    }
  };

  return (
    <Modal is_open={true} on_close={on_close} size="md">
      <ModalBody className="p-0">
        <div className="flex flex-col items-center px-8 pt-10 pb-8">
          <div className="flex items-center justify-center gap-5 mb-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary">
              {theme.icon}
            </div>
            <ArrowRightIcon className="w-5 h-5 text-txt-muted rtl:-scale-x-100" />
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary overflow-hidden">
              <img
                alt="Aster"
                className="w-10 h-10 object-contain"
                src="/mail_logo.png"
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-txt-primary text-center">
            {t("settings.connect_modal_title", {
              provider: t(theme.name_key),
            })}
          </h2>
          <p className="mt-2 text-sm text-txt-secondary text-center max-w-sm leading-relaxed">
            {t("settings.connect_modal_description", {
              provider: t(theme.name_key),
            })}
          </p>

          <Button
            className="mt-8 w-full"
            disabled={is_loading}
            variant="depth"
            onClick={handle_connect}
          >
            {t(theme.button_key)}
            {is_loading && <ButtonSpinner className="text-current" />}
          </Button>

          <Button
            className="mt-3 w-full"
            disabled={is_loading && !desktop}
            variant="outline"
            onClick={on_close}
          >
            {t("common.cancel")}
          </Button>

          <div className="mt-6 flex items-start gap-2 text-xs text-txt-muted leading-relaxed">
            <LockClosedIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              {t("settings.connect_modal_privacy_note", {
                provider: t(theme.name_key),
              })}
            </p>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
