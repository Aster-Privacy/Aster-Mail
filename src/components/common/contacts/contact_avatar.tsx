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
import { useMemo, useState } from "react";

import {
  is_icon_failed,
  mark_icon_failed,
  mark_icon_ok,
} from "@/lib/icon_cache";
import { get_favicon_url, is_valid_favicon_domain } from "@/lib/favicon_url";
import { get_initials, get_active_locale } from "@/lib/initials";
import {
  use_favicon_src,
  store_favicon_if_api_url,
} from "@/hooks/use_favicon_src";
import { get_avatar_color, get_contrast_text } from "@/lib/avatar_color";
import { get_root_domain } from "@/lib/utils";
import { use_peer_profile } from "@/hooks/use_peer_profile";
import { use_preferences } from "@/contexts/preferences_context";

const ASTER_DOMAINS = new Set(["astermail.org", "aster.cx"]);

interface ContactAvatarProps {
  name?: string;
  email?: string;
  avatar_url?: string;
  profile_color?: string;
  size_px: number;
  rounded?: string;
  className?: string;
}

export function ContactAvatar({
  name,
  email,
  avatar_url,
  profile_color,
  size_px,
  rounded = "rounded-xl",
  className = "",
}: ContactAvatarProps) {
  const domain = useMemo(() => {
    if (!email) return "";
    const at = email.indexOf("@");

    if (at < 0) return "";

    return get_root_domain(email.slice(at + 1)).toLowerCase();
  }, [email]);

  const is_aster = !!domain && ASTER_DOMAINS.has(domain);
  const favicon_eligible =
    !!domain && !is_aster && is_valid_favicon_domain(domain);

  const peer_profile = use_peer_profile(is_aster ? email : null);
  const effective_avatar_url = avatar_url || (is_aster ? (peer_profile?.profile_picture ?? undefined) : undefined);

  const [avatar_failed, set_avatar_failed] = useState(false);
  const [favicon_failed, set_favicon_failed] = useState<boolean>(
    domain ? is_icon_failed(domain) : false,
  );

  const { preferences } = use_preferences();

  const cached_favicon_src = use_favicon_src(domain);

  const base_style = {
    width: size_px,
    height: size_px,
    minWidth: size_px,
    minHeight: size_px,
  } as const;

  if (effective_avatar_url && !avatar_failed) {
    return (
      <div
        className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
        style={{ ...base_style, backgroundColor: "#ffffff" }}
      >
        <img
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
          src={effective_avatar_url}
          onError={() => set_avatar_failed(true)}
        />
      </div>
    );
  }

  if (favicon_eligible && !favicon_failed) {
    const pad = Math.max(2, Math.round(size_px * 0.14));

    return (
      <div
        className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
        style={{ ...base_style, backgroundColor: "#ffffff" }}
      >
        <img
          alt=""
          className="object-contain"
          draggable={false}
          referrerPolicy="no-referrer"
          src={cached_favicon_src || get_favicon_url(domain)}
          style={{
            width: size_px - pad * 2,
            height: size_px - pad * 2,
            userSelect: "none",
          }}
          onError={() => {
            mark_icon_failed(domain);
            set_favicon_failed(true);
          }}
          onLoad={(e) => {
            const img = e.currentTarget;

            if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
              mark_icon_failed(domain);
              set_favicon_failed(true);
            } else {
              mark_icon_ok(domain);
              if (!preferences.low_network_mode) {
                store_favicon_if_api_url(domain, img.src);
              }
            }
          }}
        />
      </div>
    );
  }

  const initials = get_initials(name, email, get_active_locale());
  const font_size = Math.round(size_px * (initials.length > 1 ? 0.36 : 0.44));
  const avatar_bg = profile_color || get_avatar_color(email || name || "?");
  const text_color = get_contrast_text(avatar_bg);

  return (
    <div
      aria-label={name || email || undefined}
      className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
      role="img"
      style={{
        ...base_style,
        backgroundColor: avatar_bg,
      }}
    >
      <span
        aria-hidden="true"
        className="font-semibold tracking-wide select-none"
        style={{ fontSize: font_size, lineHeight: 1, color: text_color }}
      >
        {initials}
      </span>
    </div>
  );
}
