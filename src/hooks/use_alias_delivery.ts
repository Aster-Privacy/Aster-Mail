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
import { useRef, useSyncExternalStore } from "react";

import {
  get_alias_hash_by_address,
  resolve_alias_delivery,
  subscribe_aliases,
  type AliasDelivery,
} from "@/hooks/use_sidebar_aliases";
import { use_preferences } from "@/contexts/preferences_context";

const PROVIDER_DOMAINS = new Set([
  "astermail.org",
  "aster.cx",
  "astermail.me",
  "astermail.net",
  "gs-cloud.space",
]);

export interface AliasRowInfo {
  delivery: AliasDelivery | null;
  custom_domain_label: string | null;
}

export function normalize_alias_candidates(
  candidates: (string | undefined | null)[],
): string {
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();

    if (normalized) seen.add(normalized);
  }

  return [...seen].join(",");
}

function same_delivery(
  a: AliasDelivery | null,
  b: AliasDelivery | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return a.address === b.address && a.label === b.label;
}

function same_row_info(a: AliasRowInfo, b: AliasRowInfo): boolean {
  return (
    a.custom_domain_label === b.custom_domain_label &&
    same_delivery(a.delivery, b.delivery)
  );
}

function use_alias_selection<T>(
  select: () => T,
  is_equal: (a: T, b: T) => boolean,
): T {
  const last_ref = useRef<{ value: T } | null>(null);
  const get_snapshot = () => {
    const next = select();
    const last = last_ref.current;

    if (last && is_equal(last.value, next)) return last.value;
    last_ref.current = { value: next };

    return next;
  };

  return useSyncExternalStore(subscribe_aliases, get_snapshot, get_snapshot);
}

function resolve_delivery(
  indicators_enabled: boolean,
  routing_token: string | undefined,
  candidates_key: string,
): AliasDelivery | null {
  if (!indicators_enabled) return null;

  return resolve_alias_delivery(
    routing_token,
    candidates_key ? candidates_key.split(",") : [],
  );
}

function resolve_custom_domain_label(
  recipient_addresses: string[] | undefined,
): string | null {
  const match = recipient_addresses?.find((address) => {
    const lower = address.toLowerCase();
    const domain = lower.split("@")[1];

    if (!domain || PROVIDER_DOMAINS.has(domain)) return false;

    return get_alias_hash_by_address(lower) !== null;
  });

  return match ? match.split("@")[1] : null;
}

export function use_alias_delivery(
  routing_token: string | undefined,
  candidates_key: string,
): AliasDelivery | null {
  const { preferences } = use_preferences();
  const indicators_enabled = preferences.show_alias_indicators !== false;

  return use_alias_selection(
    () => resolve_delivery(indicators_enabled, routing_token, candidates_key),
    same_delivery,
  );
}

export function use_alias_row_info(
  routing_token: string | undefined,
  candidates_key: string,
  recipient_addresses: string[] | undefined,
): AliasRowInfo {
  const { preferences } = use_preferences();
  const indicators_enabled = preferences.show_alias_indicators !== false;

  return use_alias_selection<AliasRowInfo>(
    () => ({
      delivery: resolve_delivery(
        indicators_enabled,
        routing_token,
        candidates_key,
      ),
      custom_domain_label: resolve_custom_domain_label(recipient_addresses),
    }),
    same_row_info,
  );
}
