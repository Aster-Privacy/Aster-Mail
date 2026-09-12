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

import { AnimatePresence, motion } from "framer-motion";
import { Tooltip } from "@aster/ui";

import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { PasswordStrengthIndicator } from "@/components/register/password_strength";
import {
  OnboardingButton,
  OnboardingInput,
  StepShell,
} from "@/components/register/register_shared";
import { clamp_password } from "@/services/sanitize";

interface RegisterStepPasswordProps {
  reg: UseRegistrationReturn;
}

interface OnboardingInputWithEndContentProps
  extends React.ComponentProps<typeof OnboardingInput> {
  end_content: React.ReactNode;
}

const OnboardingInputWithEndContent = ({
  end_content,
  className,
  ...props
}: OnboardingInputWithEndContentProps) => (
  <div className="relative">
    <OnboardingInput className={`pe-12 ${className ?? ""}`} {...props} />
    <div className="absolute end-3 top-1/2 flex -translate-y-1/2 items-center text-txt-muted">
      {end_content}
    </div>
  </div>
);

const CheckIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      clipRule="evenodd"
      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L9 10.94 7.28 9.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z"
      fillRule="evenodd"
    />
  </svg>
);

interface RuleRowProps {
  label: string;
  met: boolean;
}

const RuleRow = ({ label, met }: RuleRowProps) => (
  <li className="flex items-center gap-2.5">
    <span
      className={`flex-shrink-0 transition-all duration-200 ${
        met
          ? "text-[var(--color-success,#16a34a)]"
          : "text-txt-muted opacity-40"
      }`}
    >
      <CheckIcon />
    </span>
    <span
      className={`text-xs transition-colors duration-200 ${
        met ? "text-txt-primary" : "text-txt-tertiary"
      }`}
    >
      {label}
    </span>
  </li>
);

export const RegisterStepPassword = ({ reg }: RegisterStepPasswordProps) => {
  const is_captcha_pending = !!TURNSTILE_SITE_KEY && !reg.captcha_token;
  const password = reg.password;
  const has_length = password.length >= 8;
  const has_case = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const has_number = /[0-9]/.test(password);
  const has_match =
    reg.confirm_password.length > 0 && reg.confirm_password === password;
  const mismatch_message = reg.t("auth.passwords_do_not_match_register");
  const is_mismatch_error = reg.error === mismatch_message;
  const is_password_error = !!reg.error && !is_mismatch_error;

  const clear_error = () => {
    if (reg.error) reg.set_error("");
  };

  const submit = () => {
    if (is_captcha_pending) {
      reg.set_error(reg.t("auth.complete_captcha_first"));

      return;
    }
    void reg.handle_password_next();
  };

  const eye_button = (visible: boolean, toggle: () => void) => (
    <Tooltip
      tip={
        visible
          ? reg.t("settings.hide_password_toggle")
          : reg.t("settings.show_password_toggle")
      }
    >
      <button
        aria-label={
          visible
            ? reg.t("settings.hide_password_toggle")
            : reg.t("settings.show_password_toggle")
        }
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:text-txt-primary focus:outline-none"
        tabIndex={-1}
        type="button"
        onClick={toggle}
      >
        {visible ? <EyeSlashIcon /> : <EyeIcon />}
      </button>
    </Tooltip>
  );

  return (
    <StepShell
      step_key="password"
      subtitle={reg.t("auth.recommend_strong_password")}
      title={reg.t("auth.create_a_password")}
    >
      <form
        noValidate
        className="w-full"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="w-full space-y-3">
          <div>
            <OnboardingInputWithEndContent
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              autoComplete="new-password"
              end_content={eye_button(reg.is_password_visible, () =>
                reg.set_is_password_visible(!reg.is_password_visible),
              )}
              maxLength={128}
              placeholder={reg.t("auth.password")}
              status={is_password_error ? "error" : "default"}
              type={reg.is_password_visible ? "text" : "password"}
              value={password}
              onBlur={reg.handle_password_blur}
              onChange={(e) => {
                clear_error();
                reg.set_password(clamp_password(e.target.value));
              }}
            />
            <AnimatePresence initial={false}>
              {password.length > 0 && (
                <motion.div
                  animate={{ opacity: 1, height: "auto" }}
                  className="overflow-hidden"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <PasswordStrengthIndicator
                    password={password}
                    show_suggestions={false}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <OnboardingInputWithEndContent
            autoComplete="new-password"
            end_content={eye_button(reg.is_confirm_password_visible, () =>
              reg.set_is_confirm_password_visible(
                !reg.is_confirm_password_visible,
              ),
            )}
            maxLength={128}
            placeholder={reg.t("auth.confirm_password")}
            status={is_mismatch_error ? "error" : "default"}
            type={reg.is_confirm_password_visible ? "text" : "password"}
            value={reg.confirm_password}
            onChange={(e) => {
              clear_error();
              reg.set_confirm_password(clamp_password(e.target.value));
            }}
          />
        </div>

        <ul className="mt-3 flex flex-col gap-2 rounded-xl border border-edge-secondary bg-surf-tertiary px-4 py-3">
          <RuleRow
            label={reg.t("auth.password_rule_length")}
            met={has_length}
          />
          <RuleRow label={reg.t("auth.password_rule_case")} met={has_case} />
          <RuleRow
            label={reg.t("auth.password_rule_number")}
            met={has_number}
          />
          <RuleRow label={reg.t("auth.passwords_match")} met={has_match} />
        </ul>

        <AnimatePresence initial={false}>
          {(reg.error || reg.password_breach_warning) && (
            <motion.p
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden text-start text-xs"
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0 }}
              role="alert"
              style={{
                color: reg.error
                  ? reg.is_dark
                    ? "#f87171"
                    : "#dc2626"
                  : "var(--color-warning, #f59e0b)",
              }}
              transition={{ duration: 0.15 }}
            >
              <span className="block pt-2">
                {reg.error || reg.t("auth.password_breach_warning")}
              </span>
            </motion.p>
          )}
        </AnimatePresence>

        <TurnstileWidget
          on_expire={() => reg.set_captcha_token("")}
          on_verify={reg.set_captcha_token}
        />

        <OnboardingButton
          className="mt-4 w-full"
          type="submit"
          variant="primary"
        >
          {reg.t("common.next")}
        </OnboardingButton>
        {!reg.is_claim && (
          <OnboardingButton
            className="mt-2 w-full"
            type="button"
            variant="secondary"
            onClick={() => {
              reg.set_error("");
              reg.set_step("email");
            }}
          >
            {reg.t("common.back")}
          </OnboardingButton>
        )}
      </form>
    </StepShell>
  );
};
