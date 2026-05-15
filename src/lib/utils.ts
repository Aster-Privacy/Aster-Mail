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
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function safe_json_parse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function safe_json_parse_with_validator<T>(
  json: string,
  validator: (data: unknown) => data is T,
  fallback: T,
): T {
  try {
    const parsed: unknown = JSON.parse(json);

    if (validator(parsed)) {
      return parsed;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function format_bytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function is_astermail_sender(
  sender_name?: string | null,
  sender_email?: string | null,
): boolean {
  return (
    sender_name === "Aster Mail" ||
    sender_email?.endsWith("@astermail.org") === true ||
    sender_email?.endsWith("@aster.cx") === true
  );
}

export function is_system_email(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const local_part = normalized.split("@")[0];

  return (
    normalized === "noreply@astermail.org" ||
    normalized === "no-reply@astermail.org" ||
    normalized === "updates@astermail.org" ||
    normalized === "updates@aster.cx" ||
    local_part === "mailer-daemon" ||
    local_part === "postmaster"
  );
}

export function get_email_username(email: string): string {
  return email.split("@")[0] || "";
}

export function get_root_domain(domain: string): string {
  const parts = domain.toLowerCase().split(".");

  if (parts.length <= 2) return domain.toLowerCase();

  const TWO_PART_TLDS = new Set([
    "co.uk",
    "co.jp",
    "co.kr",
    "co.nz",
    "co.za",
    "co.in",
    "co.id",
    "co.th",
    "co.il",
    "co.ke",
    "co.tz",
    "co.ug",
    "co.ao",
    "co.bw",
    "co.cr",
    "co.ve",
    "com.au",
    "com.br",
    "com.cn",
    "com.mx",
    "com.sg",
    "com.hk",
    "com.tw",
    "com.ar",
    "com.co",
    "com.my",
    "com.ph",
    "com.pk",
    "com.tr",
    "com.ua",
    "com.vn",
    "com.eg",
    "com.ng",
    "com.pe",
    "com.ec",
    "com.bd",
    "com.kw",
    "com.sa",
    "com.qa",
    "com.om",
    "com.lb",
    "com.gt",
    "com.do",
    "com.uy",
    "net.au",
    "net.br",
    "net.cn",
    "net.nz",
    "org.au",
    "org.uk",
    "org.nz",
    "org.za",
    "org.br",
    "org.cn",
    "ac.uk",
    "ac.jp",
    "ac.kr",
    "ac.nz",
    "ac.za",
    "ac.in",
    "gov.uk",
    "gov.au",
    "gov.br",
    "gov.cn",
    "edu.au",
    "edu.cn",
    "edu.hk",
    "ne.jp",
    "or.jp",
    "or.kr",
  ]);

  const last_two = parts.slice(-2).join(".");

  if (TWO_PART_TLDS.has(last_two)) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

export function get_email_domain(email: string): string {
  const domain = email.split("@")[1] || "";

  return get_root_domain(domain);
}

export type Platform = "mac" | "windows" | "linux" | "unknown";

let cached_platform: Platform | null = null;

export function detect_platform(): Platform {
  if (typeof window === "undefined") return "unknown";

  if (cached_platform !== null) return cached_platform;

  const nav = navigator as Navigator & {
    userAgentData?: { platform: string };
  };

  if (nav.userAgentData?.platform) {
    const platform = nav.userAgentData.platform.toLowerCase();

    if (platform === "macos") {
      cached_platform = "mac";
    } else if (platform === "windows") {
      cached_platform = "windows";
    } else if (platform === "linux" || platform === "chromeos") {
      cached_platform = "linux";
    } else {
      cached_platform = "unknown";
    }

    return cached_platform;
  }

  const platform = navigator.platform.toLowerCase();

  if (platform.includes("mac")) {
    cached_platform = "mac";
  } else if (platform.includes("win")) {
    cached_platform = "windows";
  } else if (platform.includes("linux") || platform.includes("x11")) {
    cached_platform = "linux";
  } else {
    cached_platform = "unknown";
  }

  return cached_platform;
}

export function is_mac_platform(): boolean {
  return detect_platform() === "mac";
}
