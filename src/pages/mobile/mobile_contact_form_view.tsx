//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedContact, ContactFormData } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UsersIcon,
  EnvelopeIcon,
  ChevronLeftIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  CakeIcon,
  GlobeAltIcon,
  MapPinIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ButtonSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_keep_focused_field_visible } from "@/hooks/use_keep_focused_field_visible";
import {
  ContactDateClearButton,
  contact_date_clear_padding,
} from "@/components/contacts/contact_date_clear_button";
import {
  contact_date_input_value,
  format_contact_date,
  is_partial_contact_date,
} from "@/utils/date_utils";
import {
  EMAIL_TYPE_OPTIONS,
  PHONE_TYPE_OPTIONS,
} from "@/components/common/contacts/contact_detail_panel/helpers";

import {
  MobileAddressList,
  MobileTypedEntryList,
} from "./mobile_contact_entry_fields";

export type ContactEntryPatch = Partial<
  Pick<ContactFormData, "email_entries" | "phone_entries" | "address_entries">
>;

export type CreateTab = "basic" | "details" | "address" | "social";

function FormSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--border-primary)] pb-2">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FormInput({
  placeholder,
  value,
  on_change,
  type = "text",
  autoFocus,
}: {
  placeholder?: string;
  value: string;
  on_change: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      autoFocus={autoFocus}
      className="w-full"
      placeholder={placeholder}
      type={type}
      value={value}
      onChange={(e) => on_change(e.target.value)}
    />
  );
}

