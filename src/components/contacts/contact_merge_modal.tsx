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
import type { DecryptedContact, Address } from "@/types/contacts";

import { useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import {
  merge_contacts,
  merge_contact_fields,
} from "@/services/api/contact_duplicates";

interface ContactMergeModalProps {
  contact_1: DecryptedContact;
  contact_2: DecryptedContact;
  on_close: () => void;
  on_merged: (merged_contact_id: string) => void;
}

type FieldPreference = "contact_1" | "contact_2";
type EmailPreference = "merge" | "contact_1" | "contact_2";

interface MergePreferences {
  name: FieldPreference;
  emails: EmailPreference;
  phone: FieldPreference;
  company: FieldPreference;
  address: FieldPreference;
}

function get_full_name(contact: DecryptedContact, t: (key: TranslationKey) => string): string {
  return `${contact.first_name} ${contact.last_name}`.trim() || t("common.no_name");
}

function get_initials(contact: DecryptedContact): string {
  const first = contact.first_name?.[0] || "";
  const last = contact.last_name?.[0] || "";

  return (first + last).toUpperCase() || "?";
}

function format_address(address?: Address): string | undefined {
  if (!address) return undefined;
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function ContactMergeModal({
  contact_1,
  contact_2,
  on_close,
  on_merged,
}: ContactMergeModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [preferences, set_preferences] = useState<MergePreferences>({
    name: "contact_1",
    emails: "merge",
    phone: "contact_1",
    company: "contact_1",
    address: "contact_1",
  });
  const [is_merging, set_is_merging] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const merged_preview = useMemo(() => {
    return merge_contact_fields(contact_1, contact_2, preferences);
  }, [contact_1, contact_2, preferences]);

  const handle_merge = useCallback(async () => {
    set_is_merging(true);
    set_error(null);

    try {
      const merged_data = merge_contact_fields(
        contact_1,
        contact_2,
        preferences,
      );
      const response = await merge_contacts(
        contact_1.id,
        contact_2.id,
        merged_data,
      );

      if (response.error || !response.data) {
        set_error(response.error || t("common.failed_to_merge_contacts"));

        return;
      }

      on_merged(response.data.merged_contact_id);
    } catch (err) {
      set_error(err instanceof Error ? err.message : t("common.merge_failed"));
    } finally {
      set_is_merging(false);
    }
  }, [contact_1, contact_2, preferences, on_merged]);

  const update_preference = useCallback(
    <K extends keyof MergePreferences>(key: K, value: MergePreferences[K]) => {
      set_preferences((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      onClick={on_close}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="bg-background rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={reduce_motion ? false : { scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <div className="flex items-center gap-2">
            <ArrowsRightLeftIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {t("common.merge_contacts")}
            </h2>
          </div>
          <Button
            className="p-1.5"
            size="md"
            variant="ghost"
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-xl bg-default-100">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold mb-2">
                {contact_1.avatar_url ? (
                  <img
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                    src={contact_1.avatar_url}
                  />
                ) : (
                  get_initials(contact_1)
                )}
              </div>
              <p className="font-medium text-sm">{get_full_name(contact_1, t)}</p>
              {contact_1.emails[0] && (
                <p className="text-xs text-foreground-500 truncate">
                  {contact_1.emails[0]}
                </p>
              )}
            </div>

            <div className="text-center p-3 rounded-xl bg-default-100">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-semibold mb-2">
                {contact_2.avatar_url ? (
                  <img
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                    src={contact_2.avatar_url}
                  />
                ) : (
                  get_initials(contact_2)
                )}
              </div>
              <p className="font-medium text-sm">{get_full_name(contact_2, t)}</p>
              {contact_2.emails[0] && (
                <p className="text-xs text-foreground-500 truncate">
                  {contact_2.emails[0]}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground-600">
              {t("common.choose_values_to_keep")}
            </h3>

            <FieldSelector
              label={t("common.name")}
              on_select={(v) => update_preference("name", v as FieldPreference)}
              selected={preferences.name}
              value_1={get_full_name(contact_1, t)}
              value_2={get_full_name(contact_2, t)}
            />

            <EmailFieldSelector
              emails_1={contact_1.emails}
              emails_2={contact_2.emails}
              merged_emails={merged_preview.emails}
              on_select={(v) => update_preference("emails", v)}
              selected={preferences.emails}
            />

            {(contact_1.phone || contact_2.phone) && (
              <FieldSelector
                label={t("common.phone")}
                on_select={(v) =>
                  update_preference("phone", v as FieldPreference)
                }
                selected={preferences.phone}
                value_1={contact_1.phone}
                value_2={contact_2.phone}
              />
            )}

            {(contact_1.company || contact_2.company) && (
              <FieldSelector
                label={t("common.company")}
                on_select={(v) =>
                  update_preference("company", v as FieldPreference)
                }
                selected={preferences.company}
                value_1={contact_1.company}
                value_2={contact_2.company}
              />
            )}

            {(contact_1.address || contact_2.address) && (
              <FieldSelector
                label={t("common.address")}
                on_select={(v) =>
                  update_preference("address", v as FieldPreference)
                }
                selected={preferences.address}
                value_1={format_address(contact_1.address)}
                value_2={format_address(contact_2.address)}
              />
            )}
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <UserIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {t("common.merged_result_preview")}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-foreground-500">
                  {t("common.name_colon")}
                </span>{" "}
                {merged_preview.first_name} {merged_preview.last_name}
              </p>
              <p>
                <span className="text-foreground-500">
                  {t("common.emails_colon")}
                </span>{" "}
                {merged_preview.emails.join(", ") || t("common.none_label")}
              </p>
              {merged_preview.phone && (
                <p>
                  <span className="text-foreground-500">
                    {t("common.phone_colon")}
                  </span>{" "}
                  {merged_preview.phone}
                </p>
              )}
              {merged_preview.company && (
                <p>
                  <span className="text-foreground-500">
                    {t("common.company_colon")}
                  </span>{" "}
                  {merged_preview.company}
                </p>
              )}
              {merged_preview.address && (
                <p>
                  <span className="text-foreground-500">
                    {t("common.address_colon")}
                  </span>{" "}
                  {format_address(merged_preview.address)}
                </p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-danger/10 text-danger text-sm"
                exit={{ opacity: 0, y: -10 }}
                initial={reduce_motion ? false : { opacity: 0, y: -10 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-divider">
          <Button disabled={is_merging} variant="ghost" onClick={on_close}>
            {t("common.cancel")}
          </Button>
          <Button
            className="gap-1.5"
            disabled={is_merging}
            variant="depth"
            onClick={handle_merge}
          >
            {is_merging ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("common.merging")}
              </>
            ) : (
              <>
                <ArrowsRightLeftIcon className="w-4 h-4" />
                {t("common.merge_contacts")}
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface FieldSelectorProps {
  label: string;
  value_1?: string;
  value_2?: string;
  selected: FieldPreference;
  on_select: (value: string) => void;
}

function FieldSelector({
  label,
  value_1,
  value_2,
  selected,
  on_select,
}: FieldSelectorProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-foreground-500">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_1"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          type="button"
          onClick={() => on_select("contact_1")}
        >
          <div className="flex items-center justify-between">
            <span className={cn(!value_1 && "text-foreground-400 italic")}>
              {value_1 || t("common.empty")}
            </span>
            {selected === "contact_1" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
        </button>
        <button
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_2"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          type="button"
          onClick={() => on_select("contact_2")}
        >
          <div className="flex items-center justify-between">
            <span className={cn(!value_2 && "text-foreground-400 italic")}>
              {value_2 || t("common.empty")}
            </span>
            {selected === "contact_2" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

interface EmailFieldSelectorProps {
  emails_1: string[];
  emails_2: string[];
  selected: EmailPreference;
  merged_emails: string[];
  on_select: (value: EmailPreference) => void;
}

function EmailFieldSelector({
  emails_1,
  emails_2,
  selected,
  merged_emails,
  on_select,
}: EmailFieldSelectorProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-foreground-500">{t("mail.emails")}</span>
      <div className="grid grid-cols-3 gap-2">
        <button
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "merge"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          type="button"
          onClick={() => on_select("merge")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{t("common.merge_all")}</span>
            {selected === "merge" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {merged_emails.length === 1 ? t("common.one_email") : t("common.n_emails", { count: merged_emails.length })}
          </span>
        </button>
        <button
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_1"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          type="button"
          onClick={() => on_select("contact_1")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{t("common.contact_1")}</span>
            {selected === "contact_1" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {emails_1.length === 1 ? t("common.one_email") : t("common.n_emails", { count: emails_1.length })}
          </span>
        </button>
        <button
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_2"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          type="button"
          onClick={() => on_select("contact_2")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{t("common.contact_2")}</span>
            {selected === "contact_2" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {emails_2.length === 1 ? t("common.one_email") : t("common.n_emails", { count: emails_2.length })}
          </span>
        </button>
      </div>
    </div>
  );
}
