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
import { useState } from "react";
import { ChevronRightIcon, LockClosedIcon } from "@heroicons/react/24/outline";

import { SafetyNumberDialog } from "./safety_number_dialog";
import { use_safety_number_state } from "./use_safety_number_state";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";
import { is_internal_email } from "@/services/api/keys";

function from_info(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-safety-number-info]") !== null
  );
}

interface SafetyNumberSectionProps {
  emails: string[];
  name: string;
}

export function SafetyNumberSection({
  emails,
  name,
}: SafetyNumberSectionProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const email =
    emails
      .map((value) => value.trim())
      .find((value) => is_internal_email(value)) ?? null;
  const state = use_safety_number_state(email);

  if (!email || !state) return null;

  const label = name.trim() || email;
  const status =
    state === "verified"
      ? t("common.safety_number_verified")
      : state === "changed"
        ? t("common.safety_number_status_changed")
        : t("common.safety_number_not_verified");

  return (
    <>
      <h3 className="aster_island_section_title mb-2 mt-6 px-1">
        {t("common.safety_number_section_title")}
      </h3>
      <div className="aster_island aster_island_divided">
        <div
          className="aster_island_row aster_island_row_pressable contact_view_row items-center"
          data-testid="contact_view_row_safety_number"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            if (from_info(event.target)) return;
            set_is_open(true);
          }}
          onKeyDown={(event) => {
            if (from_info(event.target)) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              set_is_open(true);
            }
          }}
        >
          <span className="aster_island_row_icon contact_view_row_icon">
            <LockClosedIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="aster_island_row_text">
            <span className="aster_island_row_label">
              {t("common.safety_number")}
            </span>
          </div>
          <div className="aster_island_row_trailing">
            {state === "changed" && (
              <span data-safety-number-info="">
                <InfoPopover
                  description={t("common.safety_number_changed_description", {
                    name: label,
                  })}
                  title={t("common.safety_number_changed")}
                />
              </span>
            )}
            <span className="aster_island_row_value">{status}</span>
            <ChevronRightIcon className="h-3 w-3 shrink-0 text-txt-muted rtl:-scale-x-100" />
          </div>
        </div>
      </div>
      <SafetyNumberDialog
        email={email}
        is_open={is_open}
        name={name}
        on_close={() => set_is_open(false)}
      />
    </>
  );
}
