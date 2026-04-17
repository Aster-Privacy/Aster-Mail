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
import type {
  DecryptedContact,
  ContactFormData,
  DecryptedCustomFieldValue,
} from "@/types/contacts";

import { useState, useEffect, useMemo } from "react";
import {
  XMarkIcon,
  StarIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { ContactCustomFields } from "./contact_custom_fields";
import { ContactFormSection } from "./contact_form_section";
import { ContactFormBasic } from "./contact_form_basic";
import { ContactFormDetails } from "./contact_form_details";
import { ContactFormAddress } from "./contact_form_address";
import { ContactFormSocial } from "./contact_form_social";

import { use_i18n } from "@/lib/i18n/context";
import { cn, EMAIL_REGEX } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";

interface ContactFormProps {
  is_open: boolean;
  on_close: () => void;
  on_submit: (data: ContactFormData) => Promise<void>;
  contact?: DecryptedContact | null;
  is_loading?: boolean;
  custom_field_values?: DecryptedCustomFieldValue[];
  on_custom_field_values_change?: (values: DecryptedCustomFieldValue[]) => void;
}

const initial_form_data: ContactFormData = {
  first_name: "",
  last_name: "",
  emails: [""],
  phone: "",
  company: "",
  job_title: "",
  notes: "",
  relationship: undefined,
  birthday: "",
  social_links: {},
  address: {},
  is_favorite: false,
};

const MAX_EMAILS = 5;

type TabId = "basic" | "details" | "address" | "social" | "fields";

export function ContactForm({
  is_open,
  on_close,
  on_submit,
  contact,
  is_loading = false,
  custom_field_values = [],
  on_custom_field_values_change,
}: ContactFormProps) {
  const { t } = use_i18n();
  const [form_data, set_form_data] =
    useState<ContactFormData>(initial_form_data);
  const [errors, set_errors] = useState<Record<string, string>>({});
  const [active_tab, set_active_tab] = useState<TabId>("basic");

  const is_edit_mode = !!contact;

  const preview_name = useMemo(() => {
    return (
      `${form_data.first_name} ${form_data.last_name}`.trim() ||
      t("common.new_contact")
    );
  }, [form_data.first_name, form_data.last_name]);

  const preview_email = useMemo(() => {
    return form_data.emails.find((e) => e.trim()) || "";
  }, [form_data.emails]);

  useEffect(() => {
    if (contact) {
      set_form_data({
        first_name: contact.first_name,
        last_name: contact.last_name,
        emails: contact.emails.length > 0 ? contact.emails : [""],
        phone: contact.phone || "",
        company: contact.company || "",
        job_title: contact.job_title || "",
        notes: contact.notes || "",
        relationship: contact.relationship,
        birthday: contact.birthday || "",
        social_links: contact.social_links || {},
        address: contact.address || {},
        is_favorite: contact.is_favorite,
        avatar_url: contact.avatar_url,
      });
    } else {
      set_form_data(initial_form_data);
    }
    set_errors({});
    set_active_tab("basic");
  }, [contact, is_open]);

  const handle_change = (field: keyof ContactFormData, value: unknown) => {
    set_form_data((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      set_errors((prev) => {
        const next = { ...prev };

        delete next[field];

        return next;
      });
    }
  };

  const handle_email_change = (index: number, value: string) => {
    const new_emails = [...form_data.emails];

    new_emails[index] = value;
    set_form_data((prev) => ({ ...prev, emails: new_emails }));
    if (errors.emails) {
      set_errors((prev) => {
        const next = { ...prev };

        delete next.emails;

        return next;
      });
    }
  };

  const add_email_field = () => {
    if (form_data.emails.length >= MAX_EMAILS) return;
    set_form_data((prev) => ({ ...prev, emails: [...prev.emails, ""] }));
  };

  const remove_email_field = (index: number) => {
    if (form_data.emails.length > 1) {
      const new_emails = form_data.emails.filter((_, i) => i !== index);

      set_form_data((prev) => ({ ...prev, emails: new_emails }));
    }
  };

  const handle_address_change = (field: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      address: { ...prev.address, [field]: value },
    }));
  };

  const handle_social_change = (field: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [field]: value },
    }));
  };

  const validate_form = (): boolean => {
    const new_errors: Record<string, string> = {};

    if (!form_data.first_name.trim() && !form_data.last_name.trim()) {
      new_errors.first_name = t("common.at_least_one_name_required");
    }

    const valid_emails = form_data.emails.filter((email) => email.trim());

    if (valid_emails.length === 0) {
      new_errors.emails = t("common.at_least_one_email_required");
    } else {
      const invalid_email = valid_emails.find(
        (email) => !EMAIL_REGEX.test(email),
      );

      if (invalid_email) {
        new_errors.emails = t("common.enter_valid_emails");
      }
    }

    set_errors(new_errors);

    return Object.keys(new_errors).length === 0;
  };

  const handle_submit = async () => {
    if (!validate_form() || is_loading) return;

    const cleaned_data: ContactFormData = {
      ...form_data,
      emails: form_data.emails.filter((email) => email.trim()),
    };

    await on_submit(cleaned_data);
  };

  const handle_close = () => {
    if (is_loading) return;
    on_close();
  };

  const base_tabs: { id: TabId; label: string }[] = [
    { id: "basic", label: t("common.basic") },
    { id: "details", label: t("common.details") },
    { id: "address", label: t("common.address") },
    { id: "social", label: t("common.social") },
  ];

  const edit_tabs: { id: TabId; label: string }[] = [
    { id: "fields", label: t("common.fields") },
  ];

  const tabs = is_edit_mode ? [...base_tabs, ...edit_tabs] : base_tabs;

  if (!is_open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-modal-overlay"
      role="presentation"
      onClick={handle_close}
      onKeyDown={(e) => {
        if (e["key"] === "Escape") handle_close();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden bg-modal-bg border-edge-primary"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4">
          <div className="relative">
            <ProfileAvatar
              email={preview_email}
              image_url={form_data.avatar_url}
              name={preview_name}
              size="xl"
            />
            <button
              className={cn(
                "absolute -bottom-1 -right-1 p-0.5 rounded transition-colors",
                form_data.is_favorite
                  ? "text-amber-400"
                  : "text-txt-muted hover:text-amber-400",
              )}
              type="button"
              onClick={() =>
                handle_change("is_favorite", !form_data.is_favorite)
              }
            >
              <StarIcon
                className={cn(
                  "w-[18px] h-[18px]",
                  form_data.is_favorite && "fill-current",
                )}
              />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-txt-primary">
              {is_edit_mode
                ? t("common.edit_contact")
                : t("common.new_contact")}
            </h2>
            <p className="text-[13px] mt-0.5 truncate text-txt-muted">
              {preview_name !== t("common.new_contact")
                ? preview_name
                : t("common.enter_contact_details")}
            </p>
          </div>
          <button
            className="p-2 -mr-2 -mt-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            onClick={handle_close}
          >
            <XMarkIcon className="w-5 h-5 text-txt-muted" />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="relative flex p-1 rounded-lg overflow-x-auto bg-surf-secondary">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "relative z-10 flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md whitespace-nowrap",
                  active_tab === tab.id
                    ? "bg-surf-primary text-txt-primary"
                    : "text-txt-muted",
                )}
                onClick={() => set_active_tab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-4 min-h-[280px]">
          {active_tab === "basic" && (
            <ContactFormBasic
              errors={errors}
              form_data={form_data}
              max_emails={MAX_EMAILS}
              on_add_email={add_email_field}
              on_change={handle_change}
              on_email_change={handle_email_change}
              on_remove_email={remove_email_field}
            />
          )}

          {active_tab === "details" && (
            <ContactFormDetails
              form_data={form_data}
              on_change={handle_change}
            />
          )}

          {active_tab === "address" && (
            <ContactFormAddress
              form_data={form_data}
              on_address_change={handle_address_change}
            />
          )}

          {active_tab === "social" && (
            <ContactFormSocial
              form_data={form_data}
              on_social_change={handle_social_change}
            />
          )}

          {active_tab === "fields" && is_edit_mode && contact && (
            <div className="space-y-4">
              <ContactFormSection
                icon={AdjustmentsHorizontalIcon}
                label={t("common.custom_fields_label")}
              />
              <ContactCustomFields
                contact_id={contact.id}
                disabled={is_loading}
                field_values={custom_field_values}
                on_field_values_change={
                  on_custom_field_values_change || (() => {})
                }
              />
            </div>
          )}
        </div>

        <div className="px-6 py-5 flex items-center justify-center gap-3 border-t border-edge-primary">
          <Button
            className="flex-1 h-12 text-[15px]"
            disabled={is_loading}
            variant="outline"
            onClick={handle_close}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1 h-12 text-[15px]"
            disabled={is_loading}
            variant="depth"
            onClick={handle_submit}
          >
            {is_loading && <Spinner className="mr-2" size="sm" />}
            {is_edit_mode
              ? t("settings.save_changes")
              : t("common.add_contact")}
          </Button>
        </div>
      </div>
    </div>
  );
}
