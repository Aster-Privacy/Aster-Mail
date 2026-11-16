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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";

const gate = vi.hoisted(() => {
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    opened,
    release: () => release(),
    order: [] as string[],
    groups: true,
  };
});

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(async () => {
    gate.order.push("aliases:start");
    await gate.opened;
    gate.order.push("aliases:end");

    return { aliases: [] };
  }),
  decrypt_aliases: vi.fn(async () => []),
  get_alias_counts: vi.fn(async () => ({ data: { can_create: true } })),
  get_alias_unread_counts: vi.fn(async () => ({ data: { counts: [] } })),
  reencrypt_alias_local_part: vi.fn(),
  compute_routing_hash: vi.fn(),
  backfill_missing_routing_hashes: vi.fn(),
  heal_legacy_routing_hashes: vi.fn(async () => false),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => {
    gate.order.push("domains");

    return { data: { domains: [] } };
  }),
  list_domain_addresses: vi.fn(),
  decrypt_domain_addresses: vi.fn(),
  compute_address_routing_hash: vi.fn(),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: vi.fn(async () => ({ data: null })),
  decrypt_ghost_aliases: vi.fn(),
}));

vi.mock("@/services/api/family_org", () => ({
  list_my_groups: vi.fn(async () => {
    gate.order.push("groups");

    if (!gate.groups) return { data: [] };

    return {
      data: [
        {
          id: "g1",
          name: "Team",
          email_local_part: "team",
          domain_name: "astermail.org",
        },
      ],
    };
  }),
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

const latest: { loading: boolean; addresses: string[] } = {
  loading: true,
  addresses: [],
};

function Harness() {
  const { aliases, is_loading } = use_sidebar_aliases();

  latest.loading = is_loading;
  latest.addresses = aliases.map((a) => a.full_address);

  return null;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let roots: Root[] = [];

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots = [];
});

function mount(): void {
  const root = createRoot(document.createElement("div"));

  roots.push(root);
  root.render(<Harness />);
}

describe("use_sidebar_aliases load order", () => {
  it("requests domain and group addresses while the alias list is in flight", async () => {
    await act(async () => mount());
    await settle();

    expect(gate.order).toContain("domains");
    expect(gate.order).toContain("groups");
    expect(gate.order).not.toContain("aliases:end");

    gate.release();
    await settle();

    expect(latest.loading).toBe(false);
    expect(latest.addresses).toEqual(["team@astermail.org"]);
  });

  it("does not show the loading state again for an account with no addresses", async () => {
    gate.groups = false;
    window.dispatchEvent(new Event(MAIL_EVENTS.ALIASES_CHANGED));
    await act(async () => mount());
    await settle();

    expect(latest.addresses).toEqual([]);
    act(() => roots.forEach((root) => root.unmount()));
    roots = [];

    await act(async () => mount());

    expect(latest.loading).toBe(false);
  });
});
