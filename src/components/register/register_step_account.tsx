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

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { apply_input_transform } from "@/utils/input_transform";
import { sanitize_username_input } from "@/services/sanitize";
import {
  OnboardingButton,
  OnboardingInput,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepAccountProps {
  reg: UseRegistrationReturn;
}

const TERMS_URL = "https://astermail.org/terms";
const PRIVACY_URL = "https://astermail.org/privacy";

export const RegisterStepAccount = ({ reg }: RegisterStepAccountProps) => {
  const input_ref = useRef<HTMLInputElement>(null);
  const is_busy = reg.step === "generating";
  const domains = ["astermail.org", "aster.cx"] as const;

  return (
    <StepShell
      step_key="email"
      subtitle={reg.t("auth.welcome_workspace_subtitle")}
      title={reg.t("auth.create_your_account")}
    >
      <AnimatePresence>
        {reg.is_abuse_blocked && (
          <motion.div
            animate={{ opacity: 1 }}
            className="mb-4 w-full"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p
              className="text-sm text-center"
              style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
            >
              {reg.t("auth.abuse_flagged_message")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full">
        <OnboardingInput
          ref={input_ref}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          className="notranslate pe-32"
          disabled={is_busy}
          maxLength={55}
          placeholder={reg.t("auth.username_placeholder")}
          spellCheck={false}
          status={reg.error ? "error" : "default"}
          translate="no"
          type="text"
          value={reg.username}
          onChange={(e) => {
            const raw = e.target.value;
            const at_index = raw.indexOf("@");

            if (at_index !== -1) {
              const local = sanitize_username_input(raw.substring(0, at_index));
              const domain_part = raw.substring(at_index + 1).toLowerCase();

              reg.set_username(local);
              if (domain_part.endsWith("aster.cx")) {
                reg.set_email_domain("aster.cx");
              } else if (domain_part.endsWith("astermail.org")) {
                reg.set_email_domain("astermail.org");
              }
            } else {
              reg.set_username(
                apply_input_transform(e.target, sanitize_username_input),
              );
            }
          }}
          onKeyDown={(e) => e["key"] === "Enter" && reg.handle_email_next()}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={reg.t("auth.switch_domain")}
              className="absolute end-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-txt-secondary transition-colors hover:bg-black/5 hover:text-txt-primary dark:hover:bg-white/5 notranslate"
              tabIndex={-1}
              translate="no"
              type="button"
            >
              @{reg.email_domain}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              input_ref.current?.focus();
            }}
          >
            {domains.map((domain) => (
              <DropdownMenuItem
                key={domain}
                className="notranslate"
                translate="no"
                onClick={() => reg.set_email_domain(domain)}
              >
                @{domain}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AnimatePresence>
        {reg.error && !reg.is_abuse_blocked && (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-2 text-start text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
            transition={{ duration: 0.15 }}
          >
            {reg.error}
          </motion.p>
        )}
      </AnimatePresence>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={is_busy}
        is_loading={is_busy}
        variant="primary"
        onClick={reg.handle_email_next}
      >
        {reg.t("common.next")}
      </OnboardingButton>
      <OnboardingButton as_child className="mt-2" variant="secondary">
        <a href="/sign-in">{reg.t("common.back")}</a>
      </OnboardingButton>

      <p className="mt-5 text-xs leading-relaxed text-txt-muted">
        {reg.t("auth.terms_footer_next")}{" "}
        <a
          className="underline hover:text-txt-primary"
          href={TERMS_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {reg.t("auth.terms_of_service")}
        </a>{" "}
        {reg.t("common.and")}{" "}
        <a
          className="underline hover:text-txt-primary"
          href={PRIVACY_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {reg.t("auth.privacy_policy")}
        </a>
        .
      </p>
    </StepShell>
  );
};
