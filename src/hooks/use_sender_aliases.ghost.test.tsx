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
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const GHOST_LOCAL = "sage.ridgeq2m7x";
const GHOST_ADDRESS = `${GHOST_LOCAL}@astermail.org`;

vi.mock("@/services/api/aliases", () => ({
  list_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  decrypt_aliases: vi.fn(async () => []),
  compute_alias_hash: vi.fn(async (local: string, domain: string) => `H:${local}@${domain}`),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ data: { domains: [] } })),
  list_domain_addresses: vi.fn(async () => ({ data: { addresses: [] } })),
  decrypt_domain_addresses: vi.fn(async () => []),
  compute_address_hash: vi.fn(async (local: string, domain: string) => `A:${local}@${domain}`),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "real@astermail.org", display_name: "Real User" },
  })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: vi.fn(() => true),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32)),
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
  list_ghost_aliases: vi.fn(async () => ({
    data: {
      aliases: [
        {
          id: "g1",
          encrypted_local_part: "x",
          local_part_nonce: "n",
          alias_address_hash: `H:${GHOST_LOCAL}@astermail.org`,
          domain: "astermail.org",
          is_enabled: true,
        },
      ],
      total: 1,
    },
  })),
  decrypt_ghost_aliases: vi.fn(async () => [
    {
      id: "g1",
      local_part: GHOST_LOCAL,
      full_address: GHOST_ADDRESS,
      domain: "astermail.org",
      is_enabled: true,
    },
  ]),
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  register_ghost_email: vi.fn(),
}));

import {
  use_sender_aliases,
  get_cached_ghost_for_routing_token,
  clear_sender_aliases_cache,
  type SenderOption,
} from "./use_sender_aliases";

let container: HTMLDivElement;
let root: Root;
let latest_options: SenderOption[] = [];
let latest_loading = true;

function Probe() {
  const { sender_options, loading } = use_sender_aliases();
  latest_options = sender_options;
  latest_loading = loading;
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

beforeEach(() => {
  clear_sender_aliases_cache();
  latest_options = [];
  latest_loading = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("use_sender_aliases ghost inclusion (reply-from-ghost bug)", () => {
  it("includes the enabled ghost alias in sender_options", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await flush();

    expect(latest_loading).toBe(false);

    const ghost = latest_options.find((o) => o.type === "ghost");
    expect(ghost, "ghost alias must appear in the From selector").toBeDefined();
    expect(ghost?.email).toBe(GHOST_ADDRESS);
    expect(ghost?.is_enabled).toBe(true);
    expect(ghost?.address_hash).toBe(`H:${GHOST_LOCAL}@astermail.org`);
  });

  it("auto-selects the ghost via original_to matching the inbound recipient", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await flush();

    const inbound_to = [GHOST_ADDRESS];
    const match = latest_options.find(
      (s) => s.is_enabled && s.email.toLowerCase() === inbound_to[0].toLowerCase(),
    );

    expect(
      match,
      "use_reply_modal's original_to scan must now find the ghost",
    ).toBeDefined();
    expect(match?.type).toBe("ghost");
  });

  it("resolves a ghost-received email's routing_token to the ghost address (BCC / header-independent path)", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await flush();

    const routing_token = `H:${GHOST_LOCAL}@astermail.org`;
    expect(get_cached_ghost_for_routing_token(routing_token)).toBe(GHOST_ADDRESS);
    expect(get_cached_ghost_for_routing_token("H:other@astermail.org")).toBeUndefined();
    expect(get_cached_ghost_for_routing_token(undefined)).toBeUndefined();
  });
});
