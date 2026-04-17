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

import {
  UserIcon,
  EnvelopeIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { ContactFormSection } from "./contact_form_section";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";

interface ContactFormBasicProps {
  form_data: ContactFormData;
  errors: Record<string, string>;
  max_emails: number;
  on_change: (field: keyof ContactFormData, value: unknown) => void;
  on_email_change: (index: number, value: string) => void;
  on_add_email: () => void;
  on_remove_email: (index: number) => void;
}

export function ContactFormBasic({
  form_data,
  errors,
  max_emails,
  on_change,
  on_email_change,
  on_add_email,
  on_remove_email,
}: ContactFormBasicProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-4">
      <ContactFormSection icon={UserIcon} label={t("common.name")} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-first-name"
          >
            {t("common.first_name")}
          </label>
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            id="contact-first-name"
            placeholder={t("common.first_name_placeholder")}
            size="md"
            status={errors.first_name ? "error" : "default"}
            value={form_data.first_name}
            onChange={(e) => on_change("first_name", e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-last-name"
          >
            {t("common.last_name")}
          </label>
          <Input
            id="contact-last-name"
            placeholder={t("common.last_name_placeholder")}
            size="md"
            value={form_data.last_name}
            onChange={(e) => on_change("last_name", e.target.value)}
          />
        </div>
      </div>
      {errors.first_name && (
        <p className="text-[11px] text-red-500">{errors.first_name}</p>
      )}

      <ContactFormSection
        class_name="mt-6"
        icon={EnvelopeIcon}
        label={t("common.email")}
      />
      <div className="space-y-2">
        {form_data.emails.map((email, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder={t("common.email_placeholder")}
              size="md"
              status={errors.emails ? "error" : "default"}
              type="email"
              value={email}
              onChange={(e) => on_email_change(index, e.target.value)}
            />
            {form_data.emails.length > 1 && (
              <button
                className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                type="button"
                onClick={() => on_remove_email(index)}
              >
                <XMarkIcon className="h-4 w-4 text-txt-muted" />
              </button>
            )}
          </div>
        ))}
      </div>
      {errors.emails && (
        <p className="text-[11px] text-red-500">{errors.emails}</p>
      )}
      {form_data.emails.length < max_emails && (
        <button
          className="flex items-center gap-1.5 text-[12px] font-medium py-1 transition-colors hover:opacity-70 text-txt-muted"
          type="button"
          onClick={on_add_email}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("common.add_another_email_count", {
            current: form_data.emails.length,
            max: max_emails,
          })}
        </button>
      )}
    </div>
  );
}
