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

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";

const decrypted_ref: { current: DecryptedEmailAlias[] } = { current: [] };

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(async () => ({ aliases: [] })),
  decrypt_aliases: vi.fn(async () => decrypted_ref.current),
  get_alias_counts: vi.fn(async () => ({ data: { can_create: true } })),
  get_alias_unread_counts: vi.fn(async () => ({ data: { counts: [] } })),
  reencrypt_alias_local_part: vi.fn(),
  compute_routing_hash: vi.fn(),
  backfill_missing_routing_hashes: vi.fn(),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ data: { domains: [] } })),
  list_domain_addresses: vi.fn(),
  decrypt_domain_addresses: vi.fn(),
  compute_address_routing_hash: vi.fn(),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: vi.fn(async () => ({ data: null })),
  decrypt_ghost_aliases: vi.fn(),
}));

vi.mock("@/services/api/family_org", () => ({
  list_my_groups: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
  on_keys_ready: (callback: () => void) => {
    callback();

    return () => {};
  },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => null,
}));

import { use_sidebar_aliases } from "@/hooks/use_sidebar_aliases";
import { MAIL_EVENTS } from "@/hooks/mail_events";

function make_alias(
  local_part: string,
  is_enabled: boolean,
): DecryptedEmailAlias {
  return {
    id: `alias-${local_part}`,
    local_part,
    alias_address_hash: `hash-${local_part}`,
    domain: "astermail.org",
    full_address: `${local_part}@astermail.org`,
    is_enabled,
    is_random: false,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  };
}

const latest: { all: string[]; enabled: string[] } = { all: [], enabled: [] };

function Harness() {
  const { aliases, enabled_aliases } = use_sidebar_aliases();

  latest.all = aliases.map((a) => a.local_part);
  latest.enabled = enabled_aliases.map((a) => a.local_part);

  return null;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("use_sidebar_aliases enabled_aliases", () => {
  it("leaves disabled aliases out of the sidebar list and follows toggles", async () => {
    decrypted_ref.current = [
      make_alias("shop", true),
      make_alias("news", false),
    ];

    await act(async () => {
      root = createRoot(document.createElement("div"));
      root.render(<Harness />);
    });
    await settle();

    expect(latest.all).toEqual(["shop", "news"]);
    expect(latest.enabled).toEqual(["shop"]);

    decrypted_ref.current = [
      make_alias("shop", false),
      make_alias("news", true),
    ];
    await act(async () => {
      window.dispatchEvent(new Event(MAIL_EVENTS.ALIASES_CHANGED));
    });
    await settle();

    expect(latest.enabled).toEqual(["news"]);
  });
});
