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
import { SenderProfileModalView, is_aster_email_address } from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ProfileNotesBox } from "@/components/profile/profile_notes_box";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { get_email_domain, get_email_username } from "@/lib/utils";
import {
  create_contact_encrypted,
  delete_contact,
} from "@/services/api/contacts";
import {
  ensure_contact_email_index,
  get_cached_contact_id,
} from "@/services/contact_email_index";
import { block_sender } from "@/services/api/blocked_senders";
import {
  allow_sender,
  remove_allowed_sender,
  check_allowed_senders,
} from "@/services/api/allowed_senders";
import { emit_mail_changed, emit_contacts_changed } from "@/hooks/mail_events";
import { build_sender_mail_query } from "@/utils/contact_mail_search";

export interface SenderProfileModalProps {
  is_open: boolean;
  on_close: () => void;
  email: string;
  name?: string;
  on_compose?: (email: string) => void;
}

export function SenderProfileModal({
  is_open,
  on_close,
  email,
  name,
  on_compose,
}: SenderProfileModalProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { has_keys } = use_auth();
  const reduce_motion = use_should_reduce_motion();

  const [is_contact_loading, set_is_contact_loading] = useState(false);
  const [existing_contact_id, set_existing_contact_id] = useState<
    string | null
  >(() => get_cached_contact_id(email) ?? null);
  const [is_blocking, set_is_blocking] = useState(false);
  const [is_allowlist_loading, set_is_allowlist_loading] = useState(false);
  const [is_allowlisted, set_is_allowlisted] = useState(false);

  const checked_ref = useRef<string | null>(null);
  const domain = get_email_domain(email);
  const is_aster_user = is_aster_email_address(email);
  const display_name = name || get_email_username(email);

  useEffect(() => {
    if (!is_open || !has_keys) return;

    let cancelled = false;

    ensure_contact_email_index().then(() => {
      if (!cancelled) {
        set_existing_contact_id(get_cached_contact_id(email) ?? null);
      }
    });

    if (is_aster_user || checked_ref.current === email) {
      return () => {
        cancelled = true;
      };
    }
    checked_ref.current = email;
    check_allowed_senders([email])
      .then((allowlist_set) => {
        if (!cancelled) {
          set_is_allowlisted(allowlist_set.has(email.trim().toLowerCase()));
        }
      })
      .catch(() => {
        checked_ref.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [is_open, email, has_keys, is_aster_user]);

  useEffect(() => {
    checked_ref.current = null;
    set_existing_contact_id(get_cached_contact_id(email) ?? null);
    set_is_allowlisted(false);
  }, [email]);

  const handle_copy_email = useCallback(async () => {
    try {
      await copy_text_or_throw(email);
      show_toast(t("common.email_copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
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
      const result = await block_sender(email, name);

      if (result.data) {
        show_toast(t("common.blocked_email", { email }), "success");
        on_close();
        emit_mail_changed();
      } else {
        show_toast(
          result.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } catch {
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking, on_close, t]);

  const handle_messages_from = useCallback(() => {
    const search_query = build_sender_mail_query(email);

    on_close();
    if (!search_query) return;
    navigate("/all", { state: { search_query } });
  }, [navigate, email, on_close]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    on_close();
  }, [email, on_compose, on_close]);

  const render_avatar: SenderProfileAvatarRenderer = ({ size, className }) => (
    <ProfileAvatar
      use_domain_logo
      className={className}
      email={email}
      name={display_name}
      size={size}
    />
  );

  return (
    <SenderProfileModalView
      allowlist_disabled={is_allowlist_loading || !has_keys}
      contact_disabled={is_contact_loading || !has_keys}
      display_name={display_name}
      domain={domain}
      email={email}
      is_allowlist_loading={is_allowlist_loading}
      is_allowlisted={is_allowlisted}
      is_aster_user={is_aster_user}
      is_blocking={is_blocking}
      is_contact={!!existing_contact_id}
      is_contact_loading={is_contact_loading}
      is_open={is_open}
      notes={has_keys ? <ProfileNotesBox email={email} /> : undefined}
      on_allowlist_action={handle_allowlist_action}
      on_block_action={handle_block}
      on_close={on_close}
      on_compose={on_compose ? handle_compose : undefined}
      on_contact_action={handle_contact_action}
      on_copy_email={handle_copy_email}
      on_messages_from={handle_messages_from}
      reduce_motion={reduce_motion}
      render_avatar={render_avatar}
      strings={{
        add_to_contacts: t("common.add_to_contacts"),
        remove_from_contacts: t("common.remove_from_contacts"),
        messages_from: t("common.messages_from_sender"),
        send_email: t("common.send_email"),
        allow_sender: t("common.allow_sender"),
        remove_from_allowlist: t("common.remove_from_allowlist_action"),
        block_sender: t("mail.block_sender"),
        close: t("common.close"),
      }}
    />
  );
}
