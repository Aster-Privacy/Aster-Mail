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
import type { } from "@/lib/i18n/types";

import {
  
  
  
  
  
  
  
  LinkIcon,
  
  
} from "@heroicons/react/24/outline";

import { } from "../import_modal";

import { } from "@/components/ui/spinner";
import { } from "@/lib/i18n/context";
import { } from "@/components/toast/simple_toast";
import { } from "@/services/sync_manager";
import { } from "@/services/api/folders";
import { } from "@/services/crypto/memory_key_store";
import { } from "@/services/labels/ensure_defaults";


export function get_provider_icon(protocol: string, email: string, oauth_provider?: string | null) {
  if (protocol === "oauth_imap") {
    const p = oauth_provider ?? "";
    if (p === "google") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/gmail_logo.svg" />
      );
    }
    if (p === "microsoft") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/outlook_logo.svg" />
      );
    }
    if (p === "yahoo") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/yahoo_mail_logo.svg" />
      );
    }
    // Fallback: infer from email domain for legacy rows
    const lower = email.toLowerCase();
    if (lower.includes("gmail") || lower.includes("google")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/gmail_logo.svg" />;
    }
    if (lower.includes("outlook") || lower.includes("hotmail") || lower.includes("live")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/outlook_logo.svg" />;
    }
    if (lower.includes("yahoo")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/yahoo_mail_logo.svg" />;
    }
  }

  return <LinkIcon className="w-5 h-5 text-txt-muted" />;
}

