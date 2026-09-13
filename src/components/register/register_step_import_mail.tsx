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
import type { TranslationKey } from "@/lib/i18n/types";

import {
  ChevronRightIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

import { SkipLink, StepShell } from "@/components/register/register_shared";
import { cn } from "@/lib/utils";

interface RegisterStepImportMailProps {
  reg: UseRegistrationReturn;
}

interface ImportSourceRow {
  id: string;
  icon: React.ReactNode;
  label_key: TranslationKey;
  description_key: TranslationKey;
}

const provider_logo = (src: string) => (
  <img
    alt=""
    aria-hidden="true"
    className="h-6 w-6 object-contain"
    src={src}
  />
);

const IMPORT_SOURCES: ImportSourceRow[] = [
  {
    id: "gmail",
    icon: provider_logo("/providers/gmail_logo.svg"),
    label_key: "settings.gmail_import",
    description_key: "settings.gmail_import_description",
  },
  {
    id: "outlook",
    icon: provider_logo("/providers/outlook_logo.svg"),
    label_key: "settings.outlook_import",
    description_key: "settings.outlook_import_description",
  },
  {
    id: "yahoo",
    icon: provider_logo("/providers/yahoo_mail_logo.svg"),
    label_key: "settings.yahoo_import",
    description_key: "settings.yahoo_import_description",
  },
  {
    id: "file",
    icon: <DocumentArrowUpIcon className="h-6 w-6 text-txt-primary" />,
    label_key: "settings.manual_import",
    description_key: "settings.manual_import_description",
  },
];

const LockIcon = () => (
  <svg
    className="h-3.5 w-3.5 flex-shrink-0"
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
      <div className="w-full overflow-hidden rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]">
        {IMPORT_SOURCES.map((source, index) => (
          <button
            key={source.id}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.04] disabled:cursor-default disabled:opacity-50 dark:hover:bg-white/[0.05]",
              index > 0 && "border-t border-edge-secondary",
            )}
            disabled={is_busy}
            type="button"
            onClick={() => void run(reg.handle_import_mail)}
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/[0.08]">
              {source.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-txt-primary">
                {reg.t(source.label_key)}
              </span>
              <span className="block truncate text-xs text-txt-tertiary">
                {reg.t(source.description_key)}
              </span>
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-txt-muted rtl:-scale-x-100" />
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-txt-muted">
        <LockIcon />
        <span>{reg.t("auth.import_mail_privacy_note")}</span>
      </p>

      <SkipLink
        disabled={is_busy}
        label={reg.t("auth.import_mail_skip")}
        on_click={() => void run(reg.handle_import_mail_skip)}
      />
    </StepShell>
  );
};
