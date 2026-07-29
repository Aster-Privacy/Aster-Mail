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

export const GHOST_DOMAIN = "realiased.me";
export const LEGACY_GHOST_DOMAINS = ["astermail.org"];
export const ALL_GHOST_DOMAINS = [GHOST_DOMAIN, ...LEGACY_GHOST_DOMAINS];

const FIRST_WORDS = [
  "airy", "alert", "alpine", "amber", "ample", "ancient", "arctic", "arid", "artful", "ashen",
  "auburn", "autumn", "azure", "balmy", "beaming", "beige", "blithe", "blush", "bold", "boreal",
  "brave", "breezy", "bright", "brisk", "bronze", "calm", "candid", "carmine", "casual",
  "cedar", "celestial", "cherry", "chestnut", "chipper", "civic", "classic", "clear", "clever",
  "cobalt", "copper", "coral", "cosmic", "cozy", "cream", "crimson", "crisp", "crystal",
  "curious", "cyan", "daring", "dawn", "deft", "dewy", "digital", "distant", "dreamy", "dusky",
  "dusty", "eager", "early", "earthy", "eastern", "ebony", "elated", "electric", "elegant",
  "emerald", "endless", "epic", "eternal", "fabled", "fair", "faithful", "fancy", "fertile",
  "fiery", "fleet", "fluent", "foggy", "fond", "formal", "frosty", "gallant", "garnet",
  "gentle", "giant", "gilded", "ginger", "glacial", "gleaming", "glossy", "golden", "graceful",
  "grand", "granite", "grassy", "hardy", "harmonic", "hasty", "hazel", "hazy", "hearty",
  "heroic", "hidden", "high", "hollow", "honest", "humble", "icy", "ideal", "immense", "indigo",
  "inland", "ivory", "jade", "jolly", "jovial", "joyful", "keen", "kindly", "lavender", "lemon",
  "lilac", "lime", "lively", "lofty", "lone", "loyal", "lucid", "lucky", "lunar", "lush",
  "magenta", "magnetic", "maple", "maroon", "mauve", "mellow", "merry", "mighty", "mild",
  "mint", "misty", "mocha", "modern", "modest", "moonlit", "mossy", "mystic", "native", "navy",
  "neat", "nimble", "noble", "nordic", "northern", "novel", "oaken", "oceanic", "ochre",
  "olive", "opal", "opaline", "orbital", "ornate", "pacific", "patient", "peach", "pearl",
  "pewter", "placid", "playful", "plucky", "plum", "polar", "polished", "prime", "pristine",
  "prompt", "proud", "pure", "purple", "quaint", "quantum", "quick", "quiet", "radiant",
  "rapid", "rare", "ready", "regal", "remote", "restful", "rich", "rising", "roaming", "robust",
  "rocky", "rosy", "ruby", "rugged", "russet", "rustic", "saffron", "sage", "salmon", "sandy",
  "sapphire", "savvy", "scarlet", "scenic", "secret", "sepia", "serene", "shady", "sharp",
  "sheer", "shining", "sienna", "silent", "silken", "silver", "simple", "sincere", "slate",
  "sleek", "slender", "smooth", "snowy", "solar", "solemn", "solid", "soothing", "southern",
  "sparkling", "spirited", "splendid", "spry", "stable", "starry", "steady", "stellar", "still",
  "stoic", "stormy", "stout", "sturdy", "subtle", "sunlit", "sunny", "supple", "swift", "tawny",
  "teal", "tender", "thermal", "thrifty", "tidal", "tidy", "timely", "topaz", "tranquil",
  "true", "turquoise", "twilight", "ultra", "umber", "upbeat", "urban", "valiant", "vast",
  "velvet", "verdant", "vermilion", "vibrant", "vigilant", "vintage", "violet", "viridian",
  "vital", "vivid", "wandering", "warm", "watchful", "western", "whimsical", "wild", "willing",
  "windy", "winter", "wise", "wistful", "witty", "wooded", "woven", "young", "zealous", "zesty"
] as const;

