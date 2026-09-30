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
import type { BimiLogoError } from "@/services/api/bimi";

import {
  CheckCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";

import { BIMI_ERROR_RULES, BIMI_RULES } from "./bimi_copy";

import { use_i18n } from "@/lib/i18n/context";

interface BimiRulesListProps {
  has_logo: boolean;
  errors: BimiLogoError[];
}

export function BimiRulesList({ has_logo, errors }: BimiRulesListProps) {
  const { t } = use_i18n();
  const failed = new Set(errors.map((code) => BIMI_ERROR_RULES[code]));
  const all_passed = has_logo && errors.length === 0;

  return (
    <section>
      <h3 className="text-sm font-medium text-txt-primary">
        {t("settings.bimi_rules_title")}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {BIMI_RULES.map(({ rule, label }) => {
          const is_failed = failed.has(rule);
          const Icon = is_failed
            ? XCircleIcon
            : all_passed
              ? CheckCircleIcon
              : MinusCircleIcon;
          const tone = is_failed
            ? "text-red-500"
            : all_passed
              ? "text-green-500"
              : "text-txt-muted";

          return (
            <li key={rule} className="flex items-start gap-2">
              <Icon
                aria-hidden="true"
                className={`mt-0.5 w-4 h-4 flex-shrink-0 ${tone}`}
              />
              <span
                className={`text-sm ${
                  is_failed ? "text-txt-primary" : "text-txt-secondary"
                }`}
              >
                {t(label)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
