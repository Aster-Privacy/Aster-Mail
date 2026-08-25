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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const stable_t = vi.hoisted(() => (k: string) => k);

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: stable_t }),
}));

const plan_limits_mock = vi.hoisted(() => ({ instant_alias_delete: 0 }));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: {
      plan_code:
        plan_limits_mock.instant_alias_delete === 0 ? "free" : "supernova",
      limits: {
        has_instant_alias_delete: {
          limit: plan_limits_mock.instant_alias_delete,
          used: 0,
          remaining: 0,
        },
      },
    },
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/hooks/mail_events", async (import_original) => {
  const actual = await import_original<typeof import("@/hooks/mail_events")>();

  return { ...actual, emit_aliases_changed: vi.fn() };
});

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  get_derived_encryption_key: () => "key",
}));

const now_iso = new Date().toISOString();

const decryptable_new = {
  id: "a-new",
  local_part: "fresh",
  alias_address_hash: "h1",
  domain: "astermail.org",
  full_address: "fresh@astermail.org",
  is_enabled: true,
  is_random: false,
  created_at: now_iso,
  updated_at: now_iso,
};

const undecryptable_new = {
  id: "a-broken",
  local_part: "",
  alias_address_hash: "h2",
  domain: "astermail.org",
  full_address: "@astermail.org",
  is_enabled: true,
  is_random: false,
  decryption_failed: true,
  created_at: now_iso,
  updated_at: now_iso,
};

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(async () => ({
    aliases: [decryptable_new, undecryptable_new],
    max_aliases: 3,
    error: null,
  })),
  decrypt_aliases: vi.fn(async () => [decryptable_new, undecryptable_new]),
  update_alias: vi.fn(),
  delete_alias: vi.fn(),
  get_alias_counts: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ domains: [] })),
  delete_domain: vi.fn(),
  get_dns_records: vi.fn(),
  list_domain_addresses: vi.fn(async () => ({ addresses: [] })),
  delete_domain_address: vi.fn(),
  decrypt_domain_addresses: vi.fn(async () => []),
}));

import { use_aliases, clear_aliases_cache } from "./use_aliases";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof use_aliases>;

describe("handle_alias_delete 30-day gate", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: Hook;

  const Harness = () => {
    latest = use_aliases();

    return null;
  };

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(async () => {
    plan_limits_mock.instant_alias_delete = 0;
    clear_aliases_cache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("blocks a brand-new free alias that decrypts fine", async () => {
    expect(latest.aliases.some((a) => a.id === "a-new")).toBe(true);

    await act(async () => {
      latest.handle_alias_delete("a-new");
    });

    expect(latest.alias_too_new_info.is_open).toBe(true);
    expect(latest.alias_delete_confirm.is_open).toBe(false);
  });

  it("lets a supernova user delete a brand-new alias immediately", async () => {
    plan_limits_mock.instant_alias_delete = 1;
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    await flush();

    await act(async () => {
      latest.handle_alias_delete("a-new");
    });

    expect(latest.alias_delete_confirm.is_open).toBe(true);
    expect(latest.alias_delete_confirm.id).toBe("a-new");
    expect(latest.alias_too_new_info.is_open).toBe(false);
  });

  it("lets a decrypt-failed alias skip the gate and go to delete confirm", async () => {
    expect(latest.aliases.some((a) => a.id === "a-broken")).toBe(true);

    await act(async () => {
      latest.handle_alias_delete("a-broken");
    });

    expect(latest.alias_delete_confirm.is_open).toBe(true);
    expect(latest.alias_delete_confirm.id).toBe("a-broken");
    expect(latest.alias_too_new_info.is_open).toBe(false);
  });
});