const SECOND_WORDS = [
  "anchor", "apex", "arbor", "arch", "archer", "arrow", "ash", "aspen", "atlas", "atoll",
  "aurora", "badger", "banner", "basin", "bay", "beacon", "beam", "bear", "beech", "bell",
  "birch", "bison", "blade", "blossom", "bluff", "bolt", "boulder", "bramble", "branch",
  "breeze", "bridge", "brook", "butte", "cabin", "cactus", "cairn", "canal", "candle", "canopy",
  "canyon", "cape", "cardinal", "cascade", "castle", "cavern", "cedar", "chalet", "chamber",
  "channel", "chapel", "chart", "cherry", "chime", "cinder", "cipher", "circuit", "citadel",
  "cliff", "cloud", "clover", "coast", "comet", "compass", "condor", "copse", "coral",
  "cottage", "cove", "crag", "crane", "crater", "creek", "crest", "crown", "crystal", "cypress",
  "dale", "dawn", "dell", "delta", "dune", "dusk", "eagle", "echo", "eddy", "edge", "elder",
  "ember", "ermine", "estuary", "fable", "falcon", "fathom", "feather", "fern", "field",
  "finch", "fjord", "flame", "flare", "fleet", "flint", "flora", "flume", "forest", "forge",
  "fountain", "fox", "frost", "galaxy", "gale", "gallery", "garden", "garland", "gate",
  "gazelle", "geyser", "glacier", "glade", "gleam", "glen", "globe", "gorge", "grange",
  "granite", "grotto", "grove", "gulf", "gull", "harbor", "harvest", "haven", "hawk", "haze",
  "heath", "heron", "hollow", "horizon", "ibis", "inlet", "island", "isle", "jasmine", "jetty",
  "journey", "juniper", "kestrel", "keystone", "knoll", "lagoon", "lake", "lantern", "larch",
  "lark", "laurel", "ledge", "legend", "lichen", "lily", "linden", "lodge", "lotus", "lynx",
  "mallard", "mantle", "maple", "marble", "marina", "marsh", "meadow", "mesa", "meteor",
  "mirage", "mist", "moor", "moss", "mountain", "mulberry", "myrtle", "nebula", "nectar",
  "needle", "nest", "nexus", "node", "nomad", "north", "nova", "oak", "oasis", "ocean", "orbit",
  "orchard", "orchid", "osprey", "otter", "outpost", "owl", "palm", "pasture", "path", "peak",
  "pearl", "pebble", "pelican", "petal", "pier", "pine", "pinnacle", "plain", "plateau",
  "plaza", "plume", "pond", "poplar", "portal", "prairie", "prism", "puffin", "quarry",
  "quartz", "quill", "rapids", "raven", "ravine", "reef", "ridge", "rill", "rime", "river",
  "rivulet", "robin", "rock", "root", "rose", "rowan", "sable", "saddle", "sail", "sandbar",
  "sapling", "savanna", "scarp", "sequoia", "shade", "shale", "shore", "sierra", "signal",
  "silo", "sky", "slope", "sparrow", "spire", "spring", "spruce", "spur", "star", "station",
  "steppe", "stone", "stork", "storm", "strand", "stream", "summit", "sundial", "sunrise",
  "sunset", "surf", "swallow", "swan", "tarn", "temple", "terrace", "thicket", "thistle",
  "thorn", "thunder", "tide", "timber", "torch", "tower", "trail", "tundra", "tunnel", "turret",
  "valley", "vault", "veil", "vertex", "vessel", "vista", "vortex", "walnut", "warbler", "wave",
  "willow", "wind", "wolf", "wood", "wren", "yarrow", "zenith", "zephyr"
] as const;

export function uniform_random_index(modulus: number): number {
  const range = 0x100000000;
  const limit = range - (range % modulus);
  const buf = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % modulus;
  }
}

const GHOST_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const GHOST_TOKEN_LENGTH = 8;

function generate_ghost_token(): string {
  let token = "";
  for (let i = 0; i < GHOST_TOKEN_LENGTH; i += 1) {
    token += GHOST_TOKEN_ALPHABET[uniform_random_index(GHOST_TOKEN_ALPHABET.length)];
  }
  return token;
}

export function generate_ghost_local_part(): string {
  const first = FIRST_WORDS[uniform_random_index(FIRST_WORDS.length)];
  const second = SECOND_WORDS[uniform_random_index(SECOND_WORDS.length)];

  return `${first}.${second}${generate_ghost_token()}`;
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
