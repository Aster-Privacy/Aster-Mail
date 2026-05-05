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
import type { DraftType } from "@/services/api/multi_drafts";
import type { DraftListItem } from "@/hooks/use_drafts_list";
import type { DraftClickData, ScheduledClickData } from "./inbox_types";

import { useNavigate } from "react-router-dom";
import { useMemo, useCallback, useEffect } from "react";

import { set_recipient_hint } from "@/stores/recipient_hint_store";
import { set_label_hints } from "@/stores/label_hints_store";

interface ScheduledEmail {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  full_body: string;
  scheduled_at: string;
}

interface UseInboxNavigationOptions {
  current_view: string;
  emails: InboxEmail[];
  scheduled_emails: ScheduledEmail[];
  pinned_emails: InboxEmail[];
  primary_emails: InboxEmail[];
  active_email_id?: string | null;
  split_email_id?: string | null;
  on_draft_click?: (data: DraftClickData) => void;
  on_scheduled_click?: (data: ScheduledClickData) => void;
  on_email_click?: (id: string) => void;
  on_navigate_to?: (id: string) => void;
  on_email_list_change?: (
    ids: string[],
    snooze_info?: Record<string, string | undefined>,
    grouped_ids_map?: Record<string, string[] | undefined>,
    subject_map?: Record<string, string>,
    label_hints_map?: Record<string, { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[] | undefined>,
  ) => void;
}

export function use_inbox_navigation({
  current_view,
  emails,
  scheduled_emails,
  pinned_emails,
  primary_emails,
  active_email_id,
  split_email_id,
  on_draft_click,
  on_scheduled_click,
  on_email_click,
  on_navigate_to,
  on_email_list_change,
}: UseInboxNavigationOptions) {
  const navigate = useNavigate();

  const visible_ids = useMemo(
    () => [...pinned_emails, ...primary_emails].map((e) => e.id),
    [pinned_emails, primary_emails],
  );

  useEffect(() => {
    if (on_email_list_change) {
      const all_visible = [...pinned_emails, ...primary_emails];
      const snooze_info: Record<string, string | undefined> = {};
      const grouped_ids_map: Record<string, string[] | undefined> = {};
      const subject_map: Record<string, string> = {};
      const label_hints_map: Record<string, { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[] | undefined> = {};

      all_visible.forEach((e) => {
        if (e.snoozed_until) {
          snooze_info[e.id] = e.snoozed_until;
        }
        if (e.grouped_email_ids && e.grouped_email_ids.length > 1) {
          grouped_ids_map[e.id] = e.grouped_email_ids;
        }
        if (e.subject) {
          subject_map[e.id] = e.subject;
        }
        const hints: { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[] = [];
        for (const f of e.folders ?? []) {
          if (f.name) hints.push({ token: f.folder_token, name: f.name, color: f.color, icon: f.icon, show_icon: true });
        }
        for (const tag of e.tags ?? []) {
          if (tag.name) hints.push({ token: tag.id, name: tag.name, color: tag.color, icon: tag.icon, show_icon: true });
        }
        if (hints.length > 0) {
          label_hints_map[e.id] = hints;
          set_label_hints(e.id, hints);
        }
      });
      on_email_list_change(
        all_visible.map((e) => e.id),
        snooze_info,
        grouped_ids_map,
        subject_map,
        label_hints_map,
      );
    }
  }, [pinned_emails, primary_emails, on_email_list_change]);

  const effective_email_id = active_email_id || split_email_id;
  const local_email_index = useMemo(() => {
    if (!effective_email_id || visible_ids.length === 0) return -1;

    return visible_ids.indexOf(effective_email_id);
  }, [effective_email_id, visible_ids]);
  const local_can_go_prev = local_email_index > 0;
  const local_can_go_next =
    local_email_index !== -1 && local_email_index < visible_ids.length - 1;

  const handle_local_navigate_prev = useCallback(() => {
    if (local_can_go_prev) {
      const prev_id = visible_ids[local_email_index - 1];

      if (on_navigate_to) {
        on_navigate_to(prev_id);
      } else if (on_email_click) {
        on_email_click(prev_id);
      }
    }
  }, [
    local_can_go_prev,
    local_email_index,
    visible_ids,
    on_navigate_to,
    on_email_click,
  ]);

  const handle_local_navigate_next = useCallback(() => {
    if (local_can_go_next) {
      const next_id = visible_ids[local_email_index + 1];

      if (on_navigate_to) {
        on_navigate_to(next_id);
      } else if (on_email_click) {
        on_email_click(next_id);
      }
    }
  }, [
    local_can_go_next,
    local_email_index,
    visible_ids,
    on_navigate_to,
    on_email_click,
  ]);

  const handle_email_click = useCallback(
    (id: string): void => {
      const email = emails.find((e) => e.id === id);

      if (email?.item_type === "draft" && on_draft_click) {
        const draft = email as DraftListItem;

        on_draft_click({
          id: email.id,
          version: draft.version || 1,
          draft_type: (draft.draft_type as DraftType) || "new",
          reply_to_id: draft.reply_to_id,
          forward_from_id: draft.forward_from_id,
          to_recipients: draft.to_recipients || [],
          cc_recipients: draft.cc_recipients || [],
          bcc_recipients: draft.bcc_recipients || [],
          subject: draft.subject || "",
          message: draft.full_message || "",
          updated_at: draft.updated_at || new Date().toISOString(),
          attachments: draft.draft_attachments,
        });

        return;
      }
      if (email?.item_type === "scheduled") {
        if (on_scheduled_click) {
          const scheduled = scheduled_emails.find((e) => e.id === id);

          if (scheduled) {
            on_scheduled_click({
              id: scheduled.id,
              to_recipients: scheduled.to_recipients,
              cc_recipients: scheduled.cc_recipients,
              bcc_recipients: scheduled.bcc_recipients,
              subject: scheduled.subject,
              body: scheduled.full_body,
              scheduled_at: scheduled.scheduled_at,
            });
          }
        }

        return;
      }
      if (on_email_click) {
        const hinted = emails.find((e) => e.id === id);
        set_recipient_hint(id, hinted?.recipient_addresses || []);
        on_email_click(id);
      } else {
        const clicked = emails.find((e) => e.id === id);
        set_recipient_hint(id, clicked?.recipient_addresses || []);

        sessionStorage.setItem(
          "astermail_email_nav",
          JSON.stringify({
            view: current_view,
            email_ids: visible_ids,
            grouped_email_ids: clicked?.grouped_email_ids,
          }),
        );
        navigate(`/email/${id}`, { state: { from_view: current_view } });
      }
    },
    [
      navigate,
      current_view,
      emails,
      scheduled_emails,
      on_draft_click,
      on_scheduled_click,
      on_email_click,
      visible_ids,
    ],
  );

  return {
    visible_ids,
    effective_email_id,
    local_email_index,
    local_can_go_prev,
    local_can_go_next,
    handle_local_navigate_prev,
    handle_local_navigate_next,
    handle_email_click,
  };
}
