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
import { Square2StackIcon } from "@heroicons/react/24/outline";

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

  return (
    <DropdownMenuItem
      className="gap-2 cursor-pointer"
      data-copied={is_copied ? "true" : "false"}
      data-testid="sender_address_copy_row"
      onSelect={(event) => {
        event.preventDefault();
        void on_copy().then((copied) => {
          if (copied) set_is_copied(true);
        });
      }}
    >
      <Square2StackIcon
        aria-hidden="true"
        className="w-4 h-4 flex-shrink-0"
        data-testid="sender_address_copy_icon"
      />
      <span className="flex-1" data-testid="sender_address_copy_label">
        {is_copied ? t("common.copied") : t("common.copy_address")}
      </span>
      <span aria-live="polite" className="sr-only" role="status">
        {is_copied ? t("common.copied") : ""}
      </span>
    </DropdownMenuItem>
  );
}
