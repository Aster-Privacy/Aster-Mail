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
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_is_mobile } from "@/hooks/use_platform";
import { use_onboarding_checklist } from "@/hooks/use_onboarding_checklist";

import type { ChecklistTasksState } from "@/services/api/onboarding";
import type { SettingsSection } from "@/components/settings/settings_panel";

interface OnboardingChecklistProps {
  on_compose: () => void;
  on_open_settings: (section: SettingsSection) => void;
}

interface ChecklistRow {
  key: keyof ChecklistTasksState;
  label_key:
    | "common.onboarding_checklist_install_app"
    | "common.onboarding_checklist_import_mail"
    | "common.onboarding_checklist_recovery_method"
    | "common.onboarding_checklist_first_email";
  on_click: () => void;
}

const DOWNLOAD_URL = "https://astermail.org/download";

export function OnboardingChecklist({
  on_compose,
  on_open_settings,
}: OnboardingChecklistProps): JSX.Element | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const is_mobile = use_is_mobile();
  const { state, is_loading, dismiss, refresh, mark_install_app_done } =
    use_onboarding_checklist();

  const rows: ChecklistRow[] = useMemo(
    () => [
      {
        key: "install_app",
        label_key: "common.onboarding_checklist_install_app",
        on_click: () => {
          window.open(DOWNLOAD_URL, "_blank", "noopener,noreferrer");
          mark_install_app_done();
        },
      },
      {
        key: "import_mail",
        label_key: "common.onboarding_checklist_import_mail",
        on_click: () => {
          on_open_settings("import");
          void refresh();
        },
      },
      {
        key: "recovery_method",
        label_key: "common.onboarding_checklist_recovery_method",
        on_click: () => {
          on_open_settings("account");
          void refresh();
        },
      },
      {
        key: "first_email",
        label_key: "common.onboarding_checklist_first_email",
        on_click: () => {
          on_compose();
          void refresh();
        },
      },
    ],
    [on_compose, on_open_settings, mark_install_app_done, refresh],
  );

  if (is_loading || !state || is_mobile) return null;
  if (state.dismissed_at) return null;

  const total = rows.length;
  const completed = rows.reduce(
    (acc, row) => (state.tasks[row.key] ? acc + 1 : acc),
    0,
  );

  if (completed === total) return null;

  const transition = reduce_motion ? { duration: 0 } : { duration: 0.2 };

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="hidden md:flex fixed bottom-5 right-5 z-30 w-[320px] flex-col overflow-hidden rounded-xl border shadow-lg"
        exit={{ opacity: 0, y: 8 }}
        initial={{ opacity: 0, y: 8 }}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-primary)",
        }}
        transition={transition}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-txt-primary">
              {t("common.onboarding_checklist_title")}
            </div>
            <div className="mt-0.5 text-xs text-txt-muted tabular-nums">
              {completed}/{total}
            </div>
          </div>
          <button
            aria-label={t("common.onboarding_checklist_dismiss")}
            className="-mr-1 -mt-1 p-1 rounded-md hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-muted transition-colors"
            onClick={() => {
              void dismiss();
            }}
            type="button"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <ul className="flex flex-col pb-2">
          {rows.map((row) => {
            const done = state.tasks[row.key];

            return (
              <li key={row.key}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                  onClick={row.on_click}
                  type="button"
                >
                  <span
                    className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border transition-colors"
                    style={{
                      borderColor: done
                        ? "var(--accent-blue)"
                        : "var(--border-primary)",
                      backgroundColor: done
                        ? "var(--accent-blue)"
                        : "transparent",
                    }}
                  >
                    {done && <CheckIcon className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span
                    className={
                      done
                        ? "flex-1 text-[13px] text-txt-muted line-through"
                        : "flex-1 text-[13px] text-txt-primary"
                    }
                  >
                    {t(row.label_key)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
