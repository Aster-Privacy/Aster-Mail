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

import {
  clear_filter_operators,
  parse_search_query,
} from "@/utils/search_operators";

const SINGLE_CHARACTER_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

export function min_search_length(value: string): number {
  return SINGLE_CHARACTER_SCRIPT.test(value) ? 1 : 2;
}

export function meets_min_search_length(value: string): boolean {
  return value.length >= min_search_length(value);
}

export function split_search_terms(text: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1] !== undefined ? match[1] : match[2].replace(/"/g, "");
    const term = raw.replace(/\s+/g, " ").trim().toLowerCase();

    if (term && meets_min_search_length(term)) terms.push(term);
  }

  return terms;
}

export type SearchViewScope = "view" | "wide";

export interface SearchScopeChip {
  scope: SearchViewScope;
  label_key: TranslationKey;
  folder_label_key?: TranslationKey;
  is_active: boolean;
}

const SEARCH_VIEW_LABELS = new Map<string, TranslationKey>([
  ["inbox", "mail.inbox"],
  ["all", "mail.all_mail"],
  ["starred", "mail.starred"],
  ["sent", "mail.sent"],
  ["drafts", "mail.drafts"],
  ["scheduled", "mail.scheduled"],
  ["snoozed", "mail.snoozed"],
  ["archive", "mail.archive"],
  ["spam", "mail.spam"],
  ["trash", "mail.trash"],
]);

const DEFAULT_SCOPED_VIEWS = new Set(["trash", "spam"]);

const LIST_VIEW_PREFIXES = ["/folder/", "/tag/", "/alias/"];

const IN_VALUE_ALIASES = new Map<string, string>([
  ["archived", "archive"],
  ["draft", "drafts"],
]);

