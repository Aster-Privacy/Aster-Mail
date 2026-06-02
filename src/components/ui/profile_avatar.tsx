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
import { useMemo, useState, useCallback, memo, lazy, Suspense } from "react";

import {
  is_icon_failed,
  mark_icon_failed,
  mark_icon_ok,
} from "@/lib/icon_cache";
import { get_favicon_url } from "@/lib/favicon_url";
import { get_initials, get_active_locale } from "@/lib/initials";
import { get_avatar_color, get_contrast_text } from "@/lib/avatar_color";
import { get_root_domain } from "@/lib/utils";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_my_badge_prefs } from "@/stores/my_badge_prefs_store";
import { use_peer_profile } from "@/hooks/use_peer_profile";

import { AvatarRing } from "./avatar_ring";

const SenderProfileTrigger = lazy(() =>
  import("@/components/profile/sender_profile_trigger").then((mod) => ({
    default: mod.SenderProfileTrigger,
  })),
);

interface ProfileAvatarProps {
  name: string;
  email?: string;
  image_url?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  use_domain_logo?: boolean;
  clickable?: boolean;
  on_compose?: (email: string) => void;
  profile_color?: string;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 96,
};

const ASTER_SYSTEM_EMAILS = new Set([
  "noreply@astermail.org",
  "no-reply@astermail.org",
  "noreply@aster.cx",
  "no-reply@aster.cx",
  "system@astermail.org",
  "system@aster.cx",
  "updates@astermail.org",
  "updates@aster.cx",
]);

const SYSTEM_LOCAL_PARTS = new Set(["mailer-daemon", "postmaster"]);

const ASTER_DOMAINS = new Set(["astermail.org", "aster.cx"]);

function extract_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);

  if (!match) return "";

  return get_root_domain(match[1]);
}

