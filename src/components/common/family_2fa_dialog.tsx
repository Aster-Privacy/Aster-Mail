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

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { ignore_error } from "@/lib/ignore_error";

import { FAMILY_2FA_EVENT } from "@/services/api/client/helpers";

const SECURITY_SETTINGS_PATH = "/settings/security";

export function Family2faDialog() {
  const { t } = use_i18n();
  const { is_authenticated, logout } = use_auth();
  const [is_visible, set_is_visible] = useState(false);
  const [is_busy, set_is_busy] = useState(false);
  const is_signing_out = useRef(false);

  const handle_required = useCallback(() => {
    if (is_signing_out.current) return;
    set_is_visible(true);
  }, []);

  useEffect(() => {
    window.addEventListener(FAMILY_2FA_EVENT, handle_required);

    return () => {
      window.removeEventListener(FAMILY_2FA_EVENT, handle_required);
    };
  }, [handle_required]);

  useEffect(() => {
    if (!is_authenticated) {
      set_is_visible(false);
      set_is_busy(false);
      is_signing_out.current = false;
    }
  }, [is_authenticated]);

  const handle_turn_on = () => {
    if (window.location.pathname === SECURITY_SETTINGS_PATH) {
      set_is_visible(false);

      return;
    }

    window.location.assign(SECURITY_SETTINGS_PATH);
  };

  const handle_sign_out = async () => {
    set_is_busy(true);
    is_signing_out.current = true;

    try {
      await logout();
    } catch (caught) {
      ignore_error("components/common/family_2fa_dialog:handle_sign_out", caught);
    }

    set_is_visible(false);
    set_is_busy(false);
  };

  if (!is_visible) {
    return null;
  }

  return (
    <div
      aria-labelledby="family_2fa_title"
      aria-modal="true"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-xl"
        style={{
          backgroundColor: "var(--bg-secondary, var(--bg-primary))",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            fill="currentColor"
            style={{ color: "var(--accent-color)" }}
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V8H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 7V5.5a3 3 0 1 0-6 0V8h6Z"
              fillRule="evenodd"
            />
          </svg>
          <p
            className="font-semibold text-base"
            id="family_2fa_title"
            style={{ color: "var(--text-primary)" }}
          >
            {t("common.family_2fa_title")}
          </p>
        </div>

        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {t("common.family_2fa_body")}
        </p>

        <div className="flex flex-col gap-2">
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={is_busy}
            style={{
              backgroundColor: "var(--accent-color)",
              color: "var(--accent-fg, #ffffff)",
            }}
            onClick={handle_turn_on}
          >
            {t("common.family_2fa_action")}
          </button>
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            disabled={is_busy}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-secondary)",
            }}
            onClick={handle_sign_out}
          >
            {t("common.family_2fa_sign_out")}
          </button>
        </div>
      </div>
    </div>
  );
}
