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
import type { DecryptedGhostAlias } from "@/services/api/ghost_aliases";

import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(),
  decrypt_aliases: vi.fn(),
  get_alias_counts: vi.fn(),
  get_alias_unread_counts: vi.fn(),
  reencrypt_alias_local_part: vi.fn(),
  compute_routing_hash: vi.fn(),
  backfill_missing_routing_hashes: vi.fn(),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(),
  list_domain_addresses: vi.fn(),
  decrypt_domain_addresses: vi.fn(),
  compute_address_routing_hash: vi.fn(),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: vi.fn(),
  decrypt_ghost_aliases: vi.fn(),
}));

vi.mock("@/services/api/family_org", () => ({
  list_my_groups: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => false,
  get_derived_encryption_key: () => null,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => null,
}));

const { build_alias_delivery_index, resolve_alias_delivery_in } = await import(
  "@/hooks/use_sidebar_aliases"
);

function make_alias(
  overrides: Partial<DecryptedEmailAlias> & { id: string; local_part: string },
): DecryptedEmailAlias {
  return {
    domain: "aster.cx",
    full_address: `${overrides.local_part}@aster.cx`,
    alias_address_hash: `hash-${overrides.id}`,
    is_enabled: true,
    is_random: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as DecryptedEmailAlias;
}

function make_ghost(local_part: string): DecryptedGhostAlias {
  return {
    id: `ghost-${local_part}`,
    encrypted_local_part: "",
    local_part_nonce: "",
    alias_address_hash: `hash-ghost-${local_part}`,
    domain: "realiased.me",
    is_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    local_part,
    full_address: `${local_part}@realiased.me`,
  };
}

describe("build_alias_delivery_index", () => {
  it("resolves a user alias by routing token", () => {
    const index = build_alias_delivery_index(
      [make_alias({ id: "a1", local_part: "shopping" })],
      [],
    );

    expect(resolve_alias_delivery_in(index, "hash-a1", [])).toEqual({
      address: "shopping@aster.cx",
      label: "shopping",
    });
  });

  it("resolves a user alias by recipient address", () => {
    const index = build_alias_delivery_index(
      [make_alias({ id: "a1", local_part: "shopping" })],
      [],
    );

    expect(
      resolve_alias_delivery_in(index, undefined, ["SHOPPING@ASTER.CX"]),
    ).toEqual({ address: "shopping@aster.cx", label: "shopping" });
  });

  it("labels the alias by its local part even when a display name is set", () => {
    const index = build_alias_delivery_index(
      [
        make_alias({
          id: "a1",
          local_part: "shopping",
          display_name: "  Shopping  ",
        }),
      ],
      [],
    );

    expect(resolve_alias_delivery_in(index, "hash-a1", [])?.label).toBe(
      "shopping",
    );
  });

  it("labels distinct aliases distinctly when they share one display name", () => {
    const index = build_alias_delivery_index(
      [
        make_alias({
          id: "a1",
          local_part: "thehindu.3month",
          display_name: "Mr. Jarvis",
        }),
        make_alias({
          id: "a2",
          local_part: "banking",
          display_name: "Mr. Jarvis",
        }),
      ],
      [],
    );

    expect(resolve_alias_delivery_in(index, "hash-a1", [])?.label).toBe(
      "thehindu.3month",
    );
    expect(resolve_alias_delivery_in(index, "hash-a2", [])?.label).toBe(
      "banking",
    );
  });

  it("ignores synthetic custom domain and group entries", () => {
    const index = build_alias_delivery_index(
      [
        make_alias({
          id: "domain-1",
          local_part: "hello",
          full_address: "hello@example.com",
          alias_address_hash: "hash-domain-1",
        }),
        make_alias({
          id: "group-1",
          local_part: "team",
          full_address: "team@example.com",
          alias_address_hash: "hash-group-1",
        }),
      ],
      [],
    );

    expect(resolve_alias_delivery_in(index, "hash-domain-1", [])).toBeNull();
    expect(
      resolve_alias_delivery_in(index, undefined, ["team@example.com"]),
    ).toBeNull();
    expect(index.hash_by_address.get("hello@example.com")).toBe(
      "hash-domain-1",
    );
  });

  it("resolves ghost aliases by token and address", () => {
    const index = build_alias_delivery_index([], [make_ghost("quiet-fox")]);

    expect(
      resolve_alias_delivery_in(index, "hash-ghost-quiet-fox", []),
    ).toEqual({ address: "quiet-fox@realiased.me", label: "quiet-fox" });
    expect(
      resolve_alias_delivery_in(index, undefined, ["quiet-fox@realiased.me"]),
    ).toEqual({ address: "quiet-fox@realiased.me", label: "quiet-fox" });
    expect(index.hash_by_address.has("quiet-fox@realiased.me")).toBe(false);
  });

  it("returns null when nothing matches", () => {
    const index = build_alias_delivery_index(
      [make_alias({ id: "a1", local_part: "shopping" })],
      [],
    );

    expect(
      resolve_alias_delivery_in(index, "unknown", ["someone@example.com"]),
    ).toBeNull();
  });

  it("scales past the former fifty alias ceiling", () => {
    const many = Array.from({ length: 750 }, (_, i) =>
      make_alias({ id: `a${i}`, local_part: `alias${i}` }),
    );
    const index = build_alias_delivery_index(many, []);

    expect(index.delivery_by_hash.size).toBe(750);
    expect(resolve_alias_delivery_in(index, "hash-a700", [])?.label).toBe(
      "alias700",
    );
  });
});