export function search_view_for_path(pathname: string): string | undefined {
  if (LIST_VIEW_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return "all";
  }

  const view = pathname === "/" ? "inbox" : pathname.replace(/^\//, "");

  return SEARCH_VIEW_LABELS.has(view) ? view : undefined;
}

export interface SearchListScope {
  operator: "folder" | "label";
  token: string;
}

const LIST_SCOPE_ROUTES: [string, string, SearchListScope["operator"]][] = [
  ["/folder/", "folder-", "folder"],
  ["/tag/", "tag-", "label"],
];

function decoded_token(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function search_list_scope_for_path(
  pathname: string,
): SearchListScope | undefined {
  for (const [route_prefix, , operator] of LIST_SCOPE_ROUTES) {
    if (!pathname.startsWith(route_prefix)) continue;

    const token = decoded_token(
      pathname.slice(route_prefix.length).split("/")[0],
    );

    return token ? { operator, token } : undefined;
  }

  return undefined;
}

export function search_list_scope_for_view(
  view: string | undefined,
): SearchListScope | undefined {
  if (!view) return undefined;

  for (const [, view_prefix, operator] of LIST_SCOPE_ROUTES) {
    if (!view.startsWith(view_prefix)) continue;

    const token = view.slice(view_prefix.length);

    return token ? { operator, token } : undefined;
  }

  return undefined;
}

export function search_list_scope_name(
  scope: SearchListScope | undefined,
  folders: { folder_token: string; name: string }[],
  tags: { tag_token: string; name: string }[],
): string | undefined {
  if (!scope) return undefined;

  const name =
    scope.operator === "folder"
      ? folders.find((folder) => folder.folder_token === scope.token)?.name
      : tags.find((tag) => tag.tag_token === scope.token)?.name;
  const trimmed = name?.trim();

  return trimmed && !trimmed.includes('"') ? trimmed : undefined;
}

export function scope_search_query_to_list(
  query: string,
  scope: SearchListScope | undefined,
  name: string | undefined,
): string {
  const trimmed = query.trim();

  if (!trimmed || !scope || !name) return trimmed;

  const is_scoped = parse_search_query(trimmed).operators.some(
    (op) => op.type === "in" || op.type === "folder" || op.type === "label",
  );

  return is_scoped ? trimmed : `${trimmed} ${scope.operator}:"${name}"`;
}

export function build_label_name_to_tokens(
  folders: { folder_token: string; name: string; is_system?: boolean }[],
  tags: { tag_token: string; name: string }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (name: string, token: string) => {
    const key = name.toLowerCase();

    map.set(key, [...(map.get(key) ?? []), token]);
  };

  for (const folder of folders) {
    if (!folder.is_system) add(folder.name, folder.folder_token);
  }
  for (const tag of tags) add(tag.name, tag.tag_token);

  return map;
}

export function search_placeholder_label_key(
  view: string | undefined,
): TranslationKey | undefined {
  if (!view) return undefined;
  if (DEFAULT_SCOPED_VIEWS.has(view)) return SEARCH_VIEW_LABELS.get(view);

  return "mail.all_mail";
}

function in_operators(query: string) {
  return parse_search_query(query).operators.filter((op) => op.type === "in");
}

export function scope_search_query(
  query: string,
  view: string | undefined,
): string {
  const trimmed = query.trim();

  if (!trimmed || !view || !DEFAULT_SCOPED_VIEWS.has(view)) return trimmed;
  if (in_operators(trimmed).length > 0) return trimmed;

  return `${trimmed} in:${view}`;
}

function single_in_value(query: string): string | null | undefined {
  const operators = in_operators(query);

  if (operators.length === 0) return null;
  if (operators.length > 1 || operators[0].negated) return undefined;

  const value = operators[0].value.toLowerCase();

  return IN_VALUE_ALIASES.get(value) ?? value;
}

export function search_scope_chips(
  query: string,
  view: string | undefined,
): SearchScopeChip[] {
  if (!view || view === "all") return [];

  const folder_label_key = SEARCH_VIEW_LABELS.get(view);

  if (!folder_label_key) return [];

  const value = single_in_value(query);

  if (value === undefined) return [];

  if (DEFAULT_SCOPED_VIEWS.has(view)) {
    if (value !== view && value !== "anywhere") return [];

    return [
      {
        scope: "view",
        label_key: "mail.filter_in",
        folder_label_key,
        is_active: value === view,
      },
      {
        scope: "wide",
        label_key: "mail.search_scope_anywhere",
        is_active: value === "anywhere",
      },
    ];
  }

  if (value !== null && value !== view && value !== "all") return [];

  return [
    {
      scope: "wide",
      label_key: "mail.all_mail",
      is_active: value !== view,
    },
    {
      scope: "view",
      label_key: "mail.filter_in",
      folder_label_key,
      is_active: value === view,
    },
  ];
}

export function rescope_search_query(
  query: string,
  view: string,
  scope: SearchViewScope,
): string {
  let stripped = query;

  for (const operator of in_operators(query)) {
    stripped = stripped.replace(operator.raw, " ");
  }
  stripped = stripped.replace(/\s+/g, " ").trim();

  const token =
    scope === "view"
      ? `in:${view}`
      : DEFAULT_SCOPED_VIEWS.has(view)
        ? "in:anywhere"
        : stripped
          ? ""
          : "in:all";

  return [stripped, token].filter(Boolean).join(" ");
}

export const SEARCH_SCOPES = [
  "all",
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "spam",
  "trash",
  "anywhere",
] as const;

export type SearchScopeValue = (typeof SEARCH_SCOPES)[number];

export function search_scope_label_key(scope: string): TranslationKey | null {
  if (scope === "anywhere") return "mail.chip_everywhere";

  return SEARCH_VIEW_LABELS.get(scope) ?? null;
}

export function default_search_scope(view: string | undefined): string {
  return view && DEFAULT_SCOPED_VIEWS.has(view) ? view : "all";
}

export interface QuerySearchScope {
  scope: string;
  is_default: boolean;
}

export function query_search_scope(
  query: string,
  view: string | undefined,
): QuerySearchScope | null {
  const value = single_in_value(query);

  if (value === undefined) return null;

  const fallback = default_search_scope(view);
  const scope = value ?? fallback;

  return { scope, is_default: scope === fallback };
}

export function set_search_scope(
  query: string,
  view: string | undefined,
  scope: string,
): string {
  let stripped = query;

  for (const operator of in_operators(query)) {
    stripped = stripped.replace(operator.raw, " ");
  }
  stripped = stripped.replace(/\s+/g, " ").trim();

  const needs_token =
    scope !== "all" || (view !== undefined && DEFAULT_SCOPED_VIEWS.has(view));
  const token = needs_token || !stripped ? `in:${scope}` : "";

  return [stripped, token].filter(Boolean).join(" ");
}

export function clear_search_filters(
  query: string,
  view: string | undefined,
): string {
  return set_search_scope(
    clear_filter_operators(query),
    view,
    default_search_scope(view),
  );
}
