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

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ProfileDropdownView } from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ProfileNotesInline } from "@/components/profile/profile_notes_inline";
import { show_toast } from "@/components/toast/simple_toast";
import { get_email_username, get_email_domain } from "@/lib/utils";
import {
  create_contact_encrypted,
  delete_contact,
} from "@/services/api/contacts";
import { block_sender } from "@/services/api/blocked_senders";
import {
  ensure_contact_email_index,
  get_cached_contact_id,
} from "@/services/contact_email_index";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { emit_mail_changed, emit_contacts_changed } from "@/hooks/mail_events";
import { build_sender_mail_query } from "@/utils/contact_mail_search";

interface ProfileDropdownProps {
  email: string;
  name?: string;
  children: React.ReactNode;
  on_compose?: (email: string) => void;
}

export function ProfileDropdown({
  email,
  name,
  children,
  on_compose: _on_compose,
}: ProfileDropdownProps) {
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

  const display_name = name || get_email_username(email);
  const domain = get_email_domain(email);

  const prewarm_contact_state = useCallback(() => {
    if (!has_keys) return;

    ensure_contact_email_index().then(() => {
      set_existing_contact_id(get_cached_contact_id(email) ?? null);
    });
  }, [has_keys, email]);

  useEffect(() => {
    set_existing_contact_id(get_cached_contact_id(email) ?? null);
  }, [email]);

  useEffect(() => {
    if (!is_open) {
      set_show_notes(false);

      return;
    }

    if (!has_keys) return;

    let cancelled = false;

    ensure_contact_email_index().then(() => {
      if (!cancelled) {
        set_existing_contact_id(get_cached_contact_id(email) ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [is_open, email, has_keys]);

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
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
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

  const handle_toggle_notes = useCallback(() => {
    set_show_notes((prev) => !prev);
  }, []);

  const handle_messages_from_sender = useCallback(() => {
    const search_query = build_sender_mail_query(email);

    set_is_open(false);
    if (!search_query) return;
    navigate("/all", { state: { search_query } });
  }, [navigate, email]);

  const handle_block_sender = useCallback(async () => {
    if (is_blocking) return;

    set_is_blocking(true);
    try {
      const result = await block_sender(email, name);

      if (result.data) {
        show_toast(t("common.blocked_email", { email }), "success");
        set_is_open(false);
        emit_mail_changed();
      } else {
        show_toast(
          result.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking, t]);

  const labels = useMemo(
    () => ({
      copy: t("common.copy"),
      add_to_contacts: t("common.add_to_contacts"),
      remove_from_contacts: t("common.remove_from_contacts"),
      notes: t("common.notes"),
      hide_notes: t("common.hide_notes"),
      messages_from_sender: t("common.messages_from_sender"),
      block_sender: t("mail.block_sender"),
    }),
    [t],
  );

  return (
    <ProfileDropdownView
      avatar={
        <ProfileAvatar
          use_domain_logo
          className="ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0"
          email={email}
          name={display_name}
          size="md"
        />
      }
      display_name={display_name}
      domain={domain}
      email={email}
      is_blocking={is_blocking}
      is_contact={!!existing_contact_id}
      is_contact_loading={is_contact_loading}
      labels={labels}
      notes={<ProfileNotesInline email={email} />}
      open={is_open}
      show_notes={show_notes}
      on_block_sender={handle_block_sender}
      on_contact_action={handle_contact_action}
      on_copy_email={handle_copy_email}
      on_messages_from_sender={handle_messages_from_sender}
      on_open_change={set_is_open}
      on_prewarm={prewarm_contact_state}
      on_toggle_notes={handle_toggle_notes}
    >
      {children}
    </ProfileDropdownView>
  );
}
