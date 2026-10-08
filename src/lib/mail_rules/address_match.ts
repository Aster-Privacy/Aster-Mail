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
import type { AddressOperator, TextOperator } from "@/services/api/mail_rules";

export function fold_case(value: string, case_sensitive: boolean): string {
  const normalized = value.normalize("NFC");

  return case_sensitive ? normalized : normalized.toLowerCase();
}

export function extract_addr_spec(input: string): string {
  const open = input.lastIndexOf("<");

  if (open >= 0) {
    const close = input.indexOf(">", open);

    if (close > open) return input.slice(open + 1, close).trim();
  }

  return input.trim();
}

export function domain_of(addr_spec: string): string {
  const at = addr_spec.lastIndexOf("@");

  if (at < 0) return "";

  return addr_spec.slice(at + 1);
}

export function address_list_entries(value: string): string[] {
  return value
    .split(/[,;]/)
    .map(extract_addr_spec)
    .filter((entry) => entry.length > 0);
}

export function domain_list_entries(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((entry) =>
      entry.trim().replace(/^@+/, "").replace(/^\*\./, "").replace(/\.+$/, ""),
    )
    .filter((entry) => entry.length > 0);
}

export function domain_matches(domain: string, needle: string): boolean {
  if (!domain || !needle) return false;
  const d = domain.toLowerCase();
  const n = needle.toLowerCase();

  return d === n || d.endsWith(`.${n}`);
}

function address_entry_matches(
  addr_spec: string,
  entry: string,
  case_sensitive: boolean,
): boolean {
  if (entry.startsWith("@")) {
    return (
      fold_case(domain_of(addr_spec), case_sensitive) ===
      fold_case(entry.slice(1), case_sensitive)
    );
  }

  return (
    fold_case(addr_spec, case_sensitive) === fold_case(entry, case_sensitive)
  );
}

export function address_matches(
  address: string,
  operator: Exclude<AddressOperator, "matches_regex">,
  value: string,
  case_sensitive: boolean,
): boolean {
  const addr_spec = extract_addr_spec(address);

  switch (operator) {
    case "is": {
      const entries = address_list_entries(value);

      if (entries.length === 0) return addr_spec.length === 0;

      return entries.some((entry) =>
        address_entry_matches(addr_spec, entry, case_sensitive),
      );
    }
    case "is_not":
      return !address_matches(address, "is", value, case_sensitive);
    case "contains": {
      const needle = fold_case(value, case_sensitive);

      return (
        needle.length > 0 && fold_case(address, case_sensitive).includes(needle)
      );
    }
    case "does_not_contain":
      return !address_matches(address, "contains", value, case_sensitive);
    case "starts_with": {
      const needle = fold_case(value, case_sensitive);

      return (
        needle.length > 0 &&
        fold_case(addr_spec, case_sensitive).startsWith(needle)
      );
    }
    case "ends_with": {
      const needle = fold_case(value, case_sensitive);

      return (
        needle.length > 0 &&
        fold_case(addr_spec, case_sensitive).endsWith(needle)
      );
    }
    case "matches_domain": {
      const domains = domain_list_entries(value);
      const domain = domain_of(addr_spec);

      if (domains.length === 0) return domain.length === 0;

      return domains.some((needle) => domain_matches(domain, needle));
    }
    case "does_not_match_domain":
      return !address_matches(address, "matches_domain", value, case_sensitive);
    case "is_empty":
      return addr_spec.length === 0;
  }
}

const NEGATIVE_ADDRESS_OPERATORS = new Set<AddressOperator>([
  "is_not",
  "does_not_contain",
  "does_not_match_domain",
  "is_empty",
]);

export function any_address_matches(
  addresses: string[],
  operator: Exclude<AddressOperator, "matches_regex">,
  value: string,
  case_sensitive: boolean,
): boolean {
  if (NEGATIVE_ADDRESS_OPERATORS.has(operator)) {
    return addresses.every((a) =>
      address_matches(a, operator, value, case_sensitive),
    );
  }

  return addresses.some((a) =>
    address_matches(a, operator, value, case_sensitive),
  );
}

export function text_matches(
  text: string,
  operator: Exclude<TextOperator, "matches_regex">,
  value: string,
  case_sensitive: boolean,
): boolean {
  if (operator === "is_empty") return text.length === 0;
  const needle = fold_case(value, case_sensitive);

  if (!needle) {
    if (operator === "is") return text.length === 0;
    if (operator === "is_not") return text.length > 0;

    return operator === "does_not_contain";
  }
  const haystack = fold_case(text, case_sensitive);

  switch (operator) {
    case "is":
      return haystack === needle;
    case "is_not":
      return haystack !== needle;
    case "contains":
      return haystack.includes(needle);
    case "does_not_contain":
      return !haystack.includes(needle);
    case "starts_with":
      return haystack.startsWith(needle);
    case "ends_with":
      return haystack.endsWith(needle);
  }
}
