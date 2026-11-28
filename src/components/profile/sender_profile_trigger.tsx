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
import type { ContactFormData } from "@/types/contacts";
import type { SenderProfileAvatarRenderer } from "@aster/ui";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { is_aster_email_address } from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ProfileNotesInline } from "@/components/profile/profile_notes_inline";
import { SenderAddressCopyRow } from "@/components/profile/sender_address_copy_row";
import { SenderProfileCard } from "@/components/profile/sender_profile_card";
import { SystemSenderCard } from "@/components/profile/system_sender_card";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_email_username,
  is_system_address,
} from "@/lib/utils";
import {
  create_contact_encrypted,
  delete_contact,
} from "@/services/api/contacts";
import {
  ensure_contact_email_index,
  get_cached_contact_id,
} from "@/services/contact_email_index";
import {
  block_sender,
  unblock_sender,
  check_blocked_senders,
} from "@/services/api/blocked_senders";
import {
  allow_sender,
  remove_allowed_sender,
  check_allowed_senders,
} from "@/services/api/allowed_senders";
import { emit_mail_changed, emit_contacts_changed } from "@/hooks/mail_events";
import { build_sender_mail_query } from "@/utils/contact_mail_search";
import { has_text_selection_within } from "@/lib/text_selection";

export interface SenderProfileTriggerProps {
  email: string;
  name?: string;
  children: React.ReactNode;
  on_compose?: (email: string) => void;
  className?: string;
  plain?: boolean;
  selectable?: boolean;
  sender_authenticated?: boolean;
}

