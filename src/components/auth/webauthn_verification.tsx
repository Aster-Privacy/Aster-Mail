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
import { useState, useEffect, useCallback } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { TotpVerifyResponse } from "@/services/api/totp";
import {
  initiate_webauthn_assertion,
  perform_webauthn_assertion,
} from "@/services/api/webauthn";

interface WebauthnVerificationProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_other_method: () => void;
  on_cancel: () => void;
}

export function WebauthnVerification({
  pending_login_token,
  on_success,
  on_use_other_method,
  on_cancel,
}: WebauthnVerificationProps) {
  const { t } = use_i18n();
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");

  const start_assertion = useCallback(async () => {
    set_is_loading(true);
    set_error("");

    const options_response =
      await initiate_webauthn_assertion(pending_login_token);

    if (options_response.error || !options_response.data) {
      set_error(options_response.error || t("common.something_went_wrong"));
      set_is_loading(false);

      return;
    }

    const result = await perform_webauthn_assertion(
      options_response.data,
      pending_login_token,
    );

    if (result.error) {
      set_error(result.error);
      set_is_loading(false);

      return;
    }

    if (result.data) {
      set_is_loading(false);
      on_success(result.data);

      return;
    }

    set_is_loading(false);
  }, [pending_login_token, on_success, t]);

  useEffect(() => {
    start_assertion();
  }, [start_assertion]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <img
            alt="Aster"
            className="h-10"
            decoding="async"
            src="/text_logo.png"
          />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-txt-primary">
          {t("auth.security_key_verification")}
        </h2>
        <p className="text-sm text-txt-muted">{t("auth.tap_security_key")}</p>
      </div>

      <div className="space-y-4">
        {is_loading && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 rounded-full animate-spin border-edge-secondary border-t-brand" />
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <p className="text-sm text-center text-red-500">{error}</p>
            <Button
              className="w-full"
              variant="depth"
              onClick={start_assertion}
            >
              {t("common.try_again")}
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
