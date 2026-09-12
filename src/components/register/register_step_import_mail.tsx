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

import { useState } from "react";

import {
  OnboardingButton,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepImportMailProps {
  reg: UseRegistrationReturn;
}

const LockIcon = () => (
  <svg
    className="h-4 w-4 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    <path
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InboxIcon = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
  >
    <path
      d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RegisterStepImportMail = ({
  reg,
}: RegisterStepImportMailProps) => {
  const [is_busy, set_is_busy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (is_busy) return;
    set_is_busy(true);
    try {
      await fn();
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <StepShell
      step_key="import_mail"
      subtitle={reg.t("auth.import_mail_step_desc")}
      title={reg.t("auth.import_mail_step_title")}
    >
      <div className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-black/[0.05] px-4 py-3.5 dark:bg-white/[0.08]">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-txt-primary shadow-sm dark:bg-white/[0.08]">
          <InboxIcon />
        </span>
        <div className="flex items-start gap-2 text-sm leading-snug text-txt-secondary">
          <span className="mt-0.5 text-txt-muted">
            <LockIcon />
          </span>
          <span>{reg.t("auth.import_mail_privacy_note")}</span>
        </div>
      </div>

      <OnboardingButton
        className="mt-4"
        disabled={is_busy}
        is_loading={is_busy}
        variant="primary"
        onClick={() => void run(reg.handle_import_mail)}
      >
        {reg.t("auth.import_mail_action")}
      </OnboardingButton>

      <SkipLink
        disabled={is_busy}
        label={reg.t("auth.import_mail_skip")}
        on_click={() => void run(reg.handle_import_mail_skip)}
      />
    </StepShell>
  );
};