export function ContactFormView({
  contact,
  form_data,
  is_saving,
  create_tab,
  create_tabs,
  on_back,
  on_save,
  on_set_tab,
  on_update_form,
  on_update_entries,
  on_update_social,
  reduce_motion,
  t,
}: {
  contact: DecryptedContact | null;
  form_data: ContactFormData;
  is_saving: boolean;
  create_tab: CreateTab;
  create_tabs: { id: CreateTab; label: string }[];
  on_back: () => void;
  on_save: () => void;
  on_set_tab: (tab: CreateTab) => void;
  on_update_form: (key: string, value: string) => void;
  on_update_entries: (patch: ContactEntryPatch) => void;
  on_update_social: (key: string, value: string) => void;
  reduce_motion: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const scroll_ref = useRef<HTMLDivElement>(null);
  const email_entries = form_data.email_entries ?? [];
  const phone_entries = form_data.phone_entries ?? [];
  const address_entries = form_data.address_entries ?? [];
  const first_email =
    email_entries.find((entry) => entry.value.trim())?.value.trim() ?? "";

  use_keep_focused_field_visible(scroll_ref);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={reduce_motion ? { duration: 0 } : { duration: 0.2 }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-2 py-2 safe-area-pt">
        <button
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-primary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_back}
        >
          <ChevronLeftIcon className="h-5 w-5 rtl:-scale-x-100" />
        </button>
        <span className="flex-1 text-[16px] font-semibold text-[var(--text-primary)]">
          {contact ? t("common.edit") : t("common.add_contact")}
        </span>
        <button
          className="rounded-[var(--aster-radius-control)] px-4 py-1.5 text-[14px] font-semibold text-white disabled:opacity-40"
          disabled={!first_email || is_saving}
          style={{
            background:
              "linear-gradient(to bottom, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
          }}
          type="button"
          onClick={on_save}
        >
          {t("common.save")}
          {is_saving && <ButtonSpinner size="xs" />}
        </button>
      </div>

      <div className="flex items-center gap-4 px-6 py-5">
        <ProfileAvatar
          use_domain_logo
          email={first_email}
          name={
            [form_data.first_name, form_data.last_name]
              .filter(Boolean)
              .join(" ") || t("common.add_contact")
          }
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-[var(--text-primary)]">
            {[form_data.first_name, form_data.last_name]
              .filter(Boolean)
              .join(" ") ||
              (contact ? t("common.edit") : t("common.add_contact"))}
          </p>
          {first_email && (
            <p className="truncate text-[13px] text-[var(--text-muted)]">
              {first_email}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="relative flex rounded-lg bg-[var(--bg-tertiary)] p-1">
          {create_tabs.map((tab) => (
            <button
              key={tab.id}
              className={`relative z-10 flex-1 rounded-[var(--aster-radius-control)] py-1.5 text-[13px] font-medium transition-colors ${
                create_tab === tab.id
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]"
              }`}
              type="button"
              onClick={() => on_set_tab(tab.id)}
            >
              {create_tab === tab.id && (
                <motion.div
                  className="absolute inset-0 rounded-md bg-[var(--bg-primary)] shadow-sm"
                  layoutId="contact-tab-indicator"
                  transition={
                    reduce_motion
                      ? { duration: 0 }
                      : { type: "tween", duration: 0.2, ease: "easeOut" }
                  }
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scroll_ref} className="flex-1 overflow-y-auto px-4 pb-8">
        <AnimatePresence mode="wait">
          {create_tab === "basic" && (
            <motion.div
              key="basic"
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
              exit={reduce_motion ? undefined : { opacity: 0, x: -10 }}
              initial={reduce_motion ? false : { opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <FormSection
                icon={<UsersIcon className="h-4 w-4" />}
                label={t("common.name_section")}
              >
                <div className="flex gap-2">
                  <FormInput
                    autoFocus
                    on_change={(v) => on_update_form("first_name", v)}
                    placeholder={t("common.first_name")}
                    value={form_data.first_name}
                  />
                  <FormInput
                    on_change={(v) => on_update_form("last_name", v)}
                    placeholder={t("common.last_name")}
                    value={form_data.last_name}
                  />
                </div>
              </FormSection>
              <FormSection
                icon={<EnvelopeIcon className="h-4 w-4" />}
                label={t("common.email_section")}
              >
                <MobileTypedEntryList
                  default_type="home"
                  entries={email_entries}
                  input_type="email"
                  max_rows={10}
                  min_rows={1}
                  on_change={(next) => on_update_entries({ email_entries: next })}
                  options={EMAIL_TYPE_OPTIONS}
                  placeholder={t("auth.email")}
                  t={t}
                />
              </FormSection>
            </motion.div>
          )}

          {create_tab === "details" && (
            <motion.div
              key="details"
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
              exit={reduce_motion ? undefined : { opacity: 0, x: -10 }}
              initial={reduce_motion ? false : { opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <FormSection
                icon={<PhoneIcon className="h-4 w-4" />}
                label={t("common.phone_section")}
              >
                <MobileTypedEntryList
                  default_type="mobile"
                  entries={phone_entries}
                  input_type="tel"
                  on_change={(next) => on_update_entries({ phone_entries: next })}
                  options={PHONE_TYPE_OPTIONS}
                  placeholder={t("common.phone")}
                  t={t}
                />
              </FormSection>
              <FormSection
                icon={<BuildingOfficeIcon className="h-4 w-4" />}
                label={t("common.company")}
              >
                <FormInput
                  on_change={(v) => on_update_form("company", v)}
                  placeholder={t("common.company")}
                  value={form_data.company ?? ""}
                />
              </FormSection>
              <FormSection
                icon={<BriefcaseIcon className="h-4 w-4" />}
                label={t("common.job_title")}
              >
                <FormInput
                  on_change={(v) => on_update_form("job_title", v)}
                  placeholder={t("common.job_title")}
                  value={form_data.job_title ?? ""}
                />
              </FormSection>
              <FormSection
                icon={<CakeIcon className="h-4 w-4" />}
                label={t("common.birthday_section")}
              >
                {is_partial_contact_date(form_data.birthday ?? "") ? (
                  <div className="relative">
                    <Input
                      readOnly
                      aria-label={t("common.birthday_section")}
                      className={`w-full ${contact_date_clear_padding(false)}`}
                      value={format_contact_date(form_data.birthday ?? "")}
                    />
                    <ContactDateClearButton
                      beside_picker={false}
                      label={t("common.clear")}
                      on_clear={() => on_update_form("birthday", "")}
                    />
                  </div>
                ) : (
                  <FormInput
                    on_change={(v) => on_update_form("birthday", v)}
                    type="date"
                    value={contact_date_input_value(form_data.birthday ?? "")}
                  />
                )}
              </FormSection>
              <FormSection
                icon={<ChatBubbleLeftIcon className="h-4 w-4" />}
                label={t("common.notes_section")}
              >
                <textarea
                  className="aster_input w-full resize-none px-3 py-2.5 text-[14px]"
                  placeholder={t("common.notes")}
                  rows={3}
                  value={form_data.notes ?? ""}
                  onChange={(e) => on_update_form("notes", e.target.value)}
                />
              </FormSection>
            </motion.div>
          )}

          {create_tab === "address" && (
            <motion.div
              key="address"
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
              exit={reduce_motion ? undefined : { opacity: 0, x: -10 }}
              initial={reduce_motion ? false : { opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <FormSection
                icon={<MapPinIcon className="h-4 w-4" />}
                label={t("common.address_section")}
              >
                <MobileAddressList
                  entries={address_entries}
                  on_change={(next) =>
                    on_update_entries({ address_entries: next })
                  }
                  t={t}
                />
              </FormSection>
            </motion.div>
          )}

          {create_tab === "social" && (
            <motion.div
              key="social"
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
              exit={reduce_motion ? undefined : { opacity: 0, x: -10 }}
              initial={reduce_motion ? false : { opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <FormSection
                icon={<GlobeAltIcon className="h-4 w-4" />}
                label={t("common.social_section")}
              >
                <FormInput
                  on_change={(v) => on_update_social("website", v)}
                  placeholder={t("common.website")}
                  type="url"
                  value={form_data.social_links?.website ?? ""}
                />
                <FormInput
                  on_change={(v) => on_update_social("linkedin", v)}
                  placeholder={t("common.linkedin")}
                  value={form_data.social_links?.linkedin ?? ""}
                />
                <FormInput
                  on_change={(v) => on_update_social("twitter", v)}
                  placeholder={t("common.twitter_x")}
                  value={form_data.social_links?.twitter ?? ""}
                />
                <FormInput
                  on_change={(v) => on_update_social("github", v)}
                  placeholder={t("common.github")}
                  value={form_data.social_links?.github ?? ""}
                />
              </FormSection>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
