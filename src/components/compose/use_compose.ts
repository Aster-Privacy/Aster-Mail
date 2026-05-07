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
import type { DecryptedContact } from "@/types/contacts";
import type { DecryptedRecentRecipient } from "@/types/recent_recipients";
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { Badge } from "@/services/api/user";
import type { UseEditorReturn } from "@/hooks/use_editor";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useReducer,
  useMemo,
} from "react";

import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import {
  list_recent_recipients,
  decrypt_recent_recipients,
} from "@/services/api/recent_recipients";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import {
  get_preferred_sender_id,
  set_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import {
  use_ghost_mode,
  type UseGhostModeReturn,
} from "@/hooks/use_ghost_mode";
import { type UndoSendEvent } from "@/hooks/use_undo_send";
import { use_i18n } from "@/lib/i18n/context";
import { fetch_my_badges } from "@/services/api/user";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { is_internal_email } from "@/services/api/keys";
import { draft_manager } from "@/services/crypto/encrypted_drafts";
import { sanitize_html } from "@/lib/html_sanitizer";
import { show_toast } from "@/components/toast/simple_toast";
import {
  type Attachment,
  type RecipientsState,
  type InputsState,
  type VisibilityState,
  type DraftStatus,
  type EditDraftData,
  recipients_reducer,
  is_valid_email,
  INITIAL_RECIPIENTS,
  INITIAL_INPUTS,
  INITIAL_VISIBILITY,
  get_aster_footer,
  INITIAL_CONTENT_DELAY_MS,
} from "@/components/compose/compose_shared";
import {
  draft_data_to_attachments,
  build_badge_html,
} from "@/components/compose/compose_draft_helpers";
import { use_compose_attachments } from "@/components/compose/use_compose_attachments";
import { use_compose_send } from "@/components/compose/use_compose_send";
import { use_compose_drafts } from "@/components/compose/use_compose_drafts";
import { use_compose_editor } from "@/components/compose/use_compose_editor";

export interface UseComposeOptions {
  on_close: () => void;
  edit_draft?: EditDraftData | null;
  on_draft_cleared?: () => void;
  initial_to?: string;
  session_storage_key: string;
  init_trigger?: unknown;
  load_contacts_trigger?: unknown;
  enable_offline_queue?: boolean;
  enable_ctrl_enter_send?: boolean;
}

export interface UseComposeReturn {
  recipients: RecipientsState;
  inputs: InputsState;
  visibility: VisibilityState;
  subject: string;
  set_subject: (val: string) => void;
  message: string;
  attachments: Attachment[];
  show_delete_confirm: boolean;
  draft_status: DraftStatus;
  last_saved_time: Date | null;
  send_error: string | null;
  restore_error: string | null;
  attachment_error: string | null;
  set_attachment_error: (val: string | null) => void;
  scheduled_time: Date | null;
  set_scheduled_time: (val: Date | null) => void;
  is_scheduling: boolean;
  contacts: DecryptedContact[];
  recent_recipients: DecryptedRecentRecipient[];
  sender_options: SenderOption[];
  aliases_loading: boolean;
  selected_sender: SenderOption | null;
  set_selected_sender: (val: SenderOption | null) => void;
  preferred_sender_id: string | null;
  set_preferred_sender: (id: string | null) => void;
  ghost_mode: UseGhostModeReturn;
  editor: UseEditorReturn;
  active_formats: Set<string>;
  is_mac: boolean;
  is_plain_text_mode: boolean;
  toggle_plain_text_mode: () => void;
  show_plain_text_confirm: boolean;
  confirm_plain_text_mode: () => void;
  cancel_plain_text_confirm: () => void;
  has_external_recipients: boolean;
  expires_at: Date | null;
  set_expires_at: (val: Date | null) => void;
  expiry_password: string | null;
  set_expiry_password: (val: string | null) => void;

  attachments_scroll_ref: React.RefObject<HTMLDivElement>;
  file_input_ref: React.RefObject<HTMLInputElement>;
  message_textarea_ref: React.RefObject<HTMLDivElement>;

  update_input: (field: keyof InputsState, value: string) => void;
  add_recipient: (field: keyof RecipientsState, email: string) => void;
  remove_recipient: (field: keyof RecipientsState, email: string) => void;
  remove_last_recipient: (field: keyof RecipientsState) => void;
  show_cc_field: () => void;
  show_bcc_field: () => void;
  hide_cc_field: () => void;
  hide_bcc_field: () => void;
  reset_form: () => void;
  clear_all_errors: () => void;
  remove_attachment: (id: string) => void;
  handle_file_select: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handle_files_drop: (files: File[]) => Promise<void>;
  trigger_file_select: () => void;
  handle_editor_input: () => void;
  handle_editor_paste: (e: React.ClipboardEvent) => void;
  handle_template_select: (content: string) => void;
  exec_format_command: (command: string) => void;
  handle_insert_link: () => void;
  handle_send: () => Promise<void>;
  handle_scheduled_send: () => Promise<void>;
  handle_delete_draft: () => Promise<void>;
  handle_show_delete_confirm: () => void;
  handle_hide_delete_confirm: () => void;
  handle_close: () => void;
  pgp_enabled: boolean;
  toggle_pgp: () => void;

  schedule_picker_element: React.ReactNode;
  expiration_picker_element: React.ReactNode;
  template_picker_element: React.ReactNode;
}

export function use_compose({
  on_close,
  edit_draft,
  on_draft_cleared,
  initial_to,
  session_storage_key,
  init_trigger,
  load_contacts_trigger,
  enable_offline_queue = false,
  enable_ctrl_enter_send = false,
}: UseComposeOptions): UseComposeReturn {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();

  const [recipients, dispatch_recipients] = useReducer(
    recipients_reducer,
    INITIAL_RECIPIENTS,
  );
  const [inputs, set_inputs] = useState<InputsState>(INITIAL_INPUTS);
  const [visibility, set_visibility] =
    useState<VisibilityState>(INITIAL_VISIBILITY);

  const [subject, set_subject] = useState("");
  const [message, set_message] = useState("");

  const [show_delete_confirm, set_show_delete_confirm] = useState(false);
  const [badges, set_badges] = useState<Badge[]>([]);
  const [badges_loaded, set_badges_loaded] = useState(false);

  useEffect(() => {
    fetch_my_badges().then((r) => {
      if (r.data) set_badges(r.data);
      set_badges_loaded(true);
    });
  }, []);

  const is_sending_ref = useRef(false);
  const save_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const message_textarea_ref = useRef<HTMLDivElement>(null);
  const draft_context_id_ref = useRef<string | null>(null);
  const initialized_ref = useRef(false);
  const content_initialized_ref = useRef(false);
  const [scheduled_time, set_scheduled_time] = useState<Date | null>(null);
  const [is_scheduling, set_is_scheduling] = useState(false);
  const [expires_at, set_expires_at] = useState<Date | null>(null);
  const [expiry_password, set_expiry_password] = useState<string | null>(null);
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [recent_recipients_list, set_recent_recipients_list] = useState<
    DecryptedRecentRecipient[]
  >([]);

  const { sender_options, loading: aliases_loading } = use_sender_aliases();
  const [selected_sender, set_selected_sender] = useState<SenderOption | null>(
    null,
  );
  const [preferred_sender_id, set_preferred_sender_id_state] = useState<
    string | null
  >(() => get_preferred_sender_id());

  const set_preferred_sender = useCallback((id: string | null) => {
    set_preferred_sender_id_state(id);
    set_preferred_sender_id(id);
  }, []);

  useEffect(() => {
    return subscribe_preferred_sender((id) => {
      set_preferred_sender_id_state(id);
    });
  }, []);
  const ghost_mode = use_ghost_mode();

  const attachment_hook = use_compose_attachments();

  const files_drop_ref = useRef<((files: File[]) => void) | null>(null);

  const editor_hook = use_compose_editor({
    message_textarea_ref,
    set_message,
    on_files_drop: (files: File[]) => files_drop_ref.current?.(files),
  });

  const reset_form = useCallback(() => {
    dispatch_recipients({ type: "RESET" });
    set_inputs(INITIAL_INPUTS);
    set_visibility(INITIAL_VISIBILITY);
    set_subject("");
    set_message("");
    attachment_hook.set_attachments([]);
    set_scheduled_time(null);
    set_is_scheduling(false);
    set_expires_at(null);
    set_expiry_password(null);
    if (message_textarea_ref.current) {
      message_textarea_ref.current.innerHTML = "";
    }
  }, [attachment_hook.set_attachments]);

  const clear_all_errors = useCallback(() => {}, []);

  const draft_hook = use_compose_drafts({
    recipients,
    subject,
    message,
    attachments: attachment_hook.attachments,
    attachments_ref: attachment_hook.attachments_ref,
    edit_draft,
    on_close,
    on_draft_cleared,
    reset_form,
    is_sending_ref,
    save_timer_ref,
    draft_context_id_ref,
  });

  const has_external_recipients = useMemo(() => {
    const all_recipients = [
      ...recipients.to,
      ...recipients.cc,
      ...recipients.bcc,
    ];

    return all_recipients.some((r) => !is_internal_email(r));
  }, [recipients]);

  const send_hook = use_compose_send({
    recipients,
    subject,
    message,
    attachments: attachment_hook.attachments,
    contacts,
    selected_sender,
    has_external_recipients,
    expires_at,
    expiry_password,
    scheduled_time,
    edit_draft,
    session_storage_key,
    enable_offline_queue,
    on_close,
    on_draft_cleared,
    reset_form,
    clear_all_errors,
    set_is_scheduling,
    is_sending_ref,
    save_timer_ref,
    draft_context_id_ref,
  });

  useEffect(() => {
    if (sender_options.length > 0 && !selected_sender) {
      const preferred = preferred_sender_id
        ? sender_options.find((o) => o.id === preferred_sender_id)
        : null;

      set_selected_sender(preferred ?? sender_options[0]);
    }
  }, [sender_options, selected_sender, preferred_sender_id]);

  useEffect(() => {
    if (ghost_mode.is_ghost_enabled && ghost_mode.ghost_sender) {
      set_selected_sender(ghost_mode.ghost_sender);
    }
  }, [ghost_mode.is_ghost_enabled, ghost_mode.ghost_sender]);

  const update_input = useCallback(
    (field: keyof InputsState, value: string) => {
      set_inputs((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const add_recipient = useCallback(
    (field: keyof RecipientsState, email: string) => {
      dispatch_recipients({ type: "ADD", field, email });
      set_inputs((prev) => ({ ...prev, [field]: "" }));
    },
    [],
  );

  const remove_recipient = useCallback(
    (field: keyof RecipientsState, email: string) => {
      dispatch_recipients({ type: "REMOVE", field, email });
    },
    [],
  );

  const remove_last_recipient = useCallback((field: keyof RecipientsState) => {
    dispatch_recipients({ type: "REMOVE_LAST", field });
  }, []);

  const show_cc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, cc: true })),
    [],
  );
  const show_bcc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, bcc: true })),
    [],
  );
  const hide_cc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, cc: false })),
    [],
  );
  const hide_bcc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, bcc: false })),
    [],
  );

  useEffect(() => {
    const load_contacts_fn = async () => {
      try {
        const response = await list_contacts({ limit: 100 });

        if (response.data?.items) {
          const decrypted = await decrypt_contacts(response.data.items);

          set_contacts(decrypted);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_contacts([]);
      }
    };

    const load_recent_recipients_fn = async () => {
      if (!preferences.auto_save_recent_recipients) {
        set_recent_recipients_list([]);

        return;
      }

      try {
        const response = await list_recent_recipients(50);

        if (response.data?.items) {
          const decrypted = await decrypt_recent_recipients(
            response.data.items,
          );

          set_recent_recipients_list(decrypted);
        }
      } catch {
        set_recent_recipients_list([]);
      }
    };

    load_contacts_fn();
    load_recent_recipients_fn();
  }, [load_contacts_trigger, preferences.auto_save_recent_recipients]);

  useEffect(() => {
    if (init_trigger === undefined) {
      if (initialized_ref.current) return;
      initialized_ref.current = true;
    }

    is_sending_ref.current = false;
    draft_hook.user_modified_ref.current = false;
    reset_form();
    draft_hook.set_draft_status("idle");
    set_inputs(INITIAL_INPUTS);
    set_show_delete_confirm(false);
    clear_all_errors();

    if (draft_context_id_ref.current) {
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    if (edit_draft) {
      draft_context_id_ref.current = draft_manager.load_context(
        edit_draft.id,
        edit_draft.version,
        edit_draft.draft_type || "new",
        edit_draft.reply_to_id,
        edit_draft.forward_from_id,
      );
      draft_hook.just_loaded_draft_ref.current = true;
      dispatch_recipients({
        type: "SET",
        field: "to",
        emails: edit_draft.to_recipients,
      });
      dispatch_recipients({
        type: "SET",
        field: "cc",
        emails: edit_draft.cc_recipients,
      });
      dispatch_recipients({
        type: "SET",
        field: "bcc",
        emails: edit_draft.bcc_recipients,
      });
      set_subject(edit_draft.subject);
      set_message(edit_draft.message);
      if (edit_draft.attachments && edit_draft.attachments.length > 0) {
        attachment_hook.set_attachments(
          draft_data_to_attachments(edit_draft.attachments),
        );
      }
      set_visibility({
        cc: edit_draft.cc_recipients.length > 0,
        bcc: edit_draft.bcc_recipients.length > 0,
      });
      draft_hook.set_draft_status("saved");
      draft_hook.set_last_saved_time(new Date(edit_draft.updated_at));

      setTimeout(() => {
        if (message_textarea_ref.current && edit_draft.message) {
          draft_hook.just_loaded_draft_ref.current = true;
          message_textarea_ref.current.innerHTML = edit_draft.message;
          set_message(message_textarea_ref.current.innerHTML);
        }
      }, INITIAL_CONTENT_DELAY_MS);
    } else {
      draft_context_id_ref.current = draft_manager.create_context("new");
      content_initialized_ref.current = false;

      if (initial_to) {
        const emails = initial_to
          .split(",")
          .map((e) => e.trim())
          .filter((e) => is_valid_email(e));

        if (emails.length > 0) {
          dispatch_recipients({ type: "SET", field: "to", emails });
        }
      }
    }

    return () => {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }
    };
  }, [init_trigger]);

  useEffect(() => {
    if (content_initialized_ref.current) return;

    const is_fresh_reply_forward =
      !!edit_draft && edit_draft.id === "" && edit_draft.draft_type !== "new";

    if (edit_draft && !is_fresh_reply_forward) return;

    if (preferences.show_badges_in_signature && !badges_loaded) return;

    content_initialized_ref.current = true;

    setTimeout(() => {
      if (!message_textarea_ref.current) return;

      draft_hook.just_loaded_draft_ref.current = true;

      let content = "";

      const badge_html = preferences.show_badges_in_signature
        ? build_badge_html(badges)
        : "";

      const signature_block =
        preferences.signature_mode === "auto" && default_signature
          ? get_formatted_signature(default_signature) + badge_html
          : badge_html;

      if (is_fresh_reply_forward && edit_draft) {
        content = signature_block + edit_draft.message;
      } else {
        content =
          signature_block +
          get_aster_footer(t, preferences.show_aster_branding);
      }

      const sanitized_result = sanitize_html(content, {
        external_content_mode: "always",
      });

      message_textarea_ref.current.innerHTML = sanitized_result.html;
      set_message(message_textarea_ref.current.innerHTML);
    }, INITIAL_CONTENT_DELAY_MS);
  }, [
    init_trigger,
    badges_loaded,
    badges,
    edit_draft,
    preferences.show_badges_in_signature,
    preferences.show_aster_branding,
    preferences.signature_mode,
    default_signature,
    get_formatted_signature,
    t,
  ]);

  files_drop_ref.current = attachment_hook.handle_files_drop;

  useEffect(() => {
    if (!enable_ctrl_enter_send) return;

    const editor_el = message_textarea_ref.current;

    if (!editor_el) return;

    const handle_keydown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "enter" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("astermail:compose-send"));
      }
    };

    editor_el.addEventListener("keydown", handle_keydown);

    return () => editor_el.removeEventListener("keydown", handle_keydown);
  }, [enable_ctrl_enter_send]);

  useEffect(() => {
    if (!enable_ctrl_enter_send) return;

    const handle_compose_send = () => {
      if (recipients.to.length > 0) {
        window.dispatchEvent(new CustomEvent("astermail:trigger-send"));
      }
    };

    window.addEventListener("astermail:compose-send", handle_compose_send);

    return () =>
      window.removeEventListener("astermail:compose-send", handle_compose_send);
  }, [recipients.to.length, enable_ctrl_enter_send]);

  useEffect(() => {
    if (!enable_ctrl_enter_send) return;

    const handle_trigger_send = () => {
      send_hook.handle_send();
    };

    window.addEventListener("astermail:trigger-send", handle_trigger_send);

    return () =>
      window.removeEventListener("astermail:trigger-send", handle_trigger_send);
  }, [send_hook.handle_send, enable_ctrl_enter_send]);

  useEffect(() => {
    const handle_undo_event = (event: CustomEvent<UndoSendEvent>) => {
      const { id } = event.detail;

      if (id !== send_hook.queued_email_id) return;

      const saved = sessionStorage.getItem(session_storage_key);

      if (saved) {
        try {
          const data = JSON.parse(saved) as {
            to_recipients?: string[];
            cc_recipients?: string[];
            bcc_recipients?: string[];
            subject?: string;
            message?: string;
          };

          dispatch_recipients({
            type: "SET",
            field: "to",
            emails: data.to_recipients || [],
          });
          dispatch_recipients({
            type: "SET",
            field: "cc",
            emails: data.cc_recipients || [],
          });
          dispatch_recipients({
            type: "SET",
            field: "bcc",
            emails: data.bcc_recipients || [],
          });
          set_subject(data.subject || "");
          set_message(data.message || "");
          set_visibility({
            cc: (data.cc_recipients || []).length > 0,
            bcc: (data.bcc_recipients || []).length > 0,
          });
          sessionStorage.removeItem(session_storage_key);
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          show_toast(t("common.failed_to_restore_draft"), "error");
        }
      }

      send_hook.set_queued_email_id(null);
    };

    window.addEventListener(
      "astermail:undo-send",
      handle_undo_event as EventListener,
    );

    return () => {
      window.removeEventListener(
        "astermail:undo-send",
        handle_undo_event as EventListener,
      );
    };
  }, [send_hook.queued_email_id, session_storage_key, t]);

  const handle_show_delete_confirm = useCallback(
    () => set_show_delete_confirm(true),
    [],
  );
  const handle_hide_delete_confirm = useCallback(
    () => set_show_delete_confirm(false),
    [],
  );

  return {
    recipients,
    inputs,
    visibility,
    subject,
    set_subject,
    message,
    attachments: attachment_hook.attachments,
    show_delete_confirm,
    draft_status: draft_hook.draft_status,
    last_saved_time: draft_hook.last_saved_time,
    send_error: send_hook.send_error,
    restore_error: send_hook.restore_error,
    attachment_error: attachment_hook.attachment_error,
    set_attachment_error: attachment_hook.set_attachment_error,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    contacts,
    recent_recipients: recent_recipients_list,
    sender_options,
    aliases_loading,
    selected_sender,
    set_selected_sender,
    preferred_sender_id,
    set_preferred_sender,
    ghost_mode,
    editor: editor_hook.editor,
    active_formats: editor_hook.editor.format_state.active_formats,
    is_mac: editor_hook.editor.is_mac,
    is_plain_text_mode: editor_hook.is_plain_text_mode,
    toggle_plain_text_mode: editor_hook.toggle_plain_text_mode,
    show_plain_text_confirm: editor_hook.show_plain_text_confirm,
    confirm_plain_text_mode: editor_hook.confirm_plain_text_mode,
    cancel_plain_text_confirm: editor_hook.cancel_plain_text_confirm,
    has_external_recipients,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,

    attachments_scroll_ref:
      attachment_hook.attachments_scroll_ref as React.RefObject<HTMLDivElement>,
    file_input_ref:
      attachment_hook.file_input_ref as React.RefObject<HTMLInputElement>,
    message_textarea_ref:
      message_textarea_ref as React.RefObject<HTMLDivElement>,

    update_input,
    add_recipient,
    remove_recipient,
    remove_last_recipient,
    show_cc_field,
    show_bcc_field,
    hide_cc_field,
    hide_bcc_field,
    reset_form,
    clear_all_errors,
    remove_attachment: attachment_hook.remove_attachment,
    handle_file_select: attachment_hook.handle_file_select,
    handle_files_drop: attachment_hook.handle_files_drop,
    trigger_file_select: attachment_hook.trigger_file_select,
    handle_editor_input: editor_hook.handle_editor_input,
    handle_editor_paste: editor_hook.handle_editor_paste,
    handle_template_select: editor_hook.handle_template_select,
    exec_format_command: editor_hook.exec_format_command,
    handle_insert_link: editor_hook.handle_insert_link,
    handle_send: send_hook.handle_send,
    handle_scheduled_send: send_hook.handle_scheduled_send,
    handle_delete_draft: draft_hook.handle_delete_draft,
    handle_show_delete_confirm,
    pgp_enabled: send_hook.pgp_enabled,
    toggle_pgp: send_hook.toggle_pgp,
    handle_hide_delete_confirm,
    handle_close: draft_hook.handle_close,

    schedule_picker_element: null,
    expiration_picker_element: null,
    template_picker_element: null,
  };
}