export function SenderProfileTrigger({
  email,
  name,
  children,
  on_compose,
  className,
  plain,
  selectable = false,
  sender_authenticated = false,
}: SenderProfileTriggerProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { has_keys } = use_auth();
  const [is_open, set_is_open] = useState(false);
  const [show_notes, set_show_notes] = useState(false);
  const [is_contact_loading, set_is_contact_loading] = useState(false);
  const [existing_contact_id, set_existing_contact_id] = useState<
    string | null
  >(() => get_cached_contact_id(email) ?? null);
  const [is_blocking, set_is_blocking] = useState(false);
  const [is_allowlist_loading, set_is_allowlist_loading] = useState(false);
  const [is_allowlisted, set_is_allowlisted] = useState(false);
  const [is_blocked, set_is_blocked] = useState(false);

  const checked_ref = useRef<string | null>(null);
  const content_ref = useRef<HTMLSpanElement>(null);
  const anchor_ref = useRef<HTMLSpanElement>(null);
  const was_open_ref = useRef(false);
  const is_aster_user = is_aster_email_address(email);
  const display_name = name || get_email_username(email);
  const is_trusted = sender_authenticated && !plain;
  const is_system_sender = is_trusted && is_system_address(email);

  const load_status = useCallback(async () => {
    if (!has_keys || is_system_sender) return;

    ensure_contact_email_index().then(() => {
      set_existing_contact_id(get_cached_contact_id(email) ?? null);
    });

    if (is_aster_user || checked_ref.current === email) return;
    checked_ref.current = email;
    try {
      const [allowlist_set, blocked_set] = await Promise.all([
        check_allowed_senders([email]),
        check_blocked_senders([email]),
      ]);

      set_is_allowlisted(allowlist_set.has(email.trim().toLowerCase()));
      set_is_blocked(blocked_set.has(email.trim().toLowerCase()));
    } catch {
      checked_ref.current = null;
    }
  }, [email, has_keys, is_aster_user, is_system_sender]);

  useEffect(() => {
    if (!is_open) {
      set_show_notes(false);

      return;
    }
    load_status();
  }, [is_open, load_status]);

  useEffect(() => {
    checked_ref.current = null;
    set_existing_contact_id(get_cached_contact_id(email) ?? null);
    set_is_allowlisted(false);
    set_is_blocked(false);
  }, [email]);

  const handle_copy_email = useCallback(async (): Promise<boolean> => {
    try {
      await copy_text_or_throw(email);
      show_toast(t("common.email_copied"), "success");

      return true;
    } catch {
      show_toast(t("common.failed_to_copy"), "error");

      return false;
    }
  }, [email, t]);

  const handle_contact_action = useCallback(async () => {
    if (is_contact_loading || !has_keys) return;
    set_is_contact_loading(true);
    try {
      if (existing_contact_id) {
        const result = await delete_contact(existing_contact_id);

        if (result.data) {
          show_toast(t("common.removed_from_contacts"), "success");
          set_existing_contact_id(null);
          emit_contacts_changed();
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      } else {
        const parts = display_name.split(" ");
        const contact_data: ContactFormData = {
          first_name: parts[0] || "",
          last_name: parts.slice(1).join(" ") || "",
          emails: [email],
          is_favorite: false,
        };
        const result = await create_contact_encrypted(contact_data);

        if (result.data) {
          show_toast(t("common.added_to_contacts"), "success");
          set_existing_contact_id(result.data.id);
          emit_contacts_changed();
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      }
    } catch {
      show_toast(t("common.failed_to_update_contact"), "error");
    } finally {
      set_is_contact_loading(false);
    }
  }, [
    email,
    display_name,
    is_contact_loading,
    has_keys,
    existing_contact_id,
    t,
  ]);

  const handle_allowlist_action = useCallback(async () => {
    if (is_allowlist_loading || !has_keys) return;
    set_is_allowlist_loading(true);
    try {
      if (is_allowlisted) {
        const result = await remove_allowed_sender(email);

        if (result.data) {
          show_toast(t("common.removed_from_allowlist", { email }), "success");
          set_is_allowlisted(false);
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      } else {
        const result = await allow_sender(email, name);

        if (result.data) {
          show_toast(t("common.added_to_allowlist", { email }), "success");
          set_is_allowlisted(true);
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      }
    } catch {
      show_toast(t("common.failed_to_allow_sender"), "error");
    } finally {
      set_is_allowlist_loading(false);
    }
  }, [email, name, is_allowlist_loading, is_allowlisted, has_keys, t]);

  const handle_block = useCallback(async () => {
    if (is_blocking) return;
    set_is_blocking(true);
    try {
      if (is_blocked) {
        const result = await unblock_sender(email);

        if (result.data) {
          show_toast(t("common.unblocked_email", { email }), "success");
          set_is_blocked(false);
          emit_mail_changed();
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      } else {
        const result = await block_sender(email, name);

        if (result.data) {
          show_toast(t("common.blocked_email", { email }), "success");
          set_is_blocked(true);
          emit_mail_changed();
        } else {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );
        }
      }
    } catch {
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking, is_blocked, t]);

  const handle_messages_from = useCallback(() => {
    const search_query = build_sender_mail_query(email);

    set_is_open(false);
    if (!search_query) return;
    navigate("/all", { state: { search_query } });
  }, [navigate, email]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    set_is_open(false);
  }, [email, on_compose]);

  const handle_selectable_click = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      if (has_text_selection_within(content_ref.current)) return;
      load_status();
      set_is_open(true);
    },
    [load_status],
  );

  const handle_selectable_mouse_down = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (e.button !== 0 || e.detail < 2) return;
      e.preventDefault();
    },
    [],
  );

  const handle_selectable_key_down = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e["key"] !== "Enter" && e["key"] !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      load_status();
      set_is_open(true);
    },
    [load_status],
  );

  useEffect(() => {
    if (!selectable) return;
    anchor_ref.current?.setAttribute("inert", "");
  }, [selectable]);

  useEffect(() => {
    if (!selectable || is_open || !was_open_ref.current) {
      was_open_ref.current = is_open;

      return;
    }
    was_open_ref.current = false;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;

      if (!active || active === document.body) {
        content_ref.current?.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [is_open, selectable]);

  const render_avatar: SenderProfileAvatarRenderer = ({ size, className }) => (
    <ProfileAvatar
      use_domain_logo
      className={className}
      email={email}
      name={display_name}
      plain={plain}
      sender_authenticated={is_trusted}
      size={size}
    />
  );

  const system_card = (
    trigger_children: React.ReactNode,
    trigger_class?: string,
  ) => (
    <SystemSenderCard
      display_name={display_name}
      email={email}
      is_open={is_open}
      render_avatar={render_avatar}
      trigger_className={trigger_class}
      on_copy_email={handle_copy_email}
      on_open_change={set_is_open}
    >
      {trigger_children}
    </SystemSenderCard>
  );

  const standard_card = (trigger_children: React.ReactNode, trigger_class?: string) => (
    <SenderProfileCard
      copy_row={
        <SenderAddressCopyRow email={email} on_copy={handle_copy_email} />
      }
      allowlist_disabled={is_allowlist_loading || !has_keys}
      contact_disabled={is_contact_loading || !has_keys}
      display_name={display_name}
      email={email}
      is_allowlist_loading={is_allowlist_loading}
      is_allowlisted={is_allowlisted}
      is_aster_user={is_aster_user}
      is_blocked={is_blocked}
      is_blocking={is_blocking}
      is_contact={!!existing_contact_id}
      is_contact_loading={is_contact_loading}
      is_open={is_open}
      notes={has_keys ? <ProfileNotesInline email={email} /> : undefined}
      on_allowlist_action={handle_allowlist_action}
      on_block_action={handle_block}
      on_compose={on_compose ? handle_compose : undefined}
      on_contact_action={handle_contact_action}
      on_messages_from={handle_messages_from}
      on_open_change={set_is_open}
      on_toggle_notes={() => set_show_notes((p) => !p)}
      on_trigger_intent={load_status}
      render_avatar={render_avatar}
      show_notes={show_notes}
      strings={{
        add_to_contacts: t("common.add_to_contacts"),
        remove_from_contacts: t("common.remove_from_contacts"),
        notes: t("common.notes"),
        hide_notes: t("common.hide_notes"),
        messages_from: t("common.messages_from_sender"),
        send_email: t("common.send_email"),
        allow_sender: t("common.allow_sender"),
        remove_from_allowlist: t("common.remove_from_allowlist_action"),
        block_sender: t("mail.block_sender"),
        unblock_sender: t("mail.unblock_sender"),
      }}
      trigger_className={trigger_class}
    >
      {trigger_children}
    </SenderProfileCard>
  );

  const card = is_system_sender ? system_card : standard_card;

  if (!selectable) return card(children, className);

  return (
    <span className="relative inline-flex min-w-0 max-w-full">
      <span
        ref={content_ref}
        data-selectable
        className={`outline-none cursor-pointer${className ? ` ${className}` : ""}`}
        role="button"
        tabIndex={0}
        onClick={handle_selectable_click}
        onFocus={load_status}
        onKeyDown={handle_selectable_key_down}
        onMouseDown={handle_selectable_mouse_down}
        onPointerEnter={load_status}
      >
        {children}
      </span>
      <span
        ref={anchor_ref}
        aria-hidden
        className="pointer-events-none absolute bottom-0 start-0 h-0 w-0 overflow-hidden"
      >
        {card(null, "block h-0 w-0")}
      </span>
    </span>
  );
}
