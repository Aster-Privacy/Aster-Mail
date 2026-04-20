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
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { verify_totp_login, TotpVerifyResponse } from "@/services/api/totp";

interface TotpVerificationProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_backup_code: () => void;
  on_cancel: () => void;
}

export function TotpVerification({
  pending_login_token,
  on_success,
  on_use_backup_code,
  on_cancel,
}: TotpVerificationProps) {
  const { t } = use_i18n();
  const [code, set_code] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [trust_device, set_trust_device] = useState(false);
  const input_refs = useRef<(HTMLInputElement | null)[]>([]);

  const handle_verify = useCallback(async () => {
    if (code.length !== 6) return;

    set_is_loading(true);
    set_error("");

    const response = await verify_totp_login({
      code,
      pending_login_token,
      trust_device,
    });

    if (response.error) {
      set_error(response.error);
      set_code("");
      input_refs.current[0]?.focus();
      set_is_loading(false);

      return;
    }

    if (response.data) {
      set_is_loading(false);
      on_success(response.data);

      return;
    }

    set_is_loading(false);
  }, [code, pending_login_token, on_success, trust_device]);

  useEffect(() => {
    if (code.length === 6 && !is_loading) {
      handle_verify();
    }
  }, [code, is_loading, handle_verify]);

  useEffect(() => {
    input_refs.current[0]?.focus();
  }, []);

  const handle_code_input = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const new_code = code.split("");

    new_code[index] = value.slice(-1);
    const updated_code = new_code.join("").slice(0, 6);

    set_code(updated_code);

    if (value && index < 5) {
      input_refs.current[index + 1]?.focus();
    }
  };

  const handle_key_down = (index: number, e: React.KeyboardEvent) => {
    if (e["key"] === "Backspace" && !code[index] && index > 0) {
      input_refs.current[index - 1]?.focus();
    }
  };

  const handle_paste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    set_code(pasted);
    const focus_index = Math.min(pasted.length, 5);

    input_refs.current[focus_index]?.focus();
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
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Input
              key={index}
              ref={(el) => {
                input_refs.current[index] = el;
              }}
              className="w-11 h-14 text-center text-xl font-semibold"
              disabled={is_loading}
              inputMode="numeric"
              maxLength={1}
              status={error ? "error" : "default"}
              type="text"
              value={code[index] || ""}
              onChange={(e) => handle_code_input(index, e.target.value)}
              onKeyDown={(e) => handle_key_down(index, e)}
              onPaste={handle_paste}
            />
          ))}
        </div>

        <label className="flex items-center justify-center gap-2 text-sm text-txt-muted cursor-pointer select-none">
          <input
            checked={trust_device}
            className="h-4 w-4 accent-brand cursor-pointer"
            disabled={is_loading}
            type="checkbox"
            onChange={(e) => set_trust_device(e.target.checked)}
          />
          {t("auth.trust_this_device_30_days")}
        </label>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}

        {is_loading && (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 rounded-full animate-spin border-edge-secondary border-t-brand" />
          </div>
        )}

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
      </div>
    </div>
  );
}
