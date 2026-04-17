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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aster/ui";

import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  verify_device_code,
  confirm_device_code,
} from "@/services/api/devices";
import {
  seal_vault_key_for_device,
  base64url_encode,
  base64url_decode,
} from "@/lib/crypto/device_envelope";
import { get_passphrase_from_memory } from "@/services/crypto/memory_key_store";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";

type PageState =
  | "input"
  | "confirming_device"
  | "sealing"
  | "success"
  | "error";

interface DeviceInfo {
  machine_name: string;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
}

export default function LinkDevice() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { is_authenticated, is_loading: auth_loading, has_keys } = use_auth();

  const [page_state, set_page_state] = useState<PageState>("input");
  const [code_input, set_code_input] = useState("");
  const [device_info, set_device_info] = useState<DeviceInfo | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_verifying, set_is_verifying] = useState(false);

  useEffect(() => {
    document.title = `${t("auth.link_device_title") || "Link device"} | ${t("common.aster_mail")}`;
  }, [t]);

  useEffect(() => {
    if (auth_loading) return;
    if (!is_authenticated) {
      const next = encodeURIComponent(window.location.pathname);

      navigate(`/sign-in?next=${next}`, { replace: true });
    }
  }, [auth_loading, is_authenticated, navigate]);

  const format_code_input = (raw: string): string => {
    const clean = raw
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8);

    if (clean.length > 4) {
      return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }

    return clean;
  };

  const handle_code_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    set_code_input(format_code_input(e.target.value));
    set_error(null);
  };

  const handle_verify = async () => {
    const normalized = code_input.replace(/-/g, "");

    if (normalized.length !== 8) {
      set_error(
        t("auth.link_device_invalid_code") ||
          "Please enter a valid 8-character code.",
      );

      return;
    }

    set_is_verifying(true);
    set_error(null);

    try {
      const response = await verify_device_code(normalized);

      if (response.error || !response.data) {
        set_error(
          t("auth.link_device_expired_code") ||
            "Invalid or expired code. Check the code on your desktop app and try again.",
        );
        set_is_verifying(false);

        return;
      }

      set_device_info(response.data);
      set_page_state("confirming_device");
    } catch {
      set_error(
        t("auth.link_device_failed") ||
          "Something went wrong. Please try again.",
      );
    } finally {
      set_is_verifying(false);
    }
  };

  const handle_confirm = async () => {
    if (!device_info) return;

    set_page_state("sealing");
    set_error(null);

    try {
      const passphrase = get_passphrase_from_memory();

      if (!passphrase) {
        throw new Error("vault_locked");
      }

      const passphrase_bytes = new TextEncoder().encode(passphrase);
      const envelope = await seal_vault_key_for_device(
        passphrase_bytes,
        base64url_decode(device_info.ed25519_pk),
        base64url_decode(device_info.mlkem_pk),
        base64url_decode(device_info.x25519_pk),
      );

      const envelope_b64 = base64url_encode(envelope);
      const normalized = code_input.replace(/-/g, "");

      const response = await confirm_device_code(normalized, envelope_b64);

      if (response.error) {
        throw new Error(response.error);
      }

      set_page_state("success");
    } catch (err) {
      const message =
        err instanceof Error && err.message === "vault_locked"
          ? t("common.session_expired_sign_in")
          : t("auth.link_device_failed") || "Linking failed. Please try again.";

      set_error(message);
      show_toast(message, "error");
      set_page_state("confirming_device");
    }
  };

  const handle_cancel = () => {
    set_device_info(null);
    set_page_state("input");
    set_code_input("");
    set_error(null);
  };

  if (auth_loading || !is_authenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surf-primary">
        <Spinner size="md" />
      </div>
    );
  }

  if (!has_keys) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center w-full max-w-sm text-center">
            <h1 className="text-xl font-semibold text-txt-primary">
              {t("auth.link_device_title") || "Link device"}
            </h1>
            <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
              {t("common.session_expired_sign_in")}
            </p>
            <Button
              className="w-full mt-8"
              size="xl"
              variant="depth"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.sign_in")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (page_state === "success") {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center w-full max-w-sm text-center">
            <img
              alt="Aster"
              className="h-10 mb-8"
              decoding="async"
              src="/text_logo.png"
            />
            <svg
              className="h-10 w-10 text-green-500 mb-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M5 13l4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h1 className="text-xl font-semibold text-txt-primary">
              {t("auth.link_device_success") || "Device linked"}
            </h1>
            <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
              {t("auth.link_device_success_description") ||
                "Your desktop app is now linked. You can close this tab."}
            </p>
            <Button
              className="w-full mt-8"
              size="xl"
              variant="secondary"
              onClick={() => window.close()}
            >
              {t("common.done") || "Done"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (page_state === "sealing") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surf-primary">
        <div className="flex flex-col items-center">
          <Spinner size="md" />
          <p className="text-sm mt-4 text-txt-secondary">
            {t("auth.link_device_confirming") || "Linking device..."}
          </p>
        </div>
      </div>
    );
  }

  if (page_state === "confirming_device" && device_info) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
        <div className="min-h-full flex items-center justify-center px-4 py-8">
          <div className="flex flex-col items-center w-full max-w-sm">
            <img
              alt="Aster"
              className="h-10 mb-8"
              decoding="async"
              src="/text_logo.png"
            />
            <h1 className="text-xl font-semibold text-txt-primary text-center">
              {t("auth.link_device_title") || "Link device"}
            </h1>
            <p className="text-sm mt-4 leading-relaxed text-txt-secondary text-center">
              {t("auth.link_device_confirm_prompt") ||
                "Do you want to link this device to your account?"}
            </p>

            <div className="w-full rounded-xl border border-border-secondary bg-surf-secondary px-5 py-4 mt-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10">
                  <svg
                    className="h-5 w-5 text-txt-secondary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {device_info.machine_name}
                  </p>
                  <p className="text-xs text-txt-quaternary">
                    {t("auth.link_device_desktop") || "Desktop app"}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm mt-4 text-center text-red-500">{error}</p>
            )}

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_confirm}
            >
              {t("auth.link_device_confirm_button") || "Link device"}
            </Button>
            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={handle_cancel}
            >
              {t("auth.link_device_cancel") || "Cancel"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center w-full max-w-sm">
          <img
            alt="Aster"
            className="h-10 mb-8"
            decoding="async"
            src="/text_logo.png"
          />
          <h1 className="text-xl font-semibold text-txt-primary text-center">
            {t("auth.link_device_title") || "Link device"}
          </h1>
          <p className="text-sm mt-3 mb-6 leading-relaxed text-txt-tertiary text-center">
            {t("auth.link_device_enter_code") ||
              "Enter the code shown on your desktop app."}
          </p>

          <input
            autoFocus
            autoComplete="off"
            className="w-full rounded-xl border border-border-secondary bg-surf-secondary px-5 py-4 text-center text-2xl font-mono font-bold tracking-[0.15em] text-txt-primary placeholder:text-txt-quaternary placeholder:font-normal placeholder:text-xl placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            maxLength={9}
            placeholder={t("auth.link_device_code_placeholder") || "XXXX-XXXX"}
            spellCheck={false}
            type="text"
            value={code_input}
            onChange={handle_code_change}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_verify();
            }}
          />

          {error && (
            <p className="text-sm mt-3 text-center text-red-500">{error}</p>
          )}

          <Button
            className="w-full mt-6"
            disabled={is_verifying || code_input.replace(/-/g, "").length < 8}
            size="xl"
            variant="depth"
            onClick={handle_verify}
          >
            {is_verifying ? (
              <>
                <Spinner className="mr-2" size="sm" />
                {t("auth.link_device_verifying") || "Verifying..."}
              </>
            ) : (
              t("auth.link_device_verify_button") || "Continue"
            )}
          </Button>
          <Button
            className="w-full mt-3"
            size="xl"
            variant="secondary"
            onClick={() => navigate("/")}
          >
            {t("auth.link_device_cancel") || "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
