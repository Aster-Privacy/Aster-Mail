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
import type { EmailStepProps } from "./types";

import { motion } from "framer-motion";

import {
  MobileActionRow,
  MobileStepHeader,
  StepBackBar,
  StepError,
} from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { sanitize_username } from "@/services/sanitize";
import {
  stagger_container,
  fade_up_item,
  DEPTH_INPUT_WRAPPER_CLASS,
  INNER_INPUT_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function EmailStep({
  username,
  set_username,
  email_domain,
  set_email_domain,
  error,
  is_dark,
  reduce_motion,
  on_next,
  on_navigate_sign_in,
}: EmailStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      <StepBackBar on_back={on_navigate_sign_in} />

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.enter_email_associated")}
          reduce_motion={reduce_motion}
          title={t("auth.recover_your_account")}
        />

        <motion.div
          className="mt-7 w-full"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <label
            className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
            htmlFor="mobile_recovery_address"
          >
            {t("auth.recovery_email_label")}
          </label>
          <div className={DEPTH_INPUT_WRAPPER_CLASS}>
            <Input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className={INNER_INPUT_CLASS}
              id="mobile_recovery_address"
              maxLength={55}
              name="username"
              placeholder={t("common.yourname_placeholder")}
              spellCheck={false}
              status={error ? "error" : "default"}
              type="text"
              value={username}
              onChange={(e) => {
                const raw = e.target.value;
                const at_index = raw.indexOf("@");

                if (at_index !== -1) {
                  const local = sanitize_username(raw.substring(0, at_index));
                  const domain_part = raw.substring(at_index + 1).toLowerCase();

                  set_username(local);
                  if (
                    domain_part === "astermail.org" ||
                    domain_part === "astermail.org."
                  )
                    set_email_domain("astermail.org");
                  else if (
                    domain_part === "aster.cx" ||
                    domain_part === "aster.cx."
                  )
                    set_email_domain("aster.cx");
                } else {
                  set_username(sanitize_username(raw));
                }
              }}
              onKeyDown={(e) => e["key"] === "Enter" && on_next()}
            />
          </div>
          <div
            className="relative flex mt-2"
            style={{
              background: "var(--bg-secondary)",
              borderRadius: 12,
              padding: 4,
            }}
          >
            <div
              className="absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out"
              style={{
                background: "var(--bg-tertiary)",
                width: "calc(50% - 4px)",
                left: email_domain === "astermail.org" ? "4px" : "calc(50%)",
              }}
            />
            <button
              className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
              type="button"
              onClick={() => set_email_domain("astermail.org")}
            >
              @astermail.org
            </button>
            <button
              className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
              type="button"
              onClick={() => set_email_domain("aster.cx")}
            >
              @aster.cx
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            {t("auth.recovery_domain_hint")}
          </p>
        </motion.div>

        <StepError error={error} is_dark={is_dark} />
      </motion.div>

      <MobileActionRow
        on_primary={on_next}
        on_secondary={on_navigate_sign_in}
        primary_label={t("common.continue")}
        reduce_motion={reduce_motion}
        secondary_label={t("auth.back_to_sign_in")}
      />
    </div>
  );
}
