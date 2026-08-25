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
import type { TranslationKey } from "@/lib/i18n/types";

import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";

import { type ImportSource } from "@/services/api/email_import";

export type OAuthProvider = "google" | "microsoft" | "yahoo";

export const OAUTH_PROVIDERS: Set<string> = new Set(["gmail", "outlook"]);

export const PROVIDER_TO_OAUTH: Record<string, OAuthProvider> = {
  gmail: "google",
  outlook: "microsoft",
};

export interface ProviderRow {
  id: ImportSource;
  icon: React.ReactNode;
  label_key: TranslationKey;
}

export const PROVIDERS: ProviderRow[] = [
  {
    id: "gmail",
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-6 h-6 object-contain"
        src="/providers/gmail_logo.svg"
      />
    ),
    label_key: "settings.gmail_import",
  },
  {
    id: "outlook",
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-6 h-6 object-contain"
        src="/providers/outlook_logo.svg"
      />
    ),
    label_key: "settings.outlook_import",
  },
  {
    id: "yahoo",
    icon: (
      <img
        alt=""
        aria-hidden="true"
        className="w-6 h-6 object-contain"
        src="/providers/yahoo_mail_logo.svg"
      />
    ),
    label_key: "settings.yahoo_import",
  },
  {
    id: "mbox",
    icon: <DocumentArrowUpIcon className="w-6 h-6 text-txt-secondary" />,
    label_key: "settings.manual_import",
  },
];
