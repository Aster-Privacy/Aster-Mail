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
import {
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import {
  dismiss_web_sandbox_notice,
  fetch_web_sandbox_status,
  is_web_sandbox_notice_dismissed,
  should_show_web_sandbox_notice,
} from "@/services/desktop/web_sandbox_status";

export function WebSandboxNotice() {
  const { t } = use_i18n();
  const [visible, set_visible] = useState(false);

  useEffect(() => {
    if (is_web_sandbox_notice_dismissed()) return;
    let cancelled = false;

    fetch_web_sandbox_status().then((status) => {
      if (cancelled) return;
      set_visible(
        should_show_web_sandbox_notice(
          status,
          is_web_sandbox_notice_dismissed(),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handle_dismiss = () => {
    dismiss_web_sandbox_notice();
    set_visible(false);
  };

  return (
    <div
      className="fixed bottom-4 start-4 z-[9999] max-w-sm rounded-[var(--aster-radius-floating,16px)] p-3"
      role="status"
      style={{
        backgroundColor: "var(--aster-floating-bg, var(--bg-primary, #111))",
        boxShadow: "var(--aster-floating-shadow)",
        color: "var(--text-primary, #fff)",
      }}
    >
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 text-txt-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">
            {t("common.web_sandbox_off_title")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-txt-secondary">
            {t("common.web_sandbox_off_body")}
          </p>
        </div>
        <button
          aria-label={t("common.dismiss")}
          className="p-1 text-txt-muted hover:text-txt-primary"
          onClick={handle_dismiss}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
