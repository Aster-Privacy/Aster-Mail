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
import { PasswordStrengthRing } from "@/components/register/password_strength";
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
    <OnboardingInput className={`pe-16 ${className ?? ""}`} {...props} />
    <div className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted">
      {end_content}
    </div>
  </div>
);

export const RegisterStepPassword = ({ reg }: RegisterStepPasswordProps) => {
  const is_captcha_pending = !!TURNSTILE_SITE_KEY && !reg.captcha_token;

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
        className="flex items-center justify-center focus:outline-none"
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
      <div className="w-full space-y-3">
        <OnboardingInputWithEndContent
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          autoComplete="new-password"
          end_content={
            <span className="flex items-center gap-2">
              <PasswordStrengthRing password={reg.password} />
              {eye_button(reg.is_password_visible, () =>
                reg.set_is_password_visible(!reg.is_password_visible),
              )}
            </span>
          }
          maxLength={128}
          placeholder={reg.t("auth.password")}
          status={reg.error ? "error" : "default"}
          type={reg.is_password_visible ? "text" : "password"}
          value={reg.password}
          onBlur={reg.handle_password_blur}
          onChange={(e) => reg.set_password(clamp_password(e.target.value))}
        />
        <OnboardingInputWithEndContent
          autoComplete="new-password"
          end_content={eye_button(reg.is_confirm_password_visible, () =>
            reg.set_is_confirm_password_visible(
              !reg.is_confirm_password_visible,
            ),
          )}
          maxLength={128}
          placeholder={reg.t("auth.confirm_password")}
          status={reg.error ? "error" : "default"}
          type={reg.is_confirm_password_visible ? "text" : "password"}
          value={reg.confirm_password}
          onChange={(e) =>
            reg.set_confirm_password(clamp_password(e.target.value))
          }
          onKeyDown={(e) => {
            if (e["key"] !== "Enter") return;
            if (is_captcha_pending) return;
            void reg.handle_password_next();
          }}
        />
      </div>

      <AnimatePresence>
        {(reg.error || reg.password_breach_warning) && (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-2 text-start text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              color: reg.error
                ? reg.is_dark
                  ? "#f87171"
                  : "#dc2626"
                : "var(--color-warning, #f59e0b)",
            }}
            transition={{ duration: 0.15 }}
          >
            {reg.error || reg.t("auth.password_breach_warning")}
          </motion.p>
        )}
      </AnimatePresence>

      <TurnstileWidget
        on_expire={() => reg.set_captcha_token("")}
        on_verify={reg.set_captcha_token}
      />

      <OnboardingButton
        className="mt-4 w-full"
        disabled={is_captcha_pending}
        variant="primary"
        onClick={reg.handle_password_next}
      >
        {reg.t("common.next")}
      </OnboardingButton>
      {!reg.is_claim && (
        <OnboardingButton
          className="mt-2 w-full"
          variant="secondary"
          onClick={() => {
            reg.set_error("");
            reg.set_step("email");
          }}
        >
          {reg.t("common.back")}
        </OnboardingButton>
      )}
    </StepShell>
  );
};
