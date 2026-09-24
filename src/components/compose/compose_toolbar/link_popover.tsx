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

import { LinkPopover as SharedLinkPopover } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export function LinkPopover({
  open,
  anchor_ref,
  selected_text,
  on_close,
  on_insert,
}: {
  open: boolean;
  anchor_ref: React.RefObject<HTMLButtonElement | null>;
  selected_text: string;
  on_close: () => void;
  on_insert: (url: string, text?: string) => void;
}) {
  const { t } = use_i18n();

  return (
    <SharedLinkPopover
      anchor_ref={anchor_ref}
      labels={{
        url_placeholder: t("mail.url_placeholder"),
        display_text_placeholder: t("mail.display_text_placeholder"),
        invalid_url: t("common.please_enter_valid_url"),
        cancel: t("common.cancel"),
        insert: t("mail.insert_link"),
      }}
      open={open}
      selected_text={selected_text}
      on_close={on_close}
      on_insert={on_insert}
    />
  );
}
