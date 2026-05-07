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
import { useState, useEffect, useRef, useCallback } from "react";

import { use_auth } from "@/contexts/auth_context";
import {
  get_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  draft_manager,
  type DraftData,
} from "@/services/crypto/encrypted_drafts";
import {
  type Attachment,
  type DraftStatus,
  type DraftRefData,
  type RecipientsState,
  type EditDraftData,
} from "@/components/compose/compose_shared";
import { attachments_to_draft_data } from "@/components/compose/compose_draft_helpers";

export interface UseComposeDraftsOptions {
  recipients: RecipientsState;
  subject: string;
  message: string;
  attachments: Attachment[];
  attachments_ref: React.MutableRefObject<Attachment[]>;
  edit_draft?: EditDraftData | null;
  on_close: () => void;
  on_draft_cleared?: () => void;
  reset_form: () => void;
  is_sending_ref: React.MutableRefObject<boolean>;
  save_timer_ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  draft_context_id_ref: React.MutableRefObject<string | null>;
}

export interface UseComposeDraftsReturn {
  draft_status: DraftStatus;
  set_draft_status: (val: DraftStatus) => void;
  last_saved_time: Date | null;
  set_last_saved_time: (val: Date | null) => void;
  auto_save_drafts: boolean;
  draft_data_ref: React.MutableRefObject<DraftRefData>;
  just_loaded_draft_ref: React.MutableRefObject<boolean>;
  user_modified_ref: React.MutableRefObject<boolean>;
  handle_delete_draft: () => Promise<void>;
  handle_close: () => void;
}

export function use_compose_drafts({
  recipients,
  subject,
  message,
  attachments,
  attachments_ref,
  edit_draft,
  on_close,
  on_draft_cleared,
  reset_form,
  is_sending_ref,
  save_timer_ref,
  draft_context_id_ref,
}: UseComposeDraftsOptions): UseComposeDraftsReturn {
  const { vault } = use_auth();

  const [auto_save_drafts, set_auto_save_drafts] = useState(
    DEFAULT_PREFERENCES.auto_save_drafts,
  );
  const [draft_status, set_draft_status] = useState<DraftStatus>("idle");
  const [last_saved_time, set_last_saved_time] = useState<Date | null>(null);
  const draft_data_ref = useRef<DraftRefData>({ recipients, subject, message });
  const just_loaded_draft_ref = useRef(false);
  const user_modified_ref = useRef(false);

  useEffect(() => {
    const load_preferences = async () => {
      if (!vault) return;
      const response = await get_preferences(vault);

      if (response.data) {
        set_auto_save_drafts(response.data.auto_save_drafts);
      }
    };

    load_preferences();
  }, [vault]);

  useEffect(() => {
    draft_data_ref.current = { recipients, subject, message };
  }, [recipients, subject, message]);

  useEffect(() => {
    if (!auto_save_drafts || !vault || !draft_context_id_ref.current) return;

    if (just_loaded_draft_ref.current) {
      just_loaded_draft_ref.current = false;

      return;
    }

    const has_content = recipients.to.length > 0 || subject || message;

    if (!has_content) {
      set_draft_status("idle");
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }

      return;
    }

    user_modified_ref.current = true;
    set_draft_status("saving");

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
    }

    const context_id = draft_context_id_ref.current;

    save_timer_ref.current = setTimeout(async () => {
      if (is_sending_ref.current || !context_id) {
        save_timer_ref.current = null;

        return;
      }

      const data = draft_data_ref.current;
      const att_data =
        attachments.length > 0
          ? attachments_to_draft_data(attachments)
          : undefined;
      const draft_data: DraftData = {
        to_recipients: data.recipients.to,
        cc_recipients: data.recipients.cc,
        bcc_recipients: data.recipients.bcc,
        subject: data.subject,
        message: data.message,
        attachments: att_data,
      };

      try {
        const result = await draft_manager.save_draft(
          context_id,
          draft_data,
          vault,
        );

        if (result.success) {
          set_draft_status("saved");
          set_last_saved_time(new Date());
        } else {
          set_draft_status("error");
        }
      } catch {
        set_draft_status("error");
      }
      save_timer_ref.current = null;
    }, 1000);

    return () => {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
      }
    };
  }, [recipients, subject, message, attachments, auto_save_drafts, vault]);

  const handle_delete_draft = useCallback(async () => {
    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    if (draft_context_id_ref.current) {
      await draft_manager.await_pending_save(draft_context_id_ref.current);
      await draft_manager.delete_draft(draft_context_id_ref.current);
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    reset_form();

    if (on_draft_cleared) {
      on_draft_cleared();
    }
    on_close();
  }, [reset_form, on_draft_cleared, on_close]);

  const handle_close = useCallback(() => {
    const context_id = draft_context_id_ref.current;

    if (context_id && vault) {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }

      if (auto_save_drafts) {
        const data = draft_data_ref.current;
        const current_attachments = attachments_ref.current;
        const has_content =
          data.recipients.to.length > 0 || data.subject || data.message;

        const should_save = has_content && (edit_draft || user_modified_ref.current);

        if (should_save) {
          const close_att_data =
            current_attachments.length > 0
              ? attachments_to_draft_data(current_attachments)
              : undefined;

          const captured_vault = vault;
          const captured_context_id = context_id;

          draft_manager.await_pending_save(captured_context_id).then(() =>
            draft_manager
              .save_draft(
                captured_context_id,
                {
                  to_recipients: data.recipients.to,
                  cc_recipients: data.recipients.cc,
                  bcc_recipients: data.recipients.bcc,
                  subject: data.subject,
                  message: data.message,
                  attachments: close_att_data,
                },
                captured_vault,
              )
              .then(() => draft_manager.clear_context(captured_context_id)),
          );
        } else {
          const captured_context_id = context_id;

          draft_manager.await_pending_save(captured_context_id).then(() => {
            draft_manager
              .delete_draft(captured_context_id)
              .then(() => draft_manager.clear_context(captured_context_id));
          });
        }
      } else {
        draft_manager.clear_context(context_id);
      }

      draft_context_id_ref.current = null;
    }
    on_close();
    if (edit_draft && on_draft_cleared) {
      on_draft_cleared();
    }
  }, [on_close, edit_draft, on_draft_cleared, vault, auto_save_drafts]);

  return {
    draft_status,
    set_draft_status,
    last_saved_time,
    set_last_saved_time,
    auto_save_drafts,
    draft_data_ref,
    just_loaded_draft_ref,
    user_modified_ref,
    handle_delete_draft,
    handle_close,
  };
}
