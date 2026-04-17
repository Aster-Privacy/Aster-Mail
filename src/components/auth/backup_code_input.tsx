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
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import {
  verify_backup_code_login,
  TotpVerifyResponse,
} from "@/services/api/totp";

interface BackupCodeInputProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_authenticator: () => void;
  on_cancel: () => void;
}

export function BackupCodeInput({
  pending_login_token,
  on_success,
  on_use_authenticator,
  on_cancel,
}: BackupCodeInputProps) {
  const { t } = use_i18n();
  const [code, set_code] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  const handle_verify = async () => {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (normalized.length !== 8) {
      set_error(t("auth.backup_code_length_error"));

      return;
    }

    set_is_loading(true);
    set_error("");

    const formatted_code = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;

    const response = await verify_backup_code_login({
      code: formatted_code,
      pending_login_token,
    });

    if (response.error) {
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      set_is_loading(false);
      on_success(response.data);

      return;
    }

    set_is_loading(false);
  };

  const handle_input_change = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");

    set_code(cleaned);
    set_error("");
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Enter") {
      handle_verify();
    }
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
          {t("auth.enter_backup_code")}
        </h2>
        <p className="text-sm text-txt-muted">
          {t("auth.backup_code_description")}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Input
            ref={input_ref}
            className="text-center text-lg font-mono tracking-wider uppercase"
            disabled={is_loading}
            maxLength={9}
            placeholder={t("auth.backup_code_placeholder")}
            status={error ? "error" : "default"}
            type="text"
            value={code}
            onChange={(e) => handle_input_change(e.target.value)}
            onKeyDown={handle_key_down}
          />
          <p className="text-xs text-center mt-2 text-txt-muted">
            {t("auth.backup_code_single_use")}
          </p>
        </div>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}

        <div className="flex gap-3">
          <Button className="flex-1" variant="outline" onClick={on_cancel}>
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={
              is_loading || code.replace(/[^A-Z0-9]/gi, "").length !== 8
            }
            variant="depth"
            onClick={handle_verify}
          >
            {is_loading ? t("common.verifying") : t("common.continue")}
          </Button>
        </div>

        <button
          className="w-full text-sm text-center transition-colors hover:opacity-80 text-txt-muted"
          type="button"
          onClick={on_use_authenticator}
        >
          {t("auth.use_authenticator_instead")}
        </button>
      </div>
    </div>
  );
}
