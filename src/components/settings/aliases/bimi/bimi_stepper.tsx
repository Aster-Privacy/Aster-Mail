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
import { CheckIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";

interface BimiStepperProps {
  current: 1 | 2;
}

export function BimiStepper({ current }: BimiStepperProps) {
  const { t } = use_i18n();
  const steps = [
    { number: 1, label: t("settings.bimi_step_logo") },
    { number: 2, label: t("settings.bimi_step_publish") },
  ];

  return (
    <ol
      aria-label={t("settings.bimi_step_of", { current, total: steps.length })}
      className="flex items-center gap-3"
    >
      {steps.map((step, index) => {
        const done = step.number < current;
        const active = step.number === current;

        return (
          <li
            key={step.number}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 items-center gap-3"
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`h-px w-8 flex-shrink-0 sm:w-12 ${
                  done || active ? "bg-brand" : "bg-edge-secondary"
                }`}
              />
            )}
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                done
                  ? "border-brand bg-brand text-white"
                  : active
                    ? "border-brand text-brand"
                    : "border-edge-secondary text-txt-muted"
              }`}
            >
              {done ? (
                <CheckIcon aria-hidden="true" className="w-3.5 h-3.5" />
              ) : (
                step.number
              )}
            </span>
            <span
              className={`truncate text-sm ${
                active ? "font-medium text-txt-primary" : "text-txt-muted"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
