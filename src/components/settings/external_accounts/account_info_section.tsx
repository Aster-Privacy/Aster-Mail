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
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { EnvelopeIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";

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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-txt-primary">
        <EnvelopeIcon className="w-4 h-4 text-txt-muted" />
        {t("settings.account_info")}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-email"
          >
            {t("settings.email_address")}
          </label>
          <Input
            autoComplete="email"
            className="w-full"
            id="ext-account-email"
            maxLength={254}
            placeholder="user@example.com"
            type="email"
            value={form_email}
            onChange={(e) => handle_email_change(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-display-name"
          >
            {t("settings.display_name")}
          </label>
          <Input
            autoComplete="name"
            className="w-full"
            id="ext-account-display-name"
            maxLength={200}
            placeholder={t("common.display_name_example")}
            type="text"
            value={form_display_name}
            onChange={(e) => set_form_display_name(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
