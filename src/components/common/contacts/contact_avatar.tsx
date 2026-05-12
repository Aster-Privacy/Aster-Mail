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
import { get_gradient_background } from "@/constants/profile";
import { get_root_domain } from "@/lib/utils";

const ASTER_DOMAINS = new Set(["astermail.org", "aster.cx"]);
const ASTER_INDIGO = "#6366f1";

interface ContactAvatarProps {
  name?: string;
  email?: string;
  avatar_url?: string;
  profile_color?: string;
  size_px: number;
  rounded?: string;
  className?: string;
}

function extract_initials(name: string, email: string): string {
  const trimmed = (name || "").trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return (email || "?").charAt(0).toUpperCase();
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

  const [avatar_failed, set_avatar_failed] = useState(false);
  const [favicon_failed, set_favicon_failed] = useState<boolean>(
    domain ? is_icon_failed(domain) : false,
  );

  const base_style = {
    width: size_px,
    height: size_px,
    minWidth: size_px,
    minHeight: size_px,
  } as const;

  if (avatar_url && !avatar_failed) {
    return (
      <div
        className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
        style={{ ...base_style, backgroundColor: "#ffffff" }}
      >
        <img
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
          src={avatar_url}
          onError={() => set_avatar_failed(true)}
        />
      </div>
    );
  }

  if (is_aster) {
    const logo_size = Math.round(size_px * 0.55);

    return (
      <div
        className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
        style={{
          ...base_style,
          background: get_gradient_background(ASTER_INDIGO),
        }}
      >
        <img
          alt=""
          draggable={false}
          src="/aster.webp"
          style={{
            width: logo_size,
            height: logo_size,
            filter: "brightness(0) invert(1)",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
          }}
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
          src={get_favicon_url(domain)}
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
            }
          }}
        />
      </div>
    );
  }

  const initials = extract_initials(name || "", email || "");
  const font_size = Math.round(
    size_px * (initials.length > 1 ? 0.36 : 0.44),
  );

  return (
    <div
      className={`${rounded} overflow-hidden flex items-center justify-center ${className}`}
      style={{
        ...base_style,
        backgroundColor: profile_color || "#3358d4",
      }}
    >
      <span
        className="text-white font-semibold tracking-wide select-none"
        style={{ fontSize: font_size, lineHeight: 1 }}
      >
        {initials}
      </span>
    </div>
  );
}
