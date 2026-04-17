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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { motion, AnimatePresence } from "framer-motion";
import { Button, Checkbox } from "@aster/ui";

import {
  Logo,
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
} from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { PasswordStrengthIndicator } from "@/components/register/password_strength";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { Alert } from "@/components/register/register_shared";

interface RegisterStepPasswordProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepPassword = ({ reg }: RegisterStepPasswordProps) => {
  return (
    <motion.div
      key="password"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.secure_your_account")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.create_strong_password")}
      </p>

      <AnimatePresence>
        {reg.error && <Alert is_dark={reg.is_dark} message={reg.error} />}
      </AnimatePresence>

      <div className={`w-full ${reg.error ? "mt-4" : "mt-6"} space-y-4`}>
        <div>
          <InputWithEndContent
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            autoComplete="new-password"
            end_content={
              <button
                className="focus:outline-none flex items-center justify-center"
                type="button"
                onClick={() =>
                  reg.set_is_password_visible(!reg.is_password_visible)
                }
              >
                {reg.is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            }
            maxLength={128}
            placeholder={reg.t("auth.password")}
            status={reg.error ? "error" : "default"}
            type={reg.is_password_visible ? "text" : "password"}
            value={reg.password}
            onBlur={reg.handle_password_blur}
            onChange={(e) => reg.set_password(e.target.value)}
          />
          <PasswordStrengthIndicator password={reg.password} />
          {reg.password_breach_warning && (
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-warning, #f59e0b)" }}
            >
              This password has appeared in a data breach. Consider using a
              different one.
            </p>
          )}
        </div>

        <InputWithEndContent
          autoComplete="new-password"
          end_content={
            <button
              className="focus:outline-none flex items-center justify-center"
              type="button"
              onClick={() =>
                reg.set_is_confirm_password_visible(
                  !reg.is_confirm_password_visible,
                )
              }
            >
              {reg.is_confirm_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          }
          maxLength={128}
          placeholder={reg.t("auth.confirm_password")}
          status={reg.error ? "error" : "default"}
          type={reg.is_confirm_password_visible ? "text" : "password"}
          value={reg.confirm_password}
          onChange={(e) => reg.set_confirm_password(e.target.value)}
          onKeyDown={(e) => e["key"] === "Enter" && reg.handle_password_next()}
        />
      </div>

      <ul className="w-full mt-3 space-y-1.5">
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
            }}
          >
            {met ? (
              <svg
                className="w-3 h-3 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <span className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: "currentColor" }}
                />
              </span>
            )}
            <span>{label}</span>
          </li>
        ))}
      </ul>

      <div className="w-full mt-4">
        <Checkbox
          checked={reg.remember_me}
          label={`${reg.t("auth.keep_signed_in")} - ${reg.t("auth.secure_devices_only")}`}
          onChange={() => reg.set_remember_me(!reg.remember_me)}
        />
      </div>

      <TurnstileWidget
        on_expire={() => reg.set_captcha_token("")}
        on_verify={reg.set_captcha_token}
      />

      <div className="flex items-center gap-3 w-full mt-6">
        <Button
          className="flex-1"
          size="xl"
          variant="secondary"
          onClick={() => {
            reg.set_error("");
            reg.set_step("email");
          }}
        >
          {reg.t("common.back")}
        </Button>
        <Button
          className="flex-1"
          disabled={!!TURNSTILE_SITE_KEY && !reg.captcha_token}
          size="xl"
          variant="depth"
          onClick={reg.handle_password_next}
        >
          {reg.t("common.next")}
        </Button>
      </div>
    </motion.div>
  );
};
