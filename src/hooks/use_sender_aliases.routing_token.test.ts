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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  list_all_aliases: vi.fn(),
  list_domains: vi.fn(),
}));

vi.mock("@/services/api/aliases", () => ({
  list_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  list_all_aliases: h.list_all_aliases,
  decrypt_aliases: vi.fn(async (aliases: unknown[]) => aliases),
  compute_alias_hash: vi.fn(
    async (local: string, domain: string) => `H:${local}@${domain}`,
  ),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: h.list_domains,
  list_domain_addresses: vi.fn(async () => ({
    data: { addresses: [{ id: "d1" }] },
  })),
  decrypt_domain_addresses: vi.fn(async () => [
    {
      id: "d1",
      local_part: "sales",
      local_part_hash: "keyed-hash",
      display_name: "Sales",
      is_enabled: true,
    },
  ]),
  compute_address_hash: vi.fn(
    async (local: string, domain: string) => `A:${local}@${domain}`,
  ),
  compute_address_routing_hash: vi.fn(
    async (local: string, domain: string) => `R:${local}@${domain}`,
  ),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "real@astermail.org", display_name: "Real User" },
  })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: vi.fn(() => true),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32)),
  on_keys_ready: vi.fn(() => () => {}),
}));

vi.mock("@/services/api/external_accounts", () => ({
  list_external_accounts: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { REFRESH_REQUESTED: "refresh", MAIL_CHANGED: "changed" },
  mail_event_bus: { subscribe_multiple: vi.fn(() => () => {}) },
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  GHOST_DOMAIN: "astermail.org",
  list_ghost_aliases: vi.fn(async () => ({ data: { aliases: [], total: 0 } })),
  decrypt_ghost_aliases: vi.fn(async () => []),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ is_feature_locked: () => true }),
  is_cached_feature_unlocked: () => false,
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  register_ghost_email: vi.fn(),
}));

import {
  clear_sender_aliases_cache,
  ensure_sender_alias_caches,
  get_cached_sender_identity_for_routing_token,
  is_sender_alias_cache_populated,
} from "./use_sender_aliases";

const ALIAS = {
  id: "a1",
  local_part: "shop",
  domain: "astermail.org",
  full_address: "shop@astermail.org",
  alias_address_hash: "alias-token",
  is_enabled: true,
};

beforeEach(() => {
  clear_sender_aliases_cache();
  h.list_all_aliases.mockReset();
  h.list_all_aliases.mockResolvedValue({
    aliases: [ALIAS],
    max_aliases: -1,
    total: 1,
  });
  h.list_domains.mockReset();
  h.list_domains.mockResolvedValue({
    data: {
      domains: [{ id: "dom1", domain_name: "corp.example", status: "active" }],
    },
  });
});

describe("sender address caches loaded on demand", () => {
  it("knows no receiving address before the first load", () => {
    expect(is_sender_alias_cache_populated()).toBe(false);
    expect(
      get_cached_sender_identity_for_routing_token("alias-token"),
    ).toBeUndefined();
  });

  it("resolves an alias routing token once the addresses are loaded", async () => {
    await ensure_sender_alias_caches();

    expect(is_sender_alias_cache_populated()).toBe(true);
    expect(get_cached_sender_identity_for_routing_token("alias-token")).toEqual(
      expect.objectContaining({
        email: "shop@astermail.org",
        address_hash: "alias-token",
      }),
    );
  });

  it("resolves a custom domain routing token to that address", async () => {
    await ensure_sender_alias_caches();

    expect(
      get_cached_sender_identity_for_routing_token("R:sales@corp.example"),
    ).toEqual(
      expect.objectContaining({
        email: "sales@corp.example",
        address_hash: "keyed-hash",
      }),
    );
    expect(
      get_cached_sender_identity_for_routing_token("keyed-hash"),
    ).toBeUndefined();
  });

  it("shares one load between concurrent callers", async () => {
    await Promise.all([
      ensure_sender_alias_caches(),
      ensure_sender_alias_caches({ refresh: true }),
    ]);

    expect(h.list_all_aliases).toHaveBeenCalledTimes(1);
  });

  it("does not load again while the caches are fresh", async () => {
    await ensure_sender_alias_caches();
    await ensure_sender_alias_caches();
    await ensure_sender_alias_caches({ refresh: true });

    expect(h.list_all_aliases).toHaveBeenCalledTimes(1);
  });

  it("resolves even when the load fails", async () => {
    h.list_all_aliases.mockRejectedValue(new Error("offline"));

    await expect(ensure_sender_alias_caches()).resolves.toBeUndefined();
    expect(is_sender_alias_cache_populated()).toBe(false);
  });

  it("forgets the routing tokens when the caches are cleared", async () => {
    await ensure_sender_alias_caches();
    clear_sender_aliases_cache();

    expect(
      get_cached_sender_identity_for_routing_token("R:sales@corp.example"),
    ).toBeUndefined();
  });
});
