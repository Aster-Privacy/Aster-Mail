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

import type { TranslationKey } from "@/lib/i18n/types";
import type { SettingsTarget } from "@/lib/settings_links";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import {
  load_recovery_status,
  recovery_nudge,
} from "@/hooks/use_recovery_status";
import { SETTINGS_ANCHORS, open_settings_target } from "@/lib/settings_links";
import {
  first_run_age_ms,
  is_recovery_snoozed,
  snooze_recovery,
} from "@/lib/first_run";

const ELIGIBLE_AFTER_MS = 24 * 60 * 60 * 1000;
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const PHRASE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type NudgeKind = "phrase" | "codes" | "codes_low" | "email";

interface NudgeCopy {
  title_key: TranslationKey;
  body_key: TranslationKey;
  action_key: TranslationKey;
  target: SettingsTarget;
  snooze_ms: number;
}

const CODES_TARGET: SettingsTarget = {
  section: "security",
  anchor: SETTINGS_ANCHORS.account_recovery,
};

const NUDGE_COPY: Record<NudgeKind, NudgeCopy> = {
  phrase: {
    title_key: "common.recovery_phrase_migrate_title",
    body_key: "common.recovery_phrase_migrate_body",
    action_key: "common.recovery_phrase_migrate_action",
    target: CODES_TARGET,
    snooze_ms: PHRASE_SNOOZE_MS,
  },
  codes: {
    title_key: "common.recovery_codes_reminder_title",
    body_key: "common.recovery_codes_reminder_body",
    action_key: "common.recovery_codes_reminder_action",
    target: CODES_TARGET,
    snooze_ms: SNOOZE_MS,
  },
  codes_low: {
    title_key: "common.recovery_codes_low_reminder_title",
    body_key: "common.recovery_codes_low_reminder_body",
    action_key: "common.recovery_codes_low_reminder_action",
    target: CODES_TARGET,
    snooze_ms: SNOOZE_MS,
  },
  email: {
    title_key: "common.recovery_reminder_title",
    body_key: "common.recovery_reminder_body",
    action_key: "common.recovery_reminder_action",
    target: { section: "account", anchor: SETTINGS_ANCHORS.recovery_email },
    snooze_ms: SNOOZE_MS,
  },
};

export function RecoveryReminder(): JSX.Element | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [nudge, set_nudge] = useState<NudgeKind | null>(null);
  const [codes_remaining, set_codes_remaining] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const age = first_run_age_ms();

    if (age === null || age < ELIGIBLE_AFTER_MS) return;

    const check = async () => {
      const values = await load_recovery_status();

      if (cancelled || !values) return;

      const kind = recovery_nudge(values);

      if (!kind || is_recovery_snoozed(kind)) return;

      set_codes_remaining(values.codes_remaining);
      set_nudge(kind);
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  const copy = nudge ? NUDGE_COPY[nudge] : null;
  const is_open = nudge !== null && copy !== null;

  const dismiss = () => {
    if (nudge && copy) snooze_recovery(copy.snooze_ms, nudge);
    set_nudge(null);
  };

  const handle_setup = () => {
    const target = copy ? copy.target : CODES_TARGET;

    dismiss();
    open_settings_target(target);
  };

  const duration = reduce_motion ? 0 : 0.25;

  return (
    <AnimatePresence>
      {is_open && copy && (
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
                {t(copy.title_key)}
              </h2>
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-txt-secondary">
              {t(copy.body_key, { count: codes_remaining })}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={dismiss}>
                {t("common.recovery_reminder_later")}
              </Button>
              <Button onClick={handle_setup}>
                {t(copy.action_key)}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
