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
export type VCardTypedProperty = "EMAIL" | "TEL" | "ADR";

const EXPORT_TYPE_TOKENS: Record<VCardTypedProperty, Record<string, string>> = {
  EMAIL: { home: "HOME", work: "WORK", other: "OTHER" },
  TEL: {
    mobile: "CELL",
    home: "HOME",
    work: "WORK",
    fax: "FAX",
    pager: "PAGER",
    other: "OTHER",
  },
  ADR: { home: "HOME", work: "WORK", other: "OTHER" },
};

const LABEL_WORDS: Record<string, string> = {
  home: "home",
  work: "work",
  personal: "personal",
  mobile: "mobile",
  cell: "mobile",
  iphone: "mobile",
  other: "other",
  fax: "fax",
  homefax: "fax",
  workfax: "fax",
  otherfax: "fax",
  pager: "pager",
};

const TYPE_TOKENS: Record<string, string> = {
  home: "home",
  work: "work",
  personal: "personal",
  cell: "mobile",
  mobile: "mobile",
  iphone: "mobile",
  fax: "fax",
  pager: "pager",
  other: "other",
};

const IGNORED_TYPE_TOKENS = new Set([
  "pref",
  "internet",
  "voice",
  "x400",
  "text",
  "msg",
  "video",
  "postal",
  "parcel",
  "dom",
  "intl",
  "quoted-printable",
  "8bit",
  "7bit",
  "base64",
  "b",
]);

function display_label(token: string): string {
  const lower = token.toLowerCase();

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export interface VCardGroupCounter {
  value: number;
}

export function vcard_entry_label(
  type: string | undefined,
  label: string | undefined,
): string | undefined {
  const trimmed = (label ?? "").trim();

  if (trimmed) return trimmed;
  if (type === "personal") return "Personal";

  return undefined;
}

export function vcard_type_token(
  property: VCardTypedProperty,
  type: string | undefined,
): string | undefined {
  if (!type) return undefined;

  return EXPORT_TYPE_TOKENS[property][type] ?? "OTHER";
}

function vcard_param_text(label: string): string {
  return label
    .replace(/[\p{Cc};:,"]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function typed_vcard_lines(
  property: VCardTypedProperty,
  base_params: string,
  entry: { type?: string; label?: string },
  escaped_value: string,
  counter: VCardGroupCounter,
  escape: (value: string) => string,
): string[] {
  const custom = vcard_entry_label(entry.type, entry.label);

  if (custom) {
    counter.value += 1;
    const group = `item${counter.value}`;
    const param = vcard_param_text(custom);

    return [
      `${group}.${property}${base_params}${param ? `;TYPE=${param}` : ""}:${escaped_value}`,
      `${group}.X-ABLabel:${escape(custom)}`,
    ];
  }
  const token = vcard_type_token(property, entry.type);

  return [
    `${property}${base_params}${token ? `;TYPE=${token}` : ""}:${escaped_value}`,
  ];
}

export function vcard_group_of(key: string): string | undefined {
  const name = key.split(";")[0];
  const dot = name.indexOf(".");

  if (dot <= 0) return undefined;

  return name.slice(0, dot).toLowerCase();
}

export function vcard_property_name(key: string): string {
  return (key.split(";")[0].split(".").pop() || "").toUpperCase();
}

export function clean_apple_label(value: string): string {
  const match = /^_\$!<(.*)>!\$_$/.exec(value.trim());

  return (match ? match[1] : value).trim();
}

export function raw_type_tokens(key: string): string[] {
  return key
    .split(";")
    .slice(1)
    .flatMap((param) => {
      const eq = param.indexOf("=");

      if (eq < 0) return [param];
      if (param.slice(0, eq).trim().toUpperCase() !== "TYPE") return [];

      return param.slice(eq + 1).split(",");
    })
    .map((token) => token.replace(/"/g, "").trim())
    .filter(Boolean);
}

function strip_x_prefix(token: string): string {
  return /^x-/i.test(token) ? token.slice(2) : token;
}

export function resolve_vcard_entry_type<T extends string>(
  key: string,
  group_label: string | undefined,
  allowed: readonly T[],
  fallback: T,
): { type: T; label?: string } {
  const other = (allowed.includes("other" as T) ? "other" : fallback) as T;

  if (group_label !== undefined) {
    const cleaned = clean_apple_label(group_label);
    const mapped = LABEL_WORDS[cleaned.toLowerCase().replace(/\s+/g, "")];

    if (mapped && allowed.includes(mapped as T)) return { type: mapped as T };
    if (cleaned) return { type: other, label: cleaned };
  }

  let unknown: string | undefined;

  for (const raw of raw_type_tokens(key)) {
    const token = strip_x_prefix(raw);
    const lower = token.toLowerCase();

    if (IGNORED_TYPE_TOKENS.has(lower)) continue;
    const mapped = TYPE_TOKENS[lower];

    if (mapped) {
      if (mapped !== "other" && allowed.includes(mapped as T)) {
        return { type: mapped as T };
      }
      continue;
    }
    if (unknown === undefined && token) unknown = display_label(token);
  }

  if (unknown) return { type: other, label: unknown };

  return { type: fallback };
}

export function collect_vcard_group_labels(
  lines: string[],
  unescape: (value: string) => string,
): Map<string, string> {
  const labels = new Map<string, string>();

  for (const line of lines) {
    const separator = line.indexOf(":");

    if (separator < 0) continue;
    const key = line.slice(0, separator);

    if (vcard_property_name(key) !== "X-ABLABEL") continue;
    const group = vcard_group_of(key);

    if (!group) continue;
    labels.set(group, unescape(line.slice(separator + 1)));
  }

  return labels;
}
