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
import {
  EyeIcon,
  EyeSlashIcon,
  CheckIcon,
  LockClosedIcon,
} from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
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

export interface step_password_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
  navigate: NavigateFunction;
}

export function StepPassword({
  reg,
  reduce_motion,
  navigate,
}: step_password_props) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4">
        <motion.div
          animate="animate"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {reg.t("auth.secure_your_account")}
            </h1>
          </motion.div>

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {reg.t("auth.create_strong_password")}
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
            <label className={LABEL_CLASS}>{reg.t("auth.password")}</label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <div className={INPUT_ICON_CLASS}>
                <LockClosedIcon />
              </div>
              <Input
                autoComplete="new-password"
                className={INNER_INPUT_WITH_ICON_CLASS}
                id="register-password"
                maxLength={128}
                name="password"
                placeholder={reg.t("auth.new_password_placeholder")}
                status={reg.error ? "error" : "default"}
                type={reg.is_password_visible ? "text" : "password"}
                value={reg.password}
                onChange={(e) => {
                  reg.set_password(e.target.value);
                  reg.set_error("");
                }}
              />
              <button
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus:outline-none"
                type="button"
                onClick={() =>
                  reg.set_is_password_visible(!reg.is_password_visible)
                }
              >
                {reg.is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </motion.div>

          <motion.div
            className="mt-4"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className={LABEL_CLASS}>
              {reg.t("auth.confirm_password")}
            </label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <div className={INPUT_ICON_CLASS}>
                <LockClosedIcon />
              </div>
              <Input
                autoComplete="new-password"
                className={INNER_INPUT_WITH_ICON_CLASS}
                id="register-confirm-password"
                maxLength={128}
                name="confirm-password"
                placeholder={reg.t("auth.confirm_password_placeholder")}
                status={reg.error ? "error" : "default"}
                type={reg.is_confirm_password_visible ? "text" : "password"}
                value={reg.confirm_password}
                onChange={(e) => {
                  reg.set_confirm_password(e.target.value);
                  reg.set_error("");
                }}
                onKeyDown={(e) =>
                  e["key"] === "Enter" && reg.handle_password_next()
                }
              />
              <button
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus:outline-none"
                type="button"
                onClick={() =>
                  reg.set_is_confirm_password_visible(
                    !reg.is_confirm_password_visible,
                  )
                }
              >
                {reg.is_confirm_password_visible ? (
                  <EyeSlashIcon />
                ) : (
                  <EyeIcon />
                )}
              </button>
            </div>
          </motion.div>

          <motion.div
            className="mt-4"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                className="flex h-5 w-5 items-center justify-center rounded border transition-colors"
                style={{
                  backgroundColor: reg.remember_me
                    ? "#3b82f6"
                    : reg.is_dark
                      ? "#1f1f1f"
                      : "#ffffff",
                  borderColor: reg.remember_me
                    ? "#3b82f6"
                    : reg.is_dark
                      ? "#404040"
                      : "#d1d5db",
                }}
                type="button"
                onClick={() => reg.set_remember_me(!reg.remember_me)}
              >
                {reg.remember_me && <CheckIcon />}
              </button>
              <span className="text-sm text-[var(--text-secondary)]">
                {reg.t("auth.keep_signed_in")}
              </span>
            </label>
          </motion.div>

          <motion.div
            className="mt-3"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <ul className="space-y-1.5">
              {[
                {
                  met: reg.password.length >= 8,
                  label: reg.t("auth.password_req_length"),
                },
                {
                  met: /[A-Z]/.test(reg.password),
                  label: reg.t("auth.password_req_uppercase"),
                },
                {
                  met: /[a-z]/.test(reg.password),
                  label: reg.t("auth.password_req_lowercase"),
                },
                {
                  met: /[0-9]/.test(reg.password),
                  label: reg.t("auth.password_req_number"),
                },
              ].map(({ met, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    color: met ? "var(--color-success)" : "var(--text-muted)",
                    transition: "color 0.2s",
                  }}
                >
                  <AnimatePresence mode="wait">
                    {met ? (
                      <motion.svg
                        key="check"
                        animate={{ opacity: 1, scale: 1 }}
                        className="h-3 w-3 shrink-0"
                        exit={{ opacity: 0, scale: 0.5 }}
                        fill="none"
                        initial={{ opacity: 0, scale: 0 }}
                        stroke="currentColor"
                        strokeWidth="3"
                        transition={{
                          type: "tween",
                          ease: "easeOut",
                          duration: 0.2,
                        }}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </motion.svg>
                    ) : (
                      <motion.span
                        key="dot"
                        animate={{ opacity: 1 }}
                        className="flex h-3 w-3 shrink-0 items-center justify-center"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                      >
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: "currentColor" }}
                        />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span className="transition-colors duration-200">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </div>

      <div className="shrink-0 px-6 pb-4 pt-4 space-y-4">
        <TurnstileWidget
          class_name="flex justify-center"
          on_expire={() => reg.set_captcha_token("")}
          on_verify={reg.set_captcha_token}
        />
        <motion.button
          className={DEPTH_CTA_CLASS}
          disabled={!!TURNSTILE_SITE_KEY && !reg.captcha_token}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={reg.handle_password_next}
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
      </div>
    </div>
  );
}
