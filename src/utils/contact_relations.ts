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
import type { RelatedPersonEntry } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

export const RELATION_KINDS = [
  "friend",
  "manager",
  "partner",
  "assistant",
  "spouse",
  "relative",
  "child",
  "mother",
  "father",
  "brother",
  "sister",
  "custom",
] as const;

export const LEGACY_RELATION_KINDS = ["parent", "sibling"] as const;

export type RelationKind =
  | (typeof RELATION_KINDS)[number]
  | (typeof LEGACY_RELATION_KINDS)[number];

export const MAX_RELATION_VALUE_LENGTH = 200;
export const MAX_RELATION_LABEL_LENGTH = 50;
export const MAX_RELATIONS = 50;
export const DEFAULT_RELATION_KIND: RelationKind = "friend";

export interface DecodedRelation {
  kind: RelationKind;
  label: string;
  value: string;
}

const DIRECT_KINDS: ReadonlySet<string> = new Set([
  "friend",
  "manager",
  "partner",
  "assistant",
  "spouse",
  "child",
  "mother",
  "father",
  "brother",
  "sister",
  "relative",
  "parent",
  "sibling",
]);

const CUSTOM_TYPES: ReadonlySet<string> = new Set(["other", "custom", ""]);

const KIND_ENGLISH_NAMES: Record<RelationKind, string> = {
  friend: "Friend",
  manager: "Manager",
  partner: "Partner",
  assistant: "Assistant",
  spouse: "Spouse",
  relative: "Relative",
  child: "Child",
  mother: "Mother",
  father: "Father",
  brother: "Brother",
  sister: "Sister",
  custom: "Custom",
  parent: "Parent",
  sibling: "Sibling",
};

const LABEL_ALIASES: Record<string, RelationKind> = {
  friend: "friend",
  manager: "manager",
  supervisor: "manager",
  partner: "partner",
  "domestic partner": "partner",
  domestic_partner: "partner",
  assistant: "assistant",
  spouse: "spouse",
  child: "child",
  mother: "mother",
  father: "father",
  brother: "brother",
  sister: "sister",
  parent: "parent",
  sibling: "sibling",
  relative: "relative",
};

const VCARD_TYPE_ALIASES: Record<string, RelationKind> = {
  friend: "friend",
  spouse: "spouse",
  child: "child",
  parent: "parent",
  sibling: "sibling",
  kin: "relative",
  relative: "relative",
  mother: "mother",
  father: "father",
  brother: "brother",
  sister: "sister",
  manager: "manager",
  supervisor: "manager",
  assistant: "assistant",
  partner: "partner",
  domestic_partner: "partner",
  "domestic-partner": "partner",
};

const VCARD_IGNORED_TYPES: ReadonlySet<string> = new Set([
  "pref",
  "text",
  "uri",
  "voice",
  "internet",
  "other",
  "custom",
]);

const VCARD_STANDARD_TYPES: Partial<Record<RelationKind, string>> = {
  friend: "friend",
  spouse: "spouse",
  child: "child",
  mother: "parent",
  father: "parent",
  parent: "parent",
  brother: "sibling",
  sister: "sibling",
  sibling: "sibling",
  relative: "kin",
};

const ANDROID_RELATION_TYPES: Record<number, RelationKind> = {
  1: "assistant",
  2: "brother",
  3: "child",
  4: "partner",
  5: "father",
  6: "friend",
  7: "manager",
  8: "mother",
  9: "parent",
  10: "partner",
  12: "relative",
  13: "sister",
  14: "spouse",
};

const ANDROID_REFERRED_BY = 11;
const REFERRED_BY_LABEL = "Referred by";

function is_disallowed_code_point(code: number): boolean {
  return code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029;
}

export function clean_relation_text(raw: unknown, max_length: number): string {
  if (typeof raw !== "string") return "";
  let cleaned = "";

  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;

    cleaned += is_disallowed_code_point(code) ? " " : char;
  }

  return Array.from(cleaned.trim()).slice(0, max_length).join("").trim();
}

