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
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StarIcon } from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  REVIEW_PROMPT_URL,
  mark_review_prompt_done,
  should_show_review_prompt,
} from "@/lib/review_prompt";

export function ReviewPromptBanner() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const [is_visible, set_is_visible] = useState(should_show_review_prompt);

  const close = () => {
    set_is_visible(false);
    mark_review_prompt_done();
  };

  const pill_button = (
    label: string,
    on_click: () => void,
    emphasis: boolean,
    title?: string,
  ) => (
    <button
      className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
      style={{
        backgroundColor: emphasis
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(255, 255, 255, 0.1)",
        color: "inherit",
      }}
      title={title}
      type="button"
      onClick={on_click}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = emphasis
          ? "rgba(255, 255, 255, 0.3)"
          : "rgba(255, 255, 255, 0.2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = emphasis
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(255, 255, 255, 0.1)")
      }
    >
      {label}
    </button>
  );

  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, height: "auto" }}
          className="w-full text-[var(--accent-fg,#ffffff)] flex-shrink-0 overflow-hidden"
          exit={{ opacity: 0, height: 0, overflow: "hidden" }}
          initial={reduce_motion ? false : { opacity: 0, height: 0 }}
          style={{ backgroundColor: "var(--accent-color)" }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="flex items-center justify-between px-4 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <StarIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              <span className="text-xs font-medium truncate opacity-95">
                {t("review_prompt.banner_message")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ms-4">
              {pill_button(
                t("review_prompt.banner_open"),
                () => {
                  window.open(
                    REVIEW_PROMPT_URL,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  close();
                },
                true,
                t("review_prompt.opens_in_new_tab"),
              )}
              {pill_button(t("review_prompt.banner_dismiss"), close, false)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
