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
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

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
  const [is_hovered, set_is_hovered] = useState(false);

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

  const preview_text =
    strip_html_tags(draft.content.message || "") || t("common.no_content");
  const truncated_preview =
    preview_text.length > 120
      ? preview_text.substring(0, 120) + "..."
      : preview_text;

  return (
    <div
      className="relative mt-4 rounded-xl border-2 border-dashed transition-all cursor-pointer"
      style={{
        borderColor: is_hovered
          ? "var(--accent-color)"
          : "rgba(99, 102, 241, 0.4)",
        backgroundColor: is_hovered
          ? "rgba(99, 102, 241, 0.08)"
          : "rgba(99, 102, 241, 0.04)",
      }}
      onClick={handle_edit}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <ProfileAvatar
            email={current_user_email}
            name={current_user_name || t("common.me")}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "rgb(99, 102, 241)",
                }}
              >
                <PencilSquareIcon className="w-3 h-3" />
                {t("mail.draft")}
              </span>
              <span className="text-xs font-medium text-txt-secondary">
                {current_user_name || t("common.me")}
              </span>
            </div>

            {draft.content.subject && (
              <p className="text-sm font-medium mb-1 truncate text-txt-primary">
                {draft.content.subject}
              </p>
            )}

            <p className="text-sm line-clamp-2 text-txt-muted">
              {truncated_preview}
            </p>

            {draft.content.to_recipients.length > 0 && (
              <div className="text-xs mt-2 flex items-center gap-1 flex-wrap text-txt-muted">
                <span>{t("mail.to_label")}:</span>
                {draft.content.to_recipients.map((email, i) => (
                  <span key={email} className="inline-flex items-center gap-1">
                    <ProfileAvatar
                      use_domain_logo
                      email={email}
                      name=""
                      size="xs"
                    />
                    <span>{email}</span>
                    {i < draft.content.to_recipients.length - 1 && (
                      <span>,</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              className="h-8 w-8 text-txt-muted hover:text-red-500 hover:bg-red-500/10"
              disabled={is_deleting}
              size="icon"
              variant="ghost"
              onClick={handle_delete}
            >
              <TrashIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-2 right-3 flex items-center gap-1 text-xs transition-opacity"
        style={{
          color: "var(--accent-color)",
          opacity: is_hovered ? 1 : 0.7,
        }}
      >
        <span>{t("common.click_to_edit")}</span>
        <PencilSquareIcon className="w-3 h-3" />
      </div>
    </div>
  );
}
