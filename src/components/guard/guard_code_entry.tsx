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

import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp_input";
import { GUARD_ALPHABET, GUARD_CODE_LENGTH } from "@/lib/crypto/guard_code";
import { use_i18n } from "@/lib/i18n/context";

export function clean_guard_code_input(value: string): string {
  let out = "";

  for (const ch of value.toUpperCase()) {
    if (GUARD_ALPHABET.includes(ch)) out += ch;
    if (out.length === GUARD_CODE_LENGTH) break;
  }

  return out;
}

interface GuardCodeEntryProps {
  has_error: boolean;
  disabled?: boolean;
  on_submit: (code: string) => Promise<void>;
}

export function GuardCodeEntry({
  has_error,
  disabled = false,
  on_submit,
}: GuardCodeEntryProps) {
  const { t } = use_i18n();
  const [code, set_code] = useState("");
  const [is_busy, set_is_busy] = useState(false);

  useEffect(() => {
    if (has_error) {
      set_code("");
      document.getElementById("guard_code_input_0")?.focus();
    }
  }, [has_error]);

  const submit = async () => {
    if (code.length !== GUARD_CODE_LENGTH || is_busy) return;
    set_is_busy(true);
    try {
      await on_submit(code);
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === GUARD_CODE_LENGTH) void submit();
      }}
    >
      <p
        className="block text-sm font-medium text-txt-primary"
        id="guard_code_label"
      >
        {t("guard.sign_in_code_label")}
      </p>
      <p className="text-xs text-txt-muted">{t("guard.sign_in_code_hint")}</p>
      <div aria-labelledby="guard_code_label" role="group">
        <OtpInput
          aria_label={t("guard.sign_in_code_label")}
          autofocus={false}
          disabled={disabled || is_busy}
          id_prefix="guard_code_input"
          input_mode="text"
          length={GUARD_CODE_LENGTH}
          sanitize={clean_guard_code_input}
          status={has_error ? "error" : "default"}
          value={code}
          onChange={set_code}
        />
      </div>
      {has_error && (
        <p className="text-sm text-center text-red-500" role="alert">
          {t("guard.sign_in_code_wrong")}
        </p>
      )}
      <Button
        className="w-full"
        disabled={disabled || code.length !== GUARD_CODE_LENGTH}
        is_loading={is_busy}
        type="submit"
        variant="depth"
      >
        {t("guard.sign_in_code_submit")}
      </Button>
    </form>
  );
}
