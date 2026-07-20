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
  const has_any = !!display_name || !!note || website_count > 0;

  if (!has_any) return null;

  const summary_parts = [display_name, note].filter(Boolean) as string[];

  if (website_count > 0) {
    summary_parts.push(
      website_count === 1
        ? display_website(websites![0])
        : t("common.alias_websites_count", { count: String(website_count) }),
    );
  }

  return (
    <button
      aria-label={`${t("common.alias_add_details")} ${alias_address}`}
      className="mt-0.5 block max-w-full truncate text-left text-xs text-txt-muted hover:text-txt-primary transition-colors"
      type="button"
      onClick={on_open}
    >
      {summary_parts.join(" · ")}
    </button>
  );
}
