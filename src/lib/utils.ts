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
  const units = ["B", "KB", "MB", "GB"];
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
    sender_email === "hello@astermail.org" ||
    sender_email?.endsWith("@astermail.org") === true ||
    sender_email?.endsWith("@aster.cx") === true
  );
}

export function is_system_email(email?: string | null): boolean {
  return email === "hello@astermail.org";
}

export function get_email_username(email: string): string {
  return email.split("@")[0] || "";
}

export function get_email_domain(email: string): string {
  return email.split("@")[1] || "";
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
