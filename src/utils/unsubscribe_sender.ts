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
import type {
  UnsubscribeDelivery,
  UnsubscribeSender,
} from "@/utils/unsubscribe_detector";

import {
  ensure_sender_alias_caches,
  get_cached_sender_identity_for_address,
  get_cached_sender_identity_for_routing_token,
  has_cached_secondary_addresses,
  is_sender_alias_cache_populated,
} from "@/hooks/use_sender_aliases";
import { catch_all_address_for_routing_token } from "@/services/catch_all_sender";
import { peek_current_user } from "@/services/current_identity";

function normalize_address(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function primary_email_of(delivery: UnsubscribeDelivery): string {
  return normalize_address(
    delivery.primary_email ?? peek_current_user()?.email,
  );
}

function visible_addresses(delivery: UnsubscribeDelivery): string[] {
  return (delivery.recipients ?? []).map(normalize_address).filter(Boolean);
}

export function resolve_unsubscribe_sender(
  delivery: UnsubscribeDelivery,
): UnsubscribeSender | null | undefined {
  if (delivery.routing_token) {
    const identity = get_cached_sender_identity_for_routing_token(
      delivery.routing_token,
    );

    return identity
      ? {
          from_address: identity.email,
          from_address_hash: identity.address_hash,
        }
      : null;
  }

  const primary = primary_email_of(delivery);
  const visible = visible_addresses(delivery);

  if (primary && visible.includes(primary)) {
    return { from_address: primary };
  }

  for (const address of visible) {
    const identity = get_cached_sender_identity_for_address(address);

    if (identity) {
      return {
        from_address: identity.email,
        from_address_hash: identity.address_hash,
      };
    }
  }

  return undefined;
}

export async function load_unsubscribe_sender(
  delivery: UnsubscribeDelivery,
): Promise<UnsubscribeSender | null | undefined> {
  const sender = await load_delivery_sender(delivery);

  if (sender !== undefined) {
    return sender;
  }

  await ensure_sender_alias_caches();

  const primary = primary_email_of(delivery);

  if (
    !primary ||
    !is_sender_alias_cache_populated() ||
    has_cached_secondary_addresses()
  ) {
    return null;
  }

  return { from_address: primary };
}

async function load_delivery_sender(
  delivery: UnsubscribeDelivery,
): Promise<UnsubscribeSender | null | undefined> {
  const cached = resolve_unsubscribe_sender(delivery);

  if (!delivery.routing_token) {
    if (cached !== undefined || is_sender_alias_cache_populated()) {
      return cached;
    }

    await ensure_sender_alias_caches();

    return resolve_unsubscribe_sender(delivery);
  }

  if (cached) return cached;

  await ensure_sender_alias_caches({ refresh: true });

  const loaded = resolve_unsubscribe_sender(delivery);

  if (loaded) return loaded;

  const catch_all = await catch_all_address_for_routing_token(
    delivery.routing_token,
    visible_addresses(delivery),
  );

  return catch_all ? { from_address: catch_all } : null;
}
