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
import { useEffect, useState } from "react";
import { CheckIcon, Square2StackIcon } from "@heroicons/react/24/outline";

import { DropdownMenuItem } from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";

export const SENDER_ADDRESS_COPIED_RESET_MS = 1600;

interface SenderAddressCopyRowProps {
  email: string;
  on_copy: () => Promise<boolean>;
}

export function SenderAddressCopyRow({
  email,
  on_copy,
}: SenderAddressCopyRowProps) {
  const { t } = use_i18n();
  const [is_copied, set_is_copied] = useState(false);

  useEffect(() => {
    if (!is_copied) return;
    const timer = window.setTimeout(
      () => set_is_copied(false),
      SENDER_ADDRESS_COPIED_RESET_MS,
    );

    return () => window.clearTimeout(timer);
  }, [is_copied]);

  useEffect(() => {
    set_is_copied(false);
  }, [email]);

  const StatusIcon = is_copied ? CheckIcon : Square2StackIcon;

  return (
    <DropdownMenuItem
      aria-label={t("common.copy_address")}
      className="-mx-2 mt-1.5 text-[13px] text-txt-secondary"
      data-copied={is_copied ? "true" : "false"}
      data-testid="sender_address_copy_row"
      title={t("common.copy_address")}
      onSelect={(event) => {
        event.preventDefault();
        void on_copy().then((copied) => {
          if (copied) set_is_copied(true);
        });
      }}
    >
      <span
        className="min-w-0 flex-1 truncate text-start"
        data-testid="sender_address_copy_value"
        dir="ltr"
        translate="no"
      >
        {email}
      </span>
      <StatusIcon
        aria-hidden="true"
        className={is_copied ? "text-txt-primary" : "text-txt-muted"}
        data-testid="sender_address_copy_icon"
      />
      <span aria-live="polite" className="sr-only" role="status">
        {is_copied ? t("common.copied") : ""}
      </span>
    </DropdownMenuItem>
  );
}
