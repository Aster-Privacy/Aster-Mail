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

import {
  IdentificationIcon,
  PencilSquareIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

function display_website(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

interface AliasMetaSummaryProps {
  alias_address: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  on_open: () => void;
}

export function AliasMetaEditor({
  alias_address,
  display_name,
  note,
  websites,
  on_open,
}: AliasMetaSummaryProps) {
  const { t } = use_i18n();

  const website_count = websites?.length ?? 0;
  const rows: {
    key: string;
    icon: React.ReactNode;
    label: string;
    value: string;
  }[] = [];

  if (display_name) {
    rows.push({
      key: "display_name",
      icon: <IdentificationIcon className="w-3.5 h-3.5 shrink-0" />,
      label: t("settings.alias_field_display_name_label"),
      value: display_name,
    });
  }

  if (note) {
    rows.push({
      key: "note",
      icon: <PencilSquareIcon className="w-3.5 h-3.5 shrink-0" />,
      label: t("settings.alias_field_note_label"),
      value: note,
    });
  }

  if (website_count > 0) {
    rows.push({
      key: "websites",
      icon: <LinkIcon className="w-3.5 h-3.5 shrink-0" />,
      label: t("settings.alias_field_websites_label"),
      value:
        website_count === 1
          ? display_website(websites![0])
          : t("common.alias_websites_count", { count: String(website_count) }),
    });
  }

  if (rows.length === 0) return null;

  return (
    <button
      aria-label={`${t("common.alias_add_details")} ${alias_address}`}
      className="group/meta mt-1 flex w-full min-w-0 flex-col gap-0.5 text-left"
      type="button"
      onClick={on_open}
    >
      {rows.map((row) => (
        <span
          key={row.key}
          className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-txt-tertiary transition-colors group-hover/meta:text-txt-secondary"
          title={`${row.label}: ${row.value}`}
        >
          {row.icon}
          <span className="truncate">{row.value}</span>
        </span>
      ))}
    </button>
  );
}
