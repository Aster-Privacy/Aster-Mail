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
import type { NavigateFunction } from "react-router-dom";

import { motion, AnimatePresence } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import { Input } from "@/components/ui/input";
import { UserCircleIcon } from "@/components/auth/auth_styles";
import { sanitize_username } from "@/services/sanitize";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_INPUT_WRAPPER_CLASS,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  LABEL_CLASS,
  INNER_INPUT_WITH_ICON_CLASS,
  INPUT_ICON_CLASS,
} from "@/components/auth/mobile_auth_motion";

export interface step_email_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
  navigate: NavigateFunction;
}

export function StepEmail({ reg, reduce_motion, navigate }: step_email_props) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4">
        <motion.div
          animate="animate"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          {reg.is_adding_account && reg.is_authenticated && (
            <motion.div variants={reduce_motion ? undefined : fade_up_item}>
              <button
                className="mb-4 flex items-center gap-1 text-sm text-[var(--text-tertiary)]"
                type="button"
                onClick={reg.handle_cancel_add_account}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15 19l-7-7 7-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {reg.t("auth.back_to_inbox")}
              </button>
            </motion.div>
          )}

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {reg.t("auth.create_your_free_account")}
            </h1>
          </motion.div>

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-tertiary)]">
              {reg.t("auth.one_account_all_services")}
            </p>
          </motion.div>

          <AnimatePresence>
            {reg.error && (
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-center text-sm"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
              >
                {reg.error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.div
            className="mt-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className={LABEL_CLASS}>{reg.t("auth.username")}</label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <div className={INPUT_ICON_CLASS}>
                <UserCircleIcon />
              </div>
              <Input
                autoComplete="username"
                className={`${INNER_INPUT_WITH_ICON_CLASS} notranslate`}
                maxLength={55}
                placeholder="yourname"
                status={reg.error ? "error" : "default"}
                translate="no"
                type="text"
                value={reg.username}
                onChange={(e) => {
                  const raw = e.target.value;
                  const at_index = raw.indexOf("@");

                  if (at_index !== -1) {
                    const local = sanitize_username(raw.substring(0, at_index));
                    const domain_part = raw
                      .substring(at_index + 1)
                      .toLowerCase();

                    reg.set_username(local + "@" + domain_part);
                    if (
                      domain_part === "astermail.org" ||
                      domain_part.startsWith("astermail.org")
                    )
                      reg.set_email_domain("astermail.org");
                    else if (
                      domain_part === "aster.cx" ||
                      domain_part.startsWith("aster.cx")
                    )
                      reg.set_email_domain("aster.cx");
                  } else {
                    reg.set_username(sanitize_username(raw));
                  }
                  reg.set_error("");
                }}
              />
            </div>
          </motion.div>

          <motion.div
            className="mt-3"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <div className="relative flex rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
              <div
                className="absolute top-1 bottom-1 rounded-lg transition-all duration-200 ease-out"
                style={{
                  width: "calc(50% - 4px)",
                  left:
                    reg.email_domain === "astermail.org" ? "4px" : "calc(50%)",
                  backgroundColor: reg.is_dark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.06)",
                }}
              />
              <button
                className={`relative h-10 flex-1 rounded-lg text-sm font-medium transition-colors ${reg.email_domain === "astermail.org" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                type="button"
                onClick={() => reg.set_email_domain("astermail.org")}
              >
                @astermail.org
              </button>
              <button
                className={`relative h-10 flex-1 rounded-lg text-sm font-medium transition-colors ${reg.email_domain === "aster.cx" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                type="button"
                onClick={() => reg.set_email_domain("aster.cx")}
              >
                @aster.cx
              </button>
            </div>
          </motion.div>

          <motion.div
            className="mt-4"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className={LABEL_CLASS}>
              {reg.t("auth.display_name_optional")}
            </label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <div className={INPUT_ICON_CLASS}>
                <UserCircleIcon />
              </div>
              <Input
                autoComplete="off"
                className={INNER_INPUT_WITH_ICON_CLASS}
                maxLength={64}
                placeholder={reg.t("auth.display_name_optional")}
                type="text"
                value={reg.display_name}
                onChange={(e) => reg.set_display_name(e.target.value)}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="shrink-0 px-6 pb-4 pt-4 space-y-4">
        <motion.button
          className={DEPTH_CTA_CLASS}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={reg.handle_email_next}
        >
          {reg.t("common.next")}
        </motion.button>
        <p className="text-center text-sm text-[var(--text-tertiary)]">
          {reg.t("auth.already_have_account")}{" "}
          <button
            className="font-semibold text-[#4a7aff]"
            type="button"
            onClick={() => navigate("/sign-in")}
          >
            {reg.t("auth.sign_in")}
          </button>
        </p>
        <p className="mt-3 text-center text-xs leading-relaxed text-[var(--text-muted)] opacity-70">
          {reg.t("common.legal_agree_prefix")}{" "}
          <a
            className="underline text-[var(--text-tertiary)]"
            href="https://astermail.org/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            {reg.t("common.terms_of_service")}
          </a>{" "}
          {reg.t("common.and_word")}{" "}
          <a
            className="underline text-[var(--text-tertiary)]"
            href="https://astermail.org/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            {reg.t("common.privacy_policy")}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
