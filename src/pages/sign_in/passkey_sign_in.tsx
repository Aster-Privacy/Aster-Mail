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
import { useState, useCallback } from "react";
import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  passkey_login_initiate,
  perform_passkey_login,
} from "@/services/api/passkeys";
import type { TotpVerifyResponse } from "@/services/api/totp";

interface PasskeySignInButtonProps {
  remember_me: boolean;
  on_success: (response: TotpVerifyResponse) => Promise<void>;
  on_error: (message: string) => void;
}

export function PasskeySignInButton({
  remember_me,
  on_success,
  on_error,
}: PasskeySignInButtonProps) {
  const { t } = use_i18n();
  const [is_loading, set_is_loading] = useState(false);

  const handle_click = useCallback(async () => {
    if (is_loading) return;
    set_is_loading(true);

    try {
      const initiate_resp = await passkey_login_initiate();
      if (!initiate_resp.data) {
        on_error(initiate_resp.error || t("errors.generic"));
        return;
      }

      const verify_resp = await perform_passkey_login(
        initiate_resp.data,
        remember_me,
      );

      if (verify_resp.data) {
        await on_success(verify_resp.data);
        return;
      }
      if (verify_resp.error !== "passkey_cancelled") {
        on_error(verify_resp.error ?? t("errors.generic"));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return;
      }
      on_error(t("errors.generic"));
    } finally {
      set_is_loading(false);
    }
  }, [is_loading, remember_me, on_success, on_error, t]);

  return (
    <motion.button
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full flex items-center justify-center gap-2",
        "border border-edge-secondary rounded-xl px-4 py-2.5",
        "text-sm font-medium text-txt-primary",
        "bg-surf-secondary hover:bg-surf-tertiary transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
      disabled={is_loading}
      initial={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      type="button"
      onClick={handle_click}
    >
      {is_loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <FingerPrintIcon className="w-4 h-4" />
      )}
      {is_loading
        ? t("passkeys.authenticating")
        : t("passkeys.sign_in_with_passkey")}
    </motion.button>
  );
}
