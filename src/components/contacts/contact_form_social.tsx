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

import { GlobeAltIcon } from "@heroicons/react/24/outline";

import { ContactFormSection } from "./contact_form_section";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";

interface ContactFormSocialProps {
  form_data: ContactFormData;
  on_social_change: (field: string, value: string) => void;
}

export function ContactFormSocial({
  form_data,
  on_social_change,
}: ContactFormSocialProps) {
  const { t } = use_i18n();

  return (
    <div className="space-y-4">
      <ContactFormSection
        icon={GlobeAltIcon}
        label={t("common.social_links")}
      />
      <div>
        <label
          className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
          htmlFor="contact-website"
        >
          {t("common.website")}
        </label>
        <Input
          id="contact-website"
          placeholder={t("common.website_placeholder")}
          size="md"
          value={form_data.social_links?.website || ""}
          onChange={(e) => on_social_change("website", e.target.value)}
        />
      </div>
      <div>
        <label
          className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
          htmlFor="contact-linkedin"
        >
          {t("common.linkedin")}
        </label>
        <Input
          id="contact-linkedin"
          placeholder="linkedin.com/in/username"
          size="md"
          value={form_data.social_links?.linkedin || ""}
          onChange={(e) => on_social_change("linkedin", e.target.value)}
        />
      </div>
      <div>
        <label
          className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
          htmlFor="contact-twitter"
        >
          {t("common.twitter_x")}
        </label>
        <Input
          id="contact-twitter"
          placeholder="@username"
          size="md"
          value={form_data.social_links?.twitter || ""}
          onChange={(e) => on_social_change("twitter", e.target.value)}
        />
      </div>
      <div>
        <label
          className="block text-[11px] font-medium mb-1.5 text-txt-secondary"
          htmlFor="contact-github"
        >
          {t("common.github")}
        </label>
        <Input
          id="contact-github"
          placeholder="github.com/username"
          size="md"
          value={form_data.social_links?.github || ""}
          onChange={(e) => on_social_change("github", e.target.value)}
        />
      </div>
    </div>
  );
}
