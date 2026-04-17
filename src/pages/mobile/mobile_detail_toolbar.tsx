//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import {
  StarIcon,
  ArchiveBoxIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  PrinterIcon,
  NoSymbolIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";

export const TOOLBAR_ACTION_MAP: Record<
  string,
  {
    icon: typeof ArchiveBoxIcon;
    label_key: string;
    is_danger?: boolean;
    group: "quick" | "organize";
  }
> = {
  archive: {
    icon: ArchiveBoxIcon,
    label_key: "mail.archive",
    group: "organize",
  },
  spam: {
    icon: NoSymbolIcon,
    label_key: "mail.report_spam",
    group: "organize",
  },
  trash: {
    icon: TrashIcon,
    label_key: "mail.move_to_trash",
    is_danger: true,
    group: "organize",
  },
  star: { icon: StarIcon, label_key: "mail.star", group: "quick" },
  mark_read: {
    icon: EnvelopeOpenIcon,
    label_key: "mail.mark_read",
    group: "quick",
  },
  print: { icon: PrinterIcon, label_key: "mail.print", group: "quick" },
};

export const ALL_TOOLBAR_ACTION_IDS = Object.keys(TOOLBAR_ACTION_MAP);
export const DEFAULT_TOOLBAR = ["trash", "star"];

export function MobileToolbar({
  actions,
  on_archive,
  on_spam,
  on_delete,
  on_star,
  on_mark_read,
  on_print,
  on_more,
  is_starred,
}: {
  actions?: string[];
  on_archive: () => void;
  on_spam: () => void;
  on_delete: () => void;
  on_star: () => void;
  on_mark_read: () => void;
  on_print: () => void;
  on_more: () => void;
  is_starred: boolean;
}) {
  const { t } = use_i18n();
  const raw = actions ?? DEFAULT_TOOLBAR;
  const active = raw.filter((a) => TOOLBAR_ACTION_MAP[a]);

  const handler_map: Record<string, () => void> = {
    archive: on_archive,
    spam: on_spam,
    trash: on_delete,
    star: on_star,
    mark_read: on_mark_read,
    print: on_print,
  };

  if (active.length === 0) return null;

  return (
    <div className="border-t border-[var(--border-primary)] safe-area-pb">
      <div className="flex items-center justify-around px-2 py-1.5">
        {active.map((action) => {
          const config = TOOLBAR_ACTION_MAP[action];

          if (!config) return null;
          const Icon =
            action === "star" && is_starred ? StarSolidIcon : config.icon;
          const color = config.is_danger
            ? "var(--color-danger,#ef4444)"
            : action === "star" && is_starred
              ? "var(--color-warning)"
              : "var(--text-secondary)";

          return (
            <button
              key={action}
              aria-label={action.replace(/_/g, " ")}
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-[var(--bg-tertiary)]"
              style={{ color }}
              type="button"
              onClick={handler_map[action]}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
        <button
          aria-label={t("common.more_actions")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_more}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
