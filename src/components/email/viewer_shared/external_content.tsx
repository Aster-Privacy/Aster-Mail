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
import type { } from "@/types/thread";
import type { } from "@/services/api/mail";
import type { } from "@/services/api/multi_drafts";
import type { } from "@/lib/html_sanitizer";
import type { } from "@/components/email/use_email_viewer";
import type { } from "@/components/email/hooks/preload_cache";


import { } from "@/contexts/external_link_context";
import { } from "@/lib/i18n/context";
import { } from "@/contexts/preferences_context";
import { } from "@/components/common/icons";
import { } from "@/components/ui/profile_avatar";
import { } from "@/components/ui/badge_chip";
import { } from "@/hooks/use_peer_profile";
import { } from "@/components/common/encryption_info_dropdown";
import { } from "@/components/email/tracking_protection_shield";
import { } from "@/lib/utils";

import { } from "@/components/email/official_badge";
import { } from "@/components/email/email_profile_trigger";
import { } from "@/components/ui/snooze_badge";
import { } from "@/components/modals/view_source_modal";
import { } from "@/components/email/expiration_countdown";
import { } from "@/components/email/sending_message_block";
import { } from "@/components/email/thread_draft_badge";
import { } from "@/components/email/banners/purchase_details_banner";
import { } from "@/components/email/banners/shipping_details_banner";
import { } from "@/components/email/banners/calendar_invite_banner";
import { } from "@/services/extraction/extractor";


export let loaded_content_email_id: string | null = null;

export function get_external_content_mode(
  email_id: string,
): "loaded" | undefined {
  return loaded_content_email_id === email_id ? "loaded" : undefined;
}

export function set_external_content_mode(email_id: string): void {
  loaded_content_email_id = email_id;
}

