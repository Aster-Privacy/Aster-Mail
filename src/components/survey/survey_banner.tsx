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
import { ClipboardDocumentListIcon, XMarkIcon } from "@heroicons/react/24/outline";

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

  if (is_hidden || !status?.eligible) {
    return null;
  }

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

  return (
    <>
      <div
        className="mx-3 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
        style={{ backgroundColor: "var(--accent-color)", color: "#fff" }}
      >
        <ClipboardDocumentListIcon className="w-5 h-5 flex-shrink-0 text-white" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {t("survey.banner_title")}
          </p>
          <p className="text-xs text-white/80 mt-0.5">
            {t("survey.banner_message")}
          </p>
        </div>
        {is_choosing_dismissal ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="px-3 py-1.5 rounded-[12px] text-xs font-medium bg-white/15 hover:bg-white/25 transition-colors"
              type="button"
              onClick={handle_remind_tomorrow}
            >
              {t("survey.remind_tomorrow")}
            </button>
            <button
              className="px-3 py-1.5 rounded-[12px] text-xs font-medium bg-white/15 hover:bg-white/25 transition-colors"
              type="button"
              onClick={handle_dismiss_forever}
            >
              {t("survey.dismiss_forever")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="px-3 py-1.5 rounded-[12px] text-xs font-medium bg-white text-neutral-900 hover:bg-white/90 transition-colors"
              type="button"
              onClick={() => set_is_modal_open(true)}
            >
              {t("survey.banner_take")}
            </button>
            <button
              aria-label={t("survey.banner_dismiss")}
              className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
              type="button"
              onClick={() => set_is_choosing_dismissal(true)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <SurveyModal
        branch={status.branch}
        is_open={is_modal_open}
        plan_code={status.plan_code}
        on_close={() => set_is_modal_open(false)}
        on_submitted={handle_submitted}
      />
    </>
  );
}
