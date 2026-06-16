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
import { useState, useRef, useEffect } from "react";
import { Button, Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { verify_totp_login, TotpVerifyResponse } from "@/services/api/totp";

const TOTP_CODE_LENGTH = 6;

interface TotpVerificationProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_backup_code: () => void;
  on_use_passkey?: () => void;
  on_cancel: () => void;
  remember_me?: boolean;
}

export function TotpVerification({
  pending_login_token,
  on_success,
  on_use_backup_code,
  on_use_passkey,
  on_cancel,
  remember_me = true,
}: TotpVerificationProps) {
  const { t } = use_i18n();
  const [code, set_code] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [trust_device, set_trust_device] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const verifying_ref = useRef(false);

  const handle_verify = async () => {
    if (code.length !== TOTP_CODE_LENGTH || verifying_ref.current) return;

    verifying_ref.current = true;
    set_is_loading(true);
    set_error("");

    const response = await verify_totp_login({
      code,
      pending_login_token,
      trust_device,
      remember_me,
    });

    if (response.error) {
      set_error(response.error);
      verifying_ref.current = false;
      set_is_loading(false);
      input_ref.current?.focus();
      input_ref.current?.select();

      return;
    }

    if (response.data) {
      verifying_ref.current = false;
      set_is_loading(false);
      on_success(response.data);

      return;
    }

    verifying_ref.current = false;
    set_is_loading(false);
  };

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  const handle_change = (value: string) => {
    set_code(value.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH));
    if (error) set_error("");
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Enter") handle_verify();
  };

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
          {t("auth.two_factor_auth_title")}
        </h2>
        <p className="text-sm text-txt-muted">{t("auth.enter_2fa_code")}</p>
      </div>

      <div className="space-y-4">
        <Input
          ref={input_ref}
          autoComplete="one-time-code"
          className="text-center text-2xl font-semibold tracking-[0.5em]"
          disabled={is_loading}
          inputMode="numeric"
          maxLength={TOTP_CODE_LENGTH}
          placeholder="000000"
          status={error ? "error" : "default"}
          type="text"
          value={code}
          onChange={(e) => handle_change(e.target.value)}
          onKeyDown={handle_key_down}
        />

        <label className="flex items-center justify-center gap-2 text-sm text-txt-muted cursor-pointer select-none">
          <Checkbox
            checked={trust_device}
            disabled={is_loading}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              set_trust_device(e.target.checked)
            }
          />
          {t("auth.trust_this_device_30_days")}
        </label>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}

        <Button
          className="w-full"
          disabled={is_loading || code.length !== TOTP_CODE_LENGTH}
          variant="depth"
          onClick={handle_verify}
        >
          {is_loading ? t("common.verifying") : t("common.continue")}
        </Button>

        <Button className="w-full" variant="outline" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>

        <button
          className="w-full text-sm text-center transition-colors hover:opacity-80 text-txt-muted"
          type="button"
          onClick={on_use_backup_code}
        >
          {t("auth.use_backup_code_instead")}
        </button>

        {on_use_passkey && (
          <button
            className="w-full text-sm text-center transition-colors hover:opacity-80 text-txt-muted"
            type="button"
            onClick={on_use_passkey}
          >
            {t("auth.use_passkey_instead")}
          </button>
        )}
      </div>
    </div>
  );
}
