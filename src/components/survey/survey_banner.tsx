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
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  dismiss_survey,
  get_survey_status,
  type SurveyStatusResponse,
} from "@/services/api/survey";

import { SurveyModal } from "./survey_modal";

const DONE_CACHE_KEY = "aster_survey_done";

function get_cached_done(): boolean {
  try {
    return localStorage.getItem(DONE_CACHE_KEY) === "true";
  } catch {
    return false;
  }
}

function cache_done() {
  try {
    localStorage.setItem(DONE_CACHE_KEY, "true");
  } catch {}
}

export function SurveyBanner() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const [status, set_status] = useState<SurveyStatusResponse | null>(null);
  const [is_hidden, set_is_hidden] = useState(get_cached_done);
  const [is_choosing_dismissal, set_is_choosing_dismissal] = useState(false);
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    if (get_cached_done()) return;

    let cancelled = false;

    get_survey_status().then((response) => {
      if (cancelled || response.error || !response.data) return;

      set_status(response.data);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const should_hide = is_hidden || !status?.eligible;

  const handle_remind_tomorrow = () => {
    set_is_hidden(true);
    dismiss_survey(false);
  };

  const handle_dismiss_forever = () => {
    set_is_hidden(true);
    cache_done();
    dismiss_survey(true);
  };

  const handle_submitted = () => {
    set_is_modal_open(false);
    set_is_hidden(true);
    cache_done();
  };

  const pill_button = (label: string, on_click: () => void, emphasis: boolean) => (
    <button
      className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
      style={{
        backgroundColor: emphasis
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(255, 255, 255, 0.1)",
        color: "inherit",
      }}
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
    <>
      <AnimatePresence>
        {!should_hide && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="w-full text-white flex-shrink-0 overflow-hidden"
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            initial={reduce_motion ? false : { opacity: 0, height: 0 }}
            style={{ backgroundColor: "var(--accent-color)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
          >
            <div className="flex items-center justify-between px-4 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <ClipboardDocumentListIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
                <span className="text-xs font-medium truncate opacity-95">
                  {t("survey.banner_message")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                {is_choosing_dismissal ? (
                  <>
                    {pill_button(
                      t("survey.remind_tomorrow"),
                      handle_remind_tomorrow,
                      false,
                    )}
                    {pill_button(
                      t("survey.dismiss_forever"),
                      handle_dismiss_forever,
                      false,
                    )}
                  </>
                ) : (
                  <>
                    {pill_button(
                      t("survey.banner_take"),
                      () => set_is_modal_open(true),
                      true,
                    )}
                    {pill_button(
                      t("survey.banner_dismiss"),
                      () => set_is_choosing_dismissal(true),
                      false,
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {status && (
        <SurveyModal
          branch={status.branch}
          is_open={is_modal_open}
          plan_code={status.plan_code}
          on_close={() => set_is_modal_open(false)}
          on_submitted={handle_submitted}
        />
      )}
    </>
  );
}
