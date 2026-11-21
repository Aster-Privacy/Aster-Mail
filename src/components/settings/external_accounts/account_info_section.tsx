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
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { UserCircleIcon } from "@heroicons/react/24/outline";
import { IslandSection } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  FieldGroup,
  FormField,
} from "@/components/settings/external_accounts/form_field";

interface AccountInfoSectionProps {
  form_email: string;
  form_display_name: string;
  set_form_display_name: (value: string) => void;
  handle_email_change: (email: string) => void;
  t: TranslationFn;
}

export function AccountInfoSection({
  form_email,
  form_display_name,
  set_form_display_name,
  handle_email_change,
  t,
}: AccountInfoSectionProps) {
  return (
    <IslandSection icon={<UserCircleIcon />} title={t("settings.account_info")}>
      <FieldGroup>
        <FormField
          id="ext-account-email"
          label={t("settings.email_address")}
          span={3}
        >
          <Input
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            className="aster_input_tonal w-full"
            id="ext-account-email"
            maxLength={254}
            placeholder={t("settings.username_placeholder")}
            size="md"
            spellCheck={false}
            type="email"
            value={form_email}
            onChange={(e) => handle_email_change(e.target.value)}
          />
        </FormField>
        <FormField
          id="ext-account-display-name"
          label={t("settings.display_name")}
          span={3}
        >
          <Input
            autoComplete="name"
            className="aster_input_tonal w-full"
            id="ext-account-display-name"
            maxLength={200}
            placeholder={t("common.display_name_example")}
            size="md"
            type="text"
            value={form_display_name}
            onChange={(e) => set_form_display_name(e.target.value)}
          />
        </FormField>
      </FieldGroup>
    </IslandSection>
  );
}
