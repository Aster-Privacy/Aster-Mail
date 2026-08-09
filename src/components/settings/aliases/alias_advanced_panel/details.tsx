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
import type { } from "@/services/api/aliases";
import type { } from "@/lib/i18n/types";



import { } from "@/components/settings/aliases/alias_rule_editor_modal";
import { AliasWebsitesEditor } from "@/components/settings/aliases/alias_websites_editor";
import { } from "@/components/email/shared/decrypt_envelope";
import { use_i18n } from "@/lib/i18n/context";
import { } from "@/components/toast/simple_toast";
import { } from "@/components/ui/spinner";
import { } from "@/components/ui/input";
import { } from "@/components/settings/aliases/feature_lock";
import { } from "@/hooks/use_folders";
import { } from "@/hooks/use_tags";
import { } from "@/components/settings/aliases/info_hint";

import { MAX_DISPLAY_NAME_LENGTH, MAX_NOTE_LENGTH, PanelRow, TextFieldRow } from "./shared";
export interface AliasDetailsProps {
  alias_address: string;
  alias_address_hash?: string;
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

export function AliasDetailsPanel({
  alias_address,
  display_name,
  note,
  websites,
  is_locked,
  on_save_display_name,
  on_saved_display_name,
  on_save_note,
  on_saved_note,
  on_save_websites,
  on_saved_websites,
}: AliasDetailsProps) {
  const { t } = use_i18n();

  return (
    <div className="divide-y divide-edge-secondary">
      <TextFieldRow
        description={t("settings.alias_display_name_desc")}
        error_message={t("common.failed_update_alias_display_name")}
        is_locked={is_locked}
        label={t("settings.alias_display_name_label")}
        max_length={MAX_DISPLAY_NAME_LENGTH}
        on_save={on_save_display_name}
        on_saved={on_saved_display_name}
        placeholder={t("common.add_display_name_placeholder")}
        success_message={t("common.alias_display_name_updated")}
        too_long_message={t("common.display_name_too_long")}
        value={display_name}
      />
      <TextFieldRow
        description={t("settings.alias_note_desc")}
        error_message={t("common.failed_update_alias_note")}
        label={t("settings.alias_note_label")}
        max_length={MAX_NOTE_LENGTH}
        on_save={on_save_note}
        on_saved={on_saved_note}
        placeholder={t("common.add_alias_note_placeholder")}
        success_message={t("common.alias_note_updated")}
        too_long_message={t("common.alias_note_too_long")}
        value={note}
      />
      <PanelRow
        align_top
        description={t("settings.alias_websites_desc")}
        label={t("common.websites")}
      >
        <div className="w-72 [&>button]:!mt-0 [&>div]:!mt-0">
          <AliasWebsitesEditor
            hide_icon
            alias_address={alias_address}
            on_save={on_save_websites}
            on_saved={on_saved_websites}
            websites={websites}
          />
        </div>
      </PanelRow>
    </div>
  );
}
