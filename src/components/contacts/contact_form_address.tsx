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

import { MapPinIcon } from "@heroicons/react/24/outline";

import { ContactFormSection } from "./contact_form_section";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";

interface ContactFormAddressProps {
  form_data: ContactFormData;
  on_address_change: (field: string, value: string) => void;
}

export function ContactFormAddress({
  form_data,
  on_address_change,
}: ContactFormAddressProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-4">
      <ContactFormSection icon={MapPinIcon} label={t("common.address")} />
      <div>
        <label
          className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
          htmlFor="contact-street"
        >
          {t("common.street")}
        </label>
        <Input
          id="contact-street"
          placeholder={t("common.address_placeholder")}
          size="md"
          value={form_data.address?.street || ""}
          onChange={(e) => on_address_change("street", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-city"
          >
            {t("common.city")}
          </label>
          <Input
            id="contact-city"
            placeholder={t("common.city_placeholder")}
            size="md"
            value={form_data.address?.city || ""}
            onChange={(e) => on_address_change("city", e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-state"
          >
            {t("settings.state_province")}
          </label>
          <Input
            id="contact-state"
            placeholder={t("common.state_placeholder")}
            size="md"
            value={form_data.address?.state || ""}
            onChange={(e) => on_address_change("state", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-postal-code"
          >
            {t("common.postal_code")}
          </label>
          <Input
            id="contact-postal-code"
            placeholder={t("common.postal_code_placeholder")}
            size="md"
            value={form_data.address?.postal_code || ""}
            onChange={(e) => on_address_change("postal_code", e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
            htmlFor="contact-country"
          >
            {t("common.country")}
          </label>
          <Input
            id="contact-country"
            placeholder={t("common.country_placeholder")}
            size="md"
            value={form_data.address?.country || ""}
            onChange={(e) => on_address_change("country", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