function lower(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function as_record(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  return entry as Record<string, unknown>;
}

export function decode_relation(entry: unknown): DecodedRelation | null {
  const record = as_record(entry);

  if (!record || typeof record.value !== "string") return null;
  const value = record.value;
  const type = lower(record.type);
  const relation = lower(record.relation);
  const label = typeof record.label === "string" ? record.label.trim() : "";

  if ((relation === "mother" || relation === "father") && type === "parent") {
    return { kind: relation, label: "", value };
  }
  if ((relation === "brother" || relation === "sister") && type === "sibling") {
    return { kind: relation, label: "", value };
  }
  if (relation === "relative" && CUSTOM_TYPES.has(type)) {
    return { kind: "relative", label: "", value };
  }
  if (DIRECT_KINDS.has(type)) {
    return { kind: type as RelationKind, label: "", value };
  }
  if (CUSTOM_TYPES.has(type)) {
    return { kind: "custom", label, value };
  }
  const raw_type = typeof record.type === "string" ? record.type.trim() : "";

  return { kind: "custom", label: label || raw_type, value };
}

export function encode_relation(
  kind: RelationKind,
  label: string,
  value: string,
): RelatedPersonEntry {
  switch (kind) {
    case "mother":
    case "father":
      return { value, type: "parent", relation: kind };
    case "brother":
    case "sister":
      return { value, type: "sibling", relation: kind };
    case "relative":
      return { value, type: "other", relation: "relative" };
    case "custom": {
      const trimmed = label.trim();

      return trimmed ? { value, type: "other", label } : { value, type: "other" };
    }
    default:
      return { value, type: kind };
  }
}

export function is_relation_kind(value: string): value is RelationKind {
  return (
    (RELATION_KINDS as readonly string[]).includes(value) ||
    (LEGACY_RELATION_KINDS as readonly string[]).includes(value)
  );
}

export function relation_kind_options(current?: RelationKind): RelationKind[] {
  const options: RelationKind[] = [...RELATION_KINDS];

  if (current && !options.includes(current)) options.push(current);

  return options;
}

export function relation_kind_key(kind: RelationKind): TranslationKey {
  return `common.type_${kind}` as TranslationKey;
}

export function relation_english_name(kind: RelationKind): string {
  return KIND_ENGLISH_NAMES[kind];
}

export function relation_display_label(
  t: (key: TranslationKey) => string,
  decoded: DecodedRelation,
): string {
  if (decoded.kind === "custom") {
    return decoded.label || t("common.type_custom");
  }

  return t(relation_kind_key(decoded.kind));
}

export function set_relation_kind(
  entry: RelatedPersonEntry,
  kind: RelationKind,
): RelatedPersonEntry {
  const decoded = decode_relation(entry);
  const label = kind === "custom" ? (decoded?.label ?? "") : "";
  const next = encode_relation(kind, label, entry.value);

  return kind === "custom" ? { ...next, label } : next;
}

export function set_relation_label(
  entry: RelatedPersonEntry,
  label: string,
): RelatedPersonEntry {
  return { value: entry.value, type: "other", label };
}

export function set_relation_value(
  entry: RelatedPersonEntry,
  value: string,
): RelatedPersonEntry {
  return { ...entry, value };
}

export function relation_dedupe_key(decoded: DecodedRelation): string {
  const label = decoded.kind === "custom" ? decoded.label.toLowerCase() : "";

  return `${decoded.kind}\u0000${label}\u0000${decoded.value
    .normalize("NFC")
    .toLowerCase()}`;
}

function normalize_entry(entry: unknown): {
  entry: RelatedPersonEntry;
  decoded: DecodedRelation;
} | null {
  const record = as_record(entry);
  const decoded = decode_relation(entry);

  if (!record || !decoded) return null;
  const value = clean_relation_text(decoded.value, MAX_RELATION_VALUE_LENGTH);

  if (!value) return null;
  const raw_label = typeof record.label === "string" ? record.label : undefined;
  const label =
    raw_label === undefined
      ? undefined
      : clean_relation_text(raw_label, MAX_RELATION_LABEL_LENGTH);
  const unchanged =
    value === record.value &&
    (raw_label === undefined || (label !== "" && label === raw_label));

  if (unchanged) {
    return { entry: record as unknown as RelatedPersonEntry, decoded };
  }
  const next: Record<string, unknown> = { ...record, value };

  if (label) next.label = label;
  else delete next.label;
  const next_entry = next as unknown as RelatedPersonEntry;

  return { entry: next_entry, decoded: decode_relation(next_entry) ?? decoded };
}

export function normalize_related_people(
  entries: unknown,
): RelatedPersonEntry[] | undefined {
  if (entries === undefined || entries === null) return undefined;
  if (!Array.isArray(entries)) return undefined;
  const seen = new Set<string>();
  const result: RelatedPersonEntry[] = [];

  for (const raw of entries) {
    if (result.length >= MAX_RELATIONS) break;
    const normalized = normalize_entry(raw);

    if (!normalized) continue;
    const key = relation_dedupe_key({
      ...normalized.decoded,
      value: normalized.entry.value,
    });

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized.entry);
  }

  return result;
}

