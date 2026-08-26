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
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { TotpVerifyResponse } from "@/services/api/totp";
import {
  initiate_webauthn_assertion,
  perform_webauthn_assertion,
  WebAuthnAssertionOptions,
  WEBAUTHN_PROMPT_DISMISSED,
} from "@/services/api/webauthn";

const OPTIONS_MAX_AGE_MS = 90_000;

interface WebauthnVerificationProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_other_method: () => void;
  on_cancel: () => void;
  remember_me?: boolean;
}

export function WebauthnVerification({
  pending_login_token,
  on_success,
  on_use_other_method,
  on_cancel,
  remember_me = true,
}: WebauthnVerificationProps) {
  const { t } = use_i18n();
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState("");
  const [needs_gesture, set_needs_gesture] = useState(false);
  const has_started = useRef(false);
  const options_ref = useRef<WebAuthnAssertionOptions | null>(null);
  const options_at_ref = useRef(0);
  const in_flight_ref = useRef<Promise<string> | null>(null);

  const load_options = useCallback(async (): Promise<string> => {
    const response = await initiate_webauthn_assertion(pending_login_token);

    if (response.error || !response.data) {
      options_ref.current = null;

      return response.error || t("common.something_went_wrong");
    }

    options_ref.current = response.data;
    options_at_ref.current = Date.now();

    return "";
  }, [pending_login_token, t]);

  const ensure_options = useCallback(async (): Promise<string> => {
    if (
      options_ref.current &&
      Date.now() - options_at_ref.current < OPTIONS_MAX_AGE_MS
    ) {
      return "";
    }

    if (!in_flight_ref.current) {
      in_flight_ref.current = load_options();
    }

    const load_error = await in_flight_ref.current;

    in_flight_ref.current = null;

    return load_error;
  }, [load_options]);

  const run_assertion = useCallback(
    async (is_auto_start: boolean) => {
      set_is_loading(true);
      set_error("");
      set_needs_gesture(false);

      const load_error = await ensure_options();
      const options = options_ref.current;

      if (load_error || !options) {
        set_error(load_error || t("common.something_went_wrong"));
        set_is_loading(false);

        return;
      }

      const result = await perform_webauthn_assertion(
        options,
        pending_login_token,
        remember_me,
      );

      options_ref.current = null;

      if (result.data) {
        set_is_loading(false);
        on_success(result.data);

        return;
      }

      set_is_loading(false);
      if (result.server_code === WEBAUTHN_PROMPT_DISMISSED) {
        set_needs_gesture(true);
        if (!is_auto_start) {
          set_error(result.error || "");
        }
      } else {
        set_error(result.error || t("common.something_went_wrong"));
      }

      ensure_options();
    },
    [ensure_options, pending_login_token, on_success, remember_me, t],
  );

  useEffect(() => {
    if (has_started.current) return;
    has_started.current = true;
    run_assertion(true);
  }, [run_assertion]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <img
            alt="Aster"
            className="h-10"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
          />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-txt-primary">
          {t("auth.passkey_verification")}
        </h2>
        <p className="text-sm text-txt-muted">{t("auth.use_passkey_or_key")}</p>
      </div>

      <div className="space-y-4">
        {is_loading && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 rounded-full animate-spin border-edge-secondary border-t-brand" />
          </div>
        )}

        {!is_loading && (error || needs_gesture) && (
          <div className="space-y-3">
            {error && (
              <p className="text-sm text-center text-red-500">{error}</p>
            )}
            <Button
              className="w-full"
              variant="depth"
              onClick={() => run_assertion(false)}
            >
              {needs_gesture
                ? t("auth.passkey_sign_in")
                : t("common.try_again")}
            </Button>
          </div>
        )}

        <Button className="w-full" variant="outline" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>

        <button
          className="w-full text-sm text-center transition-colors hover:opacity-80 text-txt-muted"
          type="button"
          onClick={on_use_other_method}
        >
          {t("auth.use_another_method")}
        </button>
      </div>
    </div>
  );
}
