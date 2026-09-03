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

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  draft_manager,
  type DraftData,
} from "@/services/crypto/encrypted_drafts";
import { api_client } from "@/services/api/client";
import { has_csrf_token } from "@/services/api/csrf";
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
  from_email?: string;
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
  show_discard_confirm: boolean;
  confirm_discard_close: () => void;
  cancel_discard_close: () => void;
}

export function use_compose_drafts({
  recipients,
  subject,
  message,
  from_email,
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
  const { preferences } = use_preferences();

  const auto_save_drafts = preferences.auto_save_drafts;
  const { t } = use_i18n();
  const [draft_status, set_draft_status] = useState<DraftStatus>("idle");
  const [last_saved_time, set_last_saved_time] = useState<Date | null>(null);
  const draft_data_ref = useRef<DraftRefData>({
    recipients,
    subject,
    message,
    from_email,
  });
  const just_loaded_draft_ref = useRef(false);
  const user_modified_ref = useRef(false);

  useEffect(() => {
    draft_data_ref.current = { recipients, subject, message, from_email };
  }, [recipients, subject, message, from_email]);

  useEffect(() => {
    if (!auto_save_drafts || !vault || !draft_context_id_ref.current) return;

    if (just_loaded_draft_ref.current) {
      just_loaded_draft_ref.current = false;

      return;
    }

    const has_content =
      recipients.to.length > 0 ||
      recipients.cc.length > 0 ||
      recipients.bcc.length > 0 ||
      subject ||
      message;

    if (!has_content) {
      set_draft_status("idle");
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }

      return;
    }

    user_modified_ref.current = true;
    set_draft_status((current) => (current === "saving" ? current : "saving"));

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
    }

    const context_id = draft_context_id_ref.current;
    const autosave_delay = preferences.low_network_mode ? 5000 : 1000;

    save_timer_ref.current = setTimeout(async () => {
      save_timer_ref.current = null;

      if (is_sending_ref.current || !context_id) {
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
        from_email: data.from_email,
        attachments: att_data,
      };

      try {
        if (!has_csrf_token()) {
          await api_client.refresh_session();
        }

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
    }, autosave_delay);

    return () => {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
      }
    };
  }, [
    recipients,
    subject,
    message,
    from_email,
    attachments,
    auto_save_drafts,
    vault,
    preferences.low_network_mode,
  ]);

  const handle_delete_draft = useCallback(async () => {
    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    if (draft_context_id_ref.current) {
      try {
        await draft_manager.await_pending_save(draft_context_id_ref.current);
        const deleted = await draft_manager.delete_draft(
          draft_context_id_ref.current,
        );

        if (!deleted) {
          show_toast(t("common.failed_to_delete_draft"), "error");

          return;
        }
      } catch {
        show_toast(t("common.failed_to_delete_draft"), "error");

        return;
      }
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    reset_form();

    if (on_draft_cleared) {
      on_draft_cleared();
    }
    on_close();
  }, [reset_form, on_draft_cleared, on_close, t]);

  const perform_close = useCallback(() => {
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
          data.recipients.to.length > 0 ||
          data.recipients.cc.length > 0 ||
          data.recipients.bcc.length > 0 ||
          data.subject ||
          data.message ||
          current_attachments.length > 0;

        const body_empty = !data.message;
        const skipped_for_low_network =
          preferences.low_network_mode && body_empty;
        const should_save =
          has_content &&
          (edit_draft || user_modified_ref.current) &&
          !skipped_for_low_network;

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
                  from_email: data.from_email,
                  attachments: close_att_data,
                },
                captured_vault,
              )
              .then((result) => {
                if (!result.success) {
                  show_toast(t("common.failed_to_save"), "error");
                }
                draft_manager.clear_context(captured_context_id);
              })
              .catch(() => {
                show_toast(t("common.failed_to_save"), "error");
                draft_manager.clear_context(captured_context_id);
              }),
          );
        } else if (
          has_content &&
          skipped_for_low_network &&
          (edit_draft || user_modified_ref.current)
        ) {
          const captured_context_id = context_id;

          draft_manager
            .await_pending_save(captured_context_id)
            .then(() => draft_manager.clear_context(captured_context_id));
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
  }, [
    on_close,
    edit_draft,
    on_draft_cleared,
    vault,
    auto_save_drafts,
    preferences.low_network_mode,
    t,
  ]);

  const [show_discard_confirm, set_show_discard_confirm] = useState(false);

  const handle_close = useCallback(() => {
    const data = draft_data_ref.current;
    const has_content =
      data.recipients.to.length > 0 ||
      data.recipients.cc.length > 0 ||
      data.recipients.bcc.length > 0 ||
      !!data.subject ||
      !!data.message ||
      attachments_ref.current.length > 0;

    if (!auto_save_drafts && has_content && user_modified_ref.current) {
      set_show_discard_confirm(true);

      return;
    }

    perform_close();
  }, [auto_save_drafts, perform_close, attachments_ref]);

  const confirm_discard_close = useCallback(() => {
    set_show_discard_confirm(false);
    perform_close();
  }, [perform_close]);

  const cancel_discard_close = useCallback(
    () => set_show_discard_confirm(false),
    [],
  );

  const flush_pending_draft_ref = useRef<() => void>(() => {});

  flush_pending_draft_ref.current = () => {
    if (!save_timer_ref.current) return;

    const context_id = draft_context_id_ref.current;

    if (!context_id || !vault || !auto_save_drafts) return;

    clearTimeout(save_timer_ref.current);
    save_timer_ref.current = null;

    if (is_sending_ref.current) return;

    const data = draft_data_ref.current;
    const current_attachments = attachments_ref.current;
    const has_content =
      data.recipients.to.length > 0 ||
      data.recipients.cc.length > 0 ||
      data.recipients.bcc.length > 0 ||
      data.subject ||
      data.message ||
      current_attachments.length > 0;

    const body_empty = !data.message;
    const should_save =
      has_content &&
      (edit_draft || user_modified_ref.current) &&
      !(preferences.low_network_mode && body_empty);

    if (!should_save) return;

    const flush_att_data =
      current_attachments.length > 0
        ? attachments_to_draft_data(current_attachments)
        : undefined;

    draft_manager.save_draft(
      context_id,
      {
        to_recipients: data.recipients.to,
        cc_recipients: data.recipients.cc,
        bcc_recipients: data.recipients.bcc,
        subject: data.subject,
        message: data.message,
        from_email: data.from_email,
        attachments: flush_att_data,
      },
      vault,
    );
  };

  useEffect(() => {
    const handle_pagehide = () => {
      flush_pending_draft_ref.current();
    };

    const handle_visibilitychange = () => {
      if (document.visibilityState === "hidden") {
        flush_pending_draft_ref.current();
      }
    };

    window.addEventListener("pagehide", handle_pagehide);
    document.addEventListener("visibilitychange", handle_visibilitychange);

    return () => {
      window.removeEventListener("pagehide", handle_pagehide);
      document.removeEventListener("visibilitychange", handle_visibilitychange);
      flush_pending_draft_ref.current();
    };
  }, []);

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
    show_discard_confirm,
    confirm_discard_close,
    cancel_discard_close,
  };
}
