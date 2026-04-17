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

import {
  PhoneIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  CalendarIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

import { ContactFormSection } from "./contact_form_section";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function get_relationships(t: (key: TranslationKey) => string) {
  return [
    { value: "work", label: t("common.work") },
    { value: "personal", label: t("common.personal") },
    { value: "family", label: t("common.family") },
    { value: "other", label: t("common.other") },
  ] as const;
}

interface ContactFormDetailsProps {
  form_data: ContactFormData;
  on_change: (field: keyof ContactFormData, value: unknown) => void;
}

export function ContactFormDetails({
  form_data,
  on_change,
}: ContactFormDetailsProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-4">
      <ContactFormSection icon={PhoneIcon} label={t("common.phone")} />
      <Input
        placeholder={t("common.phone_placeholder")}
        size="md"
        type="tel"
        value={form_data.phone}
        onChange={(e) => on_change("phone", e.target.value)}
      />

      <ContactFormSection
        class_name="mt-6"
        icon={BuildingOffice2Icon}
        label={t("common.work")}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-company"
          >
            {t("common.company")}
          </label>
          <Input
            id="contact-company"
            placeholder={t("common.company_placeholder")}
            size="md"
            value={form_data.company}
            onChange={(e) => on_change("company", e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-job-title"
          >
            {t("common.job_title")}
          </label>
          <Input
            id="contact-job-title"
            placeholder={t("common.job_title_placeholder")}
            size="md"
            value={form_data.job_title}
            onChange={(e) => on_change("job_title", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <ContactFormSection
            class_name="mb-3"
            icon={CalendarIcon}
            label={t("common.birthday")}
          />
          <Input
            size="md"
            type="date"
            value={form_data.birthday}
            onChange={(e) => on_change("birthday", e.target.value)}
          />
        </div>
        <div>
          <ContactFormSection
            class_name="mb-3"
            icon={BriefcaseIcon}
            label={t("common.relationship")}
          />
          <Select
            value={form_data.relationship}
            onValueChange={(value) => on_change("relationship", value)}
          >
            <SelectTrigger className="h-9 text-[13px] dark:bg-[#121212] dark:hover:bg-[#121212] dark:data-[state=open]:bg-[#121212]">
              <SelectValue placeholder={t("common.select_placeholder")} />
            </SelectTrigger>
            <SelectContent className="dark:bg-[#121212]">
              {get_relationships(t).map((rel) => (
                <SelectItem key={rel.value} value={rel.value}>
                  {rel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ContactFormSection
        class_name="mt-6"
        icon={DocumentTextIcon}
        label={t("common.notes")}
      />
      <textarea
        className="aster_input aster_input_md resize-none py-2.5"
        placeholder={t("common.notes_placeholder")}
        rows={3}
        value={form_data.notes}
        onChange={(e) => on_change("notes", e.target.value)}
      />
    </div>
  );
}
