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

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { sanitize_username } from "@/services/sanitize";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_INPUT_WRAPPER_CLASS,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
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
      <div className="flex items-center px-6 pt-4">
        <motion.button
          className={BACK_BUTTON_CLASS}
          style={BACK_BUTTON_STYLE}
          whileTap={button_tap}
          onClick={on_navigate_sign_in}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </motion.button>
      </div>

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-center px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.img
          alt="Aster"
          className="h-8"
          decoding="async"
          src="/text_logo.png"
          variants={reduce_motion ? undefined : fade_up_item}
        />

        <motion.h1
          className="mt-6 text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.recover_your_account")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.enter_email_associated")}
        </motion.p>

        <AnimatePresence>
          {error && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-sm"
              exit={{ opacity: 0, y: -4 }}
              initial={{ opacity: 0, y: -4 }}
              style={{ color: is_dark ? "#f87171" : "#dc2626" }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.div
          className={`w-full ${error ? "mt-4" : "mt-6"}`}
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <div className={DEPTH_INPUT_WRAPPER_CLASS}>
            <Input
              autoComplete="username"
              className={INNER_INPUT_CLASS}
              maxLength={55}
              placeholder={t("common.yourname_placeholder")}
              status={error ? "error" : "default"}
              type="text"
              value={username}
              onChange={(e) => {
                const raw = e.target.value;
                const at_index = raw.indexOf("@");

                if (at_index !== -1) {
                  const local = sanitize_username(raw.substring(0, at_index));
                  const domain_part = raw
                    .substring(at_index + 1)
                    .toLowerCase();

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
          <div className="relative flex mt-2" style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: 4 }}>
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
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 space-y-3 px-6 pb-4 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }
        }
      >
        <motion.button
          className={DEPTH_CTA_CLASS}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={on_next}
        >
          {t("common.continue")}
        </motion.button>
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={on_navigate_sign_in}
        >
          {t("auth.back_to_sign_in")}
        </motion.button>
      </motion.div>
    </div>
  );
}
