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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { } from "@/services/api/mail";
import type { } from "@/services/api/multi_drafts";
import type { } from "@/lib/html_sanitizer";
import type { } from "@/components/email/use_email_viewer";
import type { } from "@/components/email/hooks/preload_cache";

import React, {    } from "react";
import {
  
  NoSymbolIcon,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
} from "@heroicons/react/24/outline";

import { } from "@/contexts/external_link_context";
import { use_i18n } from "@/lib/i18n/context";
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
import { ViewSourceModal } from "@/components/modals/view_source_modal";
import { } from "@/components/email/expiration_countdown";
import { } from "@/components/email/sending_message_block";
import { } from "@/components/email/thread_draft_badge";
import { } from "@/components/email/banners/purchase_details_banner";
import { } from "@/components/email/banners/shipping_details_banner";
import { } from "@/components/email/banners/calendar_invite_banner";
import { } from "@/services/extraction/extractor";

export interface ViewerViewSourceProps {
  view_source_message: DecryptedThreadMessage | null;
  on_close: () => void;
}

export function ViewerViewSource({
  view_source_message,
  on_close,
}: ViewerViewSourceProps): React.ReactElement {
  return (
    <ViewSourceModal
      html_body={view_source_message?.body ?? ""}
      is_open={!!view_source_message}
      message_id={view_source_message?.id ?? ""}
      on_close={on_close}
    />
  );
}

export interface ViewerErrorStateProps {
  error: string | null;
  on_dismiss: () => void;
  show_back_button?: boolean;
}

export function ViewerErrorState({
  error,
  on_dismiss,
  show_back_button = false,
}: ViewerErrorStateProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <NoSymbolIcon className="w-12 h-12 mx-auto mb-3 text-txt-muted" />
        <p className="text-sm text-txt-muted">
          {error || t("common.failed_to_load_email")}
        </p>
        {show_back_button && (
          <button
            className="mt-4 px-4 py-2 text-sm font-medium rounded-[14px] transition-colors bg-surf-secondary text-txt-primary"
            onClick={on_dismiss}
          >
            {t("common.back_to_inbox")}
          </button>
        )}
      </div>
    </div>
  );
}