export function merge_related_people(
  lists: (RelatedPersonEntry[] | undefined)[],
): RelatedPersonEntry[] | undefined {
  const present = lists.filter((list): list is RelatedPersonEntry[] =>
    Array.isArray(list),
  );

  if (present.length === 0) return undefined;

  return normalize_related_people(present.flat());
}

export function decode_related_people(entries: unknown): DecodedRelation[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => decode_relation(entry))
    .filter(
      (decoded): decoded is DecodedRelation =>
        decoded !== null && decoded.value.trim() !== "",
    );
}

export function relation_search_terms(
  entries: unknown,
  kind_name?: (kind: RelationKind) => string,
): string[] {
  const terms: string[] = [];

  for (const decoded of decode_related_people(entries)) {
    terms.push(decoded.value);
    if (decoded.kind === "custom") {
      if (decoded.label) terms.push(decoded.label);
      continue;
    }
    terms.push(KIND_ENGLISH_NAMES[decoded.kind]);
    if (kind_name) terms.push(kind_name(decoded.kind));
  }

  return terms;
}

export function relation_from_label(raw_label: string): {
  kind: RelationKind;
  label: string;
} {
  const trimmed = raw_label.trim();
  const apple = /^_\$!<(.*)>!\$_$/.exec(trimmed);
  const inner = (apple ? apple[1] : trimmed).trim();
  const alias = LABEL_ALIASES[inner.toLowerCase()];

  if (alias) return { kind: alias, label: "" };

  return { kind: "custom", label: inner };
}

export function relation_from_vcard_types(types: string[]): {
  kind: RelationKind;
  label: string;
} {
  let fallback = "";

  for (const raw of types) {
    const token = raw.trim().toLowerCase();

    if (!token || VCARD_IGNORED_TYPES.has(token) || token.startsWith("x-")) {
      continue;
    }
    const alias = VCARD_TYPE_ALIASES[token];

    if (alias) return { kind: alias, label: "" };
    if (!fallback) fallback = raw.trim();
  }

  return { kind: "custom", label: fallback };
}

export function relation_from_android_type(
  type_int: number,
  label: string,
): { kind: RelationKind; label: string } {
  const mapped = ANDROID_RELATION_TYPES[type_int];

  if (mapped) return { kind: mapped, label: "" };
  if (type_int === ANDROID_REFERRED_BY) {
    return { kind: "custom", label: REFERRED_BY_LABEL };
  }
  if (label.trim()) return relation_from_label(label);

  return { kind: "custom", label: "" };
}

export function relation_vcard_type(kind: RelationKind): string | undefined {
  return VCARD_STANDARD_TYPES[kind];
}

export function relation_ab_label(decoded: DecodedRelation): string {
  if (decoded.kind === "custom") return decoded.label;
  if (decoded.kind === "relative") return KIND_ENGLISH_NAMES.relative;

  return `_$!<${KIND_ENGLISH_NAMES[decoded.kind]}>!$_`;
}

export function relation_csv_label(decoded: DecodedRelation): string {
  if (decoded.kind === "custom") return decoded.label;

  return KIND_ENGLISH_NAMES[decoded.kind];
}
