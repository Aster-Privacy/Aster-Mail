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
  AliasLimitResponse,
  ClaimTwinAliasRequest,
  ClaimTwinAliasResponse,
  TwinAddressResponse,
  TwinSibling,
} from "./types";

import { api_client, type ApiResponse } from "../client";

import { compute_alias_hash, encrypt_alias_field } from "./crypto";
import { get_alias_limit, get_twin_address } from "./crud";

import { ignore_error } from "@/lib/ignore_error";
import { is_premium_alias_domain } from "@/components/settings/billing/billing_constants";

export const MATCHING_CLAIM_LIMIT = 2;

export interface MatchingClaimResult {
  address: string;
  alias_id: string;
  created: boolean;
}

const pending_claims = new Map<string, Promise<MatchingClaimResult[]>>();

export async function claim_matching_address(
  local_part: string,
  domain: string,
): Promise<ApiResponse<ClaimTwinAliasResponse>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const alias_address_hash = await compute_alias_hash(
    normalized_local_part,
    domain,
  );
  const { encrypted: encrypted_local_part, nonce: local_part_nonce } =
    await encrypt_alias_field(normalized_local_part);

  const request: ClaimTwinAliasRequest = {
    encrypted_local_part,
    local_part_nonce,
    alias_address_hash,
    domain,
  };

  return api_client.post<ClaimTwinAliasResponse>(
    "/addresses/v1/aliases/twin/claim",
    request,
  );
}

export function matching_claim_slots(limit: AliasLimitResponse): number {
  if (limit.max_aliases < 0) return MATCHING_CLAIM_LIMIT;

  return Math.min(
    MATCHING_CLAIM_LIMIT,
    Math.max(0, limit.max_aliases - limit.current_count),
  );
}

export function pick_matching_addresses(
  twin: TwinAddressResponse,
  slots: number,
): TwinSibling[] {
  const siblings: TwinSibling[] = twin.siblings?.length
    ? twin.siblings
    : [
        {
          address: twin.address,
          domain: twin.domain,
          local_part: twin.local_part,
          state: twin.state,
        },
      ];

  return siblings
    .filter(
      (sibling) =>
        sibling.state === "reserved" &&
        !!sibling.local_part &&
        !is_premium_alias_domain(sibling.domain),
    )
    .slice(0, Math.max(0, slots));
}

async function run_matching_claim(): Promise<MatchingClaimResult[] | null> {
  const [twin, limit] = await Promise.all([
    get_twin_address(),
    get_alias_limit(),
  ]);

  if (!twin.data || !limit.data) return null;

  const picks = pick_matching_addresses(
    twin.data,
    matching_claim_slots(limit.data),
  );
  const results: MatchingClaimResult[] = [];

  for (const sibling of picks) {
    try {
      const response = await claim_matching_address(
        sibling.local_part,
        sibling.domain,
      );

      if (response.data) {
        results.push({
          address: sibling.address,
          alias_id: response.data.id,
          created: response.data.created,
        });
      }
    } catch (caught) {
      ignore_error(
        "services/api/aliases/matching_claim:run_matching_claim",
        caught,
      );
    }
  }

  return results;
}

export function auto_claim_matching_addresses(
  account_key: string,
): Promise<MatchingClaimResult[]> {
  const existing = pending_claims.get(account_key);

  if (existing) return existing;

  const pending = run_matching_claim()
    .then((results) => {
      if (results === null) pending_claims.delete(account_key);

      return results ?? [];
    })
    .catch((caught: unknown) => {
      pending_claims.delete(account_key);
      ignore_error(
        "services/api/aliases/matching_claim:auto_claim_matching_addresses",
        caught,
      );

      return [];
    });

  pending_claims.set(account_key, pending);

  return pending;
}

export function reset_matching_claims(): void {
  pending_claims.clear();
}
