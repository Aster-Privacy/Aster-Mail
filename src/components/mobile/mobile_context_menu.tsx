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

import { memo, useCallback, useMemo } from "react";
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

import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { use_i18n } from "@/lib/i18n/context";

interface MobileContextMenuProps {
  email: InboxEmail | null;
  is_open: boolean;
  on_close: () => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_archive?: (email: InboxEmail) => void;
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
  on_snooze,
  on_delete,
}: MobileContextMenuProps) {
  const { t } = use_i18n();

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

    const result: {
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      on_action: () => void;
      destructive?: boolean;
    }[] = [];

    if (on_toggle_read) {
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
        label: t("mail.archive"),
        on_action: () => handle_action(on_archive),
      });
    }

    result.push({
      icon: FolderIcon,
      label: t("mail.move_to_folder"),
      on_action: on_close,
    });

    result.push({
      icon: TagIcon,
      label: t("mail.label"),
      on_action: on_close,
    });

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
    on_snooze,
    on_delete,
    on_close,
  ]);

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-2 pb-2">
        {email && (
          <div className="mb-2 px-4 pb-2 border-b border-[var(--border-primary)]">
            <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
              {email.sender_name}
            </p>
            <p className="truncate text-[13px] text-[var(--text-muted)]">
              {email.subject || t("mail.no_subject")}
            </p>
          </div>
        )}

        {items.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:bg-[var(--bg-tertiary)] ${
              item.destructive
                ? "text-[var(--color-danger,#ef4444)]"
                : "text-[var(--text-primary)]"
            }`}
            type="button"
            onClick={item.on_action}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="text-[15px]">{item.label}</span>
          </button>
        ))}

        <div className="mx-4 my-1 border-t border-[var(--border-primary)]" />

        <button
          className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_close}
        >
          {t("common.cancel")}
        </button>
      </div>
    </MobileBottomSheet>
  );
});
