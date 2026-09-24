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
const SHARED_DOMAINS = ["astermail.org", "astermail.me", "astermail.net"];
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function shared_cookie_domain(hostname: string): string | null {
  const host = hostname.toLowerCase();

  for (const domain of SHARED_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return domain;
  }

  return null;
}

function write_cookie(name: string, value: string, domain: string) {
  const expiry = value ? `Max-Age=${MAX_AGE_SECONDS}` : "Max-Age=0";

  document.cookie = `${name}=${encodeURIComponent(value)}; Domain=.${domain}; Path=/; ${expiry}; SameSite=Lax; Secure`;
}

export function write_support_theme_cookie(
  mode: string,
  color_theme: string,
  accent_color: string,
  custom_theme_seed: string,
) {
  if (typeof document === "undefined") return;
  const domain = shared_cookie_domain(window.location.hostname);

  if (!domain) return;
  const is_palette = color_theme !== "default" && color_theme !== "custom";
  const accent = color_theme === "custom" ? custom_theme_seed : accent_color;

  write_cookie("aster_theme", mode, domain);
  write_cookie("aster_color_theme", is_palette ? color_theme : "", domain);
  write_cookie(
    "aster_accent",
    !is_palette && HEX_COLOR.test(accent) ? accent.toLowerCase() : "",
    domain,
  );
}
