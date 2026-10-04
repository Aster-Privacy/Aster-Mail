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
import { useMemo } from "react";
import { ContactAvatarView } from "@aster/ui";

import {
  is_icon_failed,
  mark_icon_failed,
  mark_icon_ok,
} from "@/lib/icon_cache";
import { is_valid_favicon_domain } from "@/lib/favicon_url";
import { get_initials, get_active_locale } from "@/lib/initials";
import {
  use_favicon_src,
  store_favicon_if_api_url,
} from "@/hooks/use_favicon_src";
import {
  get_avatar_color,
  get_avatar_key,
  get_contrast_text,
} from "@/lib/avatar_color";
import { get_root_domain } from "@/lib/utils";
import { use_peer_profile } from "@/hooks/use_peer_profile";
import { use_preferences } from "@/contexts/preferences_context";

const ASTER_DOMAINS = new Set([
  "astermail.org",
  "aster.cx",
  "astermail.me",
  "astermail.net",
]);

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
  rounded = "rounded-full",
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

  const { preferences } = use_preferences();
  const low_network = preferences.low_network_mode;

  const peer_profile = use_peer_profile(
    is_aster && !low_network ? email : null,
  );
  const effective_avatar_url = low_network
    ? undefined
    : avatar_url ||
      (is_aster ? (peer_profile?.profile_picture ?? undefined) : undefined);

  const favicon_enabled =
    !low_network &&
    favicon_eligible &&
    preferences.show_profile_pictures !== false;
  const cached_favicon_src = use_favicon_src(domain, favicon_enabled);
  const favicon_src =
    favicon_enabled && !cached_favicon_src.startsWith("data:")
      ? cached_favicon_src
      : undefined;

  const initials = get_initials(name, email, get_active_locale());
  const avatar_bg =
    profile_color || get_avatar_color(get_avatar_key(email, name));
  const text_color = get_contrast_text(avatar_bg);

  return (
    <ContactAvatarView
      aria_label={name || email || undefined}
      avatar_url={effective_avatar_url}
      background_color={avatar_bg}
      className={className}
      favicon_initially_failed={domain ? is_icon_failed(domain) : false}
      favicon_key={domain}
      favicon_src={favicon_src}
      initials={initials}
      rounded={rounded}
      size_px={size_px}
      text_color={text_color}
      on_favicon_failed={() => mark_icon_failed(domain)}
      on_favicon_loaded={(src) => {
        mark_icon_ok(domain);
        if (!preferences.low_network_mode) {
          store_favicon_if_api_url(domain, src);
        }
      }}
    />
  );
}
