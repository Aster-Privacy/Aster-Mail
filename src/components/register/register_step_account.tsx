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
import { Button } from "@aster/ui";

import { apply_input_transform } from "@/utils/input_transform";
import { Input } from "@/components/ui/input";
import { sanitize_username_input } from "@/services/sanitize";
import { StepShell } from "@/components/register/register_shared";

interface RegisterStepAccountProps {
  reg: UseRegistrationReturn;
}

const TERMS_URL = "https://astermail.org/terms";
const PRIVACY_URL = "https://astermail.org/privacy";

export const RegisterStepAccount = ({ reg }: RegisterStepAccountProps) => {
  const is_busy = reg.step === "generating";
  const toggle_domain = () =>
    reg.set_email_domain(
      reg.email_domain === "astermail.org" ? "aster.cx" : "astermail.org",
    );

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
        <Input
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
        <button
          aria-label={reg.t("auth.switch_domain")}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-txt-muted transition-colors hover:text-txt-primary notranslate"
          tabIndex={-1}
          translate="no"
          type="button"
          onClick={toggle_domain}
        >
          @{reg.email_domain}
        </button>
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

      <Button
        className="mt-4 w-full"
        disabled={is_busy}
        is_loading={is_busy}
        size="xl"
        variant="depth"
        onClick={reg.handle_email_next}
      >
        {reg.t("common.next")}
      </Button>
      <Button as_child className="mt-2 w-full" size="xl" variant="secondary">
        <a href="/sign-in">{reg.t("common.back")}</a>
      </Button>

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
