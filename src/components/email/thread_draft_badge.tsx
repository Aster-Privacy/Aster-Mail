import type { DraftWithContent } from "@/services/api/multi_drafts";

import { useState, useCallback } from "react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { delete_draft } from "@/services/api/multi_drafts";
import { show_toast } from "@/components/toast/simple_toast";

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
        show_toast("Draft deleted", "success");
      } else {
        show_toast("Failed to delete draft", "error");
      }
    },
    [draft.id, is_deleting, on_deleted],
  );

  const handle_edit = useCallback(() => {
    on_edit(draft);
  }, [draft, on_edit]);

  const preview_text =
    draft.content.message?.replace(/<[^>]*>/g, "").trim() || "No content";
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
            name={current_user_name || "Me"}
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
                Draft
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {current_user_name || "Me"}
              </span>
            </div>

            {draft.content.subject && (
              <p
                className="text-sm font-medium mb-1 truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {draft.content.subject}
              </p>
            )}

            <p
              className="text-sm line-clamp-2"
              style={{ color: "var(--text-muted)" }}
            >
              {truncated_preview}
            </p>

            {draft.content.to_recipients.length > 0 && (
              <p
                className="text-xs mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                To: {draft.content.to_recipients.join(", ")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              className="h-8 w-8 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10"
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
        <span>Click to edit</span>
        <PencilSquareIcon className="w-3 h-3" />
      </div>
    </div>
  );
}
