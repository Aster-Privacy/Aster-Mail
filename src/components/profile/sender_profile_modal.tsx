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
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon as ShieldCheckSolid } from "@heroicons/react/24/solid";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ProfileNotesBox } from "@/components/profile/profile_notes_box";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
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
    if (!is_open || !has_keys || checked_ref.current === email) return;
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
          set_is_allowlisted(
            allowlist_set.has(email.trim().toLowerCase()),
          );
        }

        if (contacts_result.data?.items) {
          for (const contact of contacts_result.data.items) {
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

  useEffect(() => {
    if (!is_open) return;
    const on_key = (e: KeyboardEvent) => {
      if (e["key"] === "Escape") on_close();
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [is_open, on_close]);

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
          show_toast(
            t("common.removed_from_allowlist", { email }),
            "success",
          );
          set_is_allowlisted(false);
        } else if (result.error) {
          show_toast(result.error, "error");
        }
      } else {
        const result = await allow_sender(email, name);
        if (result.data) {
          show_toast(
            t("common.added_to_allowlist", { email }),
            "success",
          );
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
        on_close();
        emit_mail_changed();
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } catch {
      show_toast(t("common.failed_to_block_sender"), "error");
    } finally {
      set_is_blocking(false);
    }
  }, [email, name, is_blocking, on_close, t]);

  const handle_messages_from = useCallback(() => {
    on_close();
    navigate("/all", { state: { search_query: `from:${email}` } });
  }, [navigate, email, on_close]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    on_close();
  }, [email, on_compose, on_close]);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
          />

          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-[400px] rounded-2xl overflow-hidden bg-modal-bg border border-edge-primary shadow-[0_25px_60px_-12px_rgba(0,0,0,0.45)]"
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            initial={reduce_motion ? false : { scale: 0.96, opacity: 0, y: 8 }}
            transition={{
              duration: reduce_motion ? 0 : 0.15,
              ease: [0.19, 1, 0.22, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {is_aster_user ? (
              <InternalHeader
                display_name={display_name}
                email={email}
                on_close={on_close}
                t={t}
              />
            ) : (
              <ExternalHeader
                display_name={display_name}
                domain={domain}
                email={email}
                on_close={on_close}
                on_copy_email={handle_copy_email}
                t={t}
              />
            )}

            <div className="py-1">
              <ActionRow
                disabled={is_contact_loading || !has_keys}
                icon={
                  existing_contact_id ? (
                    <UserMinusIcon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                  ) : (
                    <UserPlusIcon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                  )
                }
                label={
                  existing_contact_id
                    ? t("common.remove_from_contacts")
                    : t("common.add_to_contacts")
                }
                loading={is_contact_loading}
                on_click={handle_contact_action}
              />

              <ActionRow
                icon={
                  <EnvelopeIcon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                }
                label={t("common.messages_from_sender")}
                on_click={handle_messages_from}
              />

              {on_compose && (
                <ActionRow
                  icon={
                    <EnvelopeIcon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                  }
                  label={t("common.send_email")}
                  on_click={handle_compose}
                />
              )}

              {!is_aster_user && (
                <>
                  <div className="my-1 mx-4 border-t border-edge-secondary" />

                  <ActionRow
                    disabled={is_allowlist_loading || !has_keys}
                    icon={
                      is_allowlisted ? (
                        <ShieldCheckSolid className="w-[18px] h-[18px] text-emerald-500 flex-shrink-0" />
                      ) : (
                        <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                      )
                    }
                    label={
                      is_allowlisted
                        ? t("common.remove_from_allowlist_action")
                        : t("common.allow_sender")
                    }
                    loading={is_allowlist_loading}
                    on_click={handle_allowlist_action}
                  />

                  <ActionRow
                    danger
                    disabled={is_blocking}
                    icon={
                      <NoSymbolIcon className="w-[18px] h-[18px] text-red-500 flex-shrink-0" />
                    }
                    label={t("mail.block_sender")}
                    loading={is_blocking}
                    on_click={handle_block}
                  />
                </>
              )}
            </div>

            {has_keys && (
              <div className="px-4 pb-4 pt-1 border-t border-edge-secondary">
                <ProfileNotesBox email={email} />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface InternalHeaderProps {
  display_name: string;
  email: string;
  on_close: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function InternalHeader({ display_name, email, on_close, t }: InternalHeaderProps) {
  return (
    <div
      className="relative px-5 pt-6 pb-5"
      style={{
        background:
          "linear-gradient(135deg, #4f46e5 0%, #1e1b4b 100%)",
      }}
    >
      <button
        aria-label={t("common.close")}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        type="button"
        onClick={on_close}
      >
        <XMarkIcon className="w-4 h-4" />
      </button>

      <div className="flex flex-col items-center text-center">
        <ProfileAvatar
          use_domain_logo
          className="mb-3 ring-2 ring-white/20 shadow-lg"
          email={email}
          name={display_name}
          size="xl"
        />
        <h2 className="text-[17px] font-semibold text-white leading-tight">
          {display_name}
        </h2>
        <p className="text-[12px] mt-0.5 text-indigo-200 break-all">{email}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
            <ShieldCheckIcon className="w-3 h-3 text-indigo-200" />
            <span className="text-[11px] font-medium text-indigo-100">
              {t("common.aster_user")}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
            <LockClosedIcon className="w-3 h-3 text-indigo-200" />
            <span className="text-[11px] font-medium text-indigo-100">
              {t("common.end_to_end_encrypted_label")}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface ExternalHeaderProps {
  display_name: string;
  email: string;
  domain: string;
  on_close: () => void;
  on_copy_email: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function ExternalHeader({
  display_name,
  email,
  domain,
  on_close,
  on_copy_email,
  t,
}: ExternalHeaderProps) {
  return (
    <div className="relative px-5 pt-5 pb-4 border-b border-edge-secondary">
      <button
        aria-label={t("common.close")}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surf-hover transition-colors"
        type="button"
        onClick={on_close}
      >
        <XMarkIcon className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-4 pr-8">
        <ProfileAvatar
          use_domain_logo
          className="ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0"
          email={email}
          name={display_name}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-semibold text-txt-primary leading-tight">
            {display_name}
          </h2>
          {domain && (
            <p className="text-[12px] mt-0.5 text-txt-muted">{domain}</p>
          )}
          <button
            className="mt-1 flex items-center gap-1 text-[11px] text-txt-muted hover:text-txt-secondary transition-colors group"
            type="button"
            onClick={on_copy_email}
          >
            <span className="truncate max-w-[220px]">{email}</span>
            <ClipboardDocumentIcon className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  on_click: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}

function ActionRow({
  icon,
  label,
  on_click,
  disabled = false,
  loading = false,
  danger = false,
}: ActionRowProps) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "hover:bg-red-500/8 dark:hover:bg-red-500/10"
          : "hover:bg-surf-hover"
      }`}
      disabled={disabled}
      type="button"
      onClick={on_click}
    >
      {icon}
      <span
        className={`flex-1 text-left text-[14px] ${danger ? "text-red-500" : "text-txt-primary"}`}
      >
        {label}
      </span>
      {loading && (
        <div
          className={`w-3.5 h-3.5 border-2 rounded-full animate-spin flex-shrink-0 ${
            danger
              ? "border-red-500 border-t-transparent"
              : "border-blue-500 border-t-transparent"
          }`}
        />
      )}
    </button>
  );
}
