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
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { get_recovery_methods } from "@/services/api/recovery";
import {
  clear_first_run_plan,
  first_run_age_ms,
  is_first_run_plan_pending,
  is_first_run_setup_pending,
  is_first_run_tour_pending,
  is_recovery_snoozed,
  schedule_first_run_plan,
  FIRST_RUN_TOUR_DONE_EVENT,
} from "@/lib/first_run";

const ELIGIBLE_AFTER_MS = 24 * 60 * 60 * 1000;
const REVEAL_DELAY_MS = 1200;
const TOUR_DWELL_MS = 45 * 1000;

interface PlanPromptProps {
  on_open_plans: () => void;
  checklist_complete?: boolean;
}

export function PlanPrompt({
  on_open_plans,
  checklist_complete = false,
}: PlanPromptProps): JSX.Element | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    if (!is_first_run_plan_pending() || is_first_run_setup_pending()) return;

    const reveal = (delay: number) => {
      const remaining = schedule_first_run_plan(delay);

      if (timer) window.clearTimeout(timer);

      if (remaining <= 0) {
        set_is_open(true);

        return;
      }
      timer = window.setTimeout(() => {
        if (!cancelled) set_is_open(true);
      }, remaining);
    };

    if (checklist_complete) {
      reveal(REVEAL_DELAY_MS);

      return () => {
        cancelled = true;
        if (timer) window.clearTimeout(timer);
      };
    }

    const handle_tour_done = () => {
      if (!cancelled) reveal(TOUR_DWELL_MS);
    };

    window.addEventListener(FIRST_RUN_TOUR_DONE_EVENT, handle_tour_done);

    if (!is_first_run_tour_pending()) {
      reveal(TOUR_DWELL_MS);
    }

    const age = first_run_age_ms();
    const aged_in = age !== null && age >= ELIGIBLE_AFTER_MS;

    if (aged_in) {
      const check = async () => {
        const response = await get_recovery_methods();

        if (cancelled) return;

        const recovery_pending =
          !!response.data &&
          !response.data.recovery_email_set &&
          !is_recovery_snoozed();

        if (recovery_pending) return;

        reveal(REVEAL_DELAY_MS);
      };

      void check();
    }

    return () => {
      cancelled = true;
      window.removeEventListener(FIRST_RUN_TOUR_DONE_EVENT, handle_tour_done);
      if (timer) window.clearTimeout(timer);
    };
  }, [checklist_complete]);

  const close = () => {
    clear_first_run_plan();
    set_is_open(false);
  };

  const handle_open = () => {
    close();
    on_open_plans();
  };

  const transition = { duration: reduce_motion ? 0 : 0.2 };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-5 end-5 z-30 w-[320px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border p-4 shadow-lg"
          exit={{ opacity: 0, y: 8 }}
          initial={{ opacity: 0, y: 8 }}
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
          }}
          transition={transition}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold text-txt-primary">
              {t("common.plan_prompt_title")}
            </div>
            <button
              aria-label={t("common.plan_prompt_dismiss")}
              className="-me-1 -mt-1 rounded-md p-1 text-txt-muted transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              type="button"
              onClick={close}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-txt-secondary">
            {t("common.plan_prompt_body")}
          </p>

          <Button className="mt-3 w-full" size="sm" onClick={handle_open}>
            {t("common.plan_prompt_action")}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
