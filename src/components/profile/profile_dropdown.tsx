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

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlusIcon,
  UserMinusIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  NoSymbolIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ProfileNotesInline } from "@/components/profile/profile_notes_inline";
import { show_toast } from "@/components/toast/simple_toast";
import { get_email_username, get_email_domain } from "@/lib/utils";
import {
  create_contact_encrypted,
  list_contacts,
  decrypt_contact,
  delete_contact,
} from "@/services/api/contacts";
import { block_sender } from "@/services/api/blocked_senders";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { emit_mail_changed, emit_contacts_changed } from "@/hooks/mail_events";

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
  >(null);
  const [is_blocking, set_is_blocking] = useState(false);
  const checked_email_ref = useRef<string | null>(null);

  const display_name = name || get_email_username(email);
  const domain = get_email_domain(email);

  useEffect(() => {
    if (!is_open) {
      set_show_notes(false);

      return;
    }

    if (!has_keys || checked_email_ref.current === email) {
      return;
    }

    checked_email_ref.current = email;

    const check_contact = async () => {
      try {
        const result = await list_contacts({ limit: 200 });

        if (result.data?.items && result.data.items.length > 0) {
          for (const contact of result.data.items) {
            try {
              const decrypted = await decrypt_contact(contact);

              if (
                decrypted.emails.some(
                  (e) => e.toLowerCase() === email.toLowerCase(),
                )
              ) {
                set_existing_contact_id(contact.id);

                return;
              }
            } catch (error) {
              if (import.meta.env.DEV) console.error(error);
              continue;
            }
          }
        }
        set_existing_contact_id(null);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_existing_contact_id(null);
      }
    };

    check_contact();
  }, [is_open, email, has_keys]);

  useEffect(() => {
    checked_email_ref.current = null;
    set_existing_contact_id(null);
  }, [email]);

  const handle_copy_email = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
      show_toast(t("common.email_copied"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const textarea = document.createElement("textarea");

      textarea.value = email;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      show_toast(t("common.email_copied"), "success");
    }
  }, [email]);

  const handle_contact_action = useCallback(async () => {
    if (is_contact_loading || !has_keys) return;

    set_is_contact_loading(true);
    try {
      if (existing_contact_id) {
        const result = await delete_contact(existing_contact_id);

        if (result.data) {
          show_toast(t("common.removed_from_contacts"), "success");
          set_existing_contact_id(null);
          checked_email_ref.current = null;
          emit_contacts_changed();
        } else if (result.error) {
          show_toast(result.error, "error");
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
        } else if (result.error) {
          show_toast(result.error, "error");
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_update_contact"), "error");
    } finally {
      set_is_contact_loading(false);
    }
  }, [email, display_name, is_contact_loading, has_keys, existing_contact_id]);

  const handle_toggle_notes = useCallback(() => {
    set_show_notes((prev) => !prev);
  }, []);

  const handle_messages_from_sender = useCallback(() => {
    set_is_open(false);
    navigate("/all", { state: { search_query: `from:${email}` } });
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
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking]);

  return (
    <DropdownMenu open={is_open} onOpenChange={set_is_open}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <ProfileAvatar
              use_domain_logo
              className="ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0"
              email={email}
              name={display_name}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate text-txt-primary">
                {display_name}
              </p>
              {domain && (
                <p className="text-[11px] truncate text-txt-muted">{domain}</p>
              )}
            </div>
          </div>
          <button
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[12px] text-[12px] transition-colors border text-txt-secondary border-edge-secondary bg-surf-secondary"
            onClick={handle_copy_email}
          >
            <span className="truncate">{email}</span>
            <ClipboardDocumentIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
          </button>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          disabled={is_contact_loading}
          onClick={handle_contact_action}
        >
          {existing_contact_id ? (
            <>
              <UserMinusIcon className="w-4 h-4" />
              <span>{t("common.remove_from_contacts")}</span>
            </>
          ) : (
            <>
              <UserPlusIcon className="w-4 h-4" />
              <span>{t("common.add_to_contacts")}</span>
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            handle_toggle_notes();
          }}
        >
          <DocumentTextIcon className="w-4 h-4" />
          <span>{show_notes ? t("common.hide_notes") : t("common.notes")}</span>
        </DropdownMenuItem>

        {show_notes && (
          <div
            className="mx-1 my-1 rounded-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ProfileNotesInline email={email} />
          </div>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={handle_messages_from_sender}
        >
          <EnvelopeIcon className="w-4 h-4" />
          <span>{t("common.messages_from_sender")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2 cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
          disabled={is_blocking}
          onClick={handle_block_sender}
        >
          <NoSymbolIcon className="w-4 h-4" />
          <span>{t("mail.block_sender")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
