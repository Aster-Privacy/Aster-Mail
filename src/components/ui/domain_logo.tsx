import { useState, useCallback, useMemo, useEffect } from "react";

import { get_logo_url } from "@/lib/logo_service";

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

  return match ? match[1].toLowerCase() : "";
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

const failed_domains = new Set<string>();

export function DomainLogo({
  domain,
  email,
  size = "md",
  fallback_name,
  className = "",
}: DomainLogoProps) {
  const [has_error, set_has_error] = useState(false);

  const resolved_domain = useMemo(() => {
    if (domain) return domain.toLowerCase();
    if (email) return extract_domain(email);

    return "";
  }, [domain, email]);

  const pixel_size = SIZE_MAP[size];
  const font_size = FONT_SIZE_MAP[size];

  useEffect(() => {
    set_has_error(failed_domains.has(resolved_domain));
  }, [resolved_domain]);

  const logo_url = useMemo(() => {
    if (!resolved_domain || has_error) return null;
    if (failed_domains.has(resolved_domain)) return null;

    return get_logo_url(resolved_domain);
  }, [resolved_domain, has_error]);

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

  const handle_error = useCallback(() => {
    set_has_error(true);
    if (resolved_domain) {
      failed_domains.add(resolved_domain);
    }
  }, [resolved_domain]);

  const src = logo_url && !has_error ? logo_url : fallback_svg;

  return (
    <img
      alt={resolved_domain || "domain logo"}
      className={`rounded-sm flex-shrink-0 object-contain ${className}`}
      draggable={false}
      height={pixel_size}
      src={src}
      style={{ userSelect: "none" }}
      width={pixel_size}
      onError={logo_url && !has_error ? handle_error : undefined}
    />
  );
}

export function clear_domain_logo_cache(domain?: string) {
  if (domain) {
    failed_domains.delete(domain.toLowerCase());
  } else {
    failed_domains.clear();
  }
}
