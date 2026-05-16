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

export function ProbationBanner() {
  const { t } = use_i18n();
  const [is_visible, set_is_visible] = useState(false);
  const [is_dismissed, set_is_dismissed] = useState(false);

  const handle_probation = useCallback(() => {
    set_is_visible(true);
    set_is_dismissed(false);
  }, []);

  useEffect(() => {
    window.addEventListener("aster:account-probation", handle_probation);

    return () => {
      window.removeEventListener("aster:account-probation", handle_probation);
    };
  }, [handle_probation]);

  if (!is_visible || is_dismissed) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b"
      style={{
        backgroundColor: "#d97706",
        color: "#fff",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="currentColor"
          style={{ color: "#fff" }}
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            clipRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            fillRule="evenodd"
          />
        </svg>
        <span className="truncate">
          {t("common.probation_message")}
        </span>
      </div>
      <button
        className="flex-shrink-0 p-1 rounded-[14px] transition-all duration-150 hover:opacity-70"
        style={{ color: "rgba(255, 255, 255, 0.8)" }}
        onClick={() => set_is_dismissed(true)}
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}
