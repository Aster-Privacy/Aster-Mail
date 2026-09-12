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

import { apply_input_transform } from "@/utils/input_transform";
import { sanitize_username_input } from "@/services/sanitize";
import { create_alias } from "@/services/api/aliases/crud";
import { validate_local_part } from "@/services/api/aliases/validate";
import {
  CheckCircleIcon,
  OnboardingButton,
  OnboardingInput,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepAddressesProps {
  reg: UseRegistrationReturn;
}

const ADDRESS_SLOTS = [0, 1, 2];

const starts_and_ends_alphanumeric = (value: string) =>
  /^[a-z0-9]/i.test(value) && /[a-z0-9]$/i.test(value);

export const RegisterStepAddresses = ({ reg }: RegisterStepAddressesProps) => {
  const [values, set_values] = useState<string[]>(["", "", ""]);
  const [errors, set_errors] = useState<string[]>(["", "", ""]);
  const [is_adding, set_is_adding] = useState(false);

  const pending_count = values.filter(
    (value, index) => value.trim() && !reg.added_addresses[index],
  ).length;

  const handle_add = async () => {
    if (is_adding) return;
    const next_errors = ["", "", ""];
    let has_error = false;

    for (const index of ADDRESS_SLOTS) {
      const value = values[index].trim();

      if (!value || reg.added_addresses[index]) continue;
      if (!starts_and_ends_alphanumeric(value)) {
        next_errors[index] = reg.t("auth.address_must_begin_end_alphanumeric");
        has_error = true;
        continue;
      }
      const validation = validate_local_part(value);

      if (!validation.valid) {
        next_errors[index] = validation.error ?? "";
        has_error = true;
      }
    }
    set_errors(next_errors);
    if (has_error || pending_count === 0) return;

    set_is_adding(true);
    const added = [...reg.added_addresses];

    for (const index of ADDRESS_SLOTS) {
      const value = values[index].trim();

      if (!value || added[index]) continue;
      const response = await create_alias(value, reg.email_domain);

      if (response.error || !response.data) {
        next_errors[index] =
          response.error ?? reg.t("settings.alias_create_failed");
        continue;
      }
      added[index] = `${value}@${reg.email_domain}`;
    }
    reg.set_added_addresses(added);
    set_errors([...next_errors]);
    set_is_adding(false);
  };

  const has_added = reg.added_addresses.some(Boolean);

  return (
    <StepShell
      step_key="addresses"
      subtitle={reg.t("auth.addresses_step_desc")}
      title={reg.t("auth.addresses_step_title")}
    >
      <div className="flex w-full flex-col gap-3">
        {ADDRESS_SLOTS.map((index) => {
          const done = !!reg.added_addresses[index];

          return (
            <div key={index} className="w-full">
              <div className="relative">
                <OnboardingInput
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  className="notranslate pe-32"
                  disabled={done || is_adding}
                  maxLength={64}
                  placeholder={reg.t("auth.address_n", {
                    n: String(index + 1),
                  })}
                  spellCheck={false}
                  status={
                    errors[index] ? "error" : done ? "success" : "default"
                  }
                  translate="no"
                  type="text"
                  value={values[index]}
                  onChange={(e) => {
                    const next = [...values];

                    next[index] = apply_input_transform(
                      e.target,
                      sanitize_username_input,
                    );
                    set_values(next);
                    if (errors[index]) {
                      const next_errors = [...errors];

                      next_errors[index] = "";
                      set_errors(next_errors);
                    }
                  }}
                  onKeyDown={(e) => e["key"] === "Enter" && void handle_add()}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-sm text-txt-muted notranslate">
                  @{reg.email_domain}
                  {done && (
                    <span style={{ color: "var(--color-success)" }}>
                      <CheckCircleIcon />
                    </span>
                  )}
                </span>
              </div>
              {errors[index] && (
                <p
                  className="mt-1.5 text-start text-xs"
                  style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
                >
                  {errors[index]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={is_adding || pending_count === 0}
        is_loading={is_adding}
        variant="primary"
        onClick={() => void handle_add()}
      >
        {reg.t("common.add")}
      </OnboardingButton>

      <SkipLink
        disabled={is_adding}
        label={
          has_added ? reg.t("common.continue") : reg.t("auth.skip_for_now")
        }
        on_click={reg.handle_addresses_continue}
      />
    </StepShell>
  );
};
