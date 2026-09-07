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
import { KeyIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { get_recovery_methods } from "@/services/api/recovery";
import {
  first_run_age_ms,
  is_first_run_setup_pending,
  is_recovery_snoozed,
  snooze_recovery,
} from "@/lib/first_run";

const ELIGIBLE_AFTER_MS = 24 * 60 * 60 * 1000;
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

interface RecoveryReminderProps {
  on_open_recovery: () => void;
}

export function RecoveryReminder({
  on_open_recovery,
}: RecoveryReminderProps): JSX.Element | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const age = first_run_age_ms();

    if (age === null || age < ELIGIBLE_AFTER_MS) return;
    if (is_first_run_setup_pending() || is_recovery_snoozed()) return;

    const check = async () => {
      const response = await get_recovery_methods();

      if (cancelled || response.error || !response.data) return;
      if (response.data.recovery_email_set) return;

      set_is_open(true);
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    snooze_recovery(SNOOZE_MS);
    set_is_open(false);
  };

  const handle_setup = () => {
    dismiss();
    on_open_recovery();
  };

  const duration = reduce_motion ? 0 : 0.25;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          aria-modal="true"
          className="fixed inset-0 z-[65] flex items-center justify-center p-5"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="dialog"
          style={{ backgroundColor: "var(--modal-overlay)" }}
          transition={{ duration }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[400px] rounded-2xl border p-6 shadow-xl"
            exit={{ opacity: 0, y: reduce_motion ? 0 : 8 }}
            initial={{ opacity: 0, y: reduce_motion ? 0 : 12 }}
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-primary)",
            }}
            transition={{ duration, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2.5">
              <KeyIcon
                aria-hidden="true"
                className="h-5 w-5 flex-shrink-0 text-txt-primary"
                strokeWidth={1.75}
              />
              <h2 className="text-base font-semibold text-txt-primary">
                {t("common.recovery_reminder_title")}
              </h2>
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-txt-secondary">
              {t("common.recovery_reminder_body")}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={dismiss}>
                {t("common.recovery_reminder_later")}
              </Button>
              <Button onClick={handle_setup}>
                {t("common.recovery_reminder_action")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
