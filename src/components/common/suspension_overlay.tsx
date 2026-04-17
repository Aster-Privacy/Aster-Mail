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

import { use_i18n } from "@/lib/i18n/context";

export function SuspensionBanner() {
  const { t } = use_i18n();
  const [is_visible, set_is_visible] = useState(false);
  const [reason, set_reason] = useState("");

  const handle_suspension = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const raw_reason = detail?.reason || "";
      const lower = raw_reason.toLowerCase().trim();
      const is_generic =
        !lower ||
        lower === "account suspended" ||
        lower === "account suspended.";

      set_reason(
        is_generic ? t("common.account_suspended_default_reason") : raw_reason,
      );
      set_is_visible(true);
    },
    [t],
  );

  useEffect(() => {
    const stored = sessionStorage.getItem("aster_suspended");

    if (stored === "true") {
      set_reason(t("common.account_suspended_default_reason"));
      set_is_visible(true);
    }

    window.addEventListener("aster:account-suspended", handle_suspension);

    return () => {
      window.removeEventListener("aster:account-suspended", handle_suspension);
    };
  }, [handle_suspension]);

  if (!is_visible) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-sm border-b"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border-secondary)",
        color: "var(--text-secondary)",
      }}
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="currentColor"
        style={{ color: "var(--color-error, #ef4444)" }}
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          fillRule="evenodd"
        />
      </svg>
      <span className="flex-1 min-w-0">
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          {t("common.account_suspended_label")}
        </span>{" "}
        {reason}{" "}
        <a
          className="hover:underline whitespace-nowrap"
          href="https://astermail.org/appeal"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-color)" }}
          target="_blank"
        >
          {t("common.submit_an_appeal")}
        </a>
      </span>
    </div>
  );
}
