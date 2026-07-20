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
import { PlusIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { AliasDisplayNameEditor } from "@/components/settings/aliases/alias_display_name_editor";
import { AliasNoteEditor } from "@/components/settings/aliases/alias_note_editor";
import { AliasWebsitesEditor } from "@/components/settings/aliases/alias_websites_editor";

function display_website(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

interface AliasMetaEditorProps {
  alias_address: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  is_locked?: boolean;
  on_save_display_name: (next: string) => Promise<{ error?: unknown }>;
  on_saved_display_name: (next: string) => void;
  on_save_note: (next: string) => Promise<{ error?: unknown }>;
  on_saved_note: (next: string) => void;
  on_save_websites: (next: string[]) => Promise<{ error?: unknown }>;
  on_saved_websites: (next: string[]) => void;
}

export function AliasMetaEditor({
  alias_address,
  display_name,
  note,
  websites,
  is_locked = false,
  on_save_display_name,
  on_saved_display_name,
  on_save_note,
  on_saved_note,
  on_save_websites,
  on_saved_websites,
}: AliasMetaEditorProps) {
  const { t } = use_i18n();
  const [expanded, set_expanded] = useState(false);

  const website_count = websites?.length ?? 0;
  const has_any = !!display_name || !!note || website_count > 0;

  if (expanded) {
    return (
      <div className="mt-1 space-y-1 rounded-lg border border-edge-secondary/60 bg-surf-secondary/40 px-2 py-1.5">
        <AliasDisplayNameEditor
          alias_address={alias_address}
          display_name={display_name}
          is_locked={is_locked}
          on_save={on_save_display_name}
          on_saved={on_saved_display_name}
        />
        <AliasNoteEditor
          alias_address={alias_address}
          note={note}
          on_save={on_save_note}
          on_saved={on_saved_note}
        />
        <AliasWebsitesEditor
          alias_address={alias_address}
          websites={websites}
          on_save={on_save_websites}
          on_saved={on_saved_websites}
        />
        <button
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-txt-muted opacity-70 hover:opacity-100 transition-opacity"
          type="button"
          onClick={() => set_expanded(false)}
        >
          <ChevronUpIcon className="h-3 w-3" />
          {t("common.done")}
        </button>
      </div>
    );
  }

  if (!has_any) {
    return (
      <button
        aria-label={`${t("common.alias_add_details")} ${alias_address}`}
        className="mt-0.5 inline-flex items-center gap-1 text-xs text-txt-muted opacity-50 hover:opacity-90 transition-opacity"
        type="button"
        onClick={() => set_expanded(true)}
      >
        <PlusIcon className="h-3 w-3" />
        {t("common.alias_add_details")}
      </button>
    );
  }

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
      onClick={() => set_expanded(true)}
    >
      {summary_parts.join(" · ")}
    </button>
  );
}
