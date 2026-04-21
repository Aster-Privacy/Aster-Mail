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
import { api_client, type ApiResponse } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import {
  encrypt_alias_field,
  compute_alias_hash,
  compute_routing_hash,
  decrypt_alias_field,
} from "./aliases";

export const GHOST_DOMAIN = "astermail.org";

const FIRST_WORDS = [
  "sage",
  "ember",
  "coral",
  "cedar",
  "haven",
  "iris",
  "jasper",
  "luna",
  "moss",
  "reed",
  "wren",
  "ash",
  "briar",
  "brook",
  "clover",
  "dawn",
  "elm",
  "fern",
  "flint",
  "glen",
  "hazel",
  "ivy",
  "jade",
  "lark",
  "maple",
  "nova",
  "olive",
  "pearl",
  "pine",
  "rain",
  "robin",
  "rowan",
  "sky",
  "thorn",
  "vale",
  "willow",
  "birch",
  "cliff",
  "cove",
  "dune",
  "frost",
  "gale",
  "heath",
  "indigo",
  "juniper",
  "kit",
  "lake",
  "marsh",
  "mist",
  "oak",
  "petal",
  "quill",
  "ridge",
  "river",
  "rune",
  "shade",
  "silver",
  "slate",
  "snow",
  "sparrow",
  "stone",
  "storm",
  "summit",
  "terra",
  "tide",
  "vine",
  "wave",
  "winter",
  "zen",
  "aurora",
  "bay",
  "blaze",
  "breeze",
  "cobalt",
  "delta",
  "echo",
  "flora",
  "grove",
  "harbor",
  "isle",
  "lyric",
  "onyx",
] as const;

const SECOND_WORDS = [
  "ridge",
  "vale",
  "frost",
  "stone",
  "brook",
  "field",
  "wood",
  "lake",
  "dale",
  "ward",
  "hill",
  "lane",
  "marsh",
  "cross",
  "moon",
  "star",
  "light",
  "crest",
  "peak",
  "shore",
  "drift",
  "bloom",
  "glade",
  "grove",
  "haven",
  "moor",
  "cliff",
  "dell",
  "fern",
  "ford",
  "gate",
  "glen",
  "haze",
  "isle",
  "knoll",
  "ledge",
  "loft",
  "nest",
  "path",
  "pond",
  "rain",
  "reef",
  "rise",
  "sage",
  "shade",
  "slope",
  "spring",
  "trail",
  "veil",
  "vista",
  "wind",
  "hollow",
  "ember",
  "arrow",
  "flare",
  "harbor",
  "bridge",
  "canyon",
  "dusk",
  "echo",
  "flame",
  "forge",
  "gleam",
  "heron",
  "inlet",
  "jewel",
  "kelp",
  "leaf",
  "meadow",
  "north",
  "orchid",
  "pine",
  "quartz",
  "raven",
  "sierra",
  "torch",
  "umber",
] as const;

function uniform_random_index(modulus: number): number {
  const range = 0x100000000;
  const limit = range - (range % modulus);
  const buf = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % modulus;
  }
}

export function generate_ghost_local_part(): string {
  const first = FIRST_WORDS[uniform_random_index(FIRST_WORDS.length)];
  const second = SECOND_WORDS[uniform_random_index(SECOND_WORDS.length)];
  const suffix = uniform_random_index(100).toString().padStart(2, "0");

  return `${first}.${second}${suffix}`;
}

export interface GhostAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  alias_address_hash: string;
  domain: string;
  is_enabled: boolean;
  expires_at?: string;
  grace_expires_at?: string;
  thread_token_hash?: string;
  created_at: string;
}

export interface DecryptedGhostAlias extends GhostAlias {
  local_part: string;
  full_address: string;
}

export interface CreateGhostAliasResponse {
  id: string;
  success: boolean;
  expires_at: string;
  grace_expires_at: string;
}

export interface ListGhostAliasesResponse {
  aliases: GhostAlias[];
  total: number;
}

export interface ThreadLookupResponse {
  alias: GhostAlias | null;
}

export async function decrypt_ghost_alias(
  alias: GhostAlias,
): Promise<DecryptedGhostAlias> {
  const local_part = await decrypt_alias_field(
    alias.encrypted_local_part,
    alias.local_part_nonce,
  );

  return {
    ...alias,
    local_part,
    full_address: `${local_part}@${alias.domain}`,
  };
}

export async function decrypt_ghost_aliases(
  aliases: GhostAlias[],
): Promise<DecryptedGhostAlias[]> {
  const results = await Promise.allSettled(
    aliases.map(decrypt_ghost_alias),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DecryptedGhostAlias> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
}

export async function create_ghost_alias(
  local_part: string,
  expires_in_days: number,
  thread_token_hash?: string,
): Promise<ApiResponse<CreateGhostAliasResponse>> {
  const normalized = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized, GHOST_DOMAIN);
  const routing_hash = await compute_routing_hash(normalized, GHOST_DOMAIN);
  const { encrypted, nonce } = await encrypt_alias_field(normalized);

  const request: Record<string, unknown> = {
    encrypted_local_part: encrypted,
    local_part_nonce: nonce,
    alias_address_hash: alias_hash,
    routing_address_hash: routing_hash,
    domain: GHOST_DOMAIN,
    expires_in_days,
  };

  if (thread_token_hash) {
    request.thread_token_hash = thread_token_hash;
  }

  return api_client.post<CreateGhostAliasResponse>(
    API_ENDPOINTS.addresses.aliases.ghost.base,
    request,
  );
}

export async function list_ghost_aliases(): Promise<
  ApiResponse<ListGhostAliasesResponse>
> {
  return api_client.get<ListGhostAliasesResponse>(
    API_ENDPOINTS.addresses.aliases.ghost.base,
  );
}

export async function expire_ghost_alias(
  alias_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    API_ENDPOINTS.addresses.aliases.ghost.expire(alias_id),
    {},
  );
}

export async function extend_ghost_alias(
  alias_id: string,
  additional_days: number,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    API_ENDPOINTS.addresses.aliases.ghost.extend(alias_id),
    { additional_days },
  );
}

export async function lookup_ghost_for_thread(
  thread_token_hash: string,
): Promise<ApiResponse<ThreadLookupResponse>> {
  return api_client.post<ThreadLookupResponse>(
    API_ENDPOINTS.addresses.aliases.ghost.thread_lookup,
    { thread_token_hash },
  );
}
