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
import { useState, useCallback, useMemo, useEffect, memo } from "react";

import {
  is_icon_failed,
  mark_icon_failed,
  mark_icon_ok,
} from "@/lib/icon_cache";
import { get_favicon_url } from "@/lib/favicon_url";
import { get_root_domain } from "@/lib/utils";

interface DomainLogoProps {
  domain?: string;
  email?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fallback_name?: string;
  className?: string;
}

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 96,
};

const FONT_SIZE_MAP = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 18,
  xl: 36,
};

const DEFAULT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#14b8a6",
  "#6b7280",
];

function hash_string(str: string): number {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash);
}

function get_color_from_domain(domain: string): string {
  return DEFAULT_COLORS[hash_string(domain) % DEFAULT_COLORS.length];
}

function get_domain_initials(domain: string): string {
  if (!domain) return "?";
  const parts = domain.split(".");

  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase();
  }

  return domain.charAt(0).toUpperCase();
}

function extract_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);

  if (!match) return "";

  return get_root_domain(match[1]);
}

function generate_fallback_svg(
  domain: string,
  color: string,
  size: number,
  font_size: number,
): string {
  const initials = get_domain_initials(domain);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${color}" rx="${size / 2}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="white" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${font_size}" font-weight="600">${initials}</text>
  </svg>`;
}

const icon_check_cache = new Map<string, boolean>();
const in_flight_checks = new Map<string, Promise<boolean>>();

async function check_icon_exists(domain: string): Promise<boolean> {
  const cached = icon_check_cache.get(domain);

  if (cached !== undefined) return cached;

  const { connection_store } = await import(
    "@/services/routing/connection_store"
  );
  const method = connection_store.get_method();

  if (method === "tor" || method === "tor_snowflake") {
    icon_check_cache.set(domain, false);
    return false;
  }

  const existing = in_flight_checks.get(domain);

  if (existing) return existing;

  const url = get_favicon_url(domain);

  const promise = fetch(url, { method: "HEAD" })
    .then((res) => {
      const ok = res.ok;

      icon_check_cache.set(domain, ok);
      in_flight_checks.delete(domain);

      return ok;
    })
    .catch(() => {
      icon_check_cache.set(domain, false);
      in_flight_checks.delete(domain);

      return false;
    });

  in_flight_checks.set(domain, promise);

  return promise;
}

export const DomainLogo = memo(function DomainLogo({
  domain,
  email,
  size = "md",
  fallback_name,
  className = "",
}: DomainLogoProps) {
  const [show_ddg, set_show_ddg] = useState<boolean | null>(null);
  const [prev_domain, set_prev_domain] = useState(domain);
  const [prev_email, set_prev_email] = useState(email);

  const resolved_domain = useMemo(() => {
    if (domain) return get_root_domain(domain);
    if (email) return extract_domain(email);

    return "";
  }, [domain, email]);

  const pixel_size = SIZE_MAP[size];
  const font_size = FONT_SIZE_MAP[size];

  if (domain !== prev_domain || email !== prev_email) {
    set_prev_domain(domain);
    set_prev_email(email);
    if (resolved_domain && is_icon_failed(resolved_domain)) {
      set_show_ddg(false);
    } else if (resolved_domain && icon_check_cache.has(resolved_domain)) {
      set_show_ddg(icon_check_cache.get(resolved_domain)!);
    } else {
      set_show_ddg(null);
    }
  }

  useEffect(() => {
    if (!resolved_domain) {
      set_show_ddg(false);

      return;
    }

    if (is_icon_failed(resolved_domain)) {
      set_show_ddg(false);

      return;
    }

    const cached = icon_check_cache.get(resolved_domain);

    if (cached !== undefined) {
      set_show_ddg(cached);
      if (cached) mark_icon_ok(resolved_domain);
      else mark_icon_failed(resolved_domain);

      return;
    }

    let cancelled = false;

    check_icon_exists(resolved_domain).then((exists) => {
      if (cancelled) return;
      set_show_ddg(exists);
      if (exists) mark_icon_ok(resolved_domain);
      else mark_icon_failed(resolved_domain);
    });

    return () => {
      cancelled = true;
    };
  }, [resolved_domain]);

  const ddg_logo_url = show_ddg ? get_favicon_url(resolved_domain) : null;

  const fallback_svg = useMemo(() => {
    const display_name = fallback_name || resolved_domain;
    const color = get_color_from_domain(display_name);
    const svg = generate_fallback_svg(
      display_name,
      color,
      pixel_size,
      font_size,
    );

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [fallback_name, resolved_domain, pixel_size, font_size]);

  const handle_ddg_error = useCallback(() => {
    if (resolved_domain) mark_icon_failed(resolved_domain);
    set_show_ddg(false);
  }, [resolved_domain]);

  const src = ddg_logo_url || fallback_svg;

  const on_error = ddg_logo_url ? handle_ddg_error : undefined;

  return (
    <img
      alt={resolved_domain || "domain logo"}
      className={`rounded-sm flex-shrink-0 object-cover ${className}`}
      decoding="async"
      draggable={false}
      height={pixel_size}
      src={src}
      style={{ userSelect: "none" }}
      width={pixel_size}
      onError={on_error}
    />
  );
});
