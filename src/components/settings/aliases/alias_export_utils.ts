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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";
import type { DecryptedAliasDirectory } from "@/services/api/alias_directories";
import type { DecryptedGhostAlias } from "@/services/api/ghost_aliases";

export type ExportFormat = "csv" | "json";

export type ExportSource =
  | "aliases"
  | "domain_addresses"
  | "directories"
  | "ghost";

export const ALIAS_COLUMNS = [
  "address",
  "display_name",
  "note",
  "websites",
  "enabled",
  "created_at",
] as const;

export const DOMAIN_ADDRESS_COLUMNS = [
  "address",
  "display_name",
  "enabled",
  "created_at",
] as const;

export const DIRECTORY_COLUMNS = [
  "directory",
  "domain",
  "auto_create",
  "color",
  "created_at",
] as const;

export const GHOST_COLUMNS = [
  "address",
  "enabled",
  "expires_at",
  "created_at",
] as const;

export type AliasColumn = (typeof ALIAS_COLUMNS)[number];
export type DomainAddressColumn = (typeof DOMAIN_ADDRESS_COLUMNS)[number];
export type DirectoryColumn = (typeof DIRECTORY_COLUMNS)[number];
export type GhostColumn = (typeof GHOST_COLUMNS)[number];

export const SOURCE_COLUMNS = {
  aliases: ALIAS_COLUMNS,
  domain_addresses: DOMAIN_ADDRESS_COLUMNS,
  directories: DIRECTORY_COLUMNS,
  ghost: GHOST_COLUMNS,
} as const;

export const UTF8_BOM = String.fromCharCode(0xfeff);

export const CSV_LINE_BREAK = "\r\n";

export const WEBSITE_SEPARATOR = "; ";

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

function is_formula_start(value: string): boolean {
  if (!value) return false;

  const first = value.charAt(0);

  if (first === "\t" || first === "\r" || first === "\n") return true;

  const first_visible = value.trimStart().charAt(0);

  return !!first_visible && FORMULA_TRIGGERS.has(first_visible);
}

function is_guarded(value: string): boolean {
  if (!value.startsWith("'")) return false;

  let index = 0;

  while (value.charAt(index) === "'") index += 1;

  return is_formula_start(value.slice(index));
}

export function neutralize_formula(value: string): string {
  if (is_formula_start(value) || is_guarded(value)) return `'${value}`;

  return value;
}

export function strip_formula_guard(value: string): string {
  if (is_guarded(value)) return value.slice(1);

  return value;
}

function stringify_cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(WEBSITE_SEPARATOR);

  return String(value);
}

export function escape_csv_cell(value: unknown): string {
  const guarded = neutralize_formula(stringify_cell(value));

  return `"${guarded.replace(/"/g, '""')}"`;
}

export function build_csv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escape_csv_cell(cell)).join(","),
  );

  return `${UTF8_BOM}${lines.join(CSV_LINE_BREAK)}${CSV_LINE_BREAK}`;
}

function text_cell(value: string | undefined | null): string {
  return value ?? "";
}

export function is_exportable_alias(alias: DecryptedEmailAlias): boolean {
  return (
    !alias.decryption_failed &&
    !!alias.full_address &&
    alias.full_address.includes("@")
  );
}

export function build_alias_rows(
  aliases: readonly DecryptedEmailAlias[],
  columns: readonly AliasColumn[],
): unknown[][] {
  return aliases.map((alias) =>
    columns.map((column) => {
      switch (column) {
        case "address":
          return alias.full_address;
        case "display_name":
          return text_cell(alias.display_name);
        case "note":
          return text_cell(alias.note);
        case "websites":
          return alias.websites ?? [];
        case "enabled":
          return alias.is_enabled;
        case "created_at":
          return text_cell(alias.created_at);
        default:
          return "";
      }
    }),
  );
}

export function build_domain_address_rows(
  addresses: readonly (DecryptedDomainAddress & { domain_name: string })[],
  columns: readonly DomainAddressColumn[],
): unknown[][] {
  return addresses.map((address) =>
    columns.map((column) => {
      switch (column) {
        case "address":
          return `${address.local_part}@${address.domain_name}`;
        case "display_name":
          return text_cell(address.display_name);
        case "enabled":
          return address.is_enabled;
        case "created_at":
          return text_cell(address.created_at);
        default:
          return "";
      }
    }),
  );
}

export function build_directory_rows(
  directories: readonly DecryptedAliasDirectory[],
  columns: readonly DirectoryColumn[],
): unknown[][] {
  return directories.map((directory) =>
    columns.map((column) => {
      switch (column) {
        case "directory":
          return text_cell(directory.label);
        case "domain":
          return text_cell(directory.domain);
        case "auto_create":
          return directory.auto_create_enabled;
        case "color":
          return text_cell(directory.color);
        case "created_at":
          return text_cell(directory.created_at);
        default:
          return "";
      }
    }),
  );
}

export function build_ghost_rows(
  aliases: readonly DecryptedGhostAlias[],
  columns: readonly GhostColumn[],
): unknown[][] {
  return aliases.map((alias) =>
    columns.map((column) => {
      switch (column) {
        case "address":
          return alias.full_address;
        case "enabled":
          return alias.is_enabled;
        case "expires_at":
          return text_cell(alias.expires_at);
        case "created_at":
          return text_cell(alias.created_at);
        default:
          return "";
      }
    }),
  );
}

export function rows_to_objects(
  headers: readonly string[],
  rows: readonly unknown[][],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const entry: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      entry[header] = row[index] ?? "";
    });

    return entry;
  });
}

export function build_json(
  headers: readonly string[],
  rows: readonly unknown[][],
  exported_at: string,
): string {
  return JSON.stringify(
    {
      version: 1,
      exported_at,
      count: rows.length,
      entries: rows_to_objects(headers, rows),
    },
    null,
    2,
  );
}

export function export_date_stamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const FILE_BASE_NAMES = {
  aliases: "aster-aliases",
  domain_addresses: "aster-domain-addresses",
  directories: "aster-directories",
  ghost: "aster-ghost-aliases",
} as const;

export function export_file_name(
  source: ExportSource,
  format: ExportFormat,
  date_stamp: string,
): string {
  return `${FILE_BASE_NAMES[source]}-${date_stamp}.${format}`;
}

export const CSV_MIME = "text/csv;charset=utf-8";
export const JSON_MIME = "application/json;charset=utf-8";

export function download_text_file(
  file_name: string,
  content: string,
  mime_type: string,
): void {
  const blob = new Blob([content], { type: mime_type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = file_name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
