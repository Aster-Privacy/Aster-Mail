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
import type { CachedSubscription } from "@/services/subscription_cache";

import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { Badge, PillButton } from "@aster/ui";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_i18n } from "@/lib/i18n/context";
import { use_external_link } from "@/contexts/external_link_context";
import {
  get_category_badge_color,
  get_category_label,
} from "@/components/subscriptions/subscription_constants";

interface SenderDetailHeaderProps {
  subscription: CachedSubscription;
  on_unsubscribe?: () => Promise<
    "success" | "manual" | "failed" | "cancelled" | void
  >;
}

export function SenderDetailHeader({
  subscription: sub,
  on_unsubscribe,
}: SenderDetailHeaderProps) {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [failed_email, set_failed_email] = useState<string | null>(null);
  const [is_unsubscribing, set_is_unsubscribing] = useState(false);

  const unsub_failed = failed_email === sub.sender_email;

  const handle_unsubscribe = async () => {
    if (!on_unsubscribe || is_unsubscribing) return;

    set_is_unsubscribing(true);

    const result = await on_unsubscribe();

    set_is_unsubscribing(false);

    if (result === "failed") {
      set_failed_email(sub.sender_email);
    }
  };

  const handle_open_page = () => {
    const link = sub.unsubscribe_link || sub.list_unsubscribe_header;

    if (link) {
      handle_external_link(link);
    }
  };

  return (
    <div className="flex-shrink-0 px-4 pb-2 pt-3">
      <div className="aster_island aster_island_pad_sm flex items-center gap-3">
        <ProfileAvatar
          use_domain_logo
          email={sub.sender_email}
          name={sub.sender_name || sub.sender_email}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-txt-primary truncate">
              {sub.sender_name || sub.sender_email}
            </span>
            <Badge
              className="flex-shrink-0 whitespace-nowrap"
              color={get_category_badge_color(sub.category)}
            >
              {get_category_label(sub.category, t)}
            </Badge>
            {sub.has_one_click && (
              <ShieldCheckIcon className="w-4 h-4 text-[var(--color-success)] flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-txt-muted">
            <span className="truncate">{sub.sender_email}</span>
            <span>·</span>
            <span>
              {sub.email_count === 1
                ? t("common.one_email")
                : t("settings.emails_count", {
                    count: sub.email_count,
                  })}
            </span>
          </div>
        </div>
        {sub.status === "active" &&
          on_unsubscribe &&
          (unsub_failed &&
          (sub.unsubscribe_link || sub.list_unsubscribe_header) ? (
            <PillButton
              className="flex-shrink-0"
              size="sm"
              variant="tonal"
              onClick={handle_open_page}
            >
              {t("settings.open_unsubscribe_page")}
            </PillButton>
          ) : (
            <PillButton
              className="flex-shrink-0"
              disabled={is_unsubscribing}
              size="sm"
              variant="danger"
              onClick={handle_unsubscribe}
            >
              {t("mail.unsubscribe")}
            </PillButton>
          ))}
      </div>
    </div>
  );
}
