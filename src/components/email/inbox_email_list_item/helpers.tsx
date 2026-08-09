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
import type { AttachmentPreviewEntry } from "@/hooks/use_attachment_previews";

import {     useRef, } from "react";
import {
  StarIcon,
} from "@heroicons/react/24/outline";
import {
  StarIcon as StarIconSolid,
} from "@heroicons/react/24/solid";
import {  Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { is_compact_density, } from "@/lib/list_density";
import { truncate_with_ellipsis } from "@/utils/preview_text";
import {
  type SelectionSnapshot,
} from "@/components/email/inbox/selection_snapshot";


export interface InboxEmailListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  email: InboxEmail;
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  show_message_size?: boolean;
  show_thread_count?: boolean;
  search_preview_node?: React.ReactNode;
  current_view?: string;
  is_active?: boolean;
  is_focused?: boolean;
  selection?: React.RefObject<SelectionSnapshot>;
  on_toggle_select: (id: string) => void;
  on_email_click: (id: string) => void;
  on_archive?: (email: InboxEmail) => void;
  on_spam?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_restore?: (email: InboxEmail) => void;
  on_move_to_inbox?: (email: InboxEmail) => void;
  on_mark_not_spam?: (email: InboxEmail) => void;
  attachment_previews?: AttachmentPreviewEntry;
}

export function format_email_size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function get_density_classes(density: string, compact_mode: boolean): string {
  return is_compact_density(density, compact_mode) ? "py-1.5" : "py-2";
}

export const PREVIEW_CHAR_CAP = 140;

export function truncate_preview(preview: string, max_cap?: number): string {
  const char_budget = Math.min(max_cap ?? PREVIEW_CHAR_CAP, PREVIEW_CHAR_CAP);

  return truncate_with_ellipsis(preview, char_budget);
}

export function format_mobile_timestamp(timestamp: string): string {
  if (timestamp.includes("/") || timestamp.includes("-")) {
    const parts = timestamp.split(/[/\-]/);

    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  return timestamp;
}

export function StarToggleButton({
  email,
  on_toggle_star,
}: {
  email: InboxEmail;
  on_toggle_star: (email: InboxEmail) => void;
}) {
  const { t } = use_i18n();
  const star_ref = useRef<HTMLButtonElement>(null);

  const handle_click = () => {
    on_toggle_star(email);
    const el = star_ref.current;

    if (el) {
      el.style.transform = "scale(1.35)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = "scale(1)";
        });
      });
    }
  };

  return (
    <Tooltip tip={email.is_starred ? t("mail.unstar") : t("mail.star")}>
      <button
        ref={star_ref}
        className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
        onClick={handle_click}
      >
        {email.is_starred ? (
          <StarIconSolid className="w-4 h-4 text-amber-400" />
        ) : (
          <StarIcon className="w-4 h-4 text-txt-muted" />
        )}
      </button>
    </Tooltip>
  );
}

export function sweep_drag_images(): void {
  document
    .querySelectorAll('[data-astermail-drag-image="1"]')
    .forEach((node) => node.remove());
}

if (typeof window !== "undefined") {
  window.addEventListener("dragend", sweep_drag_images);
  window.addEventListener("drop", sweep_drag_images);
}

