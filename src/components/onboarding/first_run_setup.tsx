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
import { ArrowDownTrayIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_auth } from "@/contexts/auth_context";
import {
  clear_first_run_setup,
  is_first_run_setup_pending,
} from "@/lib/first_run";

interface FirstRunSetupProps {
  on_import: () => void;
  on_done: () => void;
}

export function FirstRunSetup({
  on_import,
  on_done,
}: FirstRunSetupProps): JSX.Element | null {
  const { t } = use_i18n();
  const { user } = use_auth();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(() => is_first_run_setup_pending());

  const close = () => {
    clear_first_run_setup();
    set_is_open(false);
    on_done();
  };

  const handle_import = () => {
    close();
    on_import();
  };

  const duration = reduce_motion ? 0 : 0.28;
  const exit_transition = {
    duration: reduce_motion ? 0 : 0.14,
    ease: "easeIn",
  };

  return (
    <AnimatePresence>
      {is_open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0"
            exit={{ opacity: 0, transition: exit_transition }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--modal-overlay) 70%, transparent)",
            }}
            transition={{ duration }}
          />

          <motion.div
            animate={{ opacity: 1 }}
            aria-modal="true"
            className="relative w-full max-w-[440px] rounded-2xl border p-7 text-center"
            exit={{ opacity: 0, scale: 0.985, transition: exit_transition }}
            initial={{ opacity: 0 }}
            role="dialog"
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 32px 64px -16px rgba(0, 0, 0, 0.55)",
            }}
            transition={{ duration, ease: "easeOut" }}
          >
            <h1 className="text-xl font-semibold text-txt-primary">
              {t("common.first_run_title")}
            </h1>

            {user?.email && (
              <div className="mt-1 text-sm text-txt-muted break-all">
                {user.email}
              </div>
            )}

            <p className="mt-3 text-sm leading-relaxed text-txt-secondary">
              {t("common.first_run_subtitle")}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Button className="w-full" onClick={handle_import}>
                <ArrowDownTrayIcon className="me-2 h-4 w-4" />
                {t("common.first_run_import")}
              </Button>
              <Button className="w-full" variant="ghost" onClick={close}>
                {t("common.first_run_skip")}
              </Button>
            </div>

            <div className="mt-5 flex items-start justify-center gap-2 text-xs text-txt-muted">
              <LockClosedIcon className="mt-px h-3.5 w-3.5 flex-shrink-0" />
              <span>{t("common.first_run_privacy_note")}</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