export const ProfileAvatar = memo(function ProfileAvatar({
  name,
  email,
  image_url,
  size = "md",
  className = "",
  use_domain_logo = false,
  clickable = false,
  on_compose,
  profile_color,
}: ProfileAvatarProps) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const low_network = preferences.low_network_mode;
  const is_current_user =
    !!email &&
    !!user?.email &&
    email.trim().toLowerCase() === user.email.trim().toLowerCase();
  const peer_profile = use_peer_profile(is_current_user ? null : email);
  const resolved_image_url = low_network
    ? undefined
    : image_url ||
      (is_current_user ? user?.profile_picture : peer_profile?.profile_picture ?? undefined);
  const my_badge_prefs = use_my_badge_prefs();
  const show_self_ring =
    is_current_user &&
    !!my_badge_prefs?.show_badge_ring &&
    !!my_badge_prefs?.active_badge_slug;
  const peer_ring_slug =
    !is_current_user &&
    peer_profile?.show_badge_ring &&
    peer_profile?.active_badge
      ? peer_profile.active_badge.slug
      : null;
  const ring_slug = is_current_user
    ? show_self_ring
      ? my_badge_prefs?.active_badge_slug ?? null
      : null
    : peer_ring_slug;
  const ring_thickness = 2;
  const wrap_ring = (node: React.ReactElement): React.ReactElement =>
    ring_slug ? (
      <AvatarRing
        badge_slug={ring_slug}
        enabled
        size={pixel_size + ring_thickness * 2}
        thickness={ring_thickness}
      >
        {node}
      </AvatarRing>
    ) : (
      node
    );

  const [image_error, set_image_error] = useState(false);
  const [ddg_logo_error, set_ddg_logo_error] = useState(false);
  const [img_loaded, set_img_loaded] = useState(false);
  const [prev_email, set_prev_email] = useState(email);
  const [prev_image_url, set_prev_image_url] = useState(resolved_image_url);
  const pixel_size = SIZE_MAP[size];
  const domain = useMemo(() => (email ? extract_domain(email) : ""), [email]);
  const normalized_email = (email || "").trim().toLowerCase();
  const is_aster_mail =
    ASTER_SYSTEM_EMAILS.has(normalized_email) ||
    SYSTEM_LOCAL_PARTS.has(normalized_email.split("@")[0]);

  if (email !== prev_email || resolved_image_url !== prev_image_url) {
    set_prev_email(email);
    set_prev_image_url(resolved_image_url);
    set_image_error(false);
    set_img_loaded(false);
    set_ddg_logo_error(domain ? is_icon_failed(domain) : false);
  }

  const is_aster_domain = ASTER_DOMAINS.has(domain);

  const ddg_logo_url = useMemo(() => {
    if (
      low_network ||
      !use_domain_logo ||
      !domain ||
      is_aster_mail ||
      is_aster_domain ||
      ddg_logo_error ||
      is_icon_failed(domain)
    )
      return null;

    return get_favicon_url(domain);
  }, [low_network, use_domain_logo, domain, is_aster_mail, is_aster_domain, ddg_logo_error]);

  const handle_ddg_logo_error = useCallback(() => {
    if (domain) mark_icon_failed(domain);
    set_ddg_logo_error(true);
  }, [domain]);

  const handle_image_error = useCallback(() => {
    set_image_error(true);
  }, []);

  const actual_src = useMemo(() => {
    if (low_network) return null;
    if (resolved_image_url && !image_error) return resolved_image_url;
    if (is_aster_mail) return "/mail_logo.webp";
    if (ddg_logo_url && !ddg_logo_error) return ddg_logo_url;

    return null;
  }, [
    low_network,
    is_aster_mail,
    resolved_image_url,
    ddg_logo_url,
    image_error,
    ddg_logo_error,
  ]);

  const error_handler = useMemo(() => {
    if (is_aster_mail) return undefined;
    if (resolved_image_url && !image_error) return handle_image_error;
    if (ddg_logo_url && !ddg_logo_error) return handle_ddg_logo_error;

    return undefined;
  }, [
    is_aster_mail,
    resolved_image_url,
    ddg_logo_url,
    image_error,
    ddg_logo_error,
    handle_image_error,
    handle_ddg_logo_error,
  ]);

  const is_favicon_source =
    (actual_src?.includes("/api/images/v1/favicon/") ||
      actual_src?.includes("/proxy?url=")) ??
    false;

  const profile_hex =
    profile_color ||
    (is_current_user ? user?.profile_color : peer_profile?.profile_color) ||
    undefined;

  const handle_load = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;

      if (is_favicon_source) {
        if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
          if (domain) mark_icon_failed(domain);
          set_ddg_logo_error(true);

          return;
        }
        if (domain) mark_icon_ok(domain);
      }
      set_img_loaded(true);
    },
    [is_favicon_source, domain],
  );

  if (!actual_src) {
    const initials = get_initials(name, email, get_active_locale());
    const font_size = Math.round(
      pixel_size * (initials.length > 1 ? 0.36 : 0.44),
    );
    const avatar_bg = profile_hex || get_avatar_color(email || name || "?");
    const text_color = get_contrast_text(avatar_bg);

    const letter_element = (
      <div
        aria-label={name || email || undefined}
        className={`rounded-full flex-shrink-0 flex items-center justify-center ${className}`}
        role="img"
        style={{
          width: pixel_size,
          height: pixel_size,
          minWidth: pixel_size,
          minHeight: pixel_size,
          backgroundColor: avatar_bg,
          userSelect: "none",
        }}
      >
        <svg
          aria-hidden="true"
          height={pixel_size}
          style={{ display: "block", pointerEvents: "none" }}
          viewBox={`0 0 ${pixel_size} ${pixel_size}`}
          width={pixel_size}
        >
          <text
            dominantBaseline="middle"
            fill={text_color}
            fontSize={font_size}
            fontWeight={600}
            style={{
              fontFamily: "inherit",
              letterSpacing: initials.length > 1 ? "-0.02em" : undefined,
            }}
            textAnchor="middle"
            x="50%"
            y="50%"
          >
            {initials}
          </text>
        </svg>
      </div>
    );

    if (clickable && email) {
      return wrap_ring(
        <Suspense fallback={letter_element}>
          <SenderProfileTrigger
            className="rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
            email={email}
            name={name}
            on_compose={on_compose}
          >
            {letter_element}
          </SenderProfileTrigger>
        </Suspense>,
      );
    }

    return wrap_ring(letter_element);
  }

  const img_element = (
    <div
      className={`rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden relative ${className}`}
      style={{
        width: pixel_size,
        height: pixel_size,
        minWidth: pixel_size,
        minHeight: pixel_size,
        backgroundColor: "var(--avatar-bg)",
        userSelect: "none",
      }}
    >
      {!img_loaded && (
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--border-primary)" }}
        />
      )}
      <img
        alt={name}
        className={`w-full h-full object-cover ${is_favicon_source ? "rounded-full" : ""}`}
        crossOrigin={is_favicon_source ? undefined : "anonymous"}
        decoding="async"
        draggable={false}
        fetchPriority="low"
        referrerPolicy="no-referrer"
        src={actual_src}
        style={
          img_loaded
            ? is_favicon_source
              ? { backgroundColor: "#ffffff" }
              : undefined
            : {
                position: "absolute",
                opacity: 0,
                ...(is_favicon_source && { backgroundColor: "#ffffff" }),
              }
        }
        onError={error_handler}
        onLoad={handle_load}
      />
    </div>
  );

  if (clickable && email) {
    return wrap_ring(
      <Suspense fallback={img_element}>
        <SenderProfileTrigger
          className="rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
          email={email}
          name={name}
          on_compose={on_compose}
        >
          {img_element}
        </SenderProfileTrigger>
      </Suspense>,
    );
  }

  return wrap_ring(img_element);
});
