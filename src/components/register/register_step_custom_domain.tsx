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

import { SkipLink, StepShell } from "@/components/register/register_shared";

interface RegisterStepCustomDomainProps {
  reg: UseRegistrationReturn;
}

const ArrowIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    <path
      d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AtIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    <path
      d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 10-2.636 6.364"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg
    className="h-4 w-4 flex-shrink-0 text-txt-muted"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path
      d="M8.25 4.5l7.5 7.5-7.5 7.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface OptionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  on_click: () => void;
}

const OptionCard = ({
  icon,
  title,
  description,
  on_click,
}: OptionCardProps) => (
  <button
    className="flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-start transition-colors border-edge-secondary bg-surf-tertiary hover:bg-surf-secondary"
    type="button"
    onClick={on_click}
  >
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge-secondary text-txt-primary bg-surf-primary">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-txt-primary">
        {title}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-txt-tertiary">
        {description}
      </span>
    </span>
    <ChevronIcon />
  </button>
);

export const RegisterStepCustomDomain = ({
  reg,
}: RegisterStepCustomDomainProps) => {
  return (
    <StepShell
      step_key="custom_domain"
      subtitle={reg.t("auth.custom_domain_step_desc")}
      title={reg.t("auth.custom_domain_step_title")}
    >
      <div className="flex w-full flex-col gap-3">
        <OptionCard
          description={reg.t("auth.custom_domain_own_desc")}
          icon={<ArrowIcon />}
          on_click={() => void reg.handle_custom_domain_own()}
          title={reg.t("auth.custom_domain_own")}
        />
        <OptionCard
          description={reg.t("auth.custom_domain_new_desc")}
          icon={<AtIcon />}
          on_click={() => void reg.handle_custom_domain_new()}
          title={reg.t("auth.custom_domain_new")}
        />
      </div>

      <SkipLink
        label={reg.t("auth.skip_for_now")}
        on_click={() => void reg.handle_custom_domain_skip()}
      />
    </StepShell>
  );
};
