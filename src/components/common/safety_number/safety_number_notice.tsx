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
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import { SafetyNumberDialog } from "./safety_number_dialog";
import { use_safety_number_state } from "./use_safety_number_state";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import { is_internal_email } from "@/services/api/keys";

interface SafetyNumberNoticeProps {
  email: string | null | undefined;
  name?: string | null;
}

export function SafetyNumberNotice({ email, name }: SafetyNumberNoticeProps) {
  const { t } = use_i18n();
  const [is_dialog_open, set_is_dialog_open] = useState(false);
  const [is_popover_open, set_is_popover_open] = useState(false);
  const target = email && is_internal_email(email) ? email : null;
  const state = use_safety_number_state(target);

  if (!target || state !== "changed") return null;

  const display_name = name?.trim() || target;

  return (
    <>
      <Popover open={is_popover_open} onOpenChange={set_is_popover_open}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("common.safety_number_changed")}
            className="-m-1 inline-flex items-center justify-center flex-shrink-0 p-1 text-txt-muted hover:text-txt-secondary transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            data-testid="safety_number_notice"
            type="button"
          >
            <InformationCircleIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="aster_info_popover z-[200]"
          collisionPadding={12}
          sideOffset={6}
        >
          <p className="aster_info_popover_title">
            <InformationCircleIcon aria-hidden="true" />
            <span>{t("common.safety_number_changed")}</span>
          </p>
          <p className="aster_info_popover_body">
            {t("common.safety_number_changed_description", {
              name: display_name,
            })}
          </p>
          <button
            className="aster_info_popover_link"
            type="button"
            onClick={() => {
              set_is_popover_open(false);
              set_is_dialog_open(true);
            }}
          >
            {t("common.safety_number_compare")}
          </button>
        </PopoverContent>
      </Popover>
      <SafetyNumberDialog
        email={target}
        is_open={is_dialog_open}
        name={name?.trim() ?? ""}
        on_close={() => set_is_dialog_open(false)}
      />
    </>
  );
}
