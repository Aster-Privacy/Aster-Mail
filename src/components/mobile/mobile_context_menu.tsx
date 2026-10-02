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
import type { InboxEmail } from "@/types/email";
import type { MobileActionSheetItem } from "@aster/ui";

import { memo, useCallback, useMemo } from "react";
import { MobileContextMenuView } from "@aster/ui";
import {
  EnvelopeOpenIcon,
  EnvelopeIcon,
  StarIcon,
  ArchiveBoxIcon,
  FolderIcon,
  TagIcon,
  ClockIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface MobileContextMenuProps {
  email: InboxEmail | null;
  is_open: boolean;
  on_close: () => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_archive?: (email: InboxEmail) => void;
  on_move_to_folder?: (email: InboxEmail) => void;
  on_label?: (email: InboxEmail) => void;
  on_snooze?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
}

export const MobileContextMenu = memo(function MobileContextMenu({
  email,
  is_open,
  on_close,
  on_toggle_read,
  on_toggle_star,
  on_archive,
  on_move_to_folder,
  on_label,
  on_snooze,
  on_delete,
}: MobileContextMenuProps) {
  const { t } = use_i18n();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();

  const handle_action = useCallback(
    (action: (email: InboxEmail) => void) => {
      if (email) {
        action(email);
      }
      on_close();
    },
    [email, on_close],
  );

  const items = useMemo(() => {
    if (!email) return [];

    const result: MobileActionSheetItem[] = [];

    if (on_toggle_read && email.item_type !== "sent") {
      result.push({
        icon: email.is_read ? EnvelopeIcon : EnvelopeOpenIcon,
        label: email.is_read ? t("mail.mark_unread") : t("mail.mark_read"),
        on_action: () => handle_action(on_toggle_read),
      });
    }

    if (on_toggle_star) {
      result.push({
        icon: email.is_starred ? StarSolidIcon : StarIcon,
        label: email.is_starred ? t("mail.unstar") : t("mail.star"),
        on_action: () => handle_action(on_toggle_star),
      });
    }

    if (on_archive) {
      result.push({
        icon: ArchiveBoxIcon,
        label: t("mail.archive_action"),
        on_action: () => handle_action(on_archive),
      });
    }

    if (on_move_to_folder) {
      result.push({
        icon: FolderIcon,
        label: t("mail.move_to_folder"),
        on_action: () => handle_action(on_move_to_folder),
      });
    }

    if (on_label) {
      result.push({
        icon: TagIcon,
        label: t("mail.label"),
        on_action: () => handle_action(on_label),
      });
    }

    if (on_snooze) {
      result.push({
        icon: ClockIcon,
        label: t("mail.snooze"),
        on_action: () => handle_action(on_snooze),
      });
    }

    if (on_delete) {
      result.push({
        icon: TrashIcon,
        label: t("common.delete"),
        on_action: () => handle_action(on_delete),
        destructive: true,
      });
    }

    return result;
  }, [
    email,
    t,
    handle_action,
    on_toggle_read,
    on_toggle_star,
    on_archive,
    on_move_to_folder,
    on_label,
    on_snooze,
    on_delete,
  ]);

  return (
    <MobileContextMenuView
      aria_label={t("common.actions")}
      cancel_label={t("common.cancel")}
      is_open={is_open}
      items={items}
      reduce_motion={reduce_motion}
      safe_area_bottom={safe_area_insets.bottom}
      subtitle={email ? email.subject || t("mail.no_subject") : undefined}
      title={email ? email.sender_name : undefined}
      on_close={on_close}
    />
  );
});
