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
import type { DraftWithContent } from "@/services/api/multi_drafts";

import { useState, useCallback } from "react";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { delete_draft } from "@/services/api/multi_drafts";
import { show_toast } from "@/components/toast/simple_toast";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { use_i18n } from "@/lib/i18n/context";

interface ThreadDraftBadgeProps {
  draft: DraftWithContent;
  current_user_email: string;
  current_user_name?: string;
  on_edit: (draft: DraftWithContent) => void;
  on_deleted: () => void;
}

export function ThreadDraftBadge({
  draft,
  current_user_email,
  current_user_name,
  on_edit,
  on_deleted,
}: ThreadDraftBadgeProps) {
  const { t } = use_i18n();
  const [is_deleting, set_is_deleting] = useState(false);

  const handle_delete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (is_deleting) return;

      set_is_deleting(true);
      const result = await delete_draft(draft.id);

      set_is_deleting(false);

      if (result.data?.success) {
        on_deleted();
        show_toast(t("common.draft_deleted"), "success");
      } else {
        show_toast(t("common.failed_to_delete_draft"), "error");
      }
    },
    [draft.id, is_deleting, on_deleted],
  );

  const handle_edit = useCallback(() => {
    on_edit(draft);
  }, [draft, on_edit]);

  const preview_text = strip_html_tags(draft.content.message || "").trim();
  const summary =
    draft.content.subject?.trim() || preview_text || t("common.no_content");
  const truncated_summary =
    summary.length > 60 ? summary.substring(0, 60) + "..." : summary;

  const text_button_class =
    "flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors";

  return (
    <div className="mt-2 px-4 flex items-center gap-3">
      <ProfileAvatar
        email={current_user_email}
        name={current_user_name || t("common.me")}
        size="md"
      />
      <div className="flex-1 flex items-center gap-2 min-w-0 text-xs text-txt-muted">
        <span className="font-medium text-txt-secondary">
          {t("mail.draft")}
        </span>
        <span className="truncate">{truncated_summary}</span>
        <button className={text_button_class} onClick={handle_edit}>
          {t("common.click_to_edit")}
        </button>
        <button
          className={text_button_class}
          disabled={is_deleting}
          onClick={handle_delete}
        >
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}
