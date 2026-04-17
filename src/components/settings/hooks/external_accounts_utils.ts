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
import type { TranslationKey } from "@/lib/i18n/types";
import type { SyncFrequency } from "@/services/api/external_accounts";

export type TlsMethod = "auto" | "starttls" | "implicit" | "none";

export type I18nTranslate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function get_sync_frequency_options(
  t: I18nTranslate,
): { value: SyncFrequency; label: string }[] {
  return [
    { value: "5m", label: "5 min" },
    { value: "15m", label: "15 min" },
    { value: "30m", label: "30 min" },
    { value: "1h", label: "1 hour" },
    { value: "2h", label: "2 hours" },
    { value: "6h", label: "6 hours" },
    { value: "manual", label: t("settings.security_manual") },
  ];
}

export function get_tls_method_options(
  t: I18nTranslate,
): { value: TlsMethod; label: string }[] {
  return [
    { value: "auto", label: t("settings.security_auto") },
    { value: "starttls", label: "STARTTLS" },
    { value: "implicit", label: t("settings.security_implicit") },
    { value: "none", label: t("settings.security_none") },
  ];
}

const HOSTNAME_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;

export { HOSTNAME_REGEX };

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^localhost$/i,
];

export const SYSTEM_FOLDER_NAMES = new Set([
  "inbox",
  "sent",
  "sent items",
  "sent messages",
  "drafts",
  "draft",
  "trash",
  "deleted",
  "deleted items",
  "deleted messages",
  "junk",
  "junk e-mail",
  "spam",
  "archive",
  "archives",
  "outbox",
  "notes",
  "all mail",
  "starred",
  "important",
  "flagged",
]);

export function clamp_port(value: number): number {
  if (Number.isNaN(value) || value < 1) return 1;
  if (value > 65535) return 65535;

  return Math.floor(value);
}

export function clamp_timeout(value: number): number {
  if (Number.isNaN(value) || value < 5) return 5;
  if (value > 120) return 120;

  return Math.floor(value);
}

export function sanitize_hostname(host: string): string {
  return host
    .trim()
    .replace(/^(https?:\/\/)/i, "")
    .replace(/\/+$/, "");
}

export function is_private_hostname(host: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(host));
}

export function sanitize_display_text(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function is_system_folder(name: string): boolean {
  const lower = name.toLowerCase();

  if (SYSTEM_FOLDER_NAMES.has(lower)) return true;

  const leaf = lower.includes(".")
    ? lower.split(".").pop()!
    : lower.includes("/")
      ? lower.split("/").pop()!
      : lower;

  return SYSTEM_FOLDER_NAMES.has(leaf);
}

export function get_folder_depth(path: string, delimiter: string): number {
  if (!delimiter || !path) return 0;

  return path.split(delimiter).length - 1;
}
