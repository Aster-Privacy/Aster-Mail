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
import { useRef } from "react";
import { ProfileNotesInlineView } from "@aster/ui";

import { use_profile_note } from "@/components/profile/use_profile_note";
import { use_i18n } from "@/lib/i18n/context";
import { SaveStatusIndicator } from "@/components/common/save_status_indicator";

interface ProfileNotesInlineProps {
  email: string;
}

export function ProfileNotesInline({ email }: ProfileNotesInlineProps) {
  const { t } = use_i18n();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const {
    is_available,
    note,
    is_loading,
    load_failed,
    save_status,
    handle_change,
    handle_blur,
  } = use_profile_note(email, {
    missing_note_is_failure: true,
    focus_ref: textarea_ref,
  });

  if (!is_available) {
    return null;
  }

  return (
    <ProfileNotesInlineView
      is_loading={is_loading}
      load_failed={load_failed}
      note={note}
      save_status={save_status}
      status_indicator={
        save_status === "error" ||
        save_status === "saving" ||
        save_status === "saved" ? (
          <SaveStatusIndicator status={save_status} />
        ) : null
      }
      strings={{
        notes: t("common.notes"),
        too_long: t("common.alias_note_too_long"),
        load_failed: t("common.something_went_wrong_try_again"),
        placeholder: t("common.add_note_placeholder"),
      }}
      textarea_ref={textarea_ref}
      on_blur={handle_blur}
      on_change={handle_change}
    />
  );
}
