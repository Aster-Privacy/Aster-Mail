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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlusIcon,
  UserMinusIcon,
  EnvelopeIcon,
  NoSymbolIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon as ShieldCheckSolid } from "@heroicons/react/24/solid";

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
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_email_domain, get_email_username } from "@/lib/utils";
import {
  create_contact_encrypted,
  list_contacts,
  decrypt_contact,
  delete_contact,
} from "@/services/api/contacts";
import { block_sender } from "@/services/api/blocked_senders";
import {
  allow_sender,
  remove_allowed_sender,
  check_allowed_senders,
} from "@/services/api/allowed_senders";
import { emit_mail_changed, emit_contacts_changed } from "@/hooks/mail_events";

const ASTER_DOMAINS = new Set(["astermail.org", "aster.cx"]);

function extract_root_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);
  if (!match) return "";
  const parts = match[1].toLowerCase().split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return match[1].toLowerCase();
}

export interface SenderProfileTriggerProps {
  email: string;
  name?: string;
  children: React.ReactNode;
  on_compose?: (email: string) => void;
  className?: string;
}

export function SenderProfileTrigger({
  email,
  name,
  children,
  on_compose,
  className,
}: SenderProfileTriggerProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { has_keys } = use_auth();
  const [is_open, set_is_open] = useState(false);
  const [show_notes, set_show_notes] = useState(false);
  const [is_contact_loading, set_is_contact_loading] = useState(false);
  const [existing_contact_id, set_existing_contact_id] = useState<string | null>(null);
  const [is_blocking, set_is_blocking] = useState(false);
  const [is_allowlist_loading, set_is_allowlist_loading] = useState(false);
  const [is_allowlisted, set_is_allowlisted] = useState(false);

  const checked_ref = useRef<string | null>(null);
  const domain = get_email_domain(email);
  const root_domain = extract_root_domain(email);
  const is_aster_user = ASTER_DOMAINS.has(root_domain);
  const display_name = name || get_email_username(email);

  useEffect(() => {
    if (!is_open) {
      set_show_notes(false);
      return;
    }
    if (!has_keys || checked_ref.current === email) return;
    checked_ref.current = email;

    const check_status = async () => {
      try {
        const [contacts_result, allowlist_set] = await Promise.all([
          list_contacts({ limit: 200 }),
          is_aster_user
            ? Promise.resolve(new Set<string>())
            : check_allowed_senders([email]),
        ]);
        if (!is_aster_user) {
          set_is_allowlisted(allowlist_set.has(email.trim().toLowerCase()));
        }
        if (contacts_result.data?.items) {
          for (const contact of contacts_result.data.items) {
            try {
              const decrypted = await decrypt_contact(contact);
              if (decrypted.emails.some((e) => e.toLowerCase() === email.toLowerCase())) {
                set_existing_contact_id(contact.id);
                return;
              }
            } catch {
              continue;
            }
          }
        }
        set_existing_contact_id(null);
      } catch {
        set_existing_contact_id(null);
      }
    };

    check_status();
  }, [is_open, email, has_keys, is_aster_user]);

  useEffect(() => {
    checked_ref.current = null;
    set_existing_contact_id(null);
    set_is_allowlisted(false);
  }, [email]);

  const handle_copy_email = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
      show_toast(t("common.email_copied"), "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = email;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      show_toast(t("common.email_copied"), "success");
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
          checked_ref.current = null;
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
    } catch {
      show_toast(t("common.failed_to_update_contact"), "error");
    } finally {
      set_is_contact_loading(false);
    }
  }, [email, display_name, is_contact_loading, has_keys, existing_contact_id, t]);

  const handle_allowlist_action = useCallback(async () => {
    if (is_allowlist_loading || !has_keys) return;
    set_is_allowlist_loading(true);
    try {
      if (is_allowlisted) {
        const result = await remove_allowed_sender(email);
        if (result.data) {
          show_toast(t("common.removed_from_allowlist", { email }), "success");
          set_is_allowlisted(false);
        } else if (result.error) {
          show_toast(result.error, "error");
        }
      } else {
        const result = await allow_sender(email, name);
        if (result.data) {
          show_toast(t("common.added_to_allowlist", { email }), "success");
          set_is_allowlisted(true);
        } else if (result.error) {
          show_toast(result.error, "error");
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
        set_is_open(false);
        emit_mail_changed();
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } catch {
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking, t]);

  const handle_messages_from = useCallback(() => {
    set_is_open(false);
    navigate("/all");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("astermail:open-search-with-query", {
          detail: { query: `from:${email}` },
        }),
      );
    }, 100);
  }, [navigate, email]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    set_is_open(false);
  }, [email, on_compose]);

  return (
    <DropdownMenu open={is_open} onOpenChange={set_is_open}>
      <DropdownMenuTrigger asChild>
        <button
          className={className}
          type="button"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {is_aster_user ? (
          <AsterHeader display_name={display_name} email={email} t={t} />
        ) : (
          <ExternalHeader
            display_name={display_name}
            domain={domain}
            email={email}
            on_copy_email={handle_copy_email}
            t={t}
          />
        )}

        <div className="p-1">
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            disabled={is_contact_loading || !has_keys}
            onSelect={(e) => {
              e.preventDefault();
              handle_contact_action();
            }}
          >
            {existing_contact_id ? (
              <UserMinusIcon className="w-4 h-4 flex-shrink-0" />
            ) : (
              <UserPlusIcon className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="flex-1">
              {existing_contact_id
                ? t("common.remove_from_contacts")
                : t("common.add_to_contacts")}
            </span>
            {is_contact_loading && (
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              set_show_notes((p) => !p);
            }}
          >
            <DocumentTextIcon className="w-4 h-4 flex-shrink-0" />
            <span>
              {show_notes ? t("common.hide_notes") : t("common.notes")}
            </span>
          </DropdownMenuItem>

          {show_notes && has_keys && (
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
            onSelect={handle_messages_from}
          >
            <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
            <span>{t("common.messages_from_sender")}</span>
          </DropdownMenuItem>

          {on_compose && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onSelect={handle_compose}
            >
              <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
              <span>{t("common.send_email")}</span>
            </DropdownMenuItem>
          )}

          {!is_aster_user && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                disabled={is_allowlist_loading || !has_keys}
                onSelect={(e) => {
                  e.preventDefault();
                  handle_allowlist_action();
                }}
              >
                {is_allowlisted ? (
                  <ShieldCheckSolid className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                ) : (
                  <ShieldCheckIcon className="w-4 h-4 flex-shrink-0" />
                )}
                <span
                  className={`flex-1 ${is_allowlisted ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                >
                  {is_allowlisted
                    ? t("common.remove_from_allowlist_action")
                    : t("common.allow_sender")}
                </span>
                {is_allowlist_loading && (
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="gap-2 cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
                disabled={is_blocking}
                onSelect={(e) => {
                  e.preventDefault();
                  handle_block();
                }}
              >
                <NoSymbolIcon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{t("mail.block_sender")}</span>
                {is_blocking && (
                  <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </DropdownMenuItem>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AsterHeaderProps {
  display_name: string;
  email: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function AsterHeader({ display_name, email, t }: AsterHeaderProps) {
  return (
    <div
      className="px-3 pt-3 pb-3"
      style={{ background: "linear-gradient(135deg, #4f46e5 0%, #1e1b4b 100%)" }}
    >
      <div className="flex items-center gap-3">
        <ProfileAvatar
          use_domain_logo
          className="ring-2 ring-white/20 flex-shrink-0"
          email={email}
          name={display_name}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">
            {display_name}
          </p>
          <p className="text-[11px] text-indigo-200 truncate">{email}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
          <ShieldCheckIcon className="w-3 h-3 text-indigo-200" />
          <span className="text-[10px] font-medium text-indigo-100">
            {t("common.aster_user")}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
          <LockClosedIcon className="w-3 h-3 text-indigo-200" />
          <span className="text-[10px] font-medium text-indigo-100">
            {t("common.end_to_end_encrypted_label")}
          </span>
        </span>
      </div>
    </div>
  );
}

interface ExternalHeaderProps {
  display_name: string;
  email: string;
  domain: string;
  on_copy_email: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function ExternalHeader({
  display_name,
  email,
  domain,
  on_copy_email,
  t: _t,
}: ExternalHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2 border-b border-edge-secondary">
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
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] transition-colors border text-txt-secondary border-edge-secondary bg-surf-secondary hover:bg-surf-hover"
        type="button"
        onClick={on_copy_email}
      >
        <span className="truncate">{email}</span>
        <ClipboardDocumentIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
      </button>
    </div>
  );
}
