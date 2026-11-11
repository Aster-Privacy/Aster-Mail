//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
import type { UnsubscribeSender } from "@/utils/unsubscribe_detector";

import {
  get_cached_alias_for_routing_token,
  get_cached_ghost_for_routing_token,
  get_cached_sender_identity_for_address,
} from "@/hooks/use_sender_aliases";

export interface UnsubscribeDelivery {
  routing_token?: string;
  recipients?: string[];
  primary_email?: string;
}

function normalize_address(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolve_unsubscribe_sender(
  delivery: UnsubscribeDelivery,
): UnsubscribeSender | null | undefined {
  if (delivery.routing_token) {
    const delivered = [
      get_cached_alias_for_routing_token(delivery.routing_token),
      get_cached_ghost_for_routing_token(delivery.routing_token),
    ];

    for (const address of delivered) {
      const identity = get_cached_sender_identity_for_address(address);

      if (identity) {
        return {
          from_address: identity.email,
          from_address_hash: identity.address_hash,
        };
      }
    }

    return null;
  }

  const primary = normalize_address(delivery.primary_email);
  const visible = (delivery.recipients ?? []).map(normalize_address);

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
