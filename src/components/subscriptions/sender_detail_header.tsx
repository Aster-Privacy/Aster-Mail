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

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { EmailTag } from "@/components/ui/email_tag";
import { use_i18n } from "@/lib/i18n/context";
import {
  CATEGORY_TAG_VARIANT,
  get_category_label,
} from "@/components/subscriptions/subscription_constants";

interface SenderDetailHeaderProps {
  subscription: CachedSubscription;
  on_unsubscribe?: () => Promise<"success" | "manual" | "failed" | void>;
}

export function SenderDetailHeader({
  subscription: sub,
  on_unsubscribe,
}: SenderDetailHeaderProps) {
  const { t } = use_i18n();
  const [unsub_failed, set_unsub_failed] = useState(false);

  const handle_unsubscribe = async () => {
    if (!on_unsubscribe) return;
    const result = await on_unsubscribe();

    if (result === "failed") {
      set_unsub_failed(true);
    }
  };

  const handle_open_page = () => {
    const link = sub.unsubscribe_link || sub.list_unsubscribe_header;

    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-edge-primary">
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
          <EmailTag
            label={get_category_label(sub.category, t)}
            show_icon={false}
            size="sm"
            variant={
              (CATEGORY_TAG_VARIANT[sub.category] || "neutral") as
                | "blue"
                | "purple"
                | "green"
                | "amber"
                | "neutral"
            }
          />
          {sub.has_one_click && (
            <ShieldCheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-txt-muted">
          <span className="truncate">{sub.sender_email}</span>
          <span>·</span>
          <span>
            {t("settings.emails_count", { count: String(sub.email_count) })}
          </span>
        </div>
      </div>
      {sub.status === "active" &&
        on_unsubscribe &&
        (unsub_failed &&
        (sub.unsubscribe_link || sub.list_unsubscribe_header) ? (
          <button
            className="px-3 py-1.5 rounded-[12px] text-xs font-medium transition-all duration-150 flex-shrink-0 hover:brightness-110"
            style={{
              background:
                "linear-gradient(to bottom, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
              color: "#ffffff",
            }}
            onClick={handle_open_page}
          >
            {t("settings.open_unsubscribe_page")}
          </button>
        ) : (
          <button
            className="px-3 py-1.5 rounded-[12px] text-xs font-medium transition-all duration-150 flex-shrink-0 text-white bg-gradient-to-b from-[#ef4444] via-[#dc2626] to-[#b91c1c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:from-[#f05555] hover:via-[#e23737] hover:to-[#c92d2d]"
            onClick={handle_unsubscribe}
          >
            {t("mail.unsubscribe")}
          </button>
        ))}
    </div>
  );
}
